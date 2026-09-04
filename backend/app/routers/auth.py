import secrets
import hashlib
import hmac
import json
import re
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, UserRole, FarmerProfile, DealerProfile, DealerStatus, Notification, NotificationType, AuditLog, PendingFarmerRegistration
from ..schemas import UserLogin, UserRegister, TokenResponse, EmailVerificationRequest, OTPVerifyRequest, OTPResendRequest
from ..auth import get_password_hash, verify_password, create_access_token, require_user
from ..email_service import send_otp_email
from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def hash_otp(otp: str) -> str:
    """Cryptographically hash a 6-digit OTP using HMAC-SHA256 with server SECRET_KEY."""
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), otp.strip().encode("utf-8"), hashlib.sha256).hexdigest()

def verify_otp_hash(entered_otp: str, stored_hash: str) -> bool:
    """Constant-time verification of entered OTP against stored cryptographic hash."""
    computed = hash_otp(entered_otp)
    return hmac.compare_digest(computed, stored_hash)

def build_user_dict(user: User) -> dict:
    user_dict = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "is_email_verified": user.is_email_verified,
        "language_preference": user.language_preference
    }
    if user.role == UserRole.FARMER and user.farmer_profile:
        fp = user.farmer_profile
        user_dict["village"] = fp.village
        user_dict["district"] = fp.district
        user_dict["farmer_profile"] = {
            "aadhaar_last4": fp.aadhaar_last4,
            "village": fp.village,
            "district": fp.district,
            "land_size_acres": fp.land_size_acres,
            "bank_account_no": fp.bank_account_no,
            "bank_name": fp.bank_name,
            "ifsc_code": fp.ifsc_code
        }
    elif user.role == UserRole.DEALER and user.dealer_profile:
        dp = user.dealer_profile
        user_dict["dealer_status"] = dp.status
        user_dict["business_name"] = dp.business_name
        user_dict["assigned_centre_id"] = dp.assigned_centre_id
        user_dict["dealer_profile"] = {
            "business_name": dp.business_name,
            "license_number": dp.license_number,
            "government_id_type": dp.government_id_type,
            "government_id_number": dp.government_id_number,
            "status": dp.status,
            "assigned_centre_id": dp.assigned_centre_id,
            "rejection_reason": dp.rejection_reason
        }
    return user_dict

@router.post("/login", response_model=TokenResponse)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email.lower()).first()
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    access_token = create_access_token(data={"sub": user.email, "role": user.role, "user_id": user.id})
    user_dict = build_user_dict(user)

    return TokenResponse(access_token=access_token, user=user_dict)

