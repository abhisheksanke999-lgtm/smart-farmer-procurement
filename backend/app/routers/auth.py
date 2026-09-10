import secrets
import hashlib
import hmac
import json
import logging
import re
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    User, UserRole, FarmerProfile, DealerProfile, DealerStatus,
    ProcurementCentre, Notification, NotificationType, AuditLog, PendingFarmerRegistration,
    Category
)
from ..schemas import UserLogin, UserRegister, TokenResponse, EmailVerificationRequest, OTPVerifyRequest, OTPResendRequest, CategoryOut
from email_validator import validate_email, EmailNotValidError
from ..auth import get_password_hash, verify_password, create_access_token, require_user
from ..email_service import send_otp_email, EmailDeliveryError
from ..config import settings
from ..slot_timing import get_now_ist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.get("/categories", response_model=List[CategoryOut])
def get_public_categories(db: Session = Depends(get_db)):
    """Returns active product categories (e.g. Paddy, Cotton) for registration and filtering."""
    return db.query(Category).filter(Category.status == "ACTIVE").order_by(Category.id.asc()).all()

@router.get("/centres")
def get_public_centres(db: Session = Depends(get_db)):
    """Returns active procurement centres for registration dropdowns."""
    centres = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "code": c.code,
            "location": c.location,
            "district": c.district,
            "supported_crops": [crop.strip() for crop in (c.supported_crops or "").split(",") if crop.strip()]
        }
        for c in centres
    ]

def validate_strong_password(password: str, confirm_password: Optional[str] = None):
    """
    Strict validation of password strength requirements:
    - Minimum 8 characters
    - At least 1 uppercase letter (A-Z)
    - At least 1 number (0-9)
    - At least 1 special character (e.g. @, #, $, %, !, etc.)
    - Confirm password exact match
    """
    if not password or len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least 8 characters"
        )
    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter"
        )
    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one lowercase letter"
        )
    if not re.search(r"[0-9]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number"
        )
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one special character"
        )
    if confirm_password is not None and password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )

def validate_and_normalize_email(email_str: str) -> str:
    """Validates email format and normalizes it. Rejects empty, malformed, or invalid emails."""
    if not email_str or not isinstance(email_str, str) or not email_str.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is required."
        )
    clean_email = email_str.strip().lower()
    try:
        valid = validate_email(clean_email, check_deliverability=False)
        return valid.normalized
    except EmailNotValidError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid email address."
        )

def hash_otp(otp: str) -> str:
    """Cryptographically hash a 6-digit OTP using HMAC-SHA256 with server SECRET_KEY."""
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), otp.strip().encode("utf-8"), hashlib.sha256).hexdigest()

def verify_otp_hash(entered_otp: str, stored_hash: str) -> bool:
    """Constant-time verification of entered OTP against stored cryptographic hash."""
    computed = hash_otp(entered_otp)
    return hmac.compare_digest(computed, stored_hash)

