function getLiveIstFormatted() {
  try {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return formatter.format(new Date());
  } catch (e) {
    return new Date().toLocaleTimeString();
  }
}

let liveClockInterval = null;
function startLiveIstClock() {
  if (liveClockInterval) return;
  liveClockInterval = setInterval(() => {
    const el = document.getElementById('navbar-live-ist-clock');
    if (el) el.textContent = getLiveIstFormatted();
  }, 1000);
}
startLiveIstClock();

function renderHeader() {
  const user = state.currentUser;
  const lang = i18n.currentLang;
  const unread = state.unreadNotificationsCount;
  const isDark = (typeof themeManager !== 'undefined') ? themeManager.getTheme() === 'dark' : false;

  return `
    <header class="agri-gradient text-white sticky top-0 z-40 shadow-lg w-full">
      <div class="w-full px-4 sm:px-6 py-2.5 flex items-center justify-between relative min-h-[60px]">

        <!-- Far Left: IST Live Clock -->
        <div class="flex items-center justify-start flex-shrink-0 z-10">
          <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/25 hover:bg-black/35 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow-inner select-none transition" title="Official Indian Standard Time (IST / Asia/Kolkata)">
            <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-300 animate-pulse"></i>
            <span id="navbar-live-ist-clock" class="font-mono text-emerald-100 tracking-wide font-extrabold text-[11px] sm:text-xs whitespace-nowrap">
              ${getLiveIstFormatted()}
            </span>
            <span class="px-1.5 py-0.5 rounded bg-emerald-950/80 text-[10px] font-black text-emerald-300 border border-emerald-500/40 hidden sm:inline-block">IST</span>
          </div>
        </div>

        <!-- Absolute Center: Brand Logo & Title -->
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer group z-0 px-2 pointer-events-auto"
             onclick="state.setActiveTab(state.currentUser?.role === 'ADMIN' ? 'dashboard' : 'home')">
          <div class="flex items-center gap-2.5 sm:gap-3.5 text-center">
            <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center border border-white/30 text-white font-black text-xl sm:text-2xl shadow-inner group-hover:scale-105 transition-transform flex-shrink-0">
              🌾
            </div>
            <div class="text-center sm:text-left">
              <h1 class="font-black text-base sm:text-xl md:text-2xl leading-tight tracking-wide drop-shadow-md group-hover:text-amber-200 transition-colors whitespace-nowrap">
                ${i18n.t("app_title")}
              </h1>
              <p class="text-[11px] sm:text-xs md:text-sm text-emerald-100/95 font-semibold hidden sm:block tracking-wide whitespace-nowrap">
                ${i18n.t("app_subtitle")}
              </p>
            </div>
          </div>
        </div>

        <!-- Far Right: Controls -->
        <div class="flex items-center gap-1.5 sm:gap-2.5 z-10 flex-shrink-0">

          <!-- Dark / Light Mode Toggle -->
          <button type="button"
                  onclick="themeManager.toggleTheme()"
                  class="theme-toggle-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 backdrop-blur-md border border-white/20 text-xs font-semibold text-white transition shadow-sm active:scale-95 cursor-pointer"
                  aria-label="${isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}"
                  title="${isDark ? 'Switch to Light Mode (☀️)' : 'Switch to Dark Mode (🌙)'}">
            <span class="theme-toggle-icon flex items-center justify-center">
              ${isDark
                ? '<i data-lucide="sun" class="w-4 h-4 text-amber-300"></i>'
                : '<i data-lucide="moon" class="w-4 h-4 text-emerald-100"></i>'}
            </span>
            <span class="theme-toggle-label hidden sm:inline font-bold">
              ${isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          <!-- Language Toggle -->
          <div class="bg-black/20 backdrop-blur-md p-1 rounded-lg border border-white/20 flex items-center text-xs font-semibold">
            <button onclick="i18n.setLanguage('en')" class="px-2 py-1 rounded ${lang === 'en' ? 'bg-white text-emerald-800 font-bold shadow' : 'text-emerald-100 hover:text-white'} transition cursor-pointer">
              EN
            </button>
            <button onclick="i18n.setLanguage('te')" class="px-2 py-1 rounded ${lang === 'te' ? 'bg-white text-emerald-800 font-bold shadow' : 'text-emerald-100 hover:text-white'} transition cursor-pointer">
              తెలుగు
            </button>
          </div>

          ${user ? `
            <!-- Notification Bell -->
            <button onclick="toggleNotificationDrawer()" class="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition text-white hover:scale-105 active:scale-95 cursor-pointer" title="Notifications">
              <i data-lucide="bell" class="w-4 h-4 sm:w-5 sm:h-5"></i>
              ${unread > 0 ? `
                <span id="header-unread-badge" class="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-extrabold text-[10px] w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center border-2 border-emerald-800 shadow">
                  ${unread > 9 ? '9+' : unread}
                </span>
              ` : `
                <span id="header-unread-badge" class="hidden absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-extrabold text-[10px] w-5 h-5 rounded-full items-center justify-center border-2 border-emerald-800 shadow"></span>
              `}
            </button>

            <!-- Profile Avatar + Name/Role pill (Desktop) -->
            <div class="hidden sm:flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 cursor-pointer hover:bg-black/30 transition"
                 onclick="${user.role !== 'ADMIN' ? "state.setActiveTab('profile')" : ''}"
                 title="${escapeHtml(user.name)} — ${i18n.t('role_' + user.role.toLowerCase())}">
              <!-- Circular Avatar with initial -->
              <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700/90 border-2 border-white/80 flex items-center justify-center text-white font-black text-xs sm:text-sm shadow flex-shrink-0">
                ${(user.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div class="text-right leading-tight">
                <p class="text-xs font-bold text-white leading-none truncate max-w-[100px]">${escapeHtml(user.name)}</p>
                <span class="text-[10px] font-semibold text-emerald-200 uppercase tracking-wider">${i18n.t('role_' + user.role.toLowerCase())}</span>
              </div>
            </div>

            <!-- Logout Button -->
            <button onclick="logoutUser()"
                    title="Logout from system"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/30 hover:bg-red-600 border border-red-300/40 text-white text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer">
              <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Logout</span>
            </button>
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
      { id: 'my_bookings', icon: 'ticket', label: 'Bookings' },
      { id: 'center_status', icon: 'building-2', label: 'Centres' },
      { id: 'receipts', icon: 'receipt', label: i18n.t('nav_receipts') },
      { id: 'logout', icon: 'log-out', label: 'Logout', isLogout: true }
    ];
  } else if (user.role === 'DEALER') {
    items = [
      { id: 'home', icon: 'home', label: i18n.t('nav_home') },
      { id: 'scan_qr', icon: 'qr-code', label: i18n.t('nav_scan_qr') },
      { id: 'transactions', icon: 'history', label: i18n.t('nav_receipts') },
      { id: 'logout', icon: 'log-out', label: 'Logout', isLogout: true }
    ];
  } else if (user.role === 'ADMIN') {
    items = [
      { id: 'dashboard', icon: 'layout-dashboard', label: i18n.t('nav_dashboard') },
      { id: 'farmers', icon: 'users', label: 'Farmers' },
      { id: 'approvals', icon: 'briefcase', label: 'Dealers' },
      { id: 'centres', icon: 'warehouse', label: i18n.t('nav_centres') },
      { id: 'admin_payments', icon: 'banknote', label: 'DBT' },
      { id: 'logout', icon: 'log-out', label: 'Logout', isLogout: true }
    ];
  }

  return `
    <nav class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-2xl sm:hidden">
      <div class="flex items-center justify-around py-1">
        ${items.map(item => `
          <button onclick="${item.isLogout ? 'logoutUser()' : `state.setActiveTab('${item.id}')`}" class="mobile-nav-item ${activeTab === item.id ? 'active' : ''} ${item.isLogout ? 'text-rose-500 hover:text-rose-700' : ''}">
            <i data-lucide="${item.icon}" class="w-5 h-5 mb-0.5"></i>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>
    </nav>
  `;
}
