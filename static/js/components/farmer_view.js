let selectedCrop = "Rice";
let selectedCentreId = null;
let selectedDealerId = null;
let selectedSlotId = null;
let cachedCentres = [];
let cachedDealers = [];
let cachedSlots = [];
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
      <div class="flex items-center gap-2 flex-shrink-0">
        <button onclick="handleTriggerEmailVerify()" class="btn-agri gold-gradient text-xs px-4 py-2 flex-shrink-0">
          <i data-lucide="mail-check" class="w-4 h-4"></i> Verify Email Now
        </button>
        <button onclick="logoutUser()" title="Logout" class="px-2.5 py-2 bg-slate-200 hover:bg-red-100 hover:text-red-700 dark:bg-slate-800 dark:hover:bg-red-950 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1">
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Logout
        </button>
      </div>
    </div>
  ` : `
    <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl mb-6 flex items-center justify-between">
      <div class="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
        <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>
        ${i18n.t('status_email_verified')} (${user.email})
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 font-extrabold px-2.5 py-0.5 rounded-full uppercase">Active Farmer</span>
        <button onclick="logoutUser()" title="Logout" class="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-300 rounded-lg text-xs font-bold transition flex items-center gap-1">
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Logout
        </button>
      </div>
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
      <div class="agri-gradient text-white p-6 rounded-2xl shadow-xl relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="z-10">
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
        <div class="z-10 flex-shrink-0">
          <button onclick="logoutUser()" class="px-3.5 py-2 bg-red-600/80 hover:bg-red-600 border border-red-400/40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
            <i data-lucide="log-out" class="w-4 h-4"></i> Logout
          </button>
        </div>
        <div class="absolute right-0 bottom-0 opacity-10 font-black text-9xl pointer-events-none select-none">🌾</div>
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
    const activeAssignment = await api.getFarmerActiveAssignment();
    if (activeAssignment && activeAssignment.has_active_assignment) {
      const active = activeAssignment;
      return `
        <div class="glass-card p-5 border-2 border-emerald-500/80 relative overflow-hidden shadow-lg">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-2">
              <span class="badge-status badge-approved flex items-center gap-1 font-bold text-xs py-1 px-2.5">
                <i data-lucide="shield-check" class="w-4 h-4"></i> ACTIVE ASSIGNMENT
              </span>
              <span class="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
                🌾 ${escapeHtml(active.product_name)}
              </span>
            </div>
            <span class="text-xs font-mono font-bold text-slate-400">Assigned: ${active.created_at}</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Authorized Procurement Dealer</span>
              <h4 class="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                <i data-lucide="building-2" class="w-4 h-4 text-emerald-600"></i> ${escapeHtml(active.dealer_name)}
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 font-medium">${escapeHtml(active.dealer_business || 'Authorized Dealer')}</p>
              <p class="text-xs text-slate-500 mt-1">📞 ${escapeHtml(active.dealer_phone || 'N/A')}</p>
            </div>

            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Procurement Centre & Schedule</span>
              <h4 class="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                <i data-lucide="map-pin" class="w-4 h-4 text-emerald-600"></i> ${escapeHtml(active.centre_name)}
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 font-medium">${escapeHtml(active.slot_date || '')} (${escapeHtml(active.slot_time || '')})</p>
              <p class="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                Token: ${escapeHtml(active.token_number || '')} • Qty: ${active.expected_quantity_quintals} Quintals
              </p>
            </div>
          </div>

          <div class="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start sm:items-center gap-2.5 mb-4">
            <i data-lucide="lock" class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0"></i>
            <div>
              <strong class="font-bold">Strict QR Authorization Active:</strong> Only Dealer <strong>${escapeHtml(active.dealer_name)}</strong> at <strong>${escapeHtml(active.centre_name)}</strong> is authorized to scan and process your produce. All other dealers will be rejected by the server.
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <button onclick="showAssignmentQRPass(${JSON.stringify(active).replace(/"/g, '&quot;')})" class="btn-agri text-xs py-3 px-5 shadow-lg flex items-center gap-2">
              <i data-lucide="qr-code" class="w-4 h-4"></i> Show Scannable QR Pass
            </button>
            <button onclick="handleCancelAssignment(${active.assignment_id})" class="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
              <i data-lucide="x-circle" class="w-4 h-4"></i> Cancel Assignment
            </button>
          </div>
        </div>
      `;
    }

    const bookings = await api.getFarmerBookings();
    if (bookings.length === 0) {
      return `
        <div class="glass-card p-6 text-center py-8">
          <i data-lucide="calendar-x2" class="w-12 h-12 text-slate-400 mx-auto mb-2 opacity-50"></i>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-200">No Active Slot Booking</h4>
          <p class="text-xs text-slate-500 mb-4">Select a crop, procurement center, and assigned dealer to generate your QR pass.</p>
          <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-xs">
            <i data-lucide="plus" class="w-4 h-4"></i> Book Procurement Slot Now
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
            ${active.dealer_name ? `
              <p class="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                Assigned Dealer: ${active.dealer_name}
              </p>
            ` : ''}
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
  if (!selectedCrop) selectedCrop = "Rice";
  try {
    cachedCentres = await api.getCentres(selectedCrop);
  } catch (e) {
    cachedCentres = [];
  }

  const selectedCentre = cachedCentres.find(c => c.id === Number(selectedCentreId));
  const selectedDealer = cachedDealers.find(d => d.dealer_id === Number(selectedDealerId));

  return `
    <div class="max-w-2xl mx-auto space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-emerald-600">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="calendar-check" class="w-6 h-6 text-emerald-600"></i>
          Procurement Booking & Dealer Assignment
        </h2>
        <p class="text-xs text-slate-500 mt-1">
          Strict 4-Step Assignment: Crop Selection ➔ Verified Centre ➔ Authorized Dealer ➔ QR Pass
        </p>
      </div>

      <form id="slot-booking-form" onsubmit="handleConfirmFarmerAssignment(event)" class="glass-card p-6 space-y-6">
        
        <!-- STEP 1: Crop / Product Selection -->
        <div>
          <label class="block text-xs font-extrabold text-slate-800 dark:text-slate-200 mb-2 uppercase tracking-wider flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] inline-flex items-center justify-center font-bold">1</span>
            Select Product / Crop *
          </label>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            ${['Rice', 'Paddy', 'Cotton', 'Maize', 'Chilli'].map(crop => `
              <button type="button" onclick="handleCropSelection('${crop}')" class="py-2.5 px-3 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${selectedCrop === crop ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-300'}">
                ${crop === 'Rice' ? '🌾 Rice' : crop === 'Paddy' ? '🌾 Paddy' : crop === 'Cotton' ? '☁️ Cotton' : crop === 'Maize' ? '🌽 Maize' : '🌶️ Chilli'}
              </button>
            `).join('')}
          </div>
          <p class="text-[11px] text-slate-500 mt-1.5">Procurement centers will be filtered automatically based on selected produce.</p>
        </div>

        <!-- STEP 2: Filtered Procurement Centre Selection -->
        <div class="border-t border-slate-200 dark:border-slate-700 pt-5">
          <label class="block text-xs font-extrabold text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] inline-flex items-center justify-center font-bold">2</span>
            Select Supported Procurement Centre *
          </label>
          <select id="booking-centre-select" onchange="handleCentreSelection(this.value)" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-semibold">
            <option value="">-- Choose Centre Supporting ${selectedCrop} --</option>
            ${cachedCentres.map(c => `
              <option value="${c.id}" ${Number(selectedCentreId) === c.id ? 'selected' : ''}>
                ${escapeHtml(c.name)} (${escapeHtml(c.code)}) - ${escapeHtml(c.district || c.location)} [Capacity: ${c.daily_capacity}/day]
              </option>
            `).join('')}
          </select>
          ${cachedCentres.length === 0 ? `
            <p class="text-xs text-rose-600 mt-1 font-semibold">No procurement centers currently accept ${selectedCrop}. Please choose another crop.</p>
          ` : `
            <p class="text-[11px] text-slate-500 mt-1">Showing ${cachedCentres.length} center(s) equipped for ${selectedCrop} handling.</p>
          `}
        </div>

        <!-- STEP 3: Dealer Selection (Filtered by Centre) -->
        <div id="dealers-section" class="${selectedCentreId ? '' : 'hidden'} border-t border-slate-200 dark:border-slate-700 pt-5 space-y-3">
          <label class="block text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] inline-flex items-center justify-center font-bold">3</span>
            Select Authorized Dealer at ${selectedCentre ? escapeHtml(selectedCentre.name) : 'Selected Centre'} *
          </label>
          
          ${cachedDealers.length === 0 ? `
            <div class="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              ⚠️ No approved dealers are currently registered at this procurement center. Please select a different center or check back later.
            </div>
          ` : `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="dealers-grid">
              ${cachedDealers.map(d => `
                <label class="cursor-pointer p-3.5 rounded-xl border-2 transition ${Number(selectedDealerId) === d.dealer_id ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 shadow-md ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 bg-white dark:bg-slate-800'} flex flex-col justify-between">
                  <div class="flex items-start gap-2.5">
                    <input type="radio" name="dealer_id_radio" value="${d.dealer_id}" ${Number(selectedDealerId) === d.dealer_id ? 'checked' : ''} onchange="handleDealerSelection(${d.dealer_id})" class="mt-1 text-emerald-600 focus:ring-emerald-500">
                    <div>
                      <span class="font-extrabold text-sm text-slate-900 dark:text-white block">${escapeHtml(d.name)}</span>
                      <span class="text-xs text-slate-600 dark:text-slate-300 font-medium block">${escapeHtml(d.business_name)}</span>
                      <span class="text-[11px] text-slate-400 font-mono mt-0.5 block">Lic: ${escapeHtml(d.license_number)}</span>
                      <span class="text-[11px] text-slate-500 block">📞 ${escapeHtml(d.mobile_number)}</span>
                    </div>
                  </div>
                  <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    <span class="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase">Verified Dealer ✓</span>
                    <span class="text-[10px] text-slate-400">${escapeHtml(d.centre_name)}</span>
                  </div>
                </label>
              `).join('')}
            </div>
          `}
        </div>

        <!-- STEP 4: Slot & Quantity Selection -->
        <div id="slots-section" class="${selectedDealerId ? '' : 'hidden'} border-t border-slate-200 dark:border-slate-700 pt-5 space-y-4">
          <label class="block text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] inline-flex items-center justify-center font-bold">4</span>
            Select Slot & Expected Quantity *
          </label>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" id="slots-grid">
            ${cachedSlots.map(s => {
              const isFull = s.is_full;
              const isSelected = Number(selectedSlotId) === s.id;
              return `
                <label class="cursor-pointer p-3 rounded-xl border-2 transition ${isFull ? 'opacity-50 border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 pointer-events-none' : isSelected ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500 bg-white dark:bg-slate-800'} flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <input type="radio" name="slot_id_radio" value="${s.id}" ${isSelected ? 'checked' : ''} ${isFull ? 'disabled' : ''} onchange="handleSlotSelection(${s.id})" class="text-emerald-600 focus:ring-emerald-500">
                    <div>
                      <span class="font-bold text-xs text-slate-900 dark:text-white block">${s.date}</span>
                      <span class="text-[11px] text-slate-500">${s.start_time} - ${s.end_time}</span>
                    </div>
                  </div>
                  <span class="text-[10px] font-extrabold px-2 py-0.5 rounded ${isFull ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}">
                    ${isFull ? 'Full' : `${s.available_capacity} Left`}
                  </span>
                </label>
              `;
            }).join('')}
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Expected Produce Quantity (Quintals) *
            </label>
            <input type="number" id="booking-quantity-input" min="1" max="500" step="0.5" value="40" required class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          </div>

          <!-- Assignment Summary Box -->
          ${selectedDealer && selectedCentre ? `
            <div class="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs space-y-1.5">
              <span class="font-extrabold text-emerald-900 dark:text-emerald-200 block text-xs">Assignment Summary:</span>
              <div class="text-slate-700 dark:text-slate-300 flex justify-between">
                <span>Product:</span> <strong class="text-slate-900 dark:text-white">${selectedCrop}</strong>
              </div>
              <div class="text-slate-700 dark:text-slate-300 flex justify-between">
                <span>Procurement Centre:</span> <strong class="text-slate-900 dark:text-white">${escapeHtml(selectedCentre.name)}</strong>
              </div>
              <div class="text-slate-700 dark:text-slate-300 flex justify-between">
                <span>Exclusive Assigned Dealer:</span> <strong class="text-emerald-700 dark:text-emerald-400">${escapeHtml(selectedDealer.name)} (${escapeHtml(selectedDealer.business_name)})</strong>
              </div>
              <div class="pt-2 border-t border-emerald-200 dark:border-emerald-800/80 text-[11px] text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5">
                <i data-lucide="shield-alert" class="w-3.5 h-3.5 flex-shrink-0"></i>
                Only Dealer ${escapeHtml(selectedDealer.name)} will be authorized to scan and process your pass.
              </div>
            </div>
          ` : ''}

          <!-- Submit Button -->
          <button type="submit" id="btn-confirm-assignment" class="btn-agri w-full py-3.5 text-sm font-bold shadow-xl flex items-center justify-center gap-2">
            <i data-lucide="check-circle" class="w-5 h-5"></i> Confirm Assignment & Generate QR Pass
          </button>
        </div>

      </form>

    </div>
  `;
}

async function handleCropSelection(crop) {
  selectedCrop = crop;
  selectedCentreId = null;
  selectedDealerId = null;
  selectedSlotId = null;
  cachedDealers = [];
  cachedSlots = [];
  try {
    cachedCentres = await api.getCentres(crop);
  } catch (e) {
    cachedCentres = [];
  }
  renderApp();
}

async function handleCentreSelection(centreId) {
  selectedCentreId = centreId;
  selectedDealerId = null;
  selectedSlotId = null;
  cachedDealers = [];
  cachedSlots = [];
  if (!centreId) {
    renderApp();
    return;
  }
  try {
    const [dealers, slots] = await Promise.all([
      api.getDealersByCentre(centreId),
      api.getSlots(centreId)
    ]);
    cachedDealers = dealers || [];
    cachedSlots = slots || [];
  } catch (e) {
    console.error("Failed to load dealers/slots:", e);
  }
  renderApp();
}

function handleDealerSelection(dealerId) {
  selectedDealerId = dealerId;
  renderApp();
}

function handleSlotSelection(slotId) {
  selectedSlotId = slotId;
}

function showAssignmentQRPass(active) {
  state.setBookingForQR({
    qr_token: active.qr_token,
    booking_code: active.qr_token || active.booking_code,
    raw_booking_code: active.booking_code,
    token_number: active.token_number,
    centre_name: active.centre_name,
    crop_type: active.product_name,
    expected_quantity_quintals: active.expected_quantity_quintals,
    slot_date: active.slot_date,
    slot_time: active.slot_time,
    dealer_name: active.dealer_name,
    dealer_business: active.dealer_business
  });
}

async function handleCancelAssignment(assignmentId) {
  if (!confirm("Are you sure you want to cancel your dealer assignment and booking?")) {
    return;
  }
  try {
    await api.cancelFarmerAssignment(assignmentId);
    alert("Assignment successfully cancelled.");
    renderApp();
  } catch (err) {
    alert(err.message || "Failed to cancel assignment.");
  }
}

async function handleConfirmFarmerAssignment(e) {
  e.preventDefault();
  const qty = document.getElementById("booking-quantity-input")?.value;

  if (!selectedCentreId || !selectedDealerId || !selectedSlotId) {
    alert("Please select Crop, Procurement Centre, Authorized Dealer, and Slot.");
    return;
  }
  if (!qty || parseFloat(qty) <= 0) {
    alert("Please enter a valid expected produce quantity.");
    return;
  }

  const btn = document.getElementById("btn-confirm-assignment");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-flex items-center gap-2"><div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Generating QR Pass...</span>`;
  }

  try {
    const res = await api.createFarmerDealerAssignment({
      centre_id: parseInt(selectedCentreId, 10),
      dealer_id: parseInt(selectedDealerId, 10),
      product_name: selectedCrop,
      slot_id: parseInt(selectedSlotId, 10),
      expected_quantity_quintals: parseFloat(qty)
    });

    if (window.confetti) {
      try { confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } }); } catch (ce) {}
    }

    alert(`Assignment created successfully!\n\nAuthorized Dealer: ${res.dealer_name}\nProcurement Centre: ${res.centre_name}\nToken Number: ${res.token_number}`);
    
    // Reset wizard state
    selectedCentreId = null;
    selectedDealerId = null;
    selectedSlotId = null;
    cachedDealers = [];
    cachedSlots = [];

    state.setActiveTab('home');
    const notifs = await api.getNotifications();
    state.setNotifications(notifs);
  } catch (err) {
    alert(err.message || "Failed to create assignment.");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Confirm Assignment & Generate QR Pass`;
    }
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
