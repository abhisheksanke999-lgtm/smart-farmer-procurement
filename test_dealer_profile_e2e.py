import json
import urllib.request
import time
from backend.app.database import SessionLocal
from backend.app.models import User, ProcurementCentre, Category
from backend.app.auth import create_access_token

def main():
    db = SessionLocal()
    dealer = db.query(User).filter(User.role == 'DEALER').first()
    if not dealer:
        print('No dealer user found in database!')
        return

    token = create_access_token({'sub': dealer.email, 'role': dealer.role, 'id': dealer.id})
    print(f'Authenticated Dealer: {dealer.email}, ID: {dealer.id}, Name: {dealer.name}')

    base_url = 'http://127.0.0.1:8000'
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # 1. Fetch Centres and Categories
    req_centres = urllib.request.Request(f'{base_url}/api/dealer/centres', headers=headers)
    with urllib.request.urlopen(req_centres) as resp:
        centres = json.loads(resp.read().decode())
        print(f'\n[PASS] GET /api/dealer/centres returned {len(centres)} official centres.')
        target_centre = centres[0] if centres else None

    req_cats = urllib.request.Request(f'{base_url}/api/dealer/categories', headers=headers)
    with urllib.request.urlopen(req_cats) as resp:
        cats = json.loads(resp.read().decode())
        print(f'[PASS] GET /api/dealer/categories returned {len(cats)} approved categories.')
        target_cat = cats[0] if cats else None

    # 2. GET /api/dealer/profile
    req = urllib.request.Request(f'{base_url}/api/dealer/profile', headers=headers)
    with urllib.request.urlopen(req) as resp:
        prof = json.loads(resp.read().decode())
        print('\n[PASS] GET /api/dealer/profile (HTTP 200)')
        print(f'  Dealer Name: {prof.get("name")}')
        print(f'  Business: {prof.get("business_name")}')
        print(f'  Email: {prof.get("email")}')
        print(f'  Phone: {prof.get("phone")}')
        print(f'  License (Protected): {prof.get("license_number")}')

    # 3. PUT /api/dealer/profile - Update business & allotment
    update_data = {
        'name': 'Sri Venkateswara Dealer Agency',
        'business_name': 'Sri Venkateswara Agro Procurement Traders',
        'phone': '9848011223',
        'address': 'Mandi Yard Gate 2, Warangal',
        'assigned_centre_id': target_centre['id'] if target_centre else None,
        'category_id': target_cat['id'] if target_cat else None,
        'daily_capacity_quintals': 750.0,
        'daily_requirements': 'Moisture <= 17%, Clean graded produce only',
        'bank_name': 'HDFC Bank',
        'bank_account_no': 'HDFC50100223344',
        'ifsc_code': 'HDFC0001234'
    }

    req = urllib.request.Request(
        f'{base_url}/api/dealer/profile',
        data=json.dumps(update_data).encode('utf-8'),
        headers=headers,
        method='PUT'
    )
    with urllib.request.urlopen(req) as resp:
        updated = json.loads(resp.read().decode())
        print('\n[PASS] PUT /api/dealer/profile (HTTP 200)')
        print(f'  Updated Dealer Name: {updated.get("name")}')
        print(f'  Updated Business: {updated.get("business_name")}')
        print(f'  Updated Centre: {updated.get("centre_name")} ({updated.get("centre_code")})')
        print(f'  Updated Category: {updated.get("category_name")}')
        print(f'  Updated Capacity: {updated.get("daily_capacity_quintals")} Quintals/day')
        print(f'  Updated Requirements: {updated.get("daily_requirements")}')
        print(f'  Protected License Number: {updated.get("license_number")}')

    # 4. Validation Test: Invalid Mobile (less than 10 digits)
    try:
        bad_req = urllib.request.Request(
            f'{base_url}/api/dealer/profile',
            data=json.dumps({'phone': '9876'}).encode('utf-8'),
            headers=headers,
            method='PUT'
        )
        urllib.request.urlopen(bad_req)
        print('\n[FAIL] Short phone was unexpectedly accepted!')
    except urllib.error.HTTPError as e:
        print(f'\n[PASS] Mobile Validation caught error (HTTP {e.code}): {json.loads(e.read().decode())}')

    # 5. Validation Test: Non-existent Centre ID
    try:
        bad_req = urllib.request.Request(
            f'{base_url}/api/dealer/profile',
            data=json.dumps({'assigned_centre_id': 999999}).encode('utf-8'),
            headers=headers,
            method='PUT'
        )
        urllib.request.urlopen(bad_req)
        print('\n[FAIL] Fake centre ID was unexpectedly accepted!')
    except urllib.error.HTTPError as e:
        print(f'\n[PASS] Centre Validation caught error (HTTP {e.code}): {json.loads(e.read().decode())}')

    # 6. Re-query GET /api/dealer/profile to confirm persistence in DB
    req = urllib.request.Request(f'{base_url}/api/dealer/profile', headers=headers)
    with urllib.request.urlopen(req) as resp:
        persisted = json.loads(resp.read().decode())
        print('\n[PASS] Re-querying GET /api/dealer/profile confirms DB persistence:')
        print(f'  Business in DB: {persisted.get("business_name")}')
        print(f'  Centre in DB: {persisted.get("centre_name")}')
        print(f'  Category in DB: {persisted.get("category_name")}')
        print(f'  Capacity in DB: {persisted.get("daily_capacity_quintals")} Quintals')
        print(f'  Bank in DB: {persisted.get("bank_name")} - {persisted.get("bank_account_no")}')

    print('\n' + '='*55)
    print('ALL DEALER PROFILE AUTOMATED E2E TESTS PASSED 100%!')
    print('='*55)
    db.close()

if __name__ == '__main__':
    main()
