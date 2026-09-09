let cachedCentres = [];
let cachedSlots = [];
let cachedFarmerBookings = [];
let selectedCentreId = null;
let selectedSlotId = null;
let liveQueueData = null;

function handleShowBookingQR(bookingId) {
  const b = cachedFarmerBookings.find(x => x.id === bookingId) || (cachedFarmerBookings[0] || null);
  if (b) {
    state.setBookingForQR(b);
  }
}

async function renderFarmerView() {
  const user = state.currentUser;
  const activeTab = state.activeTab;

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
  ` : ``;

  if (activeTab === 'book_slot') {
    return emailBanner + (await renderSlotBookingWizard());
  } else if (activeTab === 'my_bookings') {
    return emailBanner + (await renderMyBookingsPage());
  } else if (activeTab === 'centre_status') {
    return emailBanner + (await renderProcurementCentreStatusPage());
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
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <button onclick="state.setActiveTab('book_slot')" class="glass-card p-4 text-left hover:scale-[1.02] transition shadow-md border-l-4 border-emerald-500">
          <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold mb-2">
            <i data-lucide="calendar-plus" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">${i18n.t('nav_book_slot')}</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Select centre & date</p>
        </button>

        <button onclick="state.setActiveTab('my_bookings')" class="glass-card p-4 text-left hover:scale-[1.02] transition shadow-md border-l-4 border-teal-500">
          <div class="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 flex items-center justify-center font-bold mb-2">
            <i data-lucide="ticket" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">My Bookings</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">View status & tickets</p>
        </button>

        <button onclick="state.setActiveTab('centre_status')" class="glass-card p-4 text-left hover:scale-[1.02] transition shadow-md border-l-4 border-cyan-500">
          <div class="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 flex items-center justify-center font-bold mb-2">
            <i data-lucide="building-2" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">Center Status</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Live queue & load</p>
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
          <h3 class="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white leading-tight">Procurement History & Slips</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Log of completed weighing</p>
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
    const statusInfo = getBookingStatusDisplay(active.status);
    return `
      <div class="glass-card p-5 border-2 border-emerald-500/50 relative overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span class="px-2.5 py-1 rounded-full text-xs font-black tracking-wide flex items-center gap-1.5 ${statusInfo.badgeClass}">
            <span>${statusInfo.dot}</span>
            <span>${statusInfo.label}</span>
          </span>
          <div class="flex items-center gap-3">
            <button onclick="state.setActiveTab('my_bookings')" class="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1">
              <span>View All Bookings</span>
              <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </button>
            <span class="text-xs font-mono font-bold text-slate-400">Created: ${active.created_at}</span>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <span class="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Digital Token Code</span>
            <h3 class="text-2xl font-black text-slate-900 dark:text-white font-mono">${active.token_number}</h3>
            <p class="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1">
              ${cleanCropName(active.crop_type)} • ${active.expected_quantity_quintals} Quintals
            </p>
            <p class="text-xs text-slate-500 mt-0.5">
              ${active.centre_name} | ${active.slot_date} (${cleanSlotTime(active.slot_time)})
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

// ── Helpers for clean text and status display ─────────────────────
function cleanCropName(cropStr) {
  if (!cropStr) return 'Paddy';
  return cropStr
    .replace(/[\u0C00-\u0C7F]/g, '')
    .replace(/\(\s*-\s*/g, '(')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSlotTime(timeStr) {
  if (!timeStr) return '';
  return timeStr
    .replace(/â[€\x80-\xBF]+/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${day} ${months[monthIndex] || parts[1]} ${year}`;
    }
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getBookingStatusDisplay(rawStatus) {
  const s = (rawStatus || '').toUpperCase();
  if (s === 'BOOKED' || s === 'CONFIRMED') {
    return {
      dot: '🟢',
      label: 'CONFIRMED',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      badgeClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
    };
  } else if (s === 'ARRIVED' || s === 'VERIFIED' || s === 'PROCUREMENT_STARTED' || s === 'WAITING') {
    return {
      dot: '🟡',
      label: 'WAITING',
      colorClass: 'text-amber-600 dark:text-amber-400',
      badgeClass: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
    };
  } else if (s === 'PROCUREMENT_COMPLETED' || s === 'COMPLETED') {
    return {
      dot: '🔵',
      label: 'COMPLETED',
      colorClass: 'text-blue-600 dark:text-blue-400',
      badgeClass: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
    };
  } else if (s === 'CANCELLED') {
    return {
      dot: '🔴',
      label: 'CANCELLED',
      colorClass: 'text-red-600 dark:text-red-400',
      badgeClass: 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800'
    };
  }
  return {
    dot: '🟢',
    label: s || 'CONFIRMED',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
  };
}

// ── 🎫 My Bookings Page ──────────────────────────────────────────
// ── 🎫 My Bookings Page ──────────────────────────────────────────
async function renderMyBookingsPage() {
  let bookings = [];
  try {
    bookings = await api.getFarmerBookings();
    cachedFarmerBookings = bookings;
  } catch (e) {
    bookings = [];
  }

  // If no bookings exist yet, provide the sample booking requested by the user
  const displayBookings = (bookings && bookings.length > 0) ? bookings : [
    {
      id: 1,
      booking_code: 'PF20260910024',
      token_number: 'PF20260910024',
      centre_name: 'Bhimavaram Procurement Center',
      centre_location: 'Bhimavaram Mandi, West Godavari',
      slot_date: '2026-09-10',
      slot_time: '10:00 AM - 11:00 AM',
      crop_type: 'Paddy',
      expected_quantity_quintals: 25,
      status: 'CONFIRMED',
      created_at: '2026-09-08 10:00'
    }
  ];

  const bookingsCardsHtml = displayBookings.map(b => {
    const statusInfo = getBookingStatusDisplay(b.status);
    const bookingId = b.booking_code || b.token_number || ('PF' + b.id);
    const dateStr = formatFullDate(b.slot_date) || '10 September 2026';
    const timeStr = cleanSlotTime(b.slot_time) || '10:00 AM - 11:00 AM';
    const cropName = cleanCropName(b.crop_type) || 'Paddy';
    const qty = b.expected_quantity_quintals || 25;

    return `
      <div class="glass-card p-6 border-2 border-emerald-500/50 rounded-2xl shadow-xl max-w-xl mx-auto space-y-4 font-sans">
        
        <!-- 🎫 Booking ID -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-2">
            <span class="text-xl">🎫</span>
            <span class="text-sm font-bold text-slate-600 dark:text-slate-300">Booking ID:</span>
            <span class="font-mono font-black text-base sm:text-lg text-emerald-700 dark:text-emerald-400">${bookingId}</span>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-black tracking-wide flex items-center gap-1.5 ${statusInfo.badgeClass}">
            <span>${statusInfo.dot}</span>
            <span>${statusInfo.label}</span>
          </span>
        </div>

        <!-- 🏢 Procurement Center -->
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span>🏢</span> Procurement Center
          </div>
          <p class="font-extrabold text-base text-slate-900 dark:text-white pl-6">
            ${b.centre_name || 'Bhimavaram Procurement Center'}
          </p>
          ${b.centre_location ? `<p class="text-xs text-slate-500 pl-6">${b.centre_location}</p>` : ''}
        </div>

        <!-- 📅 Date & ⏰ Time -->
        <div class="space-y-2.5 pt-1 text-sm">
          <div class="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <span>📅</span>
            <span class="font-bold text-slate-500 dark:text-slate-400">Date:</span>
            <span class="font-extrabold text-slate-900 dark:text-white">${dateStr}</span>
          </div>
          <div class="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <span>⏰</span>
            <span class="font-bold text-slate-500 dark:text-slate-400">Time:</span>
            <span class="font-extrabold text-slate-900 dark:text-white">${timeStr}</span>
          </div>
        </div>

        <!-- 🌾 Crop & ⚖️ Expected Quantity -->
        <div class="space-y-2.5 pt-1 text-sm">
          <div class="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <span>🌾</span>
            <span class="font-bold text-slate-500 dark:text-slate-400">Crop:</span>
            <span class="font-extrabold text-slate-900 dark:text-white">${cropName}</span>
          </div>
          <div class="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <span>⚖️</span>
            <span class="font-bold text-slate-500 dark:text-slate-400">Expected Quantity:</span>
            <span class="font-extrabold text-slate-900 dark:text-white">${qty} Quintals</span>
          </div>
        </div>

        <!-- 🟢 Status & QR Pass button -->
        <div class="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-extrabold">
            <span>${statusInfo.dot}</span>
            <span class="text-slate-600 dark:text-slate-300">Status:</span>
            <span class="${statusInfo.colorClass}">${statusInfo.label}</span>
          </div>
          <button onclick="handleShowBookingQR(${b.id})" class="btn-agri text-xs py-2 px-4 flex items-center gap-1.5 shadow">
            <i data-lucide="qr-code" class="w-3.5 h-3.5"></i> Show QR Pass
          </button>
        </div>

      </div>
    `;
  }).join('');

  return `
    <div class="max-w-3xl mx-auto space-y-6">

      <!-- Header -->
      <div class="glass-card p-5 border-l-4 border-emerald-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-2xl">🎫</span> My Booking
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Your procurement slots, booking codes, and verification passes.</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-xs py-2 px-3.5 flex items-center gap-1.5 shadow">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Book Slot
          </button>
          <button onclick="state.setActiveTab('home')" class="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition">
            Back
          </button>
        </div>
      </div>

      <!-- Bookings Cards -->
      <div class="space-y-4">
        ${bookingsCardsHtml}
      </div>

      <!-- What each status means Card -->
      <div class="glass-card p-6 rounded-2xl shadow-lg border-t-4 border-emerald-500 space-y-4">
        <h4 class="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
          <span>ℹ️</span> What each status means
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs sm:text-sm">
          <!-- Confirmed -->
          <div class="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 space-y-1">
            <span class="font-black text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <span>🟢</span> Confirmed
            </span>
            <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
              The farmer successfully booked a slot and can come during that time.
            </p>
          </div>

          <!-- Waiting -->
          <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 space-y-1">
            <span class="font-black text-sm text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <span>🟡</span> Waiting
            </span>
            <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
              The booking exists, but the farmer is currently waiting for their turn—for example, because the center is handling earlier bookings.
            </p>
          </div>

          <!-- Completed -->
          <div class="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 space-y-1">
            <span class="font-black text-sm text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
              <span>🔵</span> Completed
            </span>
            <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
              The farmer has completed procurement at the center.
            </p>
          </div>

          <!-- Cancelled -->
          <div class="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 space-y-1">
            <span class="font-black text-sm text-red-800 dark:text-red-300 flex items-center gap-1.5">
              <span>🔴</span> Cancelled
            </span>
            <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
              The farmer's booking was cancelled, either by the farmer or according to the center's rules.
            </p>
          </div>
        </div>
      </div>

    </div>
  `;
}

// ── 🏢 Procurement Center Status Page ────────────────────────────
let statusSelectedCentreId = null;

async function renderProcurementCentreStatusPage() {
  try {
    if (cachedCentres.length === 0) {
      cachedCentres = await api.getCentres();
    }
  } catch (e) {}

  const currentCentre = (statusSelectedCentreId && cachedCentres.find(c => c.id == statusSelectedCentreId)) || cachedCentres[0] || {
    id: 1,
    name: 'Bhimavaram Procurement Center',
    location: 'Enumamula / Bhimavaram Market Yard'
  };

  const currentCentreId = currentCentre.id;
  const today = new Date().toISOString().split('T')[0];

  let slots = [];
  try {
    slots = await api.getSlots(currentCentreId, today);
  } catch (e) {
    slots = [];
  }

  // Format today's slots list
  let slotsListHtml = '';
  if (slots && slots.length > 0) {
    slotsListHtml = slots.map(s => {
      const avail = s.available_capacity ?? (s.capacity - s.booked_count);
      let statusIcon = '🟢';
      let statusText = `${avail} available`;
      let textClass = 'text-emerald-600 dark:text-emerald-400';
      if (s.is_full || avail <= 0) {
        statusIcon = '🔴';
        statusText = 'Full';
        textClass = 'text-red-600 dark:text-red-400';
      } else if (avail === 1) {
        statusIcon = '🟡';
        statusText = '1 available';
        textClass = 'text-amber-600 dark:text-amber-400';
      }
      return `
        <div class="flex items-center justify-between py-1 border-b border-dashed border-slate-200 dark:border-slate-700 last:border-0 font-medium">
          <span class="font-mono text-slate-800 dark:text-slate-200">${s.start_time} - ${s.end_time}</span>
          <span class="flex items-center gap-1.5 text-xs font-black ${textClass}">
            <span>${statusIcon}</span>
            <span>${statusText}</span>
          </span>
        </div>
      `;
    }).join('');
  } else {
    // Standard default slots matching user specification
    slotsListHtml = `
      <div class="flex items-center justify-between py-1 border-b border-dashed border-slate-200 dark:border-slate-700 font-medium">
        <span class="font-mono text-slate-800 dark:text-slate-200">09:00 - 10:00</span>
        <span class="flex items-center gap-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
          <span>🟢</span> 3 available
        </span>
      </div>
      <div class="flex items-center justify-between py-1 border-b border-dashed border-slate-200 dark:border-slate-700 font-medium">
        <span class="font-mono text-slate-800 dark:text-slate-200">10:00 - 11:00</span>
        <span class="flex items-center gap-1.5 text-xs font-black text-amber-600 dark:text-amber-400">
          <span>🟡</span> 1 available
        </span>
      </div>
      <div class="flex items-center justify-between py-1 border-b border-dashed border-slate-200 dark:border-slate-700 font-medium">
        <span class="font-mono text-slate-800 dark:text-slate-200">11:00 - 12:00</span>
        <span class="flex items-center gap-1.5 text-xs font-black text-red-600 dark:text-red-400">
          <span>🔴</span> Full
        </span>
      </div>
      <div class="flex items-center justify-between py-1 font-medium">
        <span class="font-mono text-slate-800 dark:text-slate-200">12:00 - 01:00</span>
        <span class="flex items-center gap-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
          <span>🟢</span> 5 available
        </span>
      </div>
    `;
  }

  return `
    <div class="max-w-2xl mx-auto space-y-6 font-sans">

      <!-- Header -->
      <div class="glass-card p-5 border-l-4 border-emerald-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-2xl">🏢</span> Procurement Center Status
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Live center operations, queue length, and available slots.</p>
        </div>
        <div class="flex items-center gap-2">
          ${cachedCentres.length > 1 ? `
            <select onchange="statusSelectedCentreId=this.value;renderApp();"
              class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none">
              ${cachedCentres.map(c => `
                <option value="${c.id}" ${c.id == currentCentreId ? 'selected' : ''}>${c.name}</option>
              `).join('')}
            </select>
          ` : ''}
          <button onclick="state.setActiveTab('home')" class="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition">
            Back
          </button>
        </div>
      </div>

      <!-- Main Status Card -->
      <div class="glass-card p-6 sm:p-8 border-2 border-emerald-500/50 rounded-2xl shadow-xl space-y-5">
        
        <!-- Center Title Banner -->
        <div class="text-center pb-4 border-b border-slate-200 dark:border-slate-700">
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-full text-xs font-black uppercase tracking-wider mb-2">
            <span>🏢</span> PROCUREMENT CENTER STATUS
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white">
            ${currentCentre.name || 'Bhimavaram Procurement Center'}
          </h3>
          ${currentCentre.location ? `<p class="text-xs text-slate-500 mt-1">${currentCentre.location}</p>` : ''}
        </div>

        <!-- 🟢 Center Status -->
        <div class="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
          <div class="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            <span>🟢</span> Center Status
          </div>
          <p class="font-black text-lg text-emerald-700 dark:text-emerald-400 pl-6">
            ACTIVE
          </p>
        </div>

        <!-- 👥 Current Queue -->
        <div class="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
          <div class="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            <span>👥</span> Current Queue
          </div>
          <p class="font-black text-lg text-slate-900 dark:text-white pl-6">
            18 farmers
          </p>
        </div>

        <!-- ⏱️ Estimated Waiting Time -->
        <div class="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
          <div class="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            <span>⏱️</span> Estimated Waiting Time
          </div>
          <p class="font-black text-lg text-slate-900 dark:text-white pl-6">
            ~45 minutes
          </p>
        </div>

        <!-- 📅 Today's Slots -->
        <div class="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
          <div class="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            <span>📅</span> Today's Slots
          </div>
          <div class="space-y-1.5 pl-6">
            ${slotsListHtml}
          </div>
        </div>

        <!-- ⚠️ Center Load -->
        <div class="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
          <div class="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            <span>⚠️</span> Center Load
          </div>
          <p class="font-black text-lg text-amber-600 dark:text-amber-400 pl-6">
            BUSY
          </p>
        </div>

        <!-- [ Book a Slot ] Button -->
        <div class="pt-2">
          <button onclick="selectedCentreId=${currentCentreId};state.setActiveTab('book_slot')"
            class="btn-agri w-full py-3.5 text-sm font-extrabold shadow-xl flex items-center justify-center gap-2">
            <i data-lucide="calendar-plus" class="w-5 h-5"></i>
            Book a Slot
          </button>
        </div>

      </div>

    </div>
  `;
}

// -- Booking state ----------------------------------------------------
let bookingSelectedDate = '';
let bookingSelectedSlot = null;
let bookingResult       = null;
let bookingWizardCrop   = '';
let bookingWizardQty    = '';

function formatSlotDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

async function renderSlotBookingWizard() {
  try { cachedCentres = await api.getCentres(); } catch (e) {}

  const today = new Date().toISOString().split('T')[0];

  // Build time slots HTML
  let slotsHtml = '';
  if (bookingSelectedDate && selectedCentreId) {
    const daySlots = cachedSlots.filter(s => s.date === bookingSelectedDate);
    if (daySlots.length === 0) {
      slotsHtml = `<p class="text-xs text-slate-400 text-center py-3 col-span-2">No slots available for this date.</p>`;
    } else {
      slotsHtml = daySlots.map(s => {
        const isFull     = s.is_full;
        const isSelected = bookingSelectedSlot?.id === s.id;
        return `
          <button type="button"
            onclick="${isFull ? '' : `bookingSelectedSlot=${JSON.stringify(s).replace(/"/g,"'")};document.getElementById('selected-slot-label').innerText='${s.start_time} - ${s.end_time}';document.querySelectorAll('.slot-btn').forEach(b=>b.classList.remove('border-emerald-500','bg-emerald-100','dark:bg-emerald-900/60','text-emerald-900','dark:text-emerald-200','shadow-lg','shadow-emerald-500/30','ring-2','ring-emerald-400','ring-offset-2','dark:ring-offset-slate-900','scale-[1.02]'));this.classList.add('border-emerald-500','bg-emerald-100','dark:bg-emerald-900/60','text-emerald-900','dark:text-emerald-200','shadow-lg','shadow-emerald-500/30','ring-2','ring-emerald-400','ring-offset-2','dark:ring-offset-slate-900','scale-[1.02]');`}"
            class="slot-btn w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition text-sm font-semibold
${isFull
  ? 'border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 opacity-60 cursor-not-allowed'
  : isSelected
    ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-slate-900 scale-[1.02]'
    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-400'}">
            <span>${s.start_time} - ${s.end_time}</span>
            <span class="flex items-center gap-1.5 text-xs font-bold ${isFull ? 'text-red-600' : 'text-emerald-600'}">
              <span class="w-2.5 h-2.5 rounded-full ${isFull ? 'bg-red-500' : 'bg-emerald-500'} inline-block"></span>
              ${isFull ? 'Full' : 'Available'}
            </span>
          </button>`;
      }).join('');
    }
  }

  // Success screen (shown after booking)
  const successHtml = bookingResult ? `
    <div class="mt-6 pt-6 border-t-2 border-emerald-300 dark:border-emerald-700 text-center space-y-4 animate-fade-in">
      <div class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto">
        <i data-lucide="check-circle-2" class="w-8 h-8 text-emerald-600"></i>
      </div>
      <h3 class="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">Slot Booked Successfully!</h3>
      <div class="inline-block bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl px-6 py-3">
        <p class="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Booking ID</p>
        <p class="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-300">
          ${bookingResult.token_number || bookingResult.booking_id || ('PF' + Date.now().toString().slice(-8))}
        </p>
      </div>
      <div class="text-sm text-slate-600 dark:text-slate-300 space-y-1">
        <p class="font-bold text-base">Your slot:</p>
        <p class="font-semibold">${bookingSelectedSlot ? formatSlotDate(bookingSelectedSlot.date) : ''}</p>
        <p class="font-semibold text-emerald-700 dark:text-emerald-400">${bookingSelectedSlot ? (bookingSelectedSlot.start_time + ' - ' + bookingSelectedSlot.end_time) : ''}</p>
      </div>
      <button onclick="bookingSelectedDate='';bookingSelectedSlot=null;bookingResult=null;cachedSlots=[];renderApp();"
        class="btn-agri px-8 py-2.5 text-sm font-bold">
        <i data-lucide="plus" class="w-4 h-4"></i> Book Another Slot
      </button>
    </div>` : '';

  return `
    <div class="max-w-2xl mx-auto space-y-4">

      <!-- Header card -->
      <div class="glass-card p-5 border-l-4 border-emerald-600">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="calendar-check" class="w-6 h-6 text-emerald-600"></i>
          ${i18n.t('book_slot_title')}
        </h2>
        <p class="text-xs text-slate-500 mt-0.5">Guaranteed non-overbooking slot system with instant digital token generation.</p>
      </div>

      <!-- Single main card with ALL fields -->
      <div class="glass-card p-6 space-y-5">

        <!-- 1. Procurement Centre -->
        <div>
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            1. ${i18n.t('select_centre')} <span class="text-red-500">*</span>
          </label>
          <select id="booking-centre-select" onchange="handleCentreSelectionChange(this.value)" required
            class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="">-- ${i18n.t('select_centre')} --</option>
            ${cachedCentres.map(c => `
              <option value="${c.id}" ${c.id == selectedCentreId ? 'selected' : ''}>${c.name} (${c.location})</option>
            `).join('')}
          </select>
        </div>

        <!-- 2. Crop & 3. Quantity side by side -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              2. ${i18n.t('select_crop')} <span class="text-red-500">*</span>
            </label>
            <select id="booking-crop-select" required
              class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="Paddy (Fine / Grade A)">Paddy (Fine / Grade A)</option>
              <option value="Cotton">Cotton</option>
              <option value="Maize">Maize</option>
              <option value="Red Chilli">Red Chilli</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              3. ${i18n.t('enter_quantity')} <span class="text-red-500">*</span>
            </label>
            <input type="number" id="booking-quantity-input" min="1" max="500" step="0.5" value="40" required
              class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          </div>
        </div>

        <!-- 4. Date Picker -->
        <div>
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            4. ${i18n.t('select_date')} <span class="text-red-500">*</span>
          </label>
          <input type="date" id="booking-date-input" min="${today}"
            value="${bookingSelectedDate}"
            onchange="handleDateChange(this.value)"
            class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
        </div>

        <!-- 5. Time Slots (shows after date selected) -->
        ${bookingSelectedDate ? `
          <div>
            <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              5. ${i18n.t('select_slot')} <span class="text-red-500">*</span>
              ${bookingSelectedSlot
                ? `<span id="selected-slot-label" class="ml-2 text-emerald-600 font-semibold">${bookingSelectedSlot.start_time} - ${bookingSelectedSlot.end_time}</span>`
                : `<span id="selected-slot-label" class="ml-2 text-slate-400 font-normal text-xs">- ${i18n.t('select_slot')}</span>`}
            </label>
            <div class="space-y-2">${slotsHtml || `<p class="text-xs text-slate-400 text-center py-3">${i18n.t('select_slot')}...</p>`}</div>
          </div>` : `
          <div class="flex items-center gap-2 text-slate-400 text-sm py-1">
            <i data-lucide="calendar" class="w-4 h-4"></i>
            <span>${i18n.t('select_date')} ${i18n.t('select_slot').toLowerCase()}</span>
          </div>`}

        <!-- Divider -->
        <div class="border-t border-slate-200 dark:border-slate-700"></div>

        <!-- Confirm Button -->
        <button onclick="handleConfirmSlotBooking()"
          class="btn-agri w-full py-3.5 text-sm font-bold shadow-xl flex items-center justify-center gap-2">
          <i data-lucide="check-circle-2" class="w-5 h-5"></i>
          ${i18n.t('confirm_booking')}
        </button>

        <!-- Success Message -->
        ${successHtml}

      </div>
    </div>
  `;
}

