// Enhanced Dealer QR Code Scanner with Real-Time "Processing..." Indicator & Unmistakable Next Farmer Actions

let activeScannerInstance = null;
let isScannerActive = false;
let autoProcurementTimer = null;
let autoProcurementCountdownTimer = null;

let autoProcurementData = {
  stage: 'idle', // 'verifying', 'weighing', 'submitting', 'completed', 'error'
  booking: null,
  currentWeight: 0,
  targetWeight: 40,
  qualityGrade: 'Grade A (Fine)',
  moisturePercent: '13.2%',
  ratePerQuintal: 2300,
  totalAmount: 92000,
  slipNo: '',
  countdown: 4,
  errorMessage: ''
};

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
  if (statusEl) statusEl.innerText = "Camera paused. Click Start Camera or choose a waiting farmer.";
  const ph = document.getElementById("camera-placeholder");
  if (ph) ph.style.display = "block";
  const overlay = document.getElementById("camera-processing-overlay");
  if (overlay) overlay.style.display = "none";
}

async function startCameraScanner() {
  const readerEl = document.getElementById("reader");
  if (!readerEl) return;

  await stopCameraScanner();

  const statusEl = document.getElementById("camera-status-text");
  if (statusEl) statusEl.innerText = "Connecting to camera... please allow camera permission.";

  if (!window.Html5Qrcode) {
    if (statusEl) statusEl.innerText = "QR scanner library not loaded. Use 1-Click Fast Scan or manual booking code lookup below.";
    return;
  }

  try {
    activeScannerInstance = new Html5Qrcode("reader");
    await activeScannerInstance.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        showCameraProcessingState("Scanned QR Code Detected! Verifying...");
        validateScannedCode(decodedText);
      },
      () => {
        // Frame parse pass-through
      }
    );
    isScannerActive = true;
    const ph = document.getElementById("camera-placeholder");
    if (ph) ph.style.display = "none";
    if (statusEl) statusEl.innerText = "Camera Active • Point camera at Farmer QR Pass";
  } catch (err) {
    console.warn("Camera start notice:", err);
    if (statusEl) {
      statusEl.innerText = "Camera unavailable. Use 1-Click Fast Scan below to instantly process waiting farmers.";
    }
  }
}

function showCameraProcessingState(msg = "Processing QR Pass...") {
  const overlay = document.getElementById("camera-processing-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    const titleEl = document.getElementById("camera-processing-title");
    if (titleEl) titleEl.innerText = msg;
  }
  const statusEl = document.getElementById("camera-status-text");
  if (statusEl) {
    statusEl.innerHTML = `<span class="text-amber-400 font-bold flex items-center justify-center gap-1.5"><span style="width:0.85rem;height:0.85rem;border:2px solid rgba(251,191,36,0.3);border-top-color:#fbbf24;border-radius:50%;animation:app-spin 0.6s linear infinite;display:inline-block;"></span> ${escapeHtml(msg)}</span>`;
  }
}

async function handleQRImageUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  showCameraProcessingState(`Scanning ${file.name}...`);

  try {
    const scanner = new Html5Qrcode("reader");
    const decodedText = await scanner.scanFile(file, true);
    scanner.clear();
    validateScannedCode(decodedText);
  } catch (err) {
    stopCameraScanner();
    const statusEl = document.getElementById("camera-status-text");
    if (statusEl) statusEl.innerText = "Could not detect QR code in this image. Please try another or enter manually.";
    alert("Could not detect a valid QR code in the uploaded image. Please enter the booking code manually.");
  }
}

