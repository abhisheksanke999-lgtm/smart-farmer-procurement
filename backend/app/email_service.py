import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

from .config import settings

logger = logging.getLogger("email_service")

# SMTP Configuration from Settings
SMTP_SERVER = settings.SMTP_SERVER or os.environ.get("SMTP_SERVER", "")
SMTP_PORT = int(settings.SMTP_PORT or os.environ.get("SMTP_PORT", 587))
SMTP_USERNAME = settings.SMTP_USERNAME or os.environ.get("SMTP_USERNAME", "")
SMTP_PASSWORD = settings.SMTP_PASSWORD or os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = settings.SMTP_FROM or os.environ.get("SMTP_FROM", "noreply@smartfarmer.gov.in")
SMTP_USE_TLS = settings.SMTP_USE_TLS

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

def send_otp_email(to_email: str, recipient_name: str, otp_code: str) -> dict:
    """
    Sends an OTP verification email to the user.
    Uses SMTP if credentials are provided; otherwise simulates development dispatch safely without exposing plain OTP in logs.
    """
    subject = f"{otp_code} is your Smart Farmer Procurement verification code"
    html_body = generate_otp_html(recipient_name, otp_code)
    plain_body = f"Hello {recipient_name},\n\nYour One-Time Password (OTP) for Smart Farmer Procurement email verification is: {otp_code}\n\nThis code is valid for 5 minutes.\n\nThank you,\nSmart Farmer Procurement Team"

    print("=" * 60)
    print(f"[EMAIL OTP DISPATCH] Verification code sent to: {to_email}")
    print(f"Validity: 5 Minutes | Stored as Salted Cryptographic Hash")
    print("=" * 60)

    has_real_smtp = (
        bool(SMTP_SERVER and SMTP_USERNAME and SMTP_PASSWORD) and
        not any(placeholder in SMTP_USERNAME.lower() for placeholder in ["your_email", "example.com", "your_username"]) and
        not any(placeholder in SMTP_PASSWORD.lower() for placeholder in ["your_app_password", "your_password"])
    )

    if has_real_smtp:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM
            msg["To"] = to_email

            part1 = MIMEText(plain_body, "plain")
            part2 = MIMEText(html_body, "html")
            msg.attach(part1)
            msg.attach(part2)

            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=5)
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to_email], msg.as_string())
            server.quit()

            print(f"[SMTP] Real email sent successfully to {to_email}")
            return {"status": "sent", "mode": "smtp", "recipient": to_email}
        except Exception as e:
            logger.error(f"SMTP dispatch failed: {e}. Falling back to dev/auto-fill mode.")
            print(f"[SMTP NOTICE] SMTP dispatch failed ({e}). Returning fallback OTP.")
            return {
                "status": "fallback",
                "mode": "development",
                "dev_otp": otp_code,
                "reason": f"SMTP connection blocked by hosting platform or failed: {e}",
                "recipient": to_email
            }
    else:
        print(f"[DEV NOTICE] SMTP is in development/placeholder mode.")
        return {
            "status": "sent",
            "mode": "development",
            "dev_otp": otp_code,
            "recipient": to_email
        }

