/**
 * ui.js — small reusable interface behaviours: toasts, modals, tabs,
 * reveal-on-scroll, password visibility, details/faq.
 */

/* ---- Toasts (aria-live region) ---- */
let region = null;
function ensureRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'false');
  document.body.appendChild(region);
  return region;
}

export function toast(message, { type = 'info', timeout = 5000 } = {}) {
  const host = ensureRegion();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icon = type === 'success'
    ? '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
    : type === 'error'
      ? '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>'
      : '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5m0-3h.01"/></svg>';
  el.innerHTML = `${icon}<span>${message}</span><button type="button" class="toast__close" aria-label="Dismiss"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
  el.querySelector('.toast__close').addEventListener('click', () => el.remove());
  host.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

/* ---- Modals: native <dialog> with focus return ---- */
export function initModals(root = document) {
  root.querySelectorAll('[data-modal-open]').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.getAttribute('data-modal-open'), btn));
  });
  root.querySelectorAll('dialog.modal').forEach((dialog) => {
    dialog.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('is-locked');
      if (dialog._opener && typeof dialog._opener.focus === 'function') dialog._opener.focus();
    });
  });
}

export function openModal(id, opener) {
  const dialog = document.getElementById(id);
  if (!dialog) return;
  dialog._opener = opener || document.activeElement;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  document.body.classList.add('is-locked');
  const first = dialog.querySelector('input, select, textarea, button:not(.modal__close), a[href]');
  if (first) first.focus();
}

/* ---- Tabs (ARIA tabs pattern with arrow keys) ---- */
export function initTabs(root = document) {
  root.querySelectorAll('[data-tabs]').forEach((tablist) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const activate = (idx, focus = true) => {
      tabs.forEach((t, i) => {
        const on = i === idx;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (panels[i]) panels[i].classList.toggle('is-active', on);
      });
      if (focus) tabs[idx].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activate(i, false));
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') activate((i + 1) % tabs.length);
        if (e.key === 'ArrowLeft') activate((i - 1 + tabs.length) % tabs.length);
        if (e.key === 'Home') activate(0);
        if (e.key === 'End') activate(tabs.length - 1);
      });
    });
    const initial = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    activate(initial >= 0 ? initial : 0, false);
  });
}

/* ---- Reveal on scroll: content is visible without JS; JS adds the hidden state ---- */
export function initReveal() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((el) => io.observe(el));
}

/* ---- Password visibility toggle ---- */
export function initPasswordToggles(root = document) {
  root.querySelectorAll('[data-password-toggle]').forEach((btn) => {
    const input = document.getElementById(btn.getAttribute('data-password-toggle'));
    if (!input) return;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

/* ---- Copy year into footer ---- */
export function initYear() {
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
}
