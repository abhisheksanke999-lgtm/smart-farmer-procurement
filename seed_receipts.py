import datetime
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal, engine
from backend.app.models import (
    User, UserRole, ProcurementCentre, Booking, BookingStatus,
    ProcurementTransaction, Payment, PaymentStatus, DealerProfile,
    FarmerDealerAssignment, AssignmentStatus, Slot
)

def check_and_seed():
    db: Session = SessionLocal()
    try:
        farmer = db.query(User).filter(User.email == "vijayalaxmigottipalli@gmail.com").first()
        if not farmer:
            print("Farmer Vijaya Laxmi not found!")
            return

        print(f"Farmer ID: {farmer.id}, Name: {farmer.name}")

        dealer = db.query(User).filter(User.role == UserRole.DEALER).first()
        centre = db.query(ProcurementCentre).first()
        
        txns = db.query(ProcurementTransaction).filter(ProcurementTransaction.farmer_id == farmer.id).all()
        print(f"Existing transactions for {farmer.name}: {len(txns)}")
        
        if len(txns) == 0:
            print("Creating a sample completed transaction for Vijaya Laxmi to preview Receipts...")
            
            slot = db.query(Slot).first()
            if not slot:
                slot = Slot(
                    centre_id=centre.id if centre else 1,
                    date="2026-09-09",
                    start_time="03:00 PM",
                    end_time="05:00 PM",
                    max_capacity_quintals=500.0,
                    available_capacity_quintals=475.0,
                    total_slots=30,
                    booked_count=1
                )
                db.add(slot)
                db.flush()

            booking = Booking(
                booking_code="BOOK-PDC1003",
                token_number="PDC-1003",
                farmer_id=farmer.id,
                dealer_id=dealer.id if dealer else 1,
                centre_id=centre.id if centre else 1,
                slot_id=slot.id,
                crop_type="Maize",
                expected_quantity_quintals=25.0,
                status=BookingStatus.PROCUREMENT_COMPLETED,
                qr_data="BOOK-PDC1003"
            )
            db.add(booking)
            db.flush()

            rate = 2320.0
            actual_qty = 25.0
            total_amt = rate * actual_qty

            txn = ProcurementTransaction(
                weighment_slip_no="SLIP-1003",
                booking_id=booking.id,
                farmer_id=farmer.id,
                dealer_id=dealer.id if dealer else 1,
                centre_id=centre.id if centre else 1,
                actual_quantity_quintals=actual_qty,
                quality_grade="Grade A",
                rate_per_quintal=rate,
                total_amount=total_amt,
                transaction_time=datetime.datetime(2026, 9, 9, 15, 30, 0)
            )
            db.add(txn)
            db.flush()

            payment = Payment(
                transaction_id=txn.id,
                farmer_id=farmer.id,
                amount=total_amt,
                status=PaymentStatus.PAYMENT_PENDING,
                payment_method="DBT_AADHAAR"
            )
            db.add(payment)
            db.commit()
            print("Sample transaction seeded successfully!")
        else:
            print("Transactions already exist:")
            for t in txns:
                print(f"  ID: {t.id}, Slip: {t.weighment_slip_no}, Qty: {t.actual_quantity_quintals}, Amount: {t.total_amount}")
    finally:
        db.close()

if __name__ == "__main__":
    check_and_seed()