async function renderQRScannerModal() {
  if (state.activeTab !== 'scan_qr') {
    stopCameraScanner();
    return '';
  }

  // Attempt auto start once DOM renders
  setTimeout(() => {
    if (!isScannerActive && !activeScannerInstance && state.activeTab === 'scan_qr') {
      startCameraScanner();
    }
  }, 250);

  const scannedResult = state.scannedQRResult;

  // Fetch active assigned farmers for instant 1-click test scanning
  let assignedFarmers = [];
  try {
    assignedFarmers = await api.getDealerAssignedFarmers();
  } catch (e) {
    assignedFarmers = [];
  }
  const activeFarmers = (assignedFarmers || []).filter(f => f.status === 'ACTIVE');

  return `
    <div class="max-w-2xl mx-auto p-4 space-y-6">
      
      <!-- Top Navigation & Next Farmer Header -->
      <div class="flex items-center justify-between gap-3">
        <button onclick="navigateBack()" class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 shadow-sm transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Dashboard
        </button>

        <div class="flex items-center gap-2">
          ${activeFarmers.length > 0 ? `
            <button onclick="validateScannedCode('${escapeHtml(activeFarmers[0].booking_code || activeFarmers[0].assignment_code)}')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs shadow-md transition flex items-center gap-1.5 animate-pulse">
              <span>➡️ Next Farmer in Queue</span>
            </button>
          ` : ''}
          <span class="badge-status badge-approved text-xs">⚡ Auto-Procure Active</span>
        </div>
      </div>

      <div class="glass-card p-5 border-l-4 border-emerald-600 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="qr-code" class="w-6 h-6 text-emerald-600"></i>
            Farmer QR Scanner & Weighbridge
          </h2>
          <p class="text-xs text-slate-500 mt-1">
            Scan pass to automatically weigh produce, issue slip, and advance to next farmer.
          </p>
        </div>
        <div class="text-right">
          <span class="px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full text-xs font-black">
            ${activeFarmers.length} Waiting
          </span>
        </div>
      </div>

      <!-- Scanner Container with Processing Overlay -->
      <div class="glass-card p-6 text-center shadow-lg relative overflow-hidden">
        
        <div id="reader-wrapper" class="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-emerald-500/50 bg-slate-950 shadow-inner min-h-[240px] flex flex-col items-center justify-center relative">
          
          <!-- Animated Processing Overlay -->
          <div id="camera-processing-overlay" class="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-20 flex flex-col items-center justify-center p-4 text-center space-y-3" style="display:none;">
            <div style="width:2.75rem;height:2.75rem;border:3px solid rgba(16,185,129,0.3);border-top-color:#10b981;border-radius:50%;animation:app-spin 0.6s linear infinite;"></div>
            <div id="camera-processing-title" class="text-white font-extrabold text-sm tracking-wide">Processing QR Pass...</div>
            <div class="text-xs text-emerald-300 font-medium">Validating digital token & farmer assignment</div>
          </div>

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
            <i data-lucide="video-off" class="w-4 h-4"></i> Pause Camera
          </button>
          <label class="px-4 py-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold rounded-xl text-xs hover:bg-emerald-200 transition cursor-pointer flex items-center gap-1.5 border border-emerald-300 dark:border-emerald-700 shadow-sm">
            <i data-lucide="image-plus" class="w-4 h-4"></i> Upload QR Image
            <input type="file" accept="image/*" onchange="handleQRImageUpload(event)" class="hidden">
          </label>
        </div>

        <!-- 1-Click Fast Scan for Active Assigned Farmers -->
        ${activeFarmers.length > 0 ? `
          <div class="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-left">
            <div class="flex items-center justify-between mb-2.5">
              <span class="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>
                Waiting Farmers in Queue (${activeFarmers.length}):
              </span>
              <span class="text-[10px] text-slate-400 font-semibold">1-Click Instant Scan</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${activeFarmers.map((f, idx) => `
                <button type="button" onclick="showCameraProcessingState('Processing ${escapeHtml(f.farmer_name)}...'); validateScannedCode('${escapeHtml(f.booking_code || f.assignment_code)}')" class="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800 text-left transition flex items-center justify-between group shadow-sm">
                  <div>
                    <div class="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1">
                      <span>🌾 ${escapeHtml(f.farmer_name)}</span>
                      ${idx === 0 ? '<span class="px-1.5 py-0.2 bg-amber-400 text-slate-950 text-[9px] font-black rounded">NEXT</span>' : ''}
                    </div>
                    <div class="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono font-bold">
                      ${escapeHtml(f.token_number || f.booking_code)} • ${f.expected_quantity_quintals} Q (${escapeHtml(f.product_name)})
                    </div>
                  </div>
                  <span class="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black group-hover:scale-105 transition flex items-center gap-1 shadow">
                    <i data-lucide="scan" class="w-3.5 h-3.5"></i> Scan Pass
                  </span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Manual Input Alternative -->
        <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 max-w-md mx-auto">
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 text-left mb-1.5">
            Manual Booking Code / Token Lookup
          </label>
          <div class="flex gap-2">
            <input type="text" id="manual-code-input" placeholder="e.g. PDC-1008 or BOOK-4F79F703" class="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono">
            <button onclick="showCameraProcessingState(); handleManualCodeSubmit();" class="btn-agri text-xs px-4 shadow font-bold">
              Validate &amp; Procure
            </button>
          </div>
        </div>

      </div>

      <!-- Scanned Error Box if invalid -->
      ${scannedResult && !scannedResult.is_valid ? `
        <div class="glass-card p-5 border-2 border-red-500 bg-red-50/50 dark:bg-red-950/30 animate-fade-in">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
              ✕
            </div>
            <div>
              <h4 class="font-bold text-red-700 dark:text-red-400 text-sm">QR Code Validation Notice</h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5">${escapeHtml(scannedResult.message)}</p>
            </div>
          </div>
        </div>
      ` : ''}

    </div>
  `;
}

async function validateScannedCode(code) {
  if (!code) return;
  showCameraProcessingState("Validating Farmer QR Pass...");

  try {
    const res = await api.scanQRCode(code.trim());
    state.setScannedQRResult(res);

    if (res.is_valid) {
      await stopCameraScanner();
      triggerAutomatedProcurement(res);
    } else {
      stopCameraScanner();
    }
  } catch (err) {
    stopCameraScanner();
    state.setScannedQRResult({ is_valid: false, message: err.message || "Failed to validate QR code" });
  }
}

function handleManualCodeSubmit() {
  const val = document.getElementById("manual-code-input")?.value?.trim();
  if (val) {
    validateScannedCode(val);
  }
}

// AUTOMATED PROCUREMENT PIPELINE
function triggerAutomatedProcurement(booking) {
  if (autoProcurementTimer) clearTimeout(autoProcurementTimer);
  if (autoProcurementCountdownTimer) clearInterval(autoProcurementCountdownTimer);

  const targetWeight = parseFloat(booking.expected_quantity_quintals || 40.0);
  const rate = 2300;
  const slipNo = `SLIP-${Math.floor(100000 + Math.random() * 900000)}`;
  const totalAmount = Math.round(targetWeight * rate * 100) / 100;

  autoProcurementData = {
    stage: 'verifying',
    booking: booking,
    currentWeight: 0,
    targetWeight: targetWeight,
    qualityGrade: 'Grade A (Fine)',
    moisturePercent: '13.2%',
    ratePerQuintal: rate,
    totalAmount: totalAmount,
    slipNo: slipNo,
    countdown: 4,
    errorMessage: ''
  };

  window.activeProcurementBooking = booking;
  state.setActiveTab('auto_procure');

  // Step 1 -> Step 2: Weighbridge Simulation (1.0s)
  autoProcurementTimer = setTimeout(() => {
    autoProcurementData.stage = 'weighing';
    animateWeighbridge();
  }, 1000);
}

function animateWeighbridge() {
  const target = autoProcurementData.targetWeight;
  const startTime = Date.now();
  const duration = 1400; // 1.4s animated dial up

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - (1 - progress) * (1 - progress);
    autoProcurementData.currentWeight = Math.round((target * eased) * 10) / 10;
    
    // Update live DOM weight display
    const weightDisplay = document.getElementById("auto-proc-weight");
    if (weightDisplay) {
      weightDisplay.innerText = `${autoProcurementData.currentWeight.toFixed(1)} Quintals`;
    }

    if (progress >= 1) {
      clearInterval(interval);
      autoProcurementData.currentWeight = target;
      // Step 2 -> Step 3: Submitting to Government Ledger & Processing
      autoProcurementData.stage = 'submitting';
      submitProcurementBackend();
    }
  }, 50);
}

