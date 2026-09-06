import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    User, DealerProfile, DealerStatus, Booking, BookingStatus, QueueEntry, QueueStatus,
    ProcurementTransaction, Payment, PaymentStatus, Notification, NotificationType, UserRole,
    FarmerDealerAssignment, AssignmentStatus
)
from ..schemas import QRScanRequest, ProcurementCreate
from ..auth import require_dealer, require_user

router = APIRouter(prefix="/api/dealer", tags=["Dealer Module"])

@router.get("/assigned-farmers")
def get_assigned_farmers(current_user: User = Depends(require_dealer), db: Session = Depends(get_db)):
    """
    Returns only farmers who have an assignment with the currently logged-in dealer.
    Strictly isolated per dealer.
    """
    assignments = (
        db.query(FarmerDealerAssignment)
        .filter(FarmerDealerAssignment.dealer_id == current_user.id)
        .order_by(FarmerDealerAssignment.created_at.desc())
        .all()
    )

    res = []
    for a in assignments:
        farmer = a.farmer
        fp = farmer.farmer_profile if farmer else None
        booking = a.booking
        res.append({
            "assignment_id": a.id,
            "assignment_code": a.assignment_code,
            "farmer_id": a.farmer_id,
            "farmer_name": farmer.name if farmer else "Farmer",
            "farmer_phone": farmer.phone if farmer else "",
            "village": fp.village if fp else "",
            "district": fp.district if fp else "",
            "product_name": a.crop_type,
            "centre_id": a.centre_id,
            "centre_name": a.centre.name if a.centre else "",
            "token_number": booking.token_number if booking else "",
            "booking_code": booking.booking_code if booking else "",
            "expected_quantity_quintals": booking.expected_quantity_quintals if booking else 0,
            "slot_date": booking.slot.date if booking and booking.slot else "",
            "slot_time": f"{booking.slot.start_time} - {booking.slot.end_time}" if booking and booking.slot else "",
            "status": a.status,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M")
        })
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

    # 6. Valid Pass! Update booking status to VERIFIED
    farmer_id = assignment.farmer_id if assignment else (booking.farmer_id if booking else None)
    farmer = db.query(User).filter(User.id == farmer_id).first() if farmer_id else None
    fp = farmer.farmer_profile if farmer else None

    if booking:
        booking.status = BookingStatus.VERIFIED
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

    if booking.status == BookingStatus.PROCUREMENT_COMPLETED:
        raise HTTPException(status_code=400, detail="Procurement already completed for this booking.")

    # Calculate total amount
    total_amount = round(proc.actual_quantity_quintals * proc.rate_per_quintal, 2)

    # 1. Update Booking and Assignment status
    booking.status = BookingStatus.PROCUREMENT_COMPLETED
    booking.updated_at = datetime.utcnow()
    if booking.assignment:
        booking.assignment.status = AssignmentStatus.COMPLETED
        booking.assignment.updated_at = datetime.utcnow()

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
