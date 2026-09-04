let adminStatsCache = null;

async function renderAdminView() {
  const activeTab = state.activeTab;

  try {
    adminStatsCache = await api.getAdminStats();
  } catch (e) {}

  if (activeTab === 'approvals') {
    return await renderAdminDealerApprovals();
  } else if (activeTab === 'centres') {
    return await renderAdminCentresPage();
  } else if (activeTab === 'admin_payments') {
    return await renderAdminPaymentsPage();
  } else if (activeTab === 'complaints') {
    return await renderAdminComplaintsPage();
  }

  // Default Admin Executive Dashboard
  const s = adminStatsCache || {};

  return `
    <div class="space-y-6">
      
      <!-- Executive Header -->
      <div class="agri-gradient text-white p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider mb-2 inline-block">
            SIH Problem Statement 26032 • Control Centre
          </span>
          <h2 class="text-2xl font-extrabold">${i18n.t('admin_dashboard_title')}</h2>
          <p class="text-xs text-emerald-100 mt-0.5">Logged in as: <strong class="text-white">abhisheksanke999@gmail.com</strong></p>
        </div>
        
        <div class="flex items-center gap-2">
          <button onclick="renderApp()" class="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold border border-white/30 transition">
            Refresh Data
          </button>
        </div>
      </div>

      <!-- Key Performance Metrics Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        
        <div class="glass-card p-4 border-l-4 border-emerald-500">
          <span class="text-xs font-bold text-slate-400 uppercase">${i18n.t('total_farmers')}</span>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${s.total_farmers || 0}</h3>
          <p class="text-[10px] text-emerald-600 font-semibold mt-0.5">Verified Profiles</p>
        </div>

        <div class="glass-card p-4 border-l-4 border-amber-500 cursor-pointer" onclick="state.setActiveTab('approvals')">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-400 uppercase">${i18n.t('pending_approvals')}</span>
            ${(s.pending_dealers || 0) > 0 ? `<span class="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-full animate-bounce">${s.pending_dealers} New</span>` : ''}
          </div>
          <h3 class="text-2xl font-black text-amber-600 font-mono mt-1">${s.pending_dealers || 0}</h3>
          <p class="text-[10px] text-slate-500 font-semibold mt-0.5">Total Dealers: ${s.total_dealers || 0}</p>
        </div>

        <div class="glass-card p-4 border-l-4 border-blue-500">
          <span class="text-xs font-bold text-slate-400 uppercase">${i18n.t('total_tonnage')}</span>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${(s.total_procurement_quantity_quintals || 0).toLocaleString('en-IN')} Q</h3>
          <p class="text-[10px] text-blue-600 font-semibold mt-0.5">Value: ₹${((s.total_procurement_value || 0) / 100000).toFixed(2)} Lakhs</p>
        </div>

        <div class="glass-card p-4 border-l-4 border-purple-500 cursor-pointer" onclick="state.setActiveTab('admin_payments')">
          <span class="text-xs font-bold text-slate-400 uppercase">Pending DBT Payouts</span>
          <h3 class="text-2xl font-black text-purple-600 font-mono mt-1">${s.pending_payments_count || 0}</h3>
          <p class="text-[10px] text-slate-500 font-semibold mt-0.5">Value: ₹${((s.pending_payments_value || 0) / 100000).toFixed(2)} Lakhs</p>
        </div>

      </div>

      <!-- Action Shortcut Banner -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onclick="state.setActiveTab('approvals')" class="glass-card p-5 text-left hover:scale-[1.01] transition border-l-4 border-amber-500 flex items-center justify-between">
          <div>
            <h4 class="font-extrabold text-sm text-slate-900 dark:text-white">Review Dealer Registrations</h4>
            <p class="text-xs text-slate-500">Verify GSTIN & Licenses before approving</p>
          </div>
          <i data-lucide="user-check" class="w-6 h-6 text-amber-500"></i>
        </button>

        <button onclick="state.setActiveTab('centres')" class="glass-card p-5 text-left hover:scale-[1.01] transition border-l-4 border-emerald-500 flex items-center justify-between">
          <div>
            <h4 class="font-extrabold text-sm text-slate-900 dark:text-white">Manage Procurement Centres</h4>
            <p class="text-xs text-slate-500">Configure daily slot capacity & hours</p>
          </div>
          <i data-lucide="warehouse" class="w-6 h-6 text-emerald-500"></i>
        </button>

        <button onclick="state.setActiveTab('admin_payments')" class="glass-card p-5 text-left hover:scale-[1.01] transition border-l-4 border-purple-500 flex items-center justify-between">
          <div>
            <h4 class="font-extrabold text-sm text-slate-900 dark:text-white">Process DBT Direct Payouts</h4>
            <p class="text-xs text-slate-500">1-Click government bank disbursement</p>
          </div>
          <i data-lucide="banknote" class="w-6 h-6 text-purple-500"></i>
        </button>
      </div>

      <!-- System Audit Trail -->
      ${await renderAdminAuditLogSection()}

    </div>
  `;
}

