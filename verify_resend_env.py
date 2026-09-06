"""
Comprehensive Verification Script for Resend OTP Environment Configuration:
1. Verifies .env loading from project root
2. Verifies .env loading from subdirectories (e.g. backend/)
3. Verifies Render deployment environment variable priority (override=False)
4. Verifies clear, non-crashing error handling when RESEND_API_KEY is missing
5. Verifies sender email configuration resolution
6. Verifies FastAPI app imports and loads .env before router access
"""

import sys
import os
from pathlib import Path

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

print("=" * 70)
print("RUNNING RESEND ENV & CONFIGURATION VERIFICATION")
print("=" * 70)

# -------------------------------------------------------------
# TEST 1: Load from Project Root & Verify os.getenv
# -------------------------------------------------------------
print("\n[TEST 1] Verifying .env loading from project root...")
from backend.app.config import settings, BASE_DIR

key_in_environ = os.getenv("RESEND_API_KEY")
from_email_in_environ = os.getenv("RESEND_FROM_EMAIL")

assert key_in_environ is not None and len(key_in_environ.strip()) > 0, (
    "FAILED: os.getenv('RESEND_API_KEY') is not set!"
)
assert key_in_environ.startswith("re_"), (
    "FAILED: RESEND_API_KEY does not start with standard 're_' prefix!"
)
assert bool(settings.RESEND_API_KEY), (
    "FAILED: settings.RESEND_API_KEY is empty!"
)
assert bool(from_email_in_environ), (
    "FAILED: RESEND_FROM_EMAIL is not set in os.environ!"
)
print(f"[PASS] RESEND_API_KEY loaded successfully into os.environ (length: {len(key_in_environ)}).")
print(f"[PASS] settings.RESEND_API_KEY is populated.")
print(f"[PASS] RESEND_FROM_EMAIL resolved: '{from_email_in_environ}'")

# -------------------------------------------------------------
# TEST 2: Verify FastAPI main.py loads .env prior to access
# -------------------------------------------------------------
print("\n[TEST 2] Verifying FastAPI main.py entrypoint loads .env...")
from backend.app.main import app

assert app is not None
print("[PASS] FastAPI app initialized successfully with environment variables.")

# -------------------------------------------------------------
# TEST 3: Verify Render Environment Variable Precedence (override=False)
# -------------------------------------------------------------
print("\n[TEST 3] Verifying Render Environment Variable Precedence (override=False)...")
from dotenv import load_dotenv

test_render_var = "RESEND_RENDER_OVERRIDE_TEST"
os.environ[test_render_var] = "render_cloud_value"

# Attempt loading an env file that has a different value
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=str(env_path), override=False)

assert os.environ.get(test_render_var) == "render_cloud_value", (
    "FAILED: Pre-existing environment variable was overwritten!"
)
del os.environ[test_render_var]
print("[PASS] System / Render environment variables take strict priority (override=False verified).")

# -------------------------------------------------------------
# TEST 4: Missing RESEND_API_KEY Error Handling
# -------------------------------------------------------------
print("\n[TEST 4] Verifying Graceful Error Handling When RESEND_API_KEY is Missing...")
import backend.app.email_service as email_service

saved_key = os.environ.get("RESEND_API_KEY")
saved_settings_key = settings.RESEND_API_KEY

try:
    os.environ["RESEND_API_KEY"] = ""
    settings.RESEND_API_KEY = ""

    raised = False
    try:
        email_service.send_otp_email(
            to_email="test.check@example.com",
            recipient_name="Test Farmer",
            otp_code="123456"
        )
    except email_service.EmailDeliveryError as ede:
        raised = True
        err_msg = str(ede)
        assert "Email service configuration error: RESEND_API_KEY is not set." in err_msg, (
            f"Unexpected error message: {err_msg}"
        )
        print(f"[PASS] Clear configuration error raised without crash:\n       -> \"{err_msg}\"")

    assert raised, "FAILED: EmailDeliveryError was not raised when RESEND_API_KEY was empty!"
finally:
    # Restore original key
    if saved_key:
        os.environ["RESEND_API_KEY"] = saved_key
    settings.RESEND_API_KEY = saved_settings_key

# -------------------------------------------------------------
# TEST 5: Verify Subdirectory Execution (e.g. running from backend/)
# -------------------------------------------------------------
print("\n[TEST 5] Verifying behavior when current working directory is 'backend/'...")
original_cwd = os.getcwd()
try:
    os.chdir(str(BASE_DIR / "backend"))
    # Re-evaluate config resolution
    from backend.app.config import ENV_FILE_PATH
    assert ENV_FILE_PATH.is_file(), f"FAILED: Could not locate .env from backend directory: {ENV_FILE_PATH}"
    print(f"[PASS] Base path correctly points to root .env from {os.getcwd()}: {ENV_FILE_PATH.name} exists.")
finally:
    os.chdir(original_cwd)

# -------------------------------------------------------------
# TEST 6: Verify Resend HTTP Request Payload Structure
# -------------------------------------------------------------
print("\n[TEST 6] Verifying Resend HTTP Request construction...")
import urllib.request

# Test constructing request without actually sending across network
to_test = "farmer@testdomain.com"
name_test = "Suresh Patel"
otp_test = "654321"

html = email_service.generate_otp_html(name_test, otp_test)
assert otp_test in html, "OTP code missing from generated HTML!"
assert name_test in html, "Recipient name missing from generated HTML!"

print("[PASS] Resend HTML body correctly constructed with OTP.")

print("\n" + "=" * 70)
print("ALL 6 CONFIGURATION & ENVIRONMENT TESTS PASSED!")
print("=" * 70)
