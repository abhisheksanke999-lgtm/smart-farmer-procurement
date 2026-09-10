import logging
import re
from datetime import datetime, time, timedelta
import zoneinfo
from sqlalchemy.orm import Session
from .models import (
    Booking, BookingStatus, Slot, FarmerDealerAssignment, AssignmentStatus,
    QueueEntry, QueueStatus, Notification, NotificationType
)

logger = logging.getLogger(__name__)

IST = zoneinfo.ZoneInfo("Asia/Kolkata")

def get_now_ist() -> datetime:
    """Returns current datetime in Indian Standard Time (Asia/Kolkata)."""
    return datetime.now(IST)

def parse_time_str(time_str: str) -> time:
    """
    Robustly parses various time string formats into a datetime.time object.
    Supports: "10:00 AM", "10:00AM", "10:00", "01:00 PM", "13:00", etc.
    """
    if not time_str:
        return time(0, 0)
    clean = time_str.strip().upper()
    # Replace multiple spaces
    clean = re.sub(r"\s+", " ", clean)

    formats = [
        "%I:%M %p",
        "%I:%M%p",
        "%I %p",
        "%H:%M",
        "%H:%M:%S"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean, fmt).time()
        except ValueError:
            continue

    # Fallback manual parsing if format has unusual spacing
    match = re.match(r"^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$", clean)
    if match:
        hr = int(match.group(1))
        mn = int(match.group(2)) if match.group(2) else 0
        ampm = match.group(3)
        if ampm == "PM" and hr < 12:
            hr += 12
        elif ampm == "AM" and hr == 12:
            hr = 0
        return time(hr, mn)

    return time(0, 0)

def parse_date_str(date_str: str) -> datetime.date:
    """
    Robustly parses date string formats into datetime.date.
    Supports: "YYYY-MM-DD", "DD-Mon-YYYY", "DD/MM/YYYY", etc.
    """
    if not date_str:
        return get_now_ist().date()
    clean = date_str.strip()
    formats = [
        "%Y-%m-%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean, fmt).date()
        except ValueError:
            continue

    return get_now_ist().date()

def get_slot_timing_status(slot_date_str: str, start_time_str: str, end_time_str: str) -> str:
    """
    Evaluates slot timing window strictly against current Indian Standard Time (IST).
    Returns:
    - 'UPCOMING': Current IST time is before the slot start time.
    - 'ACTIVE': Current IST time is within the slot start and end time window.
    - 'EXPIRED': Current IST time is after the slot end time (or slot date is in the past).
    """
    try:
        now_ist = get_now_ist()
        today_ist = now_ist.date()
        slot_date = parse_date_str(slot_date_str)

        # Date comparison
        if slot_date < today_ist:
            return "EXPIRED"
        if slot_date > today_ist:
            return "UPCOMING"

        # Slot is today -> evaluate time window
        start_t = parse_time_str(start_time_str)
        end_t = parse_time_str(end_time_str)

        slot_start_dt = datetime.combine(today_ist, start_t, tzinfo=IST)
        slot_end_dt = datetime.combine(today_ist, end_t, tzinfo=IST)

        if now_ist < slot_start_dt:
            return "UPCOMING"
        elif slot_start_dt <= now_ist <= slot_end_dt:
            return "ACTIVE"
        else:
            return "EXPIRED"
    except Exception as e:
        logger.warning(f"Error evaluating slot timing status: {e}")
        return "UPCOMING"

def is_slot_in_past(slot_date_str: str, end_time_str: str) -> bool:
    """Returns True if the slot date and end time have passed in IST."""
    return get_slot_timing_status(slot_date_str, "00:00 AM", end_time_str) == "EXPIRED"

def sync_and_expire_bookings(db: Session, farmer_id: int = None, dealer_id: int = None) -> int:
    """
    Automatically scans active bookings in the database, checks if the slot window has passed in IST,
    and updates their status to 'EXPIRED' in the database.
    Also cancels corresponding active dealer assignments and marks queue entries as skipped.
    """
    query = db.query(Booking).filter(
        Booking.status.in_([BookingStatus.BOOKED, BookingStatus.ARRIVED])
    )
    if farmer_id:
        query = query.filter(Booking.farmer_id == farmer_id)
    if dealer_id:
        query = query.filter(Booking.dealer_id == dealer_id)

    pending_bookings = query.all()
    expired_count = 0

    for b in pending_bookings:
        if not b.slot:
            continue
        timing = get_slot_timing_status(b.slot.date, b.slot.start_time, b.slot.end_time)
        if timing == "EXPIRED":
            b.status = BookingStatus.EXPIRED
            b.updated_at = get_now_ist().replace(tzinfo=None)
            expired_count += 1

            # Cancel active assignment
            if b.assignment and b.assignment.status == AssignmentStatus.ACTIVE:
                b.assignment.status = AssignmentStatus.CANCELLED
                b.assignment.updated_at = get_now_ist().replace(tzinfo=None)

            # Skip waiting queue entry
            if b.queue_entry and b.queue_entry.status == QueueStatus.WAITING:
                b.queue_entry.status = QueueStatus.SKIPPED

            # Add notification for farmer
            try:
                db.add(Notification(
                    user_id=b.farmer_id,
                    title="Procurement Slot Expired ⏰",
                    title_te="కొనుగోలు స్లాట్ గడువు ముగిసింది ⏰",
                    message=f"Your booked procurement slot on {b.slot.date} ({b.slot.start_time} - {b.slot.end_time}) has expired. Please book a new slot if you still need to sell your produce.",
                    message_te=f"{b.slot.date} ({b.slot.start_time} - {b.slot.end_time}) నాటి మీ కొనుగోలు స్లాట్ గడువు ముగిసింది. దయచేసి కొత్త స్లాట్‌ను బుక్ చేయండి.",
                    type=NotificationType.BOOKING
                ))
            except Exception as e:
                logger.warning(f"Could not create expiration notification: {e}")

    if expired_count > 0:
        try:
            db.commit()
            logger.info(f"Auto-expired {expired_count} booking(s) in database.")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to commit auto-expired bookings: {e}")

    return expired_count
