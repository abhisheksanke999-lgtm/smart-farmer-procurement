"""
Comprehensive Automated Test Suite for Mandatory Email OTP Farmer Registration
Uses Python Standard Library urllib.request against a live Uvicorn background server.
Verifies all requirements:
1. Deferral of account creation until OTP verification
2. Field validation (name, email, phone, password, existing email)
3. 6-digit OTP generation and dispatch
4. Hashed storage of OTP (never plain text)
5. Server-side bypass prevention (login & verify-email blocked)
6. Incorrect OTP rejection & attempts decrement
7. Max attempts lockout (5 attempts limit)
8. Resend OTP with cooldown and previous OTP invalidation
9. Expired OTP rejection
10. Successful verification creating User (is_email_verified=True), FarmerProfile, and JWT
11. Clean deletion of pending record to prevent replay
12. Regression testing: Admin login, Dealer registration, and existing Farmer login unaffected
"""

import sys
import os
import json
import time
import threading
import urllib.request
import urllib.error
from datetime import datetime, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import uvicorn
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models import User, FarmerProfile, PendingFarmerRegistration, UserRole, Notification, AuditLog
from backend.app.routers.auth import hash_otp
import backend.app.email_service as email_service

TEST_PORT = 8009
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"

class Response:
    def __init__(self, status_code, data, raw_text):
        self.status_code = status_code
        self._data = data
        self.text = raw_text

    def json(self):
        if isinstance(self._data, dict) or isinstance(self._data, list):
            return self._data
        return json.loads(self.text)