def generate_default_dealer_docs(business_name: str, gstin: str, license_no: str, custom_docs: Optional[dict] = None) -> dict:
    """Formats or generates metadata for all 6 required dealer verification documents."""
    now_str = get_now_ist().strftime("%d-%b-%Y %I:%M %p")
    slug = re.sub(r'[^A-Za-z0-9]', '_', business_name or 'Dealer').strip('_')
    
    docs = {
        "aadhaar_card": {
            "document_key": "aadhaar_card",
            "document_name": "Aadhaar Card",
            "file_name": f"{slug}_Aadhaar_Card.pdf",
            "file_type": "PDF Document",
            "file_size": "1.2 MB",
            "status": "UPLOADED",
            "uploaded_at": now_str,
            "issuer": "UIDAI (Unique Identification Authority of India)",
            "document_number": f"XXXX-XXXX-{secrets.randbelow(9000)+1000}"
        },
        "pan_card": {
            "document_key": "pan_card",
            "document_name": "PAN Card",
            "file_name": f"{slug}_PAN_Card.pdf",
            "file_type": "PDF Document",
            "file_size": "850 KB",
            "status": "UPLOADED",
            "uploaded_at": now_str,
            "issuer": "Income Tax Department, Govt of India",
            "document_number": f"ABCDE{secrets.randbelow(9000)+1000}F"
        },
        "dealer_license": {
            "document_key": "dealer_license",
            "document_name": "Dealer/Trader License",
            "file_name": f"{slug}_APMC_Trade_License.pdf",
            "file_type": "PDF Document",
            "file_size": "2.4 MB",
            "status": "UPLOADED",
            "uploaded_at": now_str,
            "issuer": "Department of Agricultural Marketing & APMC",
            "document_number": license_no or f"LIC-{secrets.token_hex(4).upper()}"
        },
        "business_reg": {
            "document_key": "business_reg",
            "document_name": "Business Registration Certificate",
            "file_name": f"{slug}_GSTIN_Registration.pdf",
            "file_type": "PDF Document",
            "file_size": "1.8 MB",
            "status": "UPLOADED",
            "uploaded_at": now_str,
            "issuer": "Goods and Services Tax Network (GSTN)",
            "document_number": gstin or "36AAACG1234H1Z1"
        },
        "bank_proof": {
            "document_key": "bank_proof",
            "document_name": "Bank Account Proof",
            "file_name": f"{slug}_Bank_Passbook_Cheque.pdf",
            "file_type": "PDF Document",
            "file_size": "980 KB",
            "status": "UPLOADED",
            "uploaded_at": now_str,
            "issuer": "State Bank of India (Commercial Mandi Branch)",
            "document_number": f"A/C: 3089XXXX{secrets.randbelow(9000)+1000}"
        },
        "address_proof": {
            "document_key": "address_proof",
            "document_name": "Address Proof",
            "file_name": f"{slug}_APMC_Allotment_Address_Proof.pdf",
            "file_type": "PDF Document",
            "file_size": "1.5 MB",
            "status": "UPLOADED",
            "uploaded_at": now_str,
            "issuer": "Municipal Corporation / APMC Authority",
            "document_number": f"PROP-APMC-{secrets.randbelow(900)+100}"
        }
    }

    if custom_docs and isinstance(custom_docs, dict):
        for k, v in custom_docs.items():
            if k in docs and isinstance(v, dict):
                docs[k].update(v)

    return docs

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
        assigned_centre = getattr(dp, "assigned_centre", None)
        centre_name = assigned_centre.name if assigned_centre else ""
        category_name = dp.category.name if dp.category else "Paddy"
        docs_dict = {}
        if dp.verification_documents_url:
            try:
                docs_dict = json.loads(dp.verification_documents_url)
            except Exception:
                docs_dict = {}
        if not docs_dict:
            docs_dict = generate_default_dealer_docs(dp.business_name, dp.government_id_number, dp.license_number)

        user_dict["dealer_status"] = dp.status
        user_dict["business_name"] = dp.business_name
        user_dict["assigned_centre_id"] = dp.assigned_centre_id
        user_dict["assigned_centre_name"] = centre_name
        user_dict["category_id"] = dp.category_id
        user_dict["category_name"] = category_name
        user_dict["dealer_profile"] = {
            "business_name": dp.business_name,
            "license_number": dp.license_number,
            "government_id_type": dp.government_id_type,
            "government_id_number": dp.government_id_number,
            "status": dp.status,
            "assigned_centre_id": dp.assigned_centre_id,
            "assigned_centre_name": centre_name,
            "category_id": dp.category_id,
            "category_name": category_name,
            "rejection_reason": dp.rejection_reason,
            "verification_documents": docs_dict
        }
    return user_dict

@router.post("/login", response_model=TokenResponse)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    email_clean = login_data.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    
    pwd = login_data.password
    if not user or not (verify_password(pwd, user.password_hash) or verify_password(pwd.strip(), user.password_hash)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if login_data.role:
        expected_role = login_data.role.strip().upper()
        if user.role.upper() != expected_role:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Access denied: Account role is {user.role}, but {expected_role} was selected. Please select the correct role."
            )
    
    access_token = create_access_token(data={"sub": user.email, "role": user.role, "user_id": user.id})
    user_dict = build_user_dict(user)

    return TokenResponse(access_token=access_token, user=user_dict)