@router.post("/register")
def register(register_data: UserRegister, db: Session = Depends(get_db)):
    email = register_data.email.strip().lower()
    
    # Validate registration fields
    if not register_data.name or len(register_data.name.strip()) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full Name must be at least 2 characters.")
    
    phone_digits = re.sub(r"\D", "", register_data.phone.strip())
    if len(phone_digits) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number must contain at least 10 digits.")
    
    if not register_data.password or len(register_data.password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters in length.")

    # Check if user already exists
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in."
        )

    # FARMER REGISTRATION: DO NOT create account immediately. Mandatory Email OTP flow.
    if register_data.role == UserRole.FARMER:
        # Generate cryptographically secure 6-digit numeric OTP (100000 - 999999)
        otp = f"{secrets.randbelow(900000) + 100000:06d}"
        otp_hash_val = hash_otp(otp)
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        password_hash_val = get_password_hash(register_data.password)

        extra_info = {
            "aadhaar_last4": (register_data.aadhaar_last4 or "").strip()[-4:] if register_data.aadhaar_last4 else "1234",
            "village": register_data.village or "Sample Village",
            "district": register_data.district or "Sample District",
            "bank_account_no": register_data.bank_account_no or "99988877711",
            "ifsc_code": register_data.ifsc_code or "SBIN0001111",
            "land_size_acres": float(register_data.land_size_acres) if register_data.land_size_acres is not None else 2.5
        }

        pending = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == email).first()
        if pending:
            pending.name = register_data.name.strip()
            pending.phone = phone_digits
            pending.password_hash = password_hash_val
            pending.language_preference = register_data.language_preference or "en"
            pending.extra_data = json.dumps(extra_info)
            pending.otp_hash = otp_hash_val
            pending.otp_expires_at = expires_at
            pending.attempts_left = 5
            pending.last_sent_at = datetime.utcnow()
        else:
            pending = PendingFarmerRegistration(
                email=email,
                name=register_data.name.strip(),
                phone=phone_digits,
                password_hash=password_hash_val,
                language_preference=register_data.language_preference or "en",
                extra_data=json.dumps(extra_info),
                otp_hash=otp_hash_val,
                otp_expires_at=expires_at,
                attempts_left=5,
                last_sent_at=datetime.utcnow()
            )
            db.add(pending)

        db.commit()

        # Send OTP email safely
        email_res = send_otp_email(to_email=email, recipient_name=register_data.name.strip(), otp_code=otp)

        resp = {
            "status": "pending_verification",
            "message": "OTP sent to your email. Please verify to complete registration.",
            "email": email,
            "expires_in_seconds": 300,
            "attempts_left": 5
        }
        if email_res.get("dev_otp"):
            resp["dev_otp"] = email_res["dev_otp"]
            resp["smtp_blocked"] = email_res.get("mode") == "development"
        return resp


    elif register_data.role == UserRole.DEALER:
        verification_token = secrets.token_urlsafe(16)
        new_user = User(
            name=register_data.name.strip(),
            email=email,
            phone=phone_digits,
            role=UserRole.DEALER,
            password_hash=get_password_hash(register_data.password),
            is_email_verified=False,
            verification_token=verification_token,
            verification_expires=datetime.utcnow() + timedelta(hours=24),
            language_preference=register_data.language_preference
        )
        db.add(new_user)
        db.flush()

        dp = DealerProfile(
            user_id=new_user.id,
            business_name=register_data.business_name or f"{register_data.name} Enterprise",
            mobile_number=phone_digits,
            email=email,
            address=register_data.address or "Procurement Market Road",
            government_id_type=register_data.government_id_type or "GSTIN",
            government_id_number=register_data.government_id_number or "36AAACG1234H1Z1",
            license_number=register_data.license_number or f"LIC-{secrets.token_hex(4).upper()}",
            status=DealerStatus.PENDING,
            assigned_centre_id=register_data.assigned_centre_id or 1
        )
        db.add(dp)

        # Notify Admin about new dealer registration
        admins = db.query(User).filter(User.role == UserRole.ADMIN).all()
        for admin in admins:
            db.add(Notification(
                user_id=admin.id,
                title="New Dealer Registration Pending",
                title_te="కొత్త డీలర్ రిజిస్ట్రేషన్ వేచి ఉంది",
                message=f"Dealer '{register_data.business_name or register_data.name}' submitted registration details. Verification required.",
                message_te=f"డీలర్ '{register_data.business_name or register_data.name}' రిజిస్ట్రేషన్ సమర్పించారు.",
                type=NotificationType.APPROVAL
            ))

        db.commit()

        return {
            "status": "dealer_pending",
            "message": "Dealer registered successfully. Pending administrator verification.",
            "verification_token": verification_token,
            "email": new_user.email
        }

