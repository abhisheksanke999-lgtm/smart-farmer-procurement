# Smart Farmer Procurement Management System (SIH Problem Statement 26032)

A production-quality **mobile-first Farmer Procurement Management Application** designed to reduce farmer waiting time, congestion at procurement centres, schedule uncertainty, and payment status confusion.

---

## 🌟 Key Features

1. **User Roles & Security (RBAC)**:
   - **Admin / Government Head**: Full control over procurement centres, daily slot capacity, dealer approvals/rejections/suspensions, payment disbursements, audit logs, and analytics. Default Admin email: `abhisheksanke999@gmail.com`.
   - **Procurement Dealers**: Mandatory Admin verification (`PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`). Only `APPROVED` dealers can scan QR codes and enter weighments.
   - **Farmers**: Profile management, slot booking, real-time queue tracking, digital token/QR pass, digital receipt viewer, and Direct Bank Transfer (DBT) payment tracking.

2. **Mandatory Email Verification**:
   - Verification token generation and verification status banner (`Email Verified ✓` vs `Email Verification Required`).

3. **Mandatory In-App & Push Notification Hub**:
   - In-app Notification Centre with unread badges, timestamping, event categories (Booking, Queue, Procurement, Payment, Approval), and push token registration.

4. **Farmer Slot Booking System**:
   - Select procurement centre, date, time slot, crop (Paddy, Cotton, Maize, Red Chilli), and expected quantity in Quintals.
   - Real-time capacity lock prevents overbooking.
   - Generates unique `Booking Code` (e.g. `BOOK-8F72A91C`) and `Digital Token` (e.g. `PDC-1042`).

5. **QR Code Generator & Dealer Scanner**:
   - Dynamic canvas QR generation containing secure booking identifier.
   - Mobile camera QR scanner for dealers (Camera scan / Image upload / Manual input).
   - Validates booking existence, centre assignment, slot validity, and single-use policy. Returns `VALID BOOKING ✓`.

6. **Procurement Weighment & Digital Receipt**:
   - Dealers enter actual weighment (Quintals), quality grade (Grade A/B/C), MSP rate per quintal, auto-calculates total payout, and issues an itemized Digital Receipt.

7. **Real-Time Queue Engine**:
   - Dynamic position tracking (`YOUR TOKEN: PDC-1042`, `CURRENT TOKEN: PDC-1038`, `AHEAD OF YOU: 3`, `ESTIMATED WAIT: 25 MINUTES`).

8. **Direct Bank Transfer (DBT) Payment Tracker**:
   - 1-Click government disbursement triggering bank UTR reference generation (`PAYMENT_PENDING` -> `PAYMENT_COMPLETED`).

9. **Multilingual Support**:
   - Full UI localization for **English** and **Telugu (తెలుగు)** with instant toggle.

10. **Future AI/ML Extension Hooks**:
    - Backend endpoints for wait-time prediction (`/api/ml/predict-wait-time`), arrival forecasting (`/api/ml/demand-forecast`), and anomaly detection (`/api/ml/anomaly-detection`).

---

## 🚀 Quick Setup & Execution

### Prerequisites
- Python 3.10+ (FastAPI, Uvicorn, SQLAlchemy, PyJWT, bcrypt pre-installed)

### Running the Application
```bash
python run.py
```
Access the application in your browser at:
`http://localhost:8000`

---

## 🔑 Seed Test Accounts

| Role | Email | Password | Status / Notes |
| :--- | :--- | :--- | :--- |
| **Government Admin** | `abhisheksanke999@gmail.com` | `AdminPass@123` | Active Government Authority |
| **Approved Dealer** | `dealer.approved@example.com` | `DealerPass@123` | Assigned to Warangal Centre |
| **Pending Dealer** | `dealer.pending@example.com` | `DealerPass@123` | Pending Admin Approval |
| **Verified Farmer** | `ramu.farmer@example.com` | `FarmerPass@123` | Active Token PDC-1042 |
| **Verified Farmer 2**| `srinivas.farmer@example.com` | `FarmerPass@123` | Completed Procurement & DBT |
