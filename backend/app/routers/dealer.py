import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..models import (
    User, DealerProfile, DealerStatus, Booking, BookingStatus, QueueEntry, QueueStatus,
    ProcurementTransaction, Payment, PaymentStatus, Notification, NotificationType, UserRole,
    FarmerDealerAssignment, AssignmentStatus, ProcurementCentre, Category, MSPRate
)
from ..schemas import QRScanRequest, ProcurementCreate, DealerProfileOut, DealerProfileUpdate
from ..auth import require_dealer, require_user
from ..slot_timing import get_slot_timing_status, sync_and_expire_bookings, get_now_ist
from ..queue_service import compute_recent_average_duration, get_live_queue_metrics

router = APIRouter(prefix="/api/dealer", tags=["Dealer Module"])


@router.get("/assigned-farmers")
def get_assigned_farmers(current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    """
    Returns all farmers who have a booking or assignment with the currently logged-in dealer.
    Strictly isolated per dealer. Auto-syncs expired bookings and computes IST timing status.
    """
    sync_and_expire_bookings(db, dealer_id=current_user.id)
    
    # 1. Fetch assignments for this dealer with eager loading
    assignments = (
        db.query(FarmerDealerAssignment)
        .options(
            joinedload(FarmerDealerAssignment.farmer).joinedload(User.farmer_profile),
            joinedload(FarmerDealerAssignment.booking).joinedload(Booking.slot),
            joinedload(FarmerDealerAssignment.centre),
            joinedload(FarmerDealerAssignment.category)
        )
        .filter(FarmerDealerAssignment.dealer_id == current_user.id)
        .order_by(FarmerDealerAssignment.created_at.desc())
        .all()
    )

    seen_booking_ids = set()
    res = []

    for a in assignments:
        farmer = a.farmer
        fp = farmer.farmer_profile if farmer else None
        booking = a.booking
        if booking:
            seen_booking_ids.add(booking.id)
        cat_name = a.category.name if a.category else (current_user.dealer_profile.category.name if current_user.dealer_profile and current_user.dealer_profile.category else "Paddy")

        slot_date = booking.slot.date if booking and booking.slot else ""
        slot_time = f"{booking.slot.start_time} - {booking.slot.end_time}" if booking and booking.slot else ""

        # Calculate timing status
        timing_status = a.status
        if a.status == AssignmentStatus.ACTIVE:
            if booking and booking.slot:
                timing_status = get_slot_timing_status(booking.slot.date, booking.slot.start_time, booking.slot.end_time)
            else:
                timing_status = "ACTIVE"
        elif a.status == AssignmentStatus.COMPLETED:
            timing_status = "COMPLETED"
        elif a.status == AssignmentStatus.CANCELLED:
            timing_status = "CANCELLED"

        res.append({
            "assignment_id": a.id,
            "assignment_code": a.assignment_code,
            "booking_id": booking.id if booking else a.booking_id,
            "farmer_id": a.farmer_id,
            "farmer_name": farmer.name if farmer else "Farmer",
            "farmer_phone": farmer.phone if farmer else "",
            "farmer_email": farmer.email if farmer else "",
            "farmer_village": fp.village if fp else "",
            "farmer_district": fp.district if fp else "",
            "farmer_address": fp.address if fp else "",
            "farmer_land_acres": fp.land_size_acres if fp else None,
            "farmer_passbook": getattr(fp, "pattadar_passbook_no", "") if fp else "",
            "village": fp.village if fp else "",
            "district": fp.district if fp else "",
            "product_name": a.crop_type,
            "crop_type": a.crop_type,
            "category_name": cat_name,
            "centre_id": a.centre_id,
            "centre_name": a.centre.name if a.centre else "",
            "token_number": booking.token_number if booking else "",
            "booking_code": booking.booking_code if booking else a.assignment_code,
            "expected_quantity_quintals": booking.expected_quantity_quintals if booking else 0,
            "slot_date": slot_date,
            "slot_time": slot_time,
            "status": a.status,
            "timing_status": timing_status,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M")
        })

    # 2. Also fetch any bookings directly assigned to dealer_id not captured in assignments
    direct_bookings = (
        db.query(Booking)
        .options(
            joinedload(Booking.farmer).joinedload(User.farmer_profile),
            joinedload(Booking.slot),
            joinedload(Booking.centre),
            joinedload(Booking.category)
        )
        .filter(Booking.dealer_id == current_user.id)
        .order_by(Booking.created_at.desc())
        .all()
    )

    for b in direct_bookings:
        if b.id in seen_booking_ids:
            continue
        farmer = b.farmer
        fp = farmer.farmer_profile if farmer else None
        cat_name = b.category.name if b.category else (current_user.dealer_profile.category.name if current_user.dealer_profile and current_user.dealer_profile.category else "Paddy")

        slot_date = b.slot.date if b.slot else ""
        slot_time = f"{b.slot.start_time} - {b.slot.end_time}" if b.slot else ""

        timing_status = b.status
        if b.status == BookingStatus.BOOKED:
            if b.slot:
                timing_status = get_slot_timing_status(b.slot.date, b.slot.start_time, b.slot.end_time)
            else:
                timing_status = "UPCOMING"
        elif b.status == BookingStatus.COMPLETED:
            timing_status = "COMPLETED"
        elif b.status in [BookingStatus.CANCELLED, BookingStatus.EXPIRED]:
            timing_status = b.status

        res.append({
            "assignment_id": None,
            "assignment_code": b.booking_code,
            "booking_id": b.id,
            "farmer_id": b.farmer_id,
            "farmer_name": farmer.name if farmer else "Farmer",
            "farmer_phone": farmer.phone if farmer else "",
            "farmer_email": farmer.email if farmer else "",
            "farmer_village": fp.village if fp else "",
            "farmer_district": fp.district if fp else "",
            "farmer_address": fp.address if fp else "",
            "farmer_land_acres": fp.land_size_acres if fp else None,
            "farmer_passbook": getattr(fp, "pattadar_passbook_no", "") if fp else "",
            "village": fp.village if fp else "",
            "district": fp.district if fp else "",
            "product_name": b.crop_type,
            "crop_type": b.crop_type,
            "category_name": cat_name,
            "centre_id": b.centre_id,
            "centre_name": b.centre.name if b.centre else "",
            "token_number": b.token_number,
            "booking_code": b.booking_code,
            "expected_quantity_quintals": b.expected_quantity_quintals,
            "slot_date": slot_date,
            "slot_time": slot_time,
            "status": b.status,
            "timing_status": timing_status,
            "created_at": b.created_at.strftime("%Y-%m-%d %H:%M")
        })

    # Sort items: ACTIVE first, then UPCOMING, then COMPLETED, then EXPIRED / CANCELLED
    status_priority = {"ACTIVE": 1, "UPCOMING": 2, "BOOKED": 3, "COMPLETED": 4, "EXPIRED": 5, "CANCELLED": 6}
    res.sort(key=lambda x: (status_priority.get(x.get("timing_status", "ACTIVE"), 99), x.get("slot_date", ""), x.get("created_at", "")), reverse=False)

    return res

@router.post("/scan-qr")
def validate_qr_code(req: QRScanRequest, current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    """
    Strict server-side QR verification:
    Only the dealer specifically selected by the farmer can verify the QR code.
    Any attempt by another dealer (even at the same centre) is strictly rejected.
    """
    dp = current_user.dealer_profile
    if not dp or dp.status != DealerStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer status is not APPROVED. Procurement scanning prohibited."
        )

    code = req.booking_code.strip()

    # 1. Resolve assignment or booking
    assignment = (
        db.query(FarmerDealerAssignment)
        .filter(
            (FarmerDealerAssignment.qr_token == code) |
            (FarmerDealerAssignment.assignment_code == code)
        )
        .first()
    )

    booking = None
    if assignment and assignment.booking:
        booking = assignment.booking
    else:
        # Search by booking_code, token_number, or qr_data
        booking = db.query(Booking).filter(
            (Booking.booking_code == code) |
            (Booking.token_number == code) |
            (Booking.qr_data == code)
        ).first()
        if booking and booking.assignment:
            assignment = booking.assignment

    if not booking and not assignment:
        return {
            "is_valid": False,
            "message": "INVALID PASS: Scanned QR code or booking code not found in system."
        }

    # 2. Determine assigned dealer
    assigned_dealer_id = None
    if assignment:
        assigned_dealer_id = assignment.dealer_id
    elif booking and booking.dealer_id:
        assigned_dealer_id = booking.dealer_id

    # 3. ENFORCE EXACT DEALER AUTHORIZATION
    if assigned_dealer_id and assigned_dealer_id != current_user.id:
        other_dealer = db.query(User).filter(User.id == assigned_dealer_id).first()
        other_name = other_dealer.name if other_dealer else "another dealer"
        return {
            "is_valid": False,
            "message": f"You are not authorized to verify this farmer's QR. This farmer is specifically assigned to dealer '{other_name}'."
        }

    # 4. Check status
    if assignment and assignment.status == AssignmentStatus.CANCELLED:
        return {
            "is_valid": False,
            "message": "CANCELLED: This farmer's assignment has been cancelled."
        }

    if booking and booking.status == BookingStatus.CANCELLED:
        return {
            "is_valid": False,
            "message": "CANCELLED: This booking has been cancelled."
        }

    if (assignment and assignment.status == AssignmentStatus.COMPLETED) or (booking and booking.status == BookingStatus.PROCUREMENT_COMPLETED):
        return {
            "is_valid": False,
            "message": "ALREADY USED: Procurement has already been completed for this pass."
        }

    if (booking and booking.status == BookingStatus.EXPIRED) or (booking and booking.slot and get_slot_timing_status(booking.slot.date, booking.slot.start_time, booking.slot.end_time) == "EXPIRED"):
        return {
            "is_valid": False,
            "message": "EXPIRED: This farmer's procurement slot time window has already ended."
        }

    if assignment and assignment.status != AssignmentStatus.ACTIVE:
        return {
            "is_valid": False,
            "message": f"INACTIVE: Assignment is currently '{assignment.status}'."
        }

    # 5. Check centre match
    centre_id = assignment.centre_id if assignment else (booking.centre_id if booking else None)
    if dp.assigned_centre_id and centre_id and centre_id != dp.assigned_centre_id:
        centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == centre_id).first()
        centre_name = centre.name if centre else "another centre"
        return {
            "is_valid": False,
            "message": f"CENTRE MISMATCH: Pass is registered for '{centre_name}', not your assigned centre."
        }

    # 5b. STRICT CATEGORY VERIFICATION: Check produce category matches dealer's category
    crop_name = assignment.crop_type if assignment else (booking.crop_type if booking else "")
    dealer_cat_name = dp.category.name if dp.category else "Paddy"
    crop_lower = crop_name.lower()
    cat_lower = dealer_cat_name.lower()
    is_cat_match = (
        cat_lower in crop_lower or
        crop_lower in cat_lower or
        (("paddy" in crop_lower or "rice" in crop_lower) and ("paddy" in cat_lower or "rice" in cat_lower)) or
        ("cotton" in crop_lower and "cotton" in cat_lower)
    )
    if not is_cat_match:
        return {
            "is_valid": False,
            "message": f"CATEGORY MISMATCH: Pass is for '{crop_name}'. You are authorized only for '{dealer_cat_name}'."
        }

    # 6. Valid Pass! Update booking status to VERIFIED
    farmer_id = assignment.farmer_id if assignment else (booking.farmer_id if booking else None)
    farmer = db.query(User).filter(User.id == farmer_id).first() if farmer_id else None
    fp = farmer.farmer_profile if farmer else None

    if booking:
        booking.status = BookingStatus.VERIFIED
        q_entry = db.query(QueueEntry).filter(QueueEntry.booking_id == booking.id).first()
        if q_entry:
            q_entry.status = QueueStatus.IN_SERVICE
            if not q_entry.called_at:
                q_entry.called_at = get_now_ist().replace(tzinfo=None)
        db.commit()

    return {
        "is_valid": True,
        "message": "VALID PASS AUTHORIZED ✓",
        "booking_code": booking.booking_code if booking else (assignment.assignment_code if assignment else code),
        "token_number": booking.token_number if booking else "PDC-1000",
        "farmer_name": farmer.name if farmer else "Farmer",
        "farmer_phone": farmer.phone if farmer else "",
        "village": fp.village if fp else "",
        "district": fp.district if fp else "",
        "crop_type": assignment.crop_type if assignment else (booking.crop_type if booking else "Produce"),
        "expected_quantity_quintals": booking.expected_quantity_quintals if booking else 40.0,
        "centre_name": assignment.centre.name if (assignment and assignment.centre) else (booking.centre.name if booking else ""),
        "slot_date": booking.slot.date if booking and booking.slot else "",
        "slot_time": f"{booking.slot.start_time} - {booking.slot.end_time}" if booking and booking.slot else "",
        "booking_status": booking.status if booking else "VERIFIED"
    }

