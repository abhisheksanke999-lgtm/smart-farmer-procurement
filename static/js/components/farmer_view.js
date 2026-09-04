let cachedCentres = [];
let cachedSlots = [];
let selectedCentreId = null;
let selectedSlotId = null;
let liveQueueData = null;

async function renderFarmerView() {
  const user = state.currentUser;
  const activeTab = state.activeTab;

  // Render mandatory email verification banner
  const emailBanner = !user.is_email_verified ? `
    <div class="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-pulse">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
          !
        </div>
        <div>
          <h4 class="font-bold text-sm text-amber-900 dark:text-amber-200">
            ${i18n.t('status_email_unverified')}
          </h4>
          <p class="text-xs text-amber-700 dark:text-amber-300">
            Please verify your email address to book procurement slots and receive SMS notifications.
          </p>
        </div>
      </div>
      <button onclick="handleTriggerEmailVerify()" class="btn-agri gold-gradient text-xs px-4 py-2 flex-shrink-0">
        <i data-lucide="mail-check" class="w-4 h-4"></i> Verify Email Now
      </button>
    </div>
  ` : `
    <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl mb-6 flex items-center justify-between">
      <div class="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
        <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>
        ${i18n.t('status_email_verified')} (${user.email})
      </div>
      <span class="text-[10px] bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 font-extrabold px-2.5 py-0.5 rounded-full uppercase">Active Farmer</span>
    </div>
  `;

  if (activeTab === 'book_slot') {
    return emailBanner + (await renderSlotBookingWizard());
  } else if (activeTab === 'live_queue') {
    return emailBanner + (await renderLiveQueuePage());
  } else if (activeTab === 'receipts') {
    return emailBanner + (await renderFarmerReceiptsPage());
  } else if (activeTab === 'payments') {
    return emailBanner + (await renderFarmerPaymentsPage());
  }

  // Default Home Dashboard View
  return `
    ${emailBanner}

    <div class="space-y-6">
      
      <!-- Welcome Header Card -->
      <div class="agri-gradient text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
        <div class="absolute right-0 bottom-0 opacity-10 font-black text-9xl pointer-events-none select-none">🌾</div>
        <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider mb-2 inline-block">
          Telangana State Paddy & Produce Procurement Portal
        </span>
        <h2 class="text-2xl sm:text-3xl font-extrabold mb-1">
          ${i18n.t('welcome_farmer')}, ${user.name}!
        </h2>
        <p class="text-xs sm:text-sm text-emerald-100 max-w-xl">
          Zero Waiting Time • Guaranteed Minimum Support Price (MSP) • Direct Bank Transfer (DBT)
        </p>
      </div>

      <!-- Quick Action Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <button onclick="state.setActiveTab('book_slot')" class="glass-card p-4 text-left hover:scale-[1.02] transition shadow-md border-l-4 border-emerald-500">
          <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold mb-2">
            <i data-lucide="calendar-plus" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">${i18n.t('nav_book_slot')}</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Select centre & date</p>
        </button>

        <button onclick="state.setActiveTab('live_queue')" class="glass-card p-4 text-left hover:scale-[1.02] transition shadow-md border-l-4 border-amber-500">
          <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center font-bold mb-2">
            <i data-lucide="clock" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">${i18n.t('nav_queue')}</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Live token tracking</p>
        </button>

        <button onclick="state.setActiveTab('receipts')" class="glass-card p-4 text-left hover:scale-[1.02] transition shadow-md border-l-4 border-blue-500">
          <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold mb-2">
            <i data-lucide="receipt" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">${i18n.t('nav_receipts')}</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Weighment slips</p>
        </button>

        <button onclick="state.setActiveTab('payments')" class="glass-card p-4 text-left hover:scale-[1.02] transition shadow-md border-l-4 border-purple-500">
          <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 flex items-center justify-center font-bold mb-2">
            <i data-lucide="credit-card" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">${i18n.t('nav_payments')}</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">DBT Bank Payouts</p>
        </button>
      </div>

      <!-- Active Booking & QR Code Card -->
      ${await renderFarmerActiveBookingCard()}

    </div>
  `;
}

