import secrets
from typing import List, Optional
from datetime import datetime, timedelta
import zoneinfo
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..models import (
    User, UserRole, FarmerProfile, DealerProfile, DealerStatus, ProcurementCentre, Slot, Booking, BookingStatus,
    QueueEntry, QueueStatus, ProcurementTransaction, Payment, PaymentStatus, Notification, NotificationType,
    FarmerDealerAssignment, AssignmentStatus, Category
)
from ..schemas import SlotBookingCreate, FarmerDealerAssignmentCreate, CategoryOut, FarmerProfileOut, FarmerProfileUpdate
from ..auth import require_farmer, require_user
from ..slot_timing import get_now_ist, is_slot_in_past, get_slot_timing_status, sync_and_expire_bookings, IST
from ..queue_service import compute_recent_average_duration, get_live_queue_metrics

router = APIRouter(prefix="/api/farmer", tags=["Farmer Module"])

def is_slot_in_past(slot_date_str: str, end_time_str: str) -> bool:
    """Checks whether a given slot date and end time has already elapsed in Indian Standard Time."""
    try:
        now_ist = datetime.now(IST)
        slot_date = datetime.strptime(slot_date_str.strip(), "%Y-%m-%d").date()
        today_ist = now_ist.date()
        if slot_date < today_ist:
            return True
        if slot_date > today_ist:
            return False
        # If date is today, parse end_time (e.g. "10:00 AM", "05:00 PM")
        clean_time = end_time_str.strip()
        end_time_obj = datetime.strptime(clean_time, "%I:%M %p").time()
        slot_end_dt = datetime.combine(today_ist, end_time_obj, tzinfo=IST)
        return now_ist > slot_end_dt
    except Exception:
        return False

@router.get("/server-time")
def get_server_time():
    """Returns current server time explicitly in Indian Standard Time (Asia/Kolkata)."""
    now_ist = datetime.now(IST)
    return {
        "ist_date": now_ist.strftime("%Y-%m-%d"),
        "ist_time": now_ist.strftime("%I:%M %p"),
        "ist_iso": now_ist.isoformat(),
        "timezone": "Asia/Kolkata"
    }

@router.get("/categories", response_model=List[CategoryOut])
def get_farmer_categories(db: Session = Depends(get_db)):
    """Returns available product categories for farmer booking."""
    return db.query(Category).filter(Category.status == "ACTIVE").order_by(Category.id.asc()).all()

