import secrets
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    User, ProcurementCentre, Slot, Booking, BookingStatus, QueueEntry, QueueStatus,
    ProcurementTransaction, Payment, Notification, NotificationType
)
from ..schemas import SlotBookingCreate
from ..auth import require_farmer, require_user

router = APIRouter(prefix="/api/farmer", tags=["Farmer Module"])

@router.get("/centres")
def get_procurement_centres(db: Session = Depends(get_db)):
    centres = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).all()
    res = []
    for c in centres:
        res.append({
            "id": c.id,
            "name": c.name,
            "code": c.code,
            "location": c.location,
            "district": c.district,
            "pincode": c.pincode,
            "contact_phone": c.contact_phone,
            "operating_hours": c.operating_hours,
            "daily_capacity": c.daily_capacity
        })
    return res

@router.get("/slots")
def get_available_slots(centre_id: int, date: Optional[str] = None, db: Session = Depends(get_db)):
    if date:
        count = db.query(Slot).filter(Slot.centre_id == centre_id, Slot.date == date).count()
        if count == 0:
            standard_times = [
                ("08:00 AM", "10:00 AM"),
                ("10:00 AM", "12:00 PM"),
                ("01:00 PM", "03:00 PM"),
                ("03:00 PM", "05:00 PM")
            ]
            for st, et in standard_times:
                db.add(Slot(
                    centre_id=centre_id,
                    date=date,
                    start_time=st,
                    end_time=et,
                    capacity=20,
                    booked_count=0,
                    is_active=True
                ))
            db.commit()

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
            "slot_date": b.slot.date if b.slot else "",
            "slot_time": f"{b.slot.start_time} - {b.slot.end_time}" if b.slot else "",
            "qr_data": b.qr_data,
            "created_at": b.created_at.strftime("%Y-%m-%d %H:%M")
        })
    return res

