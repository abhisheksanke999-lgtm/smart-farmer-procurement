import json
import urllib.request
import datetime
from backend.app.database import SessionLocal
from backend.app.models import User, Slot, ProcurementCentre, Category, Notification, FarmerDealerAssignment, Booking
from backend.app.auth import create_access_token

def main():
    db = SessionLocal()
    farmer = db.query(User).filter(User.role == 'FARMER').first()
    dealer = db.query(User).filter(User.role == 'DEALER').first()
    
    if not farmer or not dealer:
        print("Required users not found in DB!")
        return

    farmer.is_email_verified = True
    db.commit()

    farmer_token = create_access_token({'sub': farmer.email, 'role': farmer.role, 'id': farmer.id})
    dealer_token = create_access_token({'sub': dealer.email, 'role': dealer.role, 'id': dealer.id})
    base_url = 'http://127.0.0.1:8000'

    # Find dealer with approved status and matching centre
    dealer = db.query(User).filter(User.role == 'DEALER').first()
    dp = dealer.dealer_profile if dealer else None
    
    centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == dp.assigned_centre_id).first() if dp and dp.assigned_centre_id else db.query(ProcurementCentre).first()
    category = dp.category if dp and dp.category else db.query(Category).first()

    centre_id = centre.id
    category_id = category.id
    crop_name = category.name

    # Ensure centre supported_crops includes crop_name
    if not centre.supported_crops or crop_name.lower() not in centre.supported_crops.lower():
        centre.supported_crops = f"{centre.supported_crops or 'Paddy'}, {crop_name}"
        db.commit()

    import random
    # Find or create a unique future slot
    rand_offset = random.randint(20, 300)
    test_date = (datetime.date.today() + datetime.timedelta(days=rand_offset)).strftime('%Y-%m-%d')
    slot = Slot(
        centre_id=centre_id,
        date=test_date,
        start_time='10:00 AM',
        end_time='11:00 AM',
        capacity=15,
        booked_count=0
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)

    farmer_name = farmer.name
    farmer_email = farmer.email
    dealer_name = dealer.name
    dealer_email = dealer.email
    dealer_id = dealer.id
    centre_name = centre.name
    slot_id = slot.id
    slot_date = slot.date
    slot_start = slot.start_time
    slot_end = slot.end_time

    db.close()

    print(f"Testing Booking Notification Flow:")
    print(f"  Farmer: {farmer_name} ({farmer_email})")
    print(f"  Dealer: {dealer_name} ({dealer_email})")
    print(f"  Centre: {centre_name} (ID: {centre_id}), Slot: {slot_date} {slot_start}-{slot_end}")
    print(f"  Crop: {crop_name} (Category ID: {category_id})")

    # 1. Farmer makes a booking with Dealer
    booking_payload = {
        "centre_id": centre_id,
        "dealer_id": dealer_id,
        "slot_id": slot_id,
        "product_name": crop_name,
        "expected_quantity_quintals": 45.0,
        "category_id": category_id
    }

    req = urllib.request.Request(
        f'{base_url}/api/farmer/create-assignment',
        data=json.dumps(booking_payload).encode('utf-8'),
        headers={'Authorization': f'Bearer {farmer_token}', 'Content-Type': 'application/json'}
    )

    try:
        with urllib.request.urlopen(req) as resp:
            booking_res = json.loads(resp.read().decode())
            print(f"\n[PASS] POST /api/farmer/create-assignment (HTTP {resp.status})")
            print(f"  Booking Code: {booking_res.get('booking_code')}")
            print(f"  Token Number: {booking_res.get('token_number')}")
            booking_code = booking_res.get('booking_code')
            token_number = booking_res.get('token_number')
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode()}")
        raise

    # 2. Check Dealer Notifications
    req_notifs = urllib.request.Request(
        f'{base_url}/api/notifications',
        headers={'Authorization': f'Bearer {dealer_token}'}
    )

    with urllib.request.urlopen(req_notifs) as resp:
        notifs_res = json.loads(resp.read().decode())
        notifs = notifs_res.get('notifications', [])
        print(f"\n[PASS] GET /api/notifications (HTTP {resp.status}) returned {len(notifs)} notifications.")
        
        # Find the newly created booking notification
        booking_notif = next((n for n in notifs if booking_code in n.get('message', '') or token_number in n.get('message', '')), None)
        assert booking_notif is not None, f"Expected notification containing {booking_code} for dealer!"
        
        print("  Notification Title:", booking_notif.get('title').encode('ascii', 'replace').decode('ascii'))
        print("  Notification Telugu Title Present:", bool(booking_notif.get('title_te')))
        print("  Notification Message:")
        for line in (booking_notif.get('message') or '').split('\n'):
            print("   ", line.encode('ascii', 'replace').decode('ascii'))
        
        assert "New booking received" in booking_notif.get('title'), "Title must match 'New booking received'"
        assert farmer_name in booking_notif.get('message'), "Message must contain Farmer Name"
        assert slot_date in booking_notif.get('message'), "Message must contain Date"
        assert booking_code in booking_notif.get('message'), "Message must contain Booking ID"

    # 3. Check Dealer Assigned Farmers / Bookings List
    req_assigned = urllib.request.Request(
        f'{base_url}/api/dealer/assigned-farmers',
        headers={'Authorization': f'Bearer {dealer_token}'}
    )

    with urllib.request.urlopen(req_assigned) as resp:
        assigned_res = json.loads(resp.read().decode())
        print(f"\n[PASS] GET /api/dealer/assigned-farmers (HTTP {resp.status}) returned {len(assigned_res)} records.")
        
        target_record = next((r for r in assigned_res if r.get('booking_code') == booking_code or r.get('token_number') == token_number), None)
        assert target_record is not None, f"Expected assigned record for {booking_code}"
        
        print(f"  Farmer Name: {target_record.get('farmer_name')}")
        print(f"  Phone: {target_record.get('farmer_phone')}")
        print(f"  Date: {target_record.get('slot_date')}")
        print(f"  Time: {target_record.get('slot_time')}")
        print(f"  Timing Status: {target_record.get('timing_status')}")
        print(f"  Product: {target_record.get('product_name')}")
        print(f"  Expected Qty: {target_record.get('expected_quantity_quintals')} Q")
        
        assert target_record.get('farmer_name') == farmer_name, "Farmer name match"
        assert target_record.get('timing_status') in ['UPCOMING', 'ACTIVE', 'EXPIRED'], "Timing status must be evaluated"

    print("\n=======================================================")
    print("ALL DEALER BOOKING NOTIFICATION E2E TESTS PASSED 100%!")
    print("=======================================================")

if __name__ == '__main__':
    main()
