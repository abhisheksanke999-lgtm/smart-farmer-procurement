import secrets
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    User, UserRole, DealerProfile, DealerStatus, ProcurementCentre, Slot, Booking, BookingStatus,
    QueueEntry, QueueStatus, ProcurementTransaction, Payment, Notification, NotificationType,
    FarmerDealerAssignment, AssignmentStatus
)
from ..schemas import SlotBookingCreate, FarmerDealerAssignmentCreate
from ..auth import require_farmer, require_user

router = APIRouter(prefix="/api/farmer", tags=["Farmer Module"])

@router.get("/centres")
def get_procurement_centres(crop: Optional[str] = None, product: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns active procurement centres.
    If 'crop' or 'product' is provided, filters only centres supporting that crop.
    """
    centres = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).all()
    selected_prod = (crop or product or "").strip().lower()
    res = []
    for c in centres:
        supported = [cp.strip() for cp in (c.supported_crops or "").split(",") if cp.strip()]
        if selected_prod:
            normalized_supported = [cp.lower() for cp in supported]
            is_match = any(
                selected_prod in cp or cp in selected_prod or
                ("rice" in selected_prod and "paddy" in cp) or
                ("paddy" in selected_prod and "rice" in cp)
                for cp in normalized_supported
            )
            if not is_match:
                continue

        res.append({
            "id": c.id,
            "name": c.name,
            "code": c.code,
            "location": c.location,
            "district": c.district,
            "pincode": c.pincode,
            "contact_phone": c.contact_phone,
            "operating_hours": c.operating_hours,
            "daily_capacity": c.daily_capacity,
            "supported_crops": supported
        })
    return res

@router.get("/dealers")
def get_dealers_for_centre(centre_id: int, crop: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns ONLY active and approved dealers assigned to the specified procurement centre.
    Enforced strictly at database query level.
    """
    centre = db.query(ProcurementCentre).filter(
        ProcurementCentre.id == centre_id,
        ProcurementCentre.is_active == True
    ).first()
    if not centre:
        raise HTTPException(status_code=404, detail="Procurement centre not found or inactive.")

    dealers = (
        db.query(DealerProfile)
        .join(User, DealerProfile.user_id == User.id)
        .filter(
            DealerProfile.assigned_centre_id == centre_id,
            DealerProfile.status == DealerStatus.APPROVED
        )
        .all()
    )

    res = []
    for d in dealers:
        res.append({
            "dealer_id": d.user_id,
            "profile_id": d.id,
            "name": d.user.name,
            "business_name": d.business_name,
            "mobile_number": d.mobile_number,
            "email": d.email,
            "centre_id": d.assigned_centre_id,
            "centre_name": centre.name,
            "license_number": d.license_number,
            "status": d.status
        })
    return res

@router.post("/create-assignment")
def create_farmer_dealer_assignment(
    req: FarmerDealerAssignmentCreate,
    current_user: User = Depends(require_farmer),
    db: Session = Depends(get_db)
):
    """
    Strict validation and creation of Farmer -> Product -> Procurement Center -> Dealer assignment.
    """
    if not current_user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required. Please verify your email to create a dealer assignment."
        )

    # 1. Verify Procurement Center exists and is active
    centre = db.query(ProcurementCentre).filter(
        ProcurementCentre.id == req.centre_id,
        ProcurementCentre.is_active == True
    ).first()
    if not centre:
        raise HTTPException(status_code=404, detail="Selected procurement centre not found or inactive.")

    # 2. Verify Product is supported by selected centre
    clean_crop = req.product_name.strip()
    supported = [cp.strip().lower() for cp in (centre.supported_crops or "").split(",") if cp.strip()]
    crop_lower = clean_crop.lower()
    is_supported = any(
        crop_lower in cp or cp in crop_lower or
        ("rice" in crop_lower and "paddy" in cp) or
        ("paddy" in crop_lower and "rice" in cp)
        for cp in supported
    )
    if not is_supported and supported:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product '{clean_crop}' is not supported by {centre.name}. Supported products: {centre.supported_crops}"
        )

    # 3. Verify Dealer exists, is approved, and belongs to the selected centre
    dealer_user = db.query(User).filter(User.id == req.dealer_id, User.role == UserRole.DEALER).first()
    if not dealer_user or not dealer_user.dealer_profile:
        raise HTTPException(status_code=404, detail="Selected dealer not found.")

    dp = dealer_user.dealer_profile
    if dp.status != DealerStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dealer '{dealer_user.name}' is not currently approved (status: {dp.status}). Only approved dealers can be selected."
        )

    if dp.assigned_centre_id != centre.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dealer '{dealer_user.name}' belongs to another procurement centre, not {centre.name}."
        )

    # 4. Check for conflicting ACTIVE assignment
    existing_active = db.query(FarmerDealerAssignment).filter(
        FarmerDealerAssignment.farmer_id == current_user.id,
        FarmerDealerAssignment.status == AssignmentStatus.ACTIVE
    ).first()
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an active dealer assignment. Please complete or cancel your existing assignment before creating a new one."
        )

    # 5. Verify Slot capacity
    slot = db.query(Slot).filter(Slot.id == req.slot_id, Slot.centre_id == centre.id, Slot.is_active == True).first()
    if not slot or not slot.is_active:
        raise HTTPException(status_code=404, detail="Selected procurement slot is not active or invalid.")

    if slot.booked_count >= slot.capacity:
        raise HTTPException(status_code=400, detail="Selected slot is fully booked. Please choose another time slot.")

    # Generate codes
    assignment_code = f"ASGN-{secrets.token_hex(4).upper()}"
    qr_token = f"QR-SEC-{secrets.token_urlsafe(16)}"
    booking_code = f"BOOK-{secrets.token_hex(4).upper()}"
    
    count_today = db.query(Booking).filter(Booking.centre_id == centre.id).count()
    token_number = f"PDC-{1000 + count_today + 1}"

    # Increment slot count
    slot.booked_count += 1

    # Create Booking with assigned dealer
    new_booking = Booking(
        booking_code=booking_code,
        token_number=token_number,
        farmer_id=current_user.id,
        dealer_id=dealer_user.id,
        centre_id=centre.id,
        slot_id=slot.id,
        crop_type=clean_crop,
        expected_quantity_quintals=req.expected_quantity_quintals,
        status=BookingStatus.BOOKED,
        qr_data=qr_token
    )
    db.add(new_booking)
    db.flush()

    # Create FarmerDealerAssignment
    assignment = FarmerDealerAssignment(
        assignment_code=assignment_code,
        farmer_id=current_user.id,
        dealer_id=dealer_user.id,
        centre_id=centre.id,
        crop_type=clean_crop,
        booking_id=new_booking.id,
        qr_token=qr_token,
        status=AssignmentStatus.ACTIVE
    )
    db.add(assignment)
    db.flush()

    # Create QueueEntry
    queue_pos = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre.id,
        QueueEntry.status == QueueStatus.WAITING
    ).count() + 1

    queue_entry = QueueEntry(
        centre_id=centre.id,
        booking_id=new_booking.id,
        token_number=token_number,
        position=queue_pos,
        status=QueueStatus.WAITING,
        estimated_wait_minutes=max(10, queue_pos * 12)
    )
    db.add(queue_entry)

    # Notifications
    db.add(Notification(
        user_id=current_user.id,
        title=f"Dealer Assigned: {dp.business_name} ✓",
        title_te=f"డీలర్ నియమించబడ్డారు: {dp.business_name} ✓",
        message=f"You have selected dealer {dealer_user.name} ({dp.business_name}) at {centre.name} for {clean_crop}. Your QR pass is authorized exclusively for this dealer.",
        message_te=f"{centre.name} వద్ద {clean_crop} కోసం డీలర్ {dealer_user.name} ఎంపికయ్యారు.",
        type=NotificationType.BOOKING
    ))

    db.add(Notification(
        user_id=dealer_user.id,
        title=f"New Farmer Assignment: {current_user.name}",
        title_te=f"కొత్త రైతు కేటాయింపు: {current_user.name}",
        message=f"Farmer {current_user.name} assigned you as their procurement dealer for {clean_crop} ({req.expected_quantity_quintals} Q) at {centre.name}. Token: {token_number}.",
        message_te=f"రైతు {current_user.name} మీ డీలర్‌షిప్‌ను ఎంచుకున్నారు.",
        type=NotificationType.BOOKING
    ))

    db.commit()

    return {
        "status": "success",
        "message": f"Dealer {dealer_user.name} successfully assigned at {centre.name}!",
        "assignment_id": assignment.id,
        "assignment_code": assignment_code,
        "qr_token": qr_token,
        "booking_code": booking_code,
        "token_number": token_number,
        "product_name": clean_crop,
        "centre_name": centre.name,
        "dealer_name": dealer_user.name,
        "dealer_business": dp.business_name,
        "slot_date": slot.date,
        "slot_time": f"{slot.start_time} - {slot.end_time}",
        "expected_quantity_quintals": req.expected_quantity_quintals
    }