@router.get("/centres")
def get_procurement_centres(crop: Optional[str] = None, product: Optional[str] = None, category_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Returns active procurement centres.
    If 'crop', 'product', or 'category_id' is provided, filters only centres supporting that produce.
    """
    centres = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).all()
    selected_prod = (crop or product or "").strip().lower()

    # If category_id provided, look up category name
    if category_id and not selected_prod:
        cat = db.query(Category).filter(Category.id == category_id).first()
        if cat:
            selected_prod = cat.name.lower()

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
def get_dealers_for_centre(
    centre_id: Optional[int] = None,
    crop: Optional[str] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Returns ONLY active and approved dealers belonging to the specified product category
    and optionally assigned to the specified procurement centre.
    Enforced strictly at database query level.
    """
    query = (
        db.query(DealerProfile)
        .join(User, DealerProfile.user_id == User.id)
        .filter(DealerProfile.status == DealerStatus.APPROVED)
    )

    if centre_id:
        centre = db.query(ProcurementCentre).filter(
            ProcurementCentre.id == centre_id,
            ProcurementCentre.is_active == True
        ).first()
        if not centre:
            raise HTTPException(status_code=404, detail="Procurement centre not found or inactive.")
        query = query.filter(DealerProfile.assigned_centre_id == centre_id)

    # Filter strictly by Category
    if category_id:
        query = query.filter(DealerProfile.category_id == category_id)
    elif crop:
        clean_crop = crop.strip().lower()
        cats = db.query(Category).all()
        matched_cat_id = None
        for c in cats:
            c_name_lower = c.name.lower()
            if c_name_lower in clean_crop or clean_crop in c_name_lower:
                matched_cat_id = c.id
                break
            if ("paddy" in clean_crop or "rice" in clean_crop) and ("paddy" in c_name_lower or "rice" in c_name_lower):
                matched_cat_id = c.id
                break
            if "cotton" in clean_crop and "cotton" in c_name_lower:
                matched_cat_id = c.id
                break
        if matched_cat_id:
            query = query.filter(DealerProfile.category_id == matched_cat_id)
        else:
            return []

    dealers = (
        query
        .options(
            joinedload(DealerProfile.user),
            joinedload(DealerProfile.assigned_centre),
            joinedload(DealerProfile.category)
        )
        .all()
    )
    res = []
    for d in dealers:
        centre = d.assigned_centre
        cat_name = d.category.name if d.category else "Paddy"
        res.append({
            "dealer_id": d.user_id,
            "profile_id": d.id,
            "name": d.user.name,
            "business_name": d.business_name,
            "mobile_number": d.mobile_number,
            "email": d.email,
            "centre_id": d.assigned_centre_id,
            "centre_name": centre.name if centre else "Unassigned",
            "category_id": d.category_id,
            "category_name": cat_name,
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
    Strict validation and creation of Farmer -> Product Category -> Procurement Center -> Dealer assignment.
    Validates IST dates, slot availability, and dealer category authorization.
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

    # 4. STRICT DEALER CATEGORY RESTRICTION
    dealer_cat = dp.category
    dealer_cat_name = dealer_cat.name if dealer_cat else "Paddy"
    dealer_cat_lower = dealer_cat_name.lower()
    
    is_category_match = (
        dealer_cat_lower in crop_lower or
        crop_lower in dealer_cat_lower or
        (("paddy" in crop_lower or "rice" in crop_lower) and ("paddy" in dealer_cat_lower or "rice" in dealer_cat_lower)) or
        ("cotton" in crop_lower and "cotton" in dealer_cat_lower)
    )
    if not is_category_match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This dealer does not accept {clean_crop} bookings. Dealer only handles {dealer_cat_name}."
        )

    # 5. Verify Slot capacity and IST Date Validation
    slot = db.query(Slot).filter(Slot.id == req.slot_id, Slot.centre_id == centre.id, Slot.is_active == True).first()
    if not slot or not slot.is_active:
        raise HTTPException(status_code=404, detail="Selected procurement slot is not active or invalid.")

    # Validate slot date is not in the past in Asia/Kolkata
    today_ist = datetime.now(IST).date()
    try:
        slot_date_obj = datetime.strptime(slot.date.strip(), "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid slot date format.")

    if slot_date_obj < today_ist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Past dates cannot be booked. Selected date ({slot.date}) is in the past."
        )

    if is_slot_in_past(slot.date, slot.end_time):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Selected slot ({slot.date} {slot.start_time}-{slot.end_time}) has already ended."
        )

    if slot.booked_count >= slot.capacity:
        raise HTTPException(status_code=400, detail="This slot is no longer available. Please choose another time slot.")

    # 6. Check for conflicting ACTIVE assignments:
    # Rule A: Farmer CAN book different dates for the same field (e.g. Paddy)
    # Rule B: Farmer CANNOT book the same field with another dealer (must stay with their assigned dealer)
    # Rule C: Farmer CANNOT book the same date twice for the same field
    active_assignments = db.query(FarmerDealerAssignment).filter(
        FarmerDealerAssignment.farmer_id == current_user.id,
        FarmerDealerAssignment.status == AssignmentStatus.ACTIVE
    ).all()

    for asgn in active_assignments:
        existing_crop = (asgn.crop_type or "").strip().lower()
        new_crop = clean_crop.lower()

        is_same_produce_field = (
            (existing_crop == new_crop) or
            ("paddy" in existing_crop and "paddy" in new_crop) or
            ("rice" in existing_crop and "rice" in new_crop) or
            ("paddy" in existing_crop and "rice" in new_crop) or
            ("rice" in existing_crop and "paddy" in new_crop) or
            ("cotton" in existing_crop and "cotton" in new_crop) or
            ("maize" in existing_crop and "maize" in new_crop) or
            ("chilli" in existing_crop and "chilli" in new_crop)
        )

        if is_same_produce_field:
            existing_booking = asgn.booking
            existing_date = (existing_booking.slot.date.strip()) if (existing_booking and existing_booking.slot) else None

            # Dealer lock and conflict check applies on THAT DAY ONLY
            if existing_date and existing_date == slot.date.strip():
                if asgn.dealer_id != req.dealer_id:
                    asgn_dealer = asgn.dealer
                    dealer_name = asgn_dealer.name if asgn_dealer else "your assigned dealer"
                    centre_name = asgn.centre.name if asgn.centre else "the procurement centre"
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"On {slot.date}, you already have a booking for {clean_crop} with dealer {dealer_name} ({centre_name}). You cannot book with another dealer on the same day."
                    )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"You already have an active slot booked for {clean_crop} on {slot.date}. Please choose another date."
                    )

    # Generate codes
    assignment_code = f"ASGN-{secrets.token_hex(4).upper()}"
    qr_token = f"QR-SEC-{secrets.token_urlsafe(16)}"
    booking_code = f"BOOK-{secrets.token_hex(4).upper()}"
    
    count_today = db.query(Booking).filter(Booking.centre_id == centre.id).count()
    token_number = f"PDC-{1000 + count_today + 1}"

    # Increment slot count
    slot.booked_count += 1

    # Create Booking with assigned dealer and category
    new_booking = Booking(
        booking_code=booking_code,
        token_number=token_number,
        farmer_id=current_user.id,
        dealer_id=dealer_user.id,
        centre_id=centre.id,
        slot_id=slot.id,
        category_id=dp.category_id,
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
        category_id=dp.category_id,
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
        title="🔔 New booking received",
        title_te="🔔 కొత్త బుకింగ్ వచ్చింది",
        message=f"Farmer: {current_user.name}\nDate: {slot.date}\nTime: {slot.start_time}–{slot.end_time}\nBooking ID: {booking_code}\nProduct: {clean_crop} ({req.expected_quantity_quintals} Q)\nToken: {token_number}",
        message_te=f"రైతు: {current_user.name}\nతేదీ: {slot.date}\nసమయం: {slot.start_time}–{slot.end_time}\nబుకింగ్ ఐడి: {booking_code}\nపంట: {clean_crop} ({req.expected_quantity_quintals} Q)\nటోకెన్: {token_number}",
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
    """Returns the farmer's active dealer assignments, syncing expired slots first."""
    sync_and_expire_bookings(db, farmer_id=current_user.id)

    assignments = (
        db.query(FarmerDealerAssignment)
        .options(
            joinedload(FarmerDealerAssignment.booking).joinedload(Booking.slot),
            joinedload(FarmerDealerAssignment.centre),
            joinedload(FarmerDealerAssignment.dealer).joinedload(User.dealer_profile)
        )
        .filter(
            FarmerDealerAssignment.farmer_id == current_user.id,
            FarmerDealerAssignment.status == AssignmentStatus.ACTIVE
        )
        .order_by(FarmerDealerAssignment.created_at.desc())
        .all()
    )
    if not assignments:
        return {"has_active_assignment": False, "active_assignments": []}

    assignment_list = []
    for assignment in assignments:
        booking = assignment.booking
        dealer_user = assignment.dealer
        dp = dealer_user.dealer_profile if dealer_user else None
        assignment_list.append({
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
        })

    primary = assignment_list[0]
    return {
        "has_active_assignment": True,
        "active_assignments": assignment_list,
        **primary
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
    assignment.updated_at = datetime.now(IST).replace(tzinfo=None)

    if assignment.booking:
        assignment.booking.status = BookingStatus.CANCELLED
        assignment.booking.updated_at = datetime.now(IST).replace(tzinfo=None)
        if assignment.booking.slot:
            assignment.booking.slot.booked_count = max(0, assignment.booking.slot.booked_count - 1)
        if assignment.booking.queue_entry:
            assignment.booking.queue_entry.status = QueueStatus.SKIPPED

    db.commit()
    return {"message": "Assignment and associated procurement pass cancelled successfully."}

@router.get("/slots")
def get_available_slots(centre_id: int, date: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns bookable slots for a procurement centre in Indian Standard Time (Asia/Kolkata).
    Past dates are strictly excluded or rejected.
    If a valid future date is queried and slots do not exist yet, standard slots are created.
    """
    today_ist = datetime.now(IST).date()
    today_ist_str = today_ist.strftime("%Y-%m-%d")

    centre = db.query(ProcurementCentre).filter(
        ProcurementCentre.id == centre_id,
        ProcurementCentre.is_active == True
    ).first()
    if not centre:
        raise HTTPException(status_code=404, detail="Procurement centre not found or inactive.")

    if date:
        clean_date = date.strip()
        try:
            req_date = datetime.strptime(clean_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")

        # STRICT BACKEND VALIDATION: Reject any past date in Asia/Kolkata
        if req_date < today_ist:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Past dates cannot be booked. Selected date ({clean_date}) is in the past."
            )

        existing_slots = (
            db.query(Slot)
            .filter(Slot.centre_id == centre_id, Slot.date == clean_date, Slot.is_active == True)
            .order_by(Slot.start_time.asc())
            .all()
        )

        # If valid future date has no slots, dynamically initialize standard daily slots
        if not existing_slots and req_date <= (today_ist + timedelta(days=60)):
            time_slots = [
                ("08:00 AM", "10:00 AM"),
                ("10:00 AM", "12:00 PM"),
                ("01:00 PM", "03:00 PM"),
                ("03:00 PM", "05:00 PM")
            ]
            slot_cap = max(15, centre.daily_capacity // 4)
            for start, end in time_slots:
                s = Slot(
                    centre_id=centre_id,
                    date=clean_date,
                    start_time=start,
                    end_time=end,
                    capacity=slot_cap,
                    booked_count=0,
                    is_active=True
                )
                db.add(s)
            db.commit()
            existing_slots = (
                db.query(Slot)
                .filter(Slot.centre_id == centre_id, Slot.date == clean_date, Slot.is_active == True)
                .order_by(Slot.start_time.asc())
                .all()
            )

        slots = existing_slots
    else:
        # Filter strictly today and future dates in IST
        slots = (
            db.query(Slot)
            .filter(
                Slot.centre_id == centre_id,
                Slot.is_active == True,
                Slot.date >= today_ist_str
            )
            .order_by(Slot.date.asc(), Slot.start_time.asc())
            .all()
        )

    res = []
    for s in slots:
        timing_status = get_slot_timing_status(s.date, s.start_time, s.end_time)
        is_past = (timing_status == "EXPIRED")
        available = max(0, s.capacity - s.booked_count) if not is_past else 0
        is_full = (s.booked_count >= s.capacity) or is_past

        res.append({
            "id": s.id,
            "centre_id": s.centre_id,
            "date": s.date,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "capacity": s.capacity,
            "booked_count": s.booked_count,
            "available_capacity": available,
            "is_full": is_full,
            "is_past": is_past,
            "timing_status": timing_status
        })
    return res

@router.post("/book-slot")
def book_slot(booking_in: SlotBookingCreate, current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    if not current_user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required. Please verify your email address to book procurement slots."
        )

    # Check slot exists and is active
    slot = db.query(Slot).filter(Slot.id == booking_in.slot_id, Slot.centre_id == booking_in.centre_id).first()
    if not slot or not slot.is_active:
        raise HTTPException(status_code=404, detail="Selected procurement slot is not active or invalid.")

    # Strict IST Date and Time Validation
    today_ist = datetime.now(IST).date()
    try:
        slot_date_obj = datetime.strptime(slot.date.strip(), "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid slot date format.")

    if slot_date_obj < today_ist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Past dates cannot be booked. Selected date ({slot.date}) is in the past."
        )

    if is_slot_in_past(slot.date, slot.end_time):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Selected slot ({slot.date} {slot.start_time}-{slot.end_time}) has already ended."
        )

    if slot.booked_count >= slot.capacity:
        raise HTTPException(status_code=400, detail="This slot is no longer available. Please select another slot.")

    # Validate Dealer and Category if dealer_id is provided
    dealer_category_id = None
    clean_crop = booking_in.crop_type.strip()
    clean_crop_lower = clean_crop.lower()

    if booking_in.dealer_id:
        dealer_user = db.query(User).filter(User.id == booking_in.dealer_id, User.role == UserRole.DEALER).first()
        if not dealer_user or not dealer_user.dealer_profile:
            raise HTTPException(status_code=404, detail="Selected dealer not found.")
        dp = dealer_user.dealer_profile
        if dp.status != DealerStatus.APPROVED:
            raise HTTPException(status_code=400, detail=f"Dealer '{dealer_user.name}' is not currently approved.")
        if dp.assigned_centre_id != booking_in.centre_id:
            raise HTTPException(status_code=400, detail=f"Dealer '{dealer_user.name}' belongs to another procurement centre.")

        dealer_cat = dp.category
        dealer_cat_name = dealer_cat.name if dealer_cat else "Paddy"
        dealer_cat_lower = dealer_cat_name.lower()
        dealer_category_id = dp.category_id

        is_category_match = (
            dealer_cat_lower in clean_crop_lower or
            clean_crop_lower in dealer_cat_lower or
            (("paddy" in clean_crop_lower or "rice" in clean_crop_lower) and ("paddy" in dealer_cat_lower or "rice" in dealer_cat_lower)) or
            ("cotton" in clean_crop_lower and "cotton" in dealer_cat_lower)
        )
        if not is_category_match:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This dealer does not accept {clean_crop} bookings. Dealer only handles {dealer_cat_name}."
            )

    # Check if farmer already has active booking for same slot
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
        category_id=dealer_category_id or booking_in.category_id,
        crop_type=clean_crop,
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

    # Add notification for dealer if assigned
    if booking_in.dealer_id:
        dealer_user = db.query(User).filter(User.id == booking_in.dealer_id).first()
        if dealer_user:
            db.add(Notification(
                user_id=dealer_user.id,
                title="🔔 New booking received",
                title_te="🔔 కొత్త బుకింగ్ వచ్చింది",
                message=f"Farmer: {current_user.name}\nDate: {slot.date}\nTime: {slot.start_time}–{slot.end_time}\nBooking ID: {booking_code}\nProduct: {clean_crop} ({booking_in.expected_quantity_quintals} Q)\nToken: {token_number}",
                message_te=f"రైతు: {current_user.name}\nతేదీ: {slot.date}\nసమయం: {slot.start_time}–{slot.end_time}\nబుకింగ్ ఐడి: {booking_code}\nపంట: {clean_crop} ({booking_in.expected_quantity_quintals} Q)\nటోకెన్: {token_number}",
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
    # Automatically sync and expire past slots in database
    sync_and_expire_bookings(db, farmer_id=current_user.id)

    bookings = (
        db.query(Booking)
        .options(
            joinedload(Booking.slot),
            joinedload(Booking.centre),
            joinedload(Booking.assigned_dealer).joinedload(User.dealer_profile),
            joinedload(Booking.assignment)
        )
        .filter(Booking.farmer_id == current_user.id)
        .order_by(Booking.created_at.desc())
        .all()
    )
    res = []
    for b in bookings:
        timing_status = "UPCOMING"
        if b.slot:
            timing_status = get_slot_timing_status(b.slot.date, b.slot.start_time, b.slot.end_time)

        res.append({
            "id": b.id,
            "booking_code": b.booking_code,
            "token_number": b.token_number,
            "crop_type": b.crop_type,
            "expected_quantity_quintals": b.expected_quantity_quintals,
            "status": b.status,
            "timing_status": timing_status,
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
    metrics = get_live_queue_metrics(
        db,
        centre_id=centre_id,
        booking_id=booking.id,
        farmer_id=booking.farmer_id,
        dealer_id=booking.dealer_id
    )

    return {
        "has_active_booking": True,
        "booking_code": booking.booking_code,
        "token_number": booking.token_number,
        "centre_name": booking.centre.name if booking.centre else "Procurement Centre",
        "procurement_station": metrics.get("procurement_station", "Station #1"),
        "current_token": metrics["current_token"],
        "currently_serving_token": metrics.get("currently_serving_token", metrics["current_token"]),
        "farmers_ahead": metrics["farmers_ahead"],
        "your_position": metrics.get("your_position", metrics["farmers_ahead"] + 1),
        "is_your_turn": metrics.get("is_your_turn", False),
        "estimated_wait_minutes": metrics["estimated_wait_minutes"],
        "recent_average_minutes": metrics["recent_average_minutes"],
        "queue_status": metrics["queue_status"],
        "booking_status": booking.status,
        "crop_type": booking.crop_type,
        "expected_quantity": booking.expected_quantity_quintals
    }


@router.get("/receipts")
def get_farmer_receipts(current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    txns = (
        db.query(ProcurementTransaction)
        .options(
            joinedload(ProcurementTransaction.payment),
            joinedload(ProcurementTransaction.booking).joinedload(Booking.centre),
            joinedload(ProcurementTransaction.booking).joinedload(Booking.assigned_dealer).joinedload(User.dealer_profile),
            joinedload(ProcurementTransaction.dealer).joinedload(User.dealer_profile)
        )
        .filter(ProcurementTransaction.farmer_id == current_user.id)
        .order_by(ProcurementTransaction.transaction_time.desc())
        .all()
    )
    res = []
    for t in txns:
        payment = t.payment
        booking = t.booking
        dealer = t.dealer or (booking.assigned_dealer if booking else None)
        dealer_business = dealer.dealer_profile.business_name if (dealer and getattr(dealer, 'dealer_profile', None)) else ""

        is_paid = (payment.status in [PaymentStatus.PAYMENT_COMPLETED, "PAID", "COMPLETED"]) if payment else False
        payment_date_str = None
        if payment and (payment.updated_at or payment.created_at):
            pdate = payment.updated_at or payment.created_at
            payment_date_str = pdate.strftime("%d-%b-%Y")

        res.append({
            "transaction_id": f"TXN-{t.transaction_time.year}-{t.id:03d}",
            "raw_transaction_id": t.id,
            "weighment_slip_no": t.weighment_slip_no or f"SLIP-{t.id:04d}",
            "booking_id": booking.booking_code if booking else "BOOK-PDC1003",
            "booking_code": booking.booking_code if booking else "BOOK-PDC1003",
            "token_number": booking.token_number if booking else "PDC-1003",
            "centre_name": (booking.centre.name if (booking and booking.centre) else "Warangal Central Grain Mandi"),
            "dealer_name": dealer.name if dealer else "Sri Venkateswara Traders",
            "dealer_business": dealer_business,
            "farmer_name": current_user.name,
            "crop": booking.crop_type if booking else "Maize",
            "crop_type": booking.crop_type if booking else "Maize",
            "declared_quantity": booking.expected_quantity_quintals if booking else t.actual_quantity_quintals,
            "actual_quantity": t.actual_quantity_quintals,
            "actual_quantity_display": f"{t.actual_quantity_quintals:g} Q",
            "quality_grade": t.quality_grade or "Grade A",
            "rate_per_quintal": t.rate_per_quintal,
            "rate_display": f"₹{t.rate_per_quintal:g} / Q",
            "total_amount": t.total_amount,
            "total_amount_formatted": f"₹{t.total_amount:,.2f}",
            "transaction_time": t.transaction_time.strftime("%d-%b-%Y, %I:%M %p"),
            "procurement_status": "COMPLETED",
            "payment_status": payment.status if payment else "PAYMENT_PENDING",
            "is_paid": is_paid,
            "bank_utr": payment.bank_utr if payment else None,
            "dbt_reference": payment.bank_utr or (f"DBT-{payment.id:06d}" if is_paid else None),
            "payment_date": payment_date_str
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

@router.get("/centre-status")
def get_procurement_centre_status(
    centre_id: Optional[int] = None,
    current_user: User = Depends(require_farmer),
    db: Session = Depends(get_db)
):
    """
    Returns the real-time operational condition and live queue status of a procurement centre.
    """
    all_centres_raw = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).all()
    all_centres_list = [
        {
            "id": c.id,
            "name": c.name,
            "code": c.code,
            "location": c.location,
            "district": c.district
        }
        for c in all_centres_raw
    ]

    # Find the target centre
    centre = None
    if centre_id:
        centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == centre_id).first()

    # If not specified, look for farmer's active booking centre
    farmer_active_booking = db.query(Booking).filter(
        Booking.farmer_id == current_user.id,
        Booking.status.in_([BookingStatus.BOOKED, BookingStatus.ARRIVED, BookingStatus.VERIFIED, BookingStatus.PROCUREMENT_STARTED])
    ).order_by(Booking.created_at.desc()).first()

    if not centre and farmer_active_booking:
        centre = farmer_active_booking.centre

    if not centre:
        # Default to Warangal Central Grain Mandi or first centre
        centre = db.query(ProcurementCentre).filter(ProcurementCentre.name.ilike("%Warangal%")).first()
        if not centre and all_centres_raw:
            centre = all_centres_raw[0]

    if not centre:
        raise HTTPException(status_code=404, detail="No active procurement centre found.")

    # Calculate real dynamic queue metrics for this centre
    metrics = get_live_queue_metrics(db, centre_id=centre.id, farmer_id=current_user.id)

    procurement_station = f"{centre.name} - Weighbridge Desk #1"
    time_str = get_now_ist().strftime("%I:%M %p")

    # Today's slots calculation from real database
    today_str = get_now_ist().strftime("%Y-%m-%d")
    slots_today = db.query(Slot).filter(Slot.centre_id == centre.id, Slot.date == today_str).all()
    total_slots = sum(s.capacity for s in slots_today) if slots_today else (centre.daily_capacity or 50)
    booked_slots = sum(s.booked_count for s in slots_today) if slots_today else 0
    available_slots = max(0, total_slots - booked_slots)

    # Query registered dealers for this centre
    dealers_query = (
        db.query(DealerProfile)
        .filter(
            DealerProfile.assigned_centre_id == centre.id,
            DealerProfile.status == DealerStatus.APPROVED
        )
        .all()
    )
    dealers_list = []
    for dp in dealers_query:
        u = dp.user
        dealers_list.append({
            "dealer_id": u.id if u else dp.id,
            "name": u.name if u else dp.business_name,
            "business_name": dp.business_name,
            "phone": dp.mobile_number or (u.phone if u else "N/A"),
            "category": dp.category.name if dp.category else "Paddy / Produce",
            "license_number": dp.license_number or "LIC-TEL-2026",
            "address": dp.address,
            "status": dp.status
        })

    return {
        "centre_id": centre.id,
        "centre_name": centre.name,
        "centre_code": centre.code,
        "centre_location": centre.location,
        "district": centre.district,
        "is_active": centre.is_active,
        "centre_status_label": "Active" if centre.is_active else "Closed",
        "centre_status_icon": "🟢 Active" if centre.is_active else "🔴 Closed",
        "current_token": metrics["current_token"],
        "farmer_token": metrics["farmer_token"] or "Standby",
        "has_active_farmer_token": metrics["has_active_farmer_token"],
        "farmers_ahead": metrics["farmers_ahead"],
        "estimated_wait_minutes": metrics["estimated_wait_minutes"],
        "recent_average_minutes": metrics["recent_average_minutes"],
        "procurement_station": procurement_station,
        "queue_status": metrics["queue_status"],
        "today_available_slots": available_slots,
        "today_total_slots": total_slots,
        "slots_display": f"{available_slots} / {total_slots}",
        "operating_hours": centre.operating_hours or "08:00 AM - 05:00 PM",
        "contact_phone": centre.contact_phone or "1800-425-0033",
        "last_updated": "Just now",
        "last_updated_time": time_str,
        "dealers": dealers_list,
        "all_centres": all_centres_list
    }

# ==========================================
# FARMER PROFILE MANAGEMENT
# ==========================================
@router.get("/profile", response_model=FarmerProfileOut)
def get_farmer_profile(
    current_user: User = Depends(require_farmer),
    db: Session = Depends(get_db)
):
    """
    Returns the authenticated farmer's complete profile information.
    Farmer can view their personal, land, location, and DBT bank account details.
    """
    fp = current_user.farmer_profile
    return FarmerProfileOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        role=current_user.role,
        is_email_verified=current_user.is_email_verified,
        address=fp.address if fp else None,
        village=fp.village if fp else None,
        district=fp.district if fp else None,
        state=fp.state if fp else "Telangana",
        land_size_acres=fp.land_size_acres if fp else 2.5,
        bank_name=fp.bank_name if fp else None,
        bank_account_no=fp.bank_account_no if fp else None,
        ifsc_code=fp.ifsc_code if fp else None,
        aadhaar_last4=fp.aadhaar_last4 if fp else None
    )

@router.put("/profile", response_model=FarmerProfileOut)
def update_farmer_profile(
    req: FarmerProfileUpdate,
    current_user: User = Depends(require_farmer),
    db: Session = Depends(get_db)
):
    """
    Updates the authenticated farmer's profile.
    Strictly isolated: Farmer can edit ONLY their own profile.
    Validates email format, 10-digit mobile number, and protects system-controlled fields (ID, verification status).
    """
    # 1. Update & validate name
    if req.name is not None:
        clean_name = req.name.strip()
        if len(clean_name) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")
        current_user.name = clean_name

    # 2. Update & validate phone
    if req.phone is not None:
        clean_phone = "".join(filter(str.isdigit, req.phone.strip()))
        if len(clean_phone) < 10:
            raise HTTPException(status_code=400, detail="Mobile number must contain at least 10 digits.")
        current_user.phone = clean_phone

    # 3. Update & validate email (check uniqueness if modified)
    if req.email is not None:
        clean_email = req.email.strip().lower()
        if clean_email != current_user.email:
            existing = db.query(User).filter(User.email == clean_email, User.id != current_user.id).first()
            if existing:
                raise HTTPException(status_code=400, detail="This email is already associated with another account.")
            current_user.email = clean_email

    # 4. Update FarmerProfile details
    fp = current_user.farmer_profile
    if not fp:
        fp = FarmerProfile(user_id=current_user.id)
        db.add(fp)

    if req.address is not None:
        fp.address = req.address.strip()
    if req.village is not None:
        fp.village = req.village.strip()
    if req.district is not None:
        fp.district = req.district.strip()
    if req.land_size_acres is not None:
        if req.land_size_acres <= 0:
            raise HTTPException(status_code=400, detail="Land area must be greater than 0 acres.")
        fp.land_size_acres = float(req.land_size_acres)
    if req.bank_name is not None:
        fp.bank_name = req.bank_name.strip()
    if req.bank_account_no is not None:
        fp.bank_account_no = req.bank_account_no.strip()
    if req.ifsc_code is not None:
        fp.ifsc_code = req.ifsc_code.strip().upper()

    current_user.updated_at = datetime.now(IST).replace(tzinfo=None)
    db.commit()
    db.refresh(current_user)
    if current_user.farmer_profile:
        db.refresh(current_user.farmer_profile)

    updated_fp = current_user.farmer_profile
    return FarmerProfileOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        role=current_user.role,
        is_email_verified=current_user.is_email_verified,
        address=updated_fp.address if updated_fp else None,
        village=updated_fp.village if updated_fp else None,
        district=updated_fp.district if updated_fp else None,
        state=updated_fp.state if updated_fp else "Telangana",
        land_size_acres=updated_fp.land_size_acres if updated_fp else 2.5,
        bank_name=updated_fp.bank_name if updated_fp else None,
        bank_account_no=updated_fp.bank_account_no if updated_fp else None,
        ifsc_code=updated_fp.ifsc_code if updated_fp else None,
        aadhaar_last4=updated_fp.aadhaar_last4 if updated_fp else None
    )