@router.post("/process-procurement")
def process_procurement(proc: ProcurementCreate, current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    if not dp or dp.status != DealerStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer authorization pending or revoked."
        )

    booking = db.query(Booking).filter(Booking.booking_code == proc.booking_code).first()
    if not booking:
        # Also check by assignment_code or qr_token
        asgn = db.query(FarmerDealerAssignment).filter(
            (FarmerDealerAssignment.assignment_code == proc.booking_code) |
            (FarmerDealerAssignment.qr_token == proc.booking_code)
        ).first()
        if asgn and asgn.booking:
            booking = asgn.booking

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    # Verify that this dealer is the one authorized
    assigned_dealer_id = booking.dealer_id or (booking.assignment.dealer_id if booking.assignment else None)
    if assigned_dealer_id and assigned_dealer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to process procurement for this farmer."
        )

    # Verify Product Category Match
    crop_name = booking.crop_type or ""
    dealer_cat_name = dp.category.name if dp.category else "Paddy"
    crop_lower = crop_name.lower()
    cat_lower = dealer_cat_name.lower()
    is_cat_match = (
        cat_lower in crop_lower or
        crop_lower in cat_lower or
        (("paddy" in crop_lower or "rice" in crop_lower) and ("paddy" in cat_lower or "rice" in cat_lower)) or
        ("cotton" in crop_lower and "cotton" in cat_lower)
    )
    if not is_cat_match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category mismatch: Cannot process procurement for '{crop_name}'. You are authorized only for '{dealer_cat_name}'."
        )

    if booking.status == BookingStatus.PROCUREMENT_COMPLETED:
        raise HTTPException(status_code=400, detail="Procurement already completed for this booking.")

    # Calculate total amount
    total_amount = round(proc.actual_quantity_quintals * proc.rate_per_quintal, 2)
    now_ist = get_now_ist().replace(tzinfo=None)

    # 1. Update Booking and Assignment status
    booking.status = BookingStatus.PROCUREMENT_COMPLETED
    booking.updated_at = now_ist
    if booking.assignment:
        booking.assignment.status = AssignmentStatus.COMPLETED
        booking.assignment.updated_at = now_ist

    # 2. Update Queue status and record completed_at for rolling duration calculation
    queue_entry = db.query(QueueEntry).filter(QueueEntry.booking_id == booking.id).first()
    if queue_entry:
        queue_entry.status = QueueStatus.COMPLETED
        queue_entry.completed_at = now_ist
        if not queue_entry.called_at:
            queue_entry.called_at = now_ist - timedelta(minutes=13)

    # Automatically advance next waiting farmer in queue to IN_SERVICE (Processing)
    next_waiting_entry = (
        db.query(QueueEntry)
        .join(Booking, QueueEntry.booking_id == Booking.id)
        .filter(
            QueueEntry.centre_id == booking.centre_id,
            QueueEntry.status == QueueStatus.WAITING
        )
        .order_by(QueueEntry.id.asc())
        .first()
    )
    if next_waiting_entry:
        next_waiting_entry.status = QueueStatus.IN_SERVICE
        next_waiting_entry.called_at = now_ist
        if next_waiting_entry.booking and next_waiting_entry.booking.status in [BookingStatus.BOOKED, BookingStatus.ARRIVED]:
            next_waiting_entry.booking.status = BookingStatus.PROCUREMENT_STARTED


    # 3. Create Procurement Transaction Record
    txn = ProcurementTransaction(
        booking_id=booking.id,
        farmer_id=booking.farmer_id,
        dealer_id=current_user.id,
        centre_id=booking.centre_id,
        actual_quantity_quintals=proc.actual_quantity_quintals,
        quality_grade=proc.quality_grade,
        rate_per_quintal=proc.rate_per_quintal,
        total_amount=total_amount,
        weighment_slip_no=proc.weighment_slip_no
    )
    db.add(txn)
    db.flush()

    # 4. Create Initial Payment Pending Record
    pymt = Payment(
        transaction_id=txn.id,
        farmer_id=booking.farmer_id,
        amount=total_amount,
        status=PaymentStatus.PAYMENT_PENDING,
        payment_method="Direct Bank Transfer (DBT)"
    )
    db.add(pymt)

    # 5. Notify Farmer
    db.add(Notification(
        user_id=booking.farmer_id,
        title=f"Procurement Completed! Amount: ₹{total_amount:,.2f}",
        title_te=f"కొనుగోలు పూర్తయింది! మొత్తం: ₹{total_amount:,.2f}",
        message=f"Procurement of {proc.actual_quantity_quintals} Quintals of {booking.crop_type} completed. Payment of ₹{total_amount:,.2f} is pending disbursement.",
        message_te=f"{proc.actual_quantity_quintals} క్వింటాళ్ల {booking.crop_type} కొనుగోలు పూర్తయింది. ₹{total_amount:,.2f} చెల్లింపు వేచి ఉంది.",
        type=NotificationType.PROCUREMENT
    ))

    # 6. Notify Dealer
    db.add(Notification(
        user_id=current_user.id,
        title=f"Procurement Recorded - Slip #{proc.weighment_slip_no}",
        title_te=f"కొనుగోలు నమోదు చేయబడింది - స్లిప్ #{proc.weighment_slip_no}",
        message=f"Successfully recorded procurement of {proc.actual_quantity_quintals} Quintals from farmer {booking.farmer.name}.",
        message_te=f"రైతు {booking.farmer.name} నుండి {proc.actual_quantity_quintals} క్వింటాళ్ల కొనుగోలు విజయవంతంగా నమోదైంది.",
        type=NotificationType.PROCUREMENT
    ))

    db.commit()

    return {
        "message": "Procurement completed successfully!",
        "transaction_id": txn.id,
        "weighment_slip_no": proc.weighment_slip_no,
        "booking_code": booking.booking_code,
        "actual_quantity_quintals": proc.actual_quantity_quintals,
        "rate_per_quintal": proc.rate_per_quintal,
        "total_amount": total_amount,
        "payment_status": PaymentStatus.PAYMENT_PENDING
    }

