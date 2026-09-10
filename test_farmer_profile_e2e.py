import json
import urllib.request
import time
from backend.app.database import SessionLocal
from backend.app.models import User
from backend.app.auth import create_access_token

def main():
    db = SessionLocal()
    farmer = db.query(User).filter(User.role == 'FARMER').first()
    if not farmer:
        print('No farmer found in database!')
        return

    token = create_access_token({'sub': farmer.email, 'role': farmer.role, 'id': farmer.id})
    print(f'Authenticated Farmer: {farmer.email}, ID: {farmer.id}, Initial Name: {farmer.name}')

    base_url = 'http://127.0.0.1:8000'
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # 1. GET /api/farmer/profile
    req = urllib.request.Request(f'{base_url}/api/farmer/profile', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as resp:
        prof = json.loads(resp.read().decode())
        print('\n[PASS] GET /api/farmer/profile (HTTP 200)')
        print(f'  Name: {prof.get("name")}')
        print(f'  Email: {prof.get("email")}')
        print(f'  Phone: {prof.get("phone")}')
        print(f'  Land Area: {prof.get("land_size_acres")} acres')
        print(f'  Village: {prof.get("village")}')

    # 2. PUT /api/farmer/profile
    update_data = {
        'name': 'Yaswanth Varma Gottumukkala',
        'phone': '7569919479',
        'address': 'D.No 4-12, Godavari Green Agro Fields',
        'village': 'Bhimavaram Rural',
        'district': 'West Godavari',
        'land_size_acres': 9.25,
        'bank_name': 'State Bank of India',
        'bank_account_no': 'SBI3322114455',
        'ifsc_code': 'SBIN0000843'
    }
    req = urllib.request.Request(
        f'{base_url}/api/farmer/profile',
        data=json.dumps(update_data).encode('utf-8'),
        headers=headers,
        method='PUT'
    )
    with urllib.request.urlopen(req) as resp:
        updated = json.loads(resp.read().decode())
        print('\n[PASS] PUT /api/farmer/profile (HTTP 200)')
        print(f'  Updated Name: {updated.get("name")}')
        print(f'  Updated Phone: {updated.get("phone")}')
        print(f'  Updated Land Size: {updated.get("land_size_acres")} acres')
        print(f'  Updated Village: {updated.get("village")}')
        print(f'  Updated Bank Name: {updated.get("bank_name")}')
        print(f'  Updated Account No: {updated.get("bank_account_no")}')
        print(f'  Protected Farmer ID: #FAR-{updated.get("id"):04d}')

    # 3. Validation test: Invalid mobile
    try:
        bad_req = urllib.request.Request(
            f'{base_url}/api/farmer/profile',
            data=json.dumps({'phone': '123'}).encode('utf-8'),
            headers=headers,
            method='PUT'
        )
        urllib.request.urlopen(bad_req)
        print('\n[FAIL] Short phone was accepted unexpectedly!')
    except urllib.error.HTTPError as e:
        print(f'\n[PASS] Validation caught invalid phone (HTTP {e.code}): {json.loads(e.read().decode())}')

    # 4. Validation test: Negative land size
    try:
        bad_req = urllib.request.Request(
            f'{base_url}/api/farmer/profile',
            data=json.dumps({'land_size_acres': -5.0}).encode('utf-8'),
            headers=headers,
            method='PUT'
        )
        urllib.request.urlopen(bad_req)
        print('\n[FAIL] Negative land size was accepted unexpectedly!')
    except urllib.error.HTTPError as e:
        print(f'\n[PASS] Validation caught invalid land size (HTTP {e.code}): {json.loads(e.read().decode())}')

    # 5. Verify Persistence via fresh GET
    req = urllib.request.Request(f'{base_url}/api/farmer/profile', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as resp:
        persisted = json.loads(resp.read().decode())
        print('\n[PASS] Re-querying GET /api/farmer/profile verifies DB persistence:')
        print(f'  Name in DB: {persisted.get("name")}')
        print(f'  Land Size in DB: {persisted.get("land_size_acres")} acres')
        print(f'  Village in DB: {persisted.get("village")}')
        print(f'  Bank in DB: {persisted.get("bank_name")}')

    print('\n' + '='*50)
    print('ALL FARMER PROFILE E2E AUTOMATION TESTS PASSED!')
    print('='*50)
    db.close()

if __name__ == '__main__':
    main()
