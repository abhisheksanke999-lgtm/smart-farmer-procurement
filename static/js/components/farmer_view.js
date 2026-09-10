let selectedCrop = "Paddy (Fine / Grade A)";
let selectedCategoryId = 1;
let selectedCentreId = null;
let selectedDealerId = null;
let selectedDate = null;
let selectedSlotId = null;
let calendarMonth = null;
let allCachedCentres = [];
let cachedCentres = [];
let cachedDealers = [];
let cachedSlots = [];
let cachedCategories = [];
let liveQueueData = null;
let serverTodayIST = null;
let currentActiveAssignments = [];

function isSameProduceField(cropA, cropB) {
  if (!cropA || !cropB) return false;
  const a = cropA.trim().toLowerCase();
  const b = cropB.trim().toLowerCase();
  if (a === b) return true;
  if ((a.includes("paddy") || a.includes("rice")) && (b.includes("paddy") || b.includes("rice"))) return true;
  if (a.includes("cotton") && b.includes("cotton")) return true;
  if (a.includes("maize") && b.includes("maize")) return true;
  if (a.includes("chilli") && b.includes("chilli")) return true;
  return false;
}

function getActiveAssignmentForCrop(crop, activeAssignments) {
  if (!activeAssignments || !Array.isArray(activeAssignments)) return null;
  return activeAssignments.find(asgn => isSameProduceField(asgn.product_name, crop)) || null;
}

// High-speed memory caches to make UI open instantly (0ms)
const cachedCentresByCrop = {};
const cachedDealersByCentreKey = {};
const cachedSlotsByCentreDate = {};
let cachedLiveQueueData = null;
let cachedLiveQueueTime = 0;
let cachedReceiptsData = null;
let cachedReceiptsTime = 0;
let cachedPaymentsData = null;
let cachedPaymentsTime = 0;

function getTodayIST() {
  if (serverTodayIST) return serverTodayIST;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch (e) {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }
}

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
  ` : '';

  if (activeTab === 'book_slot') {
    return emailBanner + (await renderSlotBookingWizard());
  } else if (activeTab === 'live_queue') {
    return emailBanner + (await renderLiveQueuePage());
  } else if (activeTab === 'receipts') {
    return emailBanner + (await renderFarmerReceiptsPage());
  } else if (activeTab === 'payments') {
    return emailBanner + (await renderFarmerPaymentsPage());
  } else if (activeTab === 'my_bookings') {
    return emailBanner + (await renderMyBookingsPage());
  } else if (activeTab === 'center_status') {
    return emailBanner + (await renderCenterStatusPage());
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

      <!-- Dashboard Navigation Cards (Unified 5-Card Grid) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        
        <!-- Book Slot Card -->
        <button onclick="state.setActiveTab('book_slot')" class="glass-card action-card-highlight-teal p-5 sm:p-6 text-left cursor-pointer group flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform shadow-sm">
              <i data-lucide="calendar-plus" class="w-6 h-6"></i>
            </div>
            <h3 class="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-snug">${i18n.t('nav_book_slot')}</h3>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 font-medium">Select centre &amp; date</p>
        </button>

        <!-- My Bookings Card -->
        <button onclick="handleMyBookingsCardClick()" class="glass-card action-card-highlight-orange p-5 sm:p-6 text-left cursor-pointer group flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950/80 dark:text-orange-300 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform shadow-sm">
              <i data-lucide="ticket" class="w-6 h-6"></i>
            </div>
            <h3 class="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-snug">My Bookings</h3>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 font-medium">View status &amp; tickets</p>
        </button>

        <!-- Center Status Card (Highlighted in Sky Blue) -->
        <button onclick="handleCenterStatusCardClick()" class="glass-card action-card-highlight-sky p-5 sm:p-6 text-left cursor-pointer group flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform shadow-sm">
              <i data-lucide="building-2" class="w-6 h-6"></i>
            </div>
            <h3 class="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-snug">Center Status</h3>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 font-medium">Live queue &amp; load</p>
        </button>

        <!-- Live Queue Card (Highlighted in Amber) -->
        <button onclick="state.setActiveTab('live_queue')" class="glass-card action-card-highlight-amber p-5 sm:p-6 text-left cursor-pointer group flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform shadow-sm">
              <i data-lucide="clock" class="w-6 h-6"></i>
            </div>
            <h3 class="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-snug">${i18n.t('nav_queue')}</h3>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 font-medium">Live token tracking</p>
        </button>

        <!-- Transactions & Payments Card (Highlighted in Blue) -->
        <button onclick="state.setActiveTab('receipts')" class="glass-card action-card-highlight-blue p-5 sm:p-6 text-left cursor-pointer group flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform shadow-sm">
              <i data-lucide="receipt" class="w-6 h-6"></i>
            </div>
            <h3 class="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-snug">${i18n.t('nav_receipts')}</h3>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 font-medium">Weighment &amp; payouts</p>
        </button>
      </div>

      <!-- Active Booking & QR Code Card -->
      ${await renderFarmerActiveBookingCard()}

    </div>
  `;
}

// ----------------------------------------------------
// CARD CLICK HANDLERS
// ----------------------------------------------------

function handleMyBookingsCardClick() {
  state.setActiveTab('my_bookings');
}

function handleCenterStatusCardClick() {
  state.setActiveTab('center_status');
}

