let dealerStatusPollTimer = null;
let dealerLiveQueuePollTimer = null;
let dealerAssignedFilter = 'ALL'; // 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
let dealerBookingSearchQuery = '';
let dealerTxnSearchQuery = '';

function renderDealerLiveQueueStripHtml(liveQueue, activeCount, completedCount) {
  const rollingAvg = liveQueue?.recent_average_minutes || 12.0;
  const currentToken = liveQueue?.current_token || "Standby";
  const waitNext = liveQueue?.estimated_wait_next_farmer || Math.round(rollingAvg);
  const countWaiting = (liveQueue?.farmers_waiting_count !== undefined) ? liveQueue.farmers_waiting_count : activeCount;
  const countCompleted = (liveQueue?.completed_today_count !== undefined) ? liveQueue.completed_today_count : completedCount;

  return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
        <h3 class="text-sm sm:text-base font-black text-slate-900 dark:text-white">
          ⚡ Live Station Queue Recalculation Engine
        </h3>
      </div>
      <span class="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-100 dark:bg-emerald-950 px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
        Rolling Avg: ${rollingAvg}m / farmer
      </span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-center">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">👥 Farmers Waiting</span>
        <div class="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">
          ${countWaiting}
        </div>
        <span class="text-[10px] text-slate-400 font-medium">in queue</span>
      </div>

      <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-center">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Current Token</span>
        <div class="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
          ${escapeHtml(currentToken)}
        </div>
        <span class="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">${liveQueue?.current_status === 'PROCESSING' ? '● Processing' : '● Next in Line'}</span>
      </div>

      <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-center">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Wait for Next Farmer</span>
        <div class="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
          ~${waitNext} <span class="text-xs font-bold text-slate-400">min</span>
        </div>
        <span class="text-[10px] text-slate-400 font-medium">calculated dynamic ETA</span>
      </div>

      <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-center">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Completed Today</span>
        <div class="text-2xl sm:text-3xl font-black font-mono text-teal-600 dark:text-teal-400 mt-1">
          ${countCompleted}
        </div>
        <span class="text-[10px] text-slate-400 font-medium">weighment slips</span>
      </div>
    </div>
  `;
}

function startDealerLiveQueuePolling() {
  if (dealerLiveQueuePollTimer) return;
  dealerLiveQueuePollTimer = setInterval(async () => {
    if (!state.currentUser || state.currentUser.role !== 'DEALER') {
      stopDealerLiveQueuePolling();
      return;
    }
    // Only poll when on home or assigned farmers
    if (state.activeTab === 'home' || state.activeTab === 'assigned_farmers') {
      try {
        const [af, tx, lq] = await Promise.all([
          api.getDealerAssignedFarmers(),
          api.getDealerTransactions(),
          api.getDealerLiveQueue()
        ]);
        window._cachedAssignedFarmers = af || [];
        
        // Targeted DOM updates without triggering full re-renders
        if (state.activeTab === 'home') {
          const stripEl = document.getElementById("dealer-live-queue-dynamic-strip");
          if (stripEl && lq) {
            const activeCount = lq.farmers_waiting_count || (af || []).filter(f => f.status === 'ACTIVE' || f.status === 'BOOKED' || f.status === 'ARRIVED').length;
            stripEl.innerHTML = renderDealerLiveQueueStripHtml(lq, activeCount, (tx || []).length);
          }
        } else if (state.activeTab === 'assigned_farmers') {
          const listContainer = document.getElementById("dealer-assigned-list-container");
          if (listContainer && af) {
            listContainer.innerHTML = renderDealerAssignedFarmersListHtml(af);
            if (window.lucide) lucide.createIcons();
          }
        }
      } catch (e) {}
    }
  }, 4000);
}

function stopDealerLiveQueuePolling() {
  if (dealerLiveQueuePollTimer) {
    clearInterval(dealerLiveQueuePollTimer);
    dealerLiveQueuePollTimer = null;
  }
}


async function renderDealerView() {
  const user = state.currentUser;
  const activeTab = state.activeTab;
  const dp = user?.dealer_profile || {};
  const status = dp.status || user?.dealer_status || "PENDING";

  // If dealer status is PENDING, auto poll server every 4 seconds so admin approval reflects immediately
  if (status === 'PENDING') {
    if (!dealerStatusPollTimer) {
      dealerStatusPollTimer = setInterval(async () => {
        if (!state.currentUser || state.currentUser.role !== 'DEALER') {
          clearInterval(dealerStatusPollTimer);
          dealerStatusPollTimer = null;
          return;
        }
        try {
          const fresh = await api.getCurrentUser();
          const currentStatus = fresh?.dealer_profile?.status || fresh?.dealer_status;
          if (fresh && currentStatus && currentStatus !== 'PENDING') {
            clearInterval(dealerStatusPollTimer);
            dealerStatusPollTimer = null;
            state.setCurrentUser(fresh);
          }
        } catch (e) {}
      }, 4000);
    }
  } else {
    if (dealerStatusPollTimer) {
      clearInterval(dealerStatusPollTimer);
      dealerStatusPollTimer = null;
    }
  }

  // Check if dealer status is PENDING, REJECTED, or SUSPENDED
  if (status !== 'APPROVED') {
    const rawDocs = dp.verification_documents || {};
    const docItems = [
      { key: 'aadhaar_card', name: 'Aadhaar Card', icon: '🪪' },
      { key: 'pan_card', name: 'PAN Card', icon: '💳' },
      { key: 'dealer_license', name: 'Dealer/Trader License', icon: '📜' },
      { key: 'business_reg', name: 'Business Registration Certificate', icon: '🏢' },
      { key: 'bank_proof', name: 'Bank Account Proof', icon: '🏦' },
      { key: 'address_proof', name: 'Address Proof', icon: '🏠' }
    ];

    return `
      <div class="max-w-2xl mx-auto py-8 space-y-6 animate-fade-in">
        
        <!-- Main Verification Status Card -->
        <div class="glass-card p-6 sm:p-8 border-2 ${status === 'PENDING' ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30' : 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30'} text-center shadow-2xl rounded-3xl relative overflow-hidden">
          
          <div class="w-16 h-16 rounded-2xl ${status === 'PENDING' ? 'bg-amber-500 shadow-amber-500/30' : 'bg-rose-600 shadow-rose-600/30'} text-white flex items-center justify-center font-bold text-3xl mx-auto mb-4 shadow-xl">
            ${status === 'PENDING' ? '⏳' : '❌'}
          </div>

          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${status === 'PENDING' ? 'bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200' : 'bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'} font-black text-xs uppercase tracking-wider mb-3">
            <span class="w-2 h-2 rounded-full ${status === 'PENDING' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'}"></span>
            ${status === 'PENDING' ? '🟡 Pending Admin Verification' : '❌ Registration Rejected'}
          </div>

          <h3 class="text-2xl font-black text-slate-900 dark:text-white mb-2">
            ${escapeHtml(dp.business_name || user.business_name || user.name)}
          </h3>

          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed mb-6 font-medium">
            ${status === 'PENDING' 
              ? 'Your dealer registration dossier has been submitted. Government Admin is currently reviewing your uploaded documents. The Dealer Dashboard will automatically unlock upon approval.' 
              : 'Your dealer registration was not approved by Government Admin.'}
          </p>

          ${status === 'REJECTED' ? `
            <!-- Rejection Reason Callout -->
            <div class="mb-6 p-4 rounded-2xl bg-rose-100/80 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-800 text-left">
              <span class="text-[11px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300 block mb-1">
                ⚠️ Rejection Reason from Government Admin:
              </span>
              <p class="text-sm font-bold text-rose-950 dark:text-rose-100 leading-snug">
                "${escapeHtml(dp.rejection_reason || 'Verification document mismatch or mandatory criteria not satisfied.')}"
              </p>
            </div>
          ` : ''}

          <!-- Verification Flow Step Tracker -->
          <div class="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-left mb-6 space-y-3">
            <span class="text-xs font-black uppercase tracking-wider text-slate-400 block">Verification Progress Timeline:</span>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div class="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800">
                <span class="text-emerald-700 dark:text-emerald-400 font-black block text-[11px]">Step 1: Complete</span>
                <span class="text-slate-800 dark:text-slate-200 font-bold">Registration ✓</span>
              </div>
              <div class="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800">
                <span class="text-emerald-700 dark:text-emerald-400 font-black block text-[11px]">Step 2: Uploaded</span>
                <span class="text-slate-800 dark:text-slate-200 font-bold">6 Documents ✓</span>
              </div>
              <div class="p-2.5 rounded-xl ${status === 'PENDING' ? 'bg-amber-100 dark:bg-amber-950/70 border-2 border-amber-400 dark:border-amber-700 ring-2 ring-amber-500/20' : 'bg-slate-100 dark:bg-slate-800 border border-slate-300'}">
                <span class="${status === 'PENDING' ? 'text-amber-800 dark:text-amber-300 font-black' : 'text-slate-500 font-bold'} block text-[11px]">Step 3: Review</span>
                <span class="text-slate-900 dark:text-white font-bold">${status === 'PENDING' ? 'Admin Reviewing ⏳' : 'Decision Made'}</span>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 opacity-60">
                <span class="text-slate-400 font-bold block text-[11px]">Step 4: Unlock</span>
                <span class="text-slate-600 dark:text-slate-400 font-bold">Dashboard Access 🔒</span>
              </div>
            </div>
          </div>

          <!-- Uploaded 6 Documents Dossier -->
          <div class="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-left mb-6 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                📑 Uploaded Verification Documents (6 of 6):
              </span>
              <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">All Attached ✓</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${docItems.map(item => {
                const docData = rawDocs[item.key] || {};
                const fileName = docData.file_name || `${item.key}.pdf`;
                const fileSize = docData.file_size || '1.2 MB';
                return `
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
                    <div class="flex items-center gap-2 overflow-hidden">
                      <span class="text-lg shrink-0">${item.icon}</span>
                      <div class="truncate">
                        <span class="font-bold text-slate-800 dark:text-slate-200 block truncate text-[11px]">${item.name}</span>
                        <span class="text-[10px] text-slate-400 font-mono truncate block">${escapeHtml(fileName)}</span>
                      </div>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${status === 'PENDING' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-200 text-slate-700'} shrink-0">
                      ${fileSize}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Dealer Metadata Summary -->
          <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl text-left text-xs space-y-2 border border-slate-200 dark:border-slate-800">
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span class="text-slate-400 font-semibold">Assigned Procurement Mandi:</span>
              <span class="font-bold text-slate-900 dark:text-white">🏬 ${escapeHtml(dp.assigned_centre_name || dp.procurement_centre || 'Warangal Central Grain Mandi')}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span class="text-slate-400 font-semibold">Authorized Buying Product:</span>
              <span class="font-bold text-emerald-700 dark:text-emerald-400">🌾 ${escapeHtml(dp.category_name || 'Paddy')}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span class="text-slate-400 font-semibold">Trade License Number:</span>
              <span class="font-mono font-bold text-emerald-600">${escapeHtml(dp.license_number || 'LIC-2026-901')}</span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-slate-400 font-semibold">Government Tax ID:</span>
              <span class="font-mono font-bold text-slate-800 dark:text-slate-200">${escapeHtml(dp.government_id_type || 'GSTIN')}: ${escapeHtml(dp.government_id_number || '36AAACG1234H1Z1')}</span>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap justify-center items-center gap-3">
            <button onclick="handleRefreshDealerStatus()" class="btn-agri text-xs py-2.5 px-5 shadow-lg flex items-center gap-1.5 font-bold">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Check Status Now
            </button>
            <button onclick="logoutUser()" class="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
              <i data-lucide="log-out" class="w-4 h-4"></i> Sign Out
            </button>
          </div>

          ${status === 'PENDING' ? `
            <p class="text-[11px] text-amber-700 dark:text-amber-400 font-semibold mt-4">
              ⚡ Real-time active polling enabled. This page will automatically transition to the Dealer Dashboard once approved by Admin.
            </p>
          ` : ''}

        </div>
      </div>
    `;
  }

  // DEDICATED SEPARATE PAGES ROUTING
  if (activeTab === 'scan_qr') {
    return await renderQRScannerModal();
  } else if (activeTab === 'assigned_farmers' || activeTab === 'farmer_bookings') {
    return await renderDedicatedAssignedFarmersPage();
  } else if (activeTab === 'transactions') {
    return await renderDealerTransactionsPage();
  } else if (activeTab === 'auto_procure') {
    return renderAutomatedProcurementScreen();
  } else if (activeTab === 'process_procurement_form') {
    return renderProcurementEntryForm();
  } else if (activeTab === 'profile') {
    return await renderDealerProfilePage();
  }

  // Fetch metrics for home action cards
  let assignedFarmers = [];
  let txns = [];
  let liveQueue = {
    current_token: 'Standby',
    farmers_waiting_count: 0,
    recent_average_minutes: 12.0,
    estimated_wait_next_farmer: 12,
    total_estimated_queue_minutes: 0,
    queue_status: 'Normal',
    current_status: 'IDLE'
  };

  try {
    const [af, tx, lq] = await Promise.all([
      api.getDealerAssignedFarmers(),
      api.getDealerTransactions(),
      api.getDealerLiveQueue()
    ]);
    assignedFarmers = af || [];
    txns = tx || [];
    if (lq) liveQueue = lq;
  } catch (e) {
    try { assignedFarmers = await api.getDealerAssignedFarmers(); } catch (e2) {}
    try { txns = await api.getDealerTransactions(); } catch (e3) {}
  }

  const activeCount = liveQueue.farmers_waiting_count || assignedFarmers.filter(f => f.status === 'ACTIVE' || f.status === 'BOOKED' || f.status === 'ARRIVED').length;
  const totalQty = txns.reduce((sum, t) => sum + (t.actual_quantity || 0), 0);
  const currentToken = liveQueue.current_token || "Standby";
  const rollingAvg = liveQueue.recent_average_minutes || 12.0;
  const waitNext = liveQueue.estimated_wait_next_farmer || Math.round(rollingAvg);

  // Start background queue polling for dealer dashboard
  startDealerLiveQueuePolling();

  // CLEAN DEALER HOME DASHBOARD (ACTION BUTTONS WITH PROMINENT ACCESS)
  return `
    <div class="max-w-4xl mx-auto space-y-6 animate-fade-in">
      
      <!-- Top Station Header Banner -->
      <div class="gold-gradient text-white p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider inline-block">
              Verified Procurement Dealer
            </span>
            <span class="px-3 py-1 bg-amber-400 text-slate-950 font-black rounded-full text-xs uppercase tracking-wider inline-flex items-center gap-1 shadow-sm">
              🌾 ${escapeHtml(dp.category_name || user.category_name || 'Paddy')}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="text-2xl sm:text-3xl font-black cursor-pointer hover:text-amber-200 transition" onclick="state.setActiveTab('profile')" title="Click to view & edit your profile">
              ${escapeHtml(dp.business_name || user.business_name || user.name)}
            </h2>
            <button onclick="state.setActiveTab('profile')" class="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-md border border-white/30 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 cursor-pointer group" title="View & Edit Dealer Profile">
              <i data-lucide="user" class="w-3.5 h-3.5 text-amber-300"></i>
              <span>Profile</span>
              <i data-lucide="pencil" class="w-3 h-3 text-emerald-200 group-hover:text-white transition"></i>
            </button>
          </div>
          <p class="text-xs text-amber-100 mt-1 font-medium">
            Assigned Procurement Centre: <strong class="underline font-bold">${escapeHtml(dp.assigned_centre_name || user.assigned_centre_name || 'Assigned Center')}</strong>
          </p>
          <p class="text-[11px] text-amber-200/90 mt-0.5 font-mono">License: ${escapeHtml(dp.license_number || 'Active')} • Station Online</p>
        </div>

        <div class="flex items-center gap-2.5 w-full sm:w-auto">
          <button onclick="state.setActiveTab('scan_qr')" class="btn-agri bg-white text-emerald-800 hover:bg-amber-50 text-sm py-3 px-6 shadow-2xl font-black flex-1 sm:flex-none flex items-center justify-center gap-2">
            <i data-lucide="qr-code" class="w-5 h-5"></i> Open QR Scanner
          </button>
          <button onclick="logoutUser()" class="px-3.5 py-3 bg-red-600/80 hover:bg-red-600 border border-red-400/40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
            <i data-lucide="log-out" class="w-4 h-4"></i> Logout
          </button>
        </div>
      </div>

      <!-- Real-Time Station Live Queue Status Strip -->
      <div id="dealer-live-queue-dynamic-strip" class="glass-card p-5 rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-r from-emerald-50/70 via-teal-50/70 to-amber-50/50 dark:from-slate-900/80 dark:via-emerald-950/30 dark:to-slate-900/80 shadow-lg">
        ${renderDealerLiveQueueStripHtml(liveQueue, activeCount, liveQueue.completed_today_count || txns.length)}
      </div>


      <!-- 3 DEDICATED ACTION BUTTON CARDS -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <!-- Action 1: QR Scanner Card -->
        <div class="glass-card p-6 border-2 border-dashed border-emerald-500/60 hover:border-emerald-500 transition cursor-pointer group shadow-lg flex flex-col justify-between space-y-4" onclick="state.setActiveTab('scan_qr')">
          <div class="space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center font-bold shadow-md group-hover:scale-110 transition flex-shrink-0">
              <i data-lucide="camera" class="w-6 h-6"></i>
            </div>
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Scan Farmer QR Pass</h3>
              <p class="text-xs text-slate-500 mt-1 leading-snug">
                Camera scanner to verify passes, live sensor weighment, and instant receipt generation.
              </p>
            </div>
          </div>

          <button onclick="event.stopPropagation(); state.setActiveTab('scan_qr')" class="btn-agri text-xs py-2.5 px-4 font-black shadow-md flex items-center justify-center gap-2 w-full">
            <i data-lucide="scan" class="w-4 h-4"></i> Open Scanner
          </button>
        </div>

        <!-- Action 2: Farmer Bookings & Passes Card -->
        <div class="glass-card p-6 border-l-4 border-teal-600 hover:border-teal-500 transition cursor-pointer group shadow-lg flex flex-col justify-between space-y-4" onclick="state.setActiveTab('assigned_farmers')">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950/80 text-teal-600 flex items-center justify-center font-bold shadow-md group-hover:scale-110 transition flex-shrink-0">
                <i data-lucide="users" class="w-6 h-6"></i>
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                ${activeCount} Active/Waiting
              </span>
            </div>
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Farmer Bookings &amp; Passes</h3>
              <p class="text-xs text-slate-500 mt-1 leading-snug">
                Review booked farmers organized by Upcoming, Active, and Completed, with full slot and crop details.
              </p>
            </div>
          </div>

          <button onclick="event.stopPropagation(); state.setActiveTab('assigned_farmers')" class="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-md flex items-center justify-center gap-2 w-full transition">
            <i data-lucide="calendar-check" class="w-4 h-4"></i> View Farmer Bookings (${assignedFarmers.length})
          </button>
        </div>

        <!-- Action 3: Procurement History & Slips Card -->
        <div class="glass-card p-6 border-l-4 border-amber-600 hover:border-amber-500 transition cursor-pointer group shadow-lg flex flex-col justify-between space-y-4" onclick="state.setActiveTab('transactions')">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center font-bold shadow-md group-hover:scale-110 transition flex-shrink-0">
                <i data-lucide="receipt" class="w-6 h-6"></i>
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200">
                ${txns.length} Slips
              </span>
            </div>
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Procurement History &amp; Slips</h3>
              <p class="text-xs text-slate-500 mt-1 leading-snug">
                Dedicated page to review all weighment transactions, view full printable receipts and slips.
              </p>
            </div>
          </div>

          <button onclick="event.stopPropagation(); state.setActiveTab('transactions')" class="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md flex items-center justify-center gap-2 w-full transition">
            <i data-lucide="file-text" class="w-4 h-4"></i> View Slips &amp; History (${txns.length})
          </button>
        </div>

      </div>

    </div>
  `;
}

