import os
import json
import urllib.request
import urllib.error
import logging
from typing import Dict, Any

from .config import settings

logger = logging.getLogger("email_service")

RESEND_API_URL = "https://api.resend.com/emails"

class EmailDeliveryError(Exception):
    """Raised when email delivery fails via the Resend HTTP API."""
    pass

def generate_otp_html(recipient_name: str, otp_code: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; }}
    .card {{ max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border-top: 6px solid #059669; }}
    .header {{ background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 25px; text-align: center; color: #ffffff; }}
    .content {{ padding: 30px 25px; text-align: center; color: #1f2937; }}
    .otp-box {{ display: inline-block; letter-spacing: 10px; font-size: 32px; font-weight: 800; color: #047857; background: #ecfdf5; border: 2px dashed #059669; padding: 14px 28px; border-radius: 12px; margin: 20px 0; font-family: monospace; }}
    .footer {{ background: #f9fafb; padding: 16px; text-align: center; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2 style="margin: 0; font-size: 20px;">🌾 Smart Farmer Procurement</h2>
      <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;">Email Verification Service</p>
    </div>
    <div class="content">
      <p style="font-size: 15px; margin-bottom: 10px;">Hello <strong>{recipient_name}</strong>,</p>
      <p style="font-size: 13px; color: #4b5563; line-height: 1.5;">
        Thank you for registering on the Smart Farmer Procurement platform. To complete your farmer registration and verify your email address, please enter the One-Time Password (OTP) below:
      </p>
      <div class="otp-box">{otp_code}</div>
      <p style="font-size: 12px; color: #dc2626; font-weight: 600; margin-top: 5px;">
        ⏰ This OTP is valid for 5 minutes.
      </p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 15px;">
        If you did not request this verification code, please ignore this email or report to government procurement support.
      </p>
    </div>
    <div class="footer">
      Official Government Agricultural Procurement & Digital Queue Portal
    </div>
  </div>
</body>
</html>"""


def send_otp_email(to_email: str, recipient_name: str, otp_code: str) -> Dict[str, Any]:
    """
    Sends an OTP verification email exclusively using the Resend HTTP REST API over HTTPS.
    NO SMTP or port connections are used.
    
    Raises EmailDeliveryError if dispatch fails.
    """
    # 1. Resolve environment configuration
    resend_api_key = (
        getattr(settings, "RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY", "")
    ).strip()
    
    from_email = (
        getattr(settings, "RESEND_FROM_EMAIL", "") or os.environ.get("RESEND_FROM_EMAIL", "") or "Smart Farmer <onboarding@resend.dev>"
    ).strip()

    if not resend_api_key:
        logger.error("[RESEND CONFIG ERROR] RESEND_API_KEY is not configured in the environment.")
        raise EmailDeliveryError("Email service configuration error: RESEND_API_KEY is not set.")

    if not from_email:
        logger.error("[RESEND CONFIG ERROR] RESEND_FROM_EMAIL is not configured in the environment.")
        raise EmailDeliveryError("Email service configuration error: RESEND_FROM_EMAIL is not set.")

    subject = "Your Smart Farmer Procurement Verification Code"
    html_body = generate_otp_html(recipient_name, otp_code)

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_body
    }

    req = urllib.request.Request(
        RESEND_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json",
            "User-Agent": "SmartFarmer-Procurement/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            status_code = response.getcode()
            response_body = response.read().decode("utf-8")
            data = json.loads(response_body) if response_body else {}
            
            logger.info(f"[RESEND SUCCESS] Email dispatched to recipient (status {status_code}, Resend ID: {data.get('id')})")
            return {
                "status": "sent",
                "id": data.get("id"),
                "recipient": to_email
            }

    except urllib.error.HTTPError as he:
        err_raw = he.read().decode("utf-8", errors="ignore")
        logger.error(f"[RESEND HTTP ERROR {he.code}] Failed to dispatch email to recipient.")
        try:
            err_json = json.loads(err_raw)
            err_msg = err_json.get("message", err_raw)
        except Exception:
            err_msg = err_raw

        # User-friendly explanation without leaking API keys or internal tokens
        if he.code == 401 or he.code == 403:
            if "testing emails" in err_msg.lower() or "only send" in err_msg.lower():
                raise EmailDeliveryError(
                    f"Email delivery restricted by Resend sandbox policy: {err_msg}"
                )
            raise EmailDeliveryError("Email authorization failed. Please check Resend API key and domain configuration.")
        elif he.code == 422:
            raise EmailDeliveryError(f"Email delivery rejected: {err_msg}")
        elif he.code == 429:
            raise EmailDeliveryError("Email delivery rate limit exceeded. Please try again in a few moments.")
        else:
            raise EmailDeliveryError(f"Email service error ({he.code}): {err_msg}")

    except urllib.error.URLError as ue:
        logger.error(f"[RESEND NETWORK ERROR] Connection failed: {ue.reason}")
        raise EmailDeliveryError("Network timeout connecting to email service. Please try again.")

    except Exception as e:
        logger.error(f"[RESEND UNEXPECTED ERROR] {e}")
        raise EmailDeliveryError("An unexpected error occurred while sending the verification code.")