async function renderAdminDealerApprovals() {
  let dealers = [];
  try {
    dealers = await api.getDealers();
  } catch (e) {}

  return `
    <div class="space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-amber-500 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Dealer Registration & Verification Approvals</h2>
          <p class="text-xs text-slate-500">Mandatory Admin Approval: Unapproved dealers cannot perform procurement transactions.</p>
        </div>
        <span class="badge-status badge-pending">Strict Security Enforced</span>
      </div>

      <div class="space-y-4">
        ${dealers.length === 0 ? `
          <div class="glass-card p-8 text-center text-slate-400">No registered dealers found.</div>
        ` : dealers.map(d => `
          <div class="glass-card p-5 space-y-3 hover:shadow-xl transition">
            
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span class="badge-status ${d.status === 'APPROVED' ? 'badge-approved' : (d.status === 'PENDING' ? 'badge-pending' : 'badge-rejected')} mb-1 inline-block">
                  STATUS: ${d.status}
                </span>
                <h3 class="text-lg font-extrabold text-slate-900 dark:text-white">${d.business_name}</h3>
                <p class="text-xs text-slate-500">Applicant: ${d.full_name} (${d.email} • ${d.mobile_number})</p>
              </div>

              <!-- Action Buttons -->
              <div class="flex items-center gap-2 w-full sm:w-auto">
                ${d.status !== 'APPROVED' ? `
                  <button onclick="handleUpdateDealer('${d.dealer_id}', 'APPROVED')" class="btn-agri text-xs py-2 px-4 flex-1 sm:flex-none">
                    Approve Dealer ✓
                  </button>
                ` : ''}

                ${d.status !== 'REJECTED' ? `
                  <button onclick="promptRejectDealer('${d.dealer_id}')" class="bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-300 font-bold text-xs py-2 px-3 rounded-xl transition flex-1 sm:flex-none">
                    Reject
                  </button>
                ` : ''}

                ${d.status === 'APPROVED' ? `
                  <button onclick="handleUpdateDealer('${d.dealer_id}', 'SUSPENDED', 'Administrative Policy Action')" class="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs py-2 px-3 rounded-xl transition">
                    Suspend
                  </button>
                ` : ''}
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl">
              <div>
                <span class="text-slate-400 block font-medium">Govt ID Type & Number</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">${d.government_id_type}: ${d.government_id_number}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-medium">Trade License No</span>
                <span class="font-bold font-mono text-emerald-600">${d.license_number}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-medium">Assigned Centre</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">${d.assigned_centre_name}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-medium">Documents</span>
                <span class="font-bold text-blue-600 cursor-pointer underline">View PDF Documents</span>
              </div>
            </div>

            ${d.rejection_reason ? `
              <p class="text-xs text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-950/40 p-2 rounded-lg">
                Rejection/Suspension Reason: ${d.rejection_reason}
              </p>
            ` : ''}

          </div>
        `).join('')}
      </div>

    </div>
  `;
}

async function handleUpdateDealer(dealerId, status, reason = null) {
  try {
    await api.updateDealerStatus(dealerId, status, reason);
    alert(`Dealer status updated to ${status} successfully.`);
    renderApp();
  } catch (err) {
    alert(err.message);
  }
}

function promptRejectDealer(dealerId) {
  const reason = prompt("Enter reason for rejection:");
  if (reason) {
    handleUpdateDealer(dealerId, 'REJECTED', reason);
  }
}

