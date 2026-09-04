const API_BASE = (() => {
  // If opened via local file:// protocol or frontend dev servers like VS Code Live Server (port 5500)
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:8000/api";
  }
  if ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.port && window.location.port !== "8000") {
    return `http://${window.location.hostname}:8000/api`;
  }
  // Production cloud domains (Railway, custom domains, etc.)
  return window.location.origin + "/api";
})();

class ApiClient {
  constructor() {
    this.token = localStorage.getItem("access_token") || null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem("access_token", token);
    } else {
      localStorage.removeItem("access_token");
    }
  }

  async request(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });
    } catch (networkErr) {
      console.error(`Network Error [${endpoint}]:`, networkErr);
      throw new Error(
        `Unable to reach backend server at ${API_BASE}. Please make sure the Python server is running (run 'python run.py').`
      );
    }

    let data;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (jsonErr) {
        data = { message: `Invalid JSON response from server (Status: ${response.status})` };
      }
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 150) || `Server returned HTTP ${response.status} ${response.statusText}` };
      }
    }

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes("/auth/login")) {
        this.setToken(null);
        if (typeof state !== 'undefined' && state.currentUser) {
          state.setCurrentUser(null);
        }
      }
      throw new Error(data.detail || data.message || `Request failed with status ${response.status}`);
    }

    return data;
  }

  // Auth Endpoints
  async login(email, password) {
    const res = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.setToken(res.access_token);
    try {
      const fullUser = await this.getCurrentUser();
      if (fullUser) {
        res.user = fullUser;
      }
    } catch (e) {}
    return res;
  }

  async register(data) {
    return await this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async verifyEmail(email, token = null) {
    return await this.request("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, token })
    });
  }

  async verifyOTP(email, otp) {
    return await this.request("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp })
    });
  }

  async resendOTP(email) {
    return await this.request("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  }

  async getCurrentUser() {
    if (!this.token) {
      return null;
    }
    try {
      return await this.request("/auth/me");
    } catch (err) {
      this.setToken(null);
      return null;
    }
  }

  // Farmer Endpoints
  async getCentres() {
    return await this.request("/farmer/centres");
  }

  async getSlots(centreId, date = null) {
    let url = `/farmer/slots?centre_id=${centreId}`;
    if (date) url += `&date=${date}`;
    return await this.request(url);
  }

  async bookSlot(centreId, slotId, cropType, expectedQuantity) {
    return await this.request("/farmer/book-slot", {
      method: "POST",
      body: JSON.stringify({
        centre_id: centreId,
        slot_id: slotId,
        crop_type: cropType,
        expected_quantity_quintals: parseFloat(expectedQuantity)
      })
    });
  }

  async getFarmerBookings() {
    return await this.request("/farmer/bookings");
  }

  async getLiveQueue(bookingCode = null) {
    let url = "/farmer/queue-status";
    if (bookingCode) url += `?booking_code=${bookingCode}`;
    return await this.request(url);
  }

  async getFarmerReceipts() {
    return await this.request("/farmer/receipts");
  }

  async getFarmerPayments() {
    return await this.request("/farmer/payments");
  }

  // Dealer Endpoints
  async scanQRCode(bookingCode) {
    return await this.request("/dealer/scan-qr", {
      method: "POST",
      body: JSON.stringify({ booking_code: bookingCode })
    });
  }

  async processProcurement(bookingCode, actualQty, grade, rate, slipNo) {
    return await this.request("/dealer/process-procurement", {
      method: "POST",
      body: JSON.stringify({
        booking_code: bookingCode,
        actual_quantity_quintals: parseFloat(actualQty),
        quality_grade: grade,
        rate_per_quintal: parseFloat(rate),
        weighment_slip_no: slipNo
      })
    });
  }

  async getDealerTransactions() {
    return await this.request("/dealer/transactions");
  }

  // Admin Endpoints
  async getAdminStats() {
    return await this.request("/admin/dashboard-stats");
  }

  async getDealers(statusFilter = null) {
    let url = "/admin/dealers";
    if (statusFilter) url += `?status_filter=${statusFilter}`;
    return await this.request(url);
  }

  async updateDealerStatus(dealerId, status, rejectionReason = null) {
    return await this.request("/admin/update-dealer-status", {
      method: "POST",
      body: JSON.stringify({
        dealer_id: dealerId,
        status,
        rejection_reason: rejectionReason
      })
    });
  }

  async getFarmers() {
    return await this.request("/admin/farmers");
  }

  async createCentre(data) {
    return await this.request("/admin/centres", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async getAllPayments() {
    return await this.request("/admin/payments");
  }

  async processPayment(paymentId) {
    return await this.request(`/admin/process-payment/${paymentId}`, {
      method: "POST"
    });
  }

  async getAuditLogs() {
    return await this.request("/admin/audit-logs");
  }

  // Notification Endpoints
  async getNotifications() {
    return await this.request("/notifications");
  }

  async markNotificationRead(id) {
    return await this.request(`/notifications/${id}/read`, { method: "POST" });
  }

  async markAllNotificationsRead() {
    return await this.request("/notifications/read-all", { method: "POST" });
  }
}

const api = new ApiClient();
