let dealerStatusPollTimer = null;

async function renderDealerView() {
  const user = state.currentUser;
  const activeTab = state.activeTab;
  const dp = user.dealer_profile || {};
  const status = dp.status || user.dealer_status || "PENDING";

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
    return `
      <div class="max-w-xl mx-auto py-10 space-y-6">
        
        <div class="glass-card p-6 border-2 ${status === 'PENDING' ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30' : 'border-red-500 bg-red-50/50 dark:bg-red-950/30'} text-center shadow-2xl">
          
          <div class="w-16 h-16 rounded-full ${status === 'PENDING' ? 'bg-amber-500' : 'bg-red-500'} text-white flex items-center justify-center font-bold text-2xl mx-auto mb-4 shadow-lg">
            ${status === 'PENDING' ? '⏳' : '❌'}
          </div>

          <span class="badge-status ${status === 'PENDING' ? 'badge-pending' : 'badge-rejected'} text-sm py-1.5 px-4 mb-3">
            DEALER STATUS: ${status}
          </span>

          <h3 class="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
            ${dp.business_name || user.business_name || user.name}
          </h3>

          <p class="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed mb-4">
            ${status === 'PENDING' 
              ? 'Your dealer registration documents have been submitted to Government Admin. Procurement functions will unlock automatically upon verification.' 
              : `Your dealer access was restricted by Admin. Reason: ${dp.rejection_reason || 'Compliance review required'}`}
          </p>

          <div class="bg-white dark:bg-slate-900 p-4 rounded-xl text-left text-xs space-y-2 border border-slate-200 dark:border-slate-800">
            <div class="flex justify-between">
              <span class="text-slate-400">Government ID:</span>
              <span class="font-bold text-slate-800 dark:text-slate-200">${dp.government_id_type || 'GSTIN'}: ${dp.government_id_number || 'Verified'}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">License Number:</span>
              <span class="font-mono font-bold text-emerald-600">${dp.license_number || 'Registered'}</span>
            </div>
          </div>

          <div class="mt-6 flex justify-center items-center gap-3">
            <button onclick="handleRefreshDealerStatus()" class="btn-agri text-xs py-2.5 px-5 shadow-lg">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Check Approval Status
            </button>
            <button onclick="logoutUser()" class="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
              <i data-lucide="log-out" class="w-4 h-4"></i> Logout
            </button>
          </div>

          <div class="mt-4 text-[11px] text-slate-400">
            For approval inquiries, please contact your regional procurement centre or district administrator.
          </div>

        </div>

      </div>
    `;
  }

  // Dealer is APPROVED!
  if (activeTab === 'scan_qr') {
    return renderQRScannerModal();
  } else if (activeTab === 'process_procurement_form') {
    return renderProcurementEntryForm();
  } else if (activeTab === 'transactions') {
    return await renderDealerTransactionsPage();
  } else if (activeTab === 'dealer_queue') {
    return await renderDealerQueuePage();
  }

  // Fetch live DB queue summary for dealer dashboard
  let liveQData = cachedDealerQueue;
  if (!liveQData) {
    try {
      liveQData = await api.getDealerQueue();
      cachedDealerQueue = liveQData;
    } catch (e) {}
  }

  const currentServingToken = liveQData?.current_token || 'PDC-1001';
  const totalQueueToday = liveQData?.queue?.length || 12;

  // Default Dealer Home Dashboard
  return `
    <div class="max-w-4xl mx-auto space-y-6">
      
      <div class="gold-gradient text-white p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider mb-2 inline-block">
            Verified Procurement Dealer
          </span>
          <h2 class="text-2xl font-extrabold">${dp.business_name || user.business_name || user.name}</h2>
          <p class="text-xs text-amber-100 mt-0.5">License: ${dp.license_number || 'Active'} • Station Active</p>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto">
          <button onclick="state.setActiveTab('scan_qr')" class="btn-agri bg-white text-emerald-800 hover:bg-amber-50 text-sm py-2.5 px-5 shadow-xl font-extrabold flex-1 sm:flex-none">
            <i data-lucide="qr-code" class="w-5 h-5"></i> ${i18n.t('scan_farmer_qr')}
          </button>
          <button onclick="logoutUser()" class="px-3 py-2.5 bg-red-600/80 hover:bg-red-600 border border-red-400/40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
            <i data-lucide="log-out" class="w-4 h-4"></i> Logout
          </button>
        </div>
      </div>

      <!-- Quick Scan Trigger Card -->
      <div class="glass-card p-6 text-center py-10 border-2 border-dashed border-emerald-500/40 hover:border-emerald-500 transition cursor-pointer" onclick="state.setActiveTab('scan_qr')">
        <div class="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-md">
          <i data-lucide="camera" class="w-8 h-8"></i>
        </div>
        <h3 class="text-lg font-bold text-slate-900 dark:text-white">Scan Farmer Digital Pass</h3>
        <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">Validate booking status, centre code, and single-use pass validity instantly via camera.</p>
        <span class="btn-agri text-xs px-5">Open Scanner</span>
      </div>

      <!-- Today's Procurement Queue Card (Clickable to Manage Queue) -->
      <div class="glass-card p-6 border-l-4 border-emerald-600 hover:shadow-xl transition-all cursor-pointer bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/40 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/20 group" onclick="state.setActiveTab('dealer_queue')">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-600/30 group-hover:scale-105 transition-transform">
              <i data-lucide="clipboard-list" class="w-7 h-7"></i>
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 rounded-full">Live Queue Manager</span>
                <span class="flex h-2 w-2 relative">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <h3 class="text-xl font-black text-slate-900 dark:text-white">
                📋 Today's Procurement Queue
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1">
                <span class="text-emerald-700 dark:text-emerald-400 font-bold">${totalQueueToday} Farmers Today</span> &nbsp;•&nbsp; Currently Serving: <span class="font-mono font-black text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/80 px-2 py-0.5 rounded">${currentServingToken}</span>
              </p>
            </div>
          </div>
          <button type="button" class="btn-agri text-xs font-bold py-2.5 px-5 shadow-md flex items-center gap-1.5 group-hover:bg-emerald-700">
            <span>Click to Manage Queue →</span>
          </button>
        </div>
      </div>

      <!-- Procurement Completion Card -->
      <div class="glass-card p-6 border-l-4 border-teal-600 hover:shadow-xl transition-all cursor-pointer bg-gradient-to-r from-teal-50/70 via-white to-emerald-50/40 dark:from-teal-950/40 dark:via-slate-900 dark:to-emerald-950/20 group" onclick="state.setActiveTab('transactions')">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-teal-600/30 group-hover:scale-105 transition-transform">
              <i data-lucide="check-check" class="w-7 h-7"></i>
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[11px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/60 px-2.5 py-0.5 rounded-full">After Weighing Record</span>
              </div>
              <h3 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                ✅ Procurement Completion
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1">
                Stores: Booking ID • Farmer • Crop • Expected/Actual Qty • Date & Time • Centre • Token • Transaction ID
              </p>
            </div>
          </div>
          <button type="button" class="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md">
            <span>View Stored Records →</span>
          </button>
        </div>
      </div>

    </div>
  `;
}

