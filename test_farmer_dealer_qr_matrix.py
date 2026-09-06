"""
Comprehensive Integration Test Matrix for Farmer-Dealer-Procurement Center Relationship and QR Authorization.

Validates the exact prompt requirements:
1. Dealer Registration requires mandatory Procurement Center and Address.
2. Farmer workflow:
   - Product (Rice) filters centers supporting Rice (Bhimavaram, Palakollu, Tanuku).
   - Center (Bhimavaram) strictly filters dealers assigned to Bhimavaram (Somu, Ravi).
   - Dealers from other centers (Kumar @ Palakollu) are excluded.
3. Farmer Ramu assigns Somu at Bhimavaram for Rice.
4. Strict QR Authorization:
   - Somu scans Ramu's QR: ALLOWED ✅
   - Ravi (same center) scans Ramu's QR: REJECTED ❌
   - Kumar (other center) scans Ramu's QR: REJECTED ❌
5. Dealer Somu processes procurement -> marks assignment COMPLETED.
6. Re-scan of completed pass is rejected.
7. Admin visibility of Farmer -> Produce -> Center -> Dealer hierarchy.
"""

import sys
import os
import json
import time
import secrets
import threading
import urllib.request
import urllib.error
from datetime import datetime, date
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import uvicorn
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models import (
    User, UserRole, DealerProfile, DealerStatus, FarmerProfile,
    ProcurementCentre, Slot, Booking, BookingStatus, FarmerDealerAssignment,
    AssignmentStatus, QueueEntry, QueueStatus
)
from backend.app.auth import get_password_hash, create_access_token

TEST_PORT = 8019
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"

