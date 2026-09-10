// App Initialization & Main Render Loop

let isRendering = false;
let pendingRender = false;
let renderDebounceTimer = null;
let renderRAF = null;

// Debounced render: batches rapid state changes into a single DOM update
function scheduleRender() {
  if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
  if (renderRAF) cancelAnimationFrame(renderRAF);
  renderDebounceTimer = setTimeout(() => {
    renderRAF = requestAnimationFrame(() => {
      renderApp();
    });
  }, 30);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Listen to language changes
  document.addEventListener("languageChanged", () => {
    scheduleRender();
  });

  // Subscribe state store to trigger debounced re-renders
  state.subscribe(() => {
    scheduleRender();
  });

  // 1. Immediately restore cached user session for 0ms instant display (never blank on refresh)
  const cachedUser = (typeof api !== 'undefined' && api.getCachedUser) ? api.getCachedUser() : null;
  if (cachedUser && api && api.token) {
    state.currentUser = cachedUser;
  }

  // 2. Enforce initial route based on hash or role
  enforceRouteSecurity();

  // 3. Render immediately so the user never sees a blank white screen
  await renderApp();

  // 4. Background revalidation silently without freezing the screen
  if (api && api.token) {
    api.getCurrentUser().then(user => {
      if (user) {
        // Set user without triggering notify to avoid double render
        state.currentUser = user;
        api.getNotifications().then(notifs => {
          state.notifications = notifs.notifications || [];
          state.unreadNotificationsCount = notifs.unread_count || 0;
          // Single batched render for both user + notifications
          scheduleRender();
          if (typeof updateNotificationBadgeUI === 'function') {
            updateNotificationBadgeUI();
          }
        }).catch(() => {
          scheduleRender();
        });
      } else {
        state.setCurrentUser(null);
      }
    }).catch(err => {
      console.warn("Background auth check error:", err);
    });
  } else {
    state.setCurrentUser(null);
  }
});

// Enforce strict route security on hash change and browser navigation
function enforceRouteSecurity() {
  const hash = window.location.hash.replace('#', '');
  if (!state.currentUser) {
    if (state.activeTab !== 'login' || hash !== 'login') {
      state.activeTab = 'login';
      if (window.location.hash !== '#login') {
        window.location.hash = '#login';
      }
    }
    return;
  }

  const allowed = (typeof ROLE_ALLOWED_TABS !== 'undefined' && ROLE_ALLOWED_TABS[state.currentUser.role]) || (state.currentUser.role === 'ADMIN' ? ['dashboard'] : ['home']);
  const defaultTab = state.currentUser.role === 'ADMIN' ? 'dashboard' : 'home';

  if (!hash || hash === 'login' || !allowed.includes(hash)) {
    // Attempted unauthorized or invalid route access
    window.location.hash = '#' + defaultTab;
    state.setActiveTab(defaultTab, false);
  } else {
    state.setActiveTab(hash, false);
  }
}

window.addEventListener("hashchange", enforceRouteSecurity);
window.addEventListener("popstate", enforceRouteSecurity);

function navigateBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    const fallback = state.currentUser?.role === 'ADMIN' ? 'dashboard' : 'home';
    state.setActiveTab(fallback);
  }
}

let lastRenderedLayout = null; // 'auth' | 'dashboard' — tracks if we need a full rebuild

