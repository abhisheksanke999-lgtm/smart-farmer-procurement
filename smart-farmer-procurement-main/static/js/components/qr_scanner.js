// Robust Dealer QR Code Scanner with Auto-Teardown, File Upload, and Manual Fallbacks

let activeScannerInstance = null;
let isScannerActive = false;

async function stopCameraScanner() {
  if (activeScannerInstance) {
    try {
      if (activeScannerInstance.isScanning) {
        await activeScannerInstance.stop();
      }
      activeScannerInstance.clear();
    } catch (e) {
      console.warn("Camera stop notice:", e);
    }
    activeScannerInstance = null;
  }
  isScannerActive = false;
  const statusEl = document.getElementById("camera-status-text");
  if (statusEl) statusEl.innerText = "Camera stopped. Click Start Camera or upload a QR image.";
  const ph = document.getElementById("camera-placeholder");
  if (ph) ph.style.display = "block";
}

async function startCameraScanner() {
  const readerEl = document.getElementById("reader");
  if (!readerEl) return;

  await stopCameraScanner();

  const statusEl = document.getElementById("camera-status-text");
  if (statusEl) statusEl.innerText = "Connecting to camera... please allow camera permission.";

  if (!window.Html5Qrcode) {
    if (statusEl) statusEl.innerText = "QR scanner library could not be loaded. Please use manual lookup or upload image.";
    return;
  }

  try {
    activeScannerInstance = new Html5Qrcode("reader");
    await activeScannerInstance.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        stopCameraScanner();
        validateScannedCode(decodedText);
      },
      () => {
        // Frame parse pass-through
      }
    );
    isScannerActive = true;
    const ph = document.getElementById("camera-placeholder");
    if (ph) ph.style.display = "none";
    if (statusEl) statusEl.innerText = "Camera Active • Align QR Code in frame";
  } catch (err) {
    console.warn("Camera start fallback:", err);
    if (statusEl) {
      statusEl.innerText = "Camera blocked by browser permissions or unavailable. Use image upload or 1-click test buttons below.";
    }
  }
}

async function handleQRImageUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  await stopCameraScanner();

  const statusEl = document.getElementById("camera-status-text");
  if (statusEl) statusEl.innerText = `Scanning ${file.name}...`;

  try {
    const scanner = new Html5Qrcode("reader");
    const decodedText = await scanner.scanFile(file, true);
    scanner.clear();
    validateScannedCode(decodedText);
  } catch (err) {
    if (statusEl) statusEl.innerText = "Could not detect QR code in this image. Please try another or enter manually.";
    alert("Could not detect a valid QR code in the uploaded image. Please enter the booking code manually.");
  }
}