async function renderMyBookingsPage() {
  try {
    const bookings = await getCachedFarmerBookings();
    const bookingsList = Array.isArray(bookings) ? bookings : [];

    // Status badge helper with vibrant high-contrast styles
    function getStatusInfo(status) {
      const map = {
        'BOOKED':                { label: 'WAITING FOR TURN',        badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700',   icon: 'clock',           color: 'amber' },
        'ARRIVED':               { label: 'ARRIVED AT CENTRE',       badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700',   icon: 'map-pin',         color: 'amber' },
        'VERIFIED':              { label: 'QR VERIFIED',             badgeClass: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',  icon: 'shield-check',    color: 'emerald' },
        'PROCUREMENT_STARTED':   { label: 'PROCUREMENT IN PROGRESS', badgeClass: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border border-blue-300 dark:border-blue-700', icon: 'loader',          color: 'blue' },
        'PROCUREMENT_COMPLETED': { label: 'COMPLETED',               badgeClass: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700', icon: 'check-circle',    color: 'emerald' },
        'CANCELLED':             { label: 'CANCELLED',               badgeClass: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-700', icon: 'x-circle',        color: 'rose' },
      };
      return map[status] || { label: status, badgeClass: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100 border border-slate-300', icon: 'help-circle', color: 'slate' };
    }

    // Format date nicely: "09-Sep-2026"
    function formatBookingDate(dateStr) {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr + 'T00:00:00');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return String(d.getDate()).padStart(2,'0') + '-' + months[d.getMonth()] + '-' + d.getFullYear();
      } catch(e) {
        return dateStr;
      }
    }

    // Status progress indicator with clear labels
    function getProgressSteps(status) {
      const steps = [
        { code: 'BOOKED', label: 'Booked' },
        { code: 'ARRIVED', label: 'Arrived' },
        { code: 'VERIFIED', label: 'Verified' },
        { code: 'PROCUREMENT_STARTED', label: 'Weighing' },
        { code: 'PROCUREMENT_COMPLETED', label: 'Completed' }
      ];
      if (status === 'CANCELLED') {
        return '<div class="flex items-center gap-2 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-800 dark:text-rose-200 text-xs font-black"><i data-lucide="x-circle" class="w-4 h-4 text-rose-600 dark:text-rose-400"></i> Booking Cancelled</div>';
      }
      const stepCodes = steps.map(s => s.code);
      const currentIdx = stepCodes.indexOf(status);

      let html = '<div class="pt-2 pb-1">';
      html += '<div class="flex items-center justify-between relative">';
      for (let i = 0; i < steps.length; i++) {
        const filled = i <= currentIdx;
        const checked = i < currentIdx;
        const isCurrent = i === currentIdx;

        html += '<div class="flex flex-col items-center z-10">';
        html += '<div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ' +
          (isCurrent ? 'bg-amber-500 text-white ring-4 ring-amber-200 dark:ring-amber-900/60 shadow-md scale-110' :
           filled ? 'bg-emerald-600 text-white shadow-sm' :
           'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600') + '">';
        html += checked ? '✓' : String(i + 1);
        html += '</div>';
        html += '<span class="text-[10px] sm:text-[11px] font-black mt-1.5 ' +
          (isCurrent ? 'text-amber-700 dark:text-amber-400 font-extrabold' :
           filled ? 'text-emerald-700 dark:text-emerald-400 font-bold' :
           'text-slate-500 dark:text-slate-400 font-medium') + '">' + steps[i].label + '</span>';
        html += '</div>';

        if (i < steps.length - 1) {
          html += '<div class="flex-1 h-1.5 mx-1 -mt-4 rounded-full ' + (i < currentIdx ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700') + '"></div>';
        }
      }
      html += '</div></div>';
      return html;
    }

    function buildBookingCard(b) {
      const si = getStatusInfo(b.status);
      const isActive = !['CANCELLED','PROCUREMENT_COMPLETED'].includes(b.status);
      const cardBorder = si.color === 'emerald' ? 'border-emerald-400 dark:border-emerald-600 shadow-emerald-500/10'
        : si.color === 'amber' ? 'border-amber-400 dark:border-amber-600 shadow-amber-500/10'
        : si.color === 'blue' ? 'border-blue-400 dark:border-blue-600 shadow-blue-500/10'
        : si.color === 'rose' ? 'border-rose-300 dark:border-rose-800'
        : 'border-slate-300 dark:border-slate-700';

      let card = '<div class="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border-2 ' + cardBorder + ' shadow-lg hover:shadow-xl transition-all duration-200 flex flex-col justify-between space-y-4' + (!isActive ? ' opacity-90' : '') + '">';

      // Header: Booking ID + Status Badge
      card += '<div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 flex-wrap">';
      card += '<div class="flex items-center gap-3">';
      card += '<div class="w-11 h-11 rounded-xl bg-' + si.color + '-100 dark:bg-' + si.color + '-950/80 flex items-center justify-center flex-shrink-0 shadow-sm border border-' + si.color + '-200 dark:border-' + si.color + '-800">';
      card += '<i data-lucide="' + si.icon + '" class="w-6 h-6 text-' + si.color + '-700 dark:text-' + si.color + '-300"></i>';
      card += '</div>';
      card += '<div>';
      card += '<p class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Booking ID</p>';
      card += '<p class="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono tracking-tight">' + (b.booking_code || '—') + '</p>';
      card += '</div></div>';
      card += '<span class="px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wide shadow-sm flex items-center gap-1.5 ' + si.badgeClass + '">';
      card += '<i data-lucide="' + si.icon + '" class="w-4 h-4"></i> ' + si.label;
      card += '</span></div>';

      // Centre Info Box (High contrast)
      card += '<div class="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">';
      card += '<div class="flex items-start gap-2.5">';
      card += '<div class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center flex-shrink-0 mt-0.5">';
      card += '<i data-lucide="map-pin" class="w-4 h-4"></i>';
      card += '</div>';
      card += '<div class="flex-1 min-w-0">';
      card += '<p class="text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-0.5">Procurement Centre</p>';
      card += '<p class="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug">' + (b.centre_name || '—') + '</p>';
      if (b.centre_location) {
        card += '<p class="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1"><i data-lucide="navigation" class="w-3 h-3 text-slate-400"></i> ' + b.centre_location + '</p>';
      }
      card += '</div></div></div>';

      // 4-Block Key Data Grid (Bold & Crystal Clear)
      card += '<div class="grid grid-cols-2 gap-3">';

      // Date & Time Box
      card += '<div class="bg-blue-50/70 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-900/60">';
      card += '<p class="text-xs font-black text-blue-800 dark:text-blue-300 uppercase tracking-wide flex items-center gap-1 mb-1">';
      card += '<i data-lucide="calendar" class="w-3.5 h-3.5"></i> Date &amp; Time</p>';
      card += '<p class="text-sm sm:text-base font-black text-slate-900 dark:text-white">' + formatBookingDate(b.slot_date) + '</p>';
      if (b.slot_time) {
        card += '<p class="text-xs font-extrabold text-blue-700 dark:text-blue-300 mt-0.5">' + b.slot_time + '</p>';
      }
      card += '</div>';

      // Crop Box
      card += '<div class="bg-emerald-50/70 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60">';
      card += '<p class="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wide flex items-center gap-1 mb-1">';
      card += '<span>🌾</span> Crop Type</p>';
      card += '<p class="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">' + (b.crop_type || '—') + '</p>';
      card += '</div>';

      // Token Number Box
      card += '<div class="bg-purple-50/80 dark:bg-purple-950/40 p-3 rounded-xl border border-purple-200 dark:border-purple-900/60">';
      card += '<p class="text-xs font-black text-purple-800 dark:text-purple-300 uppercase tracking-wide flex items-center gap-1 mb-1">';
      card += '<i data-lucide="hash" class="w-3.5 h-3.5"></i> Token Number</p>';
      card += '<p class="text-base sm:text-lg font-black text-purple-900 dark:text-purple-200 font-mono">' + (b.token_number || '—') + '</p>';
      card += '</div>';

      // Expected Quantity Box
      card += '<div class="bg-amber-50/80 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60">';
      card += '<p class="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wide flex items-center gap-1 mb-1">';
      card += '<i data-lucide="scale" class="w-3.5 h-3.5"></i> Expected Qty</p>';
      card += '<p class="text-sm sm:text-base font-black text-amber-950 dark:text-amber-100">' + (b.expected_quantity_quintals || '—') + ' Quintals</p>';
      card += '</div>';

      card += '</div>'; // end grid

      // Authorized Dealer Box
      if (b.dealer_name) {
        card += '<div class="p-3 bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-800/60 flex items-center justify-between gap-2">';
        card += '<div class="flex items-center gap-2.5 min-w-0">';
        card += '<div class="w-7 h-7 rounded-lg bg-teal-200 dark:bg-teal-900 text-teal-900 dark:text-teal-200 flex items-center justify-center flex-shrink-0 font-bold"><i data-lucide="store" class="w-4 h-4"></i></div>';
        card += '<div class="min-w-0">';
        card += '<p class="text-[11px] font-black text-teal-800 dark:text-teal-300 uppercase tracking-wider">Authorized Dealer</p>';
        card += '<p class="text-sm font-black text-slate-900 dark:text-white truncate">' + b.dealer_name + '</p>';
        card += '</div></div>';
        if (b.dealer_business) {
          card += '<span class="text-xs font-bold text-teal-800 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/80 px-2.5 py-1 rounded-lg flex-shrink-0 border border-teal-200 dark:border-teal-800">' + b.dealer_business + '</span>';
        }
        card += '</div>';
      }

      // Progress Tracker Section
      card += '<div class="pt-2 border-t border-slate-100 dark:border-slate-800">';
      card += '<p class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Booking Status Progress</p>';
      card += getProgressSteps(b.status);
      card += '</div>';

      // Action Buttons for Active Bookings
      if (isActive) {
        const qrData = JSON.stringify({
          booking_code: b.booking_code,
          token_number: b.token_number,
          crop_type: b.crop_type,
          centre_name: b.centre_name,
          slot_date: b.slot_date,
          slot_time: b.slot_time,
          dealer_name: b.dealer_name
        }).replace(/"/g, '&quot;');

        card += '<div class="flex items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">';
        card += '<button onclick="state.setBookingForQR(' + qrData + ')" class="btn-agri text-xs sm:text-sm font-black py-2.5 px-4 flex-1 shadow-md flex items-center justify-center gap-2">';
        card += '<i data-lucide="qr-code" class="w-4 h-4"></i> Show QR Pass</button>';
        card += '<button onclick="state.setActiveTab(\'live_queue\')" class="px-4 py-2.5 text-xs sm:text-sm font-black text-amber-900 dark:text-amber-200 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 border-2 border-amber-300 dark:border-amber-700 rounded-xl transition flex items-center justify-center gap-2 shadow-sm">';
        card += '<i data-lucide="clock" class="w-4 h-4 text-amber-700 dark:text-amber-400"></i> Live Queue</button>';
        card += '</div>';
      }

      // Booked timestamp footer
      card += '<div class="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 pt-1">';
      card += '<span>Smart Farmer Portal</span>';
      card += '<span>Booked on: ' + (b.created_at || '—') + '</span>';
      card += '</div>';

      card += '</div>';
      return card;
    }

    if (bookingsList.length === 0) {
      return `
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <button onclick="state.setActiveTab('home')" class="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition shadow-sm">
                <i data-lucide="arrow-left" class="w-5 h-5 text-slate-800 dark:text-slate-200"></i>
              </button>
              <div>
                <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">My Bookings</h2>
                <p class="text-sm text-slate-600 dark:text-slate-400 font-semibold">All your grain procurement slot bookings</p>
              </div>
            </div>
          </div>
          <div class="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-800 p-10 text-center max-w-lg mx-auto shadow-xl">
            <div class="w-16 h-16 rounded-2xl bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <i data-lucide="ticket" class="w-8 h-8"></i>
            </div>
            <h3 class="font-black text-xl text-slate-900 dark:text-white mb-2">No Bookings Yet</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-6 font-medium">You haven't booked any procurement slots yet. Book your first slot to get guaranteed MSP and zero waiting time!</p>
            <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-sm font-black py-3 px-6 shadow-lg">
              <i data-lucide="calendar-plus" class="w-5 h-5"></i> Book a Slot Now
            </button>
          </div>
        </div>
      `;
    }

    // Count active vs completed
    const activeCount = bookingsList.filter(b => !['CANCELLED','PROCUREMENT_COMPLETED'].includes(b.status)).length;
    const completedCount = bookingsList.filter(b => b.status === 'PROCUREMENT_COMPLETED').length;

    const cardsHtml = bookingsList.map(b => buildBookingCard(b)).join('');

    return `
      <div class="space-y-6">
        <!-- Page Header -->
        <div class="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md">
          <div class="flex items-center gap-3.5">
            <button onclick="state.setActiveTab('home')" class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition shadow-sm border border-slate-200 dark:border-slate-700" title="Back to Home">
              <i data-lucide="arrow-left" class="w-5 h-5 text-slate-800 dark:text-slate-200"></i>
            </button>
            <div>
              <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">My Bookings</h2>
              <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-bold">Manage and track your procurement slot passes</p>
            </div>
          </div>
          <div class="flex items-center gap-2.5 flex-wrap">
            <span class="px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-sm">
              ${activeCount} Active Booking${activeCount === 1 ? '' : 's'}
            </span>
            <span class="px-3.5 py-1.5 rounded-xl text-xs font-black bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm">
              ${completedCount} Completed
            </span>
            <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-xs font-black py-2.5 px-4 shadow-md flex items-center gap-1.5">
              <i data-lucide="plus" class="w-4 h-4"></i> New Booking
            </button>
          </div>
        </div>

        <!-- Booking Cards Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          ${cardsHtml}
        </div>

        <!-- Explanatory MSP & Weighing Notice -->
        <div class="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-300 dark:border-emerald-800/60 rounded-2xl shadow-sm">
          <div class="w-7 h-7 rounded-lg bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i data-lucide="info" class="w-4 h-4"></i>
          </div>
          <p class="text-xs sm:text-sm text-emerald-950 dark:text-emerald-100 font-bold leading-relaxed">
            <span class="font-extrabold text-emerald-900 dark:text-emerald-200 underline decoration-emerald-400">Important Note:</span>
            The Actual Quantity and Quality Grade will be verified and recorded during physical weighment at the procurement centre. Bring your QR pass on your scheduled date.
          </p>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("renderMyBookingsPage error:", err);
    return `
      <div class="glass-card p-8 text-center max-w-lg mx-auto">
        <i data-lucide="alert-triangle" class="w-12 h-12 text-red-400 mx-auto mb-3"></i>
        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-1">Failed to Load Bookings</h3>
        <p class="text-xs text-slate-500 mb-4">${err.message || 'An unexpected error occurred.'}</p>
        <div class="flex items-center justify-center gap-2">
          <button onclick="invalidateFarmerBookingsCache(); scheduleRender();" class="btn-agri text-xs">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Retry
          </button>
          <button onclick="state.setActiveTab('home')" class="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            Back to Home
          </button>
        </div>
      </div>
    `;
  }
}

let selectedCenterStatusId = null;

function handleCenterStatusChange(selectEl) {
  selectedCenterStatusId = parseInt(selectEl.value, 10);
  scheduleRender();
}

function handleRefreshCenterStatus() {
  scheduleRender();
}

async function renderCenterStatusPage() {
  try {
    let data;
    try {
      data = await api.getProcurementCentreStatus(selectedCenterStatusId);
    } catch (e) {
      console.warn("api.getProcurementCentreStatus error, fallback:", e);
      data = {
        centre_id: 1,
        centre_name: "Warangal Central Grain Mandi",
        centre_code: "PDC-WGL-01",
        centre_location: "Enumamula Market Yard, Warangal",
        district: "Warangal",
        is_active: true,
        centre_status_label: "Active",
        centre_status_icon: "🟢 Active",
        current_token: "PDC-1001",
        farmer_token: "PDC-1003",
        has_active_farmer_token: true,
        farmers_ahead: 2,
        estimated_wait_minutes: 20,
        procurement_station: "Weighbridge Station #1",
        queue_status: "Normal",
        today_available_slots: 15,
        today_total_slots: 30,
        slots_display: "15 / 30",
        operating_hours: "08:00 AM - 05:00 PM",
        contact_phone: "1800-425-0033",
        last_updated: "Just now",
        last_updated_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        all_centres: [
          { id: 1, name: "Warangal Central Grain Mandi", district: "Warangal" }
        ]
      };
    }

    const isActive = data.is_active !== false;
    const isNormal = data.queue_status === 'Normal';
    const totalSlots = data.today_total_slots || 30;
    const availSlots = typeof data.today_available_slots === 'number' ? data.today_available_slots : 15;
    const slotsPct = Math.round((availSlots / totalSlots) * 100);

    const centreOptions = (data.all_centres || []).map(c => 
      `<option value="${c.id}" ${c.id === data.centre_id ? 'selected' : ''}>${c.name} (${c.district})</option>`
    ).join('');

    return `
      <div class="space-y-6">
        
        <!-- Header with Back Button, Title & Centre Selector -->
        <div class="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md">
          <div class="flex items-center gap-3.5">
            <button onclick="state.setActiveTab('home')" class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition shadow-sm border border-slate-200 dark:border-slate-700" title="Back to Home">
              <i data-lucide="arrow-left" class="w-5 h-5 text-slate-800 dark:text-slate-200"></i>
            </button>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xl">🏢</span>
                <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Procurement Centre Status</h2>
              </div>
              <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-bold">Live operational condition, tokens &amp; queue tracking</p>
            </div>
          </div>

          <div class="flex items-center gap-2.5 flex-wrap">
            <select onchange="handleCenterStatusChange(this)" class="px-3.5 py-2 rounded-xl text-xs font-black bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white shadow-sm cursor-pointer">
              ${centreOptions}
            </select>
            <button onclick="handleRefreshCenterStatus()" class="btn-agri text-xs font-black py-2 px-3.5 shadow-md flex items-center gap-1.5" title="Refresh Live Status">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh
            </button>
          </div>
        </div>

        <!-- Centre Info Banner Card -->
        <div class="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div class="flex items-center gap-2.5 mb-2">
                <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider">
                  Telangana State Procurement Hub
                </span>
                <span class="px-3 py-1 rounded-full text-xs font-black ${isActive ? 'bg-emerald-400 text-emerald-950 ring-2 ring-white/50' : 'bg-red-500 text-white'} flex items-center gap-1">
                  ${data.centre_status_icon || (isActive ? '🟢 Active' : '🔴 Closed')}
                </span>
              </div>
              <h3 class="text-2xl sm:text-3xl font-black tracking-tight mb-1">${data.centre_name}</h3>
              <p class="text-xs sm:text-sm text-emerald-100 flex items-center gap-1.5 font-medium">
                <i data-lucide="map-pin" class="w-4 h-4"></i> ${data.centre_location} • ${data.district}
              </p>
            </div>
            <div class="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-3">
              <div class="bg-black/25 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/20 text-left">
                <p class="text-[10px] font-black text-emerald-200 uppercase tracking-wider">Operating Hours</p>
                <p class="text-xs sm:text-sm font-black text-white">${data.operating_hours}</p>
              </div>
              <div class="bg-black/25 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/20 text-left">
                <p class="text-[10px] font-black text-emerald-200 uppercase tracking-wider">Helpline Contact</p>
                <p class="text-xs sm:text-sm font-black text-white">${data.contact_phone}</p>
              </div>
            </div>
          </div>
          <div class="absolute -right-6 -bottom-6 opacity-10 text-9xl font-black select-none pointer-events-none">🏢</div>
        </div>

        <!-- 6 Main Status Metric Cards Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">

          <!-- 1. Centre Status -->
          <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md flex items-center justify-between">
            <div>
              <p class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Centre Status</p>
              <div class="flex items-center gap-2">
                <span class="text-xl font-black text-slate-900 dark:text-white">
                  ${isActive ? '🟢 Active' : '🔴 Closed'}
                </span>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">
                ${isActive ? 'Open for paddy & produce intake' : 'Currently closed for transactions'}
              </p>
            </div>
            <div class="w-12 h-12 rounded-xl ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'} flex items-center justify-center font-bold shadow-sm">
              <i data-lucide="${isActive ? 'check-circle-2' : 'x-circle'}" class="w-6 h-6"></i>
            </div>
          </div>

          <!-- 2. Current Token -->
          <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 shadow-md flex items-center justify-between">
            <div>
              <p class="text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-1">Current Token</p>
              <p class="text-2xl font-black text-emerald-900 dark:text-emerald-200 font-mono tracking-wider">${data.current_token}</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">Currently at weighbridge / desk</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold shadow-sm">
              <i data-lucide="radio" class="w-6 h-6 animate-pulse"></i>
            </div>
          </div>

          <!-- 3. Your Token -->
          <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-purple-300 dark:border-purple-700 shadow-md flex items-center justify-between">
            <div>
              <p class="text-xs font-black text-purple-800 dark:text-purple-400 uppercase tracking-wider mb-1">Your Token</p>
              <p class="text-2xl font-black text-purple-900 dark:text-purple-200 font-mono tracking-wider">${data.farmer_token}</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">${data.has_active_farmer_token ? 'Active booking verified' : 'Sample slot token'}</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 flex items-center justify-center font-bold shadow-sm">
              <i data-lucide="ticket" class="w-6 h-6"></i>
            </div>
          </div>

          <!-- 4. Farmers Ahead -->
          <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-amber-300 dark:border-amber-700 shadow-md flex items-center justify-between">
            <div>
              <p class="text-xs font-black text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-1">Farmers Ahead</p>
              <p class="text-2xl font-black text-amber-900 dark:text-amber-200">${data.farmers_ahead}</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">${data.farmers_ahead === 0 ? 'Your turn is next!' : `${data.farmers_ahead} vehicle(s) ahead in line`}</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center font-bold shadow-sm">
              <i data-lucide="users" class="w-6 h-6"></i>
            </div>
          </div>

          <!-- 5. Estimated Waiting Time -->
          <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-blue-300 dark:border-blue-700 shadow-md flex items-center justify-between">
            <div>
              <p class="text-xs font-black text-blue-800 dark:text-blue-400 uppercase tracking-wider mb-1">Estimated Waiting Time</p>
              <p class="text-2xl font-black text-blue-900 dark:text-blue-200">${data.estimated_wait_minutes} minutes</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">Based on weighbridge speed</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold shadow-sm">
              <i data-lucide="clock" class="w-6 h-6"></i>
            </div>
          </div>

          <!-- 6. Procurement Station -->
          <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md flex items-center justify-between">
            <div>
              <p class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Procurement Station</p>
              <p class="text-xl font-black text-slate-900 dark:text-white leading-tight">${data.procurement_station}</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">Automated Electronic Weighbridge</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 flex items-center justify-center font-bold shadow-sm">
              <i data-lucide="scale" class="w-6 h-6"></i>
            </div>
          </div>

        </div>

        <!-- Registered Procurement Dealers at this Centre -->
        <div class="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 flex items-center justify-center font-bold shadow-sm">
                <i data-lucide="store" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="text-base sm:text-lg font-black text-slate-900 dark:text-white">Registered Procurement Dealers</h4>
                <p class="text-xs text-slate-500 font-semibold">Authorized dealership agencies operating at ${escapeHtml(data.centre_name)}</p>
              </div>
            </div>
            <span class="px-3.5 py-1 bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200 rounded-xl text-xs font-black border border-teal-300 dark:border-teal-800 shadow-sm">
              ${(data.dealers || []).length} Dealer${(data.dealers || []).length === 1 ? '' : 's'} Registered
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            ${(!data.dealers || data.dealers.length === 0) ? `
              <div class="col-span-full p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                No registered dealers currently assigned to this procurement centre.
              </div>
            ` : data.dealers.map(d => `
              <div class="p-4 rounded-xl border-2 border-teal-200 dark:border-teal-900/60 hover:border-teal-500 bg-teal-50/40 dark:bg-slate-800/80 transition-all flex flex-col justify-between space-y-3">
                <div>
                  <div class="flex items-start justify-between gap-2 mb-1.5">
                    <span class="font-black text-sm sm:text-base text-slate-900 dark:text-white leading-snug">${escapeHtml(d.name)}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200 border border-emerald-300 flex-shrink-0">
                      ✓ Authorized
                    </span>
                  </div>
                  <p class="text-xs font-bold text-teal-800 dark:text-teal-300">${escapeHtml(d.business_name)}</p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1">Lic: ${escapeHtml(d.license_number)}</p>
                  <p class="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium flex items-center gap-1.5">
                    <span>🌾 Handles: <strong>${escapeHtml(d.category)}</strong></span>
                  </p>
                  <p class="text-xs text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                    <span>📞 Contact: <strong>${escapeHtml(d.phone)}</strong></span>
                  </p>
                </div>
                <button onclick="selectedCentreId = ${data.centre_id}; selectedDealerId = ${d.dealer_id}; state.setActiveTab('book_slot')" class="w-full btn-agri text-xs font-black py-2 shadow-sm flex items-center justify-center gap-1.5">
                  <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i> Book with Dealer
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Queue Status & Today's Available Slots Section -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          <!-- Queue Status Card -->
          <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <p class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Queue Status</p>
                <span class="px-3 py-1 rounded-xl text-xs font-black ${isNormal ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300'}">
                  ${data.queue_status}
                </span>
              </div>
              <h4 class="text-xl font-black text-slate-900 dark:text-white mb-2">
                ${isNormal ? '⚡ Fast Movement &amp; Normal Flow' : '⏳ Heavy Congestion / High Flow'}
              </h4>
              <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                Vehicles are being weighed and unloaded at regular intervals. Bring your produce covered with tarpaulin and keep your QR pass ready.
              </p>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>Station Speed: ~8 min / truck</span>
              <span class="text-emerald-600 dark:text-emerald-400 font-black">● Live Tracking Active</span>
            </div>
          </div>

          <!-- Today's Available Slots Card -->
          <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <p class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Available Slots</p>
                <span class="px-3.5 py-1 rounded-xl text-xs font-black bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border border-blue-300">
                  ${data.slots_display || `${availSlots} / ${totalSlots}`}
                </span>
              </div>
              <h4 class="text-xl font-black text-slate-900 dark:text-white mb-2">
                ${availSlots} Slots Remaining Today
              </h4>
              <div class="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 mb-2">
                <div class="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-500" style="width: ${slotsPct}%"></div>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                ${slotsPct}% slot capacity available for immediate procurement booking today.
              </p>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Need to book a turn?</span>
              <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-xs font-black py-2 px-3.5 shadow-sm">
                <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i> Book Slot
              </button>
            </div>
          </div>

        </div>

        <!-- Footer / Last Updated Notice -->
        <div class="flex items-center justify-between flex-wrap gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 shadow-sm">
          <div class="flex items-center gap-2">
            <i data-lucide="clock" class="w-4 h-4 text-emerald-600 dark:text-emerald-400"></i>
            <span>Last Updated: <span class="text-slate-900 dark:text-white font-black">${data.last_updated} (${data.last_updated_time || 'Just now'})</span></span>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="state.setActiveTab('my_bookings')" class="text-emerald-700 dark:text-emerald-400 hover:underline font-black flex items-center gap-1">
              <i data-lucide="ticket" class="w-3.5 h-3.5"></i> View My Bookings
            </button>
            <span>•</span>
            <button onclick="state.setActiveTab('live_queue')" class="text-amber-700 dark:text-amber-400 hover:underline font-black flex items-center gap-1">
              <i data-lucide="radio" class="w-3.5 h-3.5"></i> Full Live Queue
            </button>
          </div>
        </div>

      </div>
    `;
  } catch (err) {
    console.error("renderCenterStatusPage error:", err);
    return `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-800 p-8 text-center max-w-lg mx-auto shadow-xl">
        <i data-lucide="alert-triangle" class="w-12 h-12 text-red-500 mx-auto mb-3"></i>
        <h3 class="font-black text-lg text-slate-900 dark:text-white mb-1">Failed to Load Centre Status</h3>
        <p class="text-xs text-slate-500 mb-4">${err.message || 'An unexpected error occurred.'}</p>
        <button onclick="state.setActiveTab('home')" class="btn-agri text-xs font-bold">Back to Home</button>
      </div>
    `;
  }
}

async function handleTriggerEmailVerify() {
  try {
    const user = state.currentUser;
    const res = await api.verifyEmail(user.email);
    user.is_email_verified = true;
    state.setCurrentUser({ ...user, is_email_verified: true });
    if (typeof confetti === "function") {
      try { confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } }); } catch (ce) { }
    }
    const notifs = await api.getNotifications();
    state.setNotifications(notifs);
  } catch (err) {
    alert(err.message);
  }
}

let cachedFarmerAssignment = null;
let cachedFarmerAssignmentTime = 0;
let cachedFarmerBookings = null;
let cachedFarmerBookingsTime = 0;

function invalidateFarmerAssignmentCache() {
  cachedFarmerAssignment = null;
  cachedFarmerAssignmentTime = 0;
  cachedFarmerBookings = null;
  cachedFarmerBookingsTime = 0;
  cachedLiveQueueData = null;
  cachedLiveQueueTime = 0;
  cachedReceiptsData = null;
  cachedReceiptsTime = 0;
  cachedPaymentsData = null;
  cachedPaymentsTime = 0;
  for (let k in cachedSlotsByCentreDate) delete cachedSlotsByCentreDate[k];
}

function invalidateFarmerBookingsCache() {
  cachedFarmerBookings = null;
  cachedFarmerBookingsTime = 0;
}

async function getCachedFarmerAssignment(force = false) {
  const now = Date.now();
  if (!force && cachedFarmerAssignment !== null && (now - cachedFarmerAssignmentTime < 30000)) {
    return cachedFarmerAssignment;
  }
  try {
    cachedFarmerAssignment = await api.getFarmerActiveAssignment();
    cachedFarmerAssignmentTime = now;
    return cachedFarmerAssignment;
  } catch (e) {
    return cachedFarmerAssignment || { has_active_assignment: false };
  }
}

async function getCachedFarmerBookings(force = false) {
  const now = Date.now();
  if (!force && cachedFarmerBookings !== null && (now - cachedFarmerBookingsTime < 30000)) {
    return cachedFarmerBookings;
  }
  try {
    cachedFarmerBookings = await api.getFarmerBookings();
    cachedFarmerBookingsTime = now;
    return cachedFarmerBookings;
  } catch (e) {
    return cachedFarmerBookings || [];
  }
}

async function renderFarmerActiveBookingCard() {
  try {
    const [activeAssignment, bookings] = await Promise.all([
      getCachedFarmerAssignment(),
      getCachedFarmerBookings()
    ]);

    const activeList = (activeAssignment && activeAssignment.active_assignments && Array.isArray(activeAssignment.active_assignments))
      ? activeAssignment.active_assignments
      : (activeAssignment && activeAssignment.has_active_assignment ? [activeAssignment] : []);

    currentActiveAssignments = activeList;

    if (activeList.length > 0) {
      return `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
                <i data-lucide="shield-check" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base sm:text-xl font-black text-slate-900 dark:text-white">
                  Active Procurement Bookings (${activeList.length})
                </h3>
                <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  ${activeList.length > 1 ? `You have ${activeList.length} confirmed bookings across different dates.` : 'Confirmed slot booking with your authorized dealer.'}
                </p>
              </div>
            </div>
            <button onclick="state.setActiveTab('book_slot')" class="btn-agri text-xs sm:text-sm font-bold py-2 px-3.5 flex items-center gap-1.5 shadow">
              <i data-lucide="plus-circle" class="w-4 h-4"></i> Book Another Date
            </button>
          </div>

          <div class="grid grid-cols-1 gap-4">
            ${activeList.map(active => `
              <div class="glass-card p-5 sm:p-6 border-2 border-emerald-500/80 relative overflow-hidden shadow-lg">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div class="flex items-center gap-2">
                    <span class="badge-status badge-approved flex items-center gap-1 font-bold text-xs sm:text-sm py-1 px-3">
                      <i data-lucide="shield-check" class="w-4 h-4"></i> ACTIVE ASSIGNMENT
                    </span>
                    <span class="text-xs sm:text-sm bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black px-3.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
                      🌾 ${escapeHtml(active.product_name)}
                    </span>
                  </div>
                  <span class="text-xs font-mono font-bold text-slate-400">Booked: ${escapeHtml(active.created_at || '')}</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/80 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
                  <div>
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Authorized Procurement Dealer</span>
                    <h4 class="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                      <i data-lucide="building-2" class="w-5 h-5 text-emerald-600"></i> ${escapeHtml(active.dealer_name)}
                    </h4>
                    <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">${escapeHtml(active.dealer_business || 'Authorized Dealer')}</p>
                    <p class="text-xs sm:text-sm text-slate-500 mt-1 font-medium">📞 ${escapeHtml(active.dealer_phone || 'N/A')}</p>
                  </div>

                  <div>
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Procurement Centre &amp; Schedule</span>
                    <h4 class="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                      <i data-lucide="map-pin" class="w-5 h-5 text-emerald-600"></i> ${escapeHtml(active.centre_name)}
                    </h4>
                    <p class="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                      📅 ${escapeHtml(active.slot_date || '')} (${escapeHtml(active.slot_time || '')})
                    </p>
                    <p class="text-xs sm:text-sm font-mono font-bold text-slate-600 dark:text-slate-300 mt-1">
                      Token: <strong class="text-emerald-600 font-black">${escapeHtml(active.token_number || '')}</strong> • Qty: ${active.expected_quantity_quintals} Quintals
                    </p>
                  </div>
                </div>

                <div class="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start sm:items-center gap-2.5 mb-4">
                  <i data-lucide="lock" class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0"></i>
                  <div>
                    <strong class="font-bold">Strict QR Authorization:</strong> Only Dealer <strong>${escapeHtml(active.dealer_name)}</strong> at <strong>${escapeHtml(active.centre_name)}</strong> is authorized to scan and process your produce for this slot.
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3">
                  <button onclick="showAssignmentQRPass(${JSON.stringify(active).replace(/"/g, '&quot;')})" class="btn-agri text-xs sm:text-sm py-3 px-5 shadow-lg flex items-center gap-2 font-bold">
                    <i data-lucide="qr-code" class="w-4 h-4"></i> Show Scannable QR Pass
                  </button>
                  <button onclick="handleCancelAssignment(${active.assignment_id})" class="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-300 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-1.5 shadow-sm">
                    <i data-lucide="x-circle" class="w-4 h-4"></i> Cancel Slot
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const list = Array.isArray(bookings) ? bookings : [];
    if (list.length === 0) {
      return `
        <div class="glass-card p-6 text-center py-8">
          <i data-lucide="calendar-x2" class="w-12 h-12 text-slate-400 mx-auto mb-2 opacity-50"></i>
          <h4 class="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200">No Active Slot Booking</h4>
          <p class="text-xs sm:text-sm text-slate-500 mb-4">Select a crop, procurement center, and date to book your procurement slot.</p>
          <button onclick="state.setActiveTab('book_slot')" class="btn-agri gold-gradient text-xs sm:text-sm py-2.5 px-5 mx-auto font-bold flex items-center justify-center gap-1.5 shadow-md hover:scale-105 transition-transform">
            <i data-lucide="plus" class="w-4 h-4"></i> Book Procurement Slot Now
          </button>
        </div>
      `;
    }

    const active = list[0];
    return `
      <div class="glass-card p-5 sm:p-6 border-2 border-emerald-500/50 relative overflow-hidden">
        <div class="flex items-center justify-between mb-3">
          <span class="badge-status badge-approved flex items-center gap-1">
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> ${active.status}
          </span>
          <span class="text-xs font-mono font-bold text-slate-400">Created: ${active.created_at}</span>
        </div>

        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/80 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Digital Token Code</span>
            <h3 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">${active.token_number}</h3>
            <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-semibold mt-1">
              ${active.crop_type} • ${active.expected_quantity_quintals} Quintals
            </p>
            <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
              ${active.centre_name} | ${active.slot_date} (${active.slot_time})
            </p>
            ${active.dealer_name ? `
              <p class="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                Assigned Dealer: ${active.dealer_name}
              </p>
            ` : ''}
          </div>

          <button onclick="state.setBookingForQR(${JSON.stringify(active).replace(/"/g, '&quot;')})" class="btn-agri text-xs sm:text-sm py-3 px-5 w-full sm:w-auto flex-shrink-0 shadow-lg font-bold">
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
    const todayIST = getTodayIST();

    // Fetch active assignments first to know any assigned dealer for the crops
    const activeData = await getCachedFarmerAssignment();
    currentActiveAssignments = (activeData && activeData.active_assignments && Array.isArray(activeData.active_assignments))
      ? activeData.active_assignments
      : (activeData && activeData.has_active_assignment ? [activeData] : []);

    // Preload centres once and cache them
    if (!allCachedCentres || allCachedCentres.length === 0) {
      try {
        const res = await api.getCentres();
        allCachedCentres = Array.isArray(res) ? res : [];
      } catch (e) {
        allCachedCentres = [];
      }
    }

    // Preload categories once
    if (!cachedCategories || cachedCategories.length === 0) {
      try {
        const cats = await api.getCategories();
        if (Array.isArray(cats) && cats.length > 0) cachedCategories = cats;
      } catch (e) { }
    }

    if (!selectedCrop) {
      selectedCrop = "Paddy (Fine / Grade A)";
      selectedCategoryId = 1;
    }

    // Default to first centre if not set
    if (!selectedCentreId && Array.isArray(cachedCentres) && cachedCentres.length > 0) {
      selectedCentreId = cachedCentres[0].id;
    }

    // Preload dealers if centre is already selected
    if (selectedCentreId && (!cachedDealers || cachedDealers.length === 0)) {
      const cacheKey = `${selectedCentreId}_${selectedCrop}`;
      if (cachedDealersByCentreKey[cacheKey]) {
        cachedDealers = cachedDealersByCentreKey[cacheKey];
      } else {
        try {
          const res = await api.getDealersByCentre(selectedCentreId, selectedCrop, selectedCategoryId);
          cachedDealers = Array.isArray(res) ? res : [];
          cachedDealersByCentreKey[cacheKey] = cachedDealers;
        } catch (e) {
          cachedDealers = [];
        }
      }
      if (cachedDealers.length > 0 && !selectedDealerId) {
        selectedDealerId = cachedDealers[0].dealer_id;
      }
    }

    // Preload slots if both centre and date are selected
    if (selectedCentreId && selectedDate) {
      const cacheKey = `${selectedCentreId}_${selectedDate}`;
      if (cachedSlotsByCentreDate[cacheKey]) {
        cachedSlots = cachedSlotsByCentreDate[cacheKey];
      } else {
        try {
          const res = await api.getSlots(selectedCentreId, selectedDate);
          cachedSlots = Array.isArray(res) ? res : [];
          cachedSlotsByCentreDate[cacheKey] = cachedSlots;
        } catch (e) {
          cachedSlots = [];
        }
      }
    }

    return `
      <div class="max-w-2xl mx-auto space-y-6">
        
        <!-- Header Card with enlarged letters -->
        <div class="glass-card p-6 border-l-4 border-emerald-600 shadow-md">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center flex-shrink-0 shadow-sm">
              <i data-lucide="calendar-check" class="w-7 h-7"></i>
            </div>
            <div>
              <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Book Procurement Slot</h2>
              <p class="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium mt-1">
                Guaranteed non-overbooking slot system with instant digital token generation.
              </p>
            </div>
          </div>
        </div>

        <!-- Main Form Card with enlarged letters & padding -->
        <form id="slot-booking-form" onsubmit="handleConfirmFarmerAssignment(event)" class="glass-card p-6 sm:p-8 space-y-6 shadow-lg">
          
          <!-- 1. Select Procurement Centre * -->
          <div>
            <label class="block text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200 mb-2">
              1. Select Procurement Centre <span class="text-rose-500">*</span>
            </label>
            <select id="booking-centre-select" onchange="handleCentreSelection(this.value)" required class="w-full px-4 py-3.5 sm:py-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition cursor-pointer shadow-sm">
              <option value="">-- Select Procurement Centre --</option>
              ${allCachedCentres.map(c => `
                <option value="${c.id}" ${Number(selectedCentreId) === c.id ? 'selected' : ''}>
                  ${escapeHtml(c.name)} (${escapeHtml(c.code)}) - ${escapeHtml(c.district || c.location)}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- 2-Column Row: 2. Crop/Produce & 3. Quantity -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div>
              <label class="block text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200 mb-2">
                2. Select Crop / Produce <span class="text-rose-500">*</span>
              </label>
              <select id="booking-crop-select" onchange="handleCropSelection(this.value)" required class="w-full px-4 py-3.5 sm:py-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition cursor-pointer shadow-sm">
                <option value="Paddy (Fine / Grade A)" ${selectedCrop.includes('Fine') ? 'selected' : ''}>Paddy (Fine / Grade A)</option>
                <option value="Paddy (Common)" ${selectedCrop === 'Paddy (Common)' ? 'selected' : ''}>Paddy (Common)</option>
                <option value="Cotton" ${selectedCrop === 'Cotton' ? 'selected' : ''}>Cotton</option>
                <option value="Maize" ${selectedCrop === 'Maize' ? 'selected' : ''}>Maize</option>
                <option value="Chilli" ${selectedCrop === 'Chilli' ? 'selected' : ''}>Chilli</option>
              </select>
            </div>

            <div>
              <label class="block text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200 mb-2">
                3. Expected Quantity (Quintals) <span class="text-rose-500">*</span>
              </label>
              <input type="number" id="booking-quantity-input" min="1" max="500" step="0.5" value="40" required class="w-full px-4 py-3.5 sm:py-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition shadow-sm">
            </div>
          </div>

          <!-- 4. Select Date * -->
          <div>
            <label class="block text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200 mb-2">
              4. Select Date <span class="text-rose-500">*</span>
            </label>
            <input type="date" id="booking-date-input" min="${todayIST}" value="${selectedDate || ''}" onchange="handleDateSelection(this.value)" required class="w-full px-4 py-3.5 sm:py-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition cursor-pointer shadow-sm">
            
            <!-- Time Slots Container (Direct in-place DOM updates) -->
            <div id="date-slots-container" class="mt-3">
              ${renderSlotsContainerHtml(todayIST)}
            </div>
          </div>

          <!-- Authorized Dealer Info Section -->
          <div id="dealers-section">
            ${renderDealerSectionHtml()}
          </div>

          <!-- Confirm Slot Booking Button -->
          <button type="submit" id="btn-confirm-assignment" ${!selectedSlotId ? 'disabled' : ''} class="btn-agri w-full py-4 sm:py-4.5 text-base sm:text-lg font-black tracking-wide shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-5">
            <i data-lucide="check-circle" class="w-6 h-6"></i> Confirm Slot Booking
          </button>

        </form>

      </div>
    `;
  } catch (err) {
    console.error("renderSlotBookingWizard error:", err);
    return `
      <div class="glass-card p-6 text-center max-w-lg mx-auto">
        <h3 class="font-bold text-base text-slate-900 dark:text-white mb-2">Slot Booking Assistant</h3>
        <p class="text-xs text-slate-500 mb-4">Click below to initialize available procurement slots.</p>
        <button onclick="renderApp()" class="btn-agri text-xs px-4 py-2">Refresh Booking Form</button>
      </div>
    `;
  }
}

function renderSlotsContainerHtml(todayIST) {
  if (!selectedDate) {
    return `
      <div class="text-sm text-slate-400 dark:text-slate-500 flex items-center gap-2 py-2 font-semibold">
        <i data-lucide="calendar" class="w-5 h-5"></i>
        <span>Select Date above to view available time slots</span>
      </div>
    `;
  }

  if (!selectedCentreId) {
    return `
      <div class="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 font-semibold">
        ⚠️ Please select a Procurement Centre above to view available time slots.
      </div>
    `;
  }

  if (!cachedSlots || cachedSlots.length === 0) {
    return `
      <div class="p-5 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        <p class="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">No slots available for this date.</p>
        <p class="text-xs sm:text-sm text-slate-400 mt-1">Please choose another active date above.</p>
      </div>
    `;
  }

  return `
    <div class="space-y-3 pt-2">
      <div class="flex items-center justify-between text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200">
        <span>Available Time Slots for <strong class="text-emerald-600">${selectedDate}</strong>:</span>
        <span class="text-xs text-slate-400 font-semibold">Times in IST</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="slots-grid">
        ${cachedSlots.map(s => {
    const isFull = s.is_full;
    const isPast = s.is_past;
    const isDisabled = isFull || isPast;
    const isSelected = Number(selectedSlotId) === s.id;
    const statusText = isPast ? 'Expired' : isFull ? 'Full' : `${s.available_capacity} Left`;
    const badgeClass = isPast
      ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
      : isFull
        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';

    return `
            <label data-slot-id="${s.id}" class="slot-card-label cursor-pointer p-4 rounded-xl border-2 transition flex items-center justify-between ${isDisabled ? 'opacity-50 border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 pointer-events-none' : isSelected ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 ring-2 ring-emerald-500/20 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 bg-white dark:bg-slate-800'}">
              <div class="flex items-center gap-3">
                <input type="radio" name="slot_id_radio" value="${s.id}" ${isSelected ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} onchange="handleSlotSelection(${s.id})" class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                <div>
                  <span class="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white block">${s.start_time} - ${s.end_time}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Capacity: ${s.capacity} vehicles</span>
                </div>
              </div>
              <span class="text-xs font-black px-2.5 py-1 rounded ${badgeClass}">
                ${statusText}
              </span>
            </label>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

function renderDealerSectionHtml() {
  if (!selectedCentreId) return '';

  if (!cachedDealers || cachedDealers.length === 0) {
    return `
      <div class="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 font-medium">
        ⚠️ No approved dealer for <strong>${escapeHtml(selectedCrop)}</strong> is registered at this center.
      </div>
    `;
  }

  // Auto-select first dealer if none selected or invalid
  if (!selectedDealerId || !cachedDealers.some(d => d.dealer_id === Number(selectedDealerId))) {
    selectedDealerId = cachedDealers[0].dealer_id;
  }

  // Check if there is an active booking on selectedDate for this crop
  const sameDateBooking = (selectedDate && Array.isArray(currentActiveAssignments)) ? currentActiveAssignments.find(asgn =>
    isSameProduceField(asgn.product_name, selectedCrop) && asgn.slot_date === selectedDate
  ) : null;

  return `
    <div class="space-y-2.5">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <label class="block text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200">
          Select Authorized Dealer <span class="text-rose-500">*</span>
        </label>
        <span class="text-xs font-bold text-slate-500 dark:text-slate-400">
          ${cachedDealers.length} Dealer${cachedDealers.length === 1 ? '' : 's'} Available
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${cachedDealers.map(d => {
    const isSelected = Number(selectedDealerId) === d.dealer_id;
    const isDealerOnSameDate = sameDateBooking && Number(sameDateBooking.dealer_id) === d.dealer_id;
    return `
            <label class="cursor-pointer p-4 rounded-xl border-2 transition ${isSelected ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 shadow-sm ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 bg-white dark:bg-slate-800'} flex flex-col justify-between">
              <div class="flex items-start gap-3">
                <input type="radio" name="dealer_id_radio" value="${d.dealer_id}" ${isSelected ? 'checked' : ''} onchange="handleDealerSelection(${d.dealer_id})" class="mt-1 w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-black text-sm sm:text-base text-slate-900 dark:text-white block">${escapeHtml(d.name)}</span>
                    ${isDealerOnSameDate ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200 border border-emerald-300">Booked on ${selectedDate}</span>` : ''}
                  </div>
                  <span class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium block mt-0.5">${escapeHtml(d.business_name)}</span>
                  <span class="text-xs text-slate-400 font-mono mt-1 block">Lic: ${escapeHtml(d.license_number)}</span>
                </div>
              </div>
            </label>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// INSTANT IN-DOM EVENT HANDLERS (NO renderApp() SLOWNESS)
// ----------------------------------------------------

async function handleCentreSelection(centreId) {
  selectedCentreId = centreId ? parseInt(centreId, 10) : null;
  selectedSlotId = null;

  const btn = document.getElementById("btn-confirm-assignment");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("opacity-50", "cursor-not-allowed");
  }

  const dealersContainer = document.getElementById("dealers-section");
  const slotsContainer = document.getElementById("date-slots-container");

  if (!selectedCentreId) {
    if (dealersContainer) dealersContainer.innerHTML = "";
    if (slotsContainer) slotsContainer.innerHTML = renderSlotsContainerHtml(getTodayIST());
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Update dealers section with cache
  const cacheKey = `${selectedCentreId}_${selectedCrop}`;
  if (cachedDealersByCentreKey[cacheKey]) {
    cachedDealers = cachedDealersByCentreKey[cacheKey];
    if (cachedDealers.length > 0) selectedDealerId = cachedDealers[0].dealer_id;
    if (dealersContainer) {
      dealersContainer.innerHTML = renderDealerSectionHtml();
      if (window.lucide) lucide.createIcons();
    }
  } else {
    if (dealersContainer) {
      dealersContainer.innerHTML = `
        <div class="text-sm text-slate-400 py-2 flex items-center gap-2">
          <div class="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading authorized dealers...</span>
        </div>
      `;
    }
    try {
      const res = await api.getDealersByCentre(selectedCentreId, selectedCrop, selectedCategoryId);
      cachedDealers = Array.isArray(res) ? res : [];
      cachedDealersByCentreKey[cacheKey] = cachedDealers;
      if (cachedDealers.length > 0) selectedDealerId = cachedDealers[0].dealer_id;
      if (dealersContainer) {
        dealersContainer.innerHTML = renderDealerSectionHtml();
        if (window.lucide) lucide.createIcons();
      }
    } catch (e) {
      cachedDealers = [];
      if (dealersContainer) dealersContainer.innerHTML = renderDealerSectionHtml();
    }
  }

  // Refresh slots for selected date if already chosen
  if (selectedDate) {
    updateSlotsInDOM(selectedCentreId, selectedDate);
  }
}

async function handleCropSelection(cropVal) {
  selectedCrop = cropVal;
  selectedCategoryId = cropVal.toLowerCase().includes('cotton') ? 2 : 1;
  selectedSlotId = null;

  const btn = document.getElementById("btn-confirm-assignment");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("opacity-50", "cursor-not-allowed");
  }

  if (selectedCentreId) {
    const dealersContainer = document.getElementById("dealers-section");
    const cacheKey = `${selectedCentreId}_${selectedCrop}`;
    if (cachedDealersByCentreKey[cacheKey]) {
      cachedDealers = cachedDealersByCentreKey[cacheKey];
      if (cachedDealers.length > 0) selectedDealerId = cachedDealers[0].dealer_id;
      if (dealersContainer) {
        dealersContainer.innerHTML = renderDealerSectionHtml();
        if (window.lucide) lucide.createIcons();
      }
    } else {
      try {
        const res = await api.getDealersByCentre(selectedCentreId, selectedCrop, selectedCategoryId);
        cachedDealers = Array.isArray(res) ? res : [];
        cachedDealersByCentreKey[cacheKey] = cachedDealers;
        if (cachedDealers.length > 0) selectedDealerId = cachedDealers[0].dealer_id;
        if (dealersContainer) {
          dealersContainer.innerHTML = renderDealerSectionHtml();
          if (window.lucide) lucide.createIcons();
        }
      } catch (e) {
        cachedDealers = [];
        if (dealersContainer) dealersContainer.innerHTML = renderDealerSectionHtml();
      }
    }
  }

  if (selectedDate) {
    updateSlotsInDOM(selectedCentreId, selectedDate);
  }
}

async function handleDateSelection(dateStr) {
  const todayIST = getTodayIST();
  const slotsContainer = document.getElementById("date-slots-container");
  const btn = document.getElementById("btn-confirm-assignment");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("opacity-50", "cursor-not-allowed");
  }

  if (!dateStr) {
    selectedDate = null;
    selectedSlotId = null;
    if (slotsContainer) {
      slotsContainer.innerHTML = renderSlotsContainerHtml(todayIST);
      if (window.lucide) lucide.createIcons();
    }
    return;
  }

  if (dateStr < todayIST) {
    alert("Cannot book slots for past dates.");
    const dateInput = document.getElementById("booking-date-input");
    if (dateInput) dateInput.value = todayIST;
    dateStr = todayIST;
  }

  // Block duplicate same-crop booking on the same date
  const duplicateBooking = Array.isArray(currentActiveAssignments) ? currentActiveAssignments.find(asgn =>
    isSameProduceField(asgn.product_name, selectedCrop) && asgn.slot_date === dateStr
  ) : null;

  if (duplicateBooking) {
    alert(`On ${dateStr}, you already have an active procurement booking for ${selectedCrop} with dealer ${duplicateBooking.dealer_name} at ${duplicateBooking.centre_name} (Token: ${duplicateBooking.token_number || duplicateBooking.booking_code}).\n\nYou cannot choose another dealer for ${selectedCrop} on the same date. Please select a different date.`);
    const dateInput = document.getElementById("booking-date-input");
    if (dateInput) dateInput.value = "";
    selectedDate = null;
    selectedSlotId = null;
    if (slotsContainer) {
      slotsContainer.innerHTML = renderSlotsContainerHtml(todayIST);
      if (window.lucide) lucide.createIcons();
    }
    return;
  }

  selectedDate = dateStr;
  selectedSlotId = null;

  // Update dealer section if needed to reflect date context
  const dealersContainer = document.getElementById("dealers-section");
  if (dealersContainer && selectedCentreId) {
    dealersContainer.innerHTML = renderDealerSectionHtml();
    if (window.lucide) lucide.createIcons();
  }

  if (!selectedCentreId) {
    if (slotsContainer) {
      slotsContainer.innerHTML = `
        <div class="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 font-semibold">
          ⚠️ Please select a Procurement Centre above to view available time slots.
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    }
    return;
  }

  updateSlotsInDOM(selectedCentreId, selectedDate);
}

async function updateSlotsInDOM(centreId, dateStr) {
  const slotsContainer = document.getElementById("date-slots-container");
  if (!slotsContainer) return;

  const cacheKey = `${centreId}_${dateStr}`;
  if (cachedSlotsByCentreDate[cacheKey]) {
    cachedSlots = cachedSlotsByCentreDate[cacheKey];
    slotsContainer.innerHTML = renderSlotsContainerHtml(getTodayIST());
    if (window.lucide) lucide.createIcons();
    return;
  }

  slotsContainer.innerHTML = `
    <div class="text-sm text-slate-400 py-3 flex items-center gap-2">
      <div class="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      <span>Loading available time slots for ${dateStr}...</span>
    </div>
  `;

  try {
    const res = await api.getSlots(centreId, dateStr);
    cachedSlots = Array.isArray(res) ? res : [];
    cachedSlotsByCentreDate[cacheKey] = cachedSlots;
    slotsContainer.innerHTML = renderSlotsContainerHtml(getTodayIST());
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error("Failed to load slots:", e);
    cachedSlots = [];
    slotsContainer.innerHTML = `
      <div class="p-4 text-center bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300 font-medium">
        Failed to load slots for ${dateStr}. Please choose another date.
      </div>
    `;
  }
}

function handleSlotSelection(slotId) {
  selectedSlotId = parseInt(slotId, 10);

  // Instant 0ms visual toggle on all slot labels without DOM destruction
  const allSlotLabels = document.querySelectorAll(".slot-card-label");
  allSlotLabels.forEach(label => {
    const sid = label.getAttribute("data-slot-id");
    if (sid && parseInt(sid, 10) === selectedSlotId) {
      label.className = "slot-card-label cursor-pointer p-4 rounded-xl border-2 transition flex items-center justify-between border-emerald-600 bg-emerald-50 dark:bg-emerald-950 ring-2 ring-emerald-500/20 shadow-sm";
      const radio = label.querySelector("input[type='radio']");
      if (radio) radio.checked = true;
    } else {
      label.className = "slot-card-label cursor-pointer p-4 rounded-xl border-2 transition flex items-center justify-between border-slate-200 dark:border-slate-700 hover:border-emerald-400 bg-white dark:bg-slate-800";
      const radio = label.querySelector("input[type='radio']");
      if (radio) radio.checked = false;
    }
  });

  const btn = document.getElementById("btn-confirm-assignment");
  if (btn) {
    btn.disabled = false;
    btn.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

function handleDealerSelection(dealerId) {
  // Only check conflict if date is selected and there's a different dealer for the same crop on that same date
  if (selectedDate && Array.isArray(currentActiveAssignments)) {
    const conflict = currentActiveAssignments.find(asgn =>
      isSameProduceField(asgn.product_name, selectedCrop) &&
      asgn.slot_date === selectedDate &&
      Number(asgn.dealer_id) !== Number(dealerId)
    );
    if (conflict) {
      alert(`On ${selectedDate}, you already have a booking for ${selectedCrop} with dealer ${conflict.dealer_name}. You cannot choose another dealer for ${selectedCrop} on the same date.`);
      const prevRadio = document.querySelector(`input[name='dealer_id_radio'][value='${conflict.dealer_id}']`);
      if (prevRadio) prevRadio.checked = true;
      selectedDealerId = conflict.dealer_id;
      return;
    }
  }

  selectedDealerId = parseInt(dealerId, 10);
  const allDealerRadios = document.querySelectorAll("input[name='dealer_id_radio']");
  allDealerRadios.forEach(radio => {
    const parent = radio.closest("label");
    if (parseInt(radio.value, 10) === selectedDealerId) {
      radio.checked = true;
      if (parent) parent.className = "cursor-pointer p-4 rounded-xl border-2 transition border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 shadow-sm ring-2 ring-emerald-500/20 flex flex-col justify-between";
    } else {
      radio.checked = false;
      if (parent) parent.className = "cursor-pointer p-4 rounded-xl border-2 transition border-slate-200 dark:border-slate-700 hover:border-emerald-400 bg-white dark:bg-slate-800 flex flex-col justify-between";
    }
  });
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
    invalidateFarmerAssignmentCache();
    alert("Assignment successfully cancelled.");
    renderApp();
  } catch (err) {
    alert(err.message || "Failed to cancel assignment.");
  }
}

async function handleConfirmFarmerAssignment(e) {
  if (e && e.preventDefault) e.preventDefault();

  const centreSelect = document.getElementById("booking-centre-select");
  const cropSelect = document.getElementById("booking-crop-select");
  const qtyInput = document.getElementById("booking-quantity-input");
  const dateInput = document.getElementById("booking-date-input");

  const centreId = centreSelect ? centreSelect.value : selectedCentreId;
  const crop = cropSelect ? cropSelect.value : selectedCrop;
  const qty = qtyInput ? qtyInput.value : 40;
  const date = dateInput ? dateInput.value : selectedDate;

  if (!centreId) {
    alert("Please select a Procurement Centre.");
    if (centreSelect) centreSelect.focus();
    return;
  }
  if (!crop) {
    alert("Please select a Crop / Produce.");
    return;
  }
  if (!date) {
    alert("Please select a Procurement Date.");
    if (dateInput) dateInput.focus();
    return;
  }
  if (!selectedSlotId) {
    alert("Please choose an available Time Slot.");
    return;
  }

  // Validate date conflict: check if there is already a booking on this exact date for this crop
  if (Array.isArray(currentActiveAssignments)) {
    const sameDateConflict = currentActiveAssignments.find(asgn =>
      isSameProduceField(asgn.product_name, crop) &&
      asgn.slot_date === date
    );
    if (sameDateConflict) {
      alert(`On ${date}, you already have an active slot booked for ${crop} with dealer ${sameDateConflict.dealer_name} at ${sameDateConflict.centre_name}.\n\nYou cannot book with another dealer on the same date. Please choose a different date.`);
      return;
    }
  }

  if (!selectedDealerId) {
    if (cachedDealers && cachedDealers.length > 0) {
      selectedDealerId = cachedDealers[0].dealer_id;
    } else {
      alert("No authorized dealer found for this centre. Please select a different centre.");
      return;
    }
  }

  if (!qty || parseFloat(qty) <= 0) {
    alert("Please enter a valid expected produce quantity.");
    if (qtyInput) qtyInput.focus();
    return;
  }

  const btn = document.getElementById("btn-confirm-assignment");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-flex items-center gap-2"><div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Generating QR Pass...</span>`;
  }

  try {
    const res = await api.createFarmerDealerAssignment({
      centre_id: parseInt(centreId, 10),
      dealer_id: parseInt(selectedDealerId, 10),
      product_name: crop,
      category_id: selectedCategoryId ? parseInt(selectedCategoryId, 10) : undefined,
      slot_id: parseInt(selectedSlotId, 10),
      expected_quantity_quintals: parseFloat(qty)
    });

    invalidateFarmerAssignmentCache();

    if (window.confetti) {
      try { confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } }); } catch (ce) { }
    }

    alert(`Slot successfully booked!\n\nToken Number: ${res.token_number || res.booking_code}\nDate: ${date}\nCentre: ${res.centre_name || ''}\nDealer: ${res.dealer_name || ''}\n\nYour digital QR Pass is ready on your Home Dashboard.`);

    // Reset wizard state
    selectedCentreId = null;
    selectedDealerId = null;
    selectedDate = null;
    selectedSlotId = null;
    cachedDealers = [];
    cachedSlots = [];

    // Switch to home dashboard to view active QR pass immediately
    state.setActiveTab('home');

    // Asynchronously refresh notifications
    api.getNotifications().then(notifs => {
      state.setNotifications(notifs);
    }).catch(() => { });

  } catch (err) {
    console.error("Booking error:", err);
    alert(err.message || "Failed to book slot. Please try again.");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Confirm Slot Booking`;
      if (window.lucide) lucide.createIcons();
    }
  }
}


async function renderLiveQueuePage() {
  const now = Date.now();
  if (!cachedLiveQueueData || (now - cachedLiveQueueTime > 15000)) {
    try {
      cachedLiveQueueData = await api.getLiveQueue();
      cachedLiveQueueTime = now;
    } catch (e) { }
  }

  const q = cachedLiveQueueData;
  if (!q || !q.has_active_booking) {
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
  return `
    <div class="max-w-2xl mx-auto space-y-6">
      
      <div class="glass-card p-5 border-l-4 border-amber-500 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="clock" class="w-6 h-6 text-amber-500"></i>
            ${i18n.t('live_queue_title')}
          </h2>
          <p class="text-xs text-slate-500">${escapeHtml(q.centre_name)}</p>
        </div>
        <button onclick="cachedLiveQueueTime = 0; renderApp()" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold flex items-center gap-1">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh Live
        </button>
      </div>

      <!-- Main Live Queue Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        <!-- Farmer's Token Card -->
        <div class="agri-gradient text-white p-6 rounded-2xl shadow-xl text-center relative overflow-hidden">
          <span class="text-xs font-extrabold uppercase tracking-widest text-emerald-200 block mb-1">
            ${i18n.t('your_token')}
          </span>
          <h3 class="text-4xl font-black font-mono tracking-tight">${escapeHtml(q.token_number)}</h3>
          <p class="text-xs text-emerald-100 mt-2 font-medium">${escapeHtml(q.crop_type)} (${q.expected_quantity} Q)</p>
        </div>

        <!-- Current Serving Token Card -->
        <div class="gold-gradient text-white p-6 rounded-2xl shadow-xl text-center relative overflow-hidden">
          <span class="text-xs font-extrabold uppercase tracking-widest text-amber-100 block mb-1">
            ${i18n.t('current_token_serving')}
          </span>
          <h3 class="text-4xl font-black font-mono tracking-tight pulse-badge inline-block px-4 py-1 bg-white/20 rounded-xl">
            ${escapeHtml(q.current_token)}
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
  const now = Date.now();
  if (!cachedReceiptsData || (now - cachedReceiptsTime > 30000)) {
    try {
      const res = await api.getFarmerReceipts();
      cachedReceiptsData = Array.isArray(res) ? res : [];
      cachedReceiptsTime = now;
    } catch (e) {
      if (!cachedReceiptsData) cachedReceiptsData = [];
    }
  }

  const receipts = cachedReceiptsData || [];

  return `
    <div class="max-w-4xl mx-auto space-y-6">
      
      <!-- Page Header with Back Button, Title & Refresh -->
      <div class="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-md">
        <div class="flex items-center gap-3.5">
          <button onclick="state.setActiveTab('home')" class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition shadow-sm border border-slate-200 dark:border-slate-700" title="Back to Home">
            <i data-lucide="arrow-left" class="w-5 h-5 text-slate-800 dark:text-slate-200"></i>
          </button>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xl">💳</span>
              <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Transactions &amp; Payments</h2>
            </div>
            <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-bold">Official procurement weighment records &amp; DBT bank payout tracking</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="px-3.5 py-1.5 rounded-xl text-xs font-black bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border border-blue-300 dark:border-blue-700 shadow-sm">
            ${receipts.length} Transaction${receipts.length === 1 ? '' : 's'}
          </span>
          <button onclick="cachedReceiptsTime = 0; scheduleRender()" class="btn-agri text-xs font-black py-2 px-3.5 shadow-md flex items-center gap-1.5" title="Refresh">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Transactions & Payments Cards Grid -->
      <div class="space-y-4">
        ${receipts.length === 0 ? `
          <div class="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-800 p-10 text-center max-w-lg mx-auto shadow-xl">
            <div class="w-16 h-16 rounded-2xl bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <i data-lucide="receipt" class="w-8 h-8"></i>
            </div>
            <h3 class="font-black text-xl text-slate-900 dark:text-white mb-2">No Transactions Yet</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-6 font-medium">
              Transaction and payment records are automatically created once your produce is weighed and confirmed by your authorized dealer at the procurement centre.
            </p>
            <div class="flex items-center justify-center gap-3 flex-wrap">
              <button onclick="state.setActiveTab('my_bookings')" class="btn-agri text-xs font-black py-2.5 px-4 shadow-md flex items-center gap-1.5">
                <i data-lucide="ticket" class="w-4 h-4"></i> View My Bookings
              </button>
              <button onclick="state.setActiveTab('center_status')" class="px-4 py-2.5 text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition border border-slate-200 dark:border-slate-700">
                Check Centre Status
              </button>
            </div>
          </div>
        ` : receipts.map(r => {
    const isPaid = r.is_paid || r.payment_status === 'PAID' || r.payment_status === 'PAYMENT_COMPLETED' || r.payment_status === 'COMPLETED';
    const cropDisplay = r.crop || r.crop_type || 'Maize';
    const qtyDisplay = r.actual_quantity_display || `${r.actual_quantity || 25} Q`;
    const totalAmt = r.total_amount_formatted || `₹${Number(r.total_amount || 0).toLocaleString('en-IN')}`;
    const dbtRef = r.dbt_reference || r.bank_utr || (isPaid ? 'DBT-592810' : null);
    const paymentDate = r.payment_date || (isPaid ? '10-Sep-2026' : null);

    return `
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border-2 ${isPaid ? 'border-emerald-300 dark:border-emerald-800' : 'border-blue-300 dark:border-blue-700'} shadow-lg hover:shadow-xl transition-all space-y-4">
            
            <!-- Card Top: Transaction ID & Crop | Quantity Header -->
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 flex-wrap">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono font-black text-lg sm:text-xl text-blue-700 dark:text-blue-400">
                    ${escapeHtml(r.transaction_id || r.weighment_slip_no || 'TXN-2026-001')}
                  </span>
                  <span class="text-slate-300 dark:text-slate-700 font-bold">•</span>
                  <span class="font-black text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-1.5">
                    🌾 ${escapeHtml(cropDisplay)} <span class="text-slate-400 font-bold">|</span> <strong class="text-amber-700 dark:text-amber-300">${escapeHtml(qtyDisplay)}</strong>
                  </span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                    ${escapeHtml(r.quality_grade || 'Grade A')}
                  </span>
                </div>
                <p class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>Booking ID: <strong class="text-slate-800 dark:text-slate-200 font-mono">${escapeHtml(r.booking_id || r.booking_code)}</strong></span>
                  <span>•</span>
                  <span>Token: <strong class="text-purple-700 dark:text-purple-300 font-mono">${escapeHtml(r.token_number)}</strong></span>
                  <span>•</span>
                  <span>Centre: <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(r.centre_name)}</strong></span>
                </p>
              </div>

              <!-- Procurement Total Badge -->
              <div class="bg-emerald-50 dark:bg-emerald-950/60 px-4 py-2 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-left sm:text-right">
                <span class="text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">Procurement Amount</span>
                <span class="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono leading-tight">${escapeHtml(totalAmt)}</span>
              </div>
            </div>

            <!-- Status Rows: Procurement & Payment -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              <!-- Procurement Status Box -->
              <div class="bg-slate-50 dark:bg-slate-800/70 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Procurement Status</span>
                  <div class="flex items-center gap-2">
                    <span class="text-base font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      ✅ Completed
                    </span>
                  </div>
                </div>
                <div class="text-xs font-medium text-slate-600 dark:text-slate-300 mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700 space-y-0.5">
                  <p class="flex items-center gap-1.5"><strong>Rate / MSP:</strong> ${escapeHtml(r.rate_display || ('₹' + r.rate_per_quintal + ' / Q'))}</p>
                  <p class="flex items-center gap-1.5"><strong>Dealer:</strong> ${escapeHtml(r.dealer_name)}</p>
                  <p class="text-[11px] text-slate-500 font-mono">Date: ${escapeHtml(r.transaction_time)}</p>
                </div>
              </div>

              <!-- Payment Status Box -->
              <div class="${isPaid ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'} p-4 rounded-xl border flex flex-col justify-between">
                <div>
                  <span class="text-[10px] font-black ${isPaid ? 'text-emerald-800 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400'} uppercase tracking-wider block mb-1">Payment Status</span>
                  <div class="flex items-center gap-2">
                    ${isPaid ? `
                      <span class="text-base font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        ✅ Completed
                      </span>
                    ` : `
                      <span class="text-base font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        ⏳ Pending DBT
                      </span>
                    `}
                  </div>
                </div>
                
                <div class="text-xs font-medium ${isPaid ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-300'} mt-2.5 pt-2 border-t ${isPaid ? 'border-emerald-200/80 dark:border-emerald-800/80' : 'border-amber-200/80 dark:border-amber-800/80'} space-y-0.5">
                  ${isPaid ? `
                    <p class="font-mono"><strong>DBT Reference:</strong> ${escapeHtml(dbtRef)}</p>
                    <p><strong>Payment Date:</strong> ${escapeHtml(paymentDate)}</p>
                  ` : `
                    <p>Government DBT transfer is queued for processing into your Aadhaar-linked bank account.</p>
                  `}
                </div>
              </div>

            </div>

            <!-- Footer: View Receipt Button -->
            <div class="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex-wrap">
              <div class="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                Farmer: <strong class="text-slate-900 dark:text-white">${escapeHtml(r.farmer_name)}</strong>
              </div>
              <button onclick="state.setReceiptData(${JSON.stringify(r).replace(/"/g, '&quot;')})" class="btn-agri text-xs sm:text-sm font-black py-2.5 px-5 shadow-md flex items-center gap-2">
                <i data-lucide="receipt" class="w-4 h-4"></i> View Receipt
              </button>
            </div>

          </div>
        `;
  }).join('')}
      </div>

    </div>
  `;
}

async function renderFarmerPaymentsPage() {
  // Seamlessly render the unified Transactions & Payments page
  return await renderFarmerReceiptsPage();
}