async function renderApp() {
  if (isRendering) {
    pendingRender = true;
    return;
  }
  isRendering = true;

  try {
    const appRoot = document.getElementById("app");
    if (!appRoot) return;

    const user = state.currentUser;

    if (!user) {
      lastRenderedLayout = 'auth';
      appRoot.innerHTML = `
        ${renderHeader()}
        <div class="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 w-full min-h-[calc(100vh-70px)]">
          <main class="w-full ${authMode === 'register' && selectedRegisterRole === 'DEALER' ? 'max-w-xl' : 'max-w-lg'} my-auto transition-all duration-300">
            ${renderAuthModal()}
          </main>
        </div>
      `;
      setTimeout(() => {
        const em = document.getElementById("login-email");
        const pw = document.getElementById("login-password");
        if (em) em.value = "";
        if (pw) pw.value = "";
      }, 50);
    } else {
      // If switching from auth to dashboard layout, build the full shell first with a loading indicator
      const mainEl = document.getElementById("app-main-content");
      if (lastRenderedLayout !== 'dashboard' || !mainEl) {
        lastRenderedLayout = 'dashboard';
        appRoot.innerHTML = `
          ${renderHeader()}
          <main id="app-main-content" class="max-w-7xl mx-auto p-4 sm:p-6 mb-20 sm:mb-8">
            <div class="flex items-center justify-center py-16">
              <div class="text-center">
                <div style="width:2.5rem;height:2.5rem;border:3px solid rgba(5,150,105,0.2);border-top-color:#059669;border-radius:50%;animation:app-spin 0.7s linear infinite;margin:0 auto 0.75rem;"></div>
                <p class="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading...</p>
              </div>
            </div>
          </main>
          ${renderMobileBottomNav()}
          <div id="notification-drawer-container">
            ${renderNotificationDrawer()}
          </div>
          <div id="qr-modal-container">
            ${renderQRModal()}
          </div>
          <div id="receipt-modal-container">
            ${renderReceiptModal()}
          </div>
        `;
        // Initialize icons for the shell immediately
        if (window.lucide) {
          requestAnimationFrame(() => { try { lucide.createIcons(); } catch(e){} });
        }
      }

      // Now render the view content asynchronously — update only the main content area
      let mainContent = '';
      if (user.role === 'FARMER') {
        mainContent = await renderFarmerView();
      } else if (user.role === 'DEALER') {
        mainContent = await renderDealerView();
      } else if (user.role === 'ADMIN') {
        mainContent = await renderAdminView();
      }

      // Targeted update: only replace the main content, not the entire page
      const targetEl = document.getElementById("app-main-content");
      if (targetEl) {
        targetEl.innerHTML = mainContent;
      }

      // Update peripheral areas (navbar badge, modals) without full rebuild
      const headerEl = appRoot.querySelector('header');
      if (headerEl) {
        const newHeader = document.createElement('div');
        newHeader.innerHTML = renderHeader();
        const newHeaderContent = newHeader.querySelector('header');
        if (newHeaderContent) {
          headerEl.replaceWith(newHeaderContent);
        }
      }

      // Update modals
      const notifContainer = document.getElementById("notification-drawer-container");
      if (notifContainer) notifContainer.innerHTML = renderNotificationDrawer();
      const qrContainer = document.getElementById("qr-modal-container");
      if (qrContainer) qrContainer.innerHTML = renderQRModal();
      const receiptContainer = document.getElementById("receipt-modal-container");
      if (receiptContainer) receiptContainer.innerHTML = renderReceiptModal();

      // Update mobile nav (it's a fixed <nav> at the bottom)
      const mobileNavs = appRoot.querySelectorAll('nav.fixed.bottom-0');
      if (mobileNavs.length > 0 && typeof renderMobileBottomNav === 'function') {
        const newNav = document.createElement('div');
        newNav.innerHTML = renderMobileBottomNav();
        if (newNav.firstElementChild) {
          mobileNavs[0].replaceWith(newNav.firstElementChild);
        }
      }
    }

    // Re-initialize Lucide Icons & Theme UI
    if (window.lucide) {
      requestAnimationFrame(() => {
        try { lucide.createIcons(); } catch(e) {}
      });
    }
    if (typeof themeManager !== 'undefined') {
      themeManager.updateToggleUI();
    }
    enhancePasswordFields();
  } catch (err) {
    console.error("renderApp error:", err);
    const appRoot = document.getElementById("app");
    if (appRoot && (!appRoot.innerHTML || !appRoot.innerHTML.trim() || appRoot.querySelector('#app-loader'))) {
      appRoot.innerHTML = `
        ${typeof renderHeader === 'function' ? renderHeader() : ''}
        <div class="max-w-md mx-auto p-6 mt-12 text-center glass-card">
          <div class="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mx-auto mb-3 text-xl font-bold">🌾</div>
          <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-1">Procurement Portal Ready</h3>
          <p class="text-xs text-slate-500 mb-4">Click below to load your dashboard.</p>
          <button onclick="state.setActiveTab('home'); renderApp();" class="btn-agri text-xs px-5 py-2.5 mx-auto">
            Open Dashboard
          </button>
        </div>
      `;
      if (window.lucide) {
        try { lucide.createIcons(); } catch (le) {}
      }
    }
  } finally {
    isRendering = false;
    if (pendingRender) {
      pendingRender = false;
      // Use scheduleRender instead of direct call to prevent stack overflow
      scheduleRender();
    }
  }
}

let authMode = "login"; // "login" or "register"
let selectedLoginRole = "ADMIN"; // "ADMIN", "FARMER", or "DEALER"
let selectedRegisterRole = "FARMER";

function selectLoginRole(role) {
  selectedLoginRole = role;
  renderApp();
  setTimeout(() => {
    const em = document.getElementById("login-email");
    const pw = document.getElementById("login-password");
    if (em) em.value = "";
    if (pw) pw.value = "";
  }, 50);
}

// OTP Verification Modal State
let otpVerificationState = {
  active: false,
  email: "",
  name: "",
  secondsLeft: 300,
  attemptsLeft: 5,
  resendCooldown: 0,
  errorMessage: "",
  successMessage: "",
  isVerifying: false,
  isResending: false,
  enteredOtp: "",
  timerInterval: null,
  cooldownInterval: null
};

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let registrationCentres = [];
let loadingRegistrationCentres = false;
let registrationCategories = [];
let loadingRegistrationCategories = false;

async function loadRegistrationCentres() {
  if (registrationCentres.length > 0 || loadingRegistrationCentres) return;
  loadingRegistrationCentres = true;
  try {
    registrationCentres = await api.getPublicCentres();
  } catch (err) {
    console.error("Failed to load centres for registration:", err);
  } finally {
    loadingRegistrationCentres = false;
    renderApp();
  }
}

async function loadRegistrationCategories() {
  if (registrationCategories.length > 0 || loadingRegistrationCategories) return;
  loadingRegistrationCategories = true;
  try {
    registrationCategories = await api.getCategories();
  } catch (err) {
    console.error("Failed to load categories for registration:", err);
  } finally {
    loadingRegistrationCategories = false;
    renderApp();
  }
}

function toggleAuthMode(mode) {
  authMode = mode;
  otpVerificationState.active = false;
  if (otpVerificationState.timerInterval) clearInterval(otpVerificationState.timerInterval);
  if (otpVerificationState.cooldownInterval) clearInterval(otpVerificationState.cooldownInterval);
  if (mode === 'register') {
    if (registrationCategories.length === 0) loadRegistrationCategories();
    if (selectedRegisterRole === 'DEALER' && registrationCentres.length === 0) {
      loadRegistrationCentres();
    }
  }
  renderApp();
  setTimeout(() => {
    const em = document.getElementById("login-email");
    const pw = document.getElementById("login-password");
    if (em) em.value = "";
    if (pw) pw.value = "";
  }, 50);
}

