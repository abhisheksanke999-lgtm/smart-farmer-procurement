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

        is_sqlite = engine.url.drivername.startswith("sqlite")
        
        def safe_exec(sql_sqlite, sql_pg, desc=""):
            try:
                with engine.connect() as conn:
                    query = sql_sqlite if is_sqlite else sql_pg
                    conn.execute(text(query))
                    conn.commit()
                    if desc:
                        logger.info(f"Migrated: {desc}")
            except Exception as e:
                logger.debug(f"Migration note ({desc}): {e}")

        # 1. supported_crops in procurement_centres
        safe_exec(
            "ALTER TABLE procurement_centres ADD COLUMN supported_crops VARCHAR DEFAULT 'Rice,Paddy,Cotton,Maize,Chilli'",
            "ALTER TABLE procurement_centres ADD COLUMN IF NOT EXISTS supported_crops VARCHAR DEFAULT 'Rice,Paddy,Cotton,Maize,Chilli'",
            "supported_crops in procurement_centres"
        )

        # 2. dealer_id in bookings
        safe_exec(
            "ALTER TABLE bookings ADD COLUMN dealer_id INTEGER",
            "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dealer_id INTEGER REFERENCES users(id)",
            "dealer_id in bookings"
        )

        # 3. assignment_id in bookings
        safe_exec(
            "ALTER TABLE bookings ADD COLUMN assignment_id INTEGER",
            "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assignment_id INTEGER REFERENCES farmer_dealer_assignments(id)",
            "assignment_id in bookings"
        )

        # 4. category_id in dealer_profiles
        safe_exec(
            "ALTER TABLE dealer_profiles ADD COLUMN category_id INTEGER",
            "ALTER TABLE dealer_profiles ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id)",
            "category_id in dealer_profiles"
        )

        # 5. category_id in bookings
        safe_exec(
            "ALTER TABLE bookings ADD COLUMN category_id INTEGER",
            "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id)",
            "category_id in bookings"
        )

        # 6. category_id in farmer_dealer_assignments
        safe_exec(
            "ALTER TABLE farmer_dealer_assignments ADD COLUMN category_id INTEGER",
            "ALTER TABLE farmer_dealer_assignments ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id)",
            "category_id in farmer_dealer_assignments"
        )

        # 7. Add dealer_profiles extra columns if missing
        dealer_cols = [
            ("bank_name", "VARCHAR"),
            ("bank_account_no", "VARCHAR"),
            ("ifsc_code", "VARCHAR"),
            ("daily_capacity_quintals", "FLOAT"),
            ("daily_requirements", "TEXT")
        ]
        for col_name, col_type in dealer_cols:
            safe_exec(
                f"ALTER TABLE dealer_profiles ADD COLUMN {col_name} {col_type}",
                f"ALTER TABLE dealer_profiles ADD COLUMN IF NOT EXISTS {col_name} {col_type}",
                f"{col_name} in dealer_profiles"
            )

        # Set default supported crops for existing records if null/empty
        safe_exec(
            "UPDATE procurement_centres SET supported_crops = 'Rice,Paddy,Cotton,Maize,Chilli' WHERE supported_crops IS NULL OR supported_crops = ''",
            "UPDATE procurement_centres SET supported_crops = 'Rice,Paddy,Cotton,Maize,Chilli' WHERE supported_crops IS NULL OR supported_crops = ''",
            "default supported_crops"
        )

        # Seed default product categories (Paddy and Cotton)
        try:
            with engine.connect() as conn:
                existing_paddy = conn.execute(text("SELECT id FROM categories WHERE name = 'Paddy'")).first()
                if not existing_paddy:
                    conn.execute(text("INSERT INTO categories (name, description, status, created_at) VALUES ('Paddy', 'Paddy & Rice Grain Procurement (ధాన్యం)', 'ACTIVE', CURRENT_TIMESTAMP)"))
                    conn.commit()
                
                existing_cotton = conn.execute(text("SELECT id FROM categories WHERE name = 'Cotton'")).first()
                if not existing_cotton:
                    conn.execute(text("INSERT INTO categories (name, description, status, created_at) VALUES ('Cotton', 'Cotton & Fiber Procurement (ప్రత్తి)', 'ACTIVE', CURRENT_TIMESTAMP)"))
                    conn.commit()

                paddy_row = conn.execute(text("SELECT id FROM categories WHERE name = 'Paddy'")).first()
                if paddy_row:
                    paddy_id = paddy_row[0]
                    conn.execute(text(f"UPDATE dealer_profiles SET category_id = {paddy_id} WHERE category_id IS NULL"))
                    conn.commit()
        except Exception as e:
            logger.warning(f"Category migration check: {e}")

    except Exception as err:
        logger.error(f"Migration execution notice: {err}")

if __name__ == "__main__":
    run_migrations()