function renderProcurementEntryForm() {
  const bk = window.activeProcurementBooking;
  if (!bk) {
    state.setActiveTab('scan_qr');
    return '';
  }

  return `
    <div class="max-w-2xl mx-auto space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-emerald-600 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="scale" class="w-6 h-6 text-emerald-600"></i>
            Weighbridge & Procurement Entry Form
          </h2>
          <p class="text-xs text-slate-500">Booking Token: ${bk.token_number} (${bk.booking_code})</p>
        </div>
        <span class="badge-status badge-approved">Valid Booking ✓</span>
      </div>

      <form id="procurement-form" onsubmit="handleConfirmProcurement(event)" class="glass-card p-6 space-y-5">
        
        <!-- Farmer Info Summary -->
        <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span class="text-slate-400 block font-medium">Farmer Name</span>
            <span class="font-extrabold text-slate-900 dark:text-white text-sm">${bk.farmer_name}</span>
          </div>
          <div>
            <span class="text-slate-400 block font-medium">Crop & Declared Qty</span>
            <span class="font-bold text-emerald-600">${bk.crop_type} (${bk.expected_quantity_quintals} Q)</span>
          </div>
        </div>

        <!-- Weighment Slip No -->
        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            ${i18n.t('weighment_slip')} *
          </label>
          <input type="text" id="proc-slip-no" value="SLIP-${Math.floor(100000 + Math.random() * 900000)}" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm font-mono font-bold">
        </div>

        <!-- Actual Weight & Quality Grade -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ${i18n.t('actual_quantity')} *
            </label>
            <input type="number" id="proc-actual-qty" min="0.1" max="1000" step="0.1" value="${bk.expected_quantity_quintals}" oninput="calculateProcurementTotal()" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm font-bold">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ${i18n.t('quality_grade')} *
            </label>
            <select id="proc-quality-grade" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm">
              <option value="Grade A">Grade A (Fine / High Moisture Standard)</option>
              <option value="Grade B">Grade B (Standard)</option>
              <option value="Grade C">Grade C (Fair Average Quality)</option>
            </select>
          </div>
        </div>

        <!-- Rate per Quintal & Computed Total -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ${i18n.t('rate_per_quintal')} (MSP Rate) *
            </label>
            <input type="number" id="proc-rate" min="100" max="50000" step="10" value="2300" oninput="calculateProcurementTotal()" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm font-bold">
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

        <!-- Action Buttons -->
        <div class="flex gap-3 pt-2">
          <button type="button" onclick="state.setActiveTab('scan_qr')" class="w-1/3 py-3 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold text-xs">
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

async function renderDealerTransactionsPage() {
  let txns = [];
  try {
    txns = await api.getDealerTransactions();
  } catch (e) {}

  const isDedicatedTab = state.activeTab === 'transactions';

  return `
    <div class="space-y-5 animate-fade-in max-w-4xl mx-auto">
      ${isDedicatedTab ? `
        <button onclick="state.setActiveTab('home')" class="inline-flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
        </button>
      ` : ''}

      <div class="glass-card p-6 border-l-8 border-teal-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl bg-gradient-to-r from-teal-50 via-white to-emerald-50/40 dark:from-teal-950/40 dark:via-slate-900 dark:to-emerald-950/20">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-teal-600 text-white shadow-sm">
              Procurement Completion Archive
            </span>
          </div>
          <h2 class="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            ✅ Completed Procurement & Weighment Records
          </h2>
          <p class="text-xs text-slate-500 font-medium mt-0.5">Stored audit log of weighbridge slips, farmer settlements, and DBT records</p>
        </div>
        <span class="text-xs font-black font-mono text-teal-800 dark:text-teal-200 bg-teal-100 dark:bg-teal-950/90 px-4 py-2 rounded-2xl border-2 border-teal-400 dark:border-teal-700 shrink-0 shadow-sm">
          Total: ${txns.length} Completed
        </span>
      </div>

      <div class="space-y-4">
        ${txns.length === 0 ? `
          <div class="glass-card p-10 text-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800">
            <i data-lucide="clipboard-x" class="w-14 h-14 text-slate-300 mx-auto mb-3"></i>
            <p class="font-extrabold text-base text-slate-700 dark:text-slate-200">No completed procurement transactions recorded yet.</p>
            <p class="text-xs text-slate-400 mt-1">Complete a farmer's weighment from Queue Manager or QR Scanner to store records here.</p>
          </div>
        ` : txns.map(t => `
          <div class="glass-card p-6 border-2 border-teal-500/80 hover:border-teal-500 dark:border-teal-600/80 hover:shadow-2xl transition-all relative overflow-hidden bg-white dark:bg-slate-900 border-l-8 border-l-teal-600">
            
            <!-- Card Header: Slip, Status & Amount -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b-2 border-slate-100 dark:border-slate-800 gap-3">
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="px-3 py-1.5 rounded-xl text-xs font-black bg-teal-600 text-white font-mono shadow-sm flex items-center gap-1.5">
                  <i data-lucide="hash" class="w-3.5 h-3.5"></i> ${escapeHtml(t.transaction_id || `TXN-${t.id}`)}
                </span>
                <span class="px-3 py-1.5 rounded-xl text-xs font-black bg-slate-900 text-amber-300 dark:bg-slate-800 font-mono shadow-sm border border-slate-700">
                  📄 ${escapeHtml(t.weighment_slip_no)}
                </span>
                <span class="px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  ★ ${escapeHtml(t.quality_grade)}
                </span>
              </div>
              <div class="flex items-center gap-3 self-start sm:self-auto">
                <div class="px-4 py-1.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border-2 border-emerald-500 shadow-sm flex items-center gap-1.5">
                  <span class="text-[10px] text-emerald-700 font-bold uppercase">Total</span>
                  <span class="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono">₹${t.total_amount.toLocaleString('en-IN')}</span>
                </div>
                <span class="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 shadow-sm">
                  ${t.payment_status}
                </span>
              </div>
            </div>

            <!-- Stored 9 Required Details Grid (Highlighted with High-Contrast Theming) -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              
              <!-- 1. Booking ID -->
              <div class="p-3.5 rounded-2xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 shadow-sm">
                <span class="text-[10px] text-blue-700 dark:text-blue-300 font-black uppercase tracking-wider block mb-1">
                  🔖 Booking ID
                </span>
                <span class="font-mono font-black text-slate-900 dark:text-white text-sm block truncate">${escapeHtml(t.booking_code)}</span>
              </div>

              <!-- 2. Token Number -->
              <div class="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-400 dark:border-emerald-700 shadow-sm">
                <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-black uppercase tracking-wider block mb-1">
                  🎫 Token Number
                </span>
                <span class="font-mono font-black text-emerald-700 dark:text-emerald-300 text-sm block">${escapeHtml(t.token_number || 'PDC-1001')}</span>
              </div>

              <!-- 3. Farmer Name -->
              <div class="p-3.5 rounded-2xl bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 shadow-sm">
                <span class="text-[10px] text-purple-700 dark:text-purple-300 font-black uppercase tracking-wider block mb-1">
                  👨‍🌾 Farmer
                </span>
                <span class="font-extrabold text-slate-900 dark:text-white text-sm block truncate">${escapeHtml(t.farmer_name)}</span>
              </div>

              <!-- 4. Crop -->
              <div class="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 shadow-sm">
                <span class="text-[10px] text-amber-800 dark:text-amber-300 font-black uppercase tracking-wider block mb-1">
                  🌾 Crop
                </span>
                <span class="font-black text-amber-900 dark:text-amber-200 text-sm block">${escapeHtml(t.crop_type)}</span>
              </div>

              <!-- 5. Expected Quantity -->
              <div class="p-3.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 shadow-sm">
                <span class="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider block mb-1">
                  ⚖️ Expected Qty
                </span>
                <span class="font-bold text-slate-800 dark:text-slate-200 font-mono text-sm block">${t.expected_quantity || 40.0} Q</span>
              </div>

              <!-- 6. Actual Quantity (Highlight Champion) -->
              <div class="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md border-2 border-emerald-400">
                <span class="text-[10px] text-emerald-100 font-black uppercase tracking-wider block mb-1">
                  ⚖️ Actual Quantity
                </span>
                <span class="font-black text-white font-mono text-base block">${t.actual_quantity} Quintals</span>
              </div>

              <!-- 7. Date & Time -->
              <div class="p-3.5 rounded-2xl bg-cyan-50/90 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/80 shadow-sm">
                <span class="text-[10px] text-cyan-800 dark:text-cyan-300 font-black uppercase tracking-wider block mb-1">
                  🕒 Date & Time (IST)
                </span>
                <span class="font-bold text-slate-900 dark:text-white font-mono text-xs block">${escapeHtml(t.date_time || t.transaction_time)}</span>
              </div>

              <!-- 8. Dealer / Centre -->
              <div class="p-3.5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 shadow-sm">
                <span class="text-[10px] text-indigo-800 dark:text-indigo-300 font-black uppercase tracking-wider block mb-1">
                  🏢 Dealer / Centre
                </span>
                <span class="font-black text-indigo-950 dark:text-indigo-200 truncate block text-xs" title="${escapeHtml(t.centre_name || 'Warangal Central Grain Mandi')}">${escapeHtml(t.centre_name || 'Warangal Central Grain Mandi')}</span>
              </div>
            </div>

          </div>
        `).join('')}
      </div>
    </div>
  `;
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

// -------------------------------------------------------------
// Dealer Today's Procurement Queue State & Controller (Connected to DB)
// -------------------------------------------------------------
let cachedDealerQueue = null;
let selectedDealerQueueToken = null;

function handleSelectDealerQueueToken(token) {
  selectedDealerQueueToken = token;
  renderApp();
}

async function handleStartProcurement(token) {
  try {
    cachedDealerQueue = await api.startDealerQueueProcurement(token);
    selectedDealerQueueToken = token;
    await renderApp();
  } catch (err) {
    alert(err.message || "Failed to start procurement");
  }
}

async function handleCompleteProcurement(token) {
  try {
    cachedDealerQueue = await api.completeDealerQueueProcurement(token);
    if (window.confetti) {
      try { confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } }); } catch (e) {}
    }
    // After completing, select the next waiting farmer in queue
    const queueList = cachedDealerQueue?.queue || [];
    const nextWait = queueList.find(f => f.status === 'WAITING');
    if (nextWait) {
      selectedDealerQueueToken = nextWait.token;
    }
    await renderApp();
  } catch (err) {
    alert(err.message || "Failed to complete procurement");
  }
}

async function handleNextFarmer() {
  const queueList = cachedDealerQueue?.queue || [];
  if (queueList.length > 0) {
    const currentIdx = queueList.findIndex(f => f.token === selectedDealerQueueToken);
    if (currentIdx !== -1 && currentIdx + 1 < queueList.length) {
      selectedDealerQueueToken = queueList[currentIdx + 1].token;
      await renderApp();
      return;
    }
  }
  // If at the end, jump to first waiting or first entry
  const nextWait = queueList.find(f => f.status === 'WAITING') || queueList[0];
  if (nextWait) {
    selectedDealerQueueToken = nextWait.token;
  }
  await renderApp();
}

async function handleResetDealerQueue() {
  try {
    cachedDealerQueue = await api.resetDealerQueue();
    selectedDealerQueueToken = "PDC-1001";
    await renderApp();
  } catch (err) {
    alert(err.message || "Failed to reset queue");
  }
}

async function renderDealerQueuePage() {
  try {
    cachedDealerQueue = await api.getDealerQueue();
  } catch (e) {
    console.warn("Failed to fetch live queue from backend:", e);
  }

  const qData = cachedDealerQueue || {
    station_name: "Warangal Central Grain Mandi",
    current_token: "PDC-1001",
    waiting_count: 11,
    estimated_wait_minutes: 110,
    queue: []
  };

  const queueList = qData.queue || [];
  let currentFarmer = null;
  if (selectedDealerQueueToken) {
    currentFarmer = queueList.find(f => f.token === selectedDealerQueueToken);
  }
  if (!currentFarmer) {
    currentFarmer = queueList.find(f => f.status === 'PROCESSING') || queueList.find(f => f.status === 'WAITING') || queueList[0];
    if (currentFarmer) {
      selectedDealerQueueToken = currentFarmer.token;
    }
  }

  const currentToken = currentFarmer ? currentFarmer.token : (qData.current_token || "PDC-1001");
  const waitingCount = qData.waiting_count ?? queueList.filter(f => f.status === 'WAITING').length;
  const estimatedTimeMinutes = qData.estimated_wait_minutes ?? (waitingCount * 10);
  const stationName = qData.station_name || "Warangal Central Grain Mandi";

  return `
    <div class="max-w-4xl mx-auto space-y-6 animate-fade-in">
      
      <!-- Top Navigation & Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button onclick="state.setActiveTab('home')" class="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline mb-1">
            <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
          </button>
          <h2 class="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            📋 Today's Procurement Queue
          </h2>
          <p class="text-xs text-slate-500">Click any farmer in the queue below to select and manage • Live Shared Backend State</p>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="handleResetDealerQueue()" class="px-3 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-slate-300 transition flex items-center gap-1">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Reset Queue Demo
          </button>
        </div>
      </div>

      <!-- Queue Overview Status Banner -->
      <div class="glass-card p-6 border-t-4 border-emerald-600 shadow-xl bg-gradient-to-br from-white via-slate-50 to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20">
        
        <div class="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <span class="text-lg">🏪</span>
          <div>
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Procurement Station</span>
            <span class="text-sm font-extrabold text-slate-800 dark:text-slate-100">${escapeHtml(stationName)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <!-- Currently Serving KPI -->
          <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3.5 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              🟢
            </div>
            <div>
              <span class="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide block">Currently Serving</span>
              <span class="text-xl font-black font-mono text-emerald-950 dark:text-emerald-100">${currentFarmer ? currentFarmer.token : 'PDC-1001'}</span>
            </div>
          </div>

          <!-- Farmers Waiting KPI -->
          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center gap-3.5 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xl shadow-md">
              👥
            </div>
            <div>
              <span class="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide block">Farmers Waiting</span>
              <span class="text-xl font-black text-amber-950 dark:text-amber-100">${waitingCount} farmers</span>
            </div>
          </div>

          <!-- Total Estimated Queue Time KPI -->
          <div class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center gap-3.5 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              ⏱️
            </div>
            <div>
              <span class="text-[11px] font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide block">Estimated Queue Time</span>
              <span class="text-xl font-black text-blue-950 dark:text-blue-100">${estimatedTimeMinutes} minutes</span>
            </div>
          </div>

        </div>

      </div>

      <!-- Currently Serving Active Farmer Action Box -->
      ${currentFarmer ? `
        <div class="glass-card p-6 border-2 border-emerald-500 shadow-xl relative overflow-hidden bg-white dark:bg-slate-900">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                  ACTIVE AT WEIGHBRIDGE
                </span>
              </div>
              <h3 class="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                ${escapeHtml(currentFarmer.farmer)} 
                <span class="text-base font-mono text-emerald-600 font-bold">(${escapeHtml(currentFarmer.token)})</span>
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
                Crop: <strong class="text-emerald-700 dark:text-emerald-400">${escapeHtml(currentFarmer.crop)}</strong> • Declared Quantity: <strong class="text-slate-900 dark:text-white">${currentFarmer.qty} Quintals</strong>
              </p>
            </div>

            <div class="text-right sm:text-right">
              <span class="text-xs text-slate-400 block font-medium">Status</span>
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black ${currentFarmer.status === 'PROCESSING' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : currentFarmer.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}">
                ${currentFarmer.status === 'PROCESSING' ? '🟢 Processing' : currentFarmer.status === 'COMPLETED' ? '🔵 Completed' : '🟡 Waiting'}
              </span>
            </div>
          </div>

          <!-- Action Workflow: [Start Procurement] → [Complete Procurement] → Next Farmer -->
          <div class="flex flex-wrap items-center gap-3">
            <button onclick="handleStartProcurement('${currentFarmer.token}')" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md ${currentFarmer.status === 'PROCESSING' ? 'ring-2 ring-emerald-400' : ''}">
              <i data-lucide="play" class="w-4 h-4"></i> Start Procurement
            </button>

            <button onclick="handleCompleteProcurement('${currentFarmer.token}')" class="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md">
              <i data-lucide="check-circle" class="w-4 h-4"></i> Complete Procurement
            </button>

            <button onclick="handleNextFarmer()" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md ml-auto">
              <span>Next Farmer</span>
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Full Queue List (Click any farmer to select) -->
      <div class="glass-card p-6 space-y-4 shadow-xl">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="list-ordered" class="w-5 h-5 text-emerald-600"></i>
              Full Mandi Queue Today
            </h3>
            <p class="text-[11px] text-slate-400">Click on any farmer row to select and manage their ticket</p>
          </div>
          <span class="text-xs font-bold text-slate-500 font-mono">${queueList.length} Total Tokens</span>
        </div>

        <div class="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
          ${queueList.map((f, idx) => {
            const isSelected = f.token === currentToken;
            let statusBadge = '🟡 Waiting';
            let badgeClass = 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800';
            
            if (f.status === 'PROCESSING') {
              statusBadge = '🟢 Processing';
              badgeClass = 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 animate-pulse';
            } else if (f.status === 'COMPLETED') {
              statusBadge = '🔵 Completed';
              badgeClass = 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800';
            }

            return `
              <div onclick="handleSelectDealerQueueToken('${f.token}')" 
                   class="cursor-pointer py-3.5 px-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-xl transition ${isSelected ? 'bg-emerald-50/90 dark:bg-emerald-950/60 font-bold border-2 border-emerald-500 shadow-md ring-2 ring-emerald-500/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-transparent'}">
                <div class="flex items-center gap-3">
                  <span class="w-7 h-7 rounded-lg ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'} flex items-center justify-center text-xs font-black">
                    ${idx + 1}
                  </span>
                  <div class="font-sans">
                    <span class="font-mono font-black text-sm text-slate-900 dark:text-white">${escapeHtml(f.token)}</span>
                    ${isSelected ? `<span class="ml-1.5 px-2 py-0.5 rounded text-[10px] bg-emerald-600 text-white font-black">ACTIVE</span>` : ''}
                    <span class="text-slate-400 mx-1.5">—</span>
                    <span class="font-bold text-slate-800 dark:text-slate-200">${escapeHtml(f.crop)}</span>
                    <span class="text-slate-400 mx-1.5">—</span>
                    <span class="font-semibold text-emerald-700 dark:text-emerald-400">${f.qty} Q</span>
                    <span class="text-slate-400 text-xs ml-2">(${escapeHtml(f.farmer)})</span>
                  </div>
                </div>

                <div class="flex items-center gap-2 self-end sm:self-auto">
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass}">
                    ${statusBadge}
                  </span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

    </div>
  `;
}

