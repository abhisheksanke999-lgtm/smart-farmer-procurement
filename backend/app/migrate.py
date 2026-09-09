import logging
from sqlalchemy import text
from .database import engine, Base
from .models import (
    User, FarmerProfile, DealerProfile, ProcurementCentre, Slot,
    FarmerDealerAssignment, Booking, QueueEntry, ProcurementTransaction,
    Payment, Notification, AuditLog, Complaint, PendingFarmerRegistration
)

logger = logging.getLogger("db_migrate")

def run_migrations():
    """
    Idempotent schema migration runner:
    1. Runs Base.metadata.create_all(bind=engine) to create newly defined tables (e.g. farmer_dealer_assignments).
    2. Runs safe ALTER TABLE checks to ensure existing tables have all new columns (supported_crops, dealer_id, assignment_id).
    """
    try:
        # Create any new tables
        Base.metadata.create_all(bind=engine)

        # Apply column additions if missing (works across Neon PostgreSQL and SQLite)
        with engine.begin() as conn:
            is_sqlite = engine.url.drivername.startswith("sqlite")
            
            # 1. supported_crops in procurement_centres
            try:
                if is_sqlite:
                    conn.execute(text("ALTER TABLE procurement_centres ADD COLUMN supported_crops VARCHAR DEFAULT 'Rice,Paddy,Cotton,Maize,Chilli'"))
                else:
                    conn.execute(text("ALTER TABLE procurement_centres ADD COLUMN IF NOT EXISTS supported_crops VARCHAR DEFAULT 'Rice,Paddy,Cotton,Maize,Chilli'"))
                logger.info("Migrated column supported_crops in procurement_centres.")
            except Exception as e:
                # Column likely already exists
                pass

            # 2. dealer_id in bookings
            try:
                if is_sqlite:
                    conn.execute(text("ALTER TABLE bookings ADD COLUMN dealer_id INTEGER"))
                else:
                    conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dealer_id INTEGER REFERENCES users(id)"))
                logger.info("Migrated column dealer_id in bookings.")
            except Exception:
                pass

            # 3. assignment_id in bookings
            try:
                if is_sqlite:
                    conn.execute(text("ALTER TABLE bookings ADD COLUMN assignment_id INTEGER"))
                else:
                    conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assignment_id INTEGER REFERENCES farmer_dealer_assignments(id)"))
                logger.info("Migrated column assignment_id in bookings.")
            except Exception:
                pass

            # Set default supported crops for existing records if null/empty
            try:
                conn.execute(text("UPDATE procurement_centres SET supported_crops = 'Rice,Paddy,Cotton,Maize,Chilli' WHERE supported_crops IS NULL OR supported_crops = ''"))
            except Exception:
                pass

    except Exception as err:
        logger.error(f"Migration execution notice: {err}")

if __name__ == "__main__":
    run_migrations()
