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
      localStorage.removeItem("sf_current_user");
    }
  }

  getCachedUser() {
    try {
      const raw = localStorage.getItem("sf_current_user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
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

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 15000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal
      });
    } catch (networkErr) {
      clearTimeout(timeoutId);
      if (networkErr.name === 'AbortError') {
        console.error(`Request Timeout [${endpoint}]: exceeded ${timeoutMs}ms`);
        throw new Error(`Request timed out while connecting to ${endpoint}. Please check server connectivity and retry.`);
      }
      console.error(`Network Error [${endpoint}]:`, networkErr);
      throw new Error(
        `Unable to reach backend server at ${API_BASE}. Please make sure the server is active and accessible.`
      );
    } finally {
      clearTimeout(timeoutId);
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
  async login(email, password, role = null) {
    const payload = { email, password };
    if (role) payload.role = role;
    const res = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
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

  async logout() {
    try {
      if (this.token) {
        await this.request("/auth/logout", { method: "POST" });
      }
    } catch (e) {
      console.warn("Backend logout notification notice:", e);
    } finally {
      this.setToken(null);
    }
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
      localStorage.removeItem("sf_current_user");
      return null;
    }
    try {
      const user = await this.request("/auth/me");
      if (user) {
        localStorage.setItem("sf_current_user", JSON.stringify(user));
      }
      return user;
    } catch (err) {
      this.setToken(null);
      localStorage.removeItem("sf_current_user");
      return null;
    }
  }

  // Farmer Endpoints
  async getCentres(crop = null) {
    let url = "/farmer/centres";
    if (crop) url += `?crop=${encodeURIComponent(crop)}`;
    return await this.request(url);
  }

  async getPublicCentres() {
    return await this.request("/auth/centres");
  }

  async getCategories() {
    return await this.request("/auth/categories");
  }

  async getServerTime() {
    return await this.request("/farmer/server-time");
  }

  async getDealersByCentre(centreId = null, crop = null, categoryId = null) {
    let url = "/farmer/dealers?";
    const params = [];
    if (centreId) params.push(`centre_id=${encodeURIComponent(centreId)}`);
    if (crop) params.push(`crop=${encodeURIComponent(crop)}`);
    if (categoryId) params.push(`category_id=${encodeURIComponent(categoryId)}`);
    return await this.request(url + params.join("&"));
  }

  async createFarmerDealerAssignment(data) {
    return await this.request("/farmer/create-assignment", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async getFarmerActiveAssignment() {
    return await this.request("/farmer/active-assignment");
  }

  async cancelFarmerAssignment(assignmentId) {
    return await this.request(`/farmer/cancel-assignment/${assignmentId}`, {
      method: "POST"
    });
  }

  async getSlots(centreId, date = null) {
    let url = `/farmer/slots?centre_id=${centreId}`;
    if (date) url += `&date=${date}`;
    return await this.request(url);
  }

  async bookSlot(centreId, slotId, cropType, expectedQuantity, dealerId = null) {
    return await this.request("/farmer/book-slot", {
      method: "POST",
      body: JSON.stringify({
        centre_id: centreId,
        slot_id: slotId,
        crop_type: cropType,
        expected_quantity_quintals: parseFloat(expectedQuantity),
        dealer_id: dealerId
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

  async getProcurementCentreStatus(centreId = null) {
    let url = "/farmer/centre-status";
    if (centreId) url += `?centre_id=${centreId}`;
    return await this.request(url);
  }

  // Dealer Endpoints
  async scanQRCode(bookingCode) {
    return await this.request("/dealer/scan-qr", {
      method: "POST",
      body: JSON.stringify({ booking_code: bookingCode })
    });
  }

  async getDealerAssignedFarmers() {
    return await this.request("/dealer/assigned-farmers");
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

  async getAdminAssignments() {
    return await this.request("/admin/farmer-dealer-assignments");
  }

  async getDealers(statusFilter = null) {
    let url = "/admin/dealers";
    if (statusFilter) url += `?status_filter=${statusFilter}`;
    return await this.request(url);
  }

  async getDealerDetails(dealerId) {
    return await this.request(`/admin/dealers/${dealerId}/details`);
  }

  async updateDealerStatus(dealerId, status, rejectionReason = null) {
    return await this.request("/admin/update-dealer-status", {
      method: "POST",
      body: JSON.stringify({
        dealer_id: parseInt(dealerId, 10),
        status,
        rejection_reason: rejectionReason
      })
    });
  }

  async getFarmers() {
    return await this.request("/admin/farmers");
  }

  async getFarmerDetails(farmerId) {
    return await this.request(`/admin/farmers/${farmerId}/details`);
  }

  async updateFarmerStatus(farmerId, status, reason = null) {
    return await this.request("/admin/update-farmer-status", {
      method: "POST",
      body: JSON.stringify({
        farmer_id: parseInt(farmerId, 10),
        status,
        reason
      })
    });
  }

  async getAdminCentres() {
    return await this.request("/admin/centres");
  }

  async toggleCentreStatus(centreId) {
    return await this.request(`/admin/centres/${centreId}/toggle-status`, {
      method: "POST"
    });
  }

  async getLiveActivity() {
    return await this.request("/admin/live-activity");
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

  // Analytics & MSP Rates Endpoints
  async getAdminAnalytics() {
    return await this.request("/admin/analytics");
  }

  async getMspRates() {
    return await this.request("/admin/msp-rates");
  }

  async createMspRate(data) {
    return await this.request("/admin/msp-rates", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async updateMspRate(rateId, data) {
    return await this.request(`/admin/msp-rates/${rateId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  }

  async deleteMspRate(rateId) {
    return await this.request(`/admin/msp-rates/${rateId}`, {
      method: "DELETE"
    });
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
