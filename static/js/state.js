class AppStateStore {
  constructor() {
    this.currentUser = null;
    this.activeTab = "home";
    this.notifications = [];
    this.unreadNotificationsCount = 0;
    this.activeBookingForQR = null;
    this.activeReceiptData = null;
    this.scannedQRResult = null;
    this.listeners = [];
  }

  setCurrentUser(user) {
    this.currentUser = user;
    this.notify();
  }

  setActiveTab(tab, pushHistory = true) {
    if (this.activeTab === tab) return;
    const prevTab = this.activeTab;
    this.activeTab = tab;

    // Clean up camera hardware if leaving scan_qr
    if (prevTab === 'scan_qr' && tab !== 'scan_qr' && typeof stopCameraScanner === 'function') {
      stopCameraScanner();
    }

    if (pushHistory && window.history && window.history.pushState) {
      window.history.pushState({ tab: tab }, '', '#' + tab);
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