// ==========================================
// ==========================================
// DEDICATED SEPARATE PAGE: MY ASSIGNED FARMERS & BOOKINGS
// ==========================================
function setDealerAssignedFilter(filter) {
  dealerAssignedFilter = filter;
  const listContainer = document.getElementById("dealer-assigned-list-container");
  if (listContainer && window._cachedAssignedFarmers) {
    listContainer.innerHTML = renderDealerAssignedFarmersListHtml(window._cachedAssignedFarmers);
    if (window.lucide) lucide.createIcons();
  }
  // Re-render the container to update active filter tab highlights
  const filterTabsContainer = document.getElementById("dealer-filter-tabs-container");
  if (filterTabsContainer && window._cachedAssignedFarmers) {
    filterTabsContainer.innerHTML = renderDealerFilterTabsHtml(window._cachedAssignedFarmers);
  }
}

function handleDealerBookingSearch(e) {
  dealerBookingSearchQuery = (e.target.value || '').toLowerCase();
  const listContainer = document.getElementById("dealer-assigned-list-container");
  if (listContainer && window._cachedAssignedFarmers) {
    listContainer.innerHTML = renderDealerAssignedFarmersListHtml(window._cachedAssignedFarmers);
    if (window.lucide) lucide.createIcons();
  }
}

