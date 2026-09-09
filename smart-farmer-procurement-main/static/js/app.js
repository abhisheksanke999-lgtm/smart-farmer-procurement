// App Initialization & Main Render Loop

let isRendering = false;
let pendingRender = false;

document.addEventListener("DOMContentLoaded", async () => {
  // Listen to language changes
  document.addEventListener("languageChanged", () => {
    renderApp();
  });

  // Check initial user authentication session silently
  try {
    const user = await api.getCurrentUser();
    state.currentUser = user;
    if (user) {
      try {
        const notifs = await api.getNotifications();
        state.notifications = notifs.notifications || [];
        state.unreadNotificationsCount = notifs.unread_count || 0;
      } catch (ne) {
        console.warn("Could not fetch notifications:", ne);
      }
    }
  } catch (e) {
    state.currentUser = null;
  }

  // Subscribe state store to trigger re-renders
  state.subscribe(() => {
    renderApp();
  });

  // Enforce route security based on auth and permitted role tabs
  enforceRouteSecurity();

  // Initial Render
  await renderApp();
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
      appRoot.innerHTML = `
    ${renderLoginBackground()}
    ${renderHeader()}
    <main class="max-w-lg mx-auto p-4 my-8 relative z-10">
      ${renderAuthModal()}
    </main>
  `;
      setTimeout(() => {
        const em = document.getElementById("login-email");
        const pw = document.getElementById("login-password");
        if (em) em.value = "";
        if (pw) pw.value = "";
      }, 50);
    } else {
      let mainContent = '';
      if (user.role === 'FARMER') {
        mainContent = await renderFarmerView();
      } else if (user.role === 'DEALER') {
        mainContent = await renderDealerView();
      } else if (user.role === 'ADMIN') {
        mainContent = await renderAdminView();
      }

      appRoot.innerHTML = `
        ${renderHeader()}
        <main class="max-w-7xl mx-auto p-4 sm:p-6 mb-20 sm:mb-8">
          ${mainContent}
        </main>
        ${renderMobileBottomNav()}
        ${renderNotificationDrawer()}
        ${renderQRModal()}
        ${renderReceiptModal()}
      `;
    }

    // Re-initialize Lucide Icons
    if (window.lucide) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error("renderApp error:", err);
  } finally {
    isRendering = false;
    if (pendingRender) {
      pendingRender = false;
      renderApp();
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

function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number.";
  }
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=[\]/~`';]/.test(password)) {
    return "Password must contain at least one special character.";
  }
  return null; // valid
}

const PASSWORD_REQUIREMENTS = [
  { id: "req-length", test: (v) => v.length >= 8, label: "At least 8 characters" },
  { id: "req-upper", test: (v) => /[A-Z]/.test(v), label: "One uppercase letter" },
  { id: "req-lower", test: (v) => /[a-z]/.test(v), label: "One lowercase letter" },
  { id: "req-number", test: (v) => /\d/.test(v), label: "One number" },
  { id: "req-special", test: (v) => /[!@#$%^&*(),.?":{}|<>_\-+=[\]/~`';]/.test(v), label: "One special character" }
];

function handlePasswordRequirementsCheck(value) {
  PASSWORD_REQUIREMENTS.forEach(req => {
    const el = document.getElementById(req.id);
    if (!el) return;
    const icon = el.querySelector("i");
    const passed = req.test(value);
    if (passed) {
      el.className = "flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400";
      if (icon) icon.setAttribute("data-lucide", "check-circle-2");
    } else {
      el.className = "flex items-center gap-2 text-xs text-slate-400";
      if (icon) icon.setAttribute("data-lucide", "circle");
    }
  });
  if (window.lucide) lucide.createIcons();
}

function toggleAuthMode(mode) {
  authMode = mode;
  otpVerificationState.active = false;
  if (otpVerificationState.timerInterval) clearInterval(otpVerificationState.timerInterval);
  if (otpVerificationState.cooldownInterval) clearInterval(otpVerificationState.cooldownInterval);
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
  renderApp();
}

