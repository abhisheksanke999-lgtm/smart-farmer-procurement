import logging
from sqlalchemy import text
from .database import engine, Base
from .models import (
    User, FarmerProfile, DealerProfile, ProcurementCentre, Slot,
    FarmerDealerAssignment, Booking, QueueEntry, ProcurementTransaction,
    Payment, Notification, AuditLog, Complaint, PendingFarmerRegistration,
    Category
)

logger = logging.getLogger("db_migrate")

def run_migrations():
    """
    Idempotent schema migration runner:
    1. Runs Base.metadata.create_all(bind=engine) to create newly defined tables (e.g. categories, farmer_dealer_assignments).
    2. Runs safe ALTER TABLE checks to ensure existing tables have all new columns.
    3. Seeds default scalable categories (Paddy, Cotton).
    """
    try:
        # Create any new tables (including categories)
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
            except Exception:
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

            # 4. category_id in dealer_profiles
            try:
                if is_sqlite:
                    conn.execute(text("ALTER TABLE dealer_profiles ADD COLUMN category_id INTEGER"))
                else:
                    conn.execute(text("ALTER TABLE dealer_profiles ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id)"))
                logger.info("Migrated column category_id in dealer_profiles.")
            except Exception:
                pass

            # 5. category_id in bookings
            try:
                if is_sqlite:
                    conn.execute(text("ALTER TABLE bookings ADD COLUMN category_id INTEGER"))
                else:
                    conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id)"))
                logger.info("Migrated column category_id in bookings.")
            except Exception:
                pass

            # 6. category_id in farmer_dealer_assignments
            try:
                if is_sqlite:
                    conn.execute(text("ALTER TABLE farmer_dealer_assignments ADD COLUMN category_id INTEGER"))
                else:
                    conn.execute(text("ALTER TABLE farmer_dealer_assignments ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id)"))
                logger.info("Migrated column category_id in farmer_dealer_assignments.")
            except Exception:
                pass

            # Set default supported crops for existing records if null/empty
            try:
                conn.execute(text("UPDATE procurement_centres SET supported_crops = 'Rice,Paddy,Cotton,Maize,Chilli' WHERE supported_crops IS NULL OR supported_crops = ''"))
            except Exception:
                pass

            # Seed default product categories (Paddy and Cotton)
            try:
                existing_paddy = conn.execute(text("SELECT id FROM categories WHERE name = 'Paddy'")).first()
                if not existing_paddy:
                    conn.execute(text("INSERT INTO categories (name, description, status, created_at) VALUES ('Paddy', 'Paddy & Rice Grain Procurement (ధాన్యం)', 'ACTIVE', CURRENT_TIMESTAMP)"))
                
                existing_cotton = conn.execute(text("SELECT id FROM categories WHERE name = 'Cotton'")).first()
                if not existing_cotton:
                    conn.execute(text("INSERT INTO categories (name, description, status, created_at) VALUES ('Cotton', 'Cotton & Fiber Procurement (ప్రత్తి)', 'ACTIVE', CURRENT_TIMESTAMP)"))

                # Backfill existing dealers to Category 1 (Paddy) if null
                paddy_row = conn.execute(text("SELECT id FROM categories WHERE name = 'Paddy'")).first()
                if paddy_row:
                    paddy_id = paddy_row[0]
                    conn.execute(text(f"UPDATE dealer_profiles SET category_id = {paddy_id} WHERE category_id IS NULL"))
            except Exception as e:
                logger.warning(f"Category migration check: {e}")

    except Exception as err:
        logger.error(f"Migration execution notice: {err}")

if __name__ == "__main__":
    run_migrations()
