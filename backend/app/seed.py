import os
import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .database import engine, Base, SessionLocal
from .models import (
    User, UserRole, FarmerProfile, DealerProfile, DealerStatus,
    ProcurementCentre, Slot, Booking, BookingStatus, QueueEntry, QueueStatus,
    ProcurementTransaction, Payment, PaymentStatus, Notification, NotificationType, AuditLog
)
from .auth import get_password_hash

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    # Check if admin already exists
    admin_user = db.query(User).filter(User.email == "abhisheksanke999@gmail.com").first()
    if admin_user:
        print("Database already seeded.")
        db.close()
        return

    print("Seeding database with production initial data...")

    # 1. Admin User
    admin = User(
        name="Shri Abhishek Sanke (Admin Head)",
        email="abhisheksanke999@gmail.com",
        phone="9876543210",
        role=UserRole.ADMIN,
        password_hash=get_password_hash("AdminPass@123"),
        is_email_verified=True,
        language_preference="en"
    )
    db.add(admin)
    db.flush()

    # 2. Procurement Centres
    centres_data = [
        {
            "name": "Warangal Central Grain Mandi",
            "code": "WGL-01",
            "location": "Enumamula Market Yard, Warangal",
            "district": "Warangal",
            "pincode": "506002",
            "contact_phone": "+91 870 245 8890",
            "daily_capacity": 120,
            "operating_hours": "07:30 AM - 05:00 PM"
        },
        {
            "name": "Nizamabad Commodity Procurement Hub",
            "code": "NZB-02",
            "location": "APMC Yard, Malapally, Nizamabad",
            "district": "Nizamabad",
            "pincode": "503001",
            "contact_phone": "+91 846 223 4511",
            "daily_capacity": 150,
            "operating_hours": "08:00 AM - 06:00 PM"
        },
        {
            "name": "Guntur Chili & Cotton Market Yard",
            "code": "GNT-03",
            "location": "Mirchi Yard Complex, Guntur",
            "district": "Guntur",
            "pincode": "522004",
            "contact_phone": "+91 863 228 9012",
            "daily_capacity": 100,
            "operating_hours": "08:00 AM - 04:30 PM"
        },
        {
            "name": "Karimnagar Paddy Procurement Centre",
            "code": "KMN-04",
            "location": "Collectorate Road, Karimnagar",
            "district": "Karimnagar",
            "pincode": "505001",
            "contact_phone": "+91 878 224 1120",
            "daily_capacity": 90,
            "operating_hours": "08:30 AM - 05:00 PM"
        }
    ]

    centre_instances = []
    for c in centres_data:
        pc = ProcurementCentre(**c)
        db.add(pc)
        centre_instances.append(pc)
    db.flush()

    # 3. Create Slots for Today, Tomorrow and Next Day
    today = datetime.now().date()
    dates = [today.strftime("%Y-%m-%d"), (today + timedelta(days=1)).strftime("%Y-%m-%d"), (today + timedelta(days=2)).strftime("%Y-%m-%d")]
    time_slots = [
        ("08:00 AM", "10:00 AM"),
        ("10:00 AM", "12:00 PM"),
        ("01:00 PM", "03:00 PM"),
        ("03:00 PM", "05:00 PM")
    ]

    slot_instances = []
    for pc in centre_instances:
        for d in dates:
            for start, end in time_slots:
                slot = Slot(
                    centre_id=pc.id,
                    date=d,
                    start_time=start,
                    end_time=end,
                    capacity=20,
                    booked_count=random.randint(2, 14)
                )
                db.add(slot)
                slot_instances.append(slot)
    db.flush()

    # 4. Create Test Farmers
    farmers_data = [
        {
            "name": "Ramu Kurva",
            "email": "ramu.farmer@example.com",
            "phone": "9988776655",
            "role": UserRole.FARMER,
            "password_hash": get_password_hash("FarmerPass@123"),
            "is_email_verified": True,
            "language_preference": "te",
            "profile": {
                "aadhaar_last4": "4812",
                "village": "Ghanpur",
                "district": "Warangal",
                "pincode": "506144",
                "bank_name": "State Bank of India",
                "bank_account_no": "38491029481",
                "ifsc_code": "SBIN0001234",
                "land_size_acres": 4.5
            }
        },
        {
            "name": "Srinivas Rao",
            "email": "srinivas.farmer@example.com",
            "phone": "9876123456",
            "role": UserRole.FARMER,
            "password_hash": get_password_hash("FarmerPass@123"),
            "is_email_verified": True,
            "language_preference": "en",
            "profile": {
                "aadhaar_last4": "9102",
                "village": "Armoor",
                "district": "Nizamabad",
                "pincode": "503224",
                "bank_name": "Union Bank of India",
                "bank_account_no": "51092837412",
                "ifsc_code": "UBIN0532109",
                "land_size_acres": 6.0
            }
        },
        {
            "name": "Laxmi Bai",
            "email": "laxmi.farmer@example.com",
            "phone": "9123456789",
            "role": UserRole.FARMER,
            "password_hash": get_password_hash("FarmerPass@123"),
            "is_email_verified": False, # Needs email verification
            "language_preference": "te",
            "profile": {
                "aadhaar_last4": "3341",
                "village": "Tenali",
                "district": "Guntur",
                "pincode": "522201",
                "bank_name": "Andhra Pragathi Grameena Bank",
                "bank_account_no": "77182930419",
                "ifsc_code": "APGB0004321",
                "land_size_acres": 3.0
            }
        }
    ]

    farmer_instances = []
    for f in farmers_data:
        prof_data = f.pop("profile")
        usr = User(**f)
        db.add(usr)
        db.flush()
        fp = FarmerProfile(user_id=usr.id, **prof_data)
        db.add(fp)
        farmer_instances.append(usr)
    db.flush()

    # 5. Create Test Dealers
    dealers_data = [
        {
            "user": {
                "name": "Rajesh Kumar (Telangana Agro Trading)",
                "email": "dealer.approved@example.com",
                "phone": "9849012345",
                "role": UserRole.DEALER,
                "password_hash": get_password_hash("DealerPass@123"),
                "is_email_verified": True
            },
            "profile": {
                "business_name": "Telangana Agro Trading Co.",
                "mobile_number": "9849012345",
                "email": "dealer.approved@example.com",
                "address": "Plot 42, Grain Market Yard, Warangal",
                "government_id_type": "GSTIN",
                "government_id_number": "36AAACT1234F1Z5",
                "license_number": "LIC-WGL-2025-089",
                "status": DealerStatus.APPROVED,
                "assigned_centre_id": centre_instances[0].id,
                "verification_documents_url": "doc_gst_license_approved.pdf"
            }
        },
        {
            "user": {
                "name": "Venkat Reddy (Sri Krishna Commodities)",
                "email": "dealer.pending@example.com",
                "phone": "9959112233",
                "role": UserRole.DEALER,
                "password_hash": get_password_hash("DealerPass@123"),
                "is_email_verified": True
            },
            "profile": {
                "business_name": "Sri Krishna Commodities Pvt Ltd",
                "mobile_number": "9959112233",
                "email": "dealer.pending@example.com",
                "address": "Shop 12, APMC Yard, Nizamabad",
                "government_id_type": "GSTIN",
                "government_id_number": "36BBBCK9876E1Z2",
                "license_number": "LIC-NZB-2026-112",
                "status": DealerStatus.PENDING,
                "assigned_centre_id": centre_instances[1].id,
                "verification_documents_url": "doc_gst_license_pending.pdf"
            }
        },
        {
            "user": {
                "name": "Manoj Sharma (Deccan Grain Buyers)",
                "email": "dealer.rejected@example.com",
                "phone": "9701234567",
                "role": UserRole.DEALER,
                "password_hash": get_password_hash("DealerPass@123"),
                "is_email_verified": True
            },
            "profile": {
                "business_name": "Deccan Grain Buyers Ltd",
                "mobile_number": "9701234567",
                "email": "dealer.rejected@example.com",
                "address": "Mirchi Yard Road, Guntur",
                "government_id_type": "GSTIN",
                "government_id_number": "37CCCCD5544A1Z9",
                "license_number": "LIC-GNT-2024-004",
                "status": DealerStatus.REJECTED,
                "assigned_centre_id": centre_instances[2].id,
                "rejection_reason": "Expired Trade License and mismatch in GSTIN name",
                "verification_documents_url": "doc_expired_license.pdf"
            }
        }
    ]

    dealer_instances = []
    for d in dealers_data:
        usr_data = d["user"]
        prof_data = d["profile"]
        usr = User(**usr_data)
        db.add(usr)
        db.flush()
        dp = DealerProfile(user_id=usr.id, **prof_data)
        db.add(dp)
        dealer_instances.append(usr)
    db.flush()

    # 6. Sample Booking & Live Queue Entry for Ramu Kurva
    target_slot = slot_instances[1] # Today 10:00 AM slot at Warangal
    booking1 = Booking(
        booking_code="BOOK-8F72A91C",
        token_number="PDC-1042",
        farmer_id=farmer_instances[0].id,
        centre_id=centre_instances[0].id,
        slot_id=target_slot.id,
        crop_type="Paddy (ధాన్యం)",
        expected_quantity_quintals=45.0,
        status=BookingStatus.BOOKED,
        qr_data="BOOK-8F72A91C"
    )
    db.add(booking1)
    db.flush()

    queue1 = QueueEntry(
        centre_id=centre_instances[0].id,
        booking_id=booking1.id,
        token_number="PDC-1042",
        position=3,
        status=QueueStatus.WAITING,
        estimated_wait_minutes=25
    )
    db.add(queue1)

    # 7. Completed Booking, Transaction & Payment for Srinivas Rao
    target_slot2 = slot_instances[0]
    booking2 = Booking(
        booking_code="BOOK-3E91B24A",
        token_number="PDC-1035",
        farmer_id=farmer_instances[1].id,
        centre_id=centre_instances[1].id,
        slot_id=target_slot2.id,
        crop_type="Paddy (ధాన్యం)",
        expected_quantity_quintals=55.0,
        status=BookingStatus.PROCUREMENT_COMPLETED,
        qr_data="BOOK-3E91B24A"
    )
    db.add(booking2)
    db.flush()

    queue2 = QueueEntry(
        centre_id=centre_instances[1].id,
        booking_id=booking2.id,
        token_number="PDC-1035",
        position=0,
        status=QueueStatus.COMPLETED,
        estimated_wait_minutes=0
    )
    db.add(queue2)

    txn2 = ProcurementTransaction(
        booking_id=booking2.id,
        farmer_id=farmer_instances[1].id,
        dealer_id=dealer_instances[0].id,
        centre_id=centre_instances[1].id,
        actual_quantity_quintals=54.5,
        quality_grade="Grade A",
        rate_per_quintal=2320.0,
        total_amount=126440.0, # 54.5 * 2320
        weighment_slip_no="SLIP-NZB-99214"
    )
    db.add(txn2)
    db.flush()

    pymt2 = Payment(
        transaction_id=txn2.id,
        farmer_id=farmer_instances[1].id,
        amount=126440.0,
        status=PaymentStatus.PAYMENT_COMPLETED,
        payment_method="Direct Bank Transfer (DBT)",
        bank_utr="SBIN00294810248"
    )
    db.add(pymt2)

    # 8. Notifications
    notifs = [
        Notification(
            user_id=admin.id,
            title="New Dealer Registration",
            title_te="కొత్త డీలర్ రిజిస్ట్రేషన్",
            message="Sri Krishna Commodities has registered and is pending approval.",
            message_te="శ్రీ కృష్ణ కమోడిటీస్ రిజిస్టర్ అయింది, ఆమోదం కోసం వేచి ఉంది.",
            type=NotificationType.APPROVAL
        ),
        Notification(
            user_id=farmer_instances[0].id,
            title="Slot Booking Confirmed ✓",
            title_te="స్లాట్ బుకింగ్ ధృవీకరించబడింది ✓",
            message="Your slot for Paddy procurement is confirmed today at 10:00 AM. Token: PDC-1042.",
            message_te="ఈరోజు ఉదయం 10:00 గంటలకు ధాన్యం కొనుగోలు స్లాట్ ధృవీకరించబడింది. టోకెన్: PDC-1042.",
            type=NotificationType.BOOKING
        ),
        Notification(
            user_id=farmer_instances[0].id,
            title="Turn Approaching!",
            title_te="మీ వంతు సమీపిస్తోంది!",
            message="Your turn is approaching at Warangal Central Grain Mandi. 3 farmers ahead of you.",
            message_te="వరంగల్ సెంట్రల్ గ్రెయిన్ మండి వద్ద మీ వంతు దగ్గరపడుతోంది. మీ కంటే ముందు 3 మంది రైతులు ఉన్నారు.",
            type=NotificationType.QUEUE
        ),
        Notification(
            user_id=farmer_instances[1].id,
            title="Payment Completed Successfully ₹1,26,440",
            title_te="చెల్లింపు విజయవంతంగా పూర్తయింది ₹1,26,440",
            message="DBT payment of ₹1,26,440 credited to Union Bank of India account ending 7412. UTR: SBIN00294810248",
            message_te="₹1,26,440 చెల్లింపు యూనియన్ బ్యాంక్ ఖాతాకు క్రెడిట్ చేయబడింది. UTR: SBIN00294810248",
            type=NotificationType.PAYMENT
        )
    ]
    for n in notifs:
        db.add(n)

    # 9. Audit Logs
    audit = AuditLog(
        actor_id=admin.id,
        actor_role="ADMIN",
        action="SYSTEM_INIT",
        details="SIH 26032 Procurement Management System initialized with default centers and slots."
    )
    db.add(audit)

    db.commit()
    db.close()
    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed_database()