function selectRegisterRole(role) {
  selectedRegisterRole = role;
  if (role === 'DEALER') {
    if (registrationCentres.length === 0) loadRegistrationCentres();
    if (registrationCategories.length === 0) loadRegistrationCategories();
  }
  renderApp();
}

function initiateOtpVerification(email, name, expiresInSeconds = 300, attemptsAllowed = 5) {
  if (otpVerificationState.timerInterval) clearInterval(otpVerificationState.timerInterval);
  if (otpVerificationState.cooldownInterval) clearInterval(otpVerificationState.cooldownInterval);

  otpVerificationState = {
    active: true,
    email: email,
    name: name,
    secondsLeft: expiresInSeconds,
    attemptsLeft: attemptsAllowed,
    resendCooldown: 60,
    errorMessage: "",
    successMessage: "",
    isVerifying: false,
    isResending: false,
    enteredOtp: "",
    timerInterval: null,
    cooldownInterval: null
  };

  // Live countdown timer (5 minutes)
  otpVerificationState.timerInterval = setInterval(() => {
    if (otpVerificationState.secondsLeft > 0) {
      otpVerificationState.secondsLeft -= 1;
      const el = document.getElementById("otp-timer-display");
      if (el) {
        el.innerText = formatTimer(otpVerificationState.secondsLeft);
        if (otpVerificationState.secondsLeft < 60) {
          el.className = "font-mono text-sm font-extrabold text-rose-600 dark:text-rose-400 animate-pulse";
        }
      }
    } else {
      clearInterval(otpVerificationState.timerInterval);
      otpVerificationState.errorMessage = i18n.t("otp_expired_msg");
      renderApp();
    }
  }, 1000);

  // 60s Cooldown timer for Resend button
  otpVerificationState.cooldownInterval = setInterval(() => {
    if (otpVerificationState.resendCooldown > 0) {
      otpVerificationState.resendCooldown -= 1;
      const btn = document.getElementById("btn-resend-otp");
      if (btn && !otpVerificationState.isResending) {
        if (otpVerificationState.resendCooldown > 0) {
          btn.innerHTML = `<i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i> <span>${i18n.t("otp_resend_wait")} (${otpVerificationState.resendCooldown}s)</span>`;
          btn.disabled = true;
        } else {
          btn.innerHTML = `<i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i> <span>${i18n.t("otp_resend_btn")}</span>`;
          btn.disabled = false;
        }
        if (window.lucide) lucide.createIcons();
      }
    }
  }, 1000);

  renderApp();

  setTimeout(() => {
    const inp = document.getElementById("otp-input");
    if (inp) inp.focus();
  }, 100);
}

function cancelOtpVerification() {
  if (otpVerificationState.timerInterval) clearInterval(otpVerificationState.timerInterval);
  if (otpVerificationState.cooldownInterval) clearInterval(otpVerificationState.cooldownInterval);
  otpVerificationState.active = false;
  authMode = "register";
  renderApp();
}

function handleOtpInput(input) {
  input.value = input.value.replace(/\D/g, '').slice(0, 6);
  otpVerificationState.enteredOtp = input.value;
  const btn = document.getElementById("btn-verify-otp");
  if (btn && otpVerificationState.secondsLeft > 0 && otpVerificationState.attemptsLeft > 0) {
    btn.disabled = input.value.length !== 6;
  }
}

function handleOtpSubmitForm(e) {
  if (e) e.preventDefault();
  submitOtpVerification();
}