def api_request(method, endpoint, data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status_code = resp.getcode()
            res_body = resp.read().decode("utf-8")
            try:
                return status_code, json.loads(res_body)
            except Exception:
                return status_code, res_body
    except urllib.error.HTTPError as he:
        err_body = he.read().decode("utf-8")
        try:
            return he.code, json.loads(err_body)
        except Exception:
            return he.code, err_body

def run_tests():
    print("Starting background test server on port", TEST_PORT)
    config = uvicorn.Config(app, host="127.0.0.1", port=TEST_PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    time.sleep(1.5)

    db: Session = SessionLocal()
    print("=" * 70)
    print("STARTING FARMER-DEALER-QR VERIFICATION TEST MATRIX")
    print("=" * 70)

    try:
        # -------------------------------------------------------------
        # STEP 1: Verify / Setup Procurement Centres
        # -------------------------------------------------------------
        print("\n[Step 1] Verifying / Setting up Procurement Centres...")
        bv = db.query(ProcurementCentre).filter(ProcurementCentre.code == "BV-05").first()
        if not bv:
            bv = ProcurementCentre(
                name="Bhimavaram Procurement Center",
                code="BV-05",
                location="APMC Yard, Somavaram Road",
                district="West Godavari",
                pincode="534201",
                supported_crops="Rice,Paddy,Cotton",
                is_active=True,
                daily_capacity=1000
            )
            db.add(bv)
            db.commit()
            db.refresh(bv)

        pk = db.query(ProcurementCentre).filter(ProcurementCentre.code == "PK-06").first()
        if not pk:
            pk = ProcurementCentre(
                name="Palakollu Procurement Center",
                code="PK-06",
                location="Market Yard, Bypass Road",
                district="West Godavari",
                pincode="534260",
                supported_crops="Rice,Paddy,Maize",
                is_active=True,
                daily_capacity=800
            )
            db.add(pk)
            db.commit()
            db.refresh(pk)

        # Ensure active slots exist for BV
        slot_bv = db.query(Slot).filter(Slot.centre_id == bv.id, Slot.is_active == True).first()
        if not slot_bv:
            slot_bv = Slot(
                centre_id=bv.id,
                date=date.today().strftime("%Y-%m-%d"),
                start_time="09:00",
                end_time="11:00",
                capacity=50,
                booked_count=0,
                is_active=True
            )
            db.add(slot_bv)
            db.commit()
            db.refresh(slot_bv)

        print(f"✓ Bhimavaram Centre ID: {bv.id} (crops: {bv.supported_crops})")
        print(f"✓ Palakollu Centre ID: {pk.id} (crops: {pk.supported_crops})")

        # -------------------------------------------------------------
        # STEP 2: Setup Dealers (Somu & Ravi @ Bhimavaram, Kumar @ Palakollu)
        # -------------------------------------------------------------
        print("\n[Step 2] Setting up Test Dealers (Somu, Ravi, Kumar)...")
        dealers_info = [
            ("Somu", "somu.test.dealer@agriportal.in", bv.id, "Sri Somu Traders", "LIC-BV-SOMU"),
            ("Ravi", "ravi.test.dealer@agriportal.in", bv.id, "Ravi Agro Agencies", "LIC-BV-RAVI"),
            ("Kumar", "kumar.test.dealer@agriportal.in", pk.id, "Kumar Cotton & Rice Traders", "LIC-PK-KUMAR"),
        ]

        dealer_tokens = {}
        dealer_users = {}

        for name, email, centre_id, biz_name, lic in dealers_info:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    name=name,
                    email=email,
                    phone=f"98{secrets.randbelow(90000000) + 10000000}",
                    role=UserRole.DEALER,
                    password_hash=get_password_hash("TestPass123!"),
                    is_email_verified=True
                )
                db.add(user)
                db.flush()

            dp = db.query(DealerProfile).filter(DealerProfile.user_id == user.id).first()
            if not dp:
                dp = DealerProfile(
                    user_id=user.id,
                    business_name=biz_name,
                    mobile_number=user.phone,
                    email=user.email,
                    address=f"Shop #{secrets.randbelow(50) + 1}, APMC Market Yard",
                    government_id_type="GSTIN",
                    government_id_number=f"37AAACT{secrets.randbelow(9000) + 1000}H1Z{secrets.randbelow(9)}",
                    license_number=lic,
                    status=DealerStatus.APPROVED,
                    assigned_centre_id=centre_id
                )
                db.add(dp)
            else:
                dp.status = DealerStatus.APPROVED
                dp.assigned_centre_id = centre_id
            db.commit()
            db.refresh(user)
            dealer_users[name] = user
            dealer_tokens[name] = create_access_token(data={"sub": user.email, "role": user.role, "user_id": user.id})
            print(f"✓ Dealer '{name}' approved at Centre ID {centre_id} ({biz_name})")

        # -------------------------------------------------------------
        # STEP 3: Test Dealer Registration Mandatory Centre & Address Validation
        # -------------------------------------------------------------
        print("\n[Step 3] Testing Dealer Registration Validation via API...")
        # A) Missing assigned_centre_id
        status, res_no_centre = api_request("POST", "/api/auth/register", data={
            "name": "Invalid Dealer",
            "email": "invalid.dealer1@test.com",
            "phone": "9876543210",
            "password": "Password123!",
            "role": "DEALER",
            "address": "123 Market St"
        })
        assert status == 400, f"Expected 400 for missing centre, got {status}"
        assert "Procurement Center selection is mandatory" in str(res_no_centre)
        print("✓ Registration rejected when Procurement Center is missing (HTTP 400)")

        # B) Missing address
        status, res_no_addr = api_request("POST", "/api/auth/register", data={
            "name": "Invalid Dealer 2",
            "email": "invalid.dealer2@test.com",
            "phone": "9876543211",
            "password": "Password123!",
            "role": "DEALER",
            "assigned_centre_id": bv.id,
            "address": ""
        })
        assert status == 400, f"Expected 400 for missing address, got {status}"
        assert "Address is required" in str(res_no_addr)
        print("✓ Registration rejected when Address is missing (HTTP 400)")

        # -------------------------------------------------------------
        # STEP 4: Setup Farmer Ramu
        # -------------------------------------------------------------
        print("\n[Step 4] Setting up Farmer Ramu...")
        farmer_email = "ramu.farmer.test@agriportal.in"
        ramu = db.query(User).filter(User.email == farmer_email).first()
        if not ramu:
            ramu = User(
                name="Ramu",
                email=farmer_email,
                phone="9848022338",
                role=UserRole.FARMER,
                password_hash=get_password_hash("FarmerPass123!"),
                is_email_verified=True
            )
            db.add(ramu)
            db.flush()

        fp = db.query(FarmerProfile).filter(FarmerProfile.user_id == ramu.id).first()
        if not fp:
            fp = FarmerProfile(
                user_id=ramu.id,
                aadhaar_last4="4499",
                village="Pedamiram",
                district="West Godavari",
                land_size_acres=5.0,
                bank_account_no="30891234567",
                bank_name="State Bank of India",
                ifsc_code="SBIN0001234"
            )
            db.add(fp)
        db.commit()
        db.refresh(ramu)

        # Clear any prior active assignments for Ramu to ensure clean test state
        db.query(FarmerDealerAssignment).filter(
            FarmerDealerAssignment.farmer_id == ramu.id,
            FarmerDealerAssignment.status == AssignmentStatus.ACTIVE
        ).update({"status": AssignmentStatus.CANCELLED})
        db.commit()

        ramu_token = create_access_token(data={"sub": ramu.email, "role": ramu.role, "user_id": ramu.id})
        print(f"✓ Farmer Ramu ready (ID: {ramu.id}, Phone: {ramu.phone})")

        # -------------------------------------------------------------
        # STEP 5: Test Product-filtered Centres & Centre-filtered Dealers
        # -------------------------------------------------------------
        print("\n[Step 5] Testing Product Filtering & Dealer Filtering APIs...")
        # Query centres for 'Rice'
        status, res_centres = api_request("GET", "/api/farmer/centres?crop=Rice", token=ramu_token)
        assert status == 200
        centre_ids = [c["id"] for c in res_centres]
        assert bv.id in centre_ids, "Bhimavaram should support Rice"
        assert pk.id in centre_ids, "Palakollu should support Rice"
        print(f"✓ GET /farmer/centres?crop=Rice returned {len(centre_ids)} centres (including Bhimavaram & Palakollu)")

        # Query dealers for Bhimavaram
        status, bv_dealers = api_request("GET", f"/api/farmer/dealers?centre_id={bv.id}", token=ramu_token)
        assert status == 200
        bv_dealer_names = [d["name"] for d in bv_dealers]
        assert "Somu" in bv_dealer_names, "Somu must be in Bhimavaram dealers list"
        assert "Ravi" in bv_dealer_names, "Ravi must be in Bhimavaram dealers list"
        assert "Kumar" not in bv_dealer_names, "Kumar (Palakollu) MUST NOT be in Bhimavaram dealers list"
        print(f"✓ GET /farmer/dealers?centre_id={bv.id} returned: {bv_dealer_names}")
        print("✓ Confirmed: Kumar from Palakollu is excluded from Bhimavaram dealer list!")

        # -------------------------------------------------------------
        # STEP 6: Farmer Ramu creates Assignment with Somu at Bhimavaram
        # -------------------------------------------------------------
        print("\n[Step 6] Farmer Ramu creating Assignment with Somu at Bhimavaram...")
        somu_user = dealer_users["Somu"]
        asgn_payload = {
            "centre_id": bv.id,
            "dealer_id": somu_user.id,
            "product_name": "Rice",
            "slot_id": slot_bv.id,
            "expected_quantity_quintals": 45.0
        }
        status, data = api_request("POST", "/api/farmer/create-assignment", data=asgn_payload, token=ramu_token)
        assert status == 200, f"Failed to create assignment: {data}"
        qr_token = data["qr_token"]
        booking_code = data["booking_code"]
        assignment_id = data["assignment_id"]
        print(f"✓ Assignment created! ID: {assignment_id}, Token: {data['token_number']}")
        print(f"  QR Token: {qr_token}")
        print(f"  Booking Code: {booking_code}")
        print(f"  Assigned Dealer: {data['dealer_name']} ({data['dealer_business']})")

        # Verify active assignment endpoint
        status, res_active = api_request("GET", "/api/farmer/active-assignment", token=ramu_token)
        assert status == 200
        assert res_active["has_active_assignment"] == True
        assert res_active["dealer_id"] == somu_user.id
        print("✓ Verified GET /api/farmer/active-assignment matches created assignment")

        # -------------------------------------------------------------
        # STEP 7: Strict QR Authorization Matrix
        # -------------------------------------------------------------
        print("\n[Step 7] STRICT QR AUTHORIZATION MATRIX TESTS:")

        # CASE A: Dealer Somu (Assigned Dealer) scans Ramu's QR
        status, res_somu_data = api_request("POST", "/api/dealer/scan-qr", data={"booking_code": qr_token}, token=dealer_tokens["Somu"])
        assert status == 200
        print(f"\n  [Case A] Dealer Somu (Assigned) scanning Ramu's QR:")
        print(f"    is_valid: {res_somu_data.get('is_valid')}")
        print(f"    message: {res_somu_data.get('message')}")
        assert res_somu_data.get("is_valid") == True, "Somu MUST be allowed to scan Ramu's QR pass"
        print("    --> RESULT: SUCCESSFUL AUTHORIZATION ✅")

        # CASE B: Dealer Ravi (Same centre Bhimavaram, but NOT assigned) scans Ramu's QR
        status, res_ravi_data = api_request("POST", "/api/dealer/scan-qr", data={"booking_code": qr_token}, token=dealer_tokens["Ravi"])
        assert status == 200
        print(f"\n  [Case B] Dealer Ravi (Same center Bhimavaram, NOT assigned) scanning Ramu's QR:")
        print(f"    is_valid: {res_ravi_data.get('is_valid')}")
        print(f"    message: {res_ravi_data.get('message')}")
        assert res_ravi_data.get("is_valid") == False, "Ravi MUST be rejected"
        assert "not authorized" in res_ravi_data.get("message", "").lower()
        print("    --> RESULT: STRICTLY REJECTED ❌ (Correctly blocked by server-side authorization)")

        # CASE C: Dealer Kumar (Different centre Palakollu, NOT assigned) scans Ramu's QR
        status, res_kumar_data = api_request("POST", "/api/dealer/scan-qr", data={"booking_code": qr_token}, token=dealer_tokens["Kumar"])
        assert status == 200
        print(f"\n  [Case C] Dealer Kumar (Different center Palakollu, NOT assigned) scanning Ramu's QR:")
        print(f"    is_valid: {res_kumar_data.get('is_valid')}")
        print(f"    message: {res_kumar_data.get('message')}")
        assert res_kumar_data.get("is_valid") == False, "Kumar MUST be rejected"
        assert "not authorized" in res_kumar_data.get("message", "").lower()
        print("    --> RESULT: STRICTLY REJECTED ❌ (Correctly blocked by server-side authorization)")

        # -------------------------------------------------------------
        # STEP 8: Dealer Portal "My Assigned Farmers" List
        # -------------------------------------------------------------
        print("\n[Step 8] Testing 'My Assigned Farmers' for Somu vs Ravi vs Kumar...")
        # Somu's list
        status, somu_farmers = api_request("GET", "/api/dealer/assigned-farmers", token=dealer_tokens["Somu"])
        assert status == 200
        somu_assigned_names = [f["farmer_name"] for f in somu_farmers]
        assert "Ramu" in somu_assigned_names, "Ramu must appear in Somu's assigned list"
        print(f"✓ Somu's assigned farmers list: {somu_assigned_names} (Ramu is present)")

        # Ravi's list
        status, ravi_farmers = api_request("GET", "/api/dealer/assigned-farmers", token=dealer_tokens["Ravi"])
        assert status == 200
        ravi_assigned_names = [f["farmer_name"] for f in ravi_farmers]
        assert "Ramu" not in ravi_assigned_names, "Ramu MUST NOT appear in Ravi's assigned list"
        print(f"✓ Ravi's assigned farmers list: {ravi_assigned_names} (Ramu is excluded)")

        # Kumar's list
        status, kumar_farmers = api_request("GET", "/api/dealer/assigned-farmers", token=dealer_tokens["Kumar"])
        assert status == 200
        kumar_assigned_names = [f["farmer_name"] for f in kumar_farmers]
        assert "Ramu" not in kumar_assigned_names, "Ramu MUST NOT appear in Kumar's assigned list"
        print(f"✓ Kumar's assigned farmers list: {kumar_assigned_names} (Ramu is excluded)")

        # -------------------------------------------------------------
        # STEP 9: Dealer Somu Processes Procurement
        # -------------------------------------------------------------
        print("\n[Step 9] Dealer Somu Processing Procurement & Weighment...")
        proc_payload = {
            "booking_code": booking_code,
            "actual_quantity_quintals": 44.5,
            "quality_grade": "Grade A",
            "rate_per_quintal": 2320.0,
            "weighment_slip_no": f"SLIP-BV-{secrets.token_hex(3).upper()}"
        }
        status, proc_data = api_request("POST", "/api/dealer/process-procurement", data=proc_payload, token=dealer_tokens["Somu"])
        assert status == 200, f"Failed procurement: {proc_data}"
        print(f"✓ Procurement recorded! Total Amount: ₹{proc_data['total_amount']:,.2f}")
        print(f"  Weighment Slip: {proc_data['weighment_slip_no']}")

        # Verify single-use pass: Scanning completed pass is rejected
        status, res_rescan = api_request("POST", "/api/dealer/scan-qr", data={"booking_code": qr_token}, token=dealer_tokens["Somu"])
        assert status == 200
        assert res_rescan["is_valid"] == False
        assert "already used" in res_rescan["message"].lower() or "completed" in res_rescan["message"].lower()
        print("✓ Re-scanning already completed QR pass correctly returns ALREADY USED / REJECTED")

        # -------------------------------------------------------------
        # STEP 10: Admin Assignments Hierarchy
        # -------------------------------------------------------------
        print("\n[Step 10] Testing Admin Farmer-Dealer Assignments Endpoint...")
        admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if not admin_user:
            admin_user = User(
                name="Chief Procurement Officer",
                email="admin@agriportal.in",
                phone="9999900000",
                role=UserRole.ADMIN,
                password_hash=get_password_hash("AdminSecret2026!"),
                is_email_verified=True
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)

        admin_token = create_access_token(data={"sub": admin_user.email, "role": admin_user.role, "user_id": admin_user.id})
        status, all_asgns = api_request("GET", "/api/admin/farmer-dealer-assignments", token=admin_token)
        assert status == 200
        assert len(all_asgns) > 0

        match = next((a for a in all_asgns if a["assignment_id"] == assignment_id), None)
        assert match is not None, "Created assignment must appear in Admin assignments list"
        print(f"✓ Admin verified relationship:")
        print(f"    Farmer: {match['farmer_name']}")
        print(f"    Product: {match['product_name']}")
        print(f"    Procurement Centre: {match['centre_name']}")
        print(f"    Assigned Dealer: {match['dealer_name']} ({match['dealer_business']})")
        print(f"    Status: {match['status']}")
        print(f"    Date/Time: {match['created_at']}")

        print("\n" + "=" * 70)
        print("ALL TESTS PASSED SUCCESSFULLY! (10/10 CHECKPOINTS VERIFIED)")
        print("=" * 70)

    finally:
        db.close()
        server.should_exit = True

if __name__ == "__main__":
    run_tests()
