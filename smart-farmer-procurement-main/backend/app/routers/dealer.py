import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    User, DealerProfile, Booking, BookingStatus, QueueEntry, QueueStatus,
    ProcurementTransaction, Payment, PaymentStatus, Notification, NotificationType, UserRole
)
from ..schemas import QRScanRequest, ProcurementCreate
from ..auth import require_dealer, require_user

router = APIRouter(prefix="/api/dealer", tags=["Dealer Module"])

@router.post("/scan-qr")
def validate_qr_code(req: QRScanRequest, current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    if not dp or dp.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer status is not APPROVED. Procurement scanning prohibited."
        )

    code = req.booking_code.strip()
    booking = db.query(Booking).filter(Booking.booking_code == code).first()
    if not booking:
        # Try lookup by token number PDC-XXXX
        booking = db.query(Booking).filter(Booking.token_number == code).first()

    if not booking:
        return {
            "is_valid": False,
            "message": "INVALID BOOKING: Booking ID or Token Code not found in system."
        }

    if booking.status == BookingStatus.PROCUREMENT_COMPLETED:
        return {
            "is_valid": False,
            "message": "ALREADY USED: Procurement has already been completed for this booking."
        }

    if booking.status == BookingStatus.CANCELLED:
        return {
            "is_valid": False,
            "message": "CANCELLED: This booking has been cancelled."
        }

    # Verify if booking belongs to dealer's assigned centre
    if dp.assigned_centre_id and booking.centre_id != dp.assigned_centre_id:
        return {
            "is_valid": False,
            "message": f"CENTRE MISMATCH: Booking is registered for '{booking.centre.name}', not your assigned centre."
        }

    # Valid Booking!
    farmer = db.query(User).filter(User.id == booking.farmer_id).first()
    fp = farmer.farmer_profile if farmer else None

    # Update status to VERIFIED
    booking.status = BookingStatus.VERIFIED
    db.commit()

    return {
        "is_valid": True,
        "message": "VALID BOOKING ✓",
        "booking_code": booking.booking_code,
        "token_number": booking.token_number,
        "farmer_name": farmer.name if farmer else "Farmer",
        "farmer_phone": farmer.phone if farmer else "",
        "village": fp.village if fp else "",
        "district": fp.district if fp else "",
        "crop_type": booking.crop_type,
        "expected_quantity_quintals": booking.expected_quantity_quintals,
        "centre_name": booking.centre.name,
        "slot_date": booking.slot.date if booking.slot else "",
        "slot_time": f"{booking.slot.start_time} - {booking.slot.end_time}" if booking.slot else "",
        "booking_status": booking.status
    }

@router.post("/process-procurement")
def process_procurement(proc: ProcurementCreate, current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    if not dp or dp.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer authorization pending or revoked."
        )

    booking = db.query(Booking).filter(Booking.booking_code == proc.booking_code).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    if booking.status == BookingStatus.PROCUREMENT_COMPLETED:
        raise HTTPException(status_code=400, detail="Procurement already completed for this booking.")

    # Calculate total amount
    total_amount = round(proc.actual_quantity_quintals * proc.rate_per_quintal, 2)

    # 1. Update Booking status
    booking.status = BookingStatus.PROCUREMENT_COMPLETED
    booking.updated_at = datetime.utcnow()

    # 2. Update Queue status
    queue_entry = db.query(QueueEntry).filter(QueueEntry.booking_id == booking.id).first()
    if queue_entry:
        queue_entry.status = QueueStatus.COMPLETED
        queue_entry.completed_at = datetime.utcnow()
        if queue_entry.called_at:
            diff_sec = (queue_entry.completed_at - queue_entry.called_at).total_seconds()
            queue_entry.actual_duration_minutes = max(1.0, round(diff_sec / 60.0, 1))
        elif not queue_entry.actual_duration_minutes:
            queue_entry.actual_duration_minutes = 10.0

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
    txns = db.query(ProcurementTransaction).filter(ProcurementTransaction.dealer_id == current_user.id).order_by(ProcurementTransaction.transaction_time.desc()).all()
    res = []
    centre_fallback = current_user.dealer_profile.assigned_centre.name if current_user.dealer_profile and current_user.dealer_profile.assigned_centre else "Warangal Central Grain Mandi"
    for t in txns:
        # Format transaction time in Indian Standard Time (IST UTC+5:30)
        from datetime import timedelta
        t_ist = (t.transaction_time + timedelta(hours=5, minutes=30)) if t.transaction_time else (datetime.utcnow() + timedelta(hours=5, minutes=30))
        ist_str = t_ist.strftime("%d %b %Y, %I:%M %p")

        res.append({
            "id": t.id,
            "transaction_id": f"TXN-{t.id:06d}",
            "weighment_slip_no": t.weighment_slip_no,
            "booking_code": t.booking.booking_code if t.booking else "",
            "token_number": t.booking.token_number if t.booking else "PDC-1001",
            "farmer_name": t.booking.farmer.name if t.booking and t.booking.farmer else "Farmer",
            "crop_type": t.booking.crop_type if t.booking else "Paddy",
            "expected_quantity": t.booking.expected_quantity_quintals if t.booking else 40.0,
            "actual_quantity": t.actual_quantity_quintals,
            "centre_name": t.centre.name if getattr(t, 'centre', None) else (t.booking.centre.name if (t.booking and getattr(t.booking, 'centre', None)) else centre_fallback),
            "dealer_name": current_user.dealer_profile.business_name if current_user.dealer_profile and current_user.dealer_profile.business_name else current_user.name,
            "quality_grade": t.quality_grade,
            "rate_per_quintal": t.rate_per_quintal,
            "total_amount": t.total_amount,
            "date_time": ist_str,
            "transaction_time": ist_str,
            "payment_status": t.payment.status if t.payment else "PAYMENT_PENDING"
        })
    return res