async function submitProcurementBackend() {
  state.notify(); // Re-render step 3 state
  const bk = autoProcurementData.booking;
  const slipNo = autoProcurementData.slipNo;
  const actualQty = autoProcurementData.targetWeight;
  const grade = "Grade A";
  const rate = autoProcurementData.ratePerQuintal;

  try {
    const res = await api.processProcurement(bk.booking_code, actualQty, grade, rate, slipNo);
    
    // Step 4: Completed!
    autoProcurementData.stage = 'completed';
    autoProcurementData.countdown = 4;
    state.notify();

    if (window.confetti) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
    }

    // Refresh notifications in background
    try {
      const notifs = await api.getNotifications();
      state.setNotifications(notifs);
    } catch (e) {}

    // Start Auto Countdown to move to next farmer
    startNextFarmerCountdown();

  } catch (err) {
    autoProcurementData.stage = 'error';
    autoProcurementData.errorMessage = err.message || "Failed to process procurement with server.";
    state.notify();
  }
}

function startNextFarmerCountdown() {
  if (autoProcurementCountdownTimer) clearInterval(autoProcurementCountdownTimer);

  autoProcurementCountdownTimer = setInterval(() => {
    autoProcurementData.countdown -= 1;
    
    const countEl = document.getElementById("auto-proc-countdown");
    if (countEl) {
      countEl.innerText = `${autoProcurementData.countdown}`;
    }

    if (autoProcurementData.countdown <= 0) {
      clearInterval(autoProcurementCountdownTimer);
      autoProcurementCountdownTimer = null;
      moveToNextFarmer();
    }
  }, 1000);
}