async function submitOtpVerification() {
  const otpInput = document.getElementById("otp-input");
  const otp = (otpInput?.value || otpVerificationState.enteredOtp || "").trim();

  if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
    otpVerificationState.errorMessage = "Please enter the complete 6-digit numeric OTP.";
    renderApp();
    return;
  }

  otpVerificationState.isVerifying = true;
  otpVerificationState.errorMessage = "";
  renderApp();

  try {
    const res = await api.verifyOTP(otpVerificationState.email, otp);

    otpVerificationState.isVerifying = false;
    otpVerificationState.successMessage = res.message || "Registration verified successfully!";
    renderApp();

    // Trigger celebration confetti
    if (typeof confetti === "function") {
      try {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (ce) {}
    }

    if (otpVerificationState.timerInterval) clearInterval(otpVerificationState.timerInterval);
    if (otpVerificationState.cooldownInterval) clearInterval(otpVerificationState.cooldownInterval);

    // Save token and activate user session
    api.setToken(res.access_token);
    state.setCurrentUser(res.user);

    try {
      const notifs = await api.getNotifications();
      state.setNotifications(notifs);
    } catch (ne) {}

    setTimeout(() => {
      otpVerificationState.active = false;
      state.setActiveTab('home');
    }, 1200);

  } catch (err) {
    otpVerificationState.isVerifying = false;
    otpVerificationState.errorMessage = err.message || "Failed to verify OTP code.";
    if (otpVerificationState.attemptsLeft > 0) {
      otpVerificationState.attemptsLeft -= 1;
    }
    renderApp();
    setTimeout(() => {
      const inp = document.getElementById("otp-input");
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 100);
  }
}

async function handleResendOtp() {
  if (otpVerificationState.isResending || otpVerificationState.resendCooldown > 0) return;

  otpVerificationState.isResending = true;
  otpVerificationState.errorMessage = "";
  otpVerificationState.successMessage = "";
  renderApp();

  try {
    const res = await api.resendOTP(otpVerificationState.email);
    otpVerificationState.isResending = false;
    otpVerificationState.secondsLeft = res.expires_in_seconds || 300;
    otpVerificationState.attemptsLeft = res.attempts_left || 5;
    otpVerificationState.resendCooldown = 60;
    otpVerificationState.enteredOtp = "";
    otpVerificationState.successMessage = res.message || "A new 6-digit verification code has been sent to your email!";
    renderApp();
    setTimeout(() => {
      const inp = document.getElementById("otp-input");
      if (inp) {
        inp.value = "";
        inp.focus();
      }
    }, 100);
  } catch (err) {
    otpVerificationState.isResending = false;
    otpVerificationState.errorMessage = err.message || "Failed to resend OTP.";
    renderApp();
  }
}

function renderOtpVerificationCard() {
  const isExpired = otpVerificationState.secondsLeft <= 0;
  const isLocked = otpVerificationState.attemptsLeft <= 0;

  return `
    <div class="glass-card auth-highlight-card p-6 sm:p-9 shadow-2xl rounded-3xl animate-fade-in relative overflow-hidden">
      
      <!-- Top Decorative Glow -->
      <div class="absolute -right-8 -top-8 w-28 h-28 bg-emerald-500/15 rounded-full blur-xl pointer-events-none"></div>

      <!-- Icon & Header -->
      <div class="text-center mb-6">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-3xl mx-auto mb-3 shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-500/20">
          <i data-lucide="shield-check" class="w-9 h-9"></i>
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          ${i18n.t("otp_verification_title")}
        </h2>
        <p class="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium mt-1.5">
          ${i18n.t("otp_sent_to")}
        </p>

        <!-- Recipient Email Pill -->
        <div class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-full text-emerald-800 dark:text-emerald-300 font-bold text-sm sm:text-base mt-3 shadow-sm">
          <i data-lucide="mail" class="w-4 h-4"></i>
          <span class="font-mono">${escapeHtml(otpVerificationState.email)}</span>
        </div>
      </div>

      <!-- Timer & Attempts Status Bar -->
      <div class="flex items-center justify-between p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 mb-5 text-sm font-semibold">
        <div class="flex items-center gap-2">
          <i data-lucide="clock" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 ${!isExpired ? 'animate-pulse' : ''}"></i>
          <span class="text-slate-700 dark:text-slate-300">${i18n.t("otp_expires_in")}:</span>
          <span id="otp-timer-display" class="font-mono text-base font-black ${isExpired ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}">
            ${formatTimer(otpVerificationState.secondsLeft)}
          </span>
        </div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${otpVerificationState.attemptsLeft <= 2 ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300' : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700/80 dark:text-slate-200'} text-xs font-bold">
          <i data-lucide="shield-alert" class="w-3.5 h-3.5"></i>
          <span>${otpVerificationState.attemptsLeft} ${i18n.t("otp_attempts_left")}</span>
        </div>
      </div>

      <!-- Error Message Banner -->
      ${otpVerificationState.errorMessage ? `
        <div class="p-3.5 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-sm flex items-start gap-2 shadow-sm font-semibold">
          <i data-lucide="alert-circle" class="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"></i>
          <div class="flex-1">${escapeHtml(otpVerificationState.errorMessage)}</div>
        </div>
      ` : ''}

      <!-- Success Message Banner -->
      ${otpVerificationState.successMessage ? `
        <div class="p-3.5 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2 shadow-sm font-semibold">
          <i data-lucide="check-circle-2" class="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400"></i>
          <div class="flex-1">${escapeHtml(otpVerificationState.successMessage)}</div>
        </div>
      ` : ''}

      <!-- 6-Digit OTP Input Form -->
      <form onsubmit="handleOtpSubmitForm(event)" class="space-y-5">
        <div>
          <label class="block text-center font-extrabold text-slate-800 dark:text-slate-200 mb-2 text-sm sm:text-base uppercase tracking-wider">
            ${i18n.t("otp_enter_code")} <span class="text-rose-600 font-bold" title="Required">*</span>
          </label>
          <div class="flex justify-center">
            <input type="text"
                   id="otp-input"
                   maxlength="6"
                   pattern="[0-9]*"
                   inputmode="numeric"
                   autocomplete="one-time-code"
                   placeholder="------"
                   value="${otpVerificationState.enteredOtp || ''}"
                   oninput="handleOtpInput(this)"
                   ${isExpired || isLocked ? 'disabled' : ''}
                   class="w-72 text-center text-3xl sm:text-4xl font-mono font-black tracking-[0.4em] px-4 py-3.5 rounded-2xl border-2 border-emerald-500 dark:border-emerald-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-inner focus:outline-none focus:ring-4 focus:ring-emerald-500/25 transition disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800">
          </div>
          <p class="text-center text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
            Enter the exact 6 digits sent to your email
          </p>
        </div>

        <!-- Verify Button -->
        <button type="submit"
                id="btn-verify-otp"
                ${otpVerificationState.isVerifying || isExpired || isLocked ? 'disabled' : ''}
                class="btn-agri w-full py-4 text-base sm:text-lg font-black shadow-xl flex items-center justify-center gap-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition">
          ${otpVerificationState.isVerifying ? `
            <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Verifying OTP...</span>
          ` : `
            <i data-lucide="check" class="w-5 h-5"></i>
            <span>${i18n.t("otp_verify_btn")}</span>
          `}
        </button>
      </form>

      <!-- Bottom Actions: Resend & Cancel -->
      <div class="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-col items-center gap-3 text-sm">
        <button type="button"
                id="btn-resend-otp"
                onclick="handleResendOtp()"
                ${otpVerificationState.isResending || otpVerificationState.resendCooldown > 0 ? 'disabled' : ''}
                class="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition px-4 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
          <i data-lucide="rotate-cw" class="w-4 h-4 ${otpVerificationState.isResending ? 'animate-spin' : ''}"></i>
          <span>${otpVerificationState.resendCooldown > 0 ? `${i18n.t("otp_resend_wait")} (${otpVerificationState.resendCooldown}s)` : i18n.t("otp_resend_btn")}</span>
        </button>

        <button type="button"
                onclick="cancelOtpVerification()"
                class="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-sm font-bold flex items-center gap-1.5 transition">
          <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
          <span>${i18n.t("otp_change_email")}</span>
        </button>
      </div>

    </div>
  `;
}

function renderAuthModal() {
  if (otpVerificationState.active) {
    return renderOtpVerificationCard();
  }

  const lang = i18n.currentLang;

  return `
    <div class="glass-card auth-highlight-card p-6 sm:p-8 shadow-2xl rounded-3xl animate-fade-in relative">
      
      <!-- Logo & Title -->
      <div class="text-center mb-5">
        <div class="w-14 h-14 rounded-2xl agri-gradient text-white flex items-center justify-center font-bold text-2xl mx-auto mb-2.5 shadow-lg ring-4 ring-emerald-500/20">
          🌾
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          ${i18n.t("app_title")}
        </h2>
        <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium mt-1">${i18n.t("app_subtitle")}</p>
      </div>

      <!-- Login / Register Tab Toggle -->
      <div class="flex rounded-xl bg-slate-100 dark:bg-slate-800/90 p-1 mb-5 font-bold text-sm border border-slate-200 dark:border-slate-700">
        <button onclick="toggleAuthMode('login')" class="tab-toggle-btn flex-1 py-2.5 px-3 rounded-lg ${authMode === 'login' ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'} transition text-sm">
          Sign In
        </button>
        <button onclick="toggleAuthMode('register')" class="tab-toggle-btn flex-1 py-2.5 px-3 rounded-lg ${authMode === 'register' ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'} transition text-sm">
          New Registration
        </button>
      </div>

      ${authMode === 'login' ? `
        <!-- LOGIN FORM -->
        <form id="auth-login-form" onsubmit="handleAuthLoginSubmit(event)" class="space-y-4" autocomplete="off">
          
          <!-- Role Selection: ADMIN, FARMER, DEALER -->
          <div>
            <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
              Select Role: <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
            </label>
            <div class="grid grid-cols-3 gap-2.5 font-bold text-sm">
              <button type="button" id="role-btn-admin" onclick="selectLoginRole('ADMIN')" class="role-toggle-btn py-2.5 px-2 rounded-xl border-2 transition ${selectedLoginRole === 'ADMIN' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm ring-2 ring-emerald-500/20 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 font-bold'} flex items-center justify-center gap-1.5">
                🏛️ Admin
              </button>
              <button type="button" id="role-btn-farmer" onclick="selectLoginRole('FARMER')" class="role-toggle-btn py-2.5 px-2 rounded-xl border-2 transition ${selectedLoginRole === 'FARMER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm ring-2 ring-emerald-500/20 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 font-bold'} flex items-center justify-center gap-1.5">
                🌾 Farmer
              </button>
              <button type="button" id="role-btn-dealer" onclick="selectLoginRole('DEALER')" class="role-toggle-btn py-2.5 px-2 rounded-xl border-2 transition ${selectedLoginRole === 'DEALER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm ring-2 ring-emerald-500/20 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 font-bold'} flex items-center justify-center gap-1.5">
                🏢 Dealer
              </button>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
              Email Address <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
            </label>
            <input type="email" id="login-email" name="login_email" placeholder="Enter your registered email" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base mb-0">
                Password <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
              </label>
              <button type="button" onclick="handleForgotPassword()" class="text-xs sm:text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-bold transition">Forgot Password?</button>
            </div>
            <div class="relative flex items-center">
              <input type="password" id="login-password" name="login_password" placeholder="Enter your password" value="" required autocomplete="new-password" class="w-full pl-3.5 pr-11 py-2.5 sm:py-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition">
              <button type="button" id="toggle-login-password" onclick="togglePasswordVisibility('login-password', 'toggle-login-password')" aria-label="Show password" title="Show password" class="password-toggle-btn absolute right-2.5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition focus:outline-none flex items-center justify-center rounded-lg">
                <i data-lucide="eye" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <button id="btn-login-submit" type="submit" class="btn-agri w-full py-3 sm:py-3.5 text-base font-extrabold shadow-lg rounded-xl tracking-wide mt-2">
            Secure Login as ${selectedLoginRole}
          </button>
        </form>
      ` : `
        <!-- REGISTER FORM -->
        <form onsubmit="handleAuthRegisterSubmit(event)" class="space-y-4" autocomplete="off">
          
          <!-- Role Selection Pills -->
          <div>
            <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
              Registering As: <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
            </label>
            <div class="grid grid-cols-2 gap-2.5 font-bold text-sm">
              <button type="button" onclick="selectRegisterRole('FARMER')" class="role-toggle-btn py-2.5 px-3 rounded-xl border-2 transition text-sm ${selectedRegisterRole === 'FARMER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm ring-2 ring-emerald-500/20 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold'}">
                🌾 Farmer
              </button>
              <button type="button" onclick="selectRegisterRole('DEALER')" class="role-toggle-btn py-2.5 px-3 rounded-xl border-2 transition text-sm ${selectedRegisterRole === 'DEALER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm ring-2 ring-emerald-500/20 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold'}">
                🏢 Procurement Dealer
              </button>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
              Full Name <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
            </label>
            <input type="text" id="reg-name" placeholder="Enter Full Name" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
                Email Address <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
              </label>
              <input type="email" id="reg-email" placeholder="Enter email address" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
            </div>
            <div>
              <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
                Mobile Number <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
              </label>
              <input type="tel" id="reg-phone" placeholder="9876543210" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
            </div>
          </div>

          <div class="space-y-3.5">
            <div>
              <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
                Create Password <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
              </label>
              <div class="relative flex items-center">
                <input type="password" id="reg-password" placeholder="e.g. Farmer@123" value="" minlength="8" required autocomplete="off" oninput="handlePasswordInputUpdate()" class="w-full pl-3.5 pr-11 py-2.5 sm:py-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition">
                <button type="button" id="toggle-reg-password" onclick="togglePasswordVisibility('reg-password', 'toggle-reg-password')" aria-label="Show password" title="Show password" class="password-toggle-btn absolute right-2.5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition focus:outline-none flex items-center justify-center rounded-lg">
                  <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 text-sm sm:text-base">
                Confirm Password <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
              </label>
              <div class="relative flex items-center">
                <input type="password" id="reg-confirm-password" placeholder="Re-enter password" value="" minlength="8" required autocomplete="off" oninput="handlePasswordInputUpdate()" class="w-full pl-3.5 pr-11 py-2.5 sm:py-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition">
                <button type="button" id="toggle-reg-confirm-password" onclick="togglePasswordVisibility('reg-confirm-password', 'toggle-reg-confirm-password')" aria-label="Show password" title="Show password" class="password-toggle-btn absolute right-2.5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition focus:outline-none flex items-center justify-center rounded-lg">
                  <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <!-- Password Strength Bar (Hidden until password is typed) -->
            <div id="password-strength-container" class="space-y-1 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 hidden">
              <div class="flex justify-between items-center text-xs">
                <span class="text-slate-600 dark:text-slate-400 font-semibold">Password Strength:</span>
                <span id="password-strength-label" class="font-black text-xs text-slate-400 dark:text-slate-500">—</span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div id="password-strength-bar" class="h-full w-0 bg-transparent transition-all duration-300"></div>
              </div>
            </div>

            <!-- Requirement Checklist -->
            <div class="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 font-medium">
              <div id="req-min-len" class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i> Minimum 8 characters
              </div>
              <div id="req-upper" class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i> At least 1 uppercase letter (A–Z)
              </div>
              <div id="req-lower" class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i> At least 1 lowercase letter (a–z)
              </div>
              <div id="req-num" class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i> At least 1 number (0–9)
              </div>
              <div id="req-special" class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i> At least 1 special character (@, #, $, %, etc.)
              </div>
              <div id="req-match" class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i> Passwords match
              </div>
            </div>
          </div>

          ${selectedRegisterRole === 'DEALER' ? `
            <div class="p-3.5 sm:p-4 bg-amber-50/80 dark:bg-amber-950/40 rounded-2xl border-2 border-amber-300 dark:border-amber-800 space-y-3">
              <span class="font-extrabold text-amber-950 dark:text-amber-200 block text-sm sm:text-base">🏢 Dealer Business &amp; Centre Details:</span>
              <div>
                <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm sm:text-base">
                  Business Name <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
                </label>
                <input type="text" id="reg-biz-name" placeholder="Business Name (e.g. Sri Venkateswara Traders)" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
              </div>
              <div>
                <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm sm:text-base">
                  Mandatory Product Category <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
                </label>
                <select id="reg-dealer-category" required class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-bold text-emerald-800 dark:text-emerald-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">-- Select Product Category (Paddy, Cotton) --</option>
                  ${registrationCategories.map(cat => `
                    <option value="${cat.id}">${cat.name === 'Paddy' ? '🌾' : '☁️'} ${escapeHtml(cat.name)} - ${escapeHtml(cat.description || '')}</option>
                  `).join('')}
                </select>
                ${registrationCategories.length === 0 ? `<p class="text-xs text-amber-600 mt-1">Loading product categories...</p>` : ''}
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm sm:text-base">
                    Trade License No <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
                  </label>
                  <input type="text" id="reg-license" placeholder="e.g. LIC-2026-901" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                </div>
                <div>
                  <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm sm:text-base">
                    GSTIN / ID <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
                  </label>
                  <input type="text" id="reg-gstin" placeholder="GSTIN Number" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-900 uppercase font-mono font-bold text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                </div>
              </div>
              <div>
                <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm sm:text-base">
                  Assigned Procurement Center <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
                </label>
                <select id="reg-dealer-centre" required class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-bold text-emerald-800 dark:text-emerald-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">-- Select Mandatory Procurement Center --</option>
                  ${registrationCentres.map(c => `
                    <option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)}) - ${escapeHtml(c.district || '')}</option>
                  `).join('')}
                </select>
                ${registrationCentres.length === 0 ? `<p class="text-xs text-amber-600 mt-1">Loading procurement centers...</p>` : ''}
              </div>
              <div>
                <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm sm:text-base">
                  Business / Office Address <span class="required-star" style="color: #ef4444; font-size: 1.15rem; font-weight: 900; line-height: 1; margin-left: 3px;">*</span>
                </label>
                <input type="text" id="reg-dealer-address" placeholder="e.g. Shop #4, APMC Market Yard, Bhimavaram" value="" required autocomplete="off" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
              </div>
            </div>
          ` : ''}

          <button type="submit" id="btn-submit-reg" disabled class="btn-agri w-full py-3 sm:py-3.5 text-base font-extrabold shadow-lg rounded-xl opacity-50 cursor-not-allowed transition mt-2">
            Send Email OTP &amp; Verify
          </button>
        </form>
      `}

    </div>
  `;
}

