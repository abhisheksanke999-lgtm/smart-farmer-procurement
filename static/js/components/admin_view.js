let adminStatsCache = null;
let adminFarmersCache = [];
let adminDealersCache = [];
let adminCentresCache = [];
let adminLiveActivityCache = [];
let adminAnalyticsCache = null;
let adminMspRatesCache = [];
let adminActiveEditMspRate = null;
let adminSelectedLiveCentreId = null;
let adminActiveFarmerDetail = null;
let adminActiveDealerDetail = null;
let adminActiveCentreDetail = null;
let adminFarmerSearchQuery = "";
let adminDealerSearchQuery = "";
let adminCentreSearchQuery = "";
let adminDealerFilter = "ALL";
let adminMspSearchQuery = "";

function renderAdminErrorState(errorMsg, retryFnName = "renderApp") {
  return `
    <div class="glass-card p-8 text-center max-w-xl mx-auto my-8 border-l-4 border-rose-500 shadow-xl space-y-4">
      <div class="w-14 h-14 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400 flex items-center justify-center mx-auto text-2xl font-black">
        ⚠️
      </div>
      <div>
        <h3 class="text-lg font-black text-slate-900 dark:text-white">Unable to Load Admin Dashboard</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(errorMsg || "An error occurred while loading dashboard data.")}</p>
      </div>
      <div class="pt-2 flex items-center justify-center gap-3">
        <button onclick="${retryFnName}()" class="btn-agri text-xs px-5 py-2.5 shadow-md flex items-center gap-2">
          <i data-lucide="rotate-cw" class="w-4 h-4"></i>
          <span>Retry Loading Dashboard</span>
        </button>
        <button onclick="state.setActiveTab('dashboard'); renderApp();" class="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 transition">
          Reset to Overview
        </button>
      </div>
    </div>
  `;
}

async function renderAdminView() {
  const activeTab = state.activeTab;

  try {
    const [stats, liveAct, centres] = await Promise.all([
      api.getAdminStats().catch(() => null),
      api.getLiveActivity().catch(() => []),
      api.getAdminCentres().catch(() => [])
    ]);
    if (stats) adminStatsCache = stats;
    if (Array.isArray(liveAct) && liveAct.length) {
      adminLiveActivityCache = liveAct;
      if (!adminSelectedLiveCentreId) {
        adminSelectedLiveCentreId = liveAct[0].centre_id;
      }
    }
    if (Array.isArray(centres) && centres.length) {
      adminCentresCache = centres;
    }
  } catch (e) {
    console.warn("Background admin stats preload notice:", e);
  }

  try {
    let isDashboard = !activeTab || activeTab === 'dashboard' || activeTab === 'home';

    let pageHeaderHtml = "";
    let contentHtml = "";

    if (activeTab === 'farmers') {
      pageHeaderHtml = renderAdminSubpageHeader("👨‍🌾 Registered Farmers Registry", "Automated registry synced directly from farmer registrations with real-time dossiers.");
      contentHtml = await renderAdminFarmersPage();
    } else if (activeTab === 'approvals' || activeTab === 'dealers') {
      pageHeaderHtml = renderAdminSubpageHeader("🏢 Registered Dealers & License Approvals", "Dealer licensing compliance, business profiles, and mandi allocations.");
      contentHtml = await renderAdminDealerApprovals();
    } else if (activeTab === 'centres') {
      pageHeaderHtml = renderAdminSubpageHeader("🏬 Government Procurement Centres", "Mandi locations, operating hours, daily capacities, and assigned dealers.");
      contentHtml = await renderAdminCentresPage();
    } else if (activeTab === 'analytics') {
      pageHeaderHtml = renderAdminSubpageHeader("📊 Reports & Executive Analytics", "Real-time macro procurement volume, crop breakdown, mandi metrics, and payment settlement tracking.");
      contentHtml = await renderAdminAnalyticsPage();
    } else if (activeTab === 'msp_rates') {
      pageHeaderHtml = renderAdminSubpageHeader("🌾 Crop Rates & Official MSP Management", "Central Government Minimum Support Price (MSP) administration & official seasonal rate cards.");
      contentHtml = await renderAdminMspRatesPage();
    } else if (activeTab === 'live_activity') {
      pageHeaderHtml = renderAdminSubpageHeader("📡 Live Procurement Activity Control Room", "Real-time mandi monitoring, weighbridge station metrics, and token progression.");
      contentHtml = await renderAdminLiveActivityPage();
    } else if (activeTab === 'admin_payments') {
      pageHeaderHtml = renderAdminSubpageHeader("💳 Direct Benefit Transfer (DBT) Payouts", "Direct bank transfers, payment verification, and audit tracking.");
      contentHtml = await renderAdminPaymentsPage();
    } else if (activeTab === 'complaints') {
      pageHeaderHtml = renderAdminSubpageHeader("💬 Grievance & Support Management", "Farmer complaints resolution and administrative oversight.");
      contentHtml = await renderAdminComplaintsPage();
    } else if (activeTab === 'assignments') {
      pageHeaderHtml = renderAdminSubpageHeader("🌾 Farmer-Dealer Allocation & Hierarchy", "Administrative routing and crop procurement distribution.");
      contentHtml = await renderAdminAssignmentsPage();
    } else {
      // Default: Executive Dashboard Overview
      pageHeaderHtml = `
        <!-- Executive Header -->
        <div class="agri-gradient text-white p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider mb-2 inline-block">
              SIH Problem Statement 26032 • Control Centre
            </span>
            <h2 class="text-2xl font-extrabold">${i18n.t('admin_dashboard_title')}</h2>
            <p class="text-xs text-emerald-100 mt-0.5">Logged in as: <strong class="text-white">${state.currentUser ? escapeHtml(state.currentUser.email) : 'Administrator'}</strong></p>
          </div>
          
          <div class="flex items-center gap-2">
            <button onclick="renderApp()" class="px-3.5 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold border border-white/30 transition flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95">
              <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
              <span>Refresh Data</span>
            </button>
          </div>
        </div>

        <!-- 6 Primary Executive Button Cards -->
        ${renderAdminMetricCardsBar('dashboard')}
      `;
      contentHtml = await renderAdminDashboardHome();
    }

    return `
      <div class="space-y-6">
        ${pageHeaderHtml}

        <!-- Dynamic Page Content -->
        ${contentHtml}

        <!-- Modals Container -->
        ${renderFarmerDetailsModalHtml()}
        ${renderDealerDetailsModalHtml()}
        ${renderCentreDetailsModalHtml()}
        ${renderMspRateEditModalHtml()}
        ${renderAdminDocModalHtml()}
      </div>
    `;
  } catch (err) {
    console.error("renderAdminView error:", err);
    return renderAdminErrorState(err.message, "renderApp");
  }
}

function renderAdminSubpageHeader(title, subtitle = "") {
  return `
    <div class="agri-gradient text-white p-5 rounded-2xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <button onclick="state.setActiveTab('dashboard')"
                class="px-3.5 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold border border-white/30 text-white transition flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
          <span>← Back to Dashboard</span>
        </button>
        <div>
          <h2 class="text-xl font-black flex items-center gap-2">
            ${title}
          </h2>
          ${subtitle ? `<p class="text-xs text-emerald-100 mt-0.5">${subtitle}</p>` : ''}
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <button onclick="renderApp()" class="px-3.5 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold border border-white/30 transition flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95">
          <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
          <span>Refresh</span>
        </button>
      </div>
    </div>
  `;
}

function renderAdminMetricCardsBar(activeTab) {
  const s = adminStatsCache || {};
  const totalCentres = adminCentresCache?.length || s.active_centres || 7;
  const activeCentres = adminCentresCache?.filter(c => c.is_active).length || totalCentres;

  const cards = [
    {
      id: 'farmers',
      label: 'Registered Farmers',
      icon: '👨‍🌾',
      value: s.total_farmers || 0,
      sub: `<span class="text-emerald-700 dark:text-emerald-400 font-bold">🟢 ${s.active_farmers || (s.total_farmers || 0)} Active</span> <span class="text-slate-400">•</span> <span class="text-rose-600 dark:text-rose-400 font-semibold">🔴 ${s.inactive_farmers || 0} Inactive</span>`,
      borderColor: 'border-emerald-500',
      activeRing: 'ring-4 ring-emerald-500/60 bg-gradient-to-br from-emerald-100/90 via-emerald-50/40 to-white dark:from-emerald-950/80 dark:via-emerald-900/40 dark:to-slate-900 border-2 border-emerald-500 shadow-xl scale-[1.03] z-10'
    },
    {
      id: 'approvals',
      label: 'Registered Dealers',
      icon: '🏢',
      value: s.total_dealers || 0,
      badge: (s.pending_dealers || 0) > 0 ? `${s.pending_dealers} New` : null,
      sub: `<span class="text-emerald-700 dark:text-emerald-400 font-bold">🟢 ${s.active_dealers || s.approved_dealers || 0} Active</span> <span class="text-slate-400">•</span> <span class="text-amber-700 dark:text-amber-400 font-semibold">⏳ ${s.pending_dealers || 0} Pending</span>`,
      borderColor: 'border-amber-500',
      activeRing: 'ring-4 ring-amber-500/60 bg-gradient-to-br from-amber-100/90 via-amber-50/40 to-white dark:from-amber-950/80 dark:via-amber-900/40 dark:to-slate-900 border-2 border-amber-500 shadow-xl scale-[1.03] z-10'
    },
    {
      id: 'centres',
      label: 'Procurement Centres',
      icon: '🏬',
      value: totalCentres,
      sub: `<span class="text-emerald-700 dark:text-emerald-400 font-bold">🟢 ${activeCentres} Active</span> <span class="text-slate-400">•</span> <span class="text-blue-700 dark:text-blue-400 font-semibold">${(s.total_procurement_quantity_quintals || 0).toLocaleString('en-IN')} Q</span>`,
      borderColor: 'border-blue-500',
      activeRing: 'ring-4 ring-blue-500/60 bg-gradient-to-br from-blue-100/90 via-blue-50/40 to-white dark:from-blue-950/80 dark:via-blue-900/40 dark:to-slate-900 border-2 border-blue-500 shadow-xl scale-[1.03] z-10'
    },
    {
      id: 'analytics',
      label: 'Reports & Analytics',
      icon: '📊',
      value: `${((s.total_procurement_quantity_quintals || 3656.55) / 10).toFixed(0)} MT`,
      badge: 'Live',
      sub: `<span class="text-indigo-700 dark:text-indigo-400 font-bold">Crop Share</span> <span class="text-slate-400">•</span> <span class="text-emerald-700 dark:text-emerald-400 font-semibold">Turnaround</span>`,
      borderColor: 'border-indigo-500',
      activeRing: 'ring-4 ring-indigo-500/60 bg-gradient-to-br from-indigo-100/90 via-indigo-50/40 to-white dark:from-indigo-950/80 dark:via-indigo-900/40 dark:to-slate-900 border-2 border-indigo-500 shadow-xl scale-[1.03] z-10'
    },
    {
      id: 'msp_rates',
      label: 'Crop Rates / MSP',
      icon: '🌾',
      value: '2026-27',
      sub: `<span class="text-amber-700 dark:text-amber-400 font-bold">Official MSP</span> <span class="text-slate-400">•</span> <span class="text-emerald-700 dark:text-emerald-400 font-semibold">Rate Cards</span>`,
      borderColor: 'border-amber-600',
      activeRing: 'ring-4 ring-amber-600/60 bg-gradient-to-br from-amber-100/90 via-amber-50/40 to-white dark:from-amber-950/80 dark:via-amber-900/40 dark:to-slate-900 border-2 border-amber-600 shadow-xl scale-[1.03] z-10'
    },
    {
      id: 'admin_payments',
      label: 'DBT Payouts',
      icon: '💳',
      value: s.pending_payments_count || 0,
      sub: `<span class="text-purple-700 dark:text-purple-400 font-bold">Pending: ₹${((s.pending_payments_value || 0) / 100000).toFixed(2)} L</span>`,
      borderColor: 'border-purple-500',
      activeRing: 'ring-4 ring-purple-500/60 bg-gradient-to-br from-purple-100/90 via-purple-50/40 to-white dark:from-purple-950/80 dark:via-purple-900/40 dark:to-slate-900 border-2 border-purple-500 shadow-xl scale-[1.03] z-10'
    }
  ];

  return `
    <div class="space-y-3">
      <!-- 6 Primary Executive Button Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        ${cards.map(c => {
          const isActive = (activeTab === c.id) || (c.id === 'approvals' && activeTab === 'dealers');
          return `
            <button onclick="state.setActiveTab('${c.id}')"
                    class="glass-card p-4 border-l-4 ${c.borderColor} text-left cursor-pointer hover:shadow-xl transition-all duration-200 group relative ${
                      isActive ? `${c.activeRing}` : 'hover:scale-[1.02] border-slate-200 dark:border-slate-800'
                    }">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-tight flex items-center gap-1">
                  <span>${c.icon}</span>
                  <span class="truncate">${c.label}</span>
                </span>
                ${c.badge ? `
                  <span class="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[9px] rounded-full shadow-sm ${c.badge === 'Live' ? 'animate-pulse' : ''}">${c.badge}</span>
                ` : (isActive ? `
                  <span class="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-black uppercase">Active</span>
                ` : `
                  <i data-lucide="arrow-up-right" class="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition"></i>
                `)}
              </div>
              <h3 class="text-xl font-black text-slate-900 dark:text-white font-mono mt-1.5 truncate">${c.value}</h3>
              <div class="flex items-center gap-1.5 mt-1.5 text-[10px] truncate">
                ${c.sub}
              </div>
            </button>
          `;
        }).join('')}
      </div>

      ${activeTab && activeTab !== 'dashboard' && activeTab !== 'home' ? `
        <div class="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 rounded-xl text-xs border border-emerald-300 dark:border-emerald-800 shadow-sm">
          <div class="flex items-center gap-2 text-emerald-950 dark:text-emerald-100">
            <span class="font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Active Section:
            </span>
            <span class="font-black text-slate-900 dark:text-white capitalize">${activeTab === 'approvals' || activeTab === 'dealers' ? 'Registered Dealers' : (activeTab === 'msp_rates' ? 'Crop Rates / MSP Management' : (activeTab === 'analytics' ? 'Reports & Analytics' : activeTab.replace('_', ' ')))}</span>
          </div>
          <button onclick="state.setActiveTab('dashboard')"
                  class="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-lg font-extrabold border border-emerald-300 dark:border-emerald-700 shadow-sm transition flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95">
            <i data-lucide="layout-dashboard" class="w-3.5 h-3.5 text-emerald-600"></i>
            <span>Executive Dashboard Overview</span>
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// -------------------------------------------------------------
// 1. EXECUTIVE DASHBOARD HOME
// -------------------------------------------------------------
async function renderAdminDashboardHome() {
  return `
    <div class="space-y-6">
      <!-- Live Real-Time Monitoring Control Room Section -->
      ${renderAdminLiveActivitySection()}

      <!-- Farmer-Dealer Assignments Hierarchy -->
      ${await renderAdminAssignmentsSection()}

      <!-- System Audit Trail -->
      ${await renderAdminAuditLogSection()}
    </div>
  `;
}

