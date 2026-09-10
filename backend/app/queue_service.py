from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from .models import (
    QueueEntry, QueueStatus, ProcurementTransaction, Booking, BookingStatus,
    ProcurementCentre, Slot, User
)
from .slot_timing import get_now_ist

DEFAULT_BASELINE_DURATION_MINS = 12.0

def compute_recent_average_duration(
    db: Session,
    centre_id: Optional[int] = None,
    dealer_id: Optional[int] = None,
    limit: int = 10
) -> float:
    """
    Calculates the actual rolling average procurement turnaround time (in minutes)
    based on recently completed QueueEntry and ProcurementTransaction records.
    
    Example:
      Farmer A: called 10:00 -> completed 10:12 = 12 mins
      Farmer B: called 10:12 -> completed 10:30 = 18 mins
      Rolling Average = 15.0 mins/farmer
    """
    durations: List[float] = []

    # 1. Inspect recent completed QueueEntries with called_at and completed_at
    q_query = db.query(QueueEntry).filter(
        QueueEntry.status == QueueStatus.COMPLETED,
        QueueEntry.called_at.isnot(None),
        QueueEntry.completed_at.isnot(None)
    )
    if centre_id:
        q_query = q_query.filter(QueueEntry.centre_id == centre_id)
    
    recent_q_entries = q_query.order_by(desc(QueueEntry.completed_at)).limit(limit).all()

    for entry in recent_q_entries:
        if entry.called_at and entry.completed_at and entry.completed_at > entry.called_at:
            delta_mins = (entry.completed_at - entry.called_at).total_seconds() / 60.0
            # Guard against erroneous timestamps: reasonable weighbridge window is 2 to 60 mins
            if 2.0 <= delta_mins <= 60.0:
                durations.append(delta_mins)

    # 2. If fewer than 2 data points, examine consecutive ProcurementTransactions at this centre
    if len(durations) < 2:
        t_query = db.query(ProcurementTransaction)
        if centre_id:
            t_query = t_query.filter(ProcurementTransaction.centre_id == centre_id)
        if dealer_id:
            t_query = t_query.filter(ProcurementTransaction.dealer_id == dealer_id)
        
        recent_txns = t_query.order_by(desc(ProcurementTransaction.transaction_time)).limit(limit).all()
        for i in range(len(recent_txns) - 1):
            t_curr = recent_txns[i].transaction_time
            t_prev = recent_txns[i + 1].transaction_time
            if t_curr and t_prev and t_curr > t_prev:
                # Same day transactions
                if t_curr.date() == t_prev.date():
                    diff_mins = (t_curr - t_prev).total_seconds() / 60.0
                    if 2.0 <= diff_mins <= 60.0:
                        durations.append(diff_mins)

    # 3. If no actual completions exist yet (e.g. at the start of day), return calibrated baseline
    if not durations:
        return DEFAULT_BASELINE_DURATION_MINS

    avg_val = sum(durations) / len(durations)
    return round(max(3.0, min(avg_val, 45.0)), 1)


