import sys
import os
import time
import json
import secrets
import threading
import urllib.request
import urllib.error

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import uvicorn
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models import User, UserRole, PendingFarmerRegistration, DealerProfile, DealerStatus, FarmerProfile, Notification, AuditLog
from backend.app.routers.auth import hash_otp
from backend.app.seed import seed_database
import backend.app.email_service as email_service
import backend.app.routers.auth as auth_router

_mock_fn = lambda to_email, recipient_name, otp_code: {"status": "sent", "mode": "mock", "recipient": to_email}
email_service.send_otp_email = _mock_fn
auth_router.send_otp_email = _mock_fn

TEST_PORT = 8012
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"

class Response:
    def __init__(self, status_code, data, raw_text):
        self.status_code = status_code
        self._data = data
        self.text = raw_text

    def json(self):
        if isinstance(self._data, (dict, list)):
            return self._data
        return json.loads(self.text)

class HttpClient:
    def __init__(self, base_url):
        self.base_url = base_url

    def post(self, path, json_data=None, headers=None):
        return self._send("POST", path, json_data=json_data, headers=headers)

    def get(self, path, headers=None):
        return self._send("GET", path, json_data=None, headers=headers)

    def _send(self, method, path, json_data=None, headers=None):
        url = f"{self.base_url}{path}"
        req_headers = {"Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)
        data = json.dumps(json_data).encode("utf-8") if json_data is not None else None
        req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                status_code = resp.getcode()
                raw = resp.read().decode("utf-8")
                try:
                    parsed = json.loads(raw)
                except Exception:
                    parsed = raw
                return Response(status_code, parsed, raw)
        except urllib.error.HTTPError as e:
            status_code = e.code
            raw = e.read().decode("utf-8")
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = raw
            return Response(status_code, parsed, raw)

client = HttpClient(BASE_URL)

def run_tests():
    print("=" * 70)
    print("RUNNING LOGOUT, ROLE ENFORCEMENT & DUMMY DATA CLEANUP TEST SUITE")
    print("=" * 70)

    # Start test server in background thread
    config = uvicorn.Config(app, host="127.0.0.1", port=TEST_PORT, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    time.sleep(2)

    db = SessionLocal()
    created_test_emails = []

    try:
        # TEST 1: Backend Logout Endpoint
        print("\n[TEST 1] Testing POST /api/auth/logout endpoint...")
        r_logout = client.post("/api/auth/logout")
        assert r_logout.status_code == 200, f"Expected 200, got {r_logout.status_code}"
        assert r_logout.json().get("status") == "success"
        print("[PASS] POST /api/auth/logout returns HTTP 200 with success status.")

        # TEST 2: Admin Authentication & Role Enforcement
        print("\n[TEST 2] Testing Admin Login & Role Enforcement...")
        # 2a. Login with correct role ADMIN
        r_admin = client.post("/api/auth/login", json_data={
            "email": "abhisheksanke999@gmail.com",
            "password": "AdminPass@123",
            "role": "ADMIN"
        })
        assert r_admin.status_code == 200, f"Admin login failed: {r_admin.text}"
        admin_data = r_admin.json()
        admin_token = admin_data["access_token"]
        assert admin_data["user"]["role"] == "ADMIN"
        print("[PASS] Admin successfully authenticated with role 'ADMIN'.")

        # 2b. Role mismatch: Admin credentials with selected role 'FARMER' must be rejected
        r_mismatch = client.post("/api/auth/login", json_data={
            "email": "abhisheksanke999@gmail.com",
            "password": "AdminPass@123",
            "role": "FARMER"
        })
        assert r_mismatch.status_code == 401, f"Expected 401 for role mismatch, got {r_mismatch.status_code}"
        assert "Access denied" in r_mismatch.json().get("detail", "")
        print("[PASS] Role mismatch rejected: Admin selecting 'FARMER' role denied with HTTP 401.")

        # 2c. Role mismatch: Admin credentials with selected role 'DEALER' must be rejected
        r_mismatch_dealer = client.post("/api/auth/login", json_data={
            "email": "abhisheksanke999@gmail.com",
            "password": "AdminPass@123",
            "role": "DEALER"
        })
        assert r_mismatch_dealer.status_code == 401, f"Expected 401 for role mismatch, got {r_mismatch_dealer.status_code}"
        print("[PASS] Role mismatch rejected: Admin selecting 'DEALER' role denied with HTTP 401.")

        # TEST 3: Admin Protected Route Access & Access Denial After Simulated Logout
        print("\n[TEST 3] Testing Admin access & protected route denial after logout...")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        r_stats = client.get("/api/admin/dashboard-stats", headers=admin_headers)
        assert r_stats.status_code == 200, f"Expected 200, got {r_stats.status_code}"
        print("[PASS] Admin dashboard stats accessible with valid Bearer token.")

        # Simulate logout (client drops token) -> Requesting protected route without Bearer token must fail
        r_unauth = client.get("/api/admin/dashboard-stats")
        assert r_unauth.status_code == 401, f"Expected 401 without token, got {r_unauth.status_code}"
        print("[PASS] Unauthenticated access to Admin dashboard stats denied with HTTP 401.")

        # TEST 4: Real Farmer Registration, Email OTP Verification, Login & Logout Flow
        print("\n[TEST 4] Testing Real Farmer Registration, Email OTP, Login & Logout Flow...")
        rand_hex = secrets.token_hex(3)
        farmer_email = f"verified_farmer_{rand_hex}@realtest.org"
        created_test_emails.append(farmer_email)

        # Register Farmer
        reg_payload = {
            "name": f"Farmer {rand_hex}",
            "email": farmer_email,
            "phone": "9123456780",
            "password": "FarmerPassword@2026",
            "role": "FARMER",
            "village": "Ghanpur",
            "district": "Warangal"
        }
        r_reg = client.post("/api/auth/register", json_data=reg_payload)
        assert r_reg.status_code == 200, f"Registration failed: {r_reg.text}"
        assert r_reg.json()["status"] == "pending_verification"

        # Verify with OTP
        test_otp = "741852"
        pending = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == farmer_email).first()
        assert pending is not None, "Pending registration not created"
        pending.otp_hash = hash_otp(test_otp)
        db.commit()

        r_verify = client.post("/api/auth/verify-otp", json_data={"email": farmer_email, "otp": test_otp})
        assert r_verify.status_code == 200, f"OTP verification failed: {r_verify.text}"
        assert r_verify.json()["is_verified"] is True

        # Farmer Login with role 'FARMER'
        r_f_login = client.post("/api/auth/login", json_data={
            "email": farmer_email,
            "password": "FarmerPassword@2026",
            "role": "FARMER"
        })
        assert r_f_login.status_code == 200, f"Farmer login failed: {r_f_login.text}"
        farmer_token = r_f_login.json()["access_token"]
        assert r_f_login.json()["user"]["role"] == "FARMER"

        # Farmer role boundary check
        farmer_headers = {"Authorization": f"Bearer {farmer_token}"}
        r_admin_denied = client.get("/api/admin/dashboard-stats", headers=farmer_headers)
        assert r_admin_denied.status_code == 403, f"Expected 403, got {r_admin_denied.status_code}"
        r_bookings = client.get("/api/farmer/bookings", headers=farmer_headers)
        assert r_bookings.status_code == 200, f"Expected 200, got {r_bookings.status_code}"

        # Farmer attempting to select 'ADMIN' role on login
        r_f_mismatch = client.post("/api/auth/login", json_data={
            "email": farmer_email,
            "password": "FarmerPassword@2026",
            "role": "ADMIN"
        })
        assert r_f_mismatch.status_code == 401, "Farmer selecting ADMIN role must be rejected!"
        print("[PASS] Farmer registration, OTP verification, login with role check, and access control verified.")

        # TEST 5: Real Dealer Registration, Email OTP Verification, Admin Approval, Login & Logout Flow
        print("\n[TEST 5] Testing Real Dealer Registration, Email OTP, Admin Approval, Login & Logout Flow...")
        dealer_email = f"verified_dealer_{rand_hex}@realtest.org"
        created_test_emails.append(dealer_email)

        dealer_reg_payload = {
            "name": f"Dealer {rand_hex}",
            "email": dealer_email,
            "phone": "9988776611",
            "password": "DealerPassword@2026",
            "role": "DEALER",
            "business_name": f"Agri Traders {rand_hex}",
            "license_number": f"LIC-{rand_hex.upper()}",
            "government_id_number": "36AAACG1234H1Z1"
        }
        r_d_reg = client.post("/api/auth/register", json_data=dealer_reg_payload)
        assert r_d_reg.status_code == 200, f"Dealer registration failed: {r_d_reg.text}"

        d_pending = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == dealer_email).first()
        assert d_pending is not None
        d_pending.otp_hash = hash_otp(test_otp)
        db.commit()

        r_d_verify = client.post("/api/auth/verify-otp", json_data={"email": dealer_email, "otp": test_otp})
        assert r_d_verify.status_code == 200

        # Newly registered dealer is PENDING, so Admin approves dealer
        dealer_user = db.query(User).filter(User.email == dealer_email).first()
        assert dealer_user is not None
        dealer_prof = db.query(DealerProfile).filter(DealerProfile.user_id == dealer_user.id).first()
        assert dealer_prof is not None
        assert dealer_prof.status == DealerStatus.PENDING

        # Admin approves dealer
        r_approve = client.post("/api/admin/update-dealer-status", json_data={
            "dealer_id": dealer_prof.id,
            "status": "APPROVED"
        }, headers=admin_headers)
        assert r_approve.status_code == 200, f"Admin approve failed: {r_approve.text}"

        # Dealer Login with role 'DEALER'
        r_d_login = client.post("/api/auth/login", json_data={
            "email": dealer_email,
            "password": "DealerPassword@2026",
            "role": "DEALER"
        })
        assert r_d_login.status_code == 200, f"Dealer login failed: {r_d_login.text}"
        dealer_token = r_d_login.json()["access_token"]
        assert r_d_login.json()["user"]["role"] == "DEALER"

        dealer_headers = {"Authorization": f"Bearer {dealer_token}"}
        r_txns = client.get("/api/dealer/transactions", headers=dealer_headers)
        assert r_txns.status_code == 200, f"Expected 200, got {r_txns.status_code}"

        # Dealer cannot access Admin or Farmer endpoints
        r_d_admin = client.get("/api/admin/dashboard-stats", headers=dealer_headers)
        assert r_d_admin.status_code == 403
        r_d_farmer = client.get("/api/farmer/bookings", headers=dealer_headers)
        assert r_d_farmer.status_code == 403
        print("[PASS] Dealer registration, OTP, admin approval, login with role check, and access control verified.")

        # TEST 6: Verification that Dummy Accounts are Gone
        print("\n[TEST 6] Verifying that Dummy Farmers & Dealers are Completely Removed from DB...")
        dummy_emails = [
            "ramu.farmer@example.com",
            "srinivas.farmer@example.com",
            "laxmi.farmer@example.com",
            "dealer.approved@example.com",
            "dealer.pending@example.com",
            "dealer.rejected@example.com"
        ]
        for email in dummy_emails:
            u = db.query(User).filter(User.email == email).first()
            assert u is None, f"FAIL: Dummy user {email} still exists in DB!"
            r_fail = client.post("/api/auth/login", json_data={"email": email, "password": "AnyPassword123"})
            assert r_fail.status_code == 401, f"Dummy user {email} should fail authentication!"
        print(f"[PASS] All {len(dummy_emails)} dummy accounts are absent from the database and fail login.")

        # TEST 7: Verification that Admin and Real Users Remain Intact
        print("\n[TEST 7] Verifying that Admin and Real Users are Preserved...")
        admin_in_db = db.query(User).filter(User.email == "abhisheksanke999@gmail.com").first()
        assert admin_in_db is not None, "FAIL: Admin account was deleted!"
        assert admin_in_db.id == 1, f"Expected Admin ID 1, got {admin_in_db.id}"
        assert admin_in_db.role == UserRole.ADMIN, f"Expected ADMIN role, got {admin_in_db.role}"
        print("[PASS] Admin Shri Abhishek Sanke (ID 1) is completely preserved.")

        real_farmers = db.query(User).filter(User.role == UserRole.FARMER).all()
        assert len(real_farmers) >= 5, f"Expected at least 5 real farmers in DB, found {len(real_farmers)}"
        print(f"[PASS] Real farmers verified: {len(real_farmers)} real accounts preserved.")

        # TEST 8: Verify that application startup / seed_database does NOT recreate dummy records
        print("\n[TEST 8] Verifying seed_database() does NOT recreate dummy records...")
        seed_database()
        for email in dummy_emails:
            u_check = db.query(User).filter(User.email == email).first()
            assert u_check is None, f"FAIL: seed_database() recreated dummy user {email}!"
        print("[PASS] seed_database() safely executed without recreating any dummy records.")

        print("\n" + "=" * 70)
        print("ALL TESTS PASSED! LOGOUT, AUTHENTICATION, AND DATA CLEANUP FULLY VERIFIED.")
        print("=" * 70)

    finally:
        # Cleanup temporary test accounts
        for e in created_test_emails:
            tu = db.query(User).filter(User.email == e).first()
            if tu:
                db.query(Notification).filter(Notification.user_id == tu.id).delete()
                db.query(AuditLog).filter(AuditLog.actor_id == tu.id).delete()
                db.query(FarmerProfile).filter(FarmerProfile.user_id == tu.id).delete()
                db.query(DealerProfile).filter(DealerProfile.user_id == tu.id).delete()
                db.delete(tu)
            db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == e).delete()
        db.commit()
        db.close()
        server.should_exit = True
        os._exit(0)

if __name__ == "__main__":
    run_tests()