@router.get("/queue-status")
def get_live_queue(booking_code: Optional[str] = None, current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    from .dealer import ensure_default_queue_entries

    booking = None
    if booking_code:
        booking = db.query(Booking).filter(Booking.booking_code == booking_code).first()
    else:
        booking = db.query(Booking).filter(
            Booking.farmer_id == current_user.id
        ).order_by(Booking.created_at.desc()).first()

    if not booking:
        return {
            "has_active_booking": False,
            "message": "No active slot booking found."
        }

    centre_id = booking.centre_id
    ensure_default_queue_entries(centre_id, db)
    
    # 1. Find the currently serving token at this centre (IN_SERVICE)
    current_token_entry = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre_id,
        QueueEntry.status == QueueStatus.IN_SERVICE
    ).first()

    if not current_token_entry:
        current_token_entry = db.query(QueueEntry).filter(
            QueueEntry.centre_id == centre_id,
            QueueEntry.status == QueueStatus.WAITING
        ).order_by(QueueEntry.id.asc()).first()

    # 2. Get this farmer's queue entry
    my_queue_entry = db.query(QueueEntry).filter(QueueEntry.booking_id == booking.id).first()

    # 3. Check if this farmer is currently serving or completed
    is_now_serving = False
    is_completed = False
    farmers_ahead = 0
    estimated_wait = 0

    if booking.status == BookingStatus.PROCUREMENT_COMPLETED or (my_queue_entry and my_queue_entry.status == QueueStatus.COMPLETED):
        is_completed = True
        farmers_ahead = 0
        estimated_wait = 0
    elif (my_queue_entry and my_queue_entry.status == QueueStatus.IN_SERVICE) or booking.status == BookingStatus.PROCUREMENT_STARTED:
        is_now_serving = True
        farmers_ahead = 0
        estimated_wait = 0
    else:
        # WAITING state: calculate how many waiting entries are ahead of this farmer
        waiting_entries = db.query(QueueEntry).filter(
            QueueEntry.centre_id == centre_id,
            QueueEntry.status == QueueStatus.WAITING
        ).order_by(QueueEntry.id.asc()).all()

        if my_queue_entry:
            for idx, entry in enumerate(waiting_entries):
                if entry.id == my_queue_entry.id:
                    farmers_ahead = idx
                    break
        else:
            farmers_ahead = len(waiting_entries)

        estimated_wait = max(10, farmers_ahead * 10)

    current_serving_token_str = current_token_entry.token_number if current_token_entry else "PDC-1001"

    # Get full centre queue list for transparent synchronized view
    all_centre_entries = db.query(QueueEntry).filter(QueueEntry.centre_id == centre_id).order_by(QueueEntry.id.asc()).all()
    centre_queue_list = []
    for qe in all_centre_entries:
        bk = qe.booking
        status_str = "WAITING"
        if qe.status == QueueStatus.IN_SERVICE or (bk and bk.status == BookingStatus.PROCUREMENT_STARTED):
            status_str = "PROCESSING"
        elif qe.status == QueueStatus.COMPLETED or (bk and bk.status == BookingStatus.PROCUREMENT_COMPLETED):
            status_str = "COMPLETED"

        centre_queue_list.append({
            "token": qe.token_number,
            "farmer": bk.farmer.name if bk and bk.farmer else "Farmer",
            "crop": bk.crop_type if bk else "Paddy",
            "qty": bk.expected_quantity_quintals if bk else 40.0,
            "status": status_str,
            "is_me": (bk and bk.farmer_id == current_user.id) or (qe.token_number == booking.token_number)
        })

    centre_waiting_count = sum(1 for f in centre_queue_list if f["status"] == "WAITING")
    centre_estimated_wait = centre_waiting_count * 10

    return {
        "has_active_booking": True,
        "booking_code": booking.booking_code,
        "token_number": booking.token_number,
        "centre_name": booking.centre.name if booking.centre else "Warangal Central Grain Mandi",
        "current_token": current_serving_token_str,
        "is_now_serving": is_now_serving,
        "is_completed": is_completed,
        "farmers_ahead": farmers_ahead,
        "estimated_wait_minutes": estimated_wait,
        "centre_waiting_count": centre_waiting_count,
        "centre_estimated_wait_minutes": centre_estimated_wait,
        "centre_queue": centre_queue_list,
        "booking_status": booking.status,
        "crop_type": booking.crop_type,
        "expected_quantity": booking.expected_quantity_quintals
    }

@router.get("/receipts")
def get_farmer_receipts(current_user: User = Depends(require_farmer), db: Session = Depends(get_db)):
    from datetime import timedelta
    txns = db.query(ProcurementTransaction).filter(ProcurementTransaction.farmer_id == current_user.id).order_by(ProcurementTransaction.transaction_time.desc()).all()
    res = []
    for t in txns:
        payment = t.payment
        t_ist = (t.transaction_time + timedelta(hours=5, minutes=30)) if t.transaction_time else datetime.now()
        res.append({
            "id": t.id,
            "transaction_id": f"TXN-{t.id:06d}",
            "weighment_slip_no": t.weighment_slip_no,
            "booking_code": t.booking.booking_code if t.booking else "",
            "token_number": t.booking.token_number if t.booking else "",
            "centre_name": t.booking.centre.name if (t.booking and t.booking.centre) else "Warangal Central Grain Mandi",
            "farmer_name": current_user.name,
            "crop_type": t.booking.crop_type if t.booking else "Paddy",
            "declared_quantity": t.booking.expected_quantity_quintals if t.booking else 0,
            "expected_quantity": t.booking.expected_quantity_quintals if t.booking else 0,
            "actual_quantity": t.actual_quantity_quintals,
            "quality_grade": t.quality_grade,
            "rate_per_quintal": t.rate_per_quintal,
            "total_amount": t.total_amount,
            "transaction_time": t_ist.strftime("%d %b %Y, %I:%M %p"),
            "date_time": t_ist.strftime("%d %b %Y, %I:%M %p"),
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