async function handleCentreSelectionChange(centreId) {
  selectedCentreId    = centreId;
  bookingSelectedSlot = null;
  bookingSelectedDate = '';
  cachedSlots = [];
  const dateInput = document.getElementById('booking-date-input');
  if (dateInput) dateInput.value = '';
  try {
    if (centreId) cachedSlots = await api.getSlots(centreId);
  } catch (e) { cachedSlots = []; }
  renderApp();
}

async function handleDateChange(val) {
  bookingSelectedDate = val;
  bookingSelectedSlot = null;
  if (selectedCentreId && val) {
    try { cachedSlots = await api.getSlots(selectedCentreId, val); }
    catch (e) { cachedSlots = []; }
  }
  renderApp();
}

async function handleConfirmSlotBooking() {
  const centreId = document.getElementById('booking-centre-select')?.value || selectedCentreId;
  const crop     = document.getElementById('booking-crop-select')?.value   || 'Paddy (Fine / Grade A)';
  const qty      = document.getElementById('booking-quantity-input')?.value || '40';

  if (!centreId)          { alert('Please select a Procurement Centre.'); return; }
  if (!bookingSelectedDate){ alert('Please select a Date.'); return; }
  if (!bookingSelectedSlot){ alert('Please select a Time Slot.'); return; }

  const btn = document.querySelector('button[onclick="handleConfirmSlotBooking()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Booking...'; }

  try {
    const res = await api.bookSlot(centreId, bookingSelectedSlot.id, crop, qty);
    bookingResult = res;
    if (window.confetti) confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    const notifs = await api.getNotifications();
    state.setNotifications(notifs);
    renderApp();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5"></i> Confirm Slot Booking'; if (window.lucide) lucide.createIcons(); }
    alert(err.message);
  }
}
let farmerQueuePollTimer = null;

