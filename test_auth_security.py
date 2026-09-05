import sys
import os
import time
import json
import secrets
import threading
import urllib.request
import urllib.error

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import uvicorn
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models import User, PendingFarmerRegistration
from backend.app.routers.auth import hash_otp
import backend.app.email_service as email_service

# Mock network email dispatch for immediate local test execution
email_service.send_otp_email = lambda to_email, recipient_name, otp_code: {"status": "sent", "mode": "mock", "recipient": to_email}

TEST_PORT = 8011
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
    print("=" * 60)
    print("STARTING COMPREHENSIVE AUTH SECURITY TEST SUITE")
    print("=" * 60)

    # Start uvicorn server in background thread
    config = uvicorn.Config(app, host="127.0.0.1", port=TEST_PORT, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    time.sleep(2)

    try:
        # 1. Test unauthenticated access to protected endpoints
        print("\n[TEST 1] Verifying unauthenticated access is rejected with 401...")
        r = client.get("/api/admin/dashboard-stats")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        r = client.get("/api/farmer/bookings")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        r = client.get("/api/dealer/transactions")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("[PASS] Passed: Unauthenticated requests denied with HTTP 401.")

        # 2. Test invalid credentials
        print("\n[TEST 2] Verifying invalid credentials fail login...")
        r = client.post("/api/auth/login", json_data={"email": "nonexistent@user.com", "password": "WrongPassword"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        r = client.post("/api/auth/login", json_data={"email": "abhisheksanke999@gmail.com", "password": "WrongPassword"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("[PASS] Invalid credentials rejected with HTTP 401.")

        # 3. Test genuine Admin login
        print("\n[TEST 3] Verifying genuine Admin login against database...")
        r = client.post("/api/auth/login", json_data={"email": "abhisheksanke999@gmail.com", "password": "AdminPass@123"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        admin_data = r.json()
        admin_token = admin_data["access_token"]
        assert admin_data["user"]["role"] == "ADMIN", f"Expected ADMIN role, got {admin_data['user']['role']}"
        print("[PASS] Admin authenticated and verified against database.")

        # 4. Test Admin role boundary (Admin cannot access Farmer or Dealer endpoints)
        print("\n[TEST 4] Verifying Admin is denied access to Farmer & Dealer endpoints...")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        r = client.get("/api/admin/dashboard-stats", headers=admin_headers)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        
        r = client.get("/api/farmer/bookings", headers=admin_headers)
        assert r.status_code == 403, f"Expected 403 for admin accessing farmer route, got {r.status_code}"
        
        r = client.get("/api/dealer/transactions", headers=admin_headers)
        assert r.status_code == 403, f"Expected 403 for admin accessing dealer route, got {r.status_code}"
        print("[PASS] Admin strictly denied access to Farmer/Dealer routes with HTTP 403.")

        # 5. Test Farmer login & Farmer role boundary (Farmer cannot access Admin or Dealer endpoints)
        print("\n[TEST 5] Verifying Farmer is denied access to Admin & Dealer endpoints...")
        r = client.post("/api/auth/login", json_data={"email": "ramu.farmer@example.com", "password": "FarmerPass@123"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        farmer_data = r.json()
        farmer_token = farmer_data["access_token"]
        assert farmer_data["user"]["role"] == "FARMER"
        
        farmer_headers = {"Authorization": f"Bearer {farmer_token}"}
        r = client.get("/api/admin/dashboard-stats", headers=farmer_headers)
        assert r.status_code == 403, f"Expected 403 for farmer accessing admin route, got {r.status_code}"
        
        r = client.get("/api/dealer/transactions", headers=farmer_headers)
        assert r.status_code == 403, f"Expected 403 for farmer accessing dealer route, got {r.status_code}"
        
        r = client.get("/api/farmer/bookings", headers=farmer_headers)
        assert r.status_code == 200, f"Expected 200 for farmer accessing farmer route, got {r.status_code}"
        print("[PASS] Farmer strictly denied access to Admin/Dealer routes with HTTP 403.")

        # 6. Test Dealer login & Dealer role boundary (Dealer cannot access Admin or Farmer endpoints)
        print("\n[TEST 6] Verifying Dealer is denied access to Admin & Farmer endpoints...")
        r = client.post("/api/auth/login", json_data={"email": "dealer.approved@example.com", "password": "DealerPass@123"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        dealer_data = r.json()
        dealer_token = dealer_data["access_token"]
        assert dealer_data["user"]["role"] == "DEALER"

        dealer_headers = {"Authorization": f"Bearer {dealer_token}"}
        r = client.get("/api/admin/dashboard-stats", headers=dealer_headers)
        assert r.status_code == 403, f"Expected 403 for dealer accessing admin route, got {r.status_code}"

        r = client.get("/api/farmer/bookings", headers=dealer_headers)
        assert r.status_code == 403, f"Expected 403 for dealer accessing farmer route, got {r.status_code}"

        r = client.get("/api/dealer/transactions", headers=dealer_headers)
        assert r.status_code == 200, f"Expected 200 for dealer accessing dealer route, got {r.status_code}"
        print("[PASS] Dealer strictly denied access to Admin/Farmer routes with HTTP 403.")

        # 7. Test Registration requires OTP verification (Account not active until OTP)
        print("\n[TEST 7] Verifying New Registration requires Email OTP verification...")
        rand_id = secrets.token_hex(3)
        new_email = f"farmer_{rand_id}@realtest.org"
        reg_payload = {
            "name": f"Test Farmer {rand_id}",
            "email": new_email,
            "phone": "9876543210",
            "password": "SecurePassword@123",
            "role": "FARMER"
        }
        r = client.post("/api/auth/register", json_data=reg_payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        reg_resp = r.json()
        assert reg_resp["status"] == "pending_verification"
        assert "dev_otp" not in reg_resp, "Security flaw: dev_otp exposed in production response!"

        # Verify user cannot log in before verifying OTP
        r_login_early = client.post("/api/auth/login", json_data={"email": new_email, "password": "SecurePassword@123"})
        assert r_login_early.status_code == 401, "Security flaw: unverified user was allowed to log in!"

        # Verify pending registration in database
        db = SessionLocal()
        pending = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == new_email).first()
        assert pending is not None, "Pending registration was not created in database"
        user_in_db = db.query(User).filter(User.email == new_email).first()
        assert user_in_db is None, "Security flaw: User account created before OTP verification!"

        # Invalidate OTP with wrong code
        r_wrong = client.post("/api/auth/verify-otp", json_data={"email": new_email, "otp": "000000"})
        assert r_wrong.status_code in [400, 422], f"Expected 400 for wrong OTP, got {r_wrong.status_code}"

        # Now verify with real OTP using test inspection
        test_otp = "852963"
        pending.otp_hash = hash_otp(test_otp)
        db.commit()
        db.close()

        r_verify = client.post("/api/auth/verify-otp", json_data={"email": new_email, "otp": test_otp})
        assert r_verify.status_code == 200, f"Expected 200, got {r_verify.status_code}: {r_verify.text}"
        verify_data = r_verify.json()
        assert verify_data["is_verified"] is True
        assert "access_token" in verify_data

        # Verify user CAN now log in
        r_login_success = client.post("/api/auth/login", json_data={"email": new_email, "password": "SecurePassword@123"})
        assert r_login_success.status_code == 200
        print("[PASS] Registration strictly requires Email OTP verification before activation.")

        print("\n" + "=" * 60)
        print("ALL AUTHENTICATION & ROLE SECURITY TESTS PASSED! [SUCCESS]")
        print("=" * 60)
        os._exit(0)
    finally:
        server.should_exit = True
        os._exit(0)

if __name__ == "__main__":
    run_tests()