@router.get("/transactions")
def get_dealer_transactions(current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    txns = (
        db.query(ProcurementTransaction)
        .options(
            joinedload(ProcurementTransaction.booking).joinedload(Booking.farmer),
            joinedload(ProcurementTransaction.payment)
        )
        .filter(ProcurementTransaction.dealer_id == current_user.id)
        .order_by(ProcurementTransaction.transaction_time.desc())
        .all()
    )
    res = []
    for t in txns:
        res.append({
            "id": t.id,
            "weighment_slip_no": t.weighment_slip_no,
            "booking_code": t.booking.booking_code if t.booking else "",
            "farmer_name": t.booking.farmer.name if t.booking and t.booking.farmer else "Farmer",
            "crop_type": t.booking.crop_type if t.booking else "",
            "actual_quantity": t.actual_quantity_quintals,
            "quality_grade": t.quality_grade,
            "rate_per_quintal": t.rate_per_quintal,
            "total_amount": t.total_amount,
            "transaction_time": t.transaction_time.strftime("%Y-%m-%d %H:%M"),
            "payment_status": t.payment.status if t.payment else "PAYMENT_PENDING"
        })
    return res

@router.get("/centres")
def get_dealer_available_centres(db: Session = Depends(get_db)):
    """Returns all active admin-created procurement centres for dealer profile assignment."""
    centres = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).order_by(ProcurementCentre.name.asc()).all()
    return [{
        "id": c.id,
        "name": c.name,
        "code": c.code,
        "district": c.district,
        "location": c.location,
        "daily_capacity": c.daily_capacity
    } for c in centres]