function checkPasswordRules(pwd, confirmPwd) {
  if (!pwd || pwd.length === 0) {
    return {
      hasMinLen: false,
      hasUpper: false,
      hasLower: false,
      hasNum: false,
      hasSpecial: false,
      matches: false,
      strength: "—",
      color: "text-slate-400 dark:text-slate-500",
      barColor: "bg-transparent",
      barWidth: "0%",
      allValid: false
    };
  }

  const hasMinLen = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNum = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  const matches = !!confirmPwd && pwd === confirmPwd;

  let score = 0;
  if (hasMinLen) score++;
  if (hasUpper) score++;
  if (hasLower) score++;
  if (hasNum) score++;
  if (hasSpecial) score++;

  let strength = "Weak";
  let color = "text-rose-600 dark:text-rose-400";
  let barColor = "bg-rose-500";
  let barWidth = "20%";
  if (score >= 5 && matches) {
    strength = "Strong";
    color = "text-emerald-600 dark:text-emerald-400";
    barColor = "bg-emerald-500";
    barWidth = "100%";
  } else if (score >= 4) {
    strength = "Medium";
    color = "text-amber-600 dark:text-amber-400";
    barColor = "bg-amber-500";
    barWidth = "65%";
  }

  const allValid = hasMinLen && hasUpper && hasLower && hasNum && hasSpecial && matches;

  return {
    hasMinLen,
    hasUpper,
    hasLower,
    hasNum,
    hasSpecial,
    matches,
    strength,
    color,
    barColor,
    barWidth,
    allValid
  };
}