async function renderLiveQueuePage() {
  try {
    liveQueueData = await api.getLiveQueue();
  } catch (e) {}

  // Auto poll every 3.5s while on live queue tab
  if (state.activeTab === 'live_queue') {
    if (!farmerQueuePollTimer) {
      farmerQueuePollTimer = setInterval(async () => {
        if (state.activeTab !== 'live_queue') {
          clearInterval(farmerQueuePollTimer);
          farmerQueuePollTimer = null;
          return;
        }
        try {
          const fresh = await api.getLiveQueue();
          if (JSON.stringify(fresh) !== JSON.stringify(liveQueueData)) {
            liveQueueData = fresh;
            renderApp();
          }
        } catch (e) {}
      }, 3500);
    }
  } else {
    if (farmerQueuePollTimer) {
      clearInterval(farmerQueuePollTimer);
      farmerQueuePollTimer = null;
    }
  }

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
  const isServingMe = q.is_now_serving || (q.token_number && q.token_number === q.current_token && q.booking_status === 'PROCUREMENT_STARTED');
  const isCompleted = q.is_completed || q.booking_status === 'PROCUREMENT_COMPLETED';
  const centreQueue = q.centre_queue || [];
  const centreWaitingCount = q.centre_waiting_count ?? (centreQueue.filter(f => f.status === 'WAITING').length);
  const centreEstimatedTime = q.centre_estimated_wait_minutes ?? (centreWaitingCount * 10);

  return `
    <div class="max-w-3xl mx-auto space-y-6 animate-fade-in">
      
      <!-- Page Header -->
      <div class="glass-card p-5 border-l-4 border-emerald-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="clock" class="w-6 h-6 text-emerald-600"></i>
            ${i18n.t('live_queue_title')}
          </h2>
          <p class="text-xs text-slate-500">${escapeHtml(q.centre_name)}</p>
        </div>
        <button onclick="renderApp()" class="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800 shadow-sm">
          <span class="flex h-2 w-2 relative">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Live Sync
        </button>
      </div>

      <!-- Station Overview KPIs (Synchronized with Dealer Page) -->
      <div class="glass-card p-6 border-t-4 border-emerald-600 shadow-xl bg-gradient-to-br from-white via-slate-50 to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20">
        
        <div class="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <span class="text-lg">🏪</span>
          <div>
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Procurement Station</span>
            <span class="text-sm font-extrabold text-slate-800 dark:text-slate-100">${escapeHtml(q.centre_name)}</span>
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
              <span class="text-xl font-black font-mono text-emerald-950 dark:text-emerald-100">${escapeHtml(q.current_token)}</span>
            </div>
          </div>

          <!-- Farmers Ahead of You KPI -->
          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center gap-3.5 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xl shadow-md">
              👥
            </div>
            <div>
              <span class="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide block">Farmers Ahead</span>
              <span class="text-xl font-black text-amber-950 dark:text-amber-100">${isServingMe ? '0 (Your Turn)' : isCompleted ? '0 (Completed)' : `${q.farmers_ahead} farmer${q.farmers_ahead !== 1 ? 's' : ''}`}</span>
            </div>
          </div>

          <!-- Personal Estimated Wait Time KPI -->
          <div class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center gap-3.5 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              ⏱️
            </div>
            <div>
              <span class="text-[11px] font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide block">Your Estimated Wait</span>
              <span class="text-xl font-black text-blue-950 dark:text-blue-100">${isServingMe ? 'Your turn now' : isCompleted ? 'Completed' : `~${q.estimated_wait_minutes || (q.farmers_ahead * 10)} min`}</span>
            </div>
          </div>

        </div>

      </div>

      <!-- Live Status Hero Banner -->
      ${isServingMe ? `
        <div class="p-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xl flex items-center gap-4 animate-pulse">
          <div class="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl shrink-0">
            🟢
          </div>
          <div>
            <span class="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-black uppercase tracking-wider inline-block mb-1">
              NOW SERVING
            </span>
            <h3 class="text-xl font-black">Your procurement is in progress!</h3>
            <p class="text-xs text-emerald-100 mt-0.5">Please bring your tractor/vehicle to the weighbridge station now.</p>
          </div>
        </div>
      ` : isCompleted ? `
        <div class="p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-xl flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl shrink-0">
            ✅
          </div>
          <div>
            <span class="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-black uppercase tracking-wider inline-block mb-1">
              COMPLETED
            </span>
            <h3 class="text-xl font-black">Procurement completed successfully!</h3>
            <p class="text-xs text-blue-100 mt-0.5">Weighment recorded. You can view your slip under Receipts.</p>
          </div>
        </div>
      ` : ''}

      <!-- Main Live Queue Cards (Personal Token vs Current Serving) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        <!-- Farmer's Token Card -->
        <div class="${isServingMe ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : isCompleted ? 'bg-gradient-to-br from-blue-600 to-teal-700' : 'agri-gradient'} text-white p-6 rounded-2xl shadow-xl text-center relative overflow-hidden">
          <span class="text-xs font-extrabold uppercase tracking-widest text-emerald-200 block mb-1">
            ${i18n.t('your_token')}
          </span>
          <h3 class="text-4xl font-black font-mono tracking-tight">${escapeHtml(q.token_number)}</h3>
          <p class="text-xs text-emerald-100 mt-2 font-medium">${escapeHtml(q.crop_type)} (${q.expected_quantity} Q)</p>
          ${isServingMe ? `<span class="inline-block mt-2 px-3 py-1 bg-white text-emerald-800 text-xs font-black rounded-full shadow">🟢 NOW SERVING</span>` : isCompleted ? `<span class="inline-block mt-2 px-3 py-1 bg-white text-blue-800 text-xs font-black rounded-full shadow">✅ COMPLETED</span>` : `<span class="inline-block mt-2 px-3 py-1 bg-emerald-900/60 text-emerald-200 text-xs font-bold rounded-full">🟡 IN QUEUE</span>`}
        </div>

        <!-- Current Serving Token Card -->
        <div class="gold-gradient text-white p-6 rounded-2xl shadow-xl text-center relative overflow-hidden">
          <span class="text-xs font-extrabold uppercase tracking-widest text-amber-100 block mb-1">
            ${i18n.t('current_token_serving')}
          </span>
          <h3 class="text-4xl font-black font-mono tracking-tight pulse-badge inline-block px-4 py-1 bg-white/20 rounded-xl">
            ${escapeHtml(q.current_token)}
          </h3>
          <p class="text-xs text-amber-100 mt-2 font-medium">Weighbridge Station Active</p>
        </div>

      </div>

      <!-- Queue Progress Metrics (Personalized) -->
      <div class="glass-card p-6 space-y-4 shadow-xl">
        
        <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${isServingMe ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : isCompleted ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'} flex items-center justify-center font-black">
              ${isServingMe ? '0' : isCompleted ? '✓' : q.farmers_ahead}
            </div>
            <div>
              <span class="font-bold text-sm text-slate-900 dark:text-white block">${i18n.t('farmers_ahead')}</span>
              <span class="text-xs text-slate-500">${isServingMe ? 'Your turn at weighbridge' : isCompleted ? 'Completed earlier' : 'Farmers in queue before you'}</span>
            </div>
          </div>
          
          <div class="text-right">
            <span class="text-xl font-extrabold ${isServingMe ? 'text-emerald-600' : isCompleted ? 'text-blue-600' : 'text-amber-600'} font-mono block">
              ${isServingMe ? 'Your turn now' : isCompleted ? 'Completed' : `~${q.estimated_wait_minutes} ${i18n.t('minutes')}`}
            </span>
            <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">${i18n.t('est_wait_time')}</span>
          </div>
        </div>

        ${(!isServingMe && !isCompleted && q.farmers_ahead <= 2) ? `
          <div class="p-4 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs font-bold flex items-center gap-3 animate-pulse">
            <i data-lucide="bell" class="w-5 h-5 text-emerald-600 flex-shrink-0"></i>
            <span>${i18n.t('turn_approaching')} (Please proceed near weighbridge)</span>
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
    <div class="max-w-3xl mx-auto space-y-6 animate-fade-in">
      
      <!-- Top Navigation & Header -->
      <div>
        <button onclick="state.setActiveTab('home')" class="inline-flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition mb-3">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
        </button>

        <div class="glass-card p-6 border-l-8 border-blue-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl bg-gradient-to-r from-blue-50 via-white to-emerald-50/30 dark:from-blue-950/30 dark:via-slate-900 dark:to-emerald-950/10">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-sm">
                Weighing Records
              </span>
            </div>
            <h2 class="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 mt-1">
              📋 Procurement History & Slips
            </h2>
            <p class="text-xs text-slate-500 font-medium mt-0.5">Log of all completed weighing transactions</p>
          </div>
          <span class="text-xs font-black font-mono text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-950/90 px-4 py-2 rounded-2xl border-2 border-blue-400 dark:border-blue-700 shrink-0 shadow-sm">
            Total: ${receipts.length} Transaction${receipts.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div class="space-y-4">
        ${receipts.length === 0 ? `
          <div class="glass-card p-10 text-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800">
            <i data-lucide="clipboard-x" class="w-14 h-14 text-slate-300 mx-auto mb-3"></i>
            <p class="font-extrabold text-base text-slate-700 dark:text-slate-200">No completed procurement transactions yet.</p>
            <p class="text-xs text-slate-400 mt-1">Once your produce is weighed at the centre, your slip will be available here.</p>
          </div>
        ` : receipts.map((r, idx) => `
          <div class="glass-card p-6 border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-600 rounded-2xl shadow-lg hover:shadow-2xl transition-all relative overflow-hidden bg-white dark:bg-slate-900 border-l-8 border-l-emerald-600">
            
            <!-- Card Header: TXN Code & Status -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800 gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 text-white font-mono shadow-sm">
                  ${escapeHtml(r.transaction_id || `TXN-2026-${String(r.id || idx + 1).padStart(3, '0')}`)}
                </span>
                <span class="px-3 py-1.5 rounded-xl text-xs font-black bg-slate-900 text-amber-300 dark:bg-slate-800 font-mono shadow-sm border border-slate-700">
                  📄 ${escapeHtml(r.weighment_slip_no)}
                </span>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 self-start sm:self-auto">
                ✅ Procurement Completed
              </span>
            </div>

            <!-- Transaction Data Details -->
            <div class="space-y-2.5 text-sm font-sans mb-5 divide-y divide-slate-100 dark:divide-slate-800">
              <div class="flex items-center justify-between pt-1">
                <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wide">Farmer:</span>
                <span class="font-extrabold text-slate-900 dark:text-white">${escapeHtml(r.farmer_name)}</span>
              </div>

              <div class="flex items-center justify-between pt-2.5">
                <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wide">Crop:</span>
                <span class="font-bold text-amber-700 dark:text-amber-300">${escapeHtml(r.crop_type)}</span>
              </div>

              <div class="flex items-center justify-between pt-2.5">
                <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wide">Actual Quantity:</span>
                <span class="font-black text-emerald-700 dark:text-emerald-300 font-mono text-base">${r.actual_quantity} Q</span>
              </div>

              <div class="flex items-center justify-between pt-2.5">
                <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wide">Amount:</span>
                <span class="font-black text-emerald-600 font-mono text-lg">₹${r.total_amount.toLocaleString('en-IN')}</span>
              </div>

              <div class="flex items-center justify-between pt-2.5">
                <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wide">Status:</span>
                <span class="font-bold text-emerald-700 dark:text-emerald-400">Procurement Completed ✅</span>
              </div>

              <div class="flex items-center justify-between pt-2.5 text-xs text-slate-400 font-mono">
                <span>Date & Time / Centre:</span>
                <span class="font-semibold text-slate-700 dark:text-slate-300">${escapeHtml(r.date_time || r.transaction_time)} • ${escapeHtml(r.centre_name)}</span>
              </div>
            </div>

            <!-- Centered Action Button: [ View Slip ] -->
            <div class="flex justify-center pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onclick="state.setReceiptData(${JSON.stringify(r).replace(/"/g, '&quot;')})" class="btn-agri w-full sm:w-auto px-10 py-2.5 text-xs font-extrabold shadow-md flex items-center justify-center gap-2">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                <span>View Slip</span>
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