async function refreshDealerAssignedFarmers() {
  const listContainer = document.getElementById("dealer-assigned-list-container");
  if (!listContainer) return;

  try {
    const fresh = await api.getDealerAssignedFarmers();
    window._cachedAssignedFarmers = fresh;
    listContainer.innerHTML = renderDealerAssignedFarmersListHtml(fresh);
    const filterTabsContainer = document.getElementById("dealer-filter-tabs-container");
    if (filterTabsContainer) {
      filterTabsContainer.innerHTML = renderDealerFilterTabsHtml(fresh);
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) {}
}
window.refreshDealerAssignedFarmers = refreshDealerAssignedFarmers;

function renderDealerFilterTabsHtml(farmers) {
  const allCount = farmers.length;
  const upcomingCount = farmers.filter(f => f.timing_status === 'UPCOMING' || (f.status === 'ACTIVE' && f.timing_status === 'UPCOMING')).length;
  const activeCount = farmers.filter(f => f.timing_status === 'ACTIVE' || f.status === 'ARRIVED').length;
  const completedCount = farmers.filter(f => f.status === 'COMPLETED' || f.timing_status === 'COMPLETED').length;
  const expiredCount = farmers.filter(f => f.status === 'CANCELLED' || f.status === 'EXPIRED' || f.timing_status === 'EXPIRED').length;

  return `
    <div class="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
      <button onclick="setDealerAssignedFilter('ALL')" class="px-3 py-1.5 rounded-xl transition ${dealerAssignedFilter === 'ALL' ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
        All (${allCount})
      </button>
      <button onclick="setDealerAssignedFilter('UPCOMING')" class="px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${dealerAssignedFilter === 'UPCOMING' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
        <span class="w-2 h-2 rounded-full ${dealerAssignedFilter === 'UPCOMING' ? 'bg-white' : 'bg-emerald-500'} inline-block"></span>
        Upcoming (${upcomingCount})
      </button>
      <button onclick="setDealerAssignedFilter('ACTIVE')" class="px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${dealerAssignedFilter === 'ACTIVE' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
        <span class="w-2 h-2 rounded-full ${dealerAssignedFilter === 'ACTIVE' ? 'bg-white' : 'bg-blue-500'} animate-pulse inline-block"></span>
        Active Now (${activeCount})
      </button>
      <button onclick="setDealerAssignedFilter('COMPLETED')" class="px-3 py-1.5 rounded-xl transition ${dealerAssignedFilter === 'COMPLETED' ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
        Completed (${completedCount})
      </button>
      <button onclick="setDealerAssignedFilter('EXPIRED')" class="px-3 py-1.5 rounded-xl transition ${dealerAssignedFilter === 'EXPIRED' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
        Expired / Cancelled (${expiredCount})
      </button>
    </div>
  `;
}

async function renderDedicatedAssignedFarmersPage() {
  let farmers = [];
  try {
    farmers = await api.getDealerAssignedFarmers();
  } catch (e) {
    farmers = [];
  }
  window._cachedAssignedFarmers = farmers;

  return `
    <div class="max-w-5xl mx-auto space-y-6 animate-fade-in">
      
      <!-- Top Navigation Bar -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <button onclick="state.setActiveTab('home')" class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 shadow-sm transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
        </button>

        <div class="flex items-center gap-2">
          <button onclick="refreshDealerAssignedFarmers()" class="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition border border-slate-200 dark:border-slate-700">
            <i data-lucide="refresh-cw" class="w-4 h-4"></i> Refresh
          </button>
          <button onclick="state.setActiveTab('transactions')" class="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 font-bold text-xs flex items-center gap-1.5 transition">
            <i data-lucide="receipt" class="w-4 h-4"></i> Procurement History &amp; Slips
          </button>
          <button onclick="state.setActiveTab('scan_qr')" class="btn-agri text-xs py-2.5 px-4 shadow-md font-black flex items-center gap-1.5">
            <i data-lucide="camera" class="w-4 h-4"></i> Open QR Scanner
          </button>
        </div>
      </div>

      <!-- Page Header with Filter Tabs & Search -->
      <div class="glass-card p-5 sm:p-6 space-y-5 shadow-lg border-l-4 border-teal-600">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="users" class="w-6 h-6 text-teal-600"></i>
              Farmer Bookings &amp; Passes
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">Real-time procurement slots booked by farmers for your centre</p>
          </div>

          <!-- Filter Tabs Container -->
          <div id="dealer-filter-tabs-container">
            ${renderDealerFilterTabsHtml(farmers)}
          </div>
        </div>

        <!-- Search Input -->
        <div class="relative">
          <input type="text"
                 placeholder="Search by farmer name, mobile number, token number, booking ID, or crop..."
                 oninput="handleDealerBookingSearch(event)"
                 class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5"></i>
        </div>
      </div>

      <!-- Farmers Card List -->
      <div id="dealer-assigned-list-container">
        ${renderDealerAssignedFarmersListHtml(farmers)}
      </div>

    </div>
  `;
}

function renderDealerAssignedFarmersListHtml(farmers) {
  let displayed = farmers || [];

  // Filter by status tab
  if (dealerAssignedFilter === 'UPCOMING') {
    displayed = displayed.filter(f => f.timing_status === 'UPCOMING' || (f.status === 'ACTIVE' && f.timing_status === 'UPCOMING'));
  } else if (dealerAssignedFilter === 'ACTIVE') {
    displayed = displayed.filter(f => f.timing_status === 'ACTIVE' || f.status === 'ARRIVED');
  } else if (dealerAssignedFilter === 'COMPLETED') {
    displayed = displayed.filter(f => f.status === 'COMPLETED' || f.timing_status === 'COMPLETED');
  } else if (dealerAssignedFilter === 'EXPIRED') {
    displayed = displayed.filter(f => f.status === 'CANCELLED' || f.status === 'EXPIRED' || f.timing_status === 'EXPIRED');
  }

  // Filter by search query
  if (dealerBookingSearchQuery) {
    displayed = displayed.filter(f => {
      const q = dealerBookingSearchQuery;
      return (
        (f.farmer_name || '').toLowerCase().includes(q) ||
        (f.farmer_phone || '').includes(q) ||
        (f.token_number || '').toLowerCase().includes(q) ||
        (f.booking_code || f.assignment_code || '').toLowerCase().includes(q) ||
        (f.crop_type || f.product_name || '').toLowerCase().includes(q)
      );
    });
  }

  if (displayed.length === 0) {
    return `
      <div class="glass-card p-12 text-center text-slate-400 space-y-2">
        <i data-lucide="user-x" class="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto"></i>
        <p class="text-sm font-bold">No farmer bookings found matching this criteria.</p>
      </div>
    `;
  }

  return `
    <div class="space-y-3.5">
      ${displayed.map(f => {
        const timingStatus = f.timing_status || f.status;
        const isUpcoming = timingStatus === 'UPCOMING';
        const isActiveNow = timingStatus === 'ACTIVE' || f.status === 'ARRIVED';
        const isCompleted = f.status === 'COMPLETED' || timingStatus === 'COMPLETED';
        const isExpired = f.status === 'EXPIRED' || timingStatus === 'EXPIRED';
        const isCancelled = f.status === 'CANCELLED';
        const code = f.booking_code || f.assignment_code || f.token_number;

        return `
          <div class="glass-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-teal-500 transition shadow-sm ${
            isActiveNow ? 'border-2 border-blue-400/80 bg-blue-50/20 dark:bg-blue-950/20 ring-4 ring-blue-500/10' : isUpcoming ? 'border-2 border-emerald-400/60 bg-emerald-50/10' : ''
          }">
            
            <!-- Left Info Column: Farmer & Status -->
            <div class="flex items-start gap-3.5 flex-1 min-w-[240px]">
              <div class="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base shadow-sm ${
                isActiveNow ? 'bg-blue-600 text-white' : isUpcoming ? 'bg-emerald-600 text-white' : isCompleted ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }">
                ${escapeHtml((f.farmer_name || 'F').charAt(0).toUpperCase())}
              </div>

              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-extrabold text-base text-slate-900 dark:text-white">${escapeHtml(f.farmer_name || 'Farmer')}</span>
                  
                  <!-- Booking ID & Token Pill -->
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-black ${
                    isActiveNow ? 'bg-blue-200 dark:bg-blue-900 text-blue-950 dark:text-blue-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }">
                    ${escapeHtml(f.token_number || code)}
                  </span>

                  <!-- Status Badge -->
                  ${isActiveNow ? `
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border border-blue-300 dark:border-blue-700 inline-flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping inline-block"></span> ACTIVE NOW
                    </span>
                  ` : isUpcoming ? `
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                      🟢 UPCOMING
                    </span>
                  ` : isCompleted ? `
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-700 text-white shadow-sm">
                      ✓ COMPLETED
                    </span>
                  ` : isExpired ? `
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                      ⏰ EXPIRED
                    </span>
                  ` : `
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300">
                      ✕ CANCELLED
                    </span>
                  `}
                </div>

                <!-- Farmer Phone & Location Details -->
                <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>📞 ${escapeHtml(f.farmer_phone || 'N/A')}</span>
                  ${(f.farmer_village || f.village) ? `<span>• 📍 ${escapeHtml(f.farmer_village || f.village)}${f.farmer_district ? `, ${escapeHtml(f.farmer_district)}` : ''}</span>` : ''}
                  ${f.farmer_land_acres ? `<span>• 🌾 ${escapeHtml(f.farmer_land_acres)} Acres</span>` : ''}
                </div>
                <div class="text-[11px] font-mono text-slate-400">
                  Booking ID: <strong class="text-slate-700 dark:text-slate-300">${escapeHtml(f.booking_code || code)}</strong>
                </div>
              </div>
            </div>

            <!-- Middle Produce & Slot Details -->
            <div class="flex flex-wrap items-center gap-3 text-xs">
              <div class="bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <span class="text-slate-400 text-[10px] block font-bold uppercase">Produce &amp; Expected Qty</span>
                <span class="font-black text-emerald-700 dark:text-emerald-300 text-xs">
                  🌾 ${escapeHtml(f.crop_type || f.product_name || 'Paddy')} (${f.expected_quantity_quintals || 40} Q)
                </span>
              </div>

              <div class="bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <span class="text-slate-400 text-[10px] block font-bold uppercase">Slot Schedule</span>
                <span class="font-bold text-slate-700 dark:text-slate-300 text-xs">
                  📅 ${escapeHtml(f.slot_date || 'Today')} <span class="text-slate-400 font-normal">(${escapeHtml(f.slot_time || 'General Slot')})</span>
                </span>
              </div>
            </div>

            <!-- Right Actions / Status -->
            <div class="flex items-center justify-end gap-2 min-w-[150px]">
              ${(isActiveNow || isUpcoming) ? `
                <button onclick="handleVerifyFarmerDirect('${escapeHtml(code)}')" class="btn-agri text-xs py-2.5 px-4 shadow-lg font-black flex items-center gap-1.5">
                  <i data-lucide="zap" class="w-4 h-4"></i> Verify &amp; Procure
                </button>
              ` : isCompleted ? `
                <button onclick="state.setActiveTab('transactions')" class="px-3.5 py-2 bg-emerald-100 dark:bg-emerald-950 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold border border-emerald-300 dark:border-emerald-800 transition flex items-center gap-1">
                  <i data-lucide="receipt" class="w-3.5 h-3.5"></i> View Slip
                </button>
              ` : isExpired ? `
                <span class="text-xs font-bold text-slate-400">Slot Passed</span>
              ` : `
                <span class="text-xs font-bold text-rose-500">Cancelled</span>
              `}
            </div>

          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ==========================================
// DEDICATED SEPARATE PAGE: PROCUREMENT HISTORY & SLIPS
// ==========================================
function handleDealerTxnSearch(e) {
  dealerTxnSearchQuery = (e.target.value || '').toLowerCase();
  const listContainer = document.getElementById("dealer-txns-list-container");
  if (listContainer && window._cachedDealerTxns) {
    listContainer.innerHTML = renderDealerTransactionsListHtml(window._cachedDealerTxns);
    if (window.lucide) lucide.createIcons();
  }
}

async function renderDealerTransactionsPage() {
  let txns = [];
  try {
    txns = await api.getDealerTransactions();
  } catch (e) {
    txns = [];
  }
  window._cachedDealerTxns = txns;

  const totalQuintals = txns.reduce((sum, t) => sum + (Number(t.actual_quantity) || 0), 0);
  const totalPayout = txns.reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);

  return `
    <div class="max-w-5xl mx-auto space-y-6 animate-fade-in">
      
      <!-- Top Navigation Bar -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <button onclick="state.setActiveTab('home')" class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 shadow-sm transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
        </button>

        <div class="flex items-center gap-2">
          <button onclick="state.setActiveTab('assigned_farmers')" class="px-3.5 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 border border-teal-200 dark:border-teal-800 font-bold text-xs flex items-center gap-1.5 transition">
            <i data-lucide="users" class="w-4 h-4"></i> My Assigned Farmers
          </button>
          <button onclick="state.setActiveTab('scan_qr')" class="btn-agri text-xs py-2.5 px-4 shadow-md font-black flex items-center gap-1.5">
            <i data-lucide="camera" class="w-4 h-4"></i> Open QR Scanner
          </button>
        </div>
      </div>

      <!-- Page Header Banner & Stat Cards -->
      <div class="glass-card p-5 sm:p-6 space-y-5 shadow-lg border-l-4 border-amber-600">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="receipt" class="w-6 h-6 text-amber-600"></i>
              Procurement History &amp; Weighment Slips
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">Official weighbridge logs, payment slips, and DBT transaction records</p>
          </div>

          <div class="flex items-center gap-3">
            <div class="bg-amber-50 dark:bg-amber-950/60 px-4 py-2 rounded-2xl border border-amber-200 dark:border-amber-800 text-right">
              <span class="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-400 block">Total Procured</span>
              <span class="text-sm font-black text-amber-950 dark:text-amber-200 font-mono">${totalQuintals.toFixed(1)} Q</span>
            </div>
            <div class="bg-emerald-50 dark:bg-emerald-950/60 px-4 py-2 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-right">
              <span class="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-400 block">Total Payout</span>
              <span class="text-sm font-black text-emerald-700 dark:text-emerald-300 font-mono">₹${totalPayout.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <!-- Search Input -->
        <div class="relative">
          <input type="text"
                 placeholder="Search by weighment slip no, farmer name, booking code, or crop..."
                 oninput="handleDealerTxnSearch(event)"
                 class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5"></i>
        </div>
      </div>

      <!-- Transactions List Container -->
      <div id="dealer-txns-list-container">
        ${renderDealerTransactionsListHtml(txns)}
      </div>

    </div>
  `;
}

