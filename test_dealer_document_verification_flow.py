import json
import urllib.request
import urllib.error
import random
import string
import time
from backend.app.database import SessionLocal
from backend.app.models import User, ProcurementCentre, Category, DealerProfile, DealerStatus, PendingFarmerRegistration
from backend.app.auth import create_access_token

def random_str(n=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))

def main():
    base_url = "http://127.0.0.1:8000"
    print("====================================================================")
    print("STARTING DEALER DOCUMENT UPLOAD & ADMIN VERIFICATION E2E TEST SUITE")
    print("====================================================================")

    # 0. Health check
    for _ in range(10):
        try:
            with urllib.request.urlopen(f"{base_url}/api/auth/categories") as resp:
                if resp.status == 200:
                    break
        except Exception:
            time.sleep(1)

    db = SessionLocal()
    admin = db.query(User).filter(User.role == "ADMIN").first()
    assert admin is not None, "Admin user must exist in database"
    admin_token = create_access_token({"sub": admin.email, "role": admin.role, "id": admin.id})

    # Find active centre and category
    centre = db.query(ProcurementCentre).filter(ProcurementCentre.is_active == True).first()
    category = db.query(Category).filter(Category.status == "ACTIVE").first()
    assert centre is not None and category is not None
    centre_id = centre.id
    category_id = category.id
    db.close()

    # 1. Prepare Dealer registration with 6 mandatory documents
    dealer_email = f"dealer_docs_{random_str(6)}@agriportal.in"
    dealer_password = "Password@123"
    dealer_name = "Sri Ranganatha Agro Traders"
    dealer_phone = f"98{random.randint(10000000, 99999999)}"
    dealer_license = f"LIC-2026-{random.randint(100, 999)}"
    dealer_gstin = f"36AAACG{random.randint(1000, 9999)}H1Z1"

    uploaded_docs = {
        "aadhaar_card": {
            "document_key": "aadhaar_card",
            "document_name": "Aadhaar Card",
            "file_name": "Ranganatha_Aadhaar_Card.pdf",
            "file_type": "PDF Document",
            "file_size": "1.2 MB",
            "status": "UPLOADED",
            "uploaded_at": "10-Sep-2026 09:15 PM",
            "issuer": "UIDAI (Unique Identification Authority of India)",
            "document_number": "XXXX-XXXX-8921"
        },
        "pan_card": {
            "document_key": "pan_card",
            "document_name": "PAN Card",
            "file_name": "Ranganatha_PAN_Card.pdf",
            "file_type": "PDF Document",
            "file_size": "820 KB",
            "status": "UPLOADED",
            "uploaded_at": "10-Sep-2026 09:15 PM",
            "issuer": "Income Tax Department, Govt of India",
            "document_number": "AAACG4512F"
        },
        "dealer_license": {
            "document_key": "dealer_license",
            "document_name": "Dealer/Trader License",
            "file_name": "Ranganatha_APMC_Trade_License.pdf",
            "file_type": "PDF Document",
            "file_size": "2.4 MB",
            "status": "UPLOADED",
            "uploaded_at": "10-Sep-2026 09:15 PM",
            "issuer": "Department of Agricultural Marketing & APMC",
            "document_number": dealer_license
        },
        "business_reg": {
            "document_key": "business_reg",
            "document_name": "Business Registration Certificate",
            "file_name": "Ranganatha_GSTIN_Registration.pdf",
            "file_type": "PDF Document",
            "file_size": "1.8 MB",
            "status": "UPLOADED",
            "uploaded_at": "10-Sep-2026 09:15 PM",
            "issuer": "Goods and Services Tax Network (GSTN)",
            "document_number": dealer_gstin
        },
        "bank_proof": {
            "document_key": "bank_proof",
            "document_name": "Bank Account Proof",
            "file_name": "Ranganatha_Bank_Passbook.pdf",
            "file_type": "PDF Document",
            "file_size": "950 KB",
            "status": "UPLOADED",
            "uploaded_at": "10-Sep-2026 09:15 PM",
            "issuer": "State Bank of India (Commercial Mandi Branch)",
            "document_number": "A/C: 308911002341"
        },
        "address_proof": {
            "document_key": "address_proof",
            "document_name": "Address Proof",
            "file_name": "Ranganatha_APMC_Shop_Allotment.pdf",
            "file_type": "PDF Document",
            "file_size": "1.5 MB",
            "status": "UPLOADED",
            "uploaded_at": "10-Sep-2026 09:15 PM",
            "issuer": "Municipal Corporation / APMC Authority",
            "document_number": "PROP-APMC-942"
        }
    }

    reg_payload = {
        "name": dealer_name,
        "email": dealer_email,
        "phone": dealer_phone,
        "password": dealer_password,
        "confirm_password": dealer_password,
        "role": "DEALER",
        "business_name": dealer_name,
        "license_number": dealer_license,
        "government_id_type": "GSTIN",
        "government_id_number": dealer_gstin,
        "assigned_centre_id": centre_id,
        "category_id": category_id,
        "address": "Shop #8, Warangal APMC Market Yard",
        "verification_documents": uploaded_docs
    }

    # Step 1: Submit Registration
    req_reg = urllib.request.Request(
        f"{base_url}/api/auth/register",
        data=json.dumps(reg_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_reg) as resp:
        reg_res = json.loads(resp.read().decode())
        assert reg_res["status"] == "pending_verification"
        print(f"\n[PASS] Step 1: Dealer Registration submitted with 6 documents attached (Email: {dealer_email})")

    # Step 2: Retrieve OTP from database and verify
    db = SessionLocal()
    pending = db.query(PendingFarmerRegistration).filter(PendingFarmerRegistration.email == dealer_email).first()
    assert pending is not None, "Pending registration must exist"
    # We test with the verify-otp endpoint by looking up the pending record and completing OTP verification
    # For testing OTP hash, we can verify against the stored hash or use a fixed OTP in test
    from backend.app.routers.auth import hash_otp
    # Set a known test OTP "789123"
    test_otp = "789123"
    pending.otp_hash = hash_otp(test_otp)
    db.commit()
    db.close()

    req_otp = urllib.request.Request(
        f"{base_url}/api/auth/verify-otp",
        data=json.dumps({"email": dealer_email, "otp": test_otp}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_otp) as resp:
        otp_res = json.loads(resp.read().decode())
        assert otp_res["status"] == "success"
        dealer_token = otp_res["access_token"]
        dealer_user_data = otp_res["user"]
        assert dealer_user_data["dealer_status"] == "PENDING"
        assert "dealer_profile" in dealer_user_data
        assert "verification_documents" in dealer_user_data["dealer_profile"]
        docs_received = dealer_user_data["dealer_profile"]["verification_documents"]
        assert len(docs_received) == 6, f"Expected 6 documents, got {len(docs_received)}"
        print("[PASS] Step 2: OTP Verified. Dealer account created with status = PENDING and 6 documents persisted.")

    # Step 3: Verify Dealer Dashboard Access is BLOCKED (HTTP 403 Forbidden)
    req_dealer_dash = urllib.request.Request(
        f"{base_url}/api/dealer/assigned-farmers",
        headers={"Authorization": f"Bearer {dealer_token}"}
    )
    try:
        with urllib.request.urlopen(req_dealer_dash) as resp:
            assert False, "Pending dealer should NOT have access to dealer dashboard endpoints!"
    except urllib.error.HTTPError as e:
        assert e.code == 403
        error_body = json.loads(e.read().decode())
        print(f"[PASS] Step 3: Dealer Dashboard access is strictly BLOCKED (HTTP 403): {error_body.get('detail')}")

    # Step 4: Admin checks Pending Dealers and views uploaded documents
    req_dealers_list = urllib.request.Request(
        f"{base_url}/api/admin/dealers?status_filter=PENDING",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    with urllib.request.urlopen(req_dealers_list) as resp:
        pending_dealers = json.loads(resp.read().decode())
        target_dealer = next((d for d in pending_dealers if d["email"] == dealer_email), None)
        assert target_dealer is not None, f"Expected pending dealer {dealer_email} in Admin list"
        dealer_id = target_dealer["dealer_id"]
        assert target_dealer["status"] == "PENDING"
        assert len(target_dealer["verification_documents"]) == 6
        print(f"\n[PASS] Step 4: Admin found dealer #{dealer_id} in 'Registered Dealers -> Pending Verification'.")

    # Inspect complete dealer details & documents dossier
    req_dealer_details = urllib.request.Request(
        f"{base_url}/api/admin/dealers/{dealer_id}/details",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    with urllib.request.urlopen(req_dealer_details) as resp:
        details_res = json.loads(resp.read().decode())
        d_info = details_res["dealer"]
        docs_map = d_info["verification_documents"]
        print("[PASS] Admin successfully inspected 6 Uploaded Documents in Dossier:")
        for k, doc_obj in docs_map.items():
            print(f"  - [{doc_obj['document_name']}]: {doc_obj['file_name']} ({doc_obj['file_size']}) - Issuer: {doc_obj.get('issuer', 'APMC')}")

    # Step 5: Admin Rejects Dealer with reason
    rejection_reason_msg = "Trade license document is expired as of 31-Aug-2026; please upload current renewal certificate."
    req_reject = urllib.request.Request(
        f"{base_url}/api/admin/update-dealer-status",
        data=json.dumps({
            "dealer_id": dealer_id,
            "status": "REJECTED",
            "rejection_reason": rejection_reason_msg
        }).encode(),
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_reject) as resp:
        reject_res = json.loads(resp.read().decode())
        assert reject_res["status"] == "REJECTED"
        print(f"\n[PASS] Step 5: Admin Rejected Dealer. Reason: '{rejection_reason_msg}'")

    # Verify Dealer Profile shows REJECTED and rejection reason
    req_dealer_me = urllib.request.Request(
        f"{base_url}/api/auth/me",
        headers={"Authorization": f"Bearer {dealer_token}"}
    )
    with urllib.request.urlopen(req_dealer_me) as resp:
        me_res = json.loads(resp.read().decode())
        assert me_res["dealer_status"] == "REJECTED"
        assert me_res["dealer_profile"]["rejection_reason"] == rejection_reason_msg
        print(f"[PASS] Dealer profile displays exact rejection reason on login screen: '{me_res['dealer_profile']['rejection_reason']}'")

    # Dashboard access still blocked
    try:
        with urllib.request.urlopen(req_dealer_dash) as resp:
            assert False, "Rejected dealer should NOT have access to dealer dashboard!"
    except urllib.error.HTTPError as e:
        assert e.code == 403
        print("[PASS] Rejected dealer access remains blocked (HTTP 403).")

    # Step 6: Admin Approves Dealer
    req_approve = urllib.request.Request(
        f"{base_url}/api/admin/update-dealer-status",
        data=json.dumps({
            "dealer_id": dealer_id,
            "status": "APPROVED"
        }).encode(),
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_approve) as resp:
        approve_res = json.loads(resp.read().decode())
        assert approve_res["status"] == "APPROVED"
        print(f"\n[PASS] Step 6: Admin Approved Dealer #{dealer_id}.")

    # Verify Dealer Profile is now APPROVED and rejection reason cleared
    with urllib.request.urlopen(req_dealer_me) as resp:
        me_after = json.loads(resp.read().decode())
        assert me_after["dealer_status"] == "APPROVED"
        assert me_after["dealer_profile"]["rejection_reason"] is None
        print("[PASS] Dealer profile is now APPROVED (Active) with rejection reason cleared.")

    # Step 7: Dealer Dashboard is UNLOCKED and accessible (HTTP 200 OK)
    with urllib.request.urlopen(req_dealer_dash) as resp:
        assert resp.status == 200
        assigned_data = json.loads(resp.read().decode())
        print(f"[PASS] Step 7: Dealer Dashboard is UNLOCKED! Returned {len(assigned_data)} farmer bookings (HTTP 200 OK).")

    print("\n====================================================================")
    print("ALL DEALER DOCUMENT UPLOAD & ADMIN VERIFICATION TESTS PASSED 100%!")
    print("====================================================================")

if __name__ == "__main__":
    main()