class HttpClient:
    def __init__(self, base_url):
        self.base_url = base_url

    def post(self, path, json=None, headers=None):
        return self._send("POST", path, json_data=json, headers=headers)

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
    print("[TEST SUITE] RUNNING EMAIL OTP FARMER REGISTRATION COMPREHENSIVE SUITE")
    print("=" * 70)

    # Start test server in background thread
    config = uvicorn.Config(app, host="127.0.0.1", port=TEST_PORT, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    time.sleep(1.5)

    db = SessionLocal()

    test_email = "test.farmer.otp@example.com"
    test_password = "SecurePassword@2026"
    test_name = "Ramesh Farmer"
    test_phone = "9876543210"

    # Cleanup any leftovers from prior runs
    prior_u = db.query(User).filter(User.email == test_email).first()
    if prior_u:
        db.query(Notification).filter(Notification.user_id == prior_u.id).delete()
        db.query(AuditLog).filter(AuditLog.actor_id == prior_u.id).delete()
        db.query(FarmerProfile).filter(FarmerProfile.user_id == prior_u.id).delete()
        db.delete(prior_u)
    db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == test_email).delete()
    db.commit()


    captured_otps = []
    import backend.app.routers.auth as auth_router
    original_send_otp_email = auth_router.send_otp_email

    def mock_send_otp_email(to_email, recipient_name, otp_code):
        captured_otps.append(otp_code)
        return original_send_otp_email(to_email, recipient_name, otp_code)

    auth_router.send_otp_email = mock_send_otp_email

    try:
        # TEST 1: Field Validations
        print("\n[TEST 1] Testing Registration Field Validations...")
        
        # Name too short
        r = client.post("/api/auth/register", json={
            "name": "A", "email": test_email, "phone": test_phone, "password": test_password, "role": "FARMER"
        })
        assert r.status_code == 400, f"Expected 400 for short name, got {r.status_code}"
        assert "Full Name must be at least 2 characters" in r.json()["detail"]

        # Phone too short
        r = client.post("/api/auth/register", json={
            "name": test_name, "email": test_email, "phone": "123", "password": test_password, "role": "FARMER"
        })
        assert r.status_code == 400, f"Expected 400 for short phone, got {r.status_code}"
        assert "at least 10 digits" in r.json()["detail"]

        # Password too short
        r = client.post("/api/auth/register", json={
            "name": test_name, "email": test_email, "phone": test_phone, "password": "123", "role": "FARMER"
        })
        assert r.status_code == 400, f"Expected 400 for short password, got {r.status_code}"
        assert "at least 6 characters" in r.json()["detail"]

        # Existing email check (admin email)
        r = client.post("/api/auth/register", json={
            "name": test_name, "email": "abhisheksanke999@gmail.com", "phone": test_phone, "password": test_password, "role": "FARMER"
        })
        assert r.status_code == 400, f"Expected 400 for existing email, got {r.status_code}"
        print("[PASS] Field validations passed.")

        # TEST 2: Farmer Registration Initiates OTP without Immediate Account Creation
        print("\n[TEST 2] Testing Farmer Registration Initiation & Account Creation Deferral...")
        r = client.post("/api/auth/register", json={
            "name": test_name,
            "email": test_email,
            "phone": test_phone,
            "password": test_password,
            "role": "FARMER",
            "village": "Kisan Nagar",
            "district": "Warangal",
            "land_size_acres": 4.5
        })
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["status"] == "pending_verification"
        assert data["email"] == test_email
        assert data["expires_in_seconds"] == 300
        assert data["attempts_left"] == 5
        # Ensure OTP is NOT in the API response (Requirement 12)
        assert "otp" not in data, "Security violation: OTP found in API response!"

        # CRITICAL VERIFICATION: No account in users or farmer_profiles
        db.expire_all()
        user_in_db = db.query(User).filter(User.email == test_email).first()
        assert user_in_db is None, "Security violation: User was created in database before OTP verification!"
        
        # Verify Pending record exists
        pending_rec = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == test_email).first()
        assert pending_rec is not None, "PendingFarmerRegistration record was not found!"
        assert pending_rec.attempts_left == 5
        assert len(captured_otps) == 1, "OTP was not dispatched via email service!"
        first_otp = captured_otps[-1]
        assert len(first_otp) == 6 and first_otp.isdigit(), f"Invalid OTP format: {first_otp}"
        
        # Verify OTP is stored as HASH, NEVER plaintext
        assert pending_rec.otp_hash != first_otp, "Security violation: Plaintext OTP stored in database!"
        assert len(pending_rec.otp_hash) == 64, "OTP hash is not a 64-char hex SHA256 string!"
        assert pending_rec.otp_hash == hash_otp(first_otp), "Stored hash does not match hash_otp()!"
        print("[PASS] Registration deferred: No account in users, OTP securely hashed in pending table.")

        # TEST 3: Server-side Bypass Prevention
        print("\n[TEST 3] Testing Server-Side Bypass Prevention...")
        # Try to login with pending credentials
        r_login = client.post("/api/auth/login", json={"email": test_email, "password": test_password})
        assert r_login.status_code == 401, f"Expected 401 Unauthorized, got {r_login.status_code}"

        # Try to call verify-email directly
        r_verify_email = client.post("/api/auth/verify-email", json={"email": test_email, "token": "dummy"})
        assert r_verify_email.status_code == 404, f"Expected 404 User not found, got {r_verify_email.status_code}"
        print("[PASS] Server-side bypass prevention verified.")

        # TEST 4: Incorrect OTP Rejection & Decrementing Attempts
        print("\n[TEST 4] Testing Incorrect OTP Rejection & Decrementing Attempts...")
        r_bad = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": "999999"})
        assert r_bad.status_code == 400, f"Expected 400 for bad OTP, got {r_bad.status_code}"
        assert "4 attempts remaining" in r_bad.json()["detail"]

        db.expire_all()
        pending_rec = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == test_email).first()
        assert pending_rec.attempts_left == 4, f"Expected 4 attempts left in DB, got {pending_rec.attempts_left}"
        print("[PASS] Incorrect OTP rejected and attempts decremented.")

        # TEST 5: Maximum Attempts Lockout
        print("\n[TEST 5] Testing Max Verification Attempts Lockout...")
        for expected_left in [3, 2, 1]:
            r_bad = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": "000000"})
            assert r_bad.status_code == 400
        
        # 5th bad attempt -> 0 left
        r_lockout = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": "000000"})
        assert r_lockout.status_code == 429
        assert "Maximum attempts exceeded" in r_lockout.json()["detail"]

        # Even with correct OTP now, must be locked out until resend
        r_locked = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": first_otp})
        assert r_locked.status_code == 429
        print("[PASS] Max attempts lockout enforced.")

        # TEST 6: Resend OTP Cooldown & Invalidation of Previous OTP
        print("\n[TEST 6] Testing Resend OTP Cooldown & Invalidation of Previous OTP...")
        # Check cooldown (sent just moments ago)
        r_cooldown = client.post("/api/auth/resend-otp", json={"email": test_email})
        assert r_cooldown.status_code == 429, f"Expected 429 Cooldown, got {r_cooldown.status_code}"
        assert "seconds before requesting a new OTP" in r_cooldown.json()["detail"]

        # Fast-forward last_sent_at by 31 seconds to test successful resend
        db.expire_all()
        pending_rec = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == test_email).first()
        pending_rec.last_sent_at = datetime.utcnow() - timedelta(seconds=35)
        db.commit()

        # Resend OTP
        r_resend = client.post("/api/auth/resend-otp", json={"email": test_email})
        assert r_resend.status_code == 200, f"Expected 200, got {r_resend.status_code}: {r_resend.text}"
        assert len(captured_otps) == 2, "New OTP was not dispatched!"
        second_otp = captured_otps[-1]
        assert "otp" not in r_resend.json(), "Security violation: OTP exposed in resend response!"

        # Verify old OTP is invalidated
        db.expire_all()
        pending_rec = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == test_email).first()
        assert pending_rec.otp_hash == hash_otp(second_otp), "Pending record hash not updated to new OTP!"
        assert pending_rec.attempts_left == 5, "Attempts not reset on resend!"
        
        # Test old OTP fails
        r_old = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": first_otp})
        assert r_old.status_code == 400, "Old invalidated OTP should not be accepted!"
        print("[PASS] Resend OTP properly invalidated prior code and reset attempts.")

        # TEST 7: Expired OTP Rejection
        print("\n[TEST 7] Testing Expired OTP Rejection...")
        pending_rec.otp_expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()

        r_expired = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": second_otp})
        assert r_expired.status_code == 400
        assert "Verification code has expired" in r_expired.json()["detail"]
        print("[PASS] Expired OTP rejected.")

        # TEST 8: Successful OTP Verification & Account Creation
        print("\n[TEST 8] Testing Successful OTP Verification & Account Activation...")
        # Reset expiration to future
        pending_rec.otp_expires_at = datetime.utcnow() + timedelta(minutes=5)
        db.commit()

        r_verify = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": second_otp})
        assert r_verify.status_code == 200, f"Expected 200, got {r_verify.status_code}: {r_verify.text}"
        res_data = r_verify.json()
        assert res_data["status"] == "success"
        assert res_data["is_verified"] is True
        assert "access_token" in res_data
        assert res_data["user"]["email"] == test_email
        assert res_data["user"]["role"] == "FARMER"
        assert res_data["user"]["is_email_verified"] is True

        # Verify User and FarmerProfile are now created in database
        db.expire_all()
        user = db.query(User).filter(User.email == test_email).first()
        assert user is not None, "User record was not created after valid OTP!"
        assert user.is_email_verified is True
        assert user.farmer_profile is not None, "FarmerProfile was not created!"
        assert user.farmer_profile.village == "Kisan Nagar"
        assert user.farmer_profile.district == "Warangal"
        assert user.farmer_profile.land_size_acres == 4.5

        # Verify PendingFarmerRegistration record is deleted
        pending_after = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == test_email).first()
        assert pending_after is None, "Pending record was not deleted after verification!"

        # Verify JWT Token allows calling protected endpoints
        token = res_data["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}
        r_me = client.get("/api/auth/me", headers=auth_headers)
        assert r_me.status_code == 200
        assert r_me.json()["email"] == test_email
        assert r_me.json()["is_email_verified"] is True

        r_centres = client.get("/api/farmer/centres", headers=auth_headers)
        assert r_centres.status_code == 200
        print("[PASS] Farmer account created, email verified, pending record cleared, and token valid.")

        # TEST 9: Regression Tests (Admin, Dealer, Seeded Farmer)
        print("\n[TEST 9] Testing Existing Functionality & Regression Check...")
        # Admin Login
        r_admin = client.post("/api/auth/login", json={"email": "abhisheksanke999@gmail.com", "password": "AdminPass@123"})
        assert r_admin.status_code == 200, "Admin login broken!"
        admin_token = r_admin.json()["access_token"]
        r_stats = client.get("/api/admin/dashboard-stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert r_stats.status_code == 200, "Admin stats broken!"

        # Seeded Farmer Login
        r_farmer = client.post("/api/auth/login", json={"email": "ramu.farmer@example.com", "password": "FarmerPass@123"})
        assert r_farmer.status_code == 200, "Existing farmer login broken!"

        # Seeded Dealer Login
        r_dealer = client.post("/api/auth/login", json={"email": "dealer.approved@example.com", "password": "DealerPass@123"})
        assert r_dealer.status_code == 200, "Existing dealer login broken!"

        print("[PASS] All regression tests passed.")

    finally:
        server.should_exit = True
        auth_router.send_otp_email = original_send_otp_email
        # Clean up test user
        test_u = db.query(User).filter(User.email == test_email).first()
        if test_u:
            db.query(Notification).filter(Notification.user_id == test_u.id).delete()
            db.query(AuditLog).filter(AuditLog.actor_id == test_u.id).delete()
            db.query(FarmerProfile).filter(FarmerProfile.user_id == test_u.id).delete()
            db.delete(test_u)
        db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == test_email).delete()
        db.commit()
        db.close()


    print("\n" + "=" * 70)
    print("SUCCESS: ALL TESTS PASSED! EMAIL OTP FARMER REGISTRATION SYSTEM FULLY VERIFIED.")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