@router.get("/categories")
def get_dealer_available_categories(db: Session = Depends(get_db)):
    """Returns all active admin-approved buying products / crop categories for dealer profile."""
    cats = db.query(Category).filter(Category.status == "ACTIVE").order_by(Category.name.asc()).all()
    return [{
        "id": c.id,
        "name": c.name,
        "description": c.description
    } for c in cats]

@router.get("/profile", response_model=DealerProfileOut)
def get_dealer_profile(current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    """
    Returns the authenticated dealer's complete profile.
    Strictly isolated: Dealer can access only their own profile.
    """
    dp = current_user.dealer_profile
    if not dp:
        # Create initial profile if missing
        dp = DealerProfile(
            user_id=current_user.id,
            business_name=current_user.name + " Procurement Traders",
            mobile_number=current_user.phone,
            email=current_user.email,
            address="Telangana",
            government_id_type="GSTIN",
            government_id_number="36AAAAA0000A1Z5",
            license_number="DL-TEL-" + str(current_user.id).zfill(4),
            status=DealerStatus.APPROVED
        )
        db.add(dp)
        db.commit()
        db.refresh(dp)

    centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == dp.assigned_centre_id).first() if dp.assigned_centre_id else None
    cat = db.query(Category).filter(Category.id == dp.category_id).first() if dp.category_id else None

    return DealerProfileOut(
        id=dp.id,
        user_id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        role=current_user.role,
        business_name=dp.business_name,
        address=dp.address,
        government_id_type=dp.government_id_type,
        government_id_number=dp.government_id_number,
        license_number=dp.license_number,
        status=dp.status,
        assigned_centre_id=dp.assigned_centre_id,
        centre_name=centre.name if centre else None,
        centre_code=centre.code if centre else None,
        centre_district=centre.district if centre else None,
        category_id=dp.category_id,
        category_name=cat.name if cat else None,
        daily_capacity_quintals=dp.daily_capacity_quintals or 500.0,
        daily_requirements=dp.daily_requirements,
        bank_name=dp.bank_name,
        bank_account_no=dp.bank_account_no,
        ifsc_code=dp.ifsc_code,
        is_email_verified=current_user.is_email_verified
    )