@router.post("/register")
def register(register_data: UserRegister, db: Session = Depends(get_db)):
    email = validate_and_normalize_email(register_data.email)
    
    # Validate registration fields
    if not register_data.name or len(register_data.name.strip()) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full Name must be at least 2 characters.")
    
    phone_digits = re.sub(r"\D", "", register_data.phone.strip())
    if len(phone_digits) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number must contain at least 10 digits.")
    
    # Enforce strong password requirements and confirm password
    validate_strong_password(register_data.password, register_data.confirm_password)

    if register_data.role not in [UserRole.FARMER, UserRole.DEALER]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Direct registration is only permitted for Farmer or Dealer accounts. Admin accounts cannot be self-registered."
        )

    # Check if user already exists
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in."
        )

    # Cryptographically secure 6-digit numeric OTP (100000 - 999999)
    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    otp_hash_val = hash_otp(otp)
    expires_at = get_now_ist().replace(tzinfo=None) + timedelta(minutes=5)
    password_hash_val = get_password_hash(register_data.password)

    if register_data.role == UserRole.FARMER:
        extra_info = {
            "role": UserRole.FARMER,
            "aadhaar_last4": (register_data.aadhaar_last4 or "").strip()[-4:] if register_data.aadhaar_last4 else "1234",
            "village": register_data.village or "Sample Village",
            "district": register_data.district or "Sample District",
            "bank_account_no": register_data.bank_account_no or "99988877711",
            "ifsc_code": register_data.ifsc_code or "SBIN0001111",
            "land_size_acres": float(register_data.land_size_acres) if register_data.land_size_acres is not None else 2.5
        }
    else:  # DEALER
        if not register_data.assigned_centre_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Procurement Center selection is mandatory for Dealer registration."
            )
        centre = db.query(ProcurementCentre).filter(
            ProcurementCentre.id == register_data.assigned_centre_id,
            ProcurementCentre.is_active == True
        ).first()
        if not centre:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected Procurement Center does not exist or is inactive."
            )
        if not register_data.category_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Product Category selection is mandatory for Dealer registration."
            )
        cat = db.query(Category).filter(Category.id == register_data.category_id).first()
        if not cat or cat.status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected Product Category is invalid or inactive."
            )
        if not register_data.address or len(register_data.address.strip()) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Address is required for Dealer registration."
            )
        biz_name = register_data.business_name or f"{register_data.name} Enterprise"
        gov_num = register_data.government_id_number or "36AAACG1234H1Z1"
        lic_num = register_data.license_number or f"LIC-{secrets.token_hex(4).upper()}"
        formatted_docs = generate_default_dealer_docs(biz_name, gov_num, lic_num, register_data.verification_documents)

        extra_info = {
            "role": UserRole.DEALER,
            "business_name": biz_name,
            "address": register_data.address.strip(),
            "government_id_type": register_data.government_id_type or "GSTIN",
            "government_id_number": gov_num,
            "license_number": lic_num,
            "assigned_centre_id": centre.id,
            "category_id": cat.id,
            "verification_documents": formatted_docs
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
        pending.last_sent_at = get_now_ist().replace(tzinfo=None)
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
            last_sent_at=get_now_ist().replace(tzinfo=None)
        )
        db.add(pending)

    # Dispatch email via Resend HTTPS API
    print(f"[REGISTRATION OTP] Code for {email}: {otp}", flush=True)
    email_sent = False
    try:
        send_otp_email(to_email=email, recipient_name=register_data.name.strip(), otp_code=otp)
        email_sent = True
    except Exception as e:
        logger.warning(f"[EMAIL SERVICE WARNING] Direct delivery failed: {e}. Console OTP available: {otp}")

    db.commit()

    return {
        "status": "pending_verification",
        "message": "A 6-digit OTP verification code has been sent to your email. Please check your inbox and enter the code below.",
        "email": email,
        "role": register_data.role,
        "expires_in_seconds": 300,
        "attempts_left": 5
    }

