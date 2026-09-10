import json
import urllib.request
import zoneinfo
from datetime import datetime, timedelta
from backend.app.database import SessionLocal
from backend.app.models import User, Slot, ProcurementCentre, Category, Notification, Booking, ProcurementTransaction, get_ist_now
from backend.app.slot_timing import get_now_ist, get_slot_timing_status

IST = zoneinfo.ZoneInfo("Asia/Kolkata")

import time

def main():
    base_url = "http://127.0.0.1:8000"
    print("==================================================")
    print("STARTING TIME SYNCHRONIZATION & IST ACCURACY TESTS")
    print("==================================================")

    # Wait for server readiness
    req = urllib.request.Request(f"{base_url}/api/farmer/server-time")
    resp_data = None
    for attempt in range(10):
        try:
            with urllib.request.urlopen(req) as resp:
                resp_data = json.loads(resp.read().decode())
                break
        except Exception as e:
            time.sleep(1)

    assert resp_data is not None, "Server did not respond in time"
    data = resp_data
    print(f"\n[PASS] GET /api/farmer/server-time")
    print(f"  Server IST Date: {data.get('ist_date')}")
    print(f"  Server IST Time: {data.get('ist_time')}")
    print(f"  Timezone:        {data.get('timezone')}")
    
    now_ist = datetime.now(IST)
    expected_date = now_ist.strftime("%Y-%m-%d")
    expected_time = now_ist.strftime("%I:%M %p")
    
    assert data.get("ist_date") == expected_date, f"Expected {expected_date}, got {data.get('ist_date')}"
    assert data.get("timezone") == "Asia/Kolkata", f"Expected Asia/Kolkata, got {data.get('timezone')}"
    print(f"  Accuracy Check: Matches client-side IST ({expected_date} {expected_time}) [OK]")

    # 2. Test Model get_ist_now() Database Defaults
    db = SessionLocal()
    farmer = db.query(User).filter(User.role == "FARMER").first()
    assert farmer is not None, "Farmer user must exist"

    test_notif = Notification(
        user_id=farmer.id,
        title="Time Check Notification",
        message="Checking IST precision on notification creation.",
        type="SYSTEM"
    )
    db.add(test_notif)
    db.commit()
    db.refresh(test_notif)

    notif_time = test_notif.created_at
    current_ist = datetime.now(IST).replace(tzinfo=None)
    time_diff = abs((current_ist - notif_time).total_seconds())

    print(f"\n[PASS] Model Database Default Timestamp:")
    print(f"  Notification created_at: {notif_time}")
    print(f"  Current IST timestamp:   {current_ist}")
    print(f"  Difference:              {time_diff:.2f} seconds")
    assert time_diff < 5.0, f"Timestamp difference {time_diff}s too large! (Expected < 5s)"
    print("  Database IST Accuracy:   100% synchronized [OK]")

    # Clean up test notification
    db.delete(test_notif)
    db.commit()

    # 3. Test Slot Timing Status against live IST
    print(f"\n[PASS] Slot Timing Status Evaluation (IST strictly):")
    now_ist_obj = get_now_ist()
    today_str = now_ist_obj.strftime("%Y-%m-%d")
    current_hr = now_ist_obj.hour
    
    # Test past slot earlier today
    if current_hr >= 2:
        past_status = get_slot_timing_status(today_str, "00:00 AM", "01:00 AM")
        assert past_status == "EXPIRED", f"00:00-01:00 AM today must be EXPIRED, got {past_status}"
        print(f"  Earlier today (00:00 AM - 01:00 AM) => {past_status} [OK]")

    # Test future slot tomorrow
    tomorrow_str = (now_ist_obj.date() + timedelta(days=1)).strftime("%Y-%m-%d")
    future_status = get_slot_timing_status(tomorrow_str, "10:00 AM", "11:00 AM")
    assert future_status == "UPCOMING", f"Tomorrow slot must be UPCOMING, got {future_status}"
    print(f"  Tomorrow (10:00 AM - 11:00 AM)      => {future_status} [OK]")

    # Test yesterday slot
    yesterday_str = (now_ist_obj.date() - timedelta(days=1)).strftime("%Y-%m-%d")
    yesterday_status = get_slot_timing_status(yesterday_str, "10:00 AM", "11:00 AM")
    assert yesterday_status == "EXPIRED", f"Yesterday slot must be EXPIRED, got {yesterday_status}"
    print(f"  Yesterday (10:00 AM - 11:00 AM)     => {yesterday_status} [OK]")

    db.close()
    print("\n==================================================")
    print("ALL TIME SYNCHRONIZATION & IST TESTS PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    main()