@router.put("/profile", response_model=DealerProfileOut)
def update_dealer_profile(
    req: DealerProfileUpdate,
    current_user: User = Depends(require_dealer),
    db: Session = Depends(get_db)
):
    """
    Updates the authenticated dealer's profile.
    Strictly isolated: Dealer can edit only their own profile.
    Validates email format, 10-digit mobile number, admin-created centres, and admin-approved categories.
    Protects system-controlled fields (Government ID, License number, Verification status, Dealer ID).
    """
    # 1. Update & validate name
    if req.name is not None:
        clean_name = req.name.strip()
        if len(clean_name) < 2:
            raise HTTPException(status_code=400, detail="Dealer Name must be at least 2 characters.")
        current_user.name = clean_name

    # 2. Update & validate phone
    if req.phone is not None:
        clean_phone = "".join(filter(str.isdigit, req.phone.strip()))
        if len(clean_phone) < 10:
            raise HTTPException(status_code=400, detail="Mobile number must contain at least 10 digits.")
        current_user.phone = clean_phone

    # 3. Update & validate email (check uniqueness if changed)
    if req.email is not None:
        clean_email = req.email.strip().lower()
        if clean_email != current_user.email:
            existing = db.query(User).filter(User.email == clean_email, User.id != current_user.id).first()
            if existing:
                raise HTTPException(status_code=400, detail="This email is already registered to another account.")
            current_user.email = clean_email

    dp = current_user.dealer_profile
    if not dp:
        dp = DealerProfile(
            user_id=current_user.id,
            business_name=current_user.name + " Procurement",
            mobile_number=current_user.phone,
            email=current_user.email,
            address="Telangana",
            government_id_type="GSTIN",
            government_id_number="36AAAAA0000A1Z5",
            license_number="DL-TEL-" + str(current_user.id).zfill(4),
            status=DealerStatus.APPROVED
        )
        db.add(dp)

    # 4. Update Business Details
    if req.business_name is not None:
        clean_biz = req.business_name.strip()
        if len(clean_biz) < 2:
            raise HTTPException(status_code=400, detail="Business name must be at least 2 characters.")
        dp.business_name = clean_biz

    if req.address is not None:
        dp.address = req.address.strip()
        dp.mobile_number = current_user.phone
        dp.email = current_user.email

    # 5. Validate & Update Procurement Centre (Must be official admin-created centre)
    if req.assigned_centre_id is not None:
        centre = db.query(ProcurementCentre).filter(
            ProcurementCentre.id == req.assigned_centre_id,
            ProcurementCentre.is_active == True
        ).first()
        if not centre:
            raise HTTPException(status_code=400, detail="Selected Procurement Centre is invalid or inactive.")
        dp.assigned_centre_id = centre.id

    # 6. Validate & Update Buying Products / Category (Must be official admin-approved crop)
    if req.category_id is not None:
        cat = db.query(Category).filter(
            Category.id == req.category_id,
            Category.status == "ACTIVE"
        ).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Selected Buying Product / Category is invalid or inactive.")
        dp.category_id = cat.id

    # 7. Update Capacity & Requirements
    if req.daily_capacity_quintals is not None:
        if req.daily_capacity_quintals <= 0:
            raise HTTPException(status_code=400, detail="Procurement capacity must be greater than 0 Quintals.")
        dp.daily_capacity_quintals = float(req.daily_capacity_quintals)

    if req.daily_requirements is not None:
        dp.daily_requirements = req.daily_requirements.strip()

    # 8. Update Bank / Account Details
    if req.bank_name is not None:
        dp.bank_name = req.bank_name.strip()
    if req.bank_account_no is not None:
        dp.bank_account_no = req.bank_account_no.strip()
    if req.ifsc_code is not None:
        dp.ifsc_code = req.ifsc_code.strip().upper()

    dp.updated_at = get_now_ist().replace(tzinfo=None)
    current_user.updated_at = get_now_ist().replace(tzinfo=None)
    db.commit()
    db.refresh(current_user)
    db.refresh(dp)

    centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == dp.assigned_centre_id).first() if dp.assigned_centre_id else None
    cat = db.query(Category).filter(Category.id == dp.category_id).first() if dp.category_id else None

    return DealerProfileOut(
        id=dp.id,
        user_id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        role=current_user.role,
        business_name=dp.business_name,
        address=dp.address,
        government_id_type=dp.government_id_type,
        government_id_number=dp.government_id_number,
        license_number=dp.license_number,
        status=dp.status,
        assigned_centre_id=dp.assigned_centre_id,
        centre_name=centre.name if centre else None,
        centre_code=centre.code if centre else None,
        centre_district=centre.district if centre else None,
        category_id=dp.category_id,
        category_name=cat.name if cat else None,
        daily_capacity_quintals=dp.daily_capacity_quintals or 500.0,
        daily_requirements=dp.daily_requirements,
        bank_name=dp.bank_name,
        bank_account_no=dp.bank_account_no,
        ifsc_code=dp.ifsc_code,
        is_email_verified=current_user.is_email_verified
    )


