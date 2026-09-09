import os
import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .database import engine, Base, SessionLocal
from .models import (
    User, UserRole, ProcurementCentre, Slot, AuditLog
)
from .auth import get_password_hash

def seed_database():
    """
    Ensures initial Admin user and default Procurement Centres exist.
    DOES NOT insert dummy/test farmers or dummy/test dealers.
    All Farmers and Dealers register via real registration with Email OTP verification.
    """
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # 1. Ensure Admin User exists (Preserve existing or create if empty DB)
        admin = db.query(User).filter(User.email == "abhisheksanke999@gmail.com").first()
        if not admin:
            print("Creating initial Government Admin user...")
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
        else:
            # Ensure Admin role and verification status are correct
            if admin.role != UserRole.ADMIN:
                admin.role = UserRole.ADMIN
            admin.is_email_verified = True
            db.flush()

        # 2. Ensure Procurement Centres exist
        existing_centres = db.query(ProcurementCentre).count()
        centre_instances = []
        if existing_centres == 0:
            print("Initializing standard Procurement Centres...")
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

            for c in centres_data:
                pc = ProcurementCentre(**c)
                db.add(pc)
                centre_instances.append(pc)
            db.flush()
        else:
            centre_instances = db.query(ProcurementCentre).all()

        # 3. Ensure Slots exist for centres
        existing_slots = db.query(Slot).count()
        if existing_slots == 0 and centre_instances:
            print("Initializing standard time slots...")
            today = datetime.now().date()
            dates = [
                today.strftime("%Y-%m-%d"),
                (today + timedelta(days=1)).strftime("%Y-%m-%d"),
                (today + timedelta(days=2)).strftime("%Y-%m-%d")
            ]
            time_slots = [
                ("08:00 AM", "10:00 AM"),
                ("10:00 AM", "12:00 PM"),
                ("01:00 PM", "03:00 PM"),
                ("03:00 PM", "05:00 PM")
            ]

            for pc in centre_instances:
                for d in dates:
                    for start, end in time_slots:
                        slot = Slot(
                            centre_id=pc.id,
                            date=d,
                            start_time=start,
                            end_time=end,
                            capacity=20,
                            booked_count=0
                        )
                        db.add(slot)
            db.flush()

        # 4. Ensure System Audit Log exists
        init_audit = db.query(AuditLog).filter(AuditLog.action == "SYSTEM_INIT").first()
        if not init_audit:
            audit = AuditLog(
                actor_id=admin.id,
                actor_role="ADMIN",
                action="SYSTEM_INIT",
                details="Smart Farmer Procurement Management System initialized with standard centres and slots."
            )
            db.add(audit)

        db.commit()
        print("Database initialization complete (no dummy accounts).")
    except Exception as e:
        db.rollback()
        print(f"Database initialization error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