def get_live_queue_metrics(
    db: Session,
    centre_id: int,
    booking_id: Optional[int] = None,
    farmer_id: Optional[int] = None,
    dealer_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Calculates live queue metrics from real database state:
    - Current token in service
    - Real count of farmers waiting ahead
    - Rolling average procurement speed (mins/farmer)
    - Calculated estimated waiting time = farmers_ahead * rolling_avg
    """
    centre = db.query(ProcurementCentre).filter(ProcurementCentre.id == centre_id).first()
    centre_name = centre.name if centre else "Procurement Centre"

    # 1. Resolve current active token at centre / dealer
    in_service_entry = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre_id,
        QueueEntry.status == QueueStatus.IN_SERVICE
    ).order_by(QueueEntry.called_at.desc()).first()

    first_waiting_entry = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre_id,
        QueueEntry.status == QueueStatus.WAITING
    ).order_by(QueueEntry.id.asc()).first()

    current_token = "Standby"
    if in_service_entry:
        current_token = in_service_entry.token_number
    elif first_waiting_entry:
        current_token = first_waiting_entry.token_number
    else:
        # Check latest completed token today
        latest_completed = db.query(QueueEntry).filter(
            QueueEntry.centre_id == centre_id,
            QueueEntry.status == QueueStatus.COMPLETED
        ).order_by(QueueEntry.id.desc()).first()
        if latest_completed:
            current_token = latest_completed.token_number

    # 2. Get all waiting queue entries for this centre
    waiting_entries = db.query(QueueEntry).filter(
        QueueEntry.centre_id == centre_id,
        QueueEntry.status == QueueStatus.WAITING
    ).order_by(QueueEntry.id.asc()).all()

    # 3. Locate target farmer's queue entry
    target_entry = None
    target_booking = None

    if booking_id:
        target_booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if target_booking:
            target_entry = db.query(QueueEntry).filter(QueueEntry.booking_id == target_booking.id).first()
    elif farmer_id:
        target_booking = db.query(Booking).filter(
            Booking.farmer_id == farmer_id,
            Booking.centre_id == centre_id,
            Booking.status.in_([BookingStatus.BOOKED, BookingStatus.ARRIVED, BookingStatus.VERIFIED, BookingStatus.PROCUREMENT_STARTED])
        ).order_by(Booking.created_at.desc()).first()
        if target_booking:
            target_entry = db.query(QueueEntry).filter(QueueEntry.booking_id == target_booking.id).first()

    farmers_ahead = 0
    farmer_token = target_booking.token_number if target_booking else None
    has_active_farmer_token = bool(target_booking and target_booking.status in [
        BookingStatus.BOOKED, BookingStatus.ARRIVED, BookingStatus.VERIFIED, BookingStatus.PROCUREMENT_STARTED
    ])

    if target_entry:
        if target_entry.status == QueueStatus.IN_SERVICE:
            farmers_ahead = 0
        elif target_entry.status == QueueStatus.WAITING:
            # Count entries before this entry in waiting list
            for idx, entry in enumerate(waiting_entries):
                if entry.id == target_entry.id:
                    farmers_ahead = idx
                    # If someone else is currently IN_SERVICE, add +1 for that active transaction
                    if in_service_entry and in_service_entry.id != target_entry.id:
                        farmers_ahead += 1
                    break
        elif target_entry.status == QueueStatus.COMPLETED:
            farmers_ahead = 0
    elif target_booking and target_booking.status in [BookingStatus.BOOKED, BookingStatus.ARRIVED, BookingStatus.VERIFIED]:
        farmers_ahead = len(waiting_entries) + (1 if in_service_entry else 0)

    # 4. Calculate dynamic rolling average duration
    recent_avg_mins = compute_recent_average_duration(db, centre_id=centre_id, dealer_id=dealer_id)

    # 5. Compute position, is_your_turn, and estimated wait minutes
    is_your_turn = False
    your_position = 0

    if target_entry:
        if target_entry.status == QueueStatus.IN_SERVICE or (current_token and current_token == farmer_token):
            farmers_ahead = 0
            your_position = 1
            is_your_turn = True
            estimated_wait_minutes = 0
        elif target_entry.status == QueueStatus.WAITING:
            your_position = farmers_ahead + 1
            is_your_turn = (farmers_ahead == 0 and not in_service_entry)
            estimated_wait_minutes = int(round(farmers_ahead * recent_avg_mins))
        elif target_entry.status == QueueStatus.COMPLETED:
            farmers_ahead = 0
            your_position = 0
            is_your_turn = False
            estimated_wait_minutes = 0
    elif target_booking and target_booking.status in [BookingStatus.BOOKED, BookingStatus.ARRIVED, BookingStatus.VERIFIED]:
        your_position = farmers_ahead + 1
        estimated_wait_minutes = int(round(farmers_ahead * recent_avg_mins))
    else:
        estimated_wait_minutes = 0

    # Queue condition evaluation
    queue_status = "Normal"
    if len(waiting_entries) > 10:
        queue_status = "High Congestion"
    elif len(waiting_entries) > 5:
        queue_status = "Moderate Traffic"
    else:
        queue_status = "Smooth Flow"

    return {
        "centre_id": centre_id,
        "centre_name": centre_name,
        "procurement_station": "Station #1",
        "current_token": current_token,
        "currently_serving_token": current_token,
        "farmer_token": farmer_token,
        "has_active_farmer_token": has_active_farmer_token,
        "farmers_ahead": farmers_ahead,
        "your_position": your_position,
        "is_your_turn": is_your_turn,
        "recent_average_minutes": recent_avg_mins,
        "estimated_wait_minutes": estimated_wait_minutes,
        "total_waiting_in_centre": len(waiting_entries),
        "in_service_active": in_service_entry is not None,
        "queue_status": queue_status
    }

