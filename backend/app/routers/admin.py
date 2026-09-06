import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import (
    User, UserRole, FarmerProfile, DealerProfile, DealerStatus, ProcurementCentre, Slot,
    Booking, BookingStatus, QueueEntry, QueueStatus, ProcurementTransaction, Payment, PaymentStatus,
    Notification, NotificationType, AuditLog, Complaint, FarmerDealerAssignment, AssignmentStatus
)
from ..schemas import DealerStatusUpdate, ProcurementCentreCreate, ComplaintResponse
from ..auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["Admin Government Module"])

@router.get("/farmer-dealer-assignments")
def get_farmer_dealer_assignments(status_filter: Optional[str] = None, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """
    Returns complete relationship hierarchy for Admin visibility:
    Farmer -> Product -> Procurement Center -> Dealer with status and timestamps.
    """
    query = db.query(FarmerDealerAssignment).order_by(FarmerDealerAssignment.created_at.desc())
    if status_filter:
        query = query.filter(FarmerDealerAssignment.status == status_filter)
    assignments = query.all()

    res = []
    for a in assignments:
        farmer = a.farmer
        dealer = a.dealer
        dp = dealer.dealer_profile if dealer else None
        centre = a.centre
        booking = a.booking

        res.append({
            "assignment_id": a.id,
            "assignment_code": a.assignment_code,
            "farmer_id": a.farmer_id,
            "farmer_name": farmer.name if farmer else "Farmer",
            "farmer_email": farmer.email if farmer else "",
            "farmer_phone": farmer.phone if farmer else "",
            "product_name": a.crop_type,
            "centre_id": a.centre_id,
            "centre_name": centre.name if centre else "",
            "centre_location": centre.location if centre else "",
            "dealer_id": a.dealer_id,
            "dealer_name": dealer.name if dealer else "Dealer",
            "dealer_business": dp.business_name if dp else "",
            "dealer_phone": dealer.phone if dealer else "",
            "booking_code": booking.booking_code if booking else "",
            "token_number": booking.token_number if booking else "",
            "status": a.status,
            "qr_token": a.qr_token,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M"),
            "updated_at": a.updated_at.strftime("%Y-%m-%d %H:%M") if a.updated_at else ""
        })
    return res

@router.get("/dashboard-stats")
def get_admin_dashboard_stats(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    total_farmers = db.query(User).filter(User.role == UserRole.FARMER).count()
    total_dealers = db.query(User).filter(User.role == UserRole.DEALER).count()
    pending_dealers = db.query(DealerProfile).filter(DealerProfile.status == DealerStatus.PENDING).count()
    approved_dealers = db.query(DealerProfile).filter(DealerProfile.status == DealerStatus.APPROVED).count()
    active_centres = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).count()
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_bookings = db.query(Booking).join(Slot).filter(Slot.date == today_str).count()
    
    waiting_queue = db.query(QueueEntry).filter(QueueEntry.status == QueueStatus.WAITING).count()
    completed_procurement = db.query(Booking).filter(Booking.status == BookingStatus.PROCUREMENT_COMPLETED).count()
    
    pending_payments_count = db.query(Payment).filter(Payment.status == PaymentStatus.PAYMENT_PENDING).count()
    completed_payments_count = db.query(Payment).filter(Payment.status == PaymentStatus.PAYMENT_COMPLETED).count()

    total_procurement_quantity = db.query(func.sum(ProcurementTransaction.actual_quantity_quintals)).scalar() or 0.0
    total_procurement_value = db.query(func.sum(ProcurementTransaction.total_amount)).scalar() or 0.0
    pending_payments_value = db.query(func.sum(Payment.amount)).filter(Payment.status == PaymentStatus.PAYMENT_PENDING).scalar() or 0.0

    return {
        "total_farmers": total_farmers,
        "total_dealers": total_dealers,
        "pending_dealers": pending_dealers,
        "approved_dealers": approved_dealers,
        "active_centres": active_centres,
        "today_bookings": today_bookings,
        "waiting_queue": waiting_queue,
        "completed_procurement": completed_procurement,
        "pending_payments_count": pending_payments_count,
        "completed_payments_count": completed_payments_count,
        "total_procurement_quantity_quintals": round(total_procurement_quantity, 2),
        "total_procurement_value": round(total_procurement_value, 2),
        "pending_payments_value": round(pending_payments_value, 2)
    }

@router.get("/dealers")
def list_dealers(status_filter: Optional[str] = None, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(DealerProfile).join(User)
    if status_filter:
        query = query.filter(DealerProfile.status == status_filter)
    
    dealers = query.all()
    res = []
    for d in dealers:
        centre_name = d.assigned_centre.name if d.assigned_centre else "Unassigned"
        res.append({
            "dealer_id": d.id,
            "user_id": d.user_id,
            "full_name": d.user.name,
            "email": d.email,
            "mobile_number": d.mobile_number,
            "business_name": d.business_name,
            "address": d.address,
            "government_id_type": d.government_id_type,
            "government_id_number": d.government_id_number,
            "license_number": d.license_number,
            "status": d.status,
            "assigned_centre_id": d.assigned_centre_id,
            "assigned_centre_name": centre_name,
            "rejection_reason": d.rejection_reason,
            "verification_documents_url": d.verification_documents_url,
            "created_at": d.created_at.strftime("%Y-%m-%d %H:%M")
        })
    return res

@router.post("/update-dealer-status")
def update_dealer_status(update_in: DealerStatusUpdate, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    dealer = db.query(DealerProfile).filter(DealerProfile.id == update_in.dealer_id).first()
    if not dealer:
        raise HTTPException(status_code=404, detail="Dealer profile not found")

    old_status = dealer.status
    dealer.status = update_in.status
    if update_in.rejection_reason:
        dealer.rejection_reason = update_in.rejection_reason

    dealer.updated_at = datetime.utcnow()
    if update_in.status == "APPROVED" and dealer.user:
        dealer.user.is_email_verified = True

    # Log action in AuditLog
    audit = AuditLog(
        actor_id=current_user.id,
        actor_role="ADMIN",
        action=f"DEALER_STATUS_UPDATE_{update_in.status}",
        details=f"Changed dealer #{dealer.id} ({dealer.business_name}) status from {old_status} to {update_in.status}."
    )
    db.add(audit)

    # Send Notification to Dealer User
    notif_title = f"Dealer Application {update_in.status}"
    notif_title_te = f"డీలర్ దరఖాస్తు {update_in.status}"
    if update_in.status == "APPROVED":
        notif_msg = "Congratulations! Your dealer account has been approved by Government Admin. You can now access procurement scanning."
        notif_msg_te = "అభినందనలు! మీ డీలర్ ఖాతా ప్రభుత్వం ఆమోదించింది. మీరు ఇప్పుడు కొనుగోలు ప్రక్రియను ప్రారంభించవచ్చు."
    elif update_in.status == "REJECTED":
        notif_msg = f"Your dealer application was rejected. Reason: {update_in.rejection_reason or 'Verification document mismatch'}"
        notif_msg_te = f"మీ డీలర్ దరఖాస్తు తిరస్కరించబడింది. కారణం: {update_in.rejection_reason or 'పత్రాల సరిపోలకపోవడం'}"
    else:
        notif_msg = f"Your dealer account has been suspended by Admin. Reason: {update_in.rejection_reason or 'Policy compliance review'}"
        notif_msg_te = "మీ డీలర్ ఖాతా నిలిపివేయబడింది."

    db.add(Notification(
        user_id=dealer.user_id,
        title=notif_title,
        title_te=notif_title_te,
        message=notif_msg,
        message_te=notif_msg_te,
        type=NotificationType.APPROVAL
    ))

    db.commit()

    return {"message": f"Dealer status updated to {update_in.status} successfully."}

@router.get("/farmers")
def list_farmers(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    farmers = db.query(FarmerProfile).join(User).all()
    res = []
    for f in farmers:
        res.append({
            "farmer_id": f.id,
            "user_id": f.user_id,
            "name": f.user.name,
            "email": f.user.email,
            "phone": f.user.phone,
            "is_email_verified": f.user.is_email_verified,
            "village": f.village,
            "district": f.district,
            "land_size_acres": f.land_size_acres,
            "bank_name": f.bank_name,
            "bank_account_no": f.bank_account_no,
            "ifsc_code": f.ifsc_code,
            "created_at": f.user.created_at.strftime("%Y-%m-%d %H:%M")
        })
    return res

@router.post("/centres")
def create_procurement_centre(centre_in: ProcurementCentreCreate, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    existing = db.query(ProcurementCentre).filter(ProcurementCentre.code == centre_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Centre code already exists.")

    pc = ProcurementCentre(
        name=centre_in.name,
        code=centre_in.code,
        location=centre_in.location,
        district=centre_in.district,
        pincode=centre_in.pincode,
        contact_phone=centre_in.contact_phone,
        daily_capacity=centre_in.daily_capacity,
        operating_hours=centre_in.operating_hours
    )
    db.add(pc)
    db.flush()

    # Generate slots for today & next 2 days
    today = datetime.now().date()
    dates = [today.strftime("%Y-%m-%d"), (today + timedelta(days=1)).strftime("%Y-%m-%d"), (today + timedelta(days=2)).strftime("%Y-%m-%d")]
    time_slots = [("08:00 AM", "10:00 AM"), ("10:00 AM", "12:00 PM"), ("01:00 PM", "03:00 PM"), ("03:00 PM", "05:00 PM")]

    for d in dates:
        for start, end in time_slots:
            s = Slot(centre_id=pc.id, date=d, start_time=start, end_time=end, capacity=20, booked_count=0)
            db.add(s)

    db.commit()
    return {"message": "Procurement centre created successfully with default slots.", "centre_id": pc.id}

@router.get("/payments")
def get_all_payments(status_filter: Optional[str] = None, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(Payment).join(ProcurementTransaction).join(User, Payment.farmer_id == User.id)
    if status_filter:
        query = query.filter(Payment.status == status_filter)
    
    payments = query.order_by(Payment.created_at.desc()).all()
    res = []
    for p in payments:
        txn = p.transaction
        farmer = db.query(User).filter(User.id == p.farmer_id).first()
        res.append({
            "payment_id": p.id,
            "transaction_id": p.transaction_id,
            "farmer_name": farmer.name if farmer else "Farmer",
            "farmer_phone": farmer.phone if farmer else "",
            "bank_account_no": farmer.farmer_profile.bank_account_no if farmer and farmer.farmer_profile else "",
            "ifsc_code": farmer.farmer_profile.ifsc_code if farmer and farmer.farmer_profile else "",
            "amount": p.amount,
            "status": p.status,
            "payment_method": p.payment_method,
            "bank_utr": p.bank_utr,
            "created_at": p.created_at.strftime("%Y-%m-%d %H:%M"),
            "crop_type": txn.booking.crop_type if txn and txn.booking else "",
            "quantity": txn.actual_quantity_quintals if txn else 0
        })
    return res

@router.post("/process-payment/{payment_id}")
def process_single_payment(payment_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    pymt = db.query(Payment).filter(Payment.id == payment_id).first()
    if not pymt:
        raise HTTPException(status_code=404, detail="Payment record not found")

    if pymt.status == PaymentStatus.PAYMENT_COMPLETED:
        return {"message": "Payment is already completed ✓", "bank_utr": pymt.bank_utr}

    utr = f"SBIN{secrets.token_numeric(11) if hasattr(secrets, 'token_numeric') else str(int(datetime.now().timestamp()))}"
    pymt.status = PaymentStatus.PAYMENT_COMPLETED
    pymt.bank_utr = utr
    pymt.updated_at = datetime.utcnow()

    # Notify Farmer
    db.add(Notification(
        user_id=pymt.farmer_id,
        title=f"Direct Payment Completed ₹{pymt.amount:,.2f} ✓",
        title_te=f"ప్రత్యక్ష చెల్లింపు పూర్తయింది ₹{pymt.amount:,.2f} ✓",
        message=f"DBT payment of ₹{pymt.amount:,.2f} has been processed and credited to your bank account. Bank UTR: {utr}",
        message_te=f"₹{pymt.amount:,.2f} చెల్లింపు మీ బ్యాంక్ ఖాతాకు జమ చేయబడింది. Bank UTR: {utr}",
        type=NotificationType.PAYMENT
    ))

    db.commit()
    return {"message": "Payment processed successfully ✓", "bank_utr": utr}

@router.get("/audit-logs")
def get_audit_logs(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(50).all()
    res = []
    for l in logs:
        res.append({
            "id": l.id,
            "actor_id": l.actor_id,
            "actor_role": l.actor_role,
            "action": l.action,
            "details": l.details,
            "created_at": l.created_at.strftime("%Y-%m-%d %H:%M:%S")
        })
    return res

@router.get("/complaints")
def get_complaints(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    complaints = db.query(Complaint).order_by(Complaint.created_at.desc()).all()
    res = []
    for c in complaints:
        res.append({
            "id": c.id,
            "user_id": c.user_id,
            "user_name": c.user_name,
            "subject": c.subject,
            "description": c.description,
            "status": c.status,
            "response": c.response,
            "created_at": c.created_at.strftime("%Y-%m-%d %H:%M")
        })
    return res
