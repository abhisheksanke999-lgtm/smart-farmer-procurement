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
