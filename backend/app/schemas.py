from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

# Auth & User schemas
class UserLogin(BaseModel):
    email: EmailStr
    password: str
    role: Optional[str] = None

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    role: str = "FARMER"
    language_preference: str = "en"
    # Farmer specific fields
    aadhaar_last4: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    bank_account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    land_size_acres: Optional[float] = 2.5
    # Dealer specific fields
    business_name: Optional[str] = None
    government_id_type: Optional[str] = "GSTIN"
    government_id_number: Optional[str] = None
    license_number: Optional[str] = None
    assigned_centre_id: Optional[int] = None
    address: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class EmailVerificationRequest(BaseModel):
    email: EmailStr
    token: Optional[str] = None

class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str

class OTPResendRequest(BaseModel):
    email: EmailStr

# Dealer status change
class DealerStatusUpdate(BaseModel):
    dealer_id: int
    status: str # APPROVED, REJECTED, SUSPENDED
    rejection_reason: Optional[str] = None

# Slot booking schema
class SlotBookingCreate(BaseModel):
    centre_id: int
    slot_id: int
    crop_type: str
    expected_quantity_quintals: float

# QR Scan Request
class QRScanRequest(BaseModel):
    booking_code: str

# Procurement Transaction Create
class ProcurementCreate(BaseModel):
    booking_code: str
    actual_quantity_quintals: float
    quality_grade: str = "Grade A"
    rate_per_quintal: float
    weighment_slip_no: str

# Centre Create/Update
class ProcurementCentreCreate(BaseModel):
    name: str
    code: str
    location: str
    district: str
    pincode: str
    contact_phone: str
    daily_capacity: int = 100
    operating_hours: str = "08:00 AM - 05:00 PM"

# Complaint Create
class ComplaintCreate(BaseModel):
    subject: str
    description: str

class ComplaintResponse(BaseModel):
    complaint_id: int
    response: str