function renderDealerTransactionsListHtml(txns) {
  let displayed = txns || [];

  if (dealerTxnSearchQuery) {
    displayed = displayed.filter(t => {
      const q = dealerTxnSearchQuery;
      return (
        (t.weighment_slip_no || '').toLowerCase().includes(q) ||
        (t.farmer_name || '').toLowerCase().includes(q) ||
        (t.booking_code || '').toLowerCase().includes(q) ||
        (t.token_number || '').toLowerCase().includes(q) ||
        (t.crop_type || '').toLowerCase().includes(q)
      );
    });
  }

  if (displayed.length === 0) {
    return `
      <div class="glass-card p-12 text-center text-slate-400 space-y-2">
        <i data-lucide="receipt" class="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto"></i>
        <p class="text-sm font-bold">No procurement transactions recorded yet.</p>
      </div>
    `;
  }

  return `
    <div class="space-y-3.5">
      ${displayed.map(t => {
        const totalFormatted = Number(t.total_amount || 0).toLocaleString('en-IN');

        return `
          <div class="glass-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-amber-500 transition shadow-sm">
            
            <!-- Left Info Column -->
            <div class="space-y-1.5 flex-1 min-w-[240px]">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono font-black text-sm text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  ${escapeHtml(t.weighment_slip_no || `SLIP-${t.id}`)}
                </span>
                <span class="badge-status badge-approved text-xs py-1 px-2.5">
                  ${escapeHtml(t.quality_grade || 'Grade A')}
                </span>
                <span class="text-xs text-slate-400 font-mono font-semibold">
                  ${escapeHtml(t.token_number || t.booking_code || '')}
                </span>
              </div>

              <div class="text-xs text-slate-700 dark:text-slate-300 font-bold">
                Farmer: <span class="text-slate-900 dark:text-white font-extrabold text-sm">${escapeHtml(t.farmer_name || 'Farmer')}</span>
                <span class="text-slate-400 font-normal"> • 🌾 ${escapeHtml(t.crop_type || 'Produce')} (${t.actual_quantity} Q @ ₹${t.rate_per_quintal}/Q)</span>
              </div>

              <div class="text-[11px] text-slate-400 flex items-center gap-2">
                <span>🕒 ${escapeHtml(t.transaction_time || '')}</span>
                <span>•</span>
                <span>Booking: ${escapeHtml(t.booking_code || '')}</span>
              </div>
            </div>

            <!-- Right Amount & Slip Button -->
            <div class="flex items-center justify-between md:justify-end gap-4 min-w-[220px] pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-slate-800">
              <div class="text-left md:text-right">
                <span class="text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono block">
                  ₹${totalFormatted}
                </span>
                <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                  ${escapeHtml(t.payment_status || 'DIRECT BANK DBT')}
                </span>
              </div>

              <button onclick='openDealerReceiptModal(${JSON.stringify(t).replace(/'/g, "&apos;")})' class="btn-agri bg-amber-600 hover:bg-amber-700 text-white text-xs py-2.5 px-4 font-black shadow-md flex items-center gap-1.5 flex-shrink-0">
                <i data-lucide="printer" class="w-4 h-4"></i> View Slip / Print
              </button>
            </div>

          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ----------------------------------------------------
