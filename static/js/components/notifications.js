let notificationDrawerOpen = false;

function toggleNotificationDrawer() {
  notificationDrawerOpen = !notificationDrawerOpen;
  const container = document.getElementById("notification-drawer-container");
  if (container) {
    container.innerHTML = renderNotificationDrawer();
    if (window.lucide) {
      lucide.createIcons();
    }
  } else {
    renderApp();
  }

  // Refresh notifications asynchronously without blocking the UI
  if (notificationDrawerOpen && state.currentUser) {
    api.getNotifications().then(notifs => {
      state.notifications = notifs.notifications || [];
      state.unreadNotificationsCount = notifs.unread_count || 0;
      const c = document.getElementById("notification-drawer-container");
      if (c && notificationDrawerOpen) {
        c.innerHTML = renderNotificationDrawer();
        if (window.lucide) lucide.createIcons();
      }
      updateNotificationBadgeUI();
    }).catch(err => console.warn("Background notification refresh:", err));
  }
}

function updateNotificationBadgeUI() {
  const badge = document.getElementById("header-unread-badge");
  const unread = state.unreadNotificationsCount;
  if (badge) {
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.classList.remove("hidden");
      badge.classList.add("flex");
    } else {
      badge.classList.remove("flex");
      badge.classList.add("hidden");
    }
  }
}

function renderNotificationDrawer() {
  if (!notificationDrawerOpen) return '';

  const notifs = state.notifications || [];
  const lang = i18n.currentLang;

  return `
    <div class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity" onclick="if(event.target === this) toggleNotificationDrawer()">
      <div class="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col transform transition-transform duration-200">
        
        <!-- Drawer Header -->
        <div class="p-4 agri-gradient text-white flex items-center justify-between shadow-md">
          <div class="flex items-center gap-2">
            <i data-lucide="bell-ring" class="w-5 h-5"></i>
            <h3 class="font-bold text-lg">Notification Centre</h3>
          </div>
          <div class="flex items-center gap-2">
            ${state.unreadNotificationsCount > 0 ? `
              <button onclick="markAllNotificationsRead()" class="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg border border-white/30 font-medium transition cursor-pointer">
                Mark all read
              </button>
            ` : ''}
            <button onclick="toggleNotificationDrawer()" class="p-1 rounded-lg hover:bg-white/20 text-white cursor-pointer" title="Close">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <!-- Notification List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          ${notifs.length === 0 ? `
            <div class="text-center py-12 text-slate-400 dark:text-slate-500">
              <i data-lucide="bell-off" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
              <p class="font-medium text-sm">No notifications found</p>
            </div>
          ` : notifs.map(n => `
            <div class="p-3.5 rounded-xl border ${n.is_read ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800' : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/80 shadow-sm'} transition">
              <div class="flex items-start justify-between gap-2 mb-1">
                <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  ${escapeHtml(n.type || 'NOTIFICATION')}
                </span>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  ${escapeHtml(n.created_at || '')}
                </span>
              </div>
              <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100 mb-0.5">
                ${escapeHtml(lang === 'te' ? (n.title_te || n.title) : n.title)}
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                ${escapeHtml(lang === 'te' ? (n.message_te || n.message) : n.message)}
              </p>
            </div>
          `).join('')}
        </div>

        <div class="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
          Push & Foreground Notification Dispatcher Active ✓
        </div>
      </div>
    </div>
  `;
}

async function markAllNotificationsRead() {
  try {
    // Optimistically update locally in 0ms
    state.unreadNotificationsCount = 0;
    if (state.notifications) {
      state.notifications.forEach(n => { n.is_read = true; });
    }
    const container = document.getElementById("notification-drawer-container");
    if (container) {
      container.innerHTML = renderNotificationDrawer();
      if (window.lucide) lucide.createIcons();
    }
    updateNotificationBadgeUI();

    // Call API in background
    await api.markAllNotificationsRead();
  } catch (e) {
    console.error("Failed to mark all notifications read:", e);
  }
}

function formatNotificationMessage(msg) {
  if (!msg) return '';
  const lines = msg.split('\n');
  if (lines.length > 1) {
    return lines.map(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0];
        const val = parts.slice(1).join(':');
        return `<div class="flex items-start justify-between gap-2 py-0.5 border-b border-white/5 last:border-0"><span class="text-slate-400 dark:text-slate-400 font-bold text-[11px]">${escapeHtml(key)}:</span> <span class="font-bold text-white text-[11px] text-right font-mono">${escapeHtml(val.trim())}</span></div>`;
      }
      return `<div class="py-0.5">${escapeHtml(line)}</div>`;
    }).join('');
  }
  return escapeHtml(msg);
}

