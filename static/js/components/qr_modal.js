function closeQRModal() {
  state.setBookingForQR(null);
}

function renderQRModal() {
  const booking = state.activeBookingForQR;
  if (!booking) return '';

  setTimeout(() => {
    const canvas = document.getElementById("qr-canvas");
    if (canvas && window.QRCode) {
      canvas.innerHTML = "";
      new QRCode(canvas, {
        text: booking.booking_code,
        width: 180,
        height: 180,
        colorDark: "#065f46",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }, 100);

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative overflow-hidden">
        
        <button onclick="closeQRModal()" class="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>

        <!-- Official Header -->
        <div class="mb-4">
          <span class="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
            Official Procurement Pass
          </span>
          <h3 class="text-xl font-black text-slate-900 dark:text-white leading-tight">
            ${booking.token_number}
          </h3>
          <p class="text-xs text-slate-500 font-mono mt-0.5">${booking.booking_code}</p>
        </div>

        <!-- Scannable QR Canvas Box -->
        <div class="p-4 bg-white rounded-2xl shadow-inner border border-slate-200 inline-block mb-4">
          <div id="qr-canvas" class="flex justify-center items-center"></div>
        </div>

        <!-- Booking Details Card -->
        <div class="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-left text-xs space-y-2 mb-5">
          <div class="flex justify-between">
            <span class="text-slate-500 font-medium">Procurement Centre:</span>
            <span class="font-bold text-slate-900 dark:text-slate-100">${booking.centre_name}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500 font-medium">Crop & Expected Qty:</span>
            <span class="font-bold text-emerald-700 dark:text-emerald-400">${booking.crop_type} (${booking.expected_quantity_quintals} Q)</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500 font-medium">Slot Time:</span>
            <span class="font-bold text-slate-900 dark:text-slate-100">${booking.slot_date} | ${booking.slot_time}</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-2">
          <button onclick="window.print()" class="btn-agri text-xs py-2.5 w-full">
            <i data-lucide="printer" class="w-4 h-4"></i> Print Pass
          </button>
          <button onclick="closeQRModal()" class="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs py-2.5 hover:bg-slate-300 dark:hover:bg-slate-700 transition">
            Close
          </button>
        </div>

      </div>
    </div>
  `;
}