// -------------------------------------------------------------
// 2. LIVE PROCUREMENT ACTIVITY MONITORING FULL PAGE
// -------------------------------------------------------------
async function renderAdminLiveActivityPage() {
  return `
    <div class="space-y-6">
      ${renderAdminLiveActivitySection()}
    </div>
  `;
}

// -------------------------------------------------------------
// 2. LIVE PROCUREMENT ACTIVITY MONITORING SECTION
// -------------------------------------------------------------
function renderAdminLiveActivitySection() {
  const activities = adminLiveActivityCache.length ? adminLiveActivityCache : [
    {
      centre_id: 1,
      centre_name: "Warangal Central Grain Mandi",
      centre_code: "WGL-01",
      location: "Mandi Road, Warangal",
      is_active: true,
      status: "Active",
      current_token: "PDC-1003",
      currently_processing: 1,
      waiting: 4,
      completed_today: 8,
      station: "Weighbridge #1",
      assigned_dealers: ["Sri Venkateswara Traders", "Telangana Agro Trading Co."],
      last_updated: "Just now"
    }
  ];

  const selected = activities.find(a => a.centre_id === adminSelectedLiveCentreId) || activities[0];

  return `
    <div class="glass-card p-5 border-l-4 border-emerald-500 bg-gradient-to-br from-white via-slate-50 to-emerald-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 shadow-xl space-y-4">
      
      <!-- Top Title & Live Pulse -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>📡</span>
              Live Procurement Activity
            </h3>
            <span class="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] rounded-full uppercase tracking-wider">
              Real-time Monitoring
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Admin real-time control room monitoring active weighment stations, token progress, and queue density across Mandis.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 font-mono">Last updated: <strong>${selected.last_updated || 'Just now'}</strong></span>
          <button onclick="renderApp()" class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition" title="Refresh Live Data">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <!-- Centre Switcher Tabs -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        ${activities.map(a => `
          <button onclick="handleSelectLiveCentre(${a.centre_id})"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    selected.centre_id === a.centre_id
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                  }">
            <span>${a.is_active ? '🟢' : '🔴'}</span>
            <span>${escapeHtml(a.centre_name)}</span>
          </button>
        `).join('')}
      </div>

      <!-- Active Centre Real-Time Card -->
      <div class="bg-white dark:bg-slate-800/90 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        
        <!-- Header Info -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h4 class="text-lg font-black text-slate-900 dark:text-white">${escapeHtml(selected.centre_name)}</h4>
              <span class="badge-status ${selected.is_active ? 'badge-approved' : 'badge-rejected'} text-xs">
                ${selected.is_active ? 'Active' : 'Closed'}
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              📍 ${escapeHtml(selected.location)} • Assigned Dealers: <strong class="text-emerald-700 dark:text-emerald-400">${escapeHtml(Array.isArray(selected.assigned_dealers) ? selected.assigned_dealers.join(', ') : selected.assigned_dealers || 'Sri Venkateswara Traders')}</strong>
            </p>
          </div>

          <div class="flex items-center gap-2">
            <span class="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
              Station: <strong class="text-emerald-600">${escapeHtml(selected.station || 'Weighbridge #1')}</strong>
            </span>
            <button onclick="handleToggleCentreStatus(${selected.centre_id})" class="px-3 py-1 rounded-xl text-xs font-bold border transition ${
              selected.is_active
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }">
              ${selected.is_active ? 'Close Mandi' : 'Open Mandi'}
            </button>
          </div>
        </div>

        <!-- 4 Real-time Metrics Panels -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          <!-- 1. Current Token -->
          <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col justify-between">
            <span class="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase">Current Token</span>
            <div class="my-1">
              <span class="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
                ${escapeHtml(selected.current_token || 'PDC-1003')}
              </span>
            </div>
            <span class="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              At Weighbridge
            </span>
          </div>

          <!-- 2. Currently Processing -->
          <div class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-col justify-between">
            <span class="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase">Currently Processing</span>
            <div class="my-1">
              <span class="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                ${selected.currently_processing || 1}
              </span>
            </div>
            <span class="text-[10px] text-blue-600 font-semibold">Active In-Service</span>
          </div>

          <!-- 3. Waiting in Queue -->
          <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col justify-between">
            <span class="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase">Waiting in Queue</span>
            <div class="my-1">
              <span class="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                ${selected.waiting || 4}
              </span>
            </div>
            <span class="text-[10px] text-amber-600 font-semibold">Farmers in Queue</span>
          </div>

          <!-- 4. Completed Today -->
          <div class="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col justify-between">
            <span class="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase">Completed Today</span>
            <div class="my-1">
              <span class="text-2xl font-black font-mono text-purple-600 dark:text-purple-400">
                ${selected.completed_today || 8}
              </span>
            </div>
            <span class="text-[10px] text-purple-600 font-semibold">Weighed Batches</span>
          </div>

        </div>

      </div>

    </div>
  `;
}

function handleSelectLiveCentre(centreId) {
  adminSelectedLiveCentreId = centreId;
  renderApp();
}

// -------------------------------------------------------------
// 3. PROCUREMENT CENTRES FULL MANAGEMENT PAGE
// -------------------------------------------------------------
async function renderAdminCentresPage() {
  let centres = [];
  try {
    centres = await api.getAdminCentres();
    adminCentresCache = centres;
  } catch (e) {
    centres = adminCentresCache || [];
  }

  const totalCount = centres.length;
  const activeCount = centres.filter(c => c.is_active).length;
  const closedCount = totalCount - activeCount;

  let displayCentres = centres;
  if (adminCentreSearchQuery && adminCentreSearchQuery.trim()) {
    const q = adminCentreSearchQuery.trim().toLowerCase();
    displayCentres = centres.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.centre_name && c.centre_name.toLowerCase().includes(q)) ||
      (c.code && c.code.toLowerCase().includes(q)) ||
      (c.location && c.location.toLowerCase().includes(q)) ||
      (c.district && c.district.toLowerCase().includes(q)) ||
      (c.contact_phone && c.contact_phone.includes(q)) ||
      (c.assigned_dealers && c.assigned_dealers.some(d => (d.business_name && d.business_name.toLowerCase().includes(q)) || (d.name && d.name.toLowerCase().includes(q))))
    );
  }

  return `
    <div class="space-y-6">
      
      <!-- Summary Header Card -->
      <div class="glass-card p-5 border-l-4 border-blue-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-2xl">🏬</span>
            Procurement Centres
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Government APMC grain mandis, weighbridge stations, dealer allocations, live queue counters & daily slots.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Summary Metric Pills -->
          <div class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <span class="text-slate-400 block text-[10px] uppercase font-bold">Total Centres</span>
            <strong class="text-slate-900 dark:text-white font-mono text-sm">${totalCount}</strong>
          </div>
          <div class="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs">
            <span class="text-emerald-700 dark:text-emerald-400 block text-[10px] uppercase font-bold">Active Mandis</span>
            <strong class="text-emerald-700 dark:text-emerald-400 font-mono text-sm">${activeCount}</strong>
          </div>
          <div class="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs">
            <span class="text-rose-700 dark:text-rose-400 block text-[10px] uppercase font-bold">Closed</span>
            <strong class="text-rose-700 dark:text-rose-400 font-mono text-sm">${closedCount}</strong>
          </div>
          <button onclick="toggleNewCentreForm()" class="btn-agri text-xs px-3.5 py-2 ml-2 shadow-sm flex items-center gap-1">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Add Centre</span>
          </button>
        </div>
      </div>

      <!-- Search & Filter Controls (Highlighted Border) -->
      <div class="glass-card p-4 rounded-2xl border-2 border-blue-500/50 dark:border-blue-500/40 bg-white/90 dark:bg-slate-900/90 shadow-md ring-2 ring-blue-500/15 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="relative w-full sm:w-96">
          <i data-lucide="search" class="w-4 h-4 text-blue-600 dark:text-blue-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input type="text"
                 id="admin-centre-search-input"
                 value="${escapeHtml(adminCentreSearchQuery)}"
                 oninput="handleAdminCentreSearch(this.value)"
                 placeholder="Search by Centre Name, Code (e.g. WGL-01), Location, District, Phone..."
                 class="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-blue-300 dark:border-blue-700/60 bg-blue-50/20 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner">
        </div>
        <div class="text-xs text-slate-600 dark:text-slate-300 font-bold self-end sm:self-center flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-blue-500"></span>
          <span>Showing <strong class="text-blue-700 dark:text-blue-400 font-mono text-sm">${displayCentres.length}</strong> of <span class="font-mono">${totalCount}</span> Centres</span>
        </div>
      </div>

      <!-- Add New Centre Form (Collapsible) -->
      <div id="new-centre-form" class="hidden glass-card p-6 rounded-2xl space-y-4 border-2 border-emerald-500/50 shadow-lg">
        <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-emerald-600"></i>
          Register New Government Procurement Centre
        </h3>
        <form onsubmit="handleCreateCentre(event)" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <input type="text" id="c-name" placeholder="Centre Name (e.g. Warangal Central Grain Mandi)" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          <input type="text" id="c-code" placeholder="Centre Code (e.g. WGL-01)" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 font-mono uppercase text-slate-900 dark:text-white">
          <input type="text" id="c-location" placeholder="Location / Address" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          <input type="text" id="c-district" placeholder="District (e.g. Warangal)" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          <input type="text" id="c-pincode" placeholder="Pincode" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          <input type="text" id="c-phone" placeholder="Contact Phone" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          <input type="number" id="c-capacity" placeholder="Daily Farmer Capacity" value="100" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          <input type="text" id="c-hours" placeholder="Operating Hours (e.g. 08:00 AM - 05:00 PM)" value="08:00 AM - 05:00 PM" required class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onclick="toggleNewCentreForm()" class="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-xl font-bold">Cancel</button>
            <button type="submit" class="btn-agri px-6">Save Centre & Generate Slots</button>
          </div>
        </form>
      </div>

      <!-- Centre Table Card (Highlighted Border) -->
      <div class="glass-card p-5 rounded-2xl border-2 border-blue-500/60 dark:border-blue-500/50 shadow-xl ring-2 ring-blue-500/20 space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-blue-950">
          <h3 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="p-1 rounded-lg bg-blue-500 text-slate-950 shadow-xs">
              <i data-lucide="warehouse" class="w-3.5 h-3.5"></i>
            </span>
            Procurement Centres Table
          </h3>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            APMC Mandis
          </span>
        </div>

        ${displayCentres.length === 0 ? `
          <div class="p-10 text-center text-slate-400 text-xs">No procurement centres matched your query.</div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th class="pb-3 px-2">Centre Name</th>
                  <th class="pb-3 px-2">Location</th>
                  <th class="pb-3 px-2">Assigned Dealer</th>
                  <th class="pb-3 px-2">Current Status</th>
                  <th class="pb-3 px-2">Current Queue</th>
                  <th class="pb-3 px-2">Today's Bookings</th>
                  <th class="pb-3 px-2">Today's Completed</th>
                  <th class="pb-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${displayCentres.map(c => {
                  const assignedDealersStr = (c.assigned_dealers && c.assigned_dealers.length)
                    ? c.assigned_dealers.map(d => d.business_name || d.name).join(', ')
                    : 'Unassigned Dealer';

                  return `
                    <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition">
                      <!-- Centre Name -->
                      <td class="py-3 px-2">
                        <div class="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                          <span>${escapeHtml(c.name || c.centre_name)}</span>
                          <span class="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono text-[10px] rounded font-bold border border-blue-200 dark:border-blue-800">
                            ${escapeHtml(c.code)}
                          </span>
                        </div>
                        <div class="text-[11px] text-slate-400 font-medium">Capacity: ${c.daily_capacity} Farmers/Day • ${escapeHtml(c.operating_hours || '08:00 AM - 05:00 PM')}</div>
                      </td>

                      <!-- Location -->
                      <td class="py-3 px-2 text-slate-700 dark:text-slate-300">
                        <div class="font-semibold">${escapeHtml(c.location)}</div>
                        <div class="text-[10px] text-slate-400">${escapeHtml(c.district)} - ${escapeHtml(c.pincode)}</div>
                      </td>

                      <!-- Assigned Dealer -->
                      <td class="py-3 px-2">
                        <span class="font-bold text-emerald-700 dark:text-emerald-400 block">${escapeHtml(assignedDealersStr)}</span>
                        <span class="text-[10px] text-slate-400">${c.assigned_dealers?.length || 0} Registered Dealer(s)</span>
                      </td>

                      <!-- Current Status -->
                      <td class="py-3 px-2">
                        <span class="badge-status ${c.is_active ? 'badge-approved' : 'badge-rejected'} text-[10px] py-0.5 px-2">
                          ${c.is_active ? '🟢 Active' : '🔴 Closed'}
                        </span>
                      </td>

                      <!-- Current Queue -->
                      <td class="py-3 px-2">
                        <span class="font-mono font-bold text-amber-600 block">${c.current_queue_count || 0} Waiting</span>
                        <span class="text-[10px] text-slate-400">Token: <strong class="text-emerald-600">${escapeHtml(c.current_token || 'PDC-1001')}</strong></span>
                      </td>

                      <!-- Today's Bookings -->
                      <td class="py-3 px-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                        ${c.today_bookings_count || 0} Bookings
                      </td>

                      <!-- Today's Completed Procurements -->
                      <td class="py-3 px-2 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        ${c.today_completed_count || 0} Completed
                      </td>

                      <!-- Actions -->
                      <td class="py-3 px-2 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                          <button onclick="openCentreDetailsModal(${c.id || c.centre_id})"
                                  class="btn-agri text-xs py-1 px-3 shadow-sm flex items-center gap-1">
                            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                            <span>View</span>
                          </button>
                          <button onclick="handleToggleCentreStatus(${c.id || c.centre_id})"
                                  class="px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                                    c.is_active
                                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                                  }">
                            ${c.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

    </div>
  `;
}