@router.post("/verify-otp")
def verify_otp(req: OTPVerifyRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    entered_otp = req.otp.strip()

    if not entered_otp or len(entered_otp) != 6 or not entered_otp.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP format. Please enter a valid 6-digit numeric code."
        )

    # Check if farmer is already registered
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address is already registered. Please sign in."
        )

    pending = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == email).first()
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending registration found for this email address. Please submit the registration form first."
        )

    # Check expiration (5 minutes validity)
    if datetime.utcnow() > pending.otp_expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please click 'Resend OTP' to receive a new code."
        )

    # Check attempts
    if pending.attempts_left <= 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum verification attempts exceeded. Please click 'Resend OTP' for a new code."
        )

    # Verify OTP using constant-time hash comparison
    if not verify_otp_hash(entered_otp, pending.otp_hash):
        pending.attempts_left = max(0, pending.attempts_left - 1)
        db.commit()
        if pending.attempts_left > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Incorrect OTP code. {pending.attempts_left} attempt{'s' if pending.attempts_left != 1 else ''} remaining."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Incorrect OTP code. Maximum attempts exceeded. Please click 'Resend OTP' for a new code."
            )

    # ONLY AFTER SUCCESSFUL OTP VERIFICATION: Create the Farmer account
    extra_data = {}
    if pending.extra_data:
        try:
            extra_data = json.loads(pending.extra_data)
        except Exception:
            extra_data = {}

    new_user = User(
        name=pending.name,
        email=pending.email,
        phone=pending.phone,
        role=UserRole.FARMER,
        password_hash=pending.password_hash,
        is_email_verified=True,
        verification_token=None,
        language_preference=pending.language_preference or "en"
    )
    db.add(new_user)
    db.flush()

    fp = FarmerProfile(
        user_id=new_user.id,
        aadhaar_last4=extra_data.get("aadhaar_last4", "1234"),
        village=extra_data.get("village", "Sample Village"),
        district=extra_data.get("district", "Sample District"),
        bank_account_no=extra_data.get("bank_account_no", "99988877711"),
        ifsc_code=extra_data.get("ifsc_code", "SBIN0001111"),
        land_size_acres=float(extra_data.get("land_size_acres", 2.5))
    )
    db.add(fp)

    # Welcome Notification
    notif = Notification(
        user_id=new_user.id,
        title="Email Verified & Registration Complete ✓",
        title_te="ఈమెయిల్ ధృవీకరించబడింది & నమోదు పూర్తయింది ✓",
        message="Welcome to Smart Farmer Procurement! Your email has been verified and your account is active.",
        message_te="స్మార్ట్ రైతు సేకరణ వ్యవస్థకు స్వాగతం! మీ ఈమెయిల్ ధృవీకరించబడింది మరియు ఖాతా ప్రారంభమైంది.",
        type=NotificationType.SYSTEM
    )
    db.add(notif)

    # Audit Log
    audit = AuditLog(
        actor_id=new_user.id,
        actor_role=UserRole.FARMER,
        action="FARMER_REGISTERED_WITH_OTP",
        details=f"Farmer {new_user.email} registered successfully after valid email OTP verification."
    )
    db.add(audit)

    # Clean up pending record so OTP can never be reused
    db.delete(pending)
    db.commit()

    # Create access token for verified login
    access_token = create_access_token(data={"sub": new_user.email, "role": new_user.role, "user_id": new_user.id})
    user_dict = build_user_dict(new_user)

    return {
        "status": "success",
        "message": "Farmer registration completed and email verified successfully! Welcome to Smart Farmer Procurement.",
        "is_verified": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_dict
    }

@router.post("/resend-otp")
def resend_otp(req: OTPResendRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()

    # Check if already registered
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email is already registered and active. Please sign in."
        )

    pending = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == email).first()
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending registration found for this email address. Please register first."
        )

    # Rate limiting: 30 seconds cooldown between resends
    if pending.last_sent_at:
        seconds_elapsed = (datetime.utcnow() - pending.last_sent_at).total_seconds()
        if seconds_elapsed < 30:
            remaining_cooldown = int(30 - seconds_elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining_cooldown} seconds before requesting a new OTP."
            )

    # Invalidate previous OTP and generate new 6-digit OTP (Requirement 11)
    new_otp = f"{secrets.randbelow(900000) + 100000:06d}"
    pending.otp_hash = hash_otp(new_otp)
    pending.otp_expires_at = datetime.utcnow() + timedelta(minutes=5)
    pending.attempts_left = 5
    pending.last_sent_at = datetime.utcnow()
    db.commit()

    # Send email
    email_res = send_otp_email(to_email=pending.email, recipient_name=pending.name, otp_code=new_otp)

    resp = {
        "status": "sent",
        "message": "A new verification OTP has been sent to your email address.",
        "email": pending.email,
        "expires_in_seconds": 300,
        "attempts_left": 5
    }
    if email_res.get("dev_otp"):
        resp["dev_otp"] = email_res["dev_otp"]
        resp["smtp_blocked"] = email_res.get("mode") == "development"
    return resp


@router.post("/verify-email")
def verify_email(req: EmailVerificationRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_email_verified:
        return {"message": "Email is already verified ✓", "is_verified": True}

    user.is_email_verified = True
    user.verification_token = None
    db.commit()

    db.add(Notification(
        user_id=user.id,
        title="Email Verified ✓",
        title_te="ఈమెయిల్ ధృవీకరించబడింది ✓",
        message="Your email address has been successfully verified.",
        message_te="మీ ఈమెయిల్ విజయవంతంగా ధృవీకరించబడింది.",
        type=NotificationType.SYSTEM
    ))
    db.commit()

    return {"message": "Email verified successfully ✓", "is_verified": True}

@router.get("/me")
def get_current_user_profile(current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    return build_user_dict(current_user)
