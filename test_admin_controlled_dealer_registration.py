import json
import urllib.request
import urllib.error
import random
import string
import time
from backend.app.database import SessionLocal
from backend.app.models import User, ProcurementCentre, Category, MSPRate, DealerProfile
from backend.app.auth import create_access_token

def random_string(n=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))

def main():
    base_url = "http://127.0.0.1:8000"
    print("================================================================")
    print("STARTING ADMIN-CONTROLLED DEALER REGISTRATION E2E TEST SUITE")
    print("================================================================")

    # Server readiness wait
    for _ in range(10):
        try:
            with urllib.request.urlopen(f"{base_url}/api/auth/categories") as resp:
                if resp.status == 200:
                    break
        except Exception:
            time.sleep(1)

    db = SessionLocal()
    admin = db.query(User).filter(User.role == "ADMIN").first()
    assert admin is not None, "Admin user required"
    admin_token = create_access_token({"sub": admin.email, "role": admin.role, "id": admin.id})

    # Ensure a test centre exists and is active
    test_centre = db.query(ProcurementCentre).first()
    if not test_centre:
        test_centre = ProcurementCentre(
            name="Test Mandi Centre",
            code=f"TMC-{random.randint(100,999)}",
            location="Test Location",
            district="Warangal",
            pincode="506001",
            contact_phone="9876543210",
            is_active=True
        )
        db.add(test_centre)
        db.commit()
        db.refresh(test_centre)
    else:
        test_centre.is_active = True
        db.commit()

    centre_id = test_centre.id
    centre_name = test_centre.name
    db.close()

    # 1. Admin adds a new crop via MSP Management: e.g. "Groundnut (Premium)"
    new_crop_name = f"Groundnut_{random_string(4).capitalize()}"
    new_msp_payload = {
        "crop_name": new_crop_name,
        "rate_per_quintal": 6783.0,
        "season": "Kharif 2026-27",
        "effective_from": "01-Oct-2026",
        "status": "ACTIVE",
        "notes": "Admin official MSP test entry"
    }

    req_create_msp = urllib.request.Request(
        f"{base_url}/api/admin/msp-rates",
        data=json.dumps(new_msp_payload).encode(),
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_create_msp) as resp:
        msp_res = json.loads(resp.read().decode())
        created_msp_id = msp_res["id"]
        print(f"\n[PASS] Admin Created Crop: {new_crop_name} (MSP ID: {created_msp_id})")

    # 2. Verify new crop immediately appears in public active categories for Dealer Registration
    req_cats = urllib.request.Request(f"{base_url}/api/auth/categories")
    with urllib.request.urlopen(req_cats) as resp:
        cats = json.loads(resp.read().decode())
        target_cat = next((c for c in cats if c["name"] == new_crop_name), None)
        assert target_cat is not None, f"Expected {new_crop_name} in active categories list!"
        cat_id = target_cat["id"]
        print(f"[PASS] Crop {new_crop_name} (Category ID: {cat_id}) is ACTIVE and available for Dealer Registration.")

    # 3. Verify active centres list contains our active centre
    req_centres = urllib.request.Request(f"{base_url}/api/auth/centres")
    with urllib.request.urlopen(req_centres) as resp:
        centres = json.loads(resp.read().decode())
        centre_entry = next((c for c in centres if c["id"] == centre_id), None)
        assert centre_entry is not None, f"Expected centre ID {centre_id} in active centres list!"
        print(f"[PASS] Active Centre '{centre_name}' (ID: {centre_id}) is available for Dealer Registration.")

    # 4. Successfully register a Dealer with Admin-created crop and centre
    dealer_email = f"dealer_{random_string(6)}@agriportal.in"
    reg_payload = {
        "name": "Sri Lakshmi Agro Traders",
        "email": dealer_email,
        "phone": f"98{random.randint(10000000, 99999999)}",
        "password": "Password@123",
        "confirm_password": "Password@123",
        "role": "DEALER",
        "business_name": "Sri Lakshmi Agro Traders",
        "license_number": f"LIC-2026-{random.randint(100,999)}",
        "government_id_type": "GSTIN",
        "government_id_number": f"36AAACG{random.randint(1000,9999)}H1Z1",
        "assigned_centre_id": centre_id,
        "category_id": cat_id,
        "address": "Plot #12, APMC Market Yard"
    }

    req_reg = urllib.request.Request(
        f"{base_url}/api/auth/register",
        data=json.dumps(reg_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_reg) as resp:
        reg_res = json.loads(resp.read().decode())
        assert reg_res["status"] == "pending_verification"
        print(f"[PASS] Dealer Registration Successful for crop '{new_crop_name}' & centre '{centre_name}'.")

    # 5. Admin deactivates the crop (status = INACTIVE)
    update_msp_payload = {
        "crop_name": new_crop_name,
        "rate_per_quintal": 6783.0,
        "season": "Kharif 2026-27",
        "effective_from": "01-Oct-2026",
        "status": "INACTIVE",
        "notes": "Deactivated by Admin test"
    }
    req_update_msp = urllib.request.Request(
        f"{base_url}/api/admin/msp-rates/{created_msp_id}",
        data=json.dumps(update_msp_payload).encode(),
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req_update_msp) as resp:
        print(f"\n[PASS] Admin Deactivated Crop '{new_crop_name}'.")

    # 6. Verify deactivated crop no longer appears in active categories
    with urllib.request.urlopen(req_cats) as resp:
        cats_after = json.loads(resp.read().decode())
        found_inactive_crop = next((c for c in cats_after if c["id"] == cat_id), None)
        assert found_inactive_crop is None, f"Deactivated crop {new_crop_name} must NOT appear in public active categories!"
        print(f"[PASS] Deactivated crop {new_crop_name} is successfully hidden from new registrations.")

    # 7. Attempt registering new dealer with deactivated crop ID -> Must be rejected (400 Bad Request)
    invalid_reg_payload = reg_payload.copy()
    invalid_reg_payload["email"] = f"dealer_invalid_{random_string(6)}@agriportal.in"
    req_invalid_crop = urllib.request.Request(
        f"{base_url}/api/auth/register",
        data=json.dumps(invalid_reg_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req_invalid_crop) as resp:
            assert False, "Registration with inactive crop should have failed!"
    except urllib.error.HTTPError as e:
        assert e.code == 400
        error_body = json.loads(e.read().decode())
        print(f"[PASS] Blocked Registration with Deactivated Crop (HTTP 400): {error_body.get('detail')}")

    # 8. Admin disables Procurement Centre (is_active = False)
    req_toggle_centre = urllib.request.Request(
        f"{base_url}/api/admin/centres/{centre_id}/toggle-status",
        headers={"Authorization": f"Bearer {admin_token}"},
        method="POST"
    )
    with urllib.request.urlopen(req_toggle_centre) as resp:
        toggle_res = json.loads(resp.read().decode())
        assert toggle_res["is_active"] is False
        print(f"\n[PASS] Admin Closed/Deactivated Centre '{centre_name}' (ID: {centre_id}).")

    # 9. Verify deactivated centre no longer appears in public active centres
    with urllib.request.urlopen(req_centres) as resp:
        centres_after = json.loads(resp.read().decode())
        found_inactive_centre = next((c for c in centres_after if c["id"] == centre_id), None)
        assert found_inactive_centre is None, f"Deactivated centre ID {centre_id} must NOT appear in public active centres!"
        print(f"[PASS] Deactivated centre '{centre_name}' is successfully hidden from new registrations.")

    # 10. Attempt registering new dealer with deactivated centre ID -> Must be rejected (400 Bad Request)
    # Reactive crop for this test to isolate centre check
    db = SessionLocal()
    c_active = db.query(Category).filter(Category.status == "ACTIVE").first()
    valid_cat_id = c_active.id
    db.close()

    invalid_centre_payload = reg_payload.copy()
    invalid_centre_payload["email"] = f"dealer_inv_centre_{random_string(6)}@agriportal.in"
    invalid_centre_payload["category_id"] = valid_cat_id
    invalid_centre_payload["assigned_centre_id"] = centre_id # This is currently inactive

    req_invalid_centre = urllib.request.Request(
        f"{base_url}/api/auth/register",
        data=json.dumps(invalid_centre_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req_invalid_centre) as resp:
            assert False, "Registration with inactive centre should have failed!"
    except urllib.error.HTTPError as e:
        assert e.code == 400
        error_body = json.loads(e.read().decode())
        print(f"[PASS] Blocked Registration with Deactivated Centre (HTTP 400): {error_body.get('detail')}")

    # 11. Reactivate centre and clean up
    req_reactivate_centre = urllib.request.Request(
        f"{base_url}/api/admin/centres/{centre_id}/toggle-status",
        headers={"Authorization": f"Bearer {admin_token}"},
        method="POST"
    )
    with urllib.request.urlopen(req_reactivate_centre) as resp:
        print(f"[PASS] Clean-up: Reactivated Centre '{centre_name}'.")

    print("\n================================================================")
    print("ALL ADMIN-CONTROLLED DEALER REGISTRATION TESTS PASSED 100%!")
    print("================================================================")

if __name__ == "__main__":
    main()