function handlePasswordInputUpdate() {
  const pwd = document.getElementById("reg-password")?.value || "";
  const confirmPwd = document.getElementById("reg-confirm-password")?.value || "";
  const info = checkPasswordRules(pwd, confirmPwd);

  const strengthContainer = document.getElementById("password-strength-container");
  if (strengthContainer) {
    if (pwd.length > 0) {
      strengthContainer.classList.remove("hidden");
    } else {
      strengthContainer.classList.add("hidden");
    }
  }

  const reqLen = document.getElementById("req-min-len");
  const reqUpper = document.getElementById("req-upper");
  const reqLower = document.getElementById("req-lower");
  const reqNum = document.getElementById("req-num");
  const reqSpecial = document.getElementById("req-special");
  const reqMatch = document.getElementById("req-match");
  const strLabel = document.getElementById("password-strength-label");
  const strBar = document.getElementById("password-strength-bar");
  const submitBtn = document.getElementById("btn-submit-reg");

  if (reqLen) updateChecklistItem(reqLen, info.hasMinLen, "Minimum 8 characters");
  if (reqUpper) updateChecklistItem(reqUpper, info.hasUpper, "At least 1 uppercase letter (A–Z)");
  if (reqLower) updateChecklistItem(reqLower, info.hasLower, "At least 1 lowercase letter (a–z)");
  if (reqNum) updateChecklistItem(reqNum, info.hasNum, "At least 1 number (0–9)");
  if (reqSpecial) updateChecklistItem(reqSpecial, info.hasSpecial, "At least 1 special character (@, #, $, %, etc.)");
  if (reqMatch) updateChecklistItem(reqMatch, info.matches, "Passwords match");

  if (strLabel) {
    strLabel.innerText = info.strength;
    strLabel.className = `font-black text-xs sm:text-sm ${info.color}`;
  }
  if (strBar) {
    strBar.style.width = info.barWidth;
    strBar.className = `h-full rounded-full transition-all duration-300 ${info.barColor}`;
  }
  if (submitBtn) {
    if (info.allValid) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
    } else {
      submitBtn.disabled = true;
      submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
  }
}

