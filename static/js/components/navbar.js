function renderHeader() {
  const user = state.currentUser;
  const lang = i18n.currentLang;
  const unread = state.unreadNotificationsCount;

  return `
    <header class="agri-gradient text-white sticky top-0 z-40 shadow-lg">
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        
        <!-- App Brand Logo -->
        <div class="flex items-center gap-3 cursor-pointer" onclick="state.setActiveTab('home')">
          <div class="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white font-bold text-xl shadow-inner">
            🌾
          </div>
          <div>
            <h1 class="font-bold text-base sm:text-lg leading-tight tracking-wide drop-shadow-sm">${i18n.t("app_title")}</h1>
            <p class="text-xs text-emerald-100/90 font-medium hidden sm:block">${i18n.t("app_subtitle")}</p>
          </div>
        </div>

        <!-- Controls: Language Toggle, Notifications, Profile & Logout -->
        <div class="flex items-center gap-2 sm:gap-4">
          
          <!-- Language Toggle Switcher -->
          <div class="bg-black/20 backdrop-blur-md p-1 rounded-lg border border-white/20 flex items-center text-xs font-semibold">
            <button onclick="i18n.setLanguage('en')" class="px-2 py-1 rounded ${lang === 'en' ? 'bg-white text-emerald-800 font-bold shadow' : 'text-emerald-100 hover:text-white'} transition">
              EN
            </button>
            <button onclick="i18n.setLanguage('te')" class="px-2 py-1 rounded ${lang === 'te' ? 'bg-white text-emerald-800 font-bold shadow' : 'text-emerald-100 hover:text-white'} transition">
              తెలుగు
            </button>
          </div>

          ${user ? `
            <!-- Notification Bell Icon -->
            <button onclick="toggleNotificationDrawer()" class="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition text-white">
              <i data-lucide="bell" class="w-5 h-5"></i>
              ${unread > 0 ? `
                <span class="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-emerald-800 shadow">
                  ${unread > 9 ? '9+' : unread}
                </span>
              ` : ''}
            </button>

            <!-- User Avatar & Logout -->
            <div class="hidden sm:flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20">
              <div class="text-right">
                <p class="text-xs font-bold text-white leading-none">${user.name}</p>
                <span class="text-[10px] font-semibold text-emerald-200 uppercase tracking-wider">${i18n.t('role_' + user.role.toLowerCase())}</span>
              </div>
              <button onclick="logoutUser()" title="Logout" class="p-1.5 text-emerald-200 hover:text-red-300 transition">
                <i data-lucide="log-out" class="w-4 h-4"></i>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </header>
  `;
}

function renderMobileBottomNav() {
  const user = state.currentUser;
  if (!user) return '';

  const activeTab = state.activeTab;

  let items = [];

  if (user.role === 'FARMER') {
    items = [
      { id: 'home', icon: 'home', label: i18n.t('nav_home') },
      { id: 'book_slot', icon: 'calendar-plus', label: i18n.t('nav_book_slot') },
      { id: 'live_queue', icon: 'clock', label: i18n.t('nav_queue') },
      { id: 'receipts', icon: 'receipt', label: i18n.t('nav_receipts') },
      { id: 'payments', icon: 'credit-card', label: i18n.t('nav_payments') }
    ];
  } else if (user.role === 'DEALER') {
    items = [
      { id: 'home', icon: 'home', label: i18n.t('nav_home') },
      { id: 'scan_qr', icon: 'qr-code', label: i18n.t('nav_scan_qr') },
      { id: 'transactions', icon: 'history', label: i18n.t('nav_receipts') }
    ];
  } else if (user.role === 'ADMIN') {
    items = [
      { id: 'dashboard', icon: 'layout-dashboard', label: i18n.t('nav_dashboard') },
      { id: 'approvals', icon: 'user-check', label: i18n.t('nav_approvals') },
      { id: 'centres', icon: 'warehouse', label: i18n.t('nav_centres') },
      { id: 'admin_payments', icon: 'banknote', label: i18n.t('nav_payments') },
      { id: 'complaints', icon: 'message-square', label: i18n.t('nav_complaints') }
    ];
  }

  return `
    <nav class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-2xl sm:hidden">
      <div class="flex items-center justify-around py-1">
        ${items.map(item => `
          <button onclick="state.setActiveTab('${item.id}')" class="mobile-nav-item ${activeTab === item.id ? 'active' : ''}">
            <i data-lucide="${item.icon}" class="w-5 h-5 mb-0.5"></i>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>
    </nav>
  `;
}