def ensure_default_queue_entries(centre_id: int, db: Session):
    """Ensures standard sample queue entries exist in the database for the given centre if empty."""
    from ..models import ProcurementCentre, Slot
    from ..auth import get_password_hash

    today = datetime.now().date().strftime("%Y-%m-%d")
    slot = db.query(Slot).filter(Slot.centre_id == centre_id).first()
    if not slot:
        slot = Slot(
            centre_id=centre_id,
            date=today,
            start_time="08:00 AM",
            end_time="10:00 AM",
            capacity=50,
            booked_count=12,
            is_active=True
        )
        db.add(slot)
        db.flush()

    sample_farmers = [
        ("PDC-1001", "Ramesh Kumar", "Paddy", 40.0, QueueStatus.IN_SERVICE),
        ("PDC-1002", "Venkatesh Rao", "Paddy", 40.0, QueueStatus.WAITING),
        ("PDC-1003", "Gottipalli Vijaya Laxmi", "Maize", 25.0, QueueStatus.WAITING),
        ("PDC-1004", "Kallan Sai Chandana", "Cotton", 30.0, QueueStatus.WAITING),
        ("PDC-1005", "Srinivas Reddy", "Paddy", 50.0, QueueStatus.WAITING),
        ("PDC-1006", "Nagaraju Goud", "Groundnut", 20.0, QueueStatus.WAITING),
        ("PDC-1007", "Anjaneyulu M.", "Paddy", 35.0, QueueStatus.WAITING),
        ("PDC-1008", "Bhanu Prakash", "Maize", 45.0, QueueStatus.WAITING),
        ("PDC-1009", "Kalyan Chakravarthy", "Paddy", 30.0, QueueStatus.WAITING),
        ("PDC-1010", "Prasad V.", "Cotton", 25.0, QueueStatus.WAITING),
        ("PDC-1011", "Devender Rao", "Paddy", 40.0, QueueStatus.WAITING),
        ("PDC-1012", "Chandra Shekar", "Paddy", 35.0, QueueStatus.WAITING),
    ]

    for idx, (token, name, crop, qty, q_status) in enumerate(sample_farmers):
        tok_clean = token.lower().replace("-", "")
        f_email = f"farmer.{tok_clean}@telangana.gov.in"
        f_user = db.query(User).filter(User.email == f_email).first()
        if not f_user:
            f_user = User(
                name=name,
                email=f_email,
                phone=f"9876543{100 + idx}",
                role=UserRole.FARMER,
                password_hash=get_password_hash("Farmer@123"),
                is_email_verified=True
            )
            db.add(f_user)
            db.flush()

        b_status = BookingStatus.PROCUREMENT_STARTED if q_status == QueueStatus.IN_SERVICE else BookingStatus.BOOKED
        bk = db.query(Booking).filter(Booking.centre_id == centre_id, Booking.token_number == token).first()
        if not bk:
            bk = Booking(
                booking_code=f"BOOK-{tok_clean.upper()}",
                token_number=token,
                farmer_id=f_user.id,
                centre_id=centre_id,
                slot_id=slot.id,
                crop_type=crop,
                expected_quantity_quintals=qty,
                status=b_status,
                qr_data=f"BOOK-{tok_clean.upper()}"
            )
            db.add(bk)
            db.flush()

        qe = db.query(QueueEntry).filter(QueueEntry.centre_id == centre_id, QueueEntry.token_number == token).first()
        if not qe:
            qe = QueueEntry(
                centre_id=centre_id,
                booking_id=bk.id,
                token_number=token,
                position=idx + 1,
                status=q_status,
                estimated_wait_minutes=max(10, idx * 10)
            )
            db.add(qe)
            db.flush()

    db.commit()


