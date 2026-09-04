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

          <div class="mt-6 flex justify-center">
            <button onclick="handleRefreshDealerStatus()" class="btn-agri text-xs py-2.5 px-5 shadow-lg">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Check Approval Status
            </button>
          </div>

          <div class="mt-4 text-[11px] text-slate-400">
            For approval inquiries, please contact the Admin Head at <strong class="text-emerald-600">admin@smartfarmer.gov.in</strong>
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
  }

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

        <button onclick="state.setActiveTab('scan_qr')" class="btn-agri bg-white text-emerald-800 hover:bg-amber-50 text-sm py-3 px-6 shadow-xl font-extrabold flex-shrink-0">
          <i data-lucide="qr-code" class="w-5 h-5"></i> ${i18n.t('scan_farmer_qr')}
        </button>
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

      <!-- Dealer Transactions Table -->
      ${await renderDealerTransactionsPage()}

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

  return `
    <div class="space-y-4">
      <div class="glass-card p-5 border-l-4 border-emerald-600 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Procurement History & Slips</h2>
          <p class="text-xs text-slate-500">Log of all completed weighing transactions</p>
        </div>
        <span class="text-xs font-bold font-mono text-emerald-600">Total: ${txns.length} Transactions</span>
      </div>

      <div class="space-y-3">
        ${txns.length === 0 ? `
          <div class="glass-card p-8 text-center text-slate-400">No completed procurement transactions recorded yet.</div>
        ` : txns.map(t => `
          <div class="glass-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="font-extrabold text-sm text-slate-900 dark:text-white font-mono">${t.weighment_slip_no}</span>
                <span class="badge-status badge-approved">${t.quality_grade}</span>
              </div>
              <p class="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                Farmer: ${t.farmer_name} • ${t.crop_type} (${t.actual_quantity} Q @ ₹${t.rate_per_quintal}/Q)
              </p>
              <p class="text-[11px] text-slate-400">${t.transaction_time} | Booking: ${t.booking_code}</p>
            </div>

            <div class="text-right">
              <span class="text-base font-black text-emerald-600 font-mono block">₹${t.total_amount.toLocaleString('en-IN')}</span>
              <span class="text-[10px] font-bold text-slate-400 uppercase">${t.payment_status}</span>
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

