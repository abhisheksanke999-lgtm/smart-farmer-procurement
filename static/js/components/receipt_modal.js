function closeReceiptModal() {
  state.activeReceiptData = null;
  const c = document.getElementById("receipt-modal-container");
  if (c) {
    c.innerHTML = '';
  } else {
    state.setReceiptData(null);
  }
}

function renderReceiptModal() {
  const receipt = state.activeReceiptData;
  if (!receipt) return '';

  const txnId = receipt.transaction_id || receipt.weighment_slip_no || 'TXN-2026-001';
  const bookingId = receipt.booking_id || receipt.booking_code || 'BOOK-PDC1003';
  const tokenNo = receipt.token_number || 'PDC-1003';
  const farmerName = receipt.farmer_name || 'Vijaya Laxmi';
  const crop = receipt.crop || receipt.crop_type || 'Maize';
  const actualQty = receipt.actual_quantity_display || (receipt.actual_quantity ? `${receipt.actual_quantity} Q` : '25 Q');
  const rateDisplay = receipt.rate_display || (receipt.rate_per_quintal ? `₹${receipt.rate_per_quintal} / Q` : '₹2,320 / Q');
  const totalAmount = receipt.total_amount_formatted || (receipt.total_amount ? `₹${Number(receipt.total_amount).toLocaleString('en-IN')}` : '₹58,000');
  const dateTime = receipt.transaction_time || '09-Sep-2026, 03:30 PM';
  const centreName = receipt.centre_name || 'Warangal Central Grain Mandi';
  const dealerName = receipt.dealer_name || 'Sri Venkateswara Traders';
  const dealerBiz = receipt.dealer_business || '';
  const paymentStatus = receipt.payment_status || 'PAYMENT_PENDING';
  const isPaid = paymentStatus === 'PAID' || paymentStatus === 'COMPLETED';

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in" onclick="if(event.target === this) closeReceiptModal()">
      <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border-2 border-blue-400 dark:border-blue-600 relative overflow-hidden">
        
        <button onclick="closeReceiptModal()" class="absolute top-4 right-4 p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition shadow-sm" title="Close">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>

        <div id="printable-receipt-area" class="space-y-4">
          
          <!-- Header Banner -->
          <div class="text-center pb-3 border-b-2 border-dashed border-slate-200 dark:border-slate-800">
            <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 rounded-full text-[11px] font-extrabold uppercase tracking-wider mb-2 border border-blue-200 dark:border-blue-800">
              <span>🧾</span> Procurement Receipt
            </div>
            <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Smart Farmer Procurement System</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5">Government of Telangana • Agricultural Marketing Dept</p>
          </div>

          <!-- Transaction, Booking & Token Identifiers -->
          <div class="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-2 text-center">
            <div>
              <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Transaction ID</span>
              <span class="font-mono font-black text-xs sm:text-sm text-blue-700 dark:text-blue-400 block">${escapeHtml(txnId)}</span>
            </div>
            <div class="border-x border-slate-200 dark:border-slate-700">
              <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Booking ID</span>
              <span class="font-mono font-black text-xs sm:text-sm text-slate-800 dark:text-slate-200 block">${escapeHtml(bookingId)}</span>
            </div>
            <div>
              <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Token Number</span>
              <span class="font-mono font-black text-xs sm:text-sm text-purple-700 dark:text-purple-300 block">${escapeHtml(tokenNo)}</span>
            </div>
          </div>

          <!-- Farmer & Crop Information -->
          <div class="grid grid-cols-2 gap-3 text-xs bg-emerald-50/60 dark:bg-emerald-950/40 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
            <div>
              <span class="text-[10px] font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-wider block">Farmer Name</span>
              <span class="font-black text-sm text-slate-900 dark:text-white block mt-0.5">${escapeHtml(farmerName)}</span>
            </div>
            <div>
              <span class="text-[10px] font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-wider block">Crop &amp; Quality</span>
              <span class="font-black text-sm text-emerald-800 dark:text-emerald-300 block mt-0.5">🌾 ${escapeHtml(crop)}</span>
            </div>
          </div>

          <!-- Weighment & Financial Breakdown -->
          <div class="bg-amber-50/60 dark:bg-amber-950/40 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 grid grid-cols-3 gap-2 text-center">
            <div>
              <span class="text-[10px] font-black text-amber-900 dark:text-amber-400 uppercase tracking-wider block">Actual Quantity</span>
              <span class="font-black text-base sm:text-lg text-amber-950 dark:text-amber-100 block mt-0.5">${escapeHtml(actualQty)}</span>
            </div>
            <div class="border-x border-amber-200 dark:border-amber-900/60">
              <span class="text-[10px] font-black text-amber-900 dark:text-amber-400 uppercase tracking-wider block">Applicable Rate / MSP</span>
              <span class="font-black text-xs sm:text-sm text-slate-800 dark:text-slate-200 block mt-1">${escapeHtml(rateDisplay)}</span>
            </div>
            <div>
              <span class="text-[10px] font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-wider block">Total Amount</span>
              <span class="font-black font-mono text-base sm:text-lg text-emerald-700 dark:text-emerald-300 block mt-0.5">${escapeHtml(totalAmount)}</span>
            </div>
          </div>

          <!-- Centre, Dealer & Time Information -->
          <div class="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-slate-500 dark:text-slate-400">Date &amp; Time:</span>
              <span class="font-bold text-slate-900 dark:text-white">${escapeHtml(dateTime)}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-slate-500 dark:text-slate-400">Procurement Centre:</span>
              <span class="font-bold text-slate-900 dark:text-white">${escapeHtml(centreName)}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-slate-500 dark:text-slate-400">Dealer / Centre:</span>
              <span class="font-bold text-teal-700 dark:text-teal-300">${escapeHtml(dealerName)} ${dealerBiz ? `(${escapeHtml(dealerBiz)})` : ''}</span>
            </div>
          </div>

          <!-- Payment Status Seal -->
          <div class="flex items-center justify-between p-3.5 ${isPaid ? 'bg-emerald-100/80 border-emerald-300 text-emerald-900' : 'bg-amber-100/80 border-amber-300 text-amber-900'} rounded-2xl border">
            <div>
              <span class="text-[10px] uppercase font-black tracking-wider block">Payment Status</span>
              <span class="text-sm font-black">${escapeHtml(paymentStatus)}</span>
              ${receipt.bank_utr ? `<span class="text-[10px] block font-mono font-bold mt-0.5">Bank UTR: ${escapeHtml(receipt.bank_utr)}</span>` : ''}
            </div>
            <div class="px-3 py-1.5 rounded-xl ${isPaid ? 'bg-emerald-700 text-white' : 'bg-amber-700 text-white'} text-xs font-black uppercase tracking-wider shadow-sm">
              ${isPaid ? '✓ PAID' : 'PAYMENT_PENDING'}
            </div>
          </div>

        </div>

        <!-- Modal Action Buttons -->
        <div class="grid grid-cols-2 gap-3 mt-5">
          <button onclick="printReceiptSlip()" class="btn-agri text-xs font-black py-2.5 shadow-md flex items-center justify-center gap-1.5">
            <i data-lucide="printer" class="w-4 h-4"></i> Print Receipt
          </button>
          <button onclick="closeReceiptModal()" class="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black rounded-xl text-xs py-2.5 hover:bg-slate-300 dark:hover:bg-slate-700 transition">
            Close
          </button>
        </div>

      </div>
    </div>
  `;
}

function printReceiptSlip() {
  window.print();
}