@router.get("/queue")
def get_dealer_queue(current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    centre_id = dp.assigned_centre_id if dp and dp.assigned_centre_id else 1
    
    ensure_default_queue_entries(centre_id, db)

    from ..models import ProcurementCentre
    centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == centre_id).first()
    station_name = centre.name if centre else "Warangal Central Grain Mandi"

    entries = db.query(QueueEntry).filter(QueueEntry.centre_id == centre_id).order_by(QueueEntry.id.asc()).all()
    
    queue_list = []
    current_serving_token = None

    for q in entries:
        bk = q.booking
        farmer_name = bk.farmer.name if bk and bk.farmer else "Farmer"
        crop_type = bk.crop_type if bk else "Paddy"
        qty = bk.expected_quantity_quintals if bk else 40.0
        booking_code = bk.booking_code if bk else ""
        
        status_str = "WAITING"
        if q.status == QueueStatus.IN_SERVICE or (bk and bk.status == BookingStatus.PROCUREMENT_STARTED):
            status_str = "PROCESSING"
            if not current_serving_token:
                current_serving_token = q.token_number
        elif q.status == QueueStatus.COMPLETED or (bk and bk.status == BookingStatus.PROCUREMENT_COMPLETED):
            status_str = "COMPLETED"

        queue_list.append({
            "id": q.id,
            "token": q.token_number,
            "booking_code": booking_code,
            "farmer": farmer_name,
            "crop": crop_type,
            "qty": qty,
            "status": status_str,
            "position": q.position
        })

    if not current_serving_token and queue_list:
        first_wait = next((f for f in queue_list if f["status"] == "WAITING"), None)
        current_serving_token = first_wait["token"] if first_wait else queue_list[0]["token"]

    waiting_count = sum(1 for f in queue_list if f["status"] == "WAITING")

    return {
        "station_name": station_name,
        "centre_id": centre_id,
        "current_token": current_serving_token,
        "waiting_count": waiting_count,
        "estimated_wait_minutes": waiting_count * 10,
        "queue": queue_list
    }


