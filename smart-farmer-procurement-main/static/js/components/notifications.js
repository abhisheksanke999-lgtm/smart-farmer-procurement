let notificationDrawerOpen = false;

function toggleNotificationDrawer() {
  notificationDrawerOpen = !notificationDrawerOpen;
  renderApp();
}

function renderNotificationDrawer() {
  if (!notificationDrawerOpen) return '';

  const notifs = state.notifications;
  const lang = i18n.currentLang;

  return `
    <div class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity">
      <div class="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col transform transition-transform duration-300">
        
        <!-- Drawer Header -->
        <div class="p-4 agri-gradient text-white flex items-center justify-between shadow-md">
          <div class="flex items-center gap-2">
            <i data-lucide="bell-ring" class="w-5 h-5"></i>
            <h3 class="font-bold text-lg">Notification Centre</h3>
          </div>
          <div class="flex items-center gap-2">
            ${state.unreadNotificationsCount > 0 ? `
              <button onclick="markAllNotificationsRead()" class="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg border border-white/30 font-medium transition">
                Mark all read
              </button>
            ` : ''}
            <button onclick="toggleNotificationDrawer()" class="p-1 rounded-lg hover:bg-white/20 text-white">
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
            <div class="p-3.5 rounded-xl border ${n.is_read ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800' : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 shadow-sm'} transition">
              <div class="flex items-start justify-between gap-2 mb-1">
                <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  ${n.type}
                </span>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  ${n.created_at}
                </span>
              </div>
              <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100 mb-0.5">
                ${lang === 'te' ? (n.title_te || n.title) : n.title}
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                ${lang === 'te' ? (n.message_te || n.message) : n.message}
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
    await api.markAllNotificationsRead();
    const updated = await api.getNotifications();
    state.setNotifications(updated);
  } catch (e) {
    console.error(e);
  }
}