async function handleTriggerEmailVerify() {
  try {
    const user = state.currentUser;
    const res = await api.verifyEmail(user.email);
    user.is_email_verified = true;
    state.setCurrentUser({ ...user, is_email_verified: true });
    if (typeof confetti === "function") {
      try { confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } }); } catch (ce) {}
    }
    const notifs = await api.getNotifications();
    state.setNotifications(notifs);
  } catch (err) {
    alert(err.message);
  }
}

async function renderFarmerActiveBookingCard() {
  try {
    const bookings = await api.getFarmerBookings();
    if (bookings.length === 0) {
      return `
        <div class="glass-card p-6 text-center py-8">
          <i data-lucide="calendar-x2" class="w-12 h-12 text-slate-400 mx-auto mb-2 opacity-50"></i>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-200">No Active Slot Booking</h4>
          <p class="text-xs text-slate-500 mb-4">Book your procurement slot ahead of time to avoid queue congestion.</p>
          <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-xs">
            <i data-lucide="plus" class="w-4 h-4"></i> Book Slot Now
          </button>
        </div>
      `;
    }

    const active = bookings[0];
    return `
      <div class="glass-card p-5 border-2 border-emerald-500/50 relative overflow-hidden">
        <div class="flex items-center justify-between mb-3">
          <span class="badge-status badge-approved flex items-center gap-1">
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> ${active.status}
          </span>
          <span class="text-xs font-mono font-bold text-slate-400">Created: ${active.created_at}</span>
        </div>

        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <span class="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Digital Token Code</span>
            <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono">${active.token_number}</h3>
            <p class="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1">
              ${active.crop_type} • ${active.expected_quantity_quintals} Quintals
            </p>
            <p class="text-xs text-slate-500 mt-0.5">
              ${active.centre_name} | ${active.slot_date} (${active.slot_time})
            </p>
          </div>

          <button onclick="state.setBookingForQR(${JSON.stringify(active).replace(/"/g, '&quot;')})" class="btn-agri text-xs py-3 px-5 w-full sm:w-auto flex-shrink-0 shadow-lg">
            <i data-lucide="qr-code" class="w-4 h-4"></i> Show Scannable QR Pass
          </button>
        </div>
      </div>
    `;
  } catch (e) {
    return '';
  }
}

async function renderSlotBookingWizard() {
  try {
    cachedCentres = await api.getCentres();
  } catch (e) {}

  return `
    <div class="max-w-2xl mx-auto space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-emerald-600">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="calendar-check" class="w-6 h-6 text-emerald-600"></i>
          ${i18n.t('book_slot_title')}
        </h2>
        <p class="text-xs text-slate-500">Guaranteed non-overbooking slot system with instant digital token generation.</p>
      </div>

      <form id="slot-booking-form" onsubmit="handleConfirmSlotBooking(event)" class="glass-card p-6 space-y-5">
        
        <!-- 1. Select Procurement Centre -->
        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            1. ${i18n.t('select_centre')} *
          </label>
          <select id="booking-centre-select" onchange="handleCentreSelectionChange(this.value)" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="">-- Choose Procurement Centre --</option>
            ${cachedCentres.map(c => `
              <option value="${c.id}">${c.name} (${c.location}) - Capacity: ${c.daily_capacity}/day</option>
            `).join('')}
          </select>
        </div>

        <!-- 2. Select Slot -->
        <div id="slots-container" class="hidden space-y-2">
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
            2. ${i18n.t('select_slot')} *
          </label>
          <div id="slots-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2"></div>
        </div>

        <!-- 3. Crop & Quantity Details -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              3. ${i18n.t('select_crop')} *
            </label>
            <select id="booking-crop-select" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="Paddy (ధాన్యం)">Paddy (ధాన్యం - Fine / Grade A)</option>
              <option value="Cotton (పత్తి)">Cotton (పత్తి)</option>
              <option value="Maize (మొక్కజొన్న)">Maize (మొక్కజొన్న)</option>
              <option value="Chilli (మిరప)">Red Chilli (మిరప)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              4. ${i18n.t('enter_quantity')} *
            </label>
            <input type="number" id="booking-quantity-input" min="1" max="500" step="0.5" value="40" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          </div>
        </div>

        <!-- Submit Button -->
        <button type="submit" class="btn-agri w-full py-3 text-sm font-bold shadow-xl">
          <i data-lucide="check" class="w-5 h-5"></i> ${i18n.t('confirm_booking')}
        </button>

      </form>

    </div>
  `;
}

