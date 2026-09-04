import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from .database import Base

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    DEALER = "DEALER"
    FARMER = "FARMER"

class DealerStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"

class BookingStatus(str, enum.Enum):
    BOOKED = "BOOKED"
    ARRIVED = "ARRIVED"
    VERIFIED = "VERIFIED"
    PROCUREMENT_STARTED = "PROCUREMENT_STARTED"
    PROCUREMENT_COMPLETED = "PROCUREMENT_COMPLETED"
    CANCELLED = "CANCELLED"

class QueueStatus(str, enum.Enum):
    WAITING = "WAITING"
    IN_SERVICE = "IN_SERVICE"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"

class PaymentStatus(str, enum.Enum):
    PAYMENT_PENDING = "PAYMENT_PENDING"
    PAYMENT_PROCESSING = "PAYMENT_PROCESSING"
    PAYMENT_COMPLETED = "PAYMENT_COMPLETED"
    PAYMENT_FAILED = "PAYMENT_FAILED"

class NotificationType(str, enum.Enum):
    BOOKING = "BOOKING"
    QUEUE = "QUEUE"
    PROCUREMENT = "PROCUREMENT"
    PAYMENT = "PAYMENT"
    SYSTEM = "SYSTEM"
    APPROVAL = "APPROVAL"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=False)
    role = Column(String, default=UserRole.FARMER)
    password_hash = Column(String, nullable=False)
    is_email_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True)
    verification_expires = Column(DateTime, nullable=True)
    language_preference = Column(String, default="en") # "en" or "te"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    farmer_profile = relationship("FarmerProfile", back_populates="user", uselist=False)
    dealer_profile = relationship("DealerProfile", back_populates="user", uselist=False)
    notifications = relationship("Notification", back_populates="user")
    bookings = relationship("Booking", back_populates="farmer")

class FarmerProfile(Base):
    __tablename__ = "farmer_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    aadhaar_last4 = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    village = Column(String, nullable=True)
    district = Column(String, nullable=True)
    state = Column(String, default="Telangana")
    pincode = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    bank_account_no = Column(String, nullable=True)
    ifsc_code = Column(String, nullable=True)
    land_size_acres = Column(Float, default=2.5)

    user = relationship("User", back_populates="farmer_profile")

class DealerProfile(Base):
    __tablename__ = "dealer_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    business_name = Column(String, nullable=False)
    mobile_number = Column(String, nullable=False)
    email = Column(String, nullable=False)
    address = Column(Text, nullable=False)
    government_id_type = Column(String, default="GSTIN")
    government_id_number = Column(String, nullable=False)
    license_number = Column(String, nullable=False)
    status = Column(String, default=DealerStatus.PENDING)
    assigned_centre_id = Column(Integer, ForeignKey("procurement_centres.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    verification_documents_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="dealer_profile")
    assigned_centre = relationship("ProcurementCentre", back_populates="dealers")

class ProcurementCentre(Base):
    __tablename__ = "procurement_centres"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    location = Column(String, nullable=False)
    district = Column(String, nullable=False)
    pincode = Column(String, nullable=False)
    contact_phone = Column(String, nullable=False)
    daily_capacity = Column(Integer, default=100) # In farmers/slots per day
    operating_hours = Column(String, default="08:00 AM - 05:00 PM")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    slots = relationship("Slot", back_populates="centre")
    bookings = relationship("Booking", back_populates="centre")
    dealers = relationship("DealerProfile", back_populates="assigned_centre")
    queue_entries = relationship("QueueEntry", back_populates="centre")

class Slot(Base):
    __tablename__ = "slots"

    id = Column(Integer, primary_key=True, index=True)
    centre_id = Column(Integer, ForeignKey("procurement_centres.id"), nullable=False)
    date = Column(String, nullable=False) # Format: YYYY-MM-DD
    start_time = Column(String, nullable=False) # e.g. 09:00 AM
    end_time = Column(String, nullable=False)   # e.g. 10:00 AM
    capacity = Column(Integer, default=15)
    booked_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    centre = relationship("ProcurementCentre", back_populates="slots")
    bookings = relationship("Booking", back_populates="slot")

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    booking_code = Column(String, unique=True, index=True, nullable=False) # e.g. BOOK-8F72A91C
    token_number = Column(String, nullable=False)                         # e.g. PDC-1042
    farmer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    centre_id = Column(Integer, ForeignKey("procurement_centres.id"), nullable=False)
    slot_id = Column(Integer, ForeignKey("slots.id"), nullable=False)
    crop_type = Column(String, nullable=False)                           # e.g. Paddy / Paddy (ధాన్యం)
    expected_quantity_quintals = Column(Float, nullable=False)
    status = Column(String, default=BookingStatus.BOOKED)
    qr_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    farmer = relationship("User", back_populates="bookings")
    centre = relationship("ProcurementCentre", back_populates="bookings")
    slot = relationship("Slot", back_populates="bookings")
    queue_entry = relationship("QueueEntry", back_populates="booking", uselist=False)
    transaction = relationship("ProcurementTransaction", back_populates="booking", uselist=False)

class QueueEntry(Base):
    __tablename__ = "queue_entries"

    id = Column(Integer, primary_key=True, index=True)
    centre_id = Column(Integer, ForeignKey("procurement_centres.id"), nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    token_number = Column(String, nullable=False)
    position = Column(Integer, nullable=False)
    status = Column(String, default=QueueStatus.WAITING)
    estimated_wait_minutes = Column(Integer, default=15)
    called_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    centre = relationship("ProcurementCentre", back_populates="queue_entries")
    booking = relationship("Booking", back_populates="queue_entry")

class ProcurementTransaction(Base):
    __tablename__ = "procurement_transactions"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    farmer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    dealer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    centre_id = Column(Integer, ForeignKey("procurement_centres.id"), nullable=False)
    actual_quantity_quintals = Column(Float, nullable=False)
    quality_grade = Column(String, default="Grade A")
    rate_per_quintal = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    weighment_slip_no = Column(String, nullable=False)
    transaction_time = Column(DateTime, default=datetime.utcnow)

    booking = relationship("Booking", back_populates="transaction")
    payment = relationship("Payment", back_populates="transaction", uselist=False)

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("procurement_transactions.id"), nullable=False)
    farmer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String, default=PaymentStatus.PAYMENT_PENDING)
    payment_method = Column(String, default="Direct Bank Transfer (DBT)")
    bank_utr = Column(String, nullable=True)
    failure_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transaction = relationship("ProcurementTransaction", back_populates="payment")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    title_te = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    message_te = Column(Text, nullable=True)
    type = Column(String, default=NotificationType.SYSTEM)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, nullable=True)
    actor_role = Column(String, nullable=True)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user_name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String, default="OPEN")
    response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class PendingFarmerRegistration(Base):
    __tablename__ = "pending_farmer_registrations"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    language_preference = Column(String, default="en")
    extra_data = Column(Text, nullable=True) # JSON serialized optional farmer profile fields
    otp_hash = Column(String, nullable=False) # Salted SHA-256 cryptographic hash (never plaintext)
    otp_expires_at = Column(DateTime, nullable=False)
    attempts_left = Column(Integer, default=5, nullable=False)
    last_sent_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