// TRANSACTION MODAL & PROCURING
// ----------------------------------------------------
function openDealerReceiptModal(t) {
  if (!t) return;
  const user = state.currentUser || {};
  const dp = user.dealer_profile || {};

  const receiptData = {
    transaction_id: t.weighment_slip_no || t.id,
    weighment_slip_no: t.weighment_slip_no,
    booking_code: t.booking_code,
    token_number: t.token_number || t.booking_code,
    farmer_name: t.farmer_name,
    crop: t.crop_type,
    crop_type: t.crop_type,
    actual_quantity_display: `${t.actual_quantity} Quintals`,
    actual_quantity: t.actual_quantity,
    rate_display: `₹${t.rate_per_quintal} / Q`,
    rate_per_quintal: t.rate_per_quintal,
    total_amount_formatted: `₹${Number(t.total_amount).toLocaleString('en-IN')}`,
    total_amount: t.total_amount,
    transaction_time: t.transaction_time,
    centre_name: dp.assigned_centre_name || 'Procurement Center',
    dealer_name: dp.business_name || user.business_name || user.name,
    dealer_business: dp.license_number ? `License: ${dp.license_number}` : '',
    payment_status: t.payment_status || 'PAYMENT_PENDING'
  };

  state.setReceiptData(receiptData);
}