async function handleCentreSelectionChange(centreId) {
  selectedCentreId = centreId;
  const container = document.getElementById("slots-container");
  const grid = document.getElementById("slots-grid");
  if (!centreId) {
    container.classList.add("hidden");
    return;
  }

  try {
    cachedSlots = await api.getSlots(centreId);
    grid.innerHTML = cachedSlots.map(s => {
      const isFull = s.is_full;
      return `
        <label class="cursor-pointer p-3 rounded-xl border-2 transition ${isFull ? 'opacity-50 border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 pointer-events-none' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500 bg-white dark:bg-slate-800'} flex items-center justify-between">
          <div class="flex items-center gap-2">
            <input type="radio" name="slot_id_radio" value="${s.id}" ${isFull ? 'disabled' : ''} onclick="selectedSlotId = ${s.id}" class="text-emerald-600 focus:ring-emerald-500">
            <div>
              <span class="font-bold text-xs text-slate-900 dark:text-white block">${s.date}</span>
              <span class="text-[11px] text-slate-500">${s.start_time} - ${s.end_time}</span>
            </div>
          </div>
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded ${isFull ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}">
            ${isFull ? i18n.t('capacity_full') : `${s.available_capacity} Slots Left`}
          </span>
        </label>
      `;
    }).join('');
    container.classList.remove("hidden");
  } catch (e) {
    alert(e.message);
  }
}

async function handleConfirmSlotBooking(e) {
  e.preventDefault();
  const centreId = document.getElementById("booking-centre-select")?.value;
  const cropType = document.getElementById("booking-crop-select")?.value;
  const qty = document.getElementById("booking-quantity-input")?.value;

  if (!centreId || !selectedSlotId) {
    alert("Please select a valid procurement centre and time slot.");
    return;
  }

  try {
    const res = await api.bookSlot(centreId, selectedSlotId, cropType, qty);
    if (window.confetti) {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }
    state.setActiveTab('home');
    const notifs = await api.getNotifications();
    state.setNotifications(notifs);
  } catch (err) {
    alert(err.message);
  }
}

async function renderLiveQueuePage() {
  try {
    liveQueueData = await api.getLiveQueue();
  } catch (e) {}

  if (!liveQueueData || !liveQueueData.has_active_booking) {
    return `
      <div class="glass-card p-8 text-center max-w-lg mx-auto py-12">
        <i data-lucide="clock-4" class="w-16 h-16 text-slate-300 mx-auto mb-3"></i>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white">No Active Queue Ticket</h3>
        <p class="text-xs text-slate-500 mb-5">Book a slot to get your real-time token and live queue position.</p>
        <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-xs">
          ${i18n.t('nav_book_slot')}
        </button>
      </div>
    `;
  }

  const q = liveQueueData;
  return `
    <div class="max-w-2xl mx-auto space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-amber-500 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="clock" class="w-6 h-6 text-amber-500"></i>
            ${i18n.t('live_queue_title')}
          </h2>
          <p class="text-xs text-slate-500">${q.centre_name}</p>
        </div>
        <button onclick="renderApp()" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold flex items-center gap-1">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Live
        </button>
      </div>

      <!-- Main Live Queue Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        <!-- Farmer's Token Card -->
        <div class="agri-gradient text-white p-6 rounded-2xl shadow-xl text-center relative overflow-hidden">
          <span class="text-xs font-extrabold uppercase tracking-widest text-emerald-200 block mb-1">
            ${i18n.t('your_token')}
          </span>
          <h3 class="text-4xl font-black font-mono tracking-tight">${q.token_number}</h3>
          <p class="text-xs text-emerald-100 mt-2 font-medium">${q.crop_type} (${q.expected_quantity} Q)</p>
        </div>

        <!-- Current Serving Token Card -->
        <div class="gold-gradient text-white p-6 rounded-2xl shadow-xl text-center relative overflow-hidden">
          <span class="text-xs font-extrabold uppercase tracking-widest text-amber-100 block mb-1">
            ${i18n.t('current_token_serving')}
          </span>
          <h3 class="text-4xl font-black font-mono tracking-tight pulse-badge inline-block px-4 py-1 bg-white/20 rounded-xl">
            ${q.current_token}
          </h3>
          <p class="text-xs text-amber-100 mt-2 font-medium">Weighbridge Station #1 Active</p>
        </div>

      </div>

      <!-- Queue Progress Metrics -->
      <div class="glass-card p-6 space-y-4">
        
        <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center font-black">
              ${q.farmers_ahead}
            </div>
            <div>
              <span class="font-bold text-sm text-slate-900 dark:text-white block">${i18n.t('farmers_ahead')}</span>
              <span class="text-xs text-slate-500">Position in sequence</span>
            </div>
          </div>
          
          <div class="text-right">
            <span class="text-xl font-extrabold text-amber-600 font-mono block">~${q.estimated_wait_minutes} ${i18n.t('minutes')}</span>
            <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">${i18n.t('est_wait_time')}</span>
          </div>
        </div>

        ${q.farmers_ahead <= 3 ? `
          <div class="p-4 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs font-bold flex items-center gap-3 animate-pulse">
            <i data-lucide="bell" class="w-5 h-5 text-emerald-600 flex-shrink-0"></i>
            <span>${i18n.t('turn_approaching')}</span>
          </div>
        ` : ''}

      </div>

    </div>
  `;
}