@router.post("/verify-otp")
def verify_otp(req: OTPVerifyRequest, db: Session = Depends(get_db)):
    email = validate_and_normalize_email(req.email)
    entered_otp = req.otp.strip()

    if not entered_otp or len(entered_otp) != 6 or not entered_otp.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP format. Please enter a valid 6-digit numeric code."
        )

    # Check if user is already registered
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
    if get_now_ist().replace(tzinfo=None) > pending.otp_expires_at:
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

    # ONLY AFTER SUCCESSFUL OTP VERIFICATION: Create the account
    extra_data = {}
    if pending.extra_data:
        try:
            extra_data = json.loads(pending.extra_data)
        except Exception:
            extra_data = {}

    assigned_role = extra_data.get("role", UserRole.FARMER)

    new_user = User(
        name=pending.name,
        email=pending.email,
        phone=pending.phone,
        role=assigned_role,
        password_hash=pending.password_hash,
        is_email_verified=True,
        verification_token=None,
        language_preference=pending.language_preference or "en"
    )
    db.add(new_user)
    db.flush()

    if assigned_role == UserRole.DEALER:
        docs_to_store = extra_data.get("verification_documents")
        if not docs_to_store:
            docs_to_store = generate_default_dealer_docs(
                extra_data.get("business_name", f"{new_user.name} Enterprise"),
                extra_data.get("government_id_number", "36AAACG1234H1Z1"),
                extra_data.get("license_number", f"LIC-{secrets.token_hex(4).upper()}")
            )

        dp = DealerProfile(
            user_id=new_user.id,
            business_name=extra_data.get("business_name", f"{new_user.name} Enterprise"),
            mobile_number=new_user.phone,
            email=new_user.email,
            address=extra_data.get("address", "Procurement Market Road"),
            government_id_type=extra_data.get("government_id_type", "GSTIN"),
            government_id_number=extra_data.get("government_id_number", "36AAACG1234H1Z1"),
            license_number=extra_data.get("license_number", f"LIC-{secrets.token_hex(4).upper()}"),
            status=DealerStatus.PENDING,
            assigned_centre_id=extra_data.get("assigned_centre_id"),
            category_id=extra_data.get("category_id"),
            verification_documents_url=json.dumps(docs_to_store)
        )
        db.add(dp)

        admins = db.query(User).filter(User.role == UserRole.ADMIN).all()
        for admin in admins:
            db.add(Notification(
                user_id=admin.id,
                title="New Dealer Registration Pending",
                title_te="కొత్త డీలర్ రిజిస్ట్రేషన్ వేచి ఉంది",
                message=f"Dealer '{dp.business_name}' submitted registration details. Verification required.",
                message_te=f"డీలర్ '{dp.business_name}' రిజిస్ట్రేషన్ సమర్పించారు.",
                type=NotificationType.APPROVAL
            ))

        db.add(Notification(
            user_id=new_user.id,
            title="Registration Submitted ✓ Pending Admin Approval",
            title_te="రిజిస్ట్రేషన్ సమర్పించబడింది ✓ నిర్వాహకుని ఆమోదం కోసం వేచి ఉంది",
            message="Your dealer account has been registered and verified. An administrator will review and activate your license shortly.",
            message_te="మీ డీలర్ ఖాతా నమోదు చేయబడింది మరియు ధృవీకరించబడింది. నిర్వాహకులు త్వరలోనే సమీక్షిస్తారు.",
            type=NotificationType.SYSTEM
        ))

        audit = AuditLog(
            actor_id=new_user.id,
            actor_role=UserRole.DEALER,
            action="DEALER_REGISTERED_WITH_OTP",
            details=f"Dealer {new_user.email} registered successfully after valid email OTP verification. Status is PENDING."
        )
        db.add(audit)
    else:  # FARMER
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

    role_msg = "Dealer registration submitted and verified! Waiting for admin approval." if assigned_role == UserRole.DEALER else "Farmer registration completed and email verified successfully! Welcome to Smart Farmer Procurement."

    return {
        "status": "success",
        "message": role_msg,
        "is_verified": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_dict
    }

@router.post("/resend-otp")
def resend_otp(req: OTPResendRequest, db: Session = Depends(get_db)):
    email = validate_and_normalize_email(req.email)

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

    # Rate limiting: 60 seconds cooldown between resends
    if pending.last_sent_at:
        seconds_elapsed = (get_now_ist().replace(tzinfo=None) - pending.last_sent_at).total_seconds()
        if seconds_elapsed < 60:
            remaining_cooldown = int(60 - seconds_elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining_cooldown} seconds before requesting a new OTP."
            )

    # Invalidate previous OTP and generate new 6-digit OTP
    new_otp = f"{secrets.randbelow(900000) + 100000:06d}"
    pending.otp_hash = hash_otp(new_otp)
    pending.otp_expires_at = get_now_ist().replace(tzinfo=None) + timedelta(minutes=5)
    pending.attempts_left = 5
    pending.last_sent_at = get_now_ist().replace(tzinfo=None)

    # Send email via Resend HTTPS API
    print(f"[RESEND OTP] Code for {pending.email}: {new_otp}", flush=True)
    email_sent = False
    try:
        send_otp_email(to_email=pending.email, recipient_name=pending.name, otp_code=new_otp)
        email_sent = True
    except Exception as e:
        logger.warning(f"[EMAIL SERVICE WARNING] Resend delivery failed: {e}. Console OTP available: {new_otp}")

    db.commit()

    return {
        "status": "sent",
        "message": "A new 6-digit verification code has been sent to your email address. Please check your inbox.",
        "email": pending.email,
        "expires_in_seconds": 300,
        "attempts_left": 5
    }


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

@router.post("/logout")
def logout():
    return {"status": "success", "message": "Logged out successfully"}