function initiateOtpVerification(email, name, expiresInSeconds = 300, attemptsAllowed = 5, sandboxOtp = null) {
  if (otpVerificationState.timerInterval) clearInterval(otpVerificationState.timerInterval);
  if (otpVerificationState.cooldownInterval) clearInterval(otpVerificationState.cooldownInterval);

  otpVerificationState = {
    active: true,
    email: email,
    name: name,
    secondsLeft: expiresInSeconds,
    attemptsLeft: attemptsAllowed,
    resendCooldown: 60,
    sandboxOtp: null,
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
      } catch (ce) { }
    }

    if (otpVerificationState.timerInterval) clearInterval(otpVerificationState.timerInterval);
    if (otpVerificationState.cooldownInterval) clearInterval(otpVerificationState.cooldownInterval);

    // Save token and activate user session
    api.setToken(res.access_token);
    state.setCurrentUser(res.user);

    try {
      const notifs = await api.getNotifications();
      state.setNotifications(notifs);
    } catch (ne) { }

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
    if (res.sandbox_otp) {
      otpVerificationState.sandboxOtp = res.sandbox_otp;
      otpVerificationState.enteredOtp = res.sandbox_otp;
    }
    otpVerificationState.resendCooldown = 60;
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
    <div class="glass-card p-6 sm:p-8 shadow-2xl border-t-4 border-emerald-600 animate-fade-in relative overflow-hidden">
      
      <!-- Top Decorative Glow -->
      <div class="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>

      <!-- Icon & Header -->
      <div class="text-center mb-5">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-2xl mx-auto mb-3 shadow-lg shadow-emerald-500/25">
          <i data-lucide="shield-check" class="w-8 h-8"></i>
        </div>
        <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">
          ${i18n.t("otp_verification_title")}
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          ${i18n.t("otp_sent_to")}
        </p>

        <!-- Recipient Email Pill -->
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-full text-emerald-800 dark:text-emerald-300 font-semibold text-xs mt-3 shadow-sm">
          <i data-lucide="mail" class="w-3.5 h-3.5"></i>
          <span class="font-mono">${escapeHtml(otpVerificationState.email)}</span>
        </div>
      </div>

      <!-- Timer & Attempts Status Bar -->
      <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 mb-4 text-xs font-semibold">
        <div class="flex items-center gap-1.5">
          <i data-lucide="clock" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 ${!isExpired ? 'animate-pulse' : ''}"></i>
          <span class="text-slate-600 dark:text-slate-300">${i18n.t("otp_expires_in")}:</span>
          <span id="otp-timer-display" class="font-mono text-sm font-extrabold ${isExpired ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}">
            ${formatTimer(otpVerificationState.secondsLeft)}
          </span>
        </div>
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${otpVerificationState.attemptsLeft <= 2 ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300' : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700/80 dark:text-slate-200'} text-[11px] font-bold">
          <i data-lucide="shield-alert" class="w-3 h-3"></i>
          <span>${otpVerificationState.attemptsLeft} ${i18n.t("otp_attempts_left")}</span>
        </div>
      </div>


      <!-- Error Message Banner -->
      ${otpVerificationState.errorMessage ? `
        <div class="p-3 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2 shadow-sm">
          <i data-lucide="alert-circle" class="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"></i>
          <div class="flex-1 font-medium">${escapeHtml(otpVerificationState.errorMessage)}</div>
        </div>
      ` : ''}

      <!-- Success Message Banner -->
      ${otpVerificationState.successMessage ? `
        <div class="p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 shadow-sm">
          <i data-lucide="check-circle-2" class="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400"></i>
          <div class="flex-1 font-medium">${escapeHtml(otpVerificationState.successMessage)}</div>
        </div>
      ` : ''}

      <!-- 6-Digit OTP Input Form -->
      <form onsubmit="handleOtpSubmitForm(event)" class="space-y-4">
        <div>
          <label class="block text-center font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs uppercase tracking-wider">
            ${i18n.t("otp_enter_code")}
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
                   class="w-64 text-center text-3xl font-mono font-black tracking-[0.4em] px-4 py-3 rounded-2xl border-2 border-emerald-500/60 dark:border-emerald-500/80 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-inner focus:outline-none focus:ring-4 focus:ring-emerald-500/25 transition disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800">
          </div>
          <p class="text-center text-[11px] text-slate-400 mt-2">
            Enter the exact 6 digits from the verification email
          </p>
        </div>

        <!-- Verify Button -->
        <button type="submit"
                id="btn-verify-otp"
                ${otpVerificationState.isVerifying || isExpired || isLocked ? 'disabled' : ''}
                class="btn-agri w-full py-3.5 text-sm font-bold shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition">
          ${otpVerificationState.isVerifying ? `
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Verifying OTP...</span>
          ` : `
            <i data-lucide="check" class="w-4 h-4"></i>
            <span>${i18n.t("otp_verify_btn")}</span>
          `}
        </button>
      </form>

      <!-- Bottom Actions: Resend & Cancel -->
      <div class="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-col items-center gap-3 text-xs">
        <button type="button"
                id="btn-resend-otp"
                onclick="handleResendOtp()"
                ${otpVerificationState.isResending || otpVerificationState.resendCooldown > 0 ? 'disabled' : ''}
                class="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition px-3 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
          <i data-lucide="rotate-cw" class="w-3.5 h-3.5 ${otpVerificationState.isResending ? 'animate-spin' : ''}"></i>
          <span>${otpVerificationState.resendCooldown > 0 ? `${i18n.t("otp_resend_wait")} (${otpVerificationState.resendCooldown}s)` : i18n.t("otp_resend_btn")}</span>
        </button>

        <button type="button"
                onclick="cancelOtpVerification()"
                class="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-semibold flex items-center gap-1 transition">
          <i data-lucide="arrow-left" class="w-3 h-3"></i>
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
    <div class="glass-card p-6 sm:p-8 shadow-2xl border-t-4 border-emerald-600 animate-fade-in">
      
      <!-- Logo & Title -->
      <div class="text-center mb-6">
        <div class="w-14 h-14 rounded-2xl agri-gradient text-white flex items-center justify-center font-bold text-3xl mx-auto mb-3 shadow-lg">
          🌾
        </div>
        <h2 class="text-2xl font-extrabold text-slate-900 dark:text-white">
          ${i18n.t("app_title")}
        </h2>
        <p class="text-sm text-slate-500 mt-1">${i18n.t("app_subtitle")}</p>
      </div>

      <!-- Login / Register Tab Toggle -->
      <div class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 mb-6 font-bold text-sm">
        <button onclick="toggleAuthMode('login')" class="flex-1 py-2.5 rounded-lg ${authMode === 'login' ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow' : 'text-slate-500'} transition">
          Sign In
        </button>
        <button onclick="toggleAuthMode('register')" class="flex-1 py-2.5 rounded-lg ${authMode === 'register' ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow' : 'text-slate-500'} transition">
          New Registration
        </button>
      </div>

      ${authMode === 'login' ? `
        <!-- LOGIN FORM -->
        <form id="auth-login-form" onsubmit="handleAuthLoginSubmit(event)" class="space-y-4 text-sm" autocomplete="off">
          
          <!-- Role Selection: ADMIN, FARMER, DEALER -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">Select Role: <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-3 gap-2 font-bold text-sm">
              <button type="button" id="role-btn-admin" onclick="selectLoginRole('ADMIN')" class="p-3 rounded-xl border-2 transition ${selectedLoginRole === 'ADMIN' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}">
                🏛️ Admin
              </button>
              <button type="button" id="role-btn-farmer" onclick="selectLoginRole('FARMER')" class="p-3 rounded-xl border-2 transition ${selectedLoginRole === 'FARMER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}">
                🌾 Farmer
              </button>
              <button type="button" id="role-btn-dealer" onclick="selectLoginRole('DEALER')" class="p-3 rounded-xl border-2 transition ${selectedLoginRole === 'DEALER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}">
                🏢 Dealer
              </button>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address <span class="text-red-500">*</span></label>
            <input type="email" id="login-email" name="login_email" placeholder="Enter your registered email" value="" required autocomplete="off" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block font-bold text-slate-700 dark:text-slate-300">Password <span class="text-red-500">*</span></label>
              <button type="button" onclick="handleForgotPassword()" class="text-[11px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-semibold transition">Forgot Password?</button>
            </div>
            <input type="password" id="login-password" name="login_password" placeholder="Enter your password" value="" required autocomplete="new-password" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          </div>

          <button id="btn-login-submit" type="submit" class="btn-agri w-full py-3 text-sm font-bold shadow-xl">
            Secure Login as ${selectedLoginRole}
          </button>
        </form>
      ` : `
        <!-- REGISTER FORM -->
        <form onsubmit="handleAuthRegisterSubmit(event)" class="space-y-4 text-sm" autocomplete="off">
          
          <!-- Role Selection Pills -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Registering As: <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-2 gap-2 font-bold text-sm">
              <button type="button" onclick="selectRegisterRole('FARMER')" class="p-3 rounded-xl border-2 ${selectedRegisterRole === 'FARMER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-200 dark:border-slate-700'}">
                🌾 Farmer
              </button>
              <button type="button" onclick="selectRegisterRole('DEALER')" class="p-3 rounded-xl border-2 ${selectedRegisterRole === 'DEALER' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-200 dark:border-slate-700'}">
                🏢 Procurement Dealer
              </button>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name <span class="text-red-500">*</span></label>
            <input type="text" id="reg-name" placeholder="Enter Full Name" value="" required autocomplete="off" class="w-full px-4 py-2 rounded-xl border dark:bg-slate-800">
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Email <span class="text-red-500">*</span></label>
              <input type="email" id="reg-email" placeholder="Enter your email address" value="" required autocomplete="off" class="w-full px-4 py-2 rounded-xl border dark:bg-slate-800">
            </div>
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mobile No <span class="text-red-500">*</span></label>
              <input type="tel" id="reg-phone" placeholder="9876543210" value="" required autocomplete="off" class="w-full px-4 py-2 rounded-xl border dark:bg-slate-800">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Password <span class="text-red-500">*</span></label>
            <input type="password" id="reg-password" placeholder="Create Secure Password" value="" minlength="8" required autocomplete="off" oninput="handlePasswordRequirementsCheck(this.value)" class="w-full px-4 py-2 rounded-xl border dark:bg-slate-800">
            <div id="password-requirements" class="mt-2 space-y-1">
              <div id="req-length" class="flex items-center gap-2 text-xs text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i>
                <span>At least 8 characters</span>
              </div>
              <div id="req-upper" class="flex items-center gap-2 text-xs text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i>
                <span>One uppercase letter</span>
              </div>
              <div id="req-lower" class="flex items-center gap-2 text-xs text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i>
                <span>One lowercase letter</span>
              </div>
              <div id="req-number" class="flex items-center gap-2 text-xs text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i>
                <span>One number</span>
              </div>
              <div id="req-special" class="flex items-center gap-2 text-xs text-slate-400">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i>
                <span>One special character</span>
              </div>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Confirm Password <span class="text-red-500">*</span></label>
            <input type="password" id="reg-password-confirm" placeholder="Re-enter Password" value="" minlength="8" required autocomplete="off" class="w-full px-4 py-2 rounded-xl border dark:bg-slate-800">
          </div>

          ${selectedRegisterRole === 'DEALER' ? `
            <div class="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
              <span class="font-extrabold text-amber-900 dark:text-amber-300 block">Dealer Business Information: <span class="text-red-500">*</span></span>
              <input type="text" id="reg-biz-name" placeholder="Business Name (e.g. Sri Venkateswara Traders)" value="" required autocomplete="off" class="w-full px-3 py-1.5 rounded-lg border dark:bg-slate-900">
              <input type="text" id="reg-license" placeholder="Trade License No (e.g. LIC-2026-901)" value="" required autocomplete="off" class="w-full px-3 py-1.5 rounded-lg border dark:bg-slate-900 font-mono">
              <input type="text" id="reg-gstin" placeholder="GSTIN / ID Number" value="" required autocomplete="off" class="w-full px-3 py-1.5 rounded-lg border dark:bg-slate-900 uppercase font-mono">
            </div>
          ` : ''}

          <button type="submit" id="btn-submit-reg" class="btn-agri w-full py-3 text-sm font-bold shadow-xl">
            Send Email OTP & Verify
          </button>
        </form>
      `}

    </div>
  `;
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
  const passwordConfirm = document.getElementById("reg-password-confirm")?.value;

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

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    alert(passwordError);
    return;
  }
  if (password !== passwordConfirm) {
    alert("Passwords do not match. Please re-enter.");
    return;
  }

  const data = {
    name,
    email,
    phone: cleanPhone,
    password,
    role: selectedRegisterRole,
    language_preference: i18n.currentLang
  };

  if (selectedRegisterRole === 'DEALER') {
    data.business_name = document.getElementById("reg-biz-name")?.value?.trim();
    data.license_number = document.getElementById("reg-license")?.value?.trim();
    data.government_id_number = document.getElementById("reg-gstin")?.value?.trim();
    data.government_id_type = "GSTIN";
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
      initiateOtpVerification(data.email, data.name, res.expires_in_seconds || 300, res.attempts_left || 5, res.sandbox_otp || null);
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
function renderLoginBackground() {
  // Wheat blades
  const bladeCount = 80;
  const width = 1200;
  let blades = '';
  for (let i = 0; i < bladeCount; i++) {
    const x = Math.round((i / bladeCount) * width + (Math.random() * 10 - 5));
    const h = Math.round(55 + Math.random() * 80);
    const y = 180;
    const fills = ['#D9B94A', '#C6A53D', '#E8C84A', '#B89A30', '#CCB040'];
    const fill = fills[i % fills.length];
    const stemColor = ['#7a9b6b', '#6b8f5e', '#8aab7a'][i % 3];
    blades += `
      <g class="auth-blade" style="transform-origin:${x}px ${y}px;">
        <line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="${stemColor}" stroke-width="2"></line>
        <ellipse cx="${x}" cy="${y - h}" rx="5" ry="14" fill="${fill}"></ellipse>
        <ellipse cx="${x - 4}" cy="${y - h + 16}" rx="4" ry="10" fill="${fill}" opacity="0.7"></ellipse>
        <ellipse cx="${x + 4}" cy="${y - h + 22}" rx="3.5" ry="9" fill="${fill}" opacity="0.5"></ellipse>
      </g>`;
  }

  // Sun rays SVG
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const angle = i * 30;
    rays += `<line x1="200" y1="200" x2="200" y2="30" stroke="#ffc107" stroke-width="2" opacity="0.5" transform="rotate(${angle},200,200)"></line>`;
  }

  // Stars for dark mode
  let stars = '';
  for (let i = 0; i < 30; i++) {
    const sx = Math.round(Math.random() * 100);
    const sy = Math.round(Math.random() * 40);
    const delay = (Math.random() * 5).toFixed(1);
    const size = (1 + Math.random() * 2).toFixed(1);
    stars += `<div class="auth-star" style="left:${sx}%;top:${sy}%;width:${size}px;height:${size}px;animation-delay:${delay}s;"></div>`;
  }

  // Floating particles (seeds/pollen)
  let particles = '';
  const pColors = ['#ffd54f', '#a5d6a7', '#fff9c4', '#c8e6c9', '#ffe082'];
  for (let i = 0; i < 15; i++) {
    const px = Math.round(Math.random() * 100);
    const py = Math.round(30 + Math.random() * 50);
    const size = (2 + Math.random() * 4).toFixed(1);
    const delay = (Math.random() * 12).toFixed(1);
    const dur = (8 + Math.random() * 8).toFixed(1);
    particles += `<div class="auth-particle" style="left:${px}%;top:${py}%;width:${size}px;height:${size}px;background:${pColors[i % pColors.length]};animation-delay:${delay}s;animation-duration:${dur}s;"></div>`;
  }

  // Fireflies
  let fireflies = '';
  for (let i = 0; i < 8; i++) {
    const fx = Math.round(10 + Math.random() * 80);
    const fy = Math.round(40 + Math.random() * 40);
    const delay = (Math.random() * 6).toFixed(1);
    const dur = (3 + Math.random() * 4).toFixed(1);
    fireflies += `<div class="auth-firefly" style="left:${fx}%;top:${fy}%;animation-delay:${delay}s;animation-duration:${dur}s;"></div>`;
  }

  return `
    <div class="auth-bg-scene">

      <!-- Stars (visible in dark mode) -->
      <div class="auth-stars">${stars}</div>

      <!-- Sun Glow + Disc + Rays -->
      <div class="auth-sun-glow"></div>
      <div class="auth-sun-disc"></div>
      <svg class="auth-sun-rays" viewBox="0 0 400 400">${rays}</svg>

      <!-- Clouds -->
      <svg class="auth-cloud auth-cloud-1" width="220" height="70" viewBox="0 0 220 70">
        <ellipse cx="70" cy="45" rx="70" ry="25" fill="white" opacity="0.85"/>
        <ellipse cx="120" cy="35" rx="50" ry="22" fill="white" opacity="0.9"/>
        <ellipse cx="160" cy="45" rx="55" ry="20" fill="white" opacity="0.8"/>
      </svg>
      <svg class="auth-cloud auth-cloud-2" width="180" height="55" viewBox="0 0 180 55">
        <ellipse cx="60" cy="35" rx="55" ry="20" fill="white" opacity="0.8"/>
        <ellipse cx="110" cy="28" rx="45" ry="18" fill="white" opacity="0.85"/>
        <ellipse cx="140" cy="37" rx="40" ry="16" fill="white" opacity="0.75"/>
      </svg>
      <svg class="auth-cloud auth-cloud-3" width="160" height="50" viewBox="0 0 160 50">
        <ellipse cx="50" cy="30" rx="48" ry="18" fill="white" opacity="0.75"/>
        <ellipse cx="100" cy="25" rx="40" ry="16" fill="white" opacity="0.85"/>
        <ellipse cx="130" cy="32" rx="30" ry="14" fill="white" opacity="0.7"/>
      </svg>

      <!-- Birds -->
      <svg class="auth-bird auth-bird-1" width="30" height="14" viewBox="0 0 30 14">
        <path class="auth-bird-wing" d="M0,10 Q7,0 15,7" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round"/>
        <path class="auth-bird-wing" d="M15,7 Q23,0 30,10" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" style="animation-delay:0.15s"/>
      </svg>
      <svg class="auth-bird auth-bird-2" width="24" height="12" viewBox="0 0 24 12">
        <path class="auth-bird-wing" d="M0,8 Q6,0 12,6" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round"/>
        <path class="auth-bird-wing" d="M12,6 Q18,0 24,8" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round" style="animation-delay:0.2s"/>
      </svg>
      <svg class="auth-bird auth-bird-3" width="20" height="10" viewBox="0 0 20 10">
        <path class="auth-bird-wing" d="M0,7 Q5,0 10,5" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/>
        <path class="auth-bird-wing" d="M10,5 Q15,0 20,7" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" style="animation-delay:0.1s"/>
      </svg>

      <!-- Floating Particles -->
      ${particles}

      <!-- Fireflies -->
      ${fireflies}

      <!-- Hills (parallax layers) -->
      <svg class="auth-hill auth-hill-far" viewBox="0 0 1200 300" preserveAspectRatio="none">
        <path d="M0,180 C200,100 400,220 600,150 C800,90 1000,200 1200,140 L1200,300 L0,300 Z"></path>
      </svg>
      <svg class="auth-hill auth-hill-mid" viewBox="0 0 1200 300" preserveAspectRatio="none">
        <path d="M0,220 C250,160 450,240 700,190 C900,150 1050,230 1200,190 L1200,300 L0,300 Z"></path>
      </svg>
      <svg class="auth-hill auth-hill-near" viewBox="0 0 1200 300" preserveAspectRatio="none">
        <path d="M0,250 C300,210 500,260 750,230 C950,205 1100,250 1200,230 L1200,300 L0,300 Z"></path>
      </svg>

      <!-- Tractor -->
      <div class="auth-tractor">
        <svg width="80" height="50" viewBox="0 0 80 50">
          <g class="auth-tractor-body">
            <!-- Body -->
            <rect x="20" y="10" width="40" height="22" rx="4" fill="#d32f2f"/>
            <rect x="16" y="14" width="10" height="14" rx="2" fill="#b71c1c"/>
            <!-- Cabin -->
            <rect x="35" y="2" width="20" height="18" rx="3" fill="#42a5f5" opacity="0.7"/>
            <rect x="38" y="4" width="14" height="10" rx="2" fill="#bbdefb" opacity="0.6"/>
            <!-- Exhaust -->
            <rect x="24" y="5" width="3" height="8" rx="1" fill="#616161"/>
            <circle cx="25.5" cy="4" r="2" fill="#9e9e9e" opacity="0.5"/>
          </g>
          <!-- Front wheel -->
          <g class="auth-tractor-wheel" style="transform-origin:25px 38px;">
            <circle cx="25" cy="38" r="8" fill="#37474f" stroke="#263238" stroke-width="2"/>
            <circle cx="25" cy="38" r="3" fill="#78909c"/>
            <line x1="25" y1="30" x2="25" y2="32" stroke="#78909c" stroke-width="1"/>
            <line x1="25" y1="44" x2="25" y2="46" stroke="#78909c" stroke-width="1"/>
            <line x1="17" y1="38" x2="19" y2="38" stroke="#78909c" stroke-width="1"/>
            <line x1="31" y1="38" x2="33" y2="38" stroke="#78909c" stroke-width="1"/>
          </g>
          <!-- Rear wheel -->
          <g class="auth-tractor-wheel" style="transform-origin:55px 36px;">
            <circle cx="55" cy="36" r="12" fill="#37474f" stroke="#263238" stroke-width="2.5"/>
            <circle cx="55" cy="36" r="4" fill="#78909c"/>
            <line x1="55" y1="24" x2="55" y2="28" stroke="#78909c" stroke-width="1.2"/>
            <line x1="55" y1="44" x2="55" y2="48" stroke="#78909c" stroke-width="1.2"/>
            <line x1="43" y1="36" x2="47" y2="36" stroke="#78909c" stroke-width="1.2"/>
            <line x1="63" y1="36" x2="67" y2="36" stroke="#78909c" stroke-width="1.2"/>
          </g>
        </svg>
      </div>

      <!-- Wheat -->
      <svg class="auth-wheat-row" viewBox="0 0 1200 180" preserveAspectRatio="none">
        ${blades}
      </svg>

      <!-- Ground -->
      <div class="auth-ground"></div>
    </div>
  `;
}