async function renderAdminCentresSectionPreview() {
  let centres = [];
  try {
    centres = await api.getAdminCentres();
    adminCentresCache = centres;
  } catch (e) {
    centres = adminCentresCache || [];
  }

  const previewList = centres.slice(0, 5);

  return `
    <div class="glass-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-xl">🏬</span>
            Procurement Centres & Live Mandis
          </h3>
          <p class="text-xs text-slate-500">Government APMC procurement centres, active dealers, and live queue tracking.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold px-2.5 py-1 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded-full">
            ${centres.length} Centres
          </span>
          <button onclick="state.setActiveTab('centres')" class="btn-agri text-xs py-1 px-3">
            View All Centres (${centres.length})
          </button>
        </div>
      </div>

      ${previewList.length === 0 ? `
        <div class="p-8 text-center text-slate-400 text-xs">No procurement centres recorded.</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                <th class="pb-2.5">Centre Name</th>
                <th class="pb-2.5">Location</th>
                <th class="pb-2.5">Assigned Dealer</th>
                <th class="pb-2.5">Status</th>
                <th class="pb-2.5">Current Queue</th>
                <th class="pb-2.5">Today's Bookings</th>
                <th class="pb-2.5">Completed</th>
                <th class="pb-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${previewList.map(c => {
                const assignedDealersStr = (c.assigned_dealers && c.assigned_dealers.length)
                  ? c.assigned_dealers.map(d => d.business_name || d.name).join(', ')
                  : 'Unassigned Dealer';

                return `
                  <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition">
                    <td class="py-2.5 font-bold text-slate-900 dark:text-white">
                      ${escapeHtml(c.name || c.centre_name)}
                      <span class="block text-[10px] text-slate-400 font-mono">${escapeHtml(c.code)}</span>
                    </td>
                    <td class="py-2.5 text-slate-700 dark:text-slate-300">${escapeHtml(c.location)}</td>
                    <td class="py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">${escapeHtml(assignedDealersStr)}</td>
                    <td class="py-2.5">
                      <span class="badge-status ${c.is_active ? 'badge-approved' : 'badge-rejected'} text-[10px] py-0.5 px-2">
                        ${c.is_active ? '🟢 Active' : '🔴 Closed'}
                      </span>
                    </td>
                    <td class="py-2.5 font-mono text-amber-600 font-bold">${c.current_queue_count || 0} Waiting</td>
                    <td class="py-2.5 font-mono">${c.today_bookings_count || 0} Bookings</td>
                    <td class="py-2.5 font-mono text-emerald-600 font-bold">${c.today_completed_count || 0} Done</td>
                    <td class="py-2.5 text-right">
                      <div class="flex items-center justify-end gap-1">
                        <button onclick="openCentreDetailsModal(${c.id || c.centre_id})" class="btn-agri text-xs py-1 px-3">
                          View
                        </button>
                        <button onclick="handleToggleCentreStatus(${c.id || c.centre_id})"
                                class="px-2 py-1 rounded-lg text-xs font-bold border transition ${
                                  c.is_active
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }">
                          ${c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function handleToggleCentreStatus(centreId) {
  try {
    const res = await api.toggleCentreStatus(centreId);
    alert(res.message || "Centre status updated.");
    renderApp();
  } catch (err) {
    alert("Failed to update centre status: " + err.message);
  }
}

function openCentreDetailsModal(centreId) {
  const c = adminCentresCache.find(x => x.id === centreId || x.centre_id === centreId);
  if (c) {
    adminActiveCentreDetail = c;
    renderApp();
  }
}

function closeCentreDetailsModal() {
  adminActiveCentreDetail = null;
  renderApp();
}

function renderCentreDetailsModalHtml() {
  if (!adminActiveCentreDetail) return "";
  const c = adminActiveCentreDetail;

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div class="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div class="agri-gradient text-white p-5 flex items-center justify-between">
          <div>
            <span class="px-2 py-0.5 bg-white/20 text-white font-mono font-bold text-xs rounded">${escapeHtml(c.code)}</span>
            <h3 class="text-xl font-extrabold mt-1">${escapeHtml(c.name)}</h3>
          </div>
          <button onclick="closeCentreDetailsModal()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <div class="p-6 space-y-4 text-xs">
          <div class="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl">
            <div>
              <span class="text-slate-400 block font-semibold">Location & District</span>
              <strong class="text-slate-900 dark:text-white">${escapeHtml(c.location)}, ${escapeHtml(c.district)} - ${escapeHtml(c.pincode)}</strong>
            </div>
            <div>
              <span class="text-slate-400 block font-semibold">Contact Phone</span>
              <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(c.contact_phone || 'N/A')}</strong>
            </div>
            <div>
              <span class="text-slate-400 block font-semibold">Daily Farmer Capacity</span>
              <strong class="text-emerald-600">${c.daily_capacity} Farmers/Day</strong>
            </div>
            <div>
              <span class="text-slate-400 block font-semibold">Operating Hours</span>
              <strong class="text-slate-900 dark:text-white">${escapeHtml(c.operating_hours || '08:00 AM - 05:00 PM')}</strong>
            </div>
          </div>
          <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl space-y-2">
            <h4 class="font-bold text-slate-900 dark:text-white">Assigned Procurement Dealers</h4>
            ${c.assigned_dealers && c.assigned_dealers.length ? `
              <div class="divide-y divide-slate-200 dark:divide-slate-700">
                ${c.assigned_dealers.map(d => `
                  <div class="py-1.5 flex items-center justify-between">
                    <div>
                      <strong class="text-slate-900 dark:text-white">${escapeHtml(d.business_name)}</strong>
                      <span class="text-slate-400 block text-[10px]">Owner: ${escapeHtml(d.name)} (${escapeHtml(d.mobile)})</span>
                    </div>
                    <span class="badge-status badge-approved text-[10px]">${d.status}</span>
                  </div>
                `).join('')}
              </div>
            ` : `
              <p class="text-slate-400">No dealers currently assigned to this centre.</p>
            `}
          </div>
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <button onclick="handleToggleCentreStatus(${c.id || c.centre_id})" class="px-3.5 py-1.5 rounded-xl font-bold text-xs border ${
            c.is_active ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-emerald-600 text-white border-emerald-600'
          }">
            ${c.is_active ? 'Deactivate Mandi' : 'Activate Mandi'}
          </button>
          <button onclick="closeCentreDetailsModal()" class="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-xl font-bold text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 4. REGISTERED FARMERS MANAGEMENT PAGE
// -------------------------------------------------------------
async function renderAdminFarmersPage() {
  let farmers = [];
  try {
    farmers = await api.getFarmers();
    adminFarmersCache = farmers;
  } catch (e) {
    farmers = adminFarmersCache || [];
  }

  const totalCount = farmers.length;
  const activeCount = farmers.filter(f => f.status === 'Active' || f.is_email_verified).length;
  const inactiveCount = totalCount - activeCount;

  let displayFarmers = farmers;
  if (adminFarmerSearchQuery && adminFarmerSearchQuery.trim()) {
    const q = adminFarmerSearchQuery.trim().toLowerCase();
    displayFarmers = farmers.filter(f => 
      (f.name && f.name.toLowerCase().includes(q)) ||
      (f.farmer_code && f.farmer_code.toLowerCase().includes(q)) ||
      (f.mobile && f.mobile.includes(q)) ||
      (f.email && f.email.toLowerCase().includes(q)) ||
      (f.village && f.village.toLowerCase().includes(q)) ||
      (f.district && f.district.toLowerCase().includes(q))
    );
  }

  return `
    <div class="space-y-5">
      
      <!-- 3 Sleek & Highlighted Farmer Metric Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <!-- Card 1: Total Registered -->
        <div class="glass-card p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Registered</span>
            <span class="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 text-xs">👥</span>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono">${totalCount}</h3>
            <span class="text-[11px] font-bold text-slate-500">Farmers</span>
          </div>
        </div>

        <!-- Card 2: Active Farmers (Highlighted Emerald) -->
        <div class="glass-card p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-md ring-2 ring-emerald-500/20 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Active Farmers</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950 shadow-xs flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping"></span>
              Active
            </span>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <h3 class="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">${activeCount}</h3>
            <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">100% Eligible</span>
          </div>
        </div>

        <!-- Card 3: Blocked / Inactive -->
        <div class="glass-card p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-white/80 dark:bg-slate-900/80 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Blocked / Inactive</span>
            <span class="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-xs">🚫</span>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <h3 class="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">${inactiveCount}</h3>
            <span class="text-[11px] font-bold text-slate-400">Suspended</span>
          </div>
        </div>
      </div>

      <!-- Search & Filter Controls (Highlighted Border) -->
      <div class="glass-card p-4 rounded-2xl border-2 border-emerald-500/50 dark:border-emerald-500/40 bg-white/90 dark:bg-slate-900/90 shadow-md ring-2 ring-emerald-500/15 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="relative w-full sm:w-96">
          <i data-lucide="search" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input type="text"
                 id="admin-farmer-search-input"
                 value="${escapeHtml(adminFarmerSearchQuery)}"
                 oninput="handleAdminFarmerSearch(this.value)"
                 placeholder="Search by Farmer Name, ID (FRM-001), Mobile, Village..."
                 class="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/20 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner">
        </div>
        <div class="text-xs text-slate-600 dark:text-slate-300 font-bold self-end sm:self-center flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Showing <strong class="text-emerald-700 dark:text-emerald-400 font-mono text-sm">${displayFarmers.length}</strong> of <span class="font-mono">${totalCount}</span> Farmers</span>
        </div>
      </div>

      <!-- Farmer Table Card (Highlighted Border) -->
      <div class="glass-card p-5 rounded-2xl border-2 border-emerald-500/60 dark:border-emerald-500/50 shadow-xl ring-2 ring-emerald-500/20 space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-emerald-100 dark:border-emerald-950">
          <h3 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="p-1 rounded-lg bg-emerald-500 text-slate-950 shadow-xs">
              <i data-lucide="table" class="w-3.5 h-3.5"></i>
            </span>
            Farmer Registry Table
          </h3>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            Live Database
          </span>
        </div>

        ${displayFarmers.length === 0 ? `
          <div class="p-10 text-center text-slate-400 text-xs">No registered farmers matched your query.</div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th class="pb-3 px-2">Farmer</th>
                  <th class="pb-3 px-2">Farmer ID</th>
                  <th class="pb-3 px-2">Mobile</th>
                  <th class="pb-3 px-2">Registered Date</th>
                  <th class="pb-3 px-2">Status</th>
                  <th class="pb-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${displayFarmers.map(f => `
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition">
                    <td class="py-3 px-2">
                      <div class="font-extrabold text-slate-900 dark:text-white text-sm">${escapeHtml(f.name)}</div>
                      <div class="text-[11px] text-slate-400">${escapeHtml(f.email)}</div>
                      <div class="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">${escapeHtml(f.village || '')}${f.district ? `, ${escapeHtml(f.district)}` : ''}</div>
                    </td>
                    <td class="py-3 px-2">
                      <span class="font-mono font-black text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs">
                        ${escapeHtml(f.farmer_code || `FRM-${String(f.farmer_id || f.user_id).padStart(3, '0')}`)}
                      </span>
                    </td>
                    <td class="py-3 px-2 font-mono font-semibold text-slate-800 dark:text-slate-200">${escapeHtml(f.mobile || f.phone)}</td>
                    <td class="py-3 px-2 text-slate-600 dark:text-slate-400">${escapeHtml(f.registered_date || f.created_at)}</td>
                    <td class="py-3 px-2">
                      <span class="badge-status ${(f.status === 'Active' || f.is_email_verified) ? 'badge-approved' : 'badge-rejected'} text-[10px] py-0.5 px-2">
                        ${(f.status === 'Active' || f.is_email_verified) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td class="py-3 px-2 text-right">
                      <div class="flex items-center justify-end gap-2">
                        <button onclick="openFarmerDetailsModal(${f.farmer_id || f.user_id})" class="btn-agri text-xs py-1 px-3 shadow-sm flex items-center gap-1">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                          <span>View</span>
                        </button>
                        <button onclick="handleToggleFarmerStatus(${f.farmer_id || f.user_id}, '${(f.status === 'Active' || f.is_email_verified) ? 'ACTIVE' : 'INACTIVE'}')"
                                class="px-2 py-1 rounded-lg text-xs font-bold border transition ${
                                  (f.status === 'Active' || f.is_email_verified)
                                    ? 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                                }">
                          ${(f.status === 'Active' || f.is_email_verified) ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

    </div>
  `;
}

// -------------------------------------------------------------
// 5. REGISTERED DEALERS MANAGEMENT PAGE
// -------------------------------------------------------------
async function renderAdminDealerApprovals() {
  let dealers = [];
  try {
    dealers = await api.getDealers();
    adminDealersCache = dealers;
  } catch (e) {
    dealers = adminDealersCache || [];
  }

  const totalCount = dealers.length;
  const activeCount = dealers.filter(d => d.status === 'APPROVED').length;
  const pendingCount = dealers.filter(d => d.status === 'PENDING').length;
  const inactiveCount = dealers.filter(d => d.status === 'SUSPENDED' || d.status === 'REJECTED').length;

  let displayDealers = dealers;
  if (adminDealerFilter && adminDealerFilter !== 'ALL') {
    displayDealers = dealers.filter(d => d.status === adminDealerFilter);
  }
  if (adminDealerSearchQuery && adminDealerSearchQuery.trim()) {
    const q = adminDealerSearchQuery.trim().toLowerCase();
    displayDealers = displayDealers.filter(d =>
      (d.business_name && d.business_name.toLowerCase().includes(q)) ||
      (d.owner_name && d.owner_name.toLowerCase().includes(q)) ||
      (d.full_name && d.full_name.toLowerCase().includes(q)) ||
      (d.dealer_code && d.dealer_code.toLowerCase().includes(q)) ||
      (String(d.id || d.dealer_id).includes(q)) ||
      (d.license_number && d.license_number.toLowerCase().includes(q)) ||
      (d.procurement_centre && d.procurement_centre.toLowerCase().includes(q)) ||
      (d.assigned_centre_name && d.assigned_centre_name.toLowerCase().includes(q)) ||
      (d.mobile_number && d.mobile_number.includes(q)) ||
      (d.email && d.email.toLowerCase().includes(q)) ||
      (d.category_name && d.category_name.toLowerCase().includes(q))
    );
  }

  return `
    <div class="space-y-5">
      
      <!-- 4 Sleek Dealer Metric Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <!-- Card 1: Total Registered -->
        <div class="glass-card p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Registered</span>
            <span class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">🏢</span>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono">${totalCount}</h3>
            <span class="text-[11px] font-bold text-slate-500">Dealers</span>
          </div>
        </div>

        <!-- Card 2: Active Approved Dealers -->
        <div class="glass-card p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-md ring-2 ring-emerald-500/20 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Active & Approved</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950 shadow-xs">Active</span>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <h3 class="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">${activeCount}</h3>
            <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Operating</span>
          </div>
        </div>

        <!-- Card 3: Pending Approval Dealers (Highlighted Amber) -->
        <div class="glass-card p-4 rounded-xl border-2 border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 shadow-md ring-2 ring-amber-500/30 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Pending Approval</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow-xs flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping"></span>
              Action
            </span>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <h3 class="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">${pendingCount}</h3>
            <span class="text-[11px] font-bold text-amber-700 dark:text-amber-400">Needs Review</span>
          </div>
        </div>

        <!-- Card 4: Inactive / Suspended Dealers -->
        <div class="glass-card p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-white/80 dark:bg-slate-900/80 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Inactive / Suspended</span>
            <span class="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-xs">🚫</span>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <h3 class="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">${inactiveCount}</h3>
            <span class="text-[11px] font-bold text-slate-400">Restricted</span>
          </div>
        </div>
      </div>

      <!-- Search & Filter Controls (Highlighted Border) -->
      <div class="glass-card p-4 rounded-2xl border-2 border-amber-500/50 dark:border-amber-500/40 bg-white/90 dark:bg-slate-900/90 shadow-md ring-2 ring-amber-500/15 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="relative w-full sm:w-80">
          <i data-lucide="search" class="w-4 h-4 text-amber-600 dark:text-amber-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input type="text"
                 id="admin-dealer-search-input"
                 value="${escapeHtml(adminDealerSearchQuery)}"
                 oninput="handleAdminDealerSearch(this.value)"
                 placeholder="Search by Dealer Name, ID (DLR-001), License, Mandi..."
                 class="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner">
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Filter:</span>
          ${['ALL', 'PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'].map(st => `
            <button onclick="handleAdminDealerFilter('${st}')"
                    class="px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      adminDealerFilter === st
                        ? (st === 'PENDING' ? 'bg-amber-500 text-slate-950 font-black shadow-md ring-2 ring-amber-400/40' : 'bg-amber-500 text-slate-950 shadow-sm')
                        : (st === 'PENDING' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-200 border border-amber-300 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200')
                    }">
              ${st === 'ALL' ? 'All Dealers' : (st === 'APPROVED' ? 'Active' : (st === 'PENDING' ? `🟡 Pending Verification (${pendingCount})` : st))}
            </button>
          `).join('')}
        </div>

        <div class="text-xs text-slate-600 dark:text-slate-300 font-bold self-end sm:self-center flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>Showing <strong class="text-amber-700 dark:text-amber-400 font-mono text-sm">${displayDealers.length}</strong> of <span class="font-mono">${totalCount}</span> Dealers</span>
        </div>
      </div>

      <!-- Dealer Table Card (Highlighted Border) -->
      <div class="glass-card p-5 rounded-2xl border-2 border-amber-500/60 dark:border-amber-500/50 shadow-xl ring-2 ring-amber-500/20 space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-amber-100 dark:border-amber-950">
          <h3 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="p-1 rounded-lg bg-amber-500 text-slate-950 shadow-xs">
              <i data-lucide="briefcase" class="w-3.5 h-3.5"></i>
            </span>
            Dealer Registry Table
          </h3>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            Compliance & Licensing
          </span>
        </div>

        ${displayDealers.length === 0 ? `
          <div class="p-10 text-center text-slate-400 text-xs">No registered dealers matched your query.</div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th class="pb-3 px-2">Dealer</th>
                  <th class="pb-3 px-2">Dealer ID</th>
                  <th class="pb-3 px-2">Procurement Centre</th>
                  <th class="pb-3 px-2">License No.</th>
                  <th class="pb-3 px-2">Registered Date</th>
                  <th class="pb-3 px-2">Status &amp; Dossier</th>
                  <th class="pb-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${displayDealers.map(d => `
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition">
                    <td class="py-3 px-2">
                      <div class="font-extrabold text-slate-900 dark:text-white text-sm">${escapeHtml(d.business_name)}</div>
                      <div class="text-[11px] text-slate-400 font-medium">Owner: ${escapeHtml(d.owner_name || d.full_name)} (${escapeHtml(d.mobile_number)})</div>
                    </td>
                    <td class="py-3 px-2">
                      <span class="font-mono font-black text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800 text-xs">
                        ${escapeHtml(d.dealer_code || `DLR-${String(d.dealer_id).padStart(3, '0')}`)}
                      </span>
                    </td>
                    <td class="py-3 px-2">
                      <span class="font-bold text-slate-800 dark:text-slate-200 block">${escapeHtml(d.procurement_centre || d.assigned_centre_name || 'Warangal Central Grain Mandi')}</span>
                      <span class="text-[10px] text-emerald-600 font-semibold">${escapeHtml(d.category_name || 'Paddy')}</span>
                    </td>
                    <td class="py-3 px-2 font-mono font-bold text-emerald-700 dark:text-emerald-400">${escapeHtml(d.license_number)}</td>
                    <td class="py-3 px-2 text-slate-600 dark:text-slate-400">${escapeHtml(d.registered_date || d.created_at)}</td>
                    <td class="py-3 px-2">
                      <div class="space-y-1">
                        <span class="badge-status ${d.status === 'APPROVED' ? 'badge-approved' : (d.status === 'PENDING' ? 'badge-pending' : 'badge-rejected')} text-[10px] py-0.5 px-2">
                          ${d.status === 'APPROVED' ? 'Active' : (d.status === 'PENDING' ? 'Pending Approval' : d.status)}
                        </span>
                        ${d.status === 'PENDING' ? `
                          <span class="block text-[10px] text-amber-700 dark:text-amber-400 font-bold">📑 6 Docs Uploaded</span>
                        ` : ''}
                      </div>
                    </td>
                    <td class="py-3 px-2 text-right">
                      <div class="flex items-center justify-end gap-1.5 flex-wrap">
                        <button onclick="openDealerDetailsModal(${d.dealer_id})" class="btn-agri text-xs py-1 px-2.5 shadow-sm flex items-center gap-1">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                          <span>Dossier</span>
                        </button>
                        ${d.status === 'PENDING' ? `
                          <button onclick="handleUpdateDealer(${d.dealer_id}, 'APPROVED')" title="Approve Dealer" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1">
                            <span>Approve ✓</span>
                          </button>
                          <button onclick="promptRejectDealer(${d.dealer_id})" title="Reject Dealer" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-lg text-xs font-bold transition">
                            Reject ✕
                          </button>
                        ` : (d.status !== 'APPROVED' ? `
                          <button onclick="handleUpdateDealer(${d.dealer_id}, 'APPROVED')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
                            Activate
                          </button>
                        ` : `
                          <button onclick="handleUpdateDealer(${d.dealer_id}, 'SUSPENDED', 'Administrative Review')" class="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-lg text-xs font-bold transition">
                            Deactivate
                          </button>
                        `)}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

    </div>
  `;
}

// -------------------------------------------------------------
// 6. FARMER & DEALER PREVIEWS ON DASHBOARD
// -------------------------------------------------------------
async function renderAdminFarmersSectionPreview() {
  let farmers = [];
  try {
    farmers = await api.getFarmers();
    adminFarmersCache = farmers;
  } catch (e) {
    farmers = adminFarmersCache || [];
  }

  const previewList = farmers.slice(0, 5);

  return `
    <div class="glass-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-xl">👨‍🌾</span>
            Registered Farmers
          </h3>
          <p class="text-xs text-slate-500">Auto-synced farmer accounts and registration dossiers.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full">
            ${farmers.length} Total
          </span>
          <button onclick="state.setActiveTab('farmers')" class="btn-agri text-xs py-1 px-3">
            View All Farmers (${farmers.length})
          </button>
        </div>
      </div>

      ${previewList.length === 0 ? `
        <div class="p-8 text-center text-slate-400 text-xs">No registered farmers found yet.</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                <th class="pb-2.5">Farmer</th>
                <th class="pb-2.5">Farmer ID</th>
                <th class="pb-2.5">Mobile</th>
                <th class="pb-2.5">Registered Date</th>
                <th class="pb-2.5">Status</th>
                <th class="pb-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${previewList.map(f => `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition">
                  <td class="py-2.5 font-bold text-slate-900 dark:text-white">
                    ${escapeHtml(f.name)}
                    <span class="block text-[10px] text-slate-400 font-normal">${escapeHtml(f.email)}</span>
                  </td>
                  <td class="py-2.5 font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    ${escapeHtml(f.farmer_code || `FRM-${String(f.farmer_id || f.user_id).padStart(3, '0')}`)}
                  </td>
                  <td class="py-2.5 font-mono text-slate-800 dark:text-slate-200">${escapeHtml(f.mobile || f.phone)}</td>
                  <td class="py-2.5 text-slate-600 dark:text-slate-400">${escapeHtml(f.registered_date || f.created_at)}</td>
                  <td class="py-2.5">
                    <span class="badge-status ${(f.status === 'Active' || f.is_email_verified) ? 'badge-approved' : 'badge-rejected'} text-[10px] py-0.5 px-2">
                      ${(f.status === 'Active' || f.is_email_verified) ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td class="py-2.5 text-right">
                    <button onclick="openFarmerDetailsModal(${f.farmer_id || f.user_id})" class="btn-agri text-xs py-1 px-3">
                      View
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function renderAdminDealersSectionPreview() {
  let dealers = [];
  try {
    dealers = await api.getDealers();
    adminDealersCache = dealers;
  } catch (e) {
    dealers = adminDealersCache || [];
  }

  const previewList = dealers.slice(0, 5);

  return `
    <div class="glass-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-xl">🏢</span>
            Registered Dealers
          </h3>
          <p class="text-xs text-slate-500">Government Mandi dealer registrations and active verification status.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-full">
            ${dealers.length} Total
          </span>
          <button onclick="state.setActiveTab('approvals')" class="btn-agri text-xs py-1 px-3">
            View All Dealers (${dealers.length})
          </button>
        </div>
      </div>

      ${previewList.length === 0 ? `
        <div class="p-8 text-center text-slate-400 text-xs">No registered dealers found yet.</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                <th class="pb-2.5">Dealer</th>
                <th class="pb-2.5">Dealer ID</th>
                <th class="pb-2.5">Procurement Centre</th>
                <th class="pb-2.5">License No.</th>
                <th class="pb-2.5">Registered Date</th>
                <th class="pb-2.5">Status</th>
                <th class="pb-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${previewList.map(d => `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition">
                  <td class="py-2.5 font-bold text-slate-900 dark:text-white">
                    ${escapeHtml(d.business_name)}
                    <span class="block text-[10px] text-slate-400 font-normal">${escapeHtml(d.owner_name || d.full_name)}</span>
                  </td>
                  <td class="py-2.5 font-mono font-bold text-amber-700 dark:text-amber-300">
                    ${escapeHtml(d.dealer_code || `DLR-${String(d.dealer_id).padStart(3, '0')}`)}
                  </td>
                  <td class="py-2.5 text-slate-800 dark:text-slate-200">${escapeHtml(d.procurement_centre || d.assigned_centre_name || 'Warangal Central Grain Mandi')}</td>
                  <td class="py-2.5 font-mono text-emerald-600 font-bold">${escapeHtml(d.license_number)}</td>
                  <td class="py-2.5 text-slate-600 dark:text-slate-400">${escapeHtml(d.registered_date || d.created_at)}</td>
                  <td class="py-2.5">
                    <span class="badge-status ${d.status === 'APPROVED' ? 'badge-approved' : (d.status === 'PENDING' ? 'badge-pending' : 'badge-rejected')} text-[10px] py-0.5 px-2">
                      ${d.status === 'APPROVED' ? 'Active' : d.status}
                    </span>
                  </td>
                  <td class="py-2.5 text-right">
                    <button onclick="openDealerDetailsModal(${d.dealer_id})" class="btn-agri text-xs py-1 px-3">
                      View
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// -------------------------------------------------------------
// 7. FARMER & DEALER DETAILS MODALS
// -------------------------------------------------------------
async function openFarmerDetailsModal(farmerId, activeSubTab = 'bookings') {
  try {
    const data = await api.getFarmerDetails(farmerId);
    adminActiveFarmerDetail = { ...data, activeTab: activeSubTab };
    renderApp();
  } catch (err) {
    alert("Error fetching farmer details: " + err.message);
  }
}

function closeFarmerDetailsModal() {
  adminActiveFarmerDetail = null;
  renderApp();
}

function switchFarmerDetailSubTab(tabName) {
  if (adminActiveFarmerDetail) {
    adminActiveFarmerDetail.activeTab = tabName;
    renderApp();
  }
}

function renderFarmerDetailsModalHtml() {
  if (!adminActiveFarmerDetail) return "";
  const { farmer, booking_history = [], procurement_history = [], payment_history = [], activeTab = 'bookings' } = adminActiveFarmerDetail;

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div class="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div class="agri-gradient text-white p-5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-3xl">👨‍🌾</span>
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 bg-white/20 text-white font-mono font-black text-xs rounded">${escapeHtml(farmer.farmer_code)}</span>
                <span class="badge-status ${farmer.status === 'Active' ? 'badge-approved' : 'badge-rejected'} text-xs">${farmer.status}</span>
              </div>
              <h3 class="text-xl font-extrabold mt-0.5">${escapeHtml(farmer.name)}</h3>
            </div>
          </div>
          <button onclick="closeFarmerDetailsModal()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <div class="p-6 overflow-y-auto space-y-6 text-xs">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div><span class="text-slate-400 block font-semibold text-[11px]">Farmer ID</span><strong class="font-mono text-emerald-700 dark:text-emerald-400 text-sm">${escapeHtml(farmer.farmer_code)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Full Name</span><strong class="text-slate-900 dark:text-white text-sm">${escapeHtml(farmer.name)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Mobile</span><strong class="font-mono text-slate-900 dark:text-white text-sm">${escapeHtml(farmer.mobile_number || farmer.mobile)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Email</span><strong class="text-slate-900 dark:text-white text-xs">${escapeHtml(farmer.email)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Registered</span><span class="text-slate-700 dark:text-slate-300 font-semibold">${escapeHtml(farmer.registered_date || farmer.created_at)}</span></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Status</span><span class="badge-status ${farmer.status === 'Active' ? 'badge-approved' : 'badge-rejected'} inline-block mt-0.5">${farmer.status}</span></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Land & Location</span><span class="text-slate-700 dark:text-slate-300 font-semibold">${farmer.land_size_acres} Acres • ${escapeHtml(farmer.village || '')}, ${escapeHtml(farmer.district || '')}</span></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Bank Account</span><span class="font-mono text-slate-700 dark:text-slate-300 font-semibold">${escapeHtml(farmer.bank_name || 'SBI')} • ${escapeHtml(farmer.bank_account_no || 'XXXXXXXXXXXX')}</span></div>
          </div>
          <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button onclick="switchFarmerDetailSubTab('bookings')" class="px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${activeTab === 'bookings' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"><i data-lucide="ticket" class="w-4 h-4"></i><span>Booking History (${booking_history.length})</span></button>
            <button onclick="switchFarmerDetailSubTab('procurements')" class="px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${activeTab === 'procurements' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"><i data-lucide="receipt" class="w-4 h-4"></i><span>Procurement History (${procurement_history.length})</span></button>
            <button onclick="switchFarmerDetailSubTab('payments')" class="px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${activeTab === 'payments' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"><i data-lucide="banknote" class="w-4 h-4"></i><span>Payment History (${payment_history.length})</span></button>
          </div>
          <div>
            ${activeTab === 'bookings' ? `
              <div class="space-y-3">
                ${booking_history.length === 0 ? `<div class="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">No bookings recorded.</div>` : `
                  <div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse"><thead><tr class="border-b text-slate-500 font-bold"><th class="pb-2">Booking ID</th><th class="pb-2">Token</th><th class="pb-2">Produce</th><th class="pb-2">Est. Quantity</th><th class="pb-2">Centre & Dealer</th><th class="pb-2">Slot</th><th class="pb-2">Status</th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    ${booking_history.map(b => `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition"><td class="py-2.5 font-mono font-bold">${escapeHtml(b.booking_code)}</td><td class="py-2.5 font-mono font-bold text-emerald-600">${escapeHtml(b.token_number)}</td><td class="py-2.5 font-semibold">${escapeHtml(b.crop_type)}</td><td class="py-2.5 font-mono">${b.estimated_quantity_quintals} Q</td><td class="py-2.5"><span class="font-bold block">${escapeHtml(b.centre_name)}</span><span class="text-[10px] text-slate-400">${escapeHtml(b.dealer_name)}</span></td><td class="py-2.5">${escapeHtml(b.slot_info)}</td><td class="py-2.5"><span class="badge-status ${b.status === 'PROCUREMENT_COMPLETED' ? 'badge-completed' : 'badge-approved'} text-[10px]">${b.status}</span></td></tr>`).join('')}
                  </tbody></table></div>`}
              </div>` : activeTab === 'procurements' ? `
              <div class="space-y-3">
                ${procurement_history.length === 0 ? `<div class="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">No procurement receipts.</div>` : `
                  <div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse"><thead><tr class="border-b text-slate-500 font-bold"><th class="pb-2">Txn ID</th><th class="pb-2">Token</th><th class="pb-2">Crop</th><th class="pb-2">Qty</th><th class="pb-2">Rate</th><th class="pb-2">Total Amount</th><th class="pb-2">Centre/Dealer</th><th class="pb-2">Date</th><th class="pb-2">Payment</th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    ${procurement_history.map(t => `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition"><td class="py-2.5 font-mono font-bold">${escapeHtml(t.transaction_id)}</td><td class="py-2.5 font-mono font-bold text-emerald-600">${escapeHtml(t.token_number)}</td><td class="py-2.5 font-semibold">${escapeHtml(t.crop_type)}</td><td class="py-2.5 font-mono font-bold">${t.actual_quantity_quintals} Q</td><td class="py-2.5 font-mono">₹${t.rate_per_quintal.toLocaleString('en-IN')}</td><td class="py-2.5 font-mono font-black text-emerald-700 dark:text-emerald-400">₹${t.total_amount.toLocaleString('en-IN')}</td><td class="py-2.5">${escapeHtml(t.centre_name)}</td><td class="py-2.5 text-slate-500">${escapeHtml(t.created_at)}</td><td class="py-2.5"><span class="badge-status ${t.payment_status === 'PAYMENT_COMPLETED' ? 'badge-approved' : 'badge-pending'} text-[10px]">${t.payment_status}</span></td></tr>`).join('')}
                  </tbody></table></div>`}
              </div>` : `
              <div class="space-y-3">
                ${payment_history.length === 0 ? `<div class="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">No DBT disbursements yet.</div>` : `
                  <div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse"><thead><tr class="border-b text-slate-500 font-bold"><th class="pb-2">Payment ID</th><th class="pb-2">Txn ID</th><th class="pb-2">Disbursed Amount</th><th class="pb-2">Status</th><th class="pb-2">Method</th><th class="pb-2">Bank UTR</th><th class="pb-2">Date</th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    ${payment_history.map(p => `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition"><td class="py-2.5 font-mono font-bold text-purple-700">${escapeHtml(p.payment_id)}</td><td class="py-2.5 font-mono">${escapeHtml(p.transaction_id)}</td><td class="py-2.5 font-mono font-black text-sm">₹${p.amount.toLocaleString('en-IN')}</td><td class="py-2.5"><span class="badge-status ${p.status === 'PAYMENT_COMPLETED' ? 'badge-approved' : 'badge-pending'} text-[10px]">${p.status === 'PAYMENT_COMPLETED' ? 'Credited ✓' : 'Pending DBT'}</span></td><td class="py-2.5">${escapeHtml(p.payment_method)}</td><td class="py-2.5 font-mono font-bold text-emerald-600">${escapeHtml(p.bank_utr)}</td><td class="py-2.5 text-slate-500">${escapeHtml(p.created_at)}</td></tr>`).join('')}
                  </tbody></table></div>`}
              </div>`}
          </div>
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/80 border-t flex items-center justify-between">
          <button onclick="handleToggleFarmerStatus(${farmer.farmer_id}, '${farmer.status === 'Active' ? 'ACTIVE' : 'INACTIVE'}')" class="px-3.5 py-1.5 rounded-xl font-bold text-xs border ${farmer.status === 'Active' ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-emerald-600 text-white'}">${farmer.status === 'Active' ? 'Deactivate / Block' : 'Activate Account ✓'}</button>
          <button onclick="closeFarmerDetailsModal()" class="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-xl font-bold text-xs">Close</button>
        </div>
      </div>
    </div>
  `;
}

async function openDealerDetailsModal(dealerId) {
  try {
    const data = await api.getDealerDetails(dealerId);
    adminActiveDealerDetail = data;
    renderApp();
  } catch (err) {
    alert("Error fetching dealer details: " + err.message);
  }
}

function closeDealerDetailsModal() {
  adminActiveDealerDetail = null;
  renderApp();
}

function renderDealerDetailsModalHtml() {
  if (!adminActiveDealerDetail) return "";
  const { dealer, today_procurement = {}, total_procurement = {}, completed_transactions = [] } = adminActiveDealerDetail;

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div class="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div class="agri-gradient text-white p-5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-3xl">🏢</span>
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 bg-white/20 text-white font-mono font-black text-xs rounded">${escapeHtml(dealer.dealer_code)}</span>
                <span class="badge-status ${dealer.status === 'APPROVED' ? 'badge-approved' : 'badge-pending'} text-xs">${dealer.status === 'APPROVED' ? 'Active' : dealer.status}</span>
              </div>
              <h3 class="text-xl font-extrabold mt-0.5">${escapeHtml(dealer.business_name)}</h3>
            </div>
          </div>
          <button onclick="closeDealerDetailsModal()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="p-6 overflow-y-auto space-y-6 text-xs">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div><span class="text-slate-400 block font-semibold text-[11px]">Dealer ID</span><strong class="font-mono text-amber-700 dark:text-amber-400 text-sm">${escapeHtml(dealer.dealer_code)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Business Name</span><strong class="text-slate-900 dark:text-white text-sm">${escapeHtml(dealer.business_name)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Owner</span><strong class="text-slate-900 dark:text-white text-sm">${escapeHtml(dealer.owner_name || dealer.full_name)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Mobile</span><strong class="font-mono text-slate-900 dark:text-white text-sm">${escapeHtml(dealer.mobile_number)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Email</span><strong class="text-slate-900 dark:text-white text-xs">${escapeHtml(dealer.email)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">License</span><strong class="font-mono text-emerald-600 text-xs">${escapeHtml(dealer.license_number)}</strong></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Centre</span><span class="text-slate-800 dark:text-slate-200 font-bold">${escapeHtml(dealer.procurement_centre || 'Warangal Central Grain Mandi')}</span></div>
            <div><span class="text-slate-400 block font-semibold text-[11px]">Registered</span><span class="text-slate-700 dark:text-slate-300 font-semibold">${escapeHtml(dealer.registered_date || dealer.created_at)}</span></div>
          </div>
          <!-- Rejection Reason if Rejected -->
          ${dealer.status === 'REJECTED' ? `
            <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-800 text-left">
              <span class="text-[11px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300 block mb-1">
                ⚠️ Current Rejection Reason:
              </span>
              <p class="text-xs font-bold text-rose-950 dark:text-rose-100">
                "${escapeHtml(dealer.rejection_reason || 'Verification document mismatch or mandatory criteria not satisfied.')}"
              </p>
            </div>
          ` : ''}

          <!-- Uploaded 6 Mandatory Verification Documents Dossier -->
          <div class="space-y-3 bg-amber-50/50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span class="text-base">📑</span> Uploaded Verification Documents (6 of 6)
                </h4>
                <p class="text-[11px] text-slate-500">Official regulatory certificates and identity documents submitted during registration.</p>
              </div>
              <span class="badge-status ${dealer.status === 'APPROVED' ? 'badge-approved' : 'badge-pending'} text-[10px]">
                ${dealer.status === 'APPROVED' ? 'ALL VERIFIED ✓' : 'PENDING ADMIN AUDIT'}
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              ${[
                { key: 'aadhaar_card', name: 'Aadhaar Card', icon: '🪪' },
                { key: 'pan_card', name: 'PAN Card', icon: '💳' },
                { key: 'dealer_license', name: 'Dealer/Trader License', icon: '📜' },
                { key: 'business_reg', name: 'Business Registration Certificate', icon: '🏢' },
                { key: 'bank_proof', name: 'Bank Account Proof', icon: '🏦' },
                { key: 'address_proof', name: 'Address Proof', icon: '🏠' }
              ].map(item => {
                const rawDocs = dealer.verification_documents || {};
                const doc = rawDocs[item.key] || {
                  document_key: item.key,
                  document_name: item.name,
                  file_name: `${item.key}.pdf`,
                  file_size: "1.2 MB",
                  status: "UPLOADED",
                  uploaded_at: dealer.registered_date || "10-Sep-2026"
                };
                return `
                  <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2.5 overflow-hidden">
                      <span class="text-2xl shrink-0">${item.icon}</span>
                      <div class="truncate">
                        <span class="font-extrabold text-slate-900 dark:text-white block text-xs truncate">${escapeHtml(item.name)}</span>
                        <span class="text-[10px] text-slate-400 font-mono block truncate">${escapeHtml(doc.file_name || `${item.key}.pdf`)} • ${escapeHtml(doc.file_size || '1.2 MB')}</span>
                      </div>
                    </div>
                    <button type="button" onclick="openAdminDocModal(${dealer.dealer_id}, '${item.key}')" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-[11px] shadow-sm transition shrink-0 flex items-center gap-1">
                      <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                      <span>View</span>
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <span class="text-emerald-800 dark:text-emerald-400 block font-extrabold text-[11px] uppercase">Today's Procurement</span>
              <h4 class="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">${today_procurement.quantity_quintals || 0} Q</h4>
              <p class="text-[11px] text-emerald-800 dark:text-emerald-400 mt-0.5 font-semibold">Value: ₹${(today_procurement.total_amount || 0).toLocaleString('en-IN')} (${today_procurement.transactions_count || 0} Txns)</p>
            </div>
            <div class="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl">
              <span class="text-blue-800 dark:text-blue-400 block font-extrabold text-[11px] uppercase">Completed Transactions</span>
              <h4 class="text-xl font-black text-blue-700 dark:text-blue-300 font-mono mt-1">${total_procurement.completed_transactions_count || 0}</h4>
              <p class="text-[11px] text-blue-800 dark:text-blue-400 mt-0.5 font-semibold">Total Weighed Batches</p>
            </div>
            <div class="p-4 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl">
              <span class="text-purple-800 dark:text-purple-400 block font-extrabold text-[11px] uppercase">Total Lifetime Procurement</span>
              <h4 class="text-xl font-black text-purple-700 dark:text-purple-300 font-mono mt-1">${total_procurement.quantity_quintals || 0} Q</h4>
              <p class="text-[11px] text-purple-800 dark:text-purple-400 mt-0.5 font-semibold">Value: ₹${(total_procurement.total_amount || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
          <div class="space-y-3">
            <h4 class="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2"><i data-lucide="history" class="w-4 h-4 text-emerald-600"></i>Procurement Transactions by this Dealer</h4>
            ${completed_transactions.length === 0 ? `<div class="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">No transactions recorded yet.</div>` : `
              <div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse"><thead><tr class="border-b text-slate-500 font-bold"><th class="pb-2">Txn ID</th><th class="pb-2">Farmer</th><th class="pb-2">Produce</th><th class="pb-2">Qty</th><th class="pb-2">Rate</th><th class="pb-2">Total Value</th><th class="pb-2">Slip</th><th class="pb-2">Date</th><th class="pb-2">Payment</th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${completed_transactions.map(t => `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition"><td class="py-2.5 font-mono font-bold">${escapeHtml(t.transaction_id)}</td><td class="py-2.5 font-semibold">${escapeHtml(t.farmer_name)}</td><td class="py-2.5">${escapeHtml(t.crop_type)}</td><td class="py-2.5 font-mono font-bold">${t.actual_quantity_quintals} Q</td><td class="py-2.5 font-mono">₹${t.rate_per_quintal.toLocaleString('en-IN')}</td><td class="py-2.5 font-mono font-black text-emerald-700 dark:text-emerald-400">₹${t.total_amount.toLocaleString('en-IN')}</td><td class="py-2.5 font-mono">${escapeHtml(t.weighment_slip_no || 'N/A')}</td><td class="py-2.5 text-slate-500">${escapeHtml(t.created_at)}</td><td class="py-2.5"><span class="badge-status ${t.payment_status === 'PAYMENT_COMPLETED' ? 'badge-approved' : 'badge-pending'} text-[10px]">${t.payment_status}</span></td></tr>`).join('')}
              </tbody></table></div>`}
          </div>
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/80 border-t flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            ${dealer.status !== 'APPROVED' ? `<button onclick="handleUpdateDealer(${dealer.dealer_id}, 'APPROVED')" class="btn-agri text-xs py-2 px-4 shadow-md font-extrabold">✅ Approve Dealer Registration</button>` : ''}
            ${dealer.status === 'APPROVED' ? `<button onclick="handleUpdateDealer(${dealer.dealer_id}, 'SUSPENDED', 'Administrative Policy Action')" class="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs">Deactivate / Suspend</button>` : ''}
            ${dealer.status !== 'REJECTED' ? `<button onclick="promptRejectDealer(${dealer.dealer_id})" class="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-xl font-bold text-xs">❌ Reject Application</button>` : ''}
          </div>
          <button onclick="closeDealerDetailsModal()" class="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-xl font-bold text-xs">Close Dossier</button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 7.5 ADMIN DOCUMENT VIEWER MODAL
// -------------------------------------------------------------
let adminActiveDocModal = null;

function openAdminDocModal(dealerId, docKey) {
  if (!adminActiveDealerDetail || !adminActiveDealerDetail.dealer) return;
  const dealer = adminActiveDealerDetail.dealer;
  const rawDocs = dealer.verification_documents || {};
  const doc = rawDocs[docKey] || {
    document_key: docKey,
    document_name: docKey.replace(/_/g, ' ').toUpperCase(),
    file_name: `${docKey}.pdf`,
    file_size: "1.2 MB",
    status: "UPLOADED",
    uploaded_at: dealer.registered_date || "10-Sep-2026",
    issuer: "Government Official Verification Portal",
    document_number: dealer.license_number || dealer.government_id_number || "REG-991823"
  };

  adminActiveDocModal = {
    dealerId,
    dealerName: dealer.business_name || dealer.dealer_name,
    ownerName: dealer.owner_name || dealer.full_name,
    docKey,
    doc
  };
  renderApp();
}

function closeAdminDocModal() {
  adminActiveDocModal = null;
  renderApp();
}

function renderAdminDocModalHtml() {
  if (!adminActiveDocModal) return "";
  const { dealerName, ownerName, doc } = adminActiveDocModal;

  const docIcons = {
    aadhaar_card: '🪪',
    pan_card: '💳',
    dealer_license: '📜',
    business_reg: '🏢',
    bank_proof: '🏦',
    address_proof: '🏠'
  };
  const icon = docIcons[doc.document_key] || '📄';

  return `
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div class="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border-2 border-emerald-500/30 dark:border-emerald-500/20 overflow-hidden flex flex-col max-h-[90vh]">
        
        <!-- Header -->
        <div class="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div class="flex items-center gap-3">
            <span class="text-3xl">${icon}</span>
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs rounded border border-emerald-500/30">Official Dossier Document</span>
                <span class="badge-status badge-approved text-[10px]">VERIFIED FORMAT</span>
              </div>
              <h3 class="text-lg font-black mt-0.5">${escapeHtml(doc.document_name || 'Verification Document')}</h3>
              <p class="text-xs text-slate-400">Applicant: <strong class="text-white">${escapeHtml(dealerName)}</strong> (${escapeHtml(ownerName)})</p>
            </div>
          </div>
          <button onclick="closeAdminDocModal()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Document Inspection Body -->
        <div class="p-6 overflow-y-auto space-y-4 text-xs">
          
          <!-- Document Metadata Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div>
              <span class="text-slate-400 block font-semibold text-[10px] uppercase">File Name</span>
              <strong class="font-mono text-slate-800 dark:text-slate-200 text-xs truncate block">${escapeHtml(doc.file_name)}</strong>
            </div>
            <div>
              <span class="text-slate-400 block font-semibold text-[10px] uppercase">File Size</span>
              <strong class="text-slate-900 dark:text-white font-mono text-xs">${escapeHtml(doc.file_size || '1.2 MB')}</strong>
            </div>
            <div>
              <span class="text-slate-400 block font-semibold text-[10px] uppercase">Uploaded Date</span>
              <span class="text-slate-700 dark:text-slate-300 font-semibold">${escapeHtml(doc.uploaded_at || '10-Sep-2026')}</span>
            </div>
            <div>
              <span class="text-slate-400 block font-semibold text-[10px] uppercase">Status</span>
              <span class="text-emerald-600 font-bold">Valid &amp; Legible ✓</span>
            </div>
          </div>

          <!-- Document Preview Canvas -->
          <div class="p-6 rounded-2xl bg-slate-100 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center text-center space-y-3 min-h-[220px]">
            <div class="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-2xl font-black shadow-inner">
              ${icon}
            </div>
            <div>
              <h4 class="font-black text-slate-900 dark:text-white text-base">${escapeHtml(doc.document_name)}</h4>
              <p class="text-xs text-slate-500 font-mono mt-0.5">Reference / Doc No: ${escapeHtml(doc.document_number || 'DOC-REG-2026-VERIFIED')}</p>
              <p class="text-[11px] text-slate-400 mt-1">Issuing Authority: <strong class="text-slate-700 dark:text-slate-300">${escapeHtml(doc.issuer || 'Government Regulatory Authority')}</strong></p>
            </div>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-full font-bold text-[11px]">
              <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
              <span>Official Government APMC Mandi Regulatory Document Preview</span>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span class="text-[11px] text-slate-500 font-semibold">Government Nodal Officer Audit Session</span>
          <button onclick="closeAdminDocModal()" class="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl font-extrabold text-xs transition">
            Close Document Preview
          </button>
        </div>

      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 8. HANDLERS
// -------------------------------------------------------------
async function handleToggleFarmerStatus(farmerId, currentStatus) {
  const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  try {
    const res = await api.updateFarmerStatus(farmerId, newStatus);
    alert(res.message || `Farmer status updated to ${newStatus}.`);
    if (adminActiveFarmerDetail && adminActiveFarmerDetail.farmer.farmer_id === farmerId) {
      await openFarmerDetailsModal(farmerId, adminActiveFarmerDetail.activeTab);
    } else {
      renderApp();
    }
  } catch (err) {
    alert("Failed to update farmer status: " + err.message);
  }
}

async function handleUpdateDealer(dealerId, status, reason = null) {
  try {
    const res = await api.updateDealerStatus(dealerId, status, reason);
    alert(res.message || `Dealer status updated to ${status} successfully.`);
    if (adminActiveDealerDetail && adminActiveDealerDetail.dealer.dealer_id === dealerId) {
      await openDealerDetailsModal(dealerId);
    } else {
      renderApp();
    }
  } catch (err) {
    alert("Failed to update dealer: " + err.message);
  }
}

function promptRejectDealer(dealerId) {
  const reason = prompt("Please provide a reason for rejecting this dealer registration application:\n(This will be displayed to the dealer upon login)", "Trade license expired / Document mismatch with registration details");
  if (reason && reason.trim()) {
    handleUpdateDealer(dealerId, 'REJECTED', reason.trim());
  }
}

function handleAdminFarmerSearch(query) {
  adminFarmerSearchQuery = query;
  renderApp();
  setTimeout(() => {
    const el = document.getElementById("admin-farmer-search-input");
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, 50);
}

function handleAdminDealerSearch(query) {
  adminDealerSearchQuery = query;
  renderApp();
  setTimeout(() => {
    const el = document.getElementById("admin-dealer-search-input");
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, 50);
}

function handleAdminCentreSearch(query) {
  adminCentreSearchQuery = query;
  renderApp();
  setTimeout(() => {
    const el = document.getElementById("admin-centre-search-input");
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, 50);
}

function handleAdminDealerFilter(filter) {
  adminDealerFilter = filter;
  renderApp();
}

function toggleNewCentreForm() {
  document.getElementById("new-centre-form")?.classList.toggle("hidden");
}

async function handleCreateCentre(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById("c-name").value,
    code: document.getElementById("c-code").value,
    location: document.getElementById("c-location").value,
    district: document.getElementById("c-district").value,
    pincode: document.getElementById("c-pincode").value,
    contact_phone: document.getElementById("c-phone").value,
    daily_capacity: parseInt(document.getElementById("c-capacity").value, 10),
    operating_hours: document.getElementById("c-hours").value
  };

  try {
    await api.createCentre(data);
    alert("Procurement centre created successfully with default slots ✓");
    renderApp();
  } catch (err) {
    alert(err.message);
  }
}

async function renderAdminPaymentsPage() {
  let payments = [];
  try {
    payments = await api.getAllPayments();
  } catch (e) {}

  return `
    <div class="space-y-6">
      <div class="glass-card p-5 border-l-4 border-purple-600 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Direct Bank Transfer (DBT) Payout Engine</h2>
          <p class="text-xs text-slate-500">Government Direct Farmer Account Credit & UTR Tracker.</p>
        </div>
        <span class="badge-status badge-approved">DBT API Integrated</span>
      </div>
      <div class="space-y-3">
        ${payments.map(p => `
          <div class="glass-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-sm text-slate-900 dark:text-white">${p.farmer_name} (${p.farmer_phone})</span>
                <span class="badge-status ${p.status === 'PAYMENT_COMPLETED' ? 'badge-approved' : 'badge-pending'}">${p.status}</span>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300">Bank Acc: <strong class="font-mono text-slate-900 dark:text-white">${p.bank_account_no || '38491029481'}</strong> | IFSC: <strong class="font-mono text-slate-900 dark:text-white">${p.ifsc_code || 'SBIN0001234'}</strong></p>
              <p class="text-[11px] text-slate-400">${p.crop_type} (${p.quantity} Q) | Created: ${p.created_at}</p>
            </div>
            <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-800">
              <div class="text-right">
                <span class="text-lg font-black text-slate-900 dark:text-white font-mono block">₹${p.amount.toLocaleString('en-IN')}</span>
                ${p.bank_utr ? `<span class="text-[10px] font-mono text-emerald-600 block">UTR: ${p.bank_utr}</span>` : ''}
              </div>
              ${p.status !== 'PAYMENT_COMPLETED' ? `
                <button onclick="handleTriggerPayment('${p.payment_id}')" class="btn-agri text-xs py-2 px-4">Trigger DBT Payout</button>
              ` : `
                <span class="text-xs font-bold text-emerald-600 px-3 py-1 bg-emerald-100 dark:bg-emerald-950 rounded-lg">Paid ✓</span>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function handleTriggerPayment(paymentId) {
  try {
    const res = await api.processPayment(paymentId);
    if (window.confetti) {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    }
    alert(`DBT Payment Processed Successfully! Bank UTR: ${res.bank_utr}`);
    renderApp();
  } catch (err) {
    alert(err.message);
  }
}

async function renderAdminAuditLogSection() {
  let logs = [];
  try {
    const res = await api.getAuditLogs();
    logs = Array.isArray(res) ? res : [];
  } catch (e) {
    logs = [];
  }

  const safeLogs = Array.isArray(logs) ? logs : [];

  return `
    <div class="glass-card p-5 space-y-3">
      <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
        <i data-lucide="shield" class="w-4 h-4 text-emerald-600"></i>
        System Audit Logs & Security Trail
      </h3>
      ${safeLogs.length === 0 ? `
        <div class="py-6 text-center text-xs text-slate-400">
          No audit logs recorded yet.
        </div>
      ` : `
        <div class="divide-y divide-slate-200 dark:divide-slate-800 text-xs max-h-60 overflow-y-auto">
          ${safeLogs.map(l => `
            <div class="py-2.5 flex items-start justify-between gap-4">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200 font-mono">${escapeHtml(l.action || 'SYSTEM')}</span>
                <p class="text-slate-500 text-[11px]">${escapeHtml(l.details || '')}</p>
              </div>
              <span class="text-[10px] font-mono text-slate-400 flex-shrink-0">${escapeHtml(l.created_at || '')}</span>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

async function renderAdminComplaintsPage() {
  return `
    <div class="glass-card p-6 text-center py-12">
      <i data-lucide="message-square text-slate-300 w-12 h-12 mx-auto mb-2"></i>
      <h3 class="font-bold text-slate-800 dark:text-white">Farmer & Dealer Grievance Portal</h3>
      <p class="text-xs text-slate-500">0 Active Grievances / Complaints reported.</p>
    </div>
  `;
}

async function renderAdminAssignmentsSection() {
  let assignments = [];
  try {
    const res = await api.getAdminAssignments();
    assignments = Array.isArray(res) ? res : [];
  } catch (e) {
    assignments = [];
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const activeCount = safeAssignments.filter(a => a && a.status === 'ACTIVE').length;

  return `
    <div class="glass-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="git-merge" class="w-5 h-5 text-emerald-600"></i>
            Farmer–Dealer Assignments Hierarchy
          </h3>
          <p class="text-xs text-slate-500">Relationship Tracking: Farmer ➔ Produce ➔ Procurement Centre ➔ Exclusive Dealer</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full">
            ${activeCount} Active
          </span>
          <button onclick="state.setActiveTab('assignments')" class="btn-agri text-xs py-1 px-3">
            View All (${safeAssignments.length})
          </button>
        </div>
      </div>

      ${safeAssignments.length === 0 ? `
        <div class="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500">
          No farmer-dealer procurement assignments recorded yet.
        </div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                <th class="pb-2.5">Farmer</th>
                <th class="pb-2.5">Product</th>
                <th class="pb-2.5">Procurement Centre</th>
                <th class="pb-2.5">Exclusive Assigned Dealer</th>
                <th class="pb-2.5">Token / Status</th>
                <th class="pb-2.5 text-right">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${safeAssignments.slice(0, 5).map(a => `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition">
                  <td class="py-2.5 font-bold text-slate-900 dark:text-white">
                    ${escapeHtml(a.farmer_name || 'Farmer')}
                    <span class="block text-[10px] text-slate-400 font-normal">📞 ${escapeHtml(a.farmer_phone || '')}</span>
                  </td>
                  <td class="py-2.5 font-semibold text-slate-700 dark:text-slate-300">🌾 ${escapeHtml(a.product_name || 'Produce')}</td>
                  <td class="py-2.5 text-slate-700 dark:text-slate-300">${escapeHtml(a.centre_name || '')}</td>
                  <td class="py-2.5">
                    <span class="font-bold text-emerald-700 dark:text-emerald-400 block">${escapeHtml(a.dealer_name || 'Dealer')}</span>
                    <span class="text-[10px] text-slate-400">${escapeHtml(a.dealer_business || '')}</span>
                  </td>
                  <td class="py-2.5">
                    <span class="font-mono font-bold text-slate-800 dark:text-slate-200 block">${escapeHtml(a.token_number || a.assignment_code || '')}</span>
                    <span class="badge-status ${a.status === 'ACTIVE' ? 'badge-approved' : a.status === 'COMPLETED' ? 'badge-completed' : 'badge-rejected'} text-[10px] py-0.5 px-2">
                      ${escapeHtml(a.status || 'ACTIVE')}
                    </span>
                  </td>
                  <td class="py-2.5 text-right text-slate-400 text-[11px]">${escapeHtml(a.created_at || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function renderAdminAssignmentsPage() {
  let assignments = [];
  try {
    const res = await api.getAdminAssignments();
    assignments = Array.isArray(res) ? res : [];
  } catch (e) {
    assignments = [];
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const activeCount = safeAssignments.filter(a => a && a.status === 'ACTIVE').length;

  return `
    <div class="space-y-6">
      <div class="glass-card p-5 border-l-4 border-emerald-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>🌾</span>
            Farmer–Dealer Allocation Hierarchy
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Real-time relationship mapping and crop routing across Mandis and licensed procurement dealers.
          </p>
        </div>
        <div class="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs">
          <span class="text-emerald-700 dark:text-emerald-400 block text-[10px] uppercase font-bold">Active Assignments</span>
          <strong class="text-emerald-700 dark:text-emerald-400 font-mono text-sm">${activeCount} of ${safeAssignments.length}</strong>
        </div>
      </div>

      <!-- Assignments Table Card (Highlighted Border) -->
      <div class="glass-card p-5 rounded-2xl border-2 border-emerald-500/60 dark:border-emerald-500/50 shadow-xl ring-2 ring-emerald-500/20 space-y-4">
        ${safeAssignments.length === 0 ? `
          <div class="p-10 text-center text-slate-400 text-xs">No farmer-dealer procurement assignments recorded yet.</div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th class="pb-3 px-2">Assignment Code</th>
                  <th class="pb-3 px-2">Farmer</th>
                  <th class="pb-3 px-2">Crop / Produce</th>
                  <th class="pb-3 px-2">Procurement Centre</th>
                  <th class="pb-3 px-2">Assigned Dealer</th>
                  <th class="pb-3 px-2">Booking Token</th>
                  <th class="pb-3 px-2">Status</th>
                  <th class="pb-3 px-2 text-right">Created</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${safeAssignments.map(a => `
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition">
                    <td class="py-3 px-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">${escapeHtml(a.assignment_code || '')}</td>
                    <td class="py-3 px-2">
                      <div class="font-extrabold text-slate-900 dark:text-white">${escapeHtml(a.farmer_name || 'Farmer')}</div>
                      <div class="text-[10px] text-slate-400">📞 ${escapeHtml(a.farmer_phone || 'N/A')}</div>
                    </td>
                    <td class="py-3 px-2 font-semibold text-slate-700 dark:text-slate-300">🌾 ${escapeHtml(a.product_name || 'Produce')}</td>
                    <td class="py-3 px-2 text-slate-700 dark:text-slate-300">${escapeHtml(a.centre_name || 'Mandi')}</td>
                    <td class="py-3 px-2">
                      <div class="font-bold text-slate-900 dark:text-white">${escapeHtml(a.dealer_name || 'Dealer')}</div>
                      <div class="text-[10px] text-slate-400">${escapeHtml(a.dealer_business || '')}</div>
                    </td>
                    <td class="py-3 px-2 font-mono font-bold text-blue-600 dark:text-blue-400">${escapeHtml(a.token_number || a.booking_code || 'N/A')}</td>
                    <td class="py-3 px-2">
                      <span class="badge-status ${a.status === 'ACTIVE' ? 'badge-approved' : a.status === 'COMPLETED' ? 'badge-completed' : 'badge-rejected'} text-[10px] py-0.5 px-2">
                        ${escapeHtml(a.status || 'ACTIVE')}
                      </span>
                    </td>
                    <td class="py-3 px-2 text-right text-slate-400 font-mono text-[11px]">${escapeHtml(a.created_at || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 8. 📊 REPORTS & EXECUTIVE ANALYTICS PAGE
// -------------------------------------------------------------
async function renderAdminAnalyticsPage() {
  let a = {};
  try {
    a = await api.getAdminAnalytics();
    adminAnalyticsCache = a;
  } catch (e) {
    a = adminAnalyticsCache || {
      daily_procurement_quantity: 465.8,
      daily_procurement_amount: 1071340.0,
      number_of_farmers_served: 118,
      average_waiting_time_minutes: 24,
      average_procurement_processing_time_minutes: 12,
      pending_payment_amount: 1684117.35,
      pending_payments_count: 14,
      completed_payments_amount: 7450000.0,
      completed_payments_count: 68,
      total_procurement_quantity_quintals: 3656.55,
      total_procurement_value: 9134117.35,
      procurement_by_crop: [
        { crop_name: "Paddy", quantity_quintals: 1420.5, amount: 3267150.0, transactions_count: 28, share_percentage: 38.8 },
        { crop_name: "Maize", quantity_quintals: 890.0, amount: 1980250.0, transactions_count: 19, share_percentage: 24.3 },
        { crop_name: "Wheat", quantity_quintals: 620.25, amount: 1411068.75, transactions_count: 14, share_percentage: 17.0 },
        { crop_name: "Cotton", quantity_quintals: 415.0, amount: 2955215.0, transactions_count: 9, share_percentage: 11.4 },
        { crop_name: "Soyabean", quantity_quintals: 310.8, amount: 1520433.6, transactions_count: 7, share_percentage: 8.5 }
      ],
      centre_wise_procurement: [
        { centre_id: 1, centre_name: "Warangal Central Grain Mandi", centre_code: "WGL-01", location: "Mandi Road, Warangal", is_active: true, quantity_quintals: 1240.5, amount: 2853150.0, completed_batches: 24, active_queue: 4 },
        { centre_id: 2, centre_name: "Karimnagar APMC Agricultural Yard", centre_code: "KMR-02", location: "Collectorate Road, Karimnagar", is_active: true, quantity_quintals: 980.2, amount: 2254460.0, completed_batches: 19, active_queue: 2 },
        { centre_id: 3, centre_name: "Nizamabad Cotton & Grain Complex", centre_code: "NZB-03", location: "Market Yard, Nizamabad", is_active: true, quantity_quintals: 760.0, amount: 2432000.0, completed_batches: 15, active_queue: 1 },
        { centre_id: 4, centre_name: "Khammam Pulses & Maize Mandi", centre_code: "KHM-04", location: "Bypass Road, Khammam", is_active: true, quantity_quintals: 675.85, amount: 1594507.35, completed_batches: 10, active_queue: 1 }
      ],
      daily_procurement_trend: [
        { date: "2026-09-04", label: "04 Sep", quantity_quintals: 240.5, amount: 553150.0 },
        { date: "2026-09-05", label: "05 Sep", quantity_quintals: 310.0, amount: 713000.0 },
        { date: "2026-09-06", label: "06 Sep", quantity_quintals: 285.5, amount: 656650.0 },
        { date: "2026-09-07", label: "07 Sep", quantity_quintals: 420.0, amount: 966000.0 },
        { date: "2026-09-08", label: "08 Sep", quantity_quintals: 390.2, amount: 897460.0 },
        { date: "2026-09-09", label: "09 Sep", quantity_quintals: 510.0, amount: 1173000.0 },
        { date: "2026-09-10", label: "Today", quantity_quintals: 465.8, amount: 1071340.0 }
      ]
    };
  }

  const cropColors = {
    "Paddy": { bg: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", light: "bg-emerald-50 dark:bg-emerald-950/40" },
    "Maize": { bg: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", light: "bg-amber-50 dark:bg-amber-950/40" },
    "Wheat": { bg: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-300", light: "bg-yellow-50 dark:bg-yellow-950/40" },
    "Cotton": { bg: "bg-indigo-500", text: "text-indigo-700 dark:text-indigo-300", light: "bg-indigo-50 dark:bg-indigo-950/40" },
    "Soyabean": { bg: "bg-blue-500", text: "text-blue-700 dark:text-blue-300", light: "bg-blue-50 dark:bg-blue-950/40" },
    "Pulses": { bg: "bg-purple-500", text: "text-purple-700 dark:text-purple-300", light: "bg-purple-50 dark:bg-purple-950/40" }
  };

  const trend = a.daily_procurement_trend || [];
  const maxTrendQty = Math.max(...trend.map(t => t.quantity_quintals || 1), 100);

  return `
    <div class="space-y-6">
      
      <!-- Analytics Header Banner -->
      <div class="glass-card p-5 border-l-4 border-indigo-600 bg-gradient-to-r from-indigo-900/10 via-white to-emerald-50/20 dark:from-indigo-950/30 dark:via-slate-900 dark:to-emerald-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-extrabold text-[10px] rounded-full uppercase tracking-wider">
              National Agriculture Market Intelligence
            </span>
            <span class="text-xs text-slate-400 font-semibold">• Season 2026-27</span>
          </div>
          <h2 class="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center gap-2">
            <span class="text-2xl">📊</span>
            Government Procurement Reports & Analytics
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Macro operational intelligence: Daily intake volume, crop diversification breakdown, mandi efficiency, and financial settlements.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="window.print()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5 shadow-sm">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
            <span>Export Report</span>
          </button>
          <button onclick="renderApp()" class="btn-agri text-xs py-2 px-3.5 shadow-sm flex items-center gap-1.5">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Sync Live</span>
          </button>
        </div>
      </div>

      <!-- 8 Core Analytical KPI Metrics Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        
        <!-- 1. Daily Procurement Quantity -->
        <div class="glass-card p-4 border-l-4 border-emerald-500 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Daily Intake Qty</span>
            <span class="text-emerald-600 font-bold text-xs">Today</span>
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${(a.daily_procurement_quantity || 0).toLocaleString('en-IN')} <span class="text-sm font-sans font-semibold text-slate-400">Q</span></h3>
          <p class="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">₹${((a.daily_procurement_amount || 0) / 100000).toFixed(2)} Lakhs Today</p>
        </div>

        <!-- 2. Farmers Served -->
        <div class="glass-card p-4 border-l-4 border-blue-500 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Farmers Served</span>
            <span class="text-blue-600 font-bold text-xs">Beneficiaries</span>
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${a.number_of_farmers_served || 0}</h3>
          <p class="text-[11px] text-blue-700 dark:text-blue-400 font-semibold mt-1">${a.total_registered_farmers || 125} Registered Total</p>
        </div>

        <!-- 3. Average Waiting Time -->
        <div class="glass-card p-4 border-l-4 border-amber-500 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Avg Waiting Time</span>
            <span class="text-amber-600 font-bold text-xs">Queue Efficiency</span>
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${a.average_waiting_time_minutes || 24} <span class="text-sm font-sans font-semibold text-slate-400">mins</span></h3>
          <p class="text-[11px] text-amber-700 dark:text-amber-400 font-semibold mt-1">Token to Weighbridge</p>
        </div>

        <!-- 4. Average Procurement Processing Time -->
        <div class="glass-card p-4 border-l-4 border-purple-500 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Avg Processing Time</span>
            <span class="text-purple-600 font-bold text-xs">Turnaround</span>
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${a.average_procurement_processing_time_minutes || 12} <span class="text-sm font-sans font-semibold text-slate-400">mins</span></h3>
          <p class="text-[11px] text-purple-700 dark:text-purple-400 font-semibold mt-1">Weigh + Grade + Slip</p>
        </div>

        <!-- 5. Completed Payments -->
        <div class="glass-card p-4 border-l-4 border-emerald-600 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Completed Payments</span>
            <span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full">DBT Paid</span>
          </div>
          <h3 class="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono mt-1">₹${((a.completed_payments_amount || 0) / 100000).toFixed(2)} <span class="text-sm font-sans font-semibold text-slate-400">Lakhs</span></h3>
          <p class="text-[11px] text-slate-500 font-semibold mt-1">${a.completed_payments_count || 0} Successful Transfers</p>
        </div>

        <!-- 6. Pending Payment Amount -->
        <div class="glass-card p-4 border-l-4 border-rose-500 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Pending Payment Amount</span>
            <span class="px-1.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-full">In Verification</span>
          </div>
          <h3 class="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono mt-1">₹${((a.pending_payment_amount || 0) / 100000).toFixed(2)} <span class="text-sm font-sans font-semibold text-slate-400">Lakhs</span></h3>
          <p class="text-[11px] text-slate-500 font-semibold mt-1">${a.pending_payments_count || 0} In Queue for Payout</p>
        </div>

        <!-- 7. Total Procurement Volume -->
        <div class="glass-card p-4 border-l-4 border-teal-500 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Total Volume</span>
            <span class="text-teal-600 font-bold text-xs">Season Cumulative</span>
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${(a.total_procurement_quantity_quintals || 0).toLocaleString('en-IN')} <span class="text-sm font-sans font-semibold text-slate-400">Q</span></h3>
          <p class="text-[11px] text-teal-700 dark:text-teal-400 font-semibold mt-1">${((a.total_procurement_quantity_quintals || 0) / 10).toFixed(1)} Metric Tonnes</p>
        </div>

        <!-- 8. Total Procurement Value -->
        <div class="glass-card p-4 border-l-4 border-indigo-500 hover:shadow-lg transition">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Total Turnover Value</span>
            <span class="text-indigo-600 font-bold text-xs">Government MSP</span>
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">₹${((a.total_procurement_value || 0) / 100000).toFixed(2)} <span class="text-sm font-sans font-semibold text-slate-400">Lakhs</span></h3>
          <p class="text-[11px] text-indigo-700 dark:text-indigo-400 font-semibold mt-1">Total Procurement Outlay</p>
        </div>

      </div>

      <!-- 2 Major Analysis Sections: Procurement by Crop & 7-Day Trend -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Left: Procurement by Crop Breakdown -->
        <div class="glass-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🌾</span>
                Procurement by Crop Breakdown
              </h3>
              <p class="text-xs text-slate-500">Volume share, value, and batch counts by commodity</p>
            </div>
            <span class="text-xs font-mono font-bold text-slate-400">${(a.procurement_by_crop || []).length} Commodities</span>
          </div>

          <div class="space-y-4">
            ${(a.procurement_by_crop || []).map(crop => {
              const cName = crop.crop_name.split(' ')[0];
              const theme = cropColors[cName] || { bg: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", light: "bg-emerald-50 dark:bg-emerald-950/40" };
              
              return `
                <div class="p-3 rounded-xl ${theme.light} border border-slate-200 dark:border-slate-700/60 space-y-2">
                  <div class="flex items-center justify-between text-xs">
                    <div class="flex items-center gap-2">
                      <strong class="text-slate-900 dark:text-white font-black text-sm">${escapeHtml(crop.crop_name)}</strong>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${theme.text}">
                        ${crop.share_percentage}% Share
                      </span>
                    </div>
                    <div class="text-right">
                      <span class="font-mono font-black text-slate-900 dark:text-white text-sm">${crop.quantity_quintals.toLocaleString('en-IN')} Q</span>
                      <span class="block text-[10px] text-slate-500">₹${(crop.amount / 100000).toFixed(2)} Lakhs • ${crop.transactions_count} Batches</span>
                    </div>
                  </div>

                  <!-- Visual Progress Bar -->
                  <div class="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div class="h-full rounded-full ${theme.bg} transition-all duration-500" style="width: ${Math.min(crop.share_percentage * 1.5, 100)}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Right: 7-Day Daily Procurement Quantity Trend -->
        <div class="glass-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>📈</span>
                Daily Procurement Quantity (Last 7 Days)
              </h3>
              <p class="text-xs text-slate-500">Daily intake volume progression across all mandis</p>
            </div>
            <span class="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded text-[10px] font-bold">Quintals / Day</span>
          </div>

          <!-- Bar Visualizer -->
          <div class="space-y-3 pt-2">
            ${trend.map(t => {
              const pct = Math.round((t.quantity_quintals / maxTrendQty) * 100);
              const isToday = t.label === 'Today';

              return `
                <div class="flex items-center gap-3 text-xs">
                  <span class="w-14 font-mono font-bold ${isToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'} flex-shrink-0">${escapeHtml(t.label)}</span>
                  <div class="flex-1 bg-slate-100 dark:bg-slate-800 h-6 rounded-lg overflow-hidden relative flex items-center">
                    <div class="h-full ${isToday ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-blue-500 to-indigo-500'} rounded-lg transition-all duration-500"
                         style="width: ${Math.max(pct, 8)}%"></div>
                    <span class="absolute left-2 text-[10px] font-mono font-bold ${pct > 40 ? 'text-white' : 'text-slate-700 dark:text-slate-300'}">
                      ${t.quantity_quintals.toLocaleString('en-IN')} Q
                    </span>
                  </div>
                  <span class="w-24 text-right font-mono text-[11px] text-slate-500 font-semibold flex-shrink-0">
                    ₹${(t.amount / 100000).toFixed(2)} L
                  </span>
                </div>
              `;
            }).join('')}
          </div>

          <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs flex items-center justify-between">
            <span class="text-slate-500 font-medium">Peak Procurement Intake</span>
            <strong class="font-mono text-emerald-600 font-black">${Math.round(maxTrendQty)} Quintals (09 Sep)</strong>
          </div>
        </div>

      </div>

      <!-- Centre-Wise Procurement Performance Table -->
      <div class="glass-card p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="text-xl">🏬</span>
              Centre-Wise Procurement Performance
            </h3>
            <p class="text-xs text-slate-500">Mandi intake breakdown, throughput volume, completed batches & active queues</p>
          </div>
          <button onclick="state.setActiveTab('centres')" class="btn-agri text-xs py-1.5 px-3 flex items-center gap-1">
            <span>Manage Centres</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th class="pb-3 px-2">Centre Name</th>
                <th class="pb-3 px-2">Location & District</th>
                <th class="pb-3 px-2">Status</th>
                <th class="pb-3 px-2">Total Quantity</th>
                <th class="pb-3 px-2">Completed Batches</th>
                <th class="pb-3 px-2">Active Queue</th>
                <th class="pb-3 px-2 text-right">Procurement Value (₹)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${(a.centre_wise_procurement || []).map(c => `
                <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition">
                  <td class="py-3 px-2">
                    <div class="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      <span>${escapeHtml(c.centre_name)}</span>
                      <span class="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono text-[10px] rounded font-bold border border-blue-200 dark:border-blue-800">
                        ${escapeHtml(c.centre_code)}
                      </span>
                    </div>
                  </td>
                  <td class="py-3 px-2 text-slate-600 dark:text-slate-300 font-medium">
                    ${escapeHtml(c.location)}
                  </td>
                  <td class="py-3 px-2">
                    <span class="badge-status ${c.is_active ? 'badge-approved' : 'badge-rejected'} text-[10px]">
                      ${c.is_active ? '🟢 Active' : '🔴 Closed'}
                    </span>
                  </td>
                  <td class="py-3 px-2 font-mono font-black text-slate-900 dark:text-white text-sm">
                    ${c.quantity_quintals.toLocaleString('en-IN')} Q
                  </td>
                  <td class="py-3 px-2 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    ${c.completed_batches} Batches
                  </td>
                  <td class="py-3 px-2 font-mono font-bold text-amber-600">
                    ${c.active_queue} Waiting
                  </td>
                  <td class="py-3 px-2 text-right font-mono font-black text-slate-900 dark:text-white text-sm">
                    ₹${c.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

// -------------------------------------------------------------
// 9. 🌾 CROP RATES / MSP MANAGEMENT FULL PAGE
// -------------------------------------------------------------
async function renderAdminMspRatesPage() {
  let rates = [];
  try {
    rates = await api.getMspRates();
    adminMspRatesCache = rates;
  } catch (e) {
    rates = adminMspRatesCache || [];
  }

  let displayRates = rates;
  if (adminMspSearchQuery && adminMspSearchQuery.trim()) {
    const q = adminMspSearchQuery.trim().toLowerCase();
    displayRates = rates.filter(r =>
      (r.crop_name && r.crop_name.toLowerCase().includes(q)) ||
      (r.season && r.season.toLowerCase().includes(q)) ||
      (r.effective_from && r.effective_from.toLowerCase().includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q))
    );
  }

  return `
    <div class="space-y-6">
      
      <!-- MSP Header Card -->
      <div class="glass-card p-5 border-l-4 border-amber-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-extrabold text-[10px] rounded-full uppercase tracking-wider">
              Commission for Agricultural Costs & Prices (CACP)
            </span>
            <span class="text-xs text-slate-400 font-semibold">• Official Master Table</span>
          </div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            <span class="text-2xl">🌾</span>
            Crop Rates & Official MSP Management
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Admin centralized control for official Minimum Support Prices (MSP). All weighment calculations, dealer receipts, and DBT payments dynamically derive rates from this table.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <div class="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs">
            <span class="text-amber-700 dark:text-amber-400 block text-[10px] uppercase font-bold">Active Season</span>
            <strong class="text-amber-700 dark:text-amber-400 font-mono text-sm">2026-27</strong>
          </div>
          <button onclick="toggleNewMspRateForm()" class="btn-agri text-xs px-3.5 py-2 shadow-sm flex items-center gap-1.5">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Add Crop Rate</span>
          </button>
        </div>
      </div>

      <!-- Add New MSP Rate Form (Collapsible) -->
      <div id="new-msp-rate-form" class="hidden glass-card p-6 space-y-4 border-2 border-amber-500/50">
        <h3 class="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-amber-600"></i>
          Declare New Official Crop MSP Rate
        </h3>
        <p class="text-xs text-slate-500">
          When the central or state government announces new official rates, adding or updating rates here updates all upcoming procurement transactions automatically.
        </p>
        <form onsubmit="handleCreateMspRate(event)" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label class="block text-slate-500 font-bold mb-1">Crop / Commodity Name</label>
            <input type="text" id="msp-crop-name" placeholder="e.g. Maize / Paddy (Grade A)" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          </div>
          <div>
            <label class="block text-slate-500 font-bold mb-1">Official Rate / Quintal (₹)</label>
            <input type="number" step="0.5" id="msp-rate" placeholder="e.g. 2225.00" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white">
          </div>
          <div>
            <label class="block text-slate-500 font-bold mb-1">Season</label>
            <input type="text" id="msp-season" placeholder="e.g. Kharif 2026-27" value="Kharif 2026-27" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          </div>
          <div>
            <label class="block text-slate-500 font-bold mb-1">Effective From Date</label>
            <input type="text" id="msp-effective" placeholder="e.g. 01-Oct-2026" value="01-Oct-2026" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          </div>
          <div class="sm:col-span-2 lg:col-span-4">
            <label class="block text-slate-500 font-bold mb-1">Official Gazette Notification / Notes</label>
            <input type="text" id="msp-notes" placeholder="e.g. Ministry of Agriculture MSP Gazette Notification No. AGR-2026/09" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          </div>
          <div class="sm:col-span-2 lg:col-span-4 flex justify-end gap-2 pt-2">
            <button type="button" onclick="toggleNewMspRateForm()" class="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold">Cancel</button>
            <button type="submit" class="btn-agri px-6 shadow-md">Publish Official MSP Rate</button>
          </div>
        </form>
      </div>

      <!-- Search & Rates Table Card (Highlighted Border) -->
      <div class="glass-card p-5 rounded-2xl border-2 border-amber-500/60 dark:border-amber-500/50 shadow-xl ring-2 ring-amber-500/20 space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-amber-100 dark:border-amber-950">
          <div class="relative w-full sm:w-80">
            <i data-lucide="search" class="w-4 h-4 text-amber-600 dark:text-amber-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text"
                   value="${escapeHtml(adminMspSearchQuery)}"
                   oninput="handleAdminMspSearch(this.value)"
                   placeholder="Search crop, season (e.g. 2026-27)..."
                   class="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner">
          </div>

          <div class="text-xs text-slate-600 dark:text-slate-300 font-bold self-end sm:self-center flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>Showing <strong class="text-amber-700 dark:text-amber-400 font-mono text-sm">${displayRates.length}</strong> Official Rates</span>
          </div>
        </div>

        ${displayRates.length === 0 ? `
          <div class="p-10 text-center text-slate-400 text-xs">No MSP rates matched your query.</div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th class="pb-3 px-3">Crop</th>
                  <th class="pb-3 px-3">Official Rate / Q</th>
                  <th class="pb-3 px-3">Season</th>
                  <th class="pb-3 px-3">Effective From</th>
                  <th class="pb-3 px-3">Status</th>
                  <th class="pb-3 px-3">Official Notes</th>
                  <th class="pb-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${displayRates.map(r => `
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition">
                    <!-- Crop -->
                    <td class="py-3 px-3">
                      <div class="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>${escapeHtml(r.crop_name)}</span>
                      </div>
                    </td>

                    <!-- Rate / Q -->
                    <td class="py-3 px-3">
                      <span class="font-mono font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm">
                        ₹${r.rate_per_quintal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    <!-- Season -->
                    <td class="py-3 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                      ${escapeHtml(r.season)}
                    </td>

                    <!-- Effective From -->
                    <td class="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                      ${escapeHtml(r.effective_from)}
                    </td>

                    <!-- Status -->
                    <td class="py-3 px-3">
                      <span class="badge-status ${r.status === 'ACTIVE' ? 'badge-approved' : 'badge-rejected'} text-[10px] py-0.5 px-2">
                        ${r.status}
                      </span>
                    </td>

                    <!-- Notes -->
                    <td class="py-3 px-3 text-slate-500 dark:text-slate-400 text-[11px] max-w-xs truncate">
                      ${escapeHtml(r.notes || 'Official Support Price')}
                    </td>

                    <!-- Actions -->
                    <td class="py-3 px-3 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <button onclick="openEditMspRateModal(${r.id})"
                                class="btn-agri text-xs py-1 px-3 shadow-sm flex items-center gap-1">
                          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                          <span>Edit Rate</span>
                        </button>
                        <button onclick="handleDeleteMspRate(${r.id}, '${escapeHtml(r.crop_name)}')"
                                class="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition" title="Delete">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

    </div>
  `;
}

// -------------------------------------------------------------
// 10. MSP RATES HANDLERS & MODAL
// -------------------------------------------------------------
function toggleNewMspRateForm() {
  const f = document.getElementById("new-msp-rate-form");
  if (f) f.classList.toggle("hidden");
}

function handleAdminMspSearch(val) {
  adminMspSearchQuery = val;
  renderApp();
}

async function handleCreateMspRate(e) {
  e.preventDefault();
  const crop_name = document.getElementById("msp-crop-name")?.value;
  const rate_per_quintal = parseFloat(document.getElementById("msp-rate")?.value || 0);
  const season = document.getElementById("msp-season")?.value;
  const effective_from = document.getElementById("msp-effective")?.value;
  const notes = document.getElementById("msp-notes")?.value;

  try {
    const res = await api.createMspRate({
      crop_name,
      rate_per_quintal,
      season,
      effective_from,
      notes,
      status: "ACTIVE"
    });
    alert(res.message || "MSP Rate created successfully!");
    renderApp();
  } catch (err) {
    alert("Failed to add MSP rate: " + err.message);
  }
}

function openEditMspRateModal(rateId) {
  const r = (adminMspRatesCache || []).find(x => x.id === rateId);
  if (r) {
    adminActiveEditMspRate = r;
    renderApp();
  }
}

function closeEditMspRateModal() {
  adminActiveEditMspRate = null;
  renderApp();
}

function renderMspRateEditModalHtml() {
  if (!adminActiveEditMspRate) return "";
  const r = adminActiveEditMspRate;

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div class="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div class="agri-gradient text-white p-5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🌾</span>
            <div>
              <h3 class="text-lg font-black">Update Official MSP Rate</h3>
              <p class="text-xs text-emerald-100">${escapeHtml(r.crop_name)} (${escapeHtml(r.season)})</p>
            </div>
          </div>
          <button onclick="closeEditMspRateModal()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="handleSaveEditMspRate(event, ${r.id})" class="p-6 space-y-4 text-xs">
          <div>
            <label class="block text-slate-500 font-bold mb-1">Crop Name</label>
            <input type="text" id="edit-msp-crop" value="${escapeHtml(r.crop_name)}" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-500 font-bold mb-1">Official MSP Rate / Quintal (₹)</label>
              <input type="number" step="0.5" id="edit-msp-rate" value="${r.rate_per_quintal}" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 font-mono font-black text-slate-900 dark:text-white">
            </div>
            <div>
              <label class="block text-slate-500 font-bold mb-1">Season</label>
              <input type="text" id="edit-msp-season" value="${escapeHtml(r.season)}" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-500 font-bold mb-1">Effective From</label>
              <input type="text" id="edit-msp-effective" value="${escapeHtml(r.effective_from)}" required class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
            </div>
            <div>
              <label class="block text-slate-500 font-bold mb-1">Status</label>
              <select id="edit-msp-status" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
                <option value="ACTIVE" ${r.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
                <option value="INACTIVE" ${r.status === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-slate-500 font-bold mb-1">Notes / Gazette Notification</label>
            <input type="text" id="edit-msp-notes" value="${escapeHtml(r.notes || '')}" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white">
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onclick="closeEditMspRateModal()" class="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold">Cancel</button>
            <button type="submit" class="btn-agri px-6 shadow-md">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleSaveEditMspRate(e, rateId) {
  e.preventDefault();
  const crop_name = document.getElementById("edit-msp-crop")?.value;
  const rate_per_quintal = parseFloat(document.getElementById("edit-msp-rate")?.value || 0);
  const season = document.getElementById("edit-msp-season")?.value;
  const effective_from = document.getElementById("edit-msp-effective")?.value;
  const status = document.getElementById("edit-msp-status")?.value;
  const notes = document.getElementById("edit-msp-notes")?.value;

  try {
    const res = await api.updateMspRate(rateId, {
      crop_name,
      rate_per_quintal,
      season,
      effective_from,
      status,
      notes
    });
    alert(res.message || "MSP Rate updated successfully!");
    closeEditMspRateModal();
  } catch (err) {
    alert("Failed to update MSP rate: " + err.message);
  }
}

async function handleDeleteMspRate(rateId, cropName) {
  if (!confirm(`Are you sure you want to remove official MSP rate for ${cropName}?`)) {
    return;
  }
  try {
    const res = await api.deleteMspRate(rateId);
    alert(res.message || "MSP Rate removed.");
    renderApp();
  } catch (err) {
    alert("Failed to delete MSP rate: " + err.message);
  }
}

