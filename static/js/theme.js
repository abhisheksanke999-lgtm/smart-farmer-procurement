/**
 * Centralized Theme Management System
 * Supports Light Mode & Dark Mode with persistence and system-preference detection.
 */
const themeManager = {
  STORAGE_KEY: 'sf_theme_preference',

  /**
   * Initialize theme system: load saved preference or fall back to system preference.
   */
  init() {
    let preferredTheme = null;
    try {
      preferredTheme = localStorage.getItem(this.STORAGE_KEY);
    } catch (e) {
      console.warn('localStorage not available for theme preference:', e);
    }

    if (!preferredTheme) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      preferredTheme = prefersDark ? 'dark' : 'light';
    }

    this.applyTheme(preferredTheme, false);

    // Watch for OS theme changes when user has not explicitly set a manual preference
    if (window.matchMedia) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          const manualSaved = localStorage.getItem(this.STORAGE_KEY);
          if (!manualSaved) {
            this.applyTheme(e.matches ? 'dark' : 'light', true);
          }
        });
      } catch (err) {
        // Older browser fallback
      }
    }
  },

  /**
   * Get current active theme ('dark' or 'light')
   */
  getTheme() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  },

  /**
   * Set and persist theme
   */
  setTheme(theme) {
    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch (e) {}
    this.applyTheme(theme, true);
  },

  /**
   * Toggle between dark and light themes
   */
  toggleTheme() {
    const nextTheme = this.getTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
    return nextTheme;
  },

  /**
   * Apply theme classes to DOM
   */
  applyTheme(theme, animate = true) {
    const isDark = theme === 'dark';
    const root = document.documentElement;
    const body = document.body;

    if (animate) {
      root.classList.add('theme-transitioning');
      setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 350);
    }

    if (isDark) {
      root.classList.add('dark');
      root.classList.add('dark-mode');
      if (body) {
        body.classList.add('dark');
        body.classList.add('dark-mode');
      }
    } else {
      root.classList.remove('dark');
      root.classList.remove('dark-mode');
      if (body) {
        body.classList.remove('dark');
        body.classList.remove('dark-mode');
      }
    }

    this.updateToggleUI();
  },

  /**
   * Update theme toggle button attributes, icons, and text labels across the UI
   */
  updateToggleUI() {
    const isDark = this.getTheme() === 'dark';
    const buttons = document.querySelectorAll('.theme-toggle-btn');
    buttons.forEach((btn) => {
      btn.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      btn.setAttribute('title', isDark ? 'Switch to Light Mode (☀️)' : 'Switch to Dark Mode (🌙)');
      
      const label = btn.querySelector('.theme-toggle-label');
      if (label) {
        label.textContent = isDark ? 'Light' : 'Dark';
      }

      const iconContainer = btn.querySelector('.theme-toggle-icon');
      if (iconContainer) {
        iconContainer.innerHTML = isDark
          ? '<i data-lucide="sun" class="w-4 h-4 text-amber-300"></i>'
          : '<i data-lucide="moon" class="w-4 h-4 text-emerald-100"></i>';
      }
    });

    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }
};

// Auto-initialize when script loads
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => themeManager.init());
  } else {
    themeManager.init();
  }
}
