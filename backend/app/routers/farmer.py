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
