/**
 * main.js — entry point. Loaded as a module on every page (deferred by
 * default). Marks the document as JS-capable, wires shared behaviours, then
 * loads the module a page asks for via <body data-page="…">.
 *
 * Content never depends on this file: every page is complete without it.
 */
import { initNavigation } from './navigation.js';
import { initReveal, initModals, initTabs, initPasswordToggles, initYear } from './ui.js';
import { initHours } from './hours.js';

document.documentElement.classList.add('js');

initNavigation();
initReveal();
initModals();
initTabs();
initPasswordToggles();
initYear();
initHours();

const page = document.body.getAttribute('data-page');

const routes = {
  home: async () => {
    const { initSearchLauncher, renderPreview } = await import('./search.js');
    const form = document.querySelector('[data-search-launcher]');
    if (form) initSearchLauncher(form);
    const preview = document.querySelector('[data-profile-preview]');
    if (preview) renderPreview(preview, { limit: 3, filter: (r) => (r.roles || [r.role]).includes('therapist') });
  },
  search: async () => {
    const { initSearch } = await import('./search.js');
    document.querySelectorAll('[data-search]').forEach((el) => initSearch(el));
  },
  profile: async () => {
    const { initProfile } = await import('./profile.js');
    initProfile(document.body);
  },
  directory: async () => {
    const { initDirectory } = await import('./directory.js');
    initDirectory(document.body);
  },
  join: async () => {
    const { initJoinFlow, initFileInputs } = await import('./forms.js');
    const form = document.querySelector('[data-join-form]');
    if (form) { initJoinFlow(form); initFileInputs(form); }
  },
  login: async () => {
    const { initLoginForm, initDemoForm } = await import('./forms.js');
    const form = document.querySelector('[data-login-form]');
    if (form) initLoginForm(form);
    document.querySelectorAll('[data-demo-form]').forEach((f) => initDemoForm(f));
    if (new URLSearchParams(location.search).get('signed-out')) {
      const { toast } = await import('./ui.js');
      toast('You have been signed out.', { type: 'success' });
    }
  },
  account: async () => {
    const { initAccount } = await import('./account.js');
    const shell = document.querySelector('[data-account]');
    if (shell) initAccount(shell);
  },
  pricing: async () => {
    const { load } = await import('./data.js');
    const pricing = await load('pricing');
    const plans = pricing.plans || pricing;
    document.querySelectorAll('[data-plan]').forEach((card) => {
      const plan = plans.find((p) => p.id === card.getAttribute('data-plan'));
      const priceEl = card.querySelector('[data-plan-price]');
      if (plan && priceEl && plan.amount != null) priceEl.innerHTML = `£${plan.amount} <small>per ${plan.interval}</small>`;
    });
  },
  generic: async () => {
    const { initDemoForm } = await import('./forms.js');
    document.querySelectorAll('[data-demo-form]').forEach((f) => initDemoForm(f));
  }
};

if (page && routes[page]) routes[page]().catch((err) => console.error(err));