function updateChecklistItem(elem, isValid, text) {
  elem.innerHTML = `
    <span class="${isValid ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400 font-medium'} flex items-center gap-2 text-xs sm:text-sm">
      <i data-lucide="${isValid ? 'check-circle-2' : 'circle'}" class="w-4 h-4 ${isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}"></i>
      ${text}
    </span>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

async function handleAuthLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("login-email")?.value?.trim();
  const password = document.getElementById("login-password")?.value;

  if (!email || !password) {
    alert("Please enter both email address and password.");
    return;
  }

  const btn = document.getElementById("btn-login-submit");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-flex items-center justify-center gap-2"><div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Signing in...</span>`;
  }

  try {
    const res = await api.login(email, password, selectedLoginRole);
    state.setCurrentUser(res.user);
    state.setActiveTab(res.user.role === 'ADMIN' ? 'dashboard' : 'home');
    const notifs = await api.getNotifications();
    state.setNotifications(notifs);
  } catch (err) {
    alert(err.message || "Invalid email or password.");
    if (btn) {
      btn.disabled = false;
      btn.innerText = "Secure Login";
    }
  }
}

async function handleAuthRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("reg-name")?.value?.trim();
  const email = document.getElementById("reg-email")?.value?.trim();
  const phone = document.getElementById("reg-phone")?.value?.trim();
  const password = document.getElementById("reg-password")?.value;
  const confirmPassword = document.getElementById("reg-confirm-password")?.value;

  if (!name || name.length < 2) {
    alert("Full Name must be at least 2 characters.");
    return;
  }
  if (!email || !email.includes("@")) {
    alert("Please enter a valid email address.");
    return;
  }
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    alert("Please enter a valid 10-digit mobile number.");
    return;
  }

  // Strong Password Checks
  if (!password || password.length < 8) {
    alert("Password must contain at least 8 characters");
    return;
  }
  if (!/[A-Z]/.test(password)) {
    alert("Password must contain at least one uppercase letter");
    return;
  }
  if (!/[0-9]/.test(password)) {
    alert("Password must contain at least one number");
    return;
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    alert("Password must contain at least one special character");
    return;
  }
  if (password !== confirmPassword) {
    alert("Passwords do not match");
    return;
  }

  const data = {
    name,
    email,
    phone: cleanPhone,
    password,
    confirm_password: confirmPassword,
    role: selectedRegisterRole,
    language_preference: i18n.currentLang
  };

  if (selectedRegisterRole === 'DEALER') {
    const bizName = document.getElementById("reg-biz-name")?.value?.trim();
    const license = document.getElementById("reg-license")?.value?.trim();
    const gstin = document.getElementById("reg-gstin")?.value?.trim();
    const centreId = document.getElementById("reg-dealer-centre")?.value;
    const categoryId = document.getElementById("reg-dealer-category")?.value;
    const address = document.getElementById("reg-dealer-address")?.value?.trim();

    if (!centreId) {
      alert("Please select a mandatory Procurement Center for Dealer registration.");
      return;
    }
    if (!categoryId) {
      alert("Please select a mandatory Product Category for Dealer registration.");
      return;
    }
    if (!address || address.length < 2) {
      alert("Please enter the dealer's business/office address.");
      return;
    }

    data.business_name = bizName;
    data.license_number = license;
    data.government_id_number = gstin;
    data.government_id_type = "GSTIN";
    data.assigned_centre_id = parseInt(centreId, 10);
    data.category_id = parseInt(categoryId, 10);
    data.address = address;
  }

  const submitBtn = document.getElementById("btn-submit-reg");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-flex items-center gap-2"><div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Sending Verification OTP...</span>`;
  }

  try {
    const res = await api.register(data);

    if (res.status === "pending_verification") {
      // Initiate dedicated OTP verification screen
      initiateOtpVerification(data.email, data.name, res.expires_in_seconds || 300, res.attempts_left || 5);
    } else {
      alert(res.message || "Registration submitted successfully. Please sign in.");
      authMode = "login";
      renderApp();
    }
  } catch (err) {
    alert(err.message);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "Send Email OTP & Verify";
    }
  }
}