function renderQRScannerModal() {
  if (state.activeTab !== 'scan_qr') {
    stopCameraScanner();
    return '';
  }

  // Attempt auto start once DOM renders
  setTimeout(() => {
    if (!isScannerActive && !activeScannerInstance) {
      startCameraScanner();
    }
  }, 250);

  const scannedResult = state.scannedQRResult;

  return `
    <div class="max-w-2xl mx-auto p-4 space-y-6">
      
      <!-- Top Navigation & Header -->
      <div class="flex items-center justify-between gap-3">
        <button onclick="navigateBack()" class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 shadow-sm transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
        </button>
        <span class="badge-status badge-approved text-xs">Approved Dealer Active</span>
      </div>

      <div class="glass-card p-5 border-l-4 border-emerald-600">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="qr-code" class="w-6 h-6 text-emerald-600"></i>
          Dealer QR Code Scanner & Verification
        </h2>
        <p class="text-xs text-slate-500 mt-1">Scan farmer's digital booking pass, upload pass screenshot, or enter booking code.</p>
      </div>

      <!-- Scanner Container -->
      <div class="glass-card p-6 text-center shadow-lg relative overflow-hidden">
        
        <div id="reader-wrapper" class="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-emerald-500/50 bg-slate-950 shadow-inner min-h-[260px] flex flex-col items-center justify-center relative">
          <div id="reader" class="w-full"></div>
          <div id="camera-placeholder" class="text-center p-6 text-slate-400 space-y-3">
            <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-emerald-400 shadow">
              <i data-lucide="camera" class="w-6 h-6"></i>
            </div>
            <p class="text-xs font-medium text-slate-300 max-w-xs mx-auto" id="camera-status-text">
              Connecting camera...
            </p>
          </div>
        </div>

        <!-- Camera Actions Bar -->
        <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onclick="startCameraScanner()" class="btn-agri text-xs py-2 px-4 shadow">
            <i data-lucide="video" class="w-4 h-4"></i> Start Camera
          </button>
          <button type="button" onclick="stopCameraScanner()" class="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition">
            <i data-lucide="video-off" class="w-4 h-4"></i> Stop Camera
          </button>
          <label class="px-4 py-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold rounded-xl text-xs hover:bg-emerald-200 transition cursor-pointer flex items-center gap-1.5 border border-emerald-300 dark:border-emerald-700 shadow-sm">
            <i data-lucide="image-plus" class="w-4 h-4"></i> Upload QR Image
            <input type="file" accept="image/*" onchange="handleQRImageUpload(event)" class="hidden">
          </label>
        </div>


        <!-- Manual Input Alternative -->
        <div class="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 max-w-md mx-auto">
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 text-left mb-1.5">
            Manual Booking Code / Token Lookup
          </label>
          <div class="flex gap-2">
            <input type="text" id="manual-code-input" placeholder="e.g. BOOK-8F72A91C or PDC-1042" class="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono">
            <button onclick="handleManualCodeSubmit()" class="btn-agri text-xs px-4 shadow">
              Validate
            </button>
          </div>
        </div>

      </div>

      <!-- Validation Result Box -->
      ${scannedResult ? `
        <div class="glass-card p-6 border-2 ${scannedResult.is_valid ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30' : 'border-red-500 bg-red-50/50 dark:bg-red-950/30'} animate-fade-in">
          
          <div class="flex items-center justify-between mb-4">
            <span class="badge-status ${scannedResult.is_valid ? 'badge-approved text-sm py-1.5 px-4' : 'badge-rejected text-sm py-1.5 px-4'}">
              ${scannedResult.message}
            </span>
            <span class="text-xs font-mono font-bold text-slate-500">${scannedResult.booking_code || ''}</span>
          </div>

          ${scannedResult.is_valid ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 mb-5 shadow-sm">
              <div>
                <span class="text-slate-400 block font-medium">Farmer Name</span>
                <span class="font-extrabold text-slate-900 dark:text-white text-sm">${scannedResult.farmer_name}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-medium">Digital Token</span>
                <span class="font-extrabold text-emerald-600 text-sm font-mono">${scannedResult.token_number}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-medium">Crop & Declared Quantity</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">${scannedResult.crop_type} (${scannedResult.expected_quantity_quintals} Quintals)</span>
              </div>
              <div>
                <span class="text-slate-400 block font-medium">Procurement Centre</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">${scannedResult.centre_name}</span>
              </div>
            </div>

            <!-- Start Procurement Button -->
            <button onclick="openProcurementForm('${scannedResult.booking_code}')" class="btn-agri w-full py-3 text-sm font-bold shadow-lg">
              <i data-lucide="scale" class="w-5 h-5"></i> Start Procurement Weighment & Entry
            </button>
          ` : `
            <p class="text-xs text-red-600 dark:text-red-400 font-medium">
              Please check the QR code or verify if the booking belongs to another procurement centre.
            </p>
          `}

        </div>
      ` : ''}

    </div>
  `;
}

async function validateScannedCode(code) {
  try {
    const res = await api.scanQRCode(code);
    state.setScannedQRResult(res);
    if (res.is_valid && window.confetti) {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    }
  } catch (err) {
    state.setScannedQRResult({ is_valid: false, message: err.message });
  }
}

function handleManualCodeSubmit() {
  const val = document.getElementById("manual-code-input")?.value?.trim();
  if (val) {
    validateScannedCode(val);
  }
}

function openProcurementForm(bookingCode) {
  const res = state.scannedQRResult;
  if (!res) return;
  stopCameraScanner();
  state.setBookingForQR(null);
  window.activeProcurementBooking = res;
  state.setActiveTab('process_procurement_form');
}