async function handleVerifyFarmerDirect(bookingCode) {
  try {
    const res = await api.scanQRCode(bookingCode);
    if (!res.is_valid) {
      alert(res.message || "QR Code verification failed.");
      return;
    }
    triggerAutomatedProcurement(res);
  } catch (err) {
    alert(err.message || "Verification failed.");
  }
}

function renderProcurementEntryForm() {
  const bk = window.activeProcurementBooking;
  if (!bk) {
    state.setActiveTab('scan_qr');
    return '';
  }

  return `
    <div class="max-w-2xl mx-auto space-y-6 animate-fade-in">
      
      <div class="glass-card p-5 border-l-4 border-emerald-600 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="scale" class="w-6 h-6 text-emerald-600"></i>
            Weighbridge &amp; Procurement Entry Form
          </h2>
          <p class="text-xs text-slate-500">Booking Token: ${bk.token_number} (${bk.booking_code})</p>
        </div>
        <span class="badge-status badge-approved">Valid Booking ✓</span>
      </div>

      <form id="procurement-form" onsubmit="handleConfirmProcurement(event)" class="glass-card p-6 space-y-5">
        
        <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span class="text-slate-400 block font-medium">Farmer Name</span>
            <span class="font-extrabold text-slate-900 dark:text-white text-sm">${escapeHtml(bk.farmer_name)}</span>
          </div>
          <div>
            <span class="text-slate-400 block font-medium">Crop &amp; Declared Qty</span>
            <span class="font-bold text-emerald-600">${escapeHtml(bk.crop_type)} (${bk.expected_quantity_quintals} Q)</span>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            ${i18n.t('weighment_slip')} *
          </label>
          <input type="text" id="proc-slip-no" value="SLIP-${Math.floor(100000 + Math.random() * 900000)}" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white">
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ${i18n.t('actual_quantity')} *
            </label>
            <input type="number" id="proc-actual-qty" min="0.1" max="1000" step="0.1" value="${bk.expected_quantity_quintals}" oninput="calculateProcurementTotal()" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ${i18n.t('quality_grade')} *
            </label>
            <select id="proc-quality-grade" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
              <option value="Grade A">Grade A (Fine / High Moisture Standard)</option>
              <option value="Grade B">Grade B (Standard)</option>
              <option value="Grade C">Grade C (Fair Average Quality)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ${i18n.t('rate_per_quintal')} (MSP Rate) *
            </label>
            <input type="number" id="proc-rate" min="100" max="50000" step="10" value="2300" oninput="calculateProcurementTotal()" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ${i18n.t('total_amount')} (Auto Calculated)
            </label>
            <div id="proc-computed-total" class="w-full px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
              ₹${(bk.expected_quantity_quintals * 2300).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button type="button" onclick="state.setActiveTab('scan_qr')" class="w-1/3 py-3 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold text-xs text-slate-700 dark:text-slate-300">
            Cancel
          </button>
          <button type="submit" class="btn-agri flex-1 py-3 text-sm font-bold shadow-xl">
            <i data-lucide="check-circle-2" class="w-5 h-5"></i> ${i18n.t('submit_procurement')}
          </button>
        </div>

      </form>

    </div>
  `;
}

function calculateProcurementTotal() {
  const qty = parseFloat(document.getElementById("proc-actual-qty")?.value || 0);
  const rate = parseFloat(document.getElementById("proc-rate")?.value || 0);
  const total = roundTotal(qty * rate);
  const display = document.getElementById("proc-computed-total");
  if (display) {
    display.innerText = `₹${total.toLocaleString('en-IN')}`;
  }
}

function roundTotal(num) {
  return Math.round(num * 100) / 100;
}

async function handleConfirmProcurement(e) {
  e.preventDefault();
  const bk = window.activeProcurementBooking;
  const slipNo = document.getElementById("proc-slip-no")?.value;
  const actualQty = document.getElementById("proc-actual-qty")?.value;
  const grade = document.getElementById("proc-quality-grade")?.value;
  const rate = document.getElementById("proc-rate")?.value;

  try {
    const res = await api.processProcurement(bk.booking_code, actualQty, grade, rate, slipNo);
    if (window.confetti) {
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
    }
    window.activeProcurementBooking = null;
    state.setScannedQRResult(null);
    state.setActiveTab('transactions');
    const notifs = await api.getNotifications();
    state.setNotifications(notifs);
  } catch (err) {
    alert(err.message);
  }
}

async function handleRefreshDealerStatus() {
  try {
    const fresh = await api.getCurrentUser();
    if (fresh) {
      state.setCurrentUser(fresh);
      try {
        const notifs = await api.getNotifications();
        state.setNotifications(notifs);
      } catch (e) {}
    }
  } catch (err) {
    console.error("Failed to refresh dealer status:", err);
  }
}