@router.get("/live-queue")
def get_dealer_live_queue(
    current_user: User = Depends(require_dealer),
    db: Session = Depends(get_db)
):
    """
    Returns real-time queue metrics for the authenticated dealer:
    - Current token in service (e.g. PDC-1002 / PDC-1003)
    - Number of waiting farmers
    - Rolling average procurement speed based on actual completed durations
    - Dynamic estimated wait time for next farmer
    - Dynamic estimated wait time for whole queue
    - List of waiting farmers with their recalculated ETAs and positions
    """
    dp = current_user.dealer_profile
    centre_id = dp.assigned_centre_id if dp else None

    sync_and_expire_bookings(db, dealer_id=current_user.id)

    # 1. Resolve active in-service token
    in_service_q = (
        db.query(QueueEntry)
        .options(joinedload(QueueEntry.booking).joinedload(Booking.farmer))
        .join(Booking, QueueEntry.booking_id == Booking.id)
    )
    if centre_id:
        in_service_q = in_service_q.filter(QueueEntry.centre_id == centre_id)
    in_service_entry = in_service_q.filter(
        QueueEntry.status == QueueStatus.IN_SERVICE
    ).order_by(QueueEntry.called_at.desc()).first()

    # 2. Get waiting queue entries
    waiting_q = (
        db.query(QueueEntry)
        .options(joinedload(QueueEntry.booking).joinedload(Booking.farmer))
        .join(Booking, QueueEntry.booking_id == Booking.id)
    )
    if centre_id:
        waiting_q = waiting_q.filter(QueueEntry.centre_id == centre_id)
    waiting_entries = waiting_q.filter(
        QueueEntry.status == QueueStatus.WAITING
    ).order_by(QueueEntry.id.asc()).all()

    # 3. Resolve Current Token & Details
    current_token = "Standby"
    current_farmer_name = "None"
    current_crop = dp.category.name if dp and dp.category else "Paddy"
    if in_service_entry:
        current_token = in_service_entry.token_number
        if in_service_entry.booking and in_service_entry.booking.farmer:
            current_farmer_name = in_service_entry.booking.farmer.name
            current_crop = in_service_entry.booking.crop_type
    elif waiting_entries:
        current_token = waiting_entries[0].token_number
        if waiting_entries[0].booking and waiting_entries[0].booking.farmer:
            current_farmer_name = waiting_entries[0].booking.farmer.name
            current_crop = waiting_entries[0].booking.crop_type

    # 4. Compute Dynamic Rolling Average
    recent_avg_mins = compute_recent_average_duration(db, centre_id=centre_id, dealer_id=current_user.id)

    # 5. Build dynamic waiting farmers list with dynamic ETAs
    farmers_waiting_list = []
    for idx, entry in enumerate(waiting_entries):
        bk = entry.booking
        farmer_name = bk.farmer.name if (bk and bk.farmer) else "Farmer"
        pos = idx + 1
        eta_mins = int(round(pos * recent_avg_mins))
        farmers_waiting_list.append({
            "token_number": entry.token_number,
            "booking_code": bk.booking_code if bk else "",
            "farmer_name": farmer_name,
            "crop_type": bk.crop_type if bk else "Produce",
            "expected_quantity": bk.expected_quantity_quintals if bk else 0,
            "position": pos,
            "estimated_wait_minutes": eta_mins
        })

    # Total wait for next farmer
    estimated_wait_next = int(round(recent_avg_mins)) if waiting_entries else 0
    total_queue_wait = int(round(len(waiting_entries) * recent_avg_mins))

    # Completed today count
    today_completed_count = db.query(QueueEntry).filter(
        QueueEntry.status == QueueStatus.COMPLETED
    )
    if centre_id:
        today_completed_count = today_completed_count.filter(QueueEntry.centre_id == centre_id)
    today_completed_count = today_completed_count.count()

    centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == centre_id).first() if centre_id else None

    return {
        "centre_id": centre_id,
        "centre_name": centre.name if centre else "Procurement Centre",
        "station_name": "Station #1",
        "current_token": current_token,
        "current_status": "PROCESSING" if in_service_entry else ("WAITING" if waiting_entries else "IDLE"),
        "current_farmer_name": current_farmer_name,
        "current_crop": current_crop,
        "farmers_waiting_count": len(waiting_entries),
        "recent_average_minutes": recent_avg_mins,
        "estimated_wait_next_farmer": estimated_wait_next,
        "total_estimated_queue_minutes": total_queue_wait,
        "completed_today_count": today_completed_count,
        "queue_status": "Normal" if len(waiting_entries) <= 5 else ("Moderate Traffic" if len(waiting_entries) <= 10 else "High Congestion"),
        "waiting_farmers": farmers_waiting_list
    }


@router.get("/centres")
def get_dealer_centres(db: Session = Depends(get_db)):
    """Returns active procurement centres created by the admin for dealer profile selection."""
    centres = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).order_by(ProcurementCentre.name.asc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "code": c.code,
            "district": c.district or c.location,
            "location": c.location,
            "daily_capacity": c.daily_capacity,
            "supported_crops": c.supported_crops
        }
        for c in centres
    ]


@router.get("/categories")
def get_dealer_categories(db: Session = Depends(get_db)):
    """Returns active crop categories / commodities created by the admin for dealer profile selection."""
    cats = db.query(Category).filter(Category.status == "ACTIVE").order_by(Category.id.asc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "status": c.status
        }
        for c in cats
    ]