@router.get("/active-assignment")
def get_farmer_active_assignment(current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    """Returns the farmer's current active dealer assignment."""
    assignment = (
        db.query(FarmerDealerAssignment)
        .filter(
            FarmerDealerAssignment.farmer_id == current_user.id,
            FarmerDealerAssignment.status == AssignmentStatus.ACTIVE
        )
        .order_by(FarmerDealerAssignment.created_at.desc())
        .first()
    )
    if not assignment:
        return {"has_active_assignment": False}

    booking = assignment.booking
    dealer_user = assignment.dealer
    dp = dealer_user.dealer_profile if dealer_user else None

    return {
        "has_active_assignment": True,
        "assignment_id": assignment.id,
        "assignment_code": assignment.assignment_code,
        "product_name": assignment.crop_type,
        "centre_id": assignment.centre_id,
        "centre_name": assignment.centre.name if assignment.centre else "",
        "centre_location": assignment.centre.location if assignment.centre else "",
        "dealer_id": assignment.dealer_id,
        "dealer_name": dealer_user.name if dealer_user else "Dealer",
        "dealer_business": dp.business_name if dp else "",
        "dealer_phone": dealer_user.phone if dealer_user else "",
        "status": assignment.status,
        "qr_token": assignment.qr_token,
        "booking_code": booking.booking_code if booking else "",
        "token_number": booking.token_number if booking else "",
        "expected_quantity_quintals": booking.expected_quantity_quintals if booking else 0,
        "slot_date": booking.slot.date if booking and booking.slot else "",
        "slot_time": f"{booking.slot.start_time} - {booking.slot.end_time}" if booking and booking.slot else "",
        "created_at": assignment.created_at.strftime("%Y-%m-%d %H:%M")
    }

@router.post("/cancel-assignment/{assignment_id}")
def cancel_farmer_assignment(assignment_id: int, current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    """Safely cancels active farmer-dealer assignment and associated slot booking."""
    assignment = db.query(FarmerDealerAssignment).filter(
        FarmerDealerAssignment.id == assignment_id,
        FarmerDealerAssignment.farmer_id == current_user.id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    if assignment.status != AssignmentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail=f"Cannot cancel assignment with status '{assignment.status}'.")

    assignment.status = AssignmentStatus.CANCELLED
    assignment.updated_at = datetime.utcnow()

    if assignment.booking:
        assignment.booking.status = BookingStatus.CANCELLED
        assignment.booking.updated_at = datetime.utcnow()
        if assignment.booking.slot:
            assignment.booking.slot.booked_count = max(0, assignment.booking.slot.booked_count - 1)
        if assignment.booking.queue_entry:
            assignment.booking.queue_entry.status = QueueStatus.SKIPPED

    db.commit()
    return {"message": "Assignment and associated procurement pass cancelled successfully."}

@router.get("/slots")
def get_available_slots(centre_id: int, date: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Slot).filter(Slot.centre_id == centre_id, Slot.is_active == True)
    if date:
        query = query.filter(Slot.date == date)
    
    slots = query.all()
    res = []
    for s in slots:
        available = max(0, s.capacity - s.booked_count)
        res.append({
            "id": s.id,
            "centre_id": s.centre_id,
            "date": s.date,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "capacity": s.capacity,
            "booked_count": s.booked_count,
            "available_capacity": available,
            "is_full": available == 0
        })
    return res

@router.post("/book-slot")
def book_slot(booking_in: SlotBookingCreate, current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    if not current_user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required. Please verify your email address to book procurement slots."
        )

    # Check slot capacity
    slot = db.query(Slot).filter(Slot.id == booking_in.slot_id, Slot.centre_id == booking_in.centre_id).first()
    if not slot or not slot.is_active:
        raise HTTPException(status_code=404, detail="Selected procurement slot is not active or invalid.")

    if slot.booked_count >= slot.capacity:
        raise HTTPException(status_code=400, detail="This slot is fully booked. Please select another slot.")

    # Check if farmer already has active booking for same date
    existing = db.query(Booking).filter(
        Booking.farmer_id == current_user.id,
        Booking.slot_id == slot.id,
        Booking.status.in_([BookingStatus.BOOKED, BookingStatus.ARRIVED, BookingStatus.VERIFIED, BookingStatus.PROCUREMENT_STARTED])
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="You already have an active booking for this slot.")

    # Increment booked count safely
    slot.booked_count += 1

    # Generate unique codes
    random_hex = secrets.token_hex(4).upper()
    booking_code = f"BOOK-{random_hex}"
    
    # Calculate daily token sequence
    count_today = db.query(Booking).filter(Booking.centre_id == booking_in.centre_id).count()
    token_number = f"PDC-{1000 + count_today + 1}"

    new_booking = Booking(
        booking_code=booking_code,
        token_number=token_number,
        farmer_id=current_user.id,
        dealer_id=booking_in.dealer_id,
        centre_id=booking_in.centre_id,
        slot_id=booking_in.slot_id,
        crop_type=booking_in.crop_type,
        expected_quantity_quintals=booking_in.expected_quantity_quintals,
        status=BookingStatus.BOOKED,
        qr_data=booking_code
    )
    db.add(new_booking)
    db.flush()

    # Calculate queue position
    queue_pos = db.query(QueueEntry).filter(
        QueueEntry.centre_id == booking_in.centre_id,
        QueueEntry.status == QueueStatus.WAITING
    ).count() + 1

    queue_entry = QueueEntry(
        centre_id=booking_in.centre_id,
        booking_id=new_booking.id,
        token_number=token_number,
        position=queue_pos,
        status=QueueStatus.WAITING,
        estimated_wait_minutes=max(10, queue_pos * 12)
    )
    db.add(queue_entry)

    # Add notification for farmer
    centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == booking_in.centre_id).first()
    db.add(Notification(
        user_id=current_user.id,
        title=f"Slot Booked Successfully! Token: {token_number}",
        title_te=f"స్లాట్ బుకింగ్ విజయవంతమైంది! టోకెన్: {token_number}",
        message=f"Procurement slot booked at {centre.name} for {slot.date} ({slot.start_time}). Show QR code at centre.",
        message_te=f"{centre.name} వద్ద {slot.date} ({slot.start_time}) కొనుగోలు స్లాట్ బుక్ చేయబడింది. క్యూఆర్ కోడ్ చూపండి.",
        type=NotificationType.BOOKING
    ))

    db.commit()

    return {
        "message": "Slot booked successfully!",
        "booking_code": booking_code,
        "token_number": token_number,
        "date": slot.date,
        "time": f"{slot.start_time} - {slot.end_time}",
        "centre_name": centre.name,
        "queue_position": queue_pos,
        "estimated_wait_minutes": queue_entry.estimated_wait_minutes
    }

@router.get("/bookings")
def get_farmer_bookings(current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    bookings = db.query(Booking).filter(Booking.farmer_id == current_user.id).order_by(Booking.created_at.desc()).all()
    res = []
    for b in bookings:
        res.append({
            "id": b.id,
            "booking_code": b.booking_code,
            "token_number": b.token_number,
            "crop_type": b.crop_type,
            "expected_quantity_quintals": b.expected_quantity_quintals,
            "status": b.status,
            "centre_name": b.centre.name if b.centre else "",
            "centre_location": b.centre.location if b.centre else "",
            "dealer_id": b.dealer_id,
            "dealer_name": b.assigned_dealer.name if b.assigned_dealer else "",
            "dealer_business": b.assigned_dealer.dealer_profile.business_name if b.assigned_dealer and b.assigned_dealer.dealer_profile else "",
            "assignment_code": b.assignment.assignment_code if b.assignment else "",
            "slot_date": b.slot.date if b.slot else "",
            "slot_time": f"{b.slot.start_time} - {b.slot.end_time}" if b.slot else "",
            "qr_data": b.qr_data,
            "created_at": b.created_at.strftime("%Y-%m-%d %H:%M")
        })
    return res

@router.get("/queue-status")
def get_live_queue(booking_code: Optional[str] = None, current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    booking = None
    if booking_code:
        booking = db.query(Booking).filter(Booking.booking_code == booking_code).first()
    else:
        booking = db.query(Booking).filter(
            Booking.farmer_id == current_user.id,
            Booking.status.in_([BookingStatus.BOOKED, BookingStatus.ARRIVED, BookingStatus.VERIFIED, BookingStatus.PROCUREMENT_STARTED])
        ).order_by(Booking.created_at.desc()).first()

    if not booking:
        return {
            "has_active_booking": False,
            "message": "No active slot booking found."
        }

    centre_id = booking.centre_id
    current_token_entry = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre_id,
        QueueEntry.status.in_([QueueStatus.IN_SERVICE, QueueStatus.WAITING])
    ).order_by(QueueEntry.id.asc()).first()

    waiting_entries = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre_id,
        QueueEntry.status == QueueStatus.WAITING
    ).order_by(QueueEntry.id.asc()).all()

    my_queue_entry = db.query(QueueEntry).filter(QueueEntry.booking_id == booking.id).first()

    farmers_ahead = 0
    if my_queue_entry and my_queue_entry.status == QueueStatus.WAITING:
        for idx, entry in enumerate(waiting_entries):
            if entry.id == my_queue_entry.id:
                farmers_ahead = idx
                break

    return {
        "has_active_booking": True,
        "booking_code": booking.booking_code,
        "token_number": booking.token_number,
        "centre_name": booking.centre.name,
        "current_token": current_token_entry.token_number if current_token_entry else "PDC-1000",
        "farmers_ahead": farmers_ahead,
        "estimated_wait_minutes": max(5, farmers_ahead * 10),
        "booking_status": booking.status,
        "crop_type": booking.crop_type,
        "expected_quantity": booking.expected_quantity_quintals
    }

@router.get("/receipts")
def get_farmer_receipts(current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    txns = db.query(ProcurementTransaction).filter(ProcurementTransaction.farmer_id == current_user.id).order_by(ProcurementTransaction.created_at.desc()).all()
    res = []
    for t in txns:
        payment = t.payment
        res.append({
            "transaction_id": t.id,
            "weighment_slip_no": t.weighment_slip_no,
            "booking_code": t.booking.booking_code,
            "token_number": t.booking.token_number,
            "centre_name": t.booking.centre.name,
            "farmer_name": current_user.name,
            "crop_type": t.booking.crop_type,
            "declared_quantity": t.booking.expected_quantity_quintals,
            "actual_quantity": t.actual_quantity_quintals,
            "quality_grade": t.quality_grade,
            "rate_per_quintal": t.rate_per_quintal,
            "total_amount": t.total_amount,
            "transaction_time": t.transaction_time.strftime("%Y-%m-%d %H:%M"),
            "payment_status": payment.status if payment else "PAYMENT_PENDING",
            "bank_utr": payment.bank_utr if payment else None
        })
    return res

@router.get("/payments")
def get_farmer_payments(current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    payments = db.query(Payment).filter(Payment.farmer_id == current_user.id).order_by(Payment.created_at.desc()).all()
    res = []
    for p in payments:
        txn = p.transaction
        res.append({
            "payment_id": p.id,
            "amount": p.amount,
            "status": p.status,
            "payment_method": p.payment_method,
            "bank_utr": p.bank_utr,
            "created_at": p.created_at.strftime("%Y-%m-%d %H:%M"),
            "crop_type": txn.booking.crop_type if txn else "Produce",
            "quantity_quintals": txn.actual_quantity_quintals if txn else 0
        })
    return res