async function renderDealerProfilePage() {
  let profile = {};
  let centres = [];
  let categories = [];

  try {
    profile = await api.getDealerProfile();
  } catch (err) {
    const u = state.currentUser || {};
    const dp = u.dealer_profile || {};
    profile = {
      id: dp.id || u.id || 1,
      user_id: u.id,
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      role: "DEALER",
      business_name: dp.business_name || (u.name + " Procurement Traders"),
      address: dp.address || "Telangana",
      government_id_type: dp.government_id_type || "GSTIN",
      government_id_number: dp.government_id_number || "36AAAAA0000A1Z5",
      license_number: dp.license_number || ("DL-TEL-" + String(u.id || 1).padStart(4, '0')),
      status: dp.status || "APPROVED",
      assigned_centre_id: dp.assigned_centre_id || null,
      centre_name: dp.assigned_centre_name || "",
      category_id: dp.category_id || null,
      category_name: dp.category_name || "Paddy",
      daily_capacity_quintals: dp.daily_capacity_quintals || 500.0,
      daily_requirements: dp.daily_requirements || "",
      bank_name: dp.bank_name || "",
      bank_account_no: dp.bank_account_no || "",
      ifsc_code: dp.ifsc_code || "",
      is_email_verified: u.is_email_verified !== false
    };
  }

  try {
    centres = await api.getDealerCentres();
  } catch (e) {
    centres = [];
  }

  try {
    categories = await api.getDealerCategories();
  } catch (e) {
    categories = [];
  }

  return `
    <div class="max-w-3xl mx-auto space-y-6 animate-fade-in">
      
      <!-- Top Navigation -->
      <div class="flex items-center justify-between gap-3">
        <button onclick="state.setActiveTab('home')" class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-sm border-2 border-slate-200 dark:border-slate-700 shadow-sm transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
        </button>

        <div class="flex items-center gap-2">
          <span class="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black ${profile.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-2 border-emerald-400/60 dark:border-emerald-700' : 'bg-amber-100 text-amber-900 border-2 border-amber-400'} flex items-center gap-2 shadow-sm">
            <i data-lucide="${profile.status === 'APPROVED' ? 'shield-check' : 'clock'}" class="w-4 h-4 ${profile.status === 'APPROVED' ? 'text-emerald-600' : 'text-amber-600'}"></i>
            ${profile.status === 'APPROVED' ? 'Verified Government Dealer' : 'Dealer Status: ' + escapeHtml(profile.status)}
          </span>
        </div>
      </div>

      <!-- CARD 1: Dealer Header Card Banner (Highlighted with enhanced typography) -->
      <div class="gold-gradient text-white p-6 sm:p-8 rounded-3xl shadow-2xl border-2 border-amber-300/40 dark:border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden backdrop-blur-md">
        <div class="z-10 space-y-2">
          <div class="flex flex-wrap items-center gap-2.5">
            <h2 class="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-sm">${escapeHtml(profile.business_name || profile.name || 'Procurement Agency')}</h2>
            <span class="px-3 py-1 rounded-full text-xs font-black bg-white/30 text-white uppercase tracking-wider shadow-xs">
              ✓ ${escapeHtml(profile.status)}
            </span>
          </div>
          <p class="text-sm sm:text-base text-amber-100 font-medium">
            🌾 Authorized Produce: <strong class="text-white">${escapeHtml(profile.category_name || 'All Crops')}</strong> • ${escapeHtml(profile.centre_name ? profile.centre_name : 'Telangana State Mandi')}
          </p>
          <div class="inline-flex items-center gap-2 bg-black/25 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/20 text-xs sm:text-sm text-amber-100 font-mono font-bold shadow-inner">
            <span>Dealer ID: <strong class="text-white">#DLR-${profile.id}</strong></span>
            <span class="opacity-60">•</span>
            <span>Daily Capacity: <strong class="text-white">${profile.daily_capacity_quintals || 500} Qtl/Day</strong></span>
          </div>
        </div>

        <div class="z-10 flex-shrink-0 self-stretch sm:self-auto">
          <div class="bg-black/25 backdrop-blur-md p-4 rounded-2xl border-2 border-white/25 text-center shadow-lg">
            <span class="text-xs uppercase font-extrabold text-amber-200 block tracking-wider">Government License</span>
            <span class="font-black text-sm sm:text-base text-white flex items-center justify-center gap-1.5 mt-1 font-mono">
              <i data-lucide="badge-check" class="w-4 h-4 text-amber-300"></i> ${escapeHtml(profile.license_number || 'ACTIVE')}
            </span>
          </div>
        </div>

        <div class="absolute right-0 bottom-0 opacity-10 font-black text-9xl pointer-events-none select-none">🏢</div>
      </div>

      <!-- CARD 2: Dealer Profile Form Card (Highlighted with clean borders & larger readable text) -->
      <div class="bg-white/95 dark:bg-slate-900/95 rounded-3xl border-2 border-emerald-500/40 dark:border-emerald-600/40 shadow-2xl overflow-hidden backdrop-blur-sm">
        
        <form id="dealer-profile-form" onsubmit="handleSaveDealerProfile(event)" class="p-6 sm:p-9 space-y-7">
          
          <div id="dealer-profile-alert" class="hidden p-4 rounded-2xl text-sm sm:text-base font-bold shadow-sm"></div>

          <!-- Section 1: Dealer & Business Contact Details -->
          <div class="space-y-4">
            <h3 class="text-sm sm:text-base font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-2.5 border-b-2 border-emerald-100 dark:border-emerald-950 pb-2.5">
              <i data-lucide="building-2" class="w-5 h-5 text-emerald-600 dark:text-emerald-400"></i> Business &amp; Contact Details
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              
              <!-- Dealer ID (Read-only system controlled) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                  Dealer ID (System Controlled)
                </label>
                <input type="text" value="DLR-${profile.id}" disabled class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-sm sm:text-base font-mono font-bold cursor-not-allowed">
              </div>

              <!-- Dealer Full Name (Editable) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Authorized Dealer Name *
                </label>
                <input type="text" id="dp-name" required value="${escapeHtml(profile.name || '')}" placeholder="Enter full legal name" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition">
              </div>

              <!-- Business / Enterprise Name (Editable) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Business / Trading Name *
                </label>
                <input type="text" id="dp-biz-name" required value="${escapeHtml(profile.business_name || '')}" placeholder="e.g. Sri Rama Agro Traders" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition">
              </div>

              <!-- Mobile Number (Editable) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Mobile Number (10 Digits) *
                </label>
                <input type="tel" id="dp-phone" required pattern="[0-9]{10}" value="${escapeHtml(profile.phone || '')}" placeholder="9876543210" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition font-mono">
              </div>

              <!-- Email Address (Editable) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Email Address *
                </label>
                <input type="email" id="dp-email" required value="${escapeHtml(profile.email || '')}" placeholder="dealer@example.com" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition">
              </div>

              <!-- Business / Mandi Address (Editable) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Business / Mandi Address *
                </label>
                <input type="text" id="dp-address" required value="${escapeHtml(profile.address || '')}" placeholder="Plot no, Mandi Road, District" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition">
              </div>

              <!-- Government ID & License (Protected read-only) -->
              <div class="sm:col-span-2">
                <label class="block text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                  Government License &amp; ID (Admin Verified &amp; Protected)
                </label>
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border-2 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/40 text-slate-700 dark:text-slate-200 text-sm font-mono font-semibold">
                  <div class="flex items-center gap-2">
                    <i data-lucide="shield-check" class="w-4 h-4 text-emerald-600"></i>
                    <span>${escapeHtml(profile.government_id_type || 'GSTIN')}: <strong>${escapeHtml(profile.government_id_number || '36AAAAA0000A1Z5')}</strong></span>
                  </div>
                  <div class="flex items-center gap-2">
                    <i data-lucide="file-badge" class="w-4 h-4 text-amber-600"></i>
                    <span>License: <strong>${escapeHtml(profile.license_number || 'DL-TEL-ACTIVE')}</strong></span>
                    <span class="text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-200/70 dark:bg-emerald-900 px-2.5 py-0.5 rounded-md">Verified</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Section 2: Procurement Centre & Buying Products (Official Admin List) -->
          <div class="space-y-4 pt-3">
            <h3 class="text-sm sm:text-base font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-2.5 border-b-2 border-emerald-100 dark:border-emerald-950 pb-2.5">
              <i data-lucide="warehouse" class="w-5 h-5 text-emerald-600 dark:text-emerald-400"></i> Procurement Operations &amp; Crop Allotment
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              
              <!-- Assigned Procurement Centre (Dropdown from Admin Centres) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Assigned Procurement Centre *
                </label>
                <select id="dp-centre-id" required class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition">
                  <option value="">-- Select Admin-Approved Centre --</option>
                  ${centres.map(c => `
                    <option value="${c.id}" ${profile.assigned_centre_id === c.id ? 'selected' : ''}>
                      ${escapeHtml(c.name)} (${escapeHtml(c.code)}) - ${escapeHtml(c.district)}
                    </option>
                  `).join('')}
                </select>
                <p class="text-[11px] text-slate-500 mt-1">Select from official government procurement centres created by Admin.</p>
              </div>

              <!-- Buying Products / Crops (Dropdown from Admin Categories) -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Buying Products / Commodity *
                </label>
                <select id="dp-category-id" required class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition">
                  <option value="">-- Select Approved Crop/Product --</option>
                  ${categories.map(cat => `
                    <option value="${cat.id}" ${profile.category_id === cat.id ? 'selected' : ''}>
                      🌾 ${escapeHtml(cat.name)} ${cat.description ? '- ' + escapeHtml(cat.description) : ''}
                    </option>
                  `).join('')}
                </select>
                <p class="text-[11px] text-slate-500 mt-1">Must be an official crop category approved by Government Admin.</p>
              </div>

              <!-- Daily Capacity (in Quintals) -->
              <div class="sm:col-span-2">
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Daily Procurement Capacity (Quintals) *
                </label>
                <input type="number" step="10" min="10" max="100000" id="dp-capacity" required value="${profile.daily_capacity_quintals || 500}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition font-mono">
                <p class="text-[11px] text-slate-500 mt-1">Maximum daily quintal handling capacity for this centre.</p>
              </div>

            </div>
          </div>

          <!-- Section 3: Dealer Bank Account Details -->
          <div class="space-y-4 pt-3">
            <h3 class="text-sm sm:text-base font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-2.5 border-b-2 border-emerald-100 dark:border-emerald-950 pb-2.5">
              <i data-lucide="landmark" class="w-5 h-5 text-emerald-600 dark:text-emerald-400"></i> Business Banking &amp; Settlement Account
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
              
              <!-- Bank Name -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">Bank Name</label>
                <input type="text" id="dp-bank-name" value="${escapeHtml(profile.bank_name || '')}" placeholder="State Bank of India" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition">
              </div>

              <!-- Bank Account Number -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">Bank Account Number</label>
                <input type="text" id="dp-bank-acc" value="${escapeHtml(profile.bank_account_no || '')}" placeholder="Account Number" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition font-mono">
              </div>

              <!-- IFSC Code -->
              <div>
                <label class="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">IFSC Code</label>
                <input type="text" id="dp-ifsc" value="${escapeHtml(profile.ifsc_code || '')}" placeholder="SBIN0001234" class="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition font-mono uppercase">
              </div>

            </div>
          </div>

          <!-- Form Action Buttons -->
          <div class="pt-5 border-t-2 border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3.5 flex-wrap">
            <button type="button" onclick="state.setActiveTab('home')" class="px-6 py-3 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
              Cancel
            </button>
            <button type="submit" id="dp-save-btn" class="btn-agri text-sm sm:text-base font-black px-8 py-3.5 shadow-2xl flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all">
              <i data-lucide="save" class="w-4 h-4"></i> Save &amp; Update Profile
            </button>
          </div>

        </form>

      </div>

    </div>
  `;
}

