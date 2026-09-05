const ROLE_ALLOWED_TABS = {
  ADMIN: ['dashboard', 'approvals', 'centres', 'admin_payments', 'complaints'],
  FARMER: ['home', 'book_slot', 'live_queue', 'receipts', 'payments'],
  DEALER: ['home', 'scan_qr', 'process_procurement_form', 'transactions']
};

class AppStateStore {
  constructor() {
    this.currentUser = null;
    this.activeTab = "login";
    this.notifications = [];
    this.unreadNotificationsCount = 0;
    this.activeBookingForQR = null;
    this.activeReceiptData = null;
    this.scannedQRResult = null;
    this.listeners = [];
  }

  setCurrentUser(user) {
    this.currentUser = user;
    if (!user) {
      this.activeTab = 'login';
      if (window.history && window.history.replaceState) {
        window.history.replaceState({ tab: 'login' }, '', '#login');
      }
    } else {
      const allowed = ROLE_ALLOWED_TABS[user.role] || (user.role === 'ADMIN' ? ['dashboard'] : ['home']);
      if (!allowed.includes(this.activeTab) || this.activeTab === 'login') {
        this.activeTab = user.role === 'ADMIN' ? 'dashboard' : 'home';
      }
      if (window.history && window.history.replaceState) {
        window.history.replaceState({ tab: this.activeTab }, '', '#' + this.activeTab);
      }
    }
    this.notify();
  }

  setActiveTab(tab, pushHistory = true) {
    if (!this.currentUser) {
      this.activeTab = 'login';
      if (window.history && window.history.replaceState) {
        window.history.replaceState({ tab: 'login' }, '', '#login');
      }
      this.notify();
      return;
    }

    const role = this.currentUser.role;
    const allowed = ROLE_ALLOWED_TABS[role] || (role === 'ADMIN' ? ['dashboard'] : ['home']);
    const defaultTab = role === 'ADMIN' ? 'dashboard' : 'home';
    let safeTab = tab;
    if (!allowed.includes(tab)) {
      safeTab = defaultTab;
    }

    if (this.activeTab === safeTab) {
      if (window.location.hash !== '#' + safeTab) {
        if (window.history && (pushHistory ? window.history.pushState : window.history.replaceState)) {
          const fn = pushHistory ? window.history.pushState.bind(window.history) : window.history.replaceState.bind(window.history);
          fn({ tab: safeTab }, '', '#' + safeTab);
        }
      }
      return;
    }
    const prevTab = this.activeTab;
    this.activeTab = safeTab;

    // Clean up camera hardware if leaving scan_qr
    if (prevTab === 'scan_qr' && safeTab !== 'scan_qr' && typeof stopCameraScanner === 'function') {
      stopCameraScanner();
    }

    if (window.history && (pushHistory ? window.history.pushState : window.history.replaceState)) {
      const fn = pushHistory ? window.history.pushState.bind(window.history) : window.history.replaceState.bind(window.history);
      fn({ tab: safeTab }, '', '#' + safeTab);
    }
    this.notify();
  }

  setNotifications(data) {
    this.notifications = data.notifications || [];
    this.unreadNotificationsCount = data.unread_count || 0;
    this.notify();
  }

  setBookingForQR(booking) {
    this.activeBookingForQR = booking;
    this.notify();
  }

  setReceiptData(receipt) {
    this.activeReceiptData = receipt;
    this.notify();
  }

  setScannedQRResult(res) {
    this.scannedQRResult = res;
    this.notify();
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }
}

const state = new AppStateStore();