async function renderFarmerReceiptsPage() {
  let receipts = [];
  try {
    receipts = await api.getFarmerReceipts();
  } catch (e) {}

  return `
    <div class="max-w-3xl mx-auto space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-blue-600">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="receipt" class="w-6 h-6 text-blue-600"></i>
          Digital Procurement Receipts
        </h2>
        <p class="text-xs text-slate-500">Itemized weighment receipts and rate breakdowns.</p>
      </div>

      <div class="space-y-3">
        ${receipts.length === 0 ? `
          <div class="glass-card p-8 text-center text-slate-400">No completed procurement receipts yet.</div>
        ` : receipts.map(r => `
          <div class="glass-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:shadow-lg transition">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="font-extrabold text-sm text-slate-900 dark:text-white font-mono">${r.weighment_slip_no}</span>
                <span class="badge-status badge-approved">${r.quality_grade}</span>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                ${r.crop_type} • ${r.actual_quantity} Quintals @ ₹${r.rate_per_quintal}/Q
              </p>
              <p class="text-[11px] text-slate-400">${r.centre_name} | ${r.transaction_time}</p>
            </div>

            <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-800">
              <div class="text-right">
                <span class="text-base font-black text-emerald-600 font-mono block">₹${r.total_amount.toLocaleString('en-IN')}</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase">${r.payment_status}</span>
              </div>
              <button onclick="state.setReceiptData(${JSON.stringify(r).replace(/"/g, '&quot;')})" class="btn-agri text-xs px-3 py-2">
                View Receipt
              </button>
            </div>
          </div>
        `).join('')}
      </div>

    </div>
  `;
}

async function renderFarmerPaymentsPage() {
  let payments = [];
  try {
    payments = await api.getFarmerPayments();
  } catch (e) {}

  return `
    <div class="max-w-3xl mx-auto space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-purple-600">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="credit-card" class="w-6 h-6 text-purple-600"></i>
          Direct Bank Transfer (DBT) Payouts
        </h2>
        <p class="text-xs text-slate-500">Track payment status and bank transaction reference numbers.</p>
      </div>

      <div class="space-y-3">
        ${payments.length === 0 ? `
          <div class="glass-card p-8 text-center text-slate-400">No payment records found.</div>
        ` : payments.map(p => `
          <div class="glass-card p-4 flex items-center justify-between hover:shadow-lg transition">
            <div>
              <span class="badge-status ${p.status === 'PAYMENT_COMPLETED' ? 'badge-approved' : 'badge-pending'} mb-1 inline-block">
                ${p.status}
              </span>
              <h4 class="font-bold text-sm text-slate-900 dark:text-white">DBT Bank Transfer</h4>
              <p class="text-xs text-slate-500 font-mono mt-0.5">
                ${p.bank_utr ? `UTR: ${p.bank_utr}` : 'Processing Bank Queue...'}
              </p>
              <p class="text-[10px] text-slate-400">${p.created_at}</p>
            </div>

            <div class="text-right">
              <span class="text-lg font-black text-slate-900 dark:text-white font-mono block">₹${p.amount.toLocaleString('en-IN')}</span>
              <span class="text-[10px] text-emerald-600 font-bold">Direct Account Credit</span>
            </div>
          </div>
        `).join('')}
      </div>

    </div>
  `;
}