function handleForgotPassword() {
  alert("Password Reset Assistance:\n\nPlease contact your District Procurement Nodal Officer or visit your registered APMC Procurement Centre with your government-issued ID for identity verification and credential assistance.");
}

async function logoutUser() {
  try {
    await api.logout();
  } catch (e) {
    api.setToken(null);
  }
  state.setCurrentUser(null);
  state.notifications = [];
  state.unreadNotificationsCount = 0;
  authMode = "login";
  window.location.hash = '#login';
  await renderApp();
  setTimeout(() => {
    const em = document.getElementById("login-email");
    const pw = document.getElementById("login-password");
    if (em) em.value = "";
    if (pw) pw.value = "";
  }, 50);
}

/**
 * Toggle visibility of password input fields
 */
function togglePasswordVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const btn = document.getElementById(btnId) || input.parentElement?.querySelector('.password-toggle-btn');
  const isCurrentlyPassword = input.type === 'password';

  input.type = isCurrentlyPassword ? 'text' : 'password';

  if (btn) {
    const newLabel = isCurrentlyPassword ? 'Hide password' : 'Show password';
    btn.setAttribute('aria-label', newLabel);
    btn.setAttribute('title', newLabel);
    btn.innerHTML = isCurrentlyPassword
      ? '<i data-lucide="eye-off" class="w-4 h-4"></i>'
      : '<i data-lucide="eye" class="w-4 h-4"></i>';

    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }
}

/**
 * Universal password field enhancer to ensure any password input
 * (Login, Register, Reset, Change Password) has a responsive eye toggle.
 */
function enhancePasswordFields() {
  const passwordInputs = document.querySelectorAll('input[type="password"], input[data-has-password-toggle="true"]');
  passwordInputs.forEach((input) => {
    if (input.dataset.toggleInitialized === 'true') return;

    let btn = input.parentElement?.querySelector('.password-toggle-btn');
    if (!btn) {
      if (!input.id) {
        input.id = 'pwd-' + Math.random().toString(36).substr(2, 9);
      }

      const parent = input.parentElement;
      if (parent && !parent.classList.contains('relative')) {
        parent.classList.add('relative');
      }

      input.classList.add('pr-11');

      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-toggle-btn absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition focus:outline-none flex items-center justify-center rounded-lg';
      btn.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
      btn.setAttribute('title', input.type === 'password' ? 'Show password' : 'Hide password');
      btn.innerHTML = input.type === 'password'
        ? '<i data-lucide="eye" class="w-4 h-4"></i>'
        : '<i data-lucide="eye-off" class="w-4 h-4"></i>';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePasswordVisibility(input.id, null);
      });

      input.insertAdjacentElement('afterend', btn);
    }
    input.dataset.toggleInitialized = 'true';
    input.dataset.hasPasswordToggle = 'true';
  });

  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}
