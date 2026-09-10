import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "backend")))

from app.database import SessionLocal, engine
from app.models import (
    Base, User, UserRole, DealerProfile, DealerStatus, FarmerProfile,
    ProcurementCentre, Slot, Booking, BookingStatus, QueueEntry, QueueStatus,
    ProcurementTransaction, FarmerDealerAssignment, AssignmentStatus, Category
)
from app.queue_service import compute_recent_average_duration, get_live_queue_metrics
from app.slot_timing import get_now_ist

def run_realtime_queue_sync_test():
    print("[TEST] Starting Real-Time Queue Synchronization & Recalculation Test...")
    db = SessionLocal()

    try:
        # 1. Create Dedicated Test Procurement Centre for isolated testing
        test_code = "SYNC-MANDI-" + str(int(datetime.now().timestamp()))
        centre = ProcurementCentre(
            name="Realtime Queue Sync Mandi",
            code=test_code,
            district="Warangal",
            location="Warangal Mandi Yard",
            pincode="506002",
            contact_phone="9876543210",
            operating_hours="08:00 AM - 05:00 PM",
            supported_crops="Paddy,Rice,Cotton,Maize",
            daily_capacity=1000,
            is_active=True
        )
        db.add(centre)
        db.commit()
        db.refresh(centre)


        cat = db.query(Category).first()
        if not cat:
            cat = Category(name="Paddy", description="Paddy Grade A", status="ACTIVE")
            db.add(cat)
            db.commit()
            db.refresh(cat)


        # 3. Create Dealer User
        dealer = db.query(User).filter(User.email == "dealer_queue_test@test.com").first()
        if not dealer:
            dealer = User(
                email="dealer_queue_test@test.com",
                name="Varma Traders",
                phone="9876543210",
                role=UserRole.DEALER,
                password_hash="mockhash",
                is_email_verified=True
            )
            db.add(dealer)
            db.commit()
            db.refresh(dealer)

        dp = db.query(DealerProfile).filter(DealerProfile.user_id == dealer.id).first()
        if not dp:
            dp = DealerProfile(
                user_id=dealer.id,
                business_name="Varma Grain Traders",
                mobile_number=dealer.phone,
                email=dealer.email,
                address="Warangal Yard",
                government_id_type="GSTIN",
                government_id_number="36AAAAA1234A1Z5",
                license_number="DL-WGL-9001",
                assigned_centre_id=centre.id,
                category_id=cat.id,
                status=DealerStatus.APPROVED
            )
            db.add(dp)
            db.commit()
        else:
            dp.status = DealerStatus.APPROVED
            dp.assigned_centre_id = centre.id
            dp.category_id = cat.id
            dp.mobile_number = dealer.phone
            dp.email = dealer.email
            dp.address = "Warangal Yard"
            dp.government_id_number = "36AAAAA1234A1Z5"
            dp.license_number = "DL-WGL-9001"
            db.commit()


        # 4. Create 3 Farmers
        farmers = []
        for i in range(1, 4):
            f_email = f"farmer_q_{i}@test.com"
            farmer = db.query(User).filter(User.email == f_email).first()
            if not farmer:
                farmer = User(
                    email=f_email,
                    name=f"Farmer {chr(64 + i)}",
                    phone=f"900000000{i}",
                    role=UserRole.FARMER,
                    password_hash="mockhash",
                    is_email_verified=True
                )
                db.add(farmer)
                db.commit()
                db.refresh(farmer)
            farmers.append(farmer)

        # 5. Create Slot
        now_dt = get_now_ist().replace(tzinfo=None)
        today_str = now_dt.strftime("%Y-%m-%d")
        slot = Slot(
            centre_id=centre.id,
            date=today_str,
            start_time="10:00 AM",
            end_time="05:00 PM",
            capacity=50,
            booked_count=3,
            is_active=True
        )
        db.add(slot)
        db.commit()
        db.refresh(slot)

        # 6. Create 3 Bookings & QueueEntries
        import secrets
        run_id = secrets.token_hex(2).upper()
        tokens = [f"PDC-T{run_id}-1", f"PDC-T{run_id}-2", f"PDC-T{run_id}-3"]
        bookings = []
        q_entries = []

        for idx, (f, tok) in enumerate(zip(farmers, tokens)):
            b = Booking(
                booking_code=f"BOOK-{tok}",
                token_number=tok,
                farmer_id=f.id,
                dealer_id=dealer.id,
                centre_id=centre.id,
                slot_id=slot.id,
                category_id=cat.id,
                crop_type="Paddy",
                expected_quantity_quintals=40.0,
                status=BookingStatus.BOOKED if idx > 0 else BookingStatus.PROCUREMENT_STARTED,
                qr_data=f"QR-{tok}"
            )
            db.add(b)
            db.flush()
            bookings.append(b)


            qe = QueueEntry(
                centre_id=centre.id,
                booking_id=b.id,
                token_number=tok,
                position=idx + 1,
                status=QueueStatus.IN_SERVICE if idx == 0 else QueueStatus.WAITING,
                called_at=now_dt if idx == 0 else None,
                estimated_wait_minutes=(idx * 12)
            )
            db.add(qe)
            db.flush()
            q_entries.append(qe)

        db.commit()

        # STEP 1: Check Farmer C's Initial Queue View
        metrics_c_init = get_live_queue_metrics(db, centre_id=centre.id, booking_id=bookings[2].id, farmer_id=farmers[2].id)
        print("\n--- INITIAL QUEUE STATE ---")
        print(f"Current Serving Token: {metrics_c_init['current_token']}")
        print(f"Farmer C Token: {metrics_c_init['farmer_token']}")
        print(f"Farmer C Ahead: {metrics_c_init['farmers_ahead']}")
        print(f"Farmer C Position: {metrics_c_init['your_position']}")
        print(f"Farmer C Estimated Wait: {metrics_c_init['estimated_wait_minutes']} mins")
        print(f"Farmer C Is Your Turn: {metrics_c_init['is_your_turn']}")

        assert metrics_c_init["current_token"] == tokens[0], f"Expected {tokens[0]} serving, got {metrics_c_init['current_token']}"
        assert metrics_c_init["farmers_ahead"] == 2, f"Expected 2 ahead ({tokens[0]} + {tokens[1]}), got {metrics_c_init['farmers_ahead']}"
        assert metrics_c_init["your_position"] == 3, f"Expected position 3, got {metrics_c_init['your_position']}"
        assert metrics_c_init["is_your_turn"] is False, "Expected is_your_turn to be False"
        print("[PASS] Step 1: Initial multi-farmer queue correctly calculated.")

        # STEP 2: Complete Farmer A with actual 12 mins elapsed time
        # Simulate Dealer Completing tokens[0]
        q_entries[0].status = QueueStatus.COMPLETED
        q_entries[0].called_at = now_dt - timedelta(minutes=12)
        q_entries[0].completed_at = now_dt
        bookings[0].status = BookingStatus.PROCUREMENT_COMPLETED

        # Auto-advance next waiting token (tokens[1])
        q_entries[1].status = QueueStatus.IN_SERVICE
        q_entries[1].called_at = now_dt
        bookings[1].status = BookingStatus.PROCUREMENT_STARTED

        db.commit()

        # Re-check rolling average & Farmer C's view
        recent_avg_step2 = compute_recent_average_duration(db, centre_id=centre.id, dealer_id=dealer.id)
        metrics_c_step2 = get_live_queue_metrics(db, centre_id=centre.id, booking_id=bookings[2].id, farmer_id=farmers[2].id)

        print(f"\n--- AFTER DEALER COMPLETES {tokens[0]} (12 mins duration) ---")
        print(f"New Rolling Avg: {recent_avg_step2} mins/farmer")
        print(f"Current Serving Token: {metrics_c_step2['current_token']}")
        print(f"Farmer C Ahead: {metrics_c_step2['farmers_ahead']}")
        print(f"Farmer C Position: {metrics_c_step2['your_position']}")
        print(f"Farmer C Estimated Wait: {metrics_c_step2['estimated_wait_minutes']} mins")
        print(f"Farmer C Is Your Turn: {metrics_c_step2['is_your_turn']}")

        assert recent_avg_step2 == 12.0, f"Expected rolling avg 12.0 mins, got {recent_avg_step2}"
        assert metrics_c_step2["current_token"] == tokens[1], f"Expected {tokens[1]} in service, got {metrics_c_step2['current_token']}"
        assert metrics_c_step2["farmers_ahead"] == 1, f"Expected 1 ahead ({tokens[1]}), got {metrics_c_step2['farmers_ahead']}"
        assert metrics_c_step2["your_position"] == 2, f"Expected position 2, got {metrics_c_step2['your_position']}"
        assert metrics_c_step2["estimated_wait_minutes"] == 12, f"Expected wait 12 mins, got {metrics_c_step2['estimated_wait_minutes']}"
        assert metrics_c_step2["is_your_turn"] is False, "Expected is_your_turn to be False"
        print(f"[PASS] Step 2: Queue recalculation upon completing {tokens[0]} verified.")

        # STEP 3: Complete Farmer B (tokens[1]) with actual 16 mins elapsed time
        # Duration 1 = 12m, Duration 2 = 16m -> Average = (12+16)/2 = 14 mins
        q_entries[1].status = QueueStatus.COMPLETED
        q_entries[1].called_at = now_dt - timedelta(minutes=16)
        q_entries[1].completed_at = now_dt
        bookings[1].status = BookingStatus.PROCUREMENT_COMPLETED

        # Auto-advance next waiting token (tokens[2] - Farmer C)
        q_entries[2].status = QueueStatus.IN_SERVICE
        q_entries[2].called_at = now_dt
        bookings[2].status = BookingStatus.PROCUREMENT_STARTED

        db.commit()

        recent_avg_step3 = compute_recent_average_duration(db, centre_id=centre.id, dealer_id=dealer.id)
        metrics_c_step3 = get_live_queue_metrics(db, centre_id=centre.id, booking_id=bookings[2].id, farmer_id=farmers[2].id)

        print(f"\n--- AFTER DEALER COMPLETES {tokens[1]} (16 mins duration) ---")
        print(f"New Rolling Avg: {recent_avg_step3} mins/farmer (Average of 12 & 16 mins)")
        print(f"Current Serving Token: {metrics_c_step3['current_token']}")
        print(f"Farmer C Ahead: {metrics_c_step3['farmers_ahead']}")
        print(f"Farmer C Position: {metrics_c_step3['your_position']}")
        print(f"Farmer C Estimated Wait: {metrics_c_step3['estimated_wait_minutes']} mins")
        print(f"Farmer C Is Your Turn: {metrics_c_step3['is_your_turn']}")

        assert recent_avg_step3 == 14.0, f"Expected rolling avg 14.0 mins, got {recent_avg_step3}"
        assert metrics_c_step3["current_token"] == tokens[2], f"Expected {tokens[2]} in service, got {metrics_c_step3['current_token']}"
        assert metrics_c_step3["farmers_ahead"] == 0, f"Expected 0 ahead, got {metrics_c_step3['farmers_ahead']}"
        assert metrics_c_step3["your_position"] == 1, f"Expected position 1 (YOUR TURN), got {metrics_c_step3['your_position']}"
        assert metrics_c_step3["estimated_wait_minutes"] == 0, f"Expected wait 0 mins, got {metrics_c_step3['estimated_wait_minutes']}"
        assert metrics_c_step3["is_your_turn"] is True, "Expected is_your_turn to be True"
        print("[PASS] Step 3: Farmer C promoted to YOUR TURN with 0 wait time and rolling average updated.")


        print("\nALL REAL-TIME QUEUE SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!")

    finally:
        db.close()

if __name__ == "__main__":
    run_realtime_queue_sync_test()