function moveToNextFarmer() {
  if (autoProcurementTimer) clearTimeout(autoProcurementTimer);
  if (autoProcurementCountdownTimer) clearInterval(autoProcurementCountdownTimer);
  
  autoProcurementData.stage = 'idle';
  state.setScannedQRResult(null);
  window.activeProcurementBooking = null;
  state.setActiveTab('scan_qr');
}

function renderAutomatedProcurementScreen() {
  const data = autoProcurementData;
  const bk = data.booking;

  if (!bk) {
    state.setActiveTab('scan_qr');
    return '';
  }

  const isVerifying = data.stage === 'verifying';
  const isWeighing = data.stage === 'weighing';
  const isSubmitting = data.stage === 'submitting';
  const isCompleted = data.stage === 'completed';
  const isError = data.stage === 'error';

  return `
    <div class="max-w-2xl mx-auto p-4 space-y-6 animate-fade-in">
      
      <!-- Top Action Bar with Next Farmer Button -->
      <div class="flex items-center justify-between gap-3">
        <button onclick="moveToNextFarmer()" class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 shadow-sm transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Scanner
        </button>

        <!-- Dedicated Next Farmer Top Button -->
        <button onclick="moveToNextFarmer()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-md transition flex items-center gap-1.5">
          <span>➡️ Next Farmer</span>
        </button>
      </div>

      <!-- Farmer Identity Header Card -->
      <div class="glass-card p-5 border-l-4 border-emerald-500 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono">
              ${escapeHtml(bk.token_number || bk.booking_code)}
            </span>
            <span class="text-xs text-slate-400 font-semibold">${escapeHtml(bk.centre_name || 'Station Mandi')}</span>
          </div>
          <h2 class="text-xl font-black text-slate-900 dark:text-white mt-1">
            🌾 ${escapeHtml(bk.farmer_name)}
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Crop: <strong class="text-emerald-700 dark:text-emerald-400 font-bold">${escapeHtml(bk.crop_type)}</strong> • Declared Qty: <strong>${bk.expected_quantity_quintals} Quintals</strong>
          </p>
        </div>

        <div class="text-right sm:text-right w-full sm:w-auto">
          <span class="text-xs text-slate-400 block font-medium">Slip Number</span>
          <span class="font-mono font-extrabold text-sm text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg inline-block mt-0.5 border border-slate-200 dark:border-slate-700">
            ${data.slipNo}
          </span>
        </div>
      </div>

      <!-- 4-Step Animated Pipeline Progress Bar -->
      <div class="glass-card p-5 space-y-4">
        <h3 class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Automated Procurement Pipeline</h3>
        
        <div class="grid grid-cols-4 gap-2 text-center text-[11px] font-bold">
          
          <!-- Step 1 -->
          <div class="p-2.5 rounded-xl border transition ${isVerifying ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-900 dark:text-amber-200 animate-pulse' : 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-300'}">
            <div class="text-base mb-1">${isVerifying ? '⏳' : '✓'}</div>
            <div>1. Verify Pass</div>
          </div>

          <!-- Step 2 -->
          <div class="p-2.5 rounded-xl border transition ${isWeighing ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-900 dark:text-amber-200 animate-pulse' : (isSubmitting || isCompleted) ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'}">
            <div class="text-base mb-1">${isWeighing ? '⚖️' : (isSubmitting || isCompleted) ? '✓' : '2'}</div>
            <div>2. Weighbridge</div>
          </div>

          <!-- Step 3 -->
          <div class="p-2.5 rounded-xl border transition ${isSubmitting ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-900 dark:text-amber-200 animate-pulse' : isCompleted ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'}">
            <div class="text-base mb-1">${isSubmitting ? '⚙️' : isCompleted ? '✓' : '3'}</div>
            <div>3. Ledger Sync</div>
          </div>

          <!-- Step 4 -->
          <div class="p-2.5 rounded-xl border transition ${isCompleted ? 'bg-emerald-500 text-white border-emerald-600 shadow-md animate-bounce' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'}">
            <div class="text-base mb-1">${isCompleted ? '🎉' : '4'}</div>
            <div>4. Complete</div>
          </div>

        </div>
      </div>

      <!-- MAIN STAGE DISPLAY -->
      ${isCompleted ? `
        <!-- COMPLETED HERO CARD -->
        <div class="glass-card p-6 border-2 border-emerald-500 bg-gradient-to-b from-emerald-50/80 to-white dark:from-emerald-950/50 dark:to-slate-900 text-center space-y-5 shadow-2xl animate-fade-in">
          
          <div class="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto text-4xl shadow-xl animate-pulse">
            ✓
          </div>

          <div>
            <span class="badge-status badge-approved text-xs py-1.5 px-4 mb-2 inline-block">
              PROCUREMENT RECORDED SUCCESSFULLY
            </span>
            <h2 class="text-2xl font-black text-slate-900 dark:text-white">
              Procurement Completed for ${escapeHtml(bk.farmer_name)}!
            </h2>
            <p class="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Digital weighment slip issued and Direct Bank Transfer (DBT) payment queued for farmer.
            </p>
          </div>

          <!-- Transaction Summary Box -->
          <div class="bg-white dark:bg-slate-950 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-left text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 shadow-inner">
            <div>
              <span class="text-slate-400 block font-medium">Actual Weight</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-base">${data.targetWeight} Q</span>
            </div>
            <div>
              <span class="text-slate-400 block font-medium">Quality Grade</span>
              <span class="font-bold text-emerald-600 text-sm">${data.qualityGrade}</span>
            </div>
            <div>
              <span class="text-slate-400 block font-medium">MSP Rate</span>
              <span class="font-bold text-slate-800 dark:text-slate-200 text-sm">₹${data.ratePerQuintal}/Q</span>
            </div>
            <div>
              <span class="text-slate-400 block font-medium">Total Amount</span>
              <span class="font-black text-emerald-600 text-base font-mono">₹${data.totalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <!-- Large High-Visibility Next Farmer Action Area -->
          <div class="p-5 rounded-2xl bg-emerald-100/80 dark:bg-emerald-950/70 border-2 border-emerald-400 dark:border-emerald-600 space-y-3">
            <div class="flex items-center justify-center gap-3">
              <div class="w-10 h-10 rounded-full bg-emerald-600 text-white font-black text-base flex items-center justify-center shadow-lg">
                <span id="auto-proc-countdown">${data.countdown}</span>
              </div>
              <div class="text-left">
                <div class="font-black text-slate-900 dark:text-white text-sm">Moving to next farmer automatically in <span id="auto-proc-countdown-text">${data.countdown}s</span>...</div>
                <div class="text-xs text-slate-600 dark:text-slate-400">Scanner will open ready for next QR pass</div>
              </div>
            </div>

            <!-- Prominent Next Farmer Primary Action Button -->
            <button onclick="moveToNextFarmer()" class="btn-agri w-full py-4 text-sm font-black shadow-2xl flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white">
              <i data-lucide="arrow-right-circle" class="w-5 h-5"></i>
              <span>➡️ Scan Next Farmer Now (Skip Timer)</span>
            </button>
          </div>

        </div>
      ` : isError ? `
        <!-- ERROR CARD -->
        <div class="glass-card p-6 border-2 border-red-500 bg-red-50/50 dark:bg-red-950/30 text-center space-y-4">
          <div class="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-2xl mx-auto">
            ✕
          </div>
          <h3 class="text-lg font-bold text-red-700 dark:text-red-400">Procurement Processing Error</h3>
          <p class="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">${escapeHtml(data.errorMessage)}</p>
          <div class="flex justify-center gap-3 pt-2">
            <button onclick="submitProcurementBackend()" class="btn-agri text-xs py-2.5 px-4">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Retry Processing
            </button>
            <button onclick="moveToNextFarmer()" class="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5">
              <span>➡️ Next Farmer</span>
            </button>
          </div>
        </div>
      ` : `
        <!-- LIVE WEIGHBRIDGE & SENSING CARD -->
        <div class="glass-card p-6 text-center space-y-6 shadow-xl border border-emerald-500/30">
          
          <div class="space-y-1">
            <span class="badge-status badge-approved text-xs py-1 px-3">
              ${isVerifying ? 'Processing: Verifying Security Signature & Slot...' : isWeighing ? 'Processing: Automated Weighbridge Measurement Active...' : 'Processing: Submitting to Government Mandi Ledger...'}
            </span>
            <h3 class="text-lg font-black text-slate-900 dark:text-white pt-2">
              ${isVerifying ? 'Validating Digital Booking Token' : isWeighing ? 'Precision Weighbridge in Progress' : 'Finalizing Digital Weighment Slip'}
            </h3>
          </div>

          <!-- Digital Scale Display Box -->
          <div class="w-full max-w-sm mx-auto p-6 rounded-3xl bg-slate-950 border-4 border-emerald-500/40 shadow-2xl text-center space-y-3 relative overflow-hidden">
            <div class="absolute top-2 right-3 text-[10px] font-mono text-emerald-400/80 font-bold uppercase tracking-widest flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block"></span> SENSOR ONLINE
            </div>
            
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gross Produce Weight</div>
            
            <div id="auto-proc-weight" class="text-4xl sm:text-5xl font-black text-emerald-400 font-mono tracking-tight drop-shadow-[0_0_15px_rgba(52,211,153,0.4)]">
              ${data.currentWeight.toFixed(1)} Quintals
            </div>

            <div class="flex items-center justify-center gap-3 pt-2 text-[11px] font-medium text-slate-400 border-t border-slate-800">
              <span>Quality: <strong class="text-emerald-300">${data.qualityGrade}</strong></span>
              <span>•</span>
              <span>Moisture: <strong class="text-emerald-300">${data.moisturePercent}</strong></span>
            </div>
          </div>

          <!-- Live Progress Indicator -->
          <div class="max-w-sm mx-auto space-y-2">
            <div class="flex justify-between text-[11px] font-bold text-slate-500">
              <span class="flex items-center gap-1.5"><span style="width:0.75rem;height:0.75rem;border:2px solid #10b981;border-top-color:transparent;border-radius:50%;animation:app-spin 0.6s linear infinite;display:inline-block;"></span> Processing Weighment...</span>
              <span>MSP Rate: ₹${data.ratePerQuintal}/Q</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full ${isSubmitting ? 'w-full animate-pulse' : 'w-3/4 animate-pulse'}"></div>
            </div>
          </div>

          <!-- Direct Next Farmer Advance Option -->
          <div class="pt-2">
            <button onclick="moveToNextFarmer()" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold underline transition">
              ➡️ Skip to Next Farmer
            </button>
          </div>

        </div>
      `}

    </div>
  `;
}
