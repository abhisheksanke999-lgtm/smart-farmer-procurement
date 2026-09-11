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
    confirm_password: Optional[str] = None
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
    category_id: Optional[int] = None
    address: Optional[str] = None
    verification_documents: Optional[dict] = None

class CategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    status: str = "ACTIVE"

    class Config:
        from_attributes = True

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
    status: str # APPROVED, REJECTED, SUSPENDED, ACTIVE
    rejection_reason: Optional[str] = None

# Farmer status change
class FarmerStatusUpdate(BaseModel):
    farmer_id: int
    status: str # ACTIVE, INACTIVE, BLOCKED
    reason: Optional[str] = None

# Slot booking schema
class SlotBookingCreate(BaseModel):
    centre_id: int
    slot_id: int
    crop_type: str
    expected_quantity_quintals: float
    dealer_id: Optional[int] = None
    category_id: Optional[int] = None

# Farmer Dealer Assignment schemas
class FarmerDealerAssignmentCreate(BaseModel):
    product_name: str
    centre_id: int
    dealer_id: int
    slot_id: int
    expected_quantity_quintals: float = 40.0
    category_id: Optional[int] = None

# QR Scan Request
class QRScanRequest(BaseModel):
    booking_code: str # accepts booking_code, token_number, assignment_code, or qr_token

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

# MSP Rate schemas
class MSPRateCreate(BaseModel):
    crop_name: str
    rate_per_quintal: float
    season: str
    effective_from: str
    status: str = "ACTIVE"
    notes: Optional[str] = None

class MSPRateUpdate(BaseModel):
    crop_name: Optional[str] = None
    rate_per_quintal: Optional[float] = None
    season: Optional[str] = None
    effective_from: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class MSPRateOut(BaseModel):
    id: int
    crop_name: str
    rate_per_quintal: float
    season: str
    effective_from: str
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Farmer Profile Schemas
class FarmerProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    land_size_acres: Optional[float] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    ifsc_code: Optional[str] = None

class FarmerProfileOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    role: str
    is_email_verified: bool
    address: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = "Telangana"
    land_size_acres: Optional[float] = 2.5
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    aadhaar_last4: Optional[str] = None

# Dealer Profile Schemas
class DealerProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    business_name: Optional[str] = None
    address: Optional[str] = None
    assigned_centre_id: Optional[int] = None
    category_id: Optional[int] = None
    daily_capacity_quintals: Optional[float] = None
    daily_requirements: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    ifsc_code: Optional[str] = None

class DealerProfileOut(BaseModel):
    id: int
    user_id: int
    name: str
    email: str
    phone: str
    role: str
    business_name: str
    address: str
    government_id_type: str
    government_id_number: str
    license_number: str
    status: str
    assigned_centre_id: Optional[int] = None
    centre_name: Optional[str] = None
    centre_code: Optional[str] = None
    centre_district: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    daily_capacity_quintals: Optional[float] = 500.0
    daily_requirements: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    is_email_verified: bool = True
    rejection_reason: Optional[str] = None
    verification_documents: Optional[dict] = None

class DealerDocUploadRequest(BaseModel):
    document_key: str
    file_name: str
    file_data: str
    file_size: Optional[str] = "1.2 MB"
    issuer: Optional[str] = None
    document_number: Optional[str] = None