async function renderAdminCentresPage() {
  let centres = [];
  try {
    centres = await api.getCentres();
  } catch (e) {}

  return `
    <div class="space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-emerald-600 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Procurement Centres & Slot Management</h2>
          <p class="text-xs text-slate-500">Configure center working hours, daily capacity limits, and slots.</p>
        </div>
        <button onclick="toggleNewCentreForm()" class="btn-agri text-xs px-4">
          + Add New Centre
        </button>
      </div>

      <!-- Add New Centre Form -->
      <div id="new-centre-form" class="hidden glass-card p-6 space-y-4">
        <h3 class="font-bold text-sm text-slate-900 dark:text-white">Add New Government Procurement Centre</h3>
        <form onsubmit="handleCreateCentre(event)" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <input type="text" id="c-name" placeholder="Centre Name (e.g. Warangal Central Mandi)" required class="px-3 py-2 rounded-xl border dark:bg-slate-800">
          <input type="text" id="c-code" placeholder="Centre Code (e.g. WGL-05)" required class="px-3 py-2 rounded-xl border dark:bg-slate-800 font-mono uppercase">
          <input type="text" id="c-location" placeholder="Location / Address" required class="px-3 py-2 rounded-xl border dark:bg-slate-800">
          <input type="text" id="c-district" placeholder="District (e.g. Warangal)" required class="px-3 py-2 rounded-xl border dark:bg-slate-800">
          <input type="text" id="c-pincode" placeholder="Pincode" required class="px-3 py-2 rounded-xl border dark:bg-slate-800">
          <input type="text" id="c-phone" placeholder="Contact Phone" required class="px-3 py-2 rounded-xl border dark:bg-slate-800">
          <input type="number" id="c-capacity" placeholder="Daily Farmer Capacity" value="100" required class="px-3 py-2 rounded-xl border dark:bg-slate-800">
          <input type="text" id="c-hours" placeholder="Operating Hours (e.g. 08:00 AM - 05:00 PM)" value="08:00 AM - 05:00 PM" required class="px-3 py-2 rounded-xl border dark:bg-slate-800">
          <div class="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onclick="toggleNewCentreForm()" class="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-xl font-bold">Cancel</button>
            <button type="submit" class="btn-agri px-6">Save Centre</button>
          </div>
        </form>
      </div>

      <!-- Centre List -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${centres.map(c => `
          <div class="glass-card p-5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold text-xs rounded">${c.code}</span>
              <span class="badge-status badge-approved">ACTIVE</span>
            </div>
            <h3 class="font-extrabold text-base text-slate-900 dark:text-white">${c.name}</h3>
            <p class="text-xs text-slate-500">${c.location}, ${c.district} - ${c.pincode}</p>
            <div class="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-xs space-y-1">
              <div class="flex justify-between">
                <span class="text-slate-400">Daily Capacity:</span>
                <span class="font-bold text-slate-900 dark:text-white">${c.daily_capacity} Farmers/Day</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Hours:</span>
                <span class="font-bold text-slate-900 dark:text-white">${c.operating_hours}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

    </div>
  `;
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
    daily_capacity: parseInt(document.getElementById("c-capacity").value),
    operating_hours: document.getElementById("c-hours").value
  };

  try {
    await api.createCentre(data);
    alert("Procurement centre created successfully ✓");
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
              <p class="text-xs text-slate-600 dark:text-slate-300">
                Bank Acc: <strong class="font-mono text-slate-900 dark:text-white">${p.bank_account_no || '38491029481'}</strong> | IFSC: <strong class="font-mono text-slate-900 dark:text-white">${p.ifsc_code || 'SBIN0001234'}</strong>
              </p>
              <p class="text-[11px] text-slate-400">${p.crop_type} (${p.quantity} Q) | Created: ${p.created_at}</p>
            </div>

            <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-800">
              <div class="text-right">
                <span class="text-lg font-black text-slate-900 dark:text-white font-mono block">₹${p.amount.toLocaleString('en-IN')}</span>
                ${p.bank_utr ? `<span class="text-[10px] font-mono text-emerald-600 block">UTR: ${p.bank_utr}</span>` : ''}
              </div>

              ${p.status !== 'PAYMENT_COMPLETED' ? `
                <button onclick="handleTriggerPayment('${p.payment_id}')" class="btn-agri text-xs py-2 px-4">
                  Trigger DBT Payout
                </button>
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
    logs = await api.getAuditLogs();
  } catch (e) {}

  return `
    <div class="glass-card p-5 space-y-3">
      <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
        <i data-lucide="shield" class="w-4 h-4 text-emerald-600"></i>
        System Audit Logs & Security Trail
      </h3>

      <div class="divide-y divide-slate-200 dark:divide-slate-800 text-xs max-h-60 overflow-y-auto">
        ${logs.map(l => `
          <div class="py-2.5 flex items-start justify-between gap-4">
            <div>
              <span class="font-bold text-slate-800 dark:text-slate-200 font-mono">${l.action}</span>
              <p class="text-slate-500 text-[11px]">${l.details}</p>
            </div>
            <span class="text-[10px] font-mono text-slate-400 flex-shrink-0">${l.created_at}</span>
          </div>
        `).join('')}
      </div>
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
