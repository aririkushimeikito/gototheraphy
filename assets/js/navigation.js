/**
 * navigation.js — header, mobile menu, current-page marking.
 * The menu is keyboard accessible: Escape closes, focus is trapped while open,
 * focus returns to the toggle on close, aria-expanded reflects state.
 */

export function initNavigation() {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    const focusables = () => [...menu.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')];
    const open = () => {
      menu.classList.add('is-open');
      menu.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-locked');
      const first = focusables()[0];
      if (first) first.focus();
    };
    const close = ({ returnFocus = true } = {}) => {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-locked');
      window.setTimeout(() => { if (!menu.classList.contains('is-open')) menu.setAttribute('hidden', ''); }, 280);
      if (returnFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => (toggle.getAttribute('aria-expanded') === 'true' ? close() : open()));
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); toggle.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); toggle.focus(); }
    });
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && toggle.getAttribute('aria-expanded') === 'true') {
        e.preventDefault();
        const first = focusables()[0];
        if (first) first.focus();
      }
    });
    menu.querySelectorAll('a[href]').forEach((a) => a.addEventListener('click', () => close({ returnFocus: false })));
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) close({ returnFocus: false }); });
  }

  // Mark the current page in both navigations
  const path = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll('.nav__link, .mobile-menu__link').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href === '/') { if (path === '/' && href === '/') a.setAttribute('aria-current', 'page'); return; }
    if (path === href || path.startsWith(href)) a.setAttribute('aria-current', 'page');
  });
}
