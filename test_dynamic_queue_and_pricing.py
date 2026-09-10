import json
import urllib.request
import urllib.error
import random
import string
import datetime
import time
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from backend.app.database import SessionLocal
from backend.app.models import (
    User, ProcurementCentre, Category, MSPRate, DealerProfile, FarmerProfile,
    Booking, BookingStatus, QueueEntry, QueueStatus, ProcurementTransaction,
    Payment, PaymentStatus, Slot, FarmerDealerAssignment, AssignmentStatus
)
from backend.app.auth import create_access_token
from backend.app.slot_timing import get_now_ist

def random_string(n=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))

def main():
    base_url = "http://127.0.0.1:8000"
    print("====================================================================")
    print("STARTING DYNAMIC QUEUE, ROLLING AVG, WEIGHING & PAYMENT TEST SUITE")
    print("====================================================================")

    db = SessionLocal()

    # 1. Setup Active Crop Category & MSP Rate
    category = db.query(Category).filter(Category.status == "ACTIVE").first()
    if not category:
        category = Category(name="Paddy", status="ACTIVE", base_price_per_quintal=2300.0)
        db.add(category)
        db.commit()
        db.refresh(category)

    # 2. Setup Fresh Isolated Active Centre
    centre = ProcurementCentre(
        name=f"Dynamic Mandi {random_string(4).upper()}",
        code=f"DMC-{random.randint(1000, 9999)}",
        location="Market Yard",
        district="Khammam",
        pincode="507001",
        contact_phone="9876543210",
        is_active=True
    )
    db.add(centre)
    db.commit()
    db.refresh(centre)

    # 3. Setup Approved Dealer for this Centre
    dealer_user = User(
        name="Sri Venkateswara Agro",
        email=f"dealer_{random_string(5)}@agriportal.in",
        phone=f"98{random.randint(10000000, 99999999)}",
        password_hash="hashed_placeholder",
        role="DEALER",
        is_email_verified=True
    )
    db.add(dealer_user)
    db.commit()
    db.refresh(dealer_user)
    dp = DealerProfile(
        user_id=dealer_user.id,
        business_name="Sri Venkateswara Agro",
        mobile_number=dealer_user.phone,
        email=dealer_user.email,
        address="APMC Market Yard, Khammam",
        government_id_type="GSTIN",
        government_id_number="36AAACG1234H1Z1",
        license_number="LIC-2026-999",
        status="APPROVED",
        assigned_centre_id=centre.id,
        category_id=category.id
    )
    db.add(dp)
    db.commit()

    dealer_token = create_access_token({"sub": dealer_user.email, "role": dealer_user.role, "id": dealer_user.id})

    # 4. Setup Active Slot for Current IST Time Window
    today_str = get_now_ist().strftime("%Y-%m-%d")
    start_time_str = (get_now_ist() - datetime.timedelta(hours=1)).strftime("%I:%M %p")
    end_time_str = (get_now_ist() + datetime.timedelta(hours=2)).strftime("%I:%M %p")
    slot = Slot(
        centre_id=centre.id,
        date=today_str,
        start_time=start_time_str,
        end_time=end_time_str,
        capacity=25,
        booked_count=0
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)

    # Helper function to create a test farmer & booking
    def create_farmer_and_booking(name_suffix, token_no):
        farmer_user = User(
            name=f"Farmer {name_suffix}",
            email=f"farmer_{name_suffix.lower()}_{random_string(4)}@agriportal.in",
            phone=f"99{random.randint(10000000, 99999999)}",
            password_hash="hashed_placeholder",
            role="FARMER",
            is_email_verified=True
        )
        db.add(farmer_user)
        db.commit()
        db.refresh(farmer_user)

        fp = FarmerProfile(
            user_id=farmer_user.id,
            village="Gollapudi",
            district="Khammam",
            address="Plot 44, Gollapudi Village",
            land_size_acres=4.5
        )
        db.add(fp)
        db.commit()

        b_code = f"BOOK-{random_string(8).upper()}"
        asgn_code = f"ASGN-{random_string(8).upper()}"
        qr_token = f"QR-{random_string(10).upper()}"

        bk = Booking(
            booking_code=b_code,
            token_number=token_no,
            farmer_id=farmer_user.id,
            dealer_id=dealer_user.id,
            centre_id=centre.id,
            category_id=category.id,
            slot_id=slot.id,
            crop_type=category.name,
            expected_quantity_quintals=40.0,
            status=BookingStatus.BOOKED,
            qr_data=qr_token
        )
        db.add(bk)
        db.commit()
        db.refresh(bk)

        asgn = FarmerDealerAssignment(
            assignment_code=asgn_code,
            farmer_id=farmer_user.id,
            dealer_id=dealer_user.id,
            centre_id=centre.id,
            category_id=category.id,
            crop_type=category.name,
            booking_id=bk.id,
            qr_token=qr_token,
            status=AssignmentStatus.ACTIVE
        )
        db.add(asgn)

        qe = QueueEntry(
            centre_id=centre.id,
            booking_id=bk.id,
            token_number=token_no,
            position=1,
            status=QueueStatus.WAITING,
            estimated_wait_minutes=12
        )
        db.add(qe)
        db.commit()
        db.refresh(qe)

        f_token = create_access_token({"sub": farmer_user.email, "role": farmer_user.role, "id": farmer_user.id})
        return farmer_user, bk, qe, f_token

    farmer_a, bk_a, qe_a, token_a = create_farmer_and_booking("Alpha", "PDC-A01")
    farmer_b, bk_b, qe_b, token_b = create_farmer_and_booking("Beta", "PDC-B02")
    farmer_c, bk_c, qe_c, token_c = create_farmer_and_booking("Gamma", "PDC-C03")

    print(f"\n[SETUP COMPLETE] Created 3 Waiting Farmers:")
    print(f"  Farmer A (Token {bk_a.token_number}, Booking {bk_a.booking_code})")
    print(f"  Farmer B (Token {bk_b.token_number}, Booking {bk_b.booking_code})")
    print(f"  Farmer C (Token {bk_c.token_number}, Booking {bk_c.booking_code})")

    # Step 1: Simulate Farmer A Procurement (Duration = 12 mins)
    now = get_now_ist().replace(tzinfo=None)
    qe_a.called_at = now - datetime.timedelta(minutes=24)
    qe_a.completed_at = now - datetime.timedelta(minutes=12)
    qe_a.status = QueueStatus.COMPLETED
    bk_a.status = BookingStatus.PROCUREMENT_COMPLETED
    db.commit()

    txn_a = ProcurementTransaction(
        booking_id=bk_a.id,
        farmer_id=farmer_a.id,
        dealer_id=dealer_user.id,
        centre_id=centre.id,
        actual_quantity_quintals=40.0,
        quality_grade="Grade A",
        rate_per_quintal=2300.0,
        total_amount=92000.0,
        weighment_slip_no="SLIP-A01",
        transaction_time=qe_a.completed_at
    )
    db.add(txn_a)
    db.commit()
    print(f"\n[PASS] Farmer A Completed:")
    print(f"  Start: {qe_a.called_at.strftime('%H:%M')} -> End: {qe_a.completed_at.strftime('%H:%M')} (12 mins)")

    # Step 2: Simulate Farmer B Procurement (Duration = 18 mins)
    qe_b.called_at = now - datetime.timedelta(minutes=18)
    qe_b.completed_at = now
    qe_b.status = QueueStatus.COMPLETED
    bk_b.status = BookingStatus.PROCUREMENT_COMPLETED
    db.commit()

    txn_b = ProcurementTransaction(
        booking_id=bk_b.id,
        farmer_id=farmer_b.id,
        dealer_id=dealer_user.id,
        centre_id=centre.id,
        actual_quantity_quintals=48.0,
        quality_grade="Grade A",
        rate_per_quintal=2300.0,
        total_amount=110400.0,
        weighment_slip_no="SLIP-B02",
        transaction_time=qe_b.completed_at
    )
    db.add(txn_b)
    db.commit()
    print(f"[PASS] Farmer B Completed:")
    print(f"  Start: {qe_b.called_at.strftime('%H:%M')} -> End: {qe_b.completed_at.strftime('%H:%M')} (18 mins)")

    # Expected Rolling Average = (12 + 18) / 2 = 15.0 mins
    bk_c_code = bk_c.booking_code
    bk_c_id = bk_c.id
    db.close()

    # Step 3: Verify Dynamic Rolling Average for Farmer C via API
    req_c = urllib.request.Request(
        f"{base_url}/api/farmer/queue-status?booking_code={bk_c_code}",
        headers={"Authorization": f"Bearer {token_c}"}
    )
    with urllib.request.urlopen(req_c) as resp:
        q_res = json.loads(resp.read().decode())
        print(f"\n[PASS] Farmer C Live Queue Status from Real DB:")
        print(f"  Current Token at Mandi:  {q_res.get('current_token')}")
        print(f"  Farmers Ahead:           {q_res.get('farmers_ahead')}")
        print(f"  Recent Rolling Average:  {q_res.get('recent_average_minutes')} mins/farmer")
        print(f"  Estimated Wait Time:     {q_res.get('estimated_wait_minutes')} mins")
        print(f"  Queue Flow Status:       {q_res.get('queue_status')}")

        assert q_res.get("recent_average_minutes") == 15.0, f"Expected 15.0 mins/farmer rolling average, got {q_res.get('recent_average_minutes')}"
        assert q_res.get("farmers_ahead") == 0, f"Farmer C should be next in line (0 ahead), got {q_res.get('farmers_ahead')}"

    # Step 4: Dealer Scans Farmer C QR Code
    req_scan = urllib.request.Request(
        f"{base_url}/api/dealer/scan-qr",
        data=json.dumps({"booking_code": bk_c_code}).encode(),
        headers={"Authorization": f"Bearer {dealer_token}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_scan) as resp:
        scan_res = json.loads(resp.read().decode())
        assert scan_res["is_valid"] is True
        print(f"\n[PASS] Dealer Verified Farmer C QR Pass: {scan_res.get('message')}")

    # Verify QueueEntry is now IN_SERVICE
    db = SessionLocal()
    qe_c_db = db.query(QueueEntry).filter(QueueEntry.booking_id == bk_c_id).first()
    assert qe_c_db.status == QueueStatus.IN_SERVICE
    assert qe_c_db.called_at is not None
    print(f"[PASS] Farmer C status transitioned to IN_SERVICE with called_at timestamp.")
    db.close()

    # Step 5: Real Weighment & Dynamic Price Calculation (Actual Qty: 52.5 Q × ₹2,300/Q)
    weighed_qty = 52.5
    msp_rate = 2300.0
    expected_total = round(weighed_qty * msp_rate, 2) # ₹1,20,750.00
    slip_no = f"SLIP-C03-{random.randint(100,999)}"

    proc_payload = {
        "booking_code": bk_c_code,
        "actual_quantity_quintals": weighed_qty,
        "quality_grade": "Grade A Premium",
        "rate_per_quintal": msp_rate,
        "weighment_slip_no": slip_no
    }
    req_proc = urllib.request.Request(
        f"{base_url}/api/dealer/process-procurement",
        data=json.dumps(proc_payload).encode(),
        headers={"Authorization": f"Bearer {dealer_token}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_proc) as resp:
        proc_res = json.loads(resp.read().decode())
        print(f"\n[PASS] Processed Procurement for Farmer C:")
        print(f"  Weighed Actual Quantity: {proc_res.get('actual_quantity_quintals')} Quintals")
        print(f"  Admin Rate Per Quintal:  ₹{proc_res.get('rate_per_quintal')}")
        print(f"  Calculated Total Amount: ₹{proc_res.get('total_amount'):,.2f} (Expected ₹{expected_total:,.2f})")
        print(f"  Weighment Slip Number:   {proc_res.get('weighment_slip_no')}")
        print(f"  Payment Record Status:   {proc_res.get('payment_status')}")

        assert proc_res.get("total_amount") == expected_total, f"Expected total ₹{expected_total}, got ₹{proc_res.get('total_amount')}"
        assert proc_res.get("payment_status") == PaymentStatus.PAYMENT_PENDING

    # Step 6: Admin Updates Payment via DBT & Farmer Inspects Receipts
    db = SessionLocal()
    txn_c = db.query(ProcurementTransaction).filter(ProcurementTransaction.weighment_slip_no == slip_no).first()
    assert txn_c is not None, "ProcurementTransaction must exist in DB"
    pymt_c = txn_c.payment
    assert pymt_c is not None, "Payment record must exist in DB"
    pymt_c.status = PaymentStatus.PAYMENT_COMPLETED
    pymt_c.bank_utr = "DBT-2026-99018472"
    db.commit()
    db.close()

    req_receipts = urllib.request.Request(
        f"{base_url}/api/farmer/receipts",
        headers={"Authorization": f"Bearer {token_c}"}
    )
    with urllib.request.urlopen(req_receipts) as resp:
        receipts = json.loads(resp.read().decode())
        target_rcpt = next((r for r in receipts if r.get("weighment_slip_no") == slip_no), None)
        assert target_rcpt is not None, "Expected receipt for Farmer C in farmer receipts list"
        
        print(f"\n[PASS] Farmer C Receipt Inspection from Real DBT Record:")
        print(f"  Transaction ID:          {target_rcpt.get('transaction_id')}")
        print(f"  Weighment Slip No:       {target_rcpt.get('weighment_slip_no')}")
        print(f"  Actual Weighed Qty:      {target_rcpt.get('actual_quantity')} Q")
        print(f"  Admin Rate:              ₹{target_rcpt.get('rate_per_quintal')}/Q")
        print(f"  Total Verified Amount:   ₹{target_rcpt.get('total_amount'):,.2f}")
        print(f"  Live Payment Status:     {target_rcpt.get('payment_status')}")
        print(f"  DBT Bank UTR / Ref:      {target_rcpt.get('bank_utr')}")

        assert target_rcpt.get("actual_quantity") == weighed_qty
        assert target_rcpt.get("total_amount") == expected_total
        assert target_rcpt.get("payment_status") in [PaymentStatus.PAYMENT_COMPLETED, "PAID", "COMPLETED"]
        assert target_rcpt.get("bank_utr") == "DBT-2026-99018472"

    print("\n====================================================================")
    print("ALL DYNAMIC QUEUE, ROLLING AVG, WEIGHING & DBT TESTS PASSED 100%!")
    print("====================================================================")

if __name__ == "__main__":
    main()