function showNotificationToast({ title, message, type = 'info', duration = 6000, onClick = null } = {}) {
  let toastContainer = document.getElementById("sf-toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "sf-toast-container";
    toastContainer.className = "fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0";
    document.body.appendChild(toastContainer);
  }

  const isBooking = (title && (title.includes("Booking") || title.includes("బుకింగ్"))) || type === 'BOOKING';
  const toast = document.createElement("div");
  toast.className = `pointer-events-auto flex items-start gap-3 p-4 rounded-2xl bg-slate-900/95 text-white dark:bg-slate-900/95 dark:text-slate-100 shadow-2xl border-2 ${isBooking ? 'border-emerald-500 ring-4 ring-emerald-500/20' : 'border-teal-500'} backdrop-blur-md transform transition-all duration-300 translate-y-[-10px] opacity-0 ${onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-95' : ''}`;
  if (onClick) {
    toast.onclick = onClick;
  }

  toast.innerHTML = `
    <div class="w-10 h-10 rounded-xl ${isBooking ? 'bg-emerald-600 text-white' : 'bg-teal-600 text-white'} flex items-center justify-center font-bold flex-shrink-0 shadow-lg mt-0.5">
      <span class="text-lg">${isBooking ? '🔔' : '📢'}</span>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between gap-1 mb-1">
        <h5 class="text-xs font-black uppercase tracking-wider text-emerald-400">${escapeHtml(title || 'Notification')}</h5>
        <span class="text-[10px] text-slate-400 font-mono">Just now</span>
      </div>
      <div class="text-xs space-y-0.5 bg-black/30 p-2.5 rounded-xl border border-white/10">
        ${formatNotificationMessage(message)}
      </div>
      ${isBooking ? `<div class="mt-2 text-[10px] font-bold text-emerald-300 flex items-center gap-1"><i data-lucide="external-link" class="w-3 h-3"></i> Click to open Bookings</div>` : ''}
    </div>
  `;

  toastContainer.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-[-10px]", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-[-10px]");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration);
}
window.showNotificationToast = showNotificationToast;

// Real-Time Polling & Deduplication State
let notificationPollInterval = null;
let initialNotificationSyncDone = false;

function getSeenNotificationIds() {
  try {
    const raw = sessionStorage.getItem("sf_seen_notif_ids");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function saveSeenNotificationIds(seenSet) {
  try {
    sessionStorage.setItem("sf_seen_notif_ids", JSON.stringify(Array.from(seenSet)));
  } catch (e) {}
}

async function checkAndProcessNotifications() {
  if (!state.currentUser || !api || !api.token) return;

  try {
    const notifsData = await api.getNotifications();
    const notifs = notifsData.notifications || [];
    state.unreadNotificationsCount = notifsData.unread_count || 0;
    state.notifications = notifs;
    updateNotificationBadgeUI();

    const seenIds = getSeenNotificationIds();

    if (!initialNotificationSyncDone) {
      // First page load / refresh: record all existing notification IDs so they never duplicate toast on reload
      notifs.forEach(n => seenIds.add(n.id));
      saveSeenNotificationIds(seenIds);
      initialNotificationSyncDone = true;
      return;
    }

    // Subsequent polls: detect newly arrived unread notifications
    let hasNewDealerBooking = false;
    for (const n of notifs) {
      if (!seenIds.has(n.id) && !n.is_read) {
        seenIds.add(n.id);
        const title = (i18n.currentLang === 'te' ? (n.title_te || n.title) : n.title);
        const message = (i18n.currentLang === 'te' ? (n.message_te || n.message) : n.message);

        showNotificationToast({
          title,
          message,
          type: n.type,
          onClick: () => {
            if (state.currentUser?.role === 'DEALER') {
              state.setActiveTab('assigned_farmers');
            } else if (state.currentUser?.role === 'FARMER') {
              state.setActiveTab('bookings');
            }
          }
        });

        if (state.currentUser?.role === 'DEALER' && (n.type === 'BOOKING' || (title && (title.includes("Booking") || title.includes("బుకింగ్"))))) {
          hasNewDealerBooking = true;
        }
      }
    }

    saveSeenNotificationIds(seenIds);

    // If new booking arrived for dealer, immediately auto-refresh live views without page refresh
    if (hasNewDealerBooking && state.currentUser?.role === 'DEALER') {
      if (typeof refreshDealerAssignedFarmers === 'function') {
        refreshDealerAssignedFarmers();
      }
      if (typeof scheduleRender === 'function') {
        scheduleRender();
      }
    }
  } catch (err) {
    // Silent catch for background poll
  }
}

function startNotificationPolling() {
  if (notificationPollInterval) clearInterval(notificationPollInterval);
  checkAndProcessNotifications();
  notificationPollInterval = setInterval(checkAndProcessNotifications, 5000);
}
window.startNotificationPolling = startNotificationPolling;

function stopNotificationPolling() {
  if (notificationPollInterval) {
    clearInterval(notificationPollInterval);
    notificationPollInterval = null;
  }
  initialNotificationSyncDone = false;
}
window.stopNotificationPolling = stopNotificationPolling;


