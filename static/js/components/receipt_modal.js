function closeReceiptModal() {
  state.setReceiptData(null);
}

function renderReceiptModal() {
  const receipt = state.activeReceiptData;
  if (!receipt) return '';

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
        
        <button onclick="closeReceiptModal()" class="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>

        <div id="printable-receipt-area" class="p-2">
          
          <!-- Receipt Header -->
          <div class="text-center border-b pb-4 mb-4 border-slate-200 dark:border-slate-800">
            <span class="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-extrabold uppercase tracking-widest mb-1">
              Government Digital Procurement Receipt
            </span>
            <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">Smart Farmer Procurement System</h2>
            <p class="text-xs text-slate-500 font-mono mt-0.5">Weighment Slip #${receipt.weighment_slip_no || 'SLIP-9901'}</p>
          </div>

          <!-- Transaction Summary Grid -->
          <div class="grid grid-cols-2 gap-3 text-xs mb-4 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <span class="text-slate-400 font-medium block">Farmer Name</span>
              <span class="font-bold text-slate-900 dark:text-white">${receipt.farmer_name}</span>
            </div>
            <div>
              <span class="text-slate-400 font-medium block">Booking Code / Token</span>
              <span class="font-bold font-mono text-emerald-600">${receipt.token_number} (${receipt.booking_code})</span>
            </div>
            <div>
              <span class="text-slate-400 font-medium block">Procurement Centre</span>
              <span class="font-bold text-slate-800 dark:text-slate-200">${receipt.centre_name}</span>
            </div>
            <div>
              <span class="text-slate-400 font-medium block">Transaction Date</span>
              <span class="font-bold text-slate-800 dark:text-slate-200">${receipt.transaction_time}</span>
            </div>
          </div>

          <!-- Itemized Financial Breakdown -->
          <div class="border rounded-xl border-slate-200 dark:border-slate-700 overflow-hidden mb-4 text-xs">
            <table class="w-full text-left">
              <thead class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="p-2.5">Crop</th>
                  <th class="p-2.5">Grade</th>
                  <th class="p-2.5 text-right">Actual Qty</th>
                  <th class="p-2.5 text-right">Rate / Q</th>
                  <th class="p-2.5 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                <tr>
                  <td class="p-2.5 font-bold text-slate-900 dark:text-white">${receipt.crop_type}</td>
                  <td class="p-2.5"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">${receipt.quality_grade}</span></td>
                  <td class="p-2.5 text-right font-mono">${receipt.actual_quantity} Q</td>
                  <td class="p-2.5 text-right font-mono">₹${receipt.rate_per_quintal}</td>
                  <td class="p-2.5 text-right font-mono font-bold text-emerald-600">₹${receipt.total_amount?.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Payment Status Seal -->
          <div class="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 mb-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 block tracking-wider">Disbursement Status</span>
              <span class="text-xs font-black text-slate-900 dark:text-white">${receipt.payment_status}</span>
              ${receipt.bank_utr ? `<span class="text-[10px] text-slate-500 block font-mono">Bank UTR: ${receipt.bank_utr}</span>` : ''}
            </div>
            <div class="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-md">
              ✓
            </div>
          </div>

        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-2 mt-4">
          <button onclick="window.print()" class="btn-agri text-xs py-2.5 w-full">
            <i data-lucide="printer" class="w-4 h-4"></i> Print Digital Receipt
          </button>
          <button onclick="closeReceiptModal()" class="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs py-2.5 hover:bg-slate-300 dark:hover:bg-slate-700 transition">
            Close
          </button>
        </div>

      </div>
    </div>
  `;
}