async function handleSaveDealerProfile(e) {
  e.preventDefault();
  const alertEl = document.getElementById("dealer-profile-alert");
  const saveBtn = document.getElementById("dp-save-btn");

  const name = document.getElementById("dp-name")?.value.trim();
  const bizName = document.getElementById("dp-biz-name")?.value.trim();
  const phone = document.getElementById("dp-phone")?.value.trim();
  const email = document.getElementById("dp-email")?.value.trim();
  const address = document.getElementById("dp-address")?.value.trim();
  const centreId = document.getElementById("dp-centre-id")?.value ? parseInt(document.getElementById("dp-centre-id").value) : null;
  const categoryId = document.getElementById("dp-category-id")?.value ? parseInt(document.getElementById("dp-category-id").value) : null;
  const capacity = parseFloat(document.getElementById("dp-capacity")?.value || 500);
  const bankName = document.getElementById("dp-bank-name")?.value.trim();
  const bankAcc = document.getElementById("dp-bank-acc")?.value.trim();
  const ifsc = document.getElementById("dp-ifsc")?.value.trim().toUpperCase();

  if (!name || name.length < 2) {
    if (alertEl) {
      alertEl.className = "p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-700 border border-rose-200";
      alertEl.textContent = "Please enter a valid dealer name (minimum 2 characters).";
      alertEl.classList.remove("hidden");
    }
    return;
  }

  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 10) {
    if (alertEl) {
      alertEl.className = "p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-700 border border-rose-200";
      alertEl.textContent = "Please enter a valid 10-digit mobile number.";
      alertEl.classList.remove("hidden");
    }
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Saving Profile...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const updated = await api.updateDealerProfile({
      name,
      business_name: bizName,
      phone: phoneDigits,
      email,
      address,
      assigned_centre_id: centreId,
      category_id: categoryId,
      daily_capacity_quintals: capacity,
      bank_name: bankName,
      bank_account_no: bankAcc,
      ifsc_code: ifsc
    });

    if (state.currentUser) {
      state.currentUser.name = updated.name;
      state.currentUser.email = updated.email;
      state.currentUser.phone = updated.phone;
      if (!state.currentUser.dealer_profile) {
        state.currentUser.dealer_profile = {};
      }
      state.currentUser.dealer_profile.business_name = updated.business_name;
      state.currentUser.dealer_profile.address = updated.address;
      state.currentUser.dealer_profile.assigned_centre_id = updated.assigned_centre_id;
      state.currentUser.dealer_profile.assigned_centre_name = updated.centre_name;
      state.currentUser.dealer_profile.category_id = updated.category_id;
      state.currentUser.dealer_profile.category_name = updated.category_name;
      state.currentUser.dealer_profile.daily_capacity_quintals = updated.daily_capacity_quintals;
      state.currentUser.dealer_profile.daily_requirements = updated.daily_requirements;
      state.currentUser.dealer_profile.bank_name = updated.bank_name;
      state.currentUser.dealer_profile.bank_account_no = updated.bank_account_no;
      state.currentUser.dealer_profile.ifsc_code = updated.ifsc_code;
      localStorage.setItem("sf_current_user", JSON.stringify(state.currentUser));
    }

    if (alertEl) {
      alertEl.className = "p-4 rounded-2xl text-sm sm:text-base font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800";
      alertEl.textContent = "✓ Dealer Profile updated successfully! All business details saved.";
      alertEl.classList.remove("hidden");
    }

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i> Saved ✓`;
      if (window.lucide) lucide.createIcons();
    }

    if (typeof showNotificationToast === "function") {
      showNotificationToast({
        title: "Dealer Profile Updated ✓",
        message: "Your business details and procurement allotment have been saved.",
        type: "booking"
      });
    }

    setTimeout(() => {
      state.notify();
    }, 1000);

  } catch (err) {
    if (alertEl) {
      alertEl.className = "p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-700 border border-rose-200";
      alertEl.textContent = err.message || "Failed to update dealer profile. Please check your inputs.";
      alertEl.classList.remove("hidden");
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Save &amp; Update Profile`;
      if (window.lucide) lucide.createIcons();
    }
  }
}
window.renderDealerProfilePage = renderDealerProfilePage;
window.handleSaveDealerProfile = handleSaveDealerProfile;