@router.post("/queue/start")
def start_queue_procurement(data: dict, current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    centre_id = dp.assigned_centre_id if dp and dp.assigned_centre_id else 1
    token = data.get("token_number") or data.get("token")

    if not token:
        raise HTTPException(status_code=400, detail="Token number is required.")

    entry = db.query(QueueEntry).filter(QueueEntry.centre_id == centre_id, QueueEntry.token_number == token).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue token not found.")

    entry.status = QueueStatus.IN_SERVICE
    entry.called_at = datetime.utcnow()

    if entry.booking:
        entry.booking.status = BookingStatus.PROCUREMENT_STARTED
        entry.booking.updated_at = datetime.utcnow()
        db.add(Notification(
            user_id=entry.booking.farmer_id,
            title="🟢 Now Serving: Your Procurement Started!",
            title_te="🟢 ఇప్పుడు మీ వంతు: కొనుగోలు ప్రారంభమైంది!",
            message=f"Your token {token} is currently being processed at the weighbridge.",
            message_te=f"మీ టోకెన్ {token} ప్రస్తుతం కాటా వద్ద ప్రాసెస్ చేయబడుతోంది.",
            type=NotificationType.QUEUE
        ))

    db.commit()
    return get_dealer_queue(current_user, db)


@router.post("/queue/complete")
def complete_queue_procurement(data: dict, current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    centre_id = dp.assigned_centre_id if dp and dp.assigned_centre_id else 1
    token = data.get("token_number") or data.get("token")

    if not token:
        raise HTTPException(status_code=400, detail="Token number is required.")

    entry = db.query(QueueEntry).filter(QueueEntry.centre_id == centre_id, QueueEntry.token_number == token).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue token not found.")

    entry.status = QueueStatus.COMPLETED
    entry.completed_at = datetime.utcnow()

    if entry.booking:
        entry.booking.status = BookingStatus.PROCUREMENT_COMPLETED
        entry.booking.updated_at = datetime.utcnow()

        # Ensure ProcurementTransaction is created to store all required fields
        existing_txn = db.query(ProcurementTransaction).filter(ProcurementTransaction.booking_id == entry.booking.id).first()
        if not existing_txn:
            qty = entry.booking.expected_quantity_quintals or 40.0
            rate = 2300.0
            total_amt = round(qty * rate, 2)
            slip_no = f"SLIP-{entry.token_number.replace('-', '')}-{datetime.utcnow().strftime('%H%M%S')}"
            new_txn = ProcurementTransaction(
                booking_id=entry.booking.id,
                farmer_id=entry.booking.farmer_id,
                dealer_id=current_user.id,
                centre_id=centre_id,
                actual_quantity_quintals=qty,
                quality_grade="Grade A",
                rate_per_quintal=rate,
                total_amount=total_amt,
                weighment_slip_no=slip_no,
                transaction_time=datetime.utcnow()
            )
            db.add(new_txn)
            db.flush()

            pymt = Payment(
                transaction_id=new_txn.id,
                farmer_id=entry.booking.farmer_id,
                amount=total_amt,
                status=PaymentStatus.PAYMENT_PENDING,
                payment_method="Direct Bank Transfer (DBT)"
            )
            db.add(pymt)

        db.add(Notification(
            user_id=entry.booking.farmer_id,
            title="✅ Procurement Completed!",
            title_te="✅ కొనుగోలు పూర్తయింది!",
            message=f"Procurement for token {token} has been successfully completed.",
            message_te=f"టోకెన్ {token} కోసం కొనుగోలు విజయవంతంగా పూర్తయింది.",
            type=NotificationType.PROCUREMENT
        ))

    db.commit()
    return get_dealer_queue(current_user, db)


@router.post("/queue/next")
def next_queue_farmer(current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    centre_id = dp.assigned_centre_id if dp and dp.assigned_centre_id else 1

    next_entry = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre_id,
        QueueEntry.status == QueueStatus.WAITING
    ).order_by(QueueEntry.id.asc()).first()

    if next_entry:
        next_entry.status = QueueStatus.IN_SERVICE
        next_entry.called_at = datetime.utcnow()
        if next_entry.booking:
            next_entry.booking.status = BookingStatus.PROCUREMENT_STARTED
            next_entry.booking.updated_at = datetime.utcnow()
            db.add(Notification(
                user_id=next_entry.booking.farmer_id,
                title="🟢 Now Serving: Your Turn!",
                title_te="🟢 ఇప్పుడు మీ వంతు!",
                message=f"Your token {next_entry.token_number} is now called to the weighbridge.",
                message_te=f"మీ టోకెన్ {next_entry.token_number} ఇప్పుడు కాటా వద్దకు పిలవబడింది.",
                type=NotificationType.QUEUE
            ))

    db.commit()
    return get_dealer_queue(current_user, db)


@router.post("/queue/reset")
def reset_queue_demo(current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    dp = current_user.dealer_profile
    centre_id = dp.assigned_centre_id if dp and dp.assigned_centre_id else 1

    entries = db.query(QueueEntry).filter(QueueEntry.centre_id == centre_id).order_by(QueueEntry.id.asc()).all()
    for idx, e in enumerate(entries):
        if idx == 0:
            e.status = QueueStatus.IN_SERVICE
            e.called_at = datetime.utcnow()
            e.completed_at = None
            if e.booking:
                e.booking.status = BookingStatus.PROCUREMENT_STARTED
        else:
            e.status = QueueStatus.WAITING
            e.called_at = None
            e.completed_at = None
            if e.booking:
                e.booking.status = BookingStatus.BOOKED

    db.commit()
    return get_dealer_queue(current_user, db)
