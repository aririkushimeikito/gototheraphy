/**
 * forms.js — accessible validation, error summaries, the progressive join
 * flow, login and small utility forms.
 *
 * SECURITY: nothing entered in the join form is written to localStorage or
 * sessionStorage. Draft state lives in memory for the page session only.
 * Submission is a BACKEND INTEGRATION POINT (POST /api/applications).
 */
import { toast } from './ui.js';
import { url } from './data.js';

const MESSAGES = {
  valueMissing: 'This field is required.',
  typeMismatch: 'Check the format of this field.',
  patternMismatch: 'Check the format of this field.',
  tooShort: 'This is too short.',
  tooLong: 'This is too long.',
  rangeUnderflow: 'This is too low.',
  rangeOverflow: 'This is too high.'
};

function messageFor(input) {
  const custom = input.getAttribute('data-error');
  const v = input.validity;
  if (v.valueMissing) return input.getAttribute('data-error-required') || custom || MESSAGES.valueMissing;
  if (v.typeMismatch && input.type === 'email') return 'Enter an email address like name@example.co.uk.';
  for (const key of Object.keys(MESSAGES)) if (v[key]) return custom || MESSAGES[key];
  return custom || 'Check this field.';
}

export function validateField(input) {
  const field = input.closest('.form-field, .form-check, .form-fieldset');
  const errorEl = field?.querySelector('.form-field__error');
  const ok = input.checkValidity() && !(input.hasAttribute('data-match') && input.value !== document.getElementById(input.getAttribute('data-match'))?.value);
  if (field) field.classList.toggle('is-invalid', !ok);
  input.setAttribute('aria-invalid', String(!ok));
  if (errorEl) {
    errorEl.textContent = ok ? '' : (input.hasAttribute('data-match') && input.checkValidity() ? 'These do not match.' : messageFor(input));
    if (!ok && !errorEl.id) errorEl.id = `${input.id || input.name}-error`;
    if (!ok) input.setAttribute('aria-describedby', [input.getAttribute('data-describedby'), errorEl.id].filter(Boolean).join(' '));
  }
  return ok;
}

/** Validates all controls inside a container; renders an error summary if one exists. */
export function validateContainer(container) {
  const controls = [...container.querySelectorAll('input, select, textarea')].filter((c) => !c.disabled && c.type !== 'hidden' && !c.closest('[hidden]'));
  const invalid = controls.filter((c) => !validateField(c));
  const summary = container.querySelector('.form-summary') || container.closest('form')?.querySelector('.form-summary');
  if (summary) {
    if (invalid.length) {
      summary.innerHTML = `<p class="form-summary__title">There ${invalid.length === 1 ? 'is 1 thing' : `are ${invalid.length} things`} to fix before continuing</p><ul>${invalid.map((c) => {
        const label = c.closest('.form-field, .form-check')?.querySelector('label')?.textContent?.replace('*', '').trim() || c.name;
        return `<li><a href="#${c.id}">${label}</a>: ${c.closest('.form-field, .form-check')?.querySelector('.form-field__error')?.textContent || ''}</li>`;
      }).join('')}</ul>`;
      summary.classList.add('is-visible');
      summary.setAttribute('tabindex', '-1');
      summary.focus();
    } else {
      summary.classList.remove('is-visible');
      summary.innerHTML = '';
    }
  } else if (invalid.length) {
    invalid[0].focus();
  }
  return invalid.length === 0;
}

export function initLiveValidation(form) {
  form.setAttribute('novalidate', '');
  form.addEventListener('blur', (e) => { if (e.target.matches('input, select, textarea')) validateField(e.target); }, true);
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.form-field, .form-check');
    if (field?.classList.contains('is-invalid')) validateField(e.target);
  });
}

/* ---------------------------------------------------------------------- */
/* Login (utility page)                                                    */
/* ---------------------------------------------------------------------- */
export function initLoginForm(form) {
  initLiveValidation(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateContainer(form)) return;
    // BACKEND REQUIRED: POST /api/auth/login { email, password, remember } → httpOnly session cookie.
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Signing in…';
    window.setTimeout(() => {
      // Prototype: no credentials are checked or stored. Navigate to the demo account.
      location.href = url('account/') + '?demo=1';
    }, 600);
  });
}

/* ---------------------------------------------------------------------- */
/* Join flow: six steps, back navigation, in-memory draft, review step      */
/* ---------------------------------------------------------------------- */
export function initJoinFlow(form) {
  initLiveValidation(form);
  const panels = [...form.querySelectorAll('.step-panel')];
  const progress = [...document.querySelectorAll('.progress__item')];
  const statusEl = document.querySelector('[data-step-status]');
  let step = 0;
  const draft = {}; // in-memory only

  const roleInputs = form.querySelectorAll('input[name="roles"]');
  const roleBlocks = form.querySelectorAll('[data-role-block]');
  const syncRoleBlocks = () => {
    const chosen = [...roleInputs].filter((i) => i.checked).map((i) => i.value);
    roleBlocks.forEach((block) => {
      const wanted = block.getAttribute('data-role-block').split(' ');
      const show = chosen.some((r) => wanted.includes(r));
      block.hidden = !show;
      block.querySelectorAll('input, select, textarea').forEach((c) => { c.disabled = !show; });
    });
    const caveat = form.querySelector('[data-unregulated-note]');
    if (caveat) caveat.hidden = !chosen.some((r) => r === 'coach' || r === 'training-provider');
  };
  roleInputs.forEach((i) => i.addEventListener('change', syncRoleBlocks));
  syncRoleBlocks();

  const collect = () => {
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (v instanceof File) { draft[k] = v.name ? { name: v.name, size: v.size } : draft[k]; continue; }
      if (draft[k] && Array.isArray(draft[k])) draft[k].push(v);
      else if (k in draft && fd.getAll(k).length > 1) draft[k] = fd.getAll(k);
      else draft[k] = fd.getAll(k).length > 1 ? fd.getAll(k) : v;
    }
  };

  const renderReview = () => {
    const out = form.querySelector('[data-review]');
    if (!out) return;
    collect();
    const sections = panels.slice(0, -1).map((panel, i) => {
      const title = panel.getAttribute('data-step-title');
      const fields = [...panel.querySelectorAll('.form-field, .form-check')].filter((f) => !f.closest('[hidden]'));
      const rows = fields.map((f) => {
        const ctrl = f.querySelector('input, select, textarea');
        if (!ctrl || ctrl.type === 'password') return '';
        const label = f.querySelector('label')?.textContent?.replace('*', '').trim();
        let value = '';
        if (ctrl.type === 'checkbox') value = ctrl.checked ? 'Yes' : '';
        else if (ctrl.type === 'file') value = ctrl.files?.[0]?.name || '';
        else if (ctrl.tagName === 'SELECT') value = ctrl.selectedOptions[0]?.textContent || '';
        else value = ctrl.value;
        if (ctrl.type === 'checkbox' && ctrl.name === 'roles') return '';
        const missing = ctrl.required && !value;
        return `<dt>${label}</dt><dd>${missing ? '<span class="review-block__missing">Missing</span>' : (value ? escape(value) : '<span class="mute">Not provided</span>')}</dd>`;
      }).join('');
      const roles = i === 1 ? `<dt>Roles</dt><dd>${[...roleInputs].filter((r) => r.checked).map((r) => r.parentElement.textContent.trim()).join(', ') || '<span class="review-block__missing">Missing</span>'}</dd>` : '';
      return `<div class="review-block"><div class="review-block__head"><p class="review-block__title">${i + 1}. ${title}</p><button type="button" class="button button--quiet button--small" data-goto="${i}">Edit</button></div><dl>${roles}${rows}</dl></div>`;
    });
    out.innerHTML = sections.join('');
  };
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const show = (n, { focus = true } = {}) => {
    step = Math.max(0, Math.min(panels.length - 1, n));
    panels.forEach((p, i) => { p.classList.toggle('is-active', i === step); p.hidden = i !== step; });
    progress.forEach((p, i) => { p.classList.toggle('is-done', i < step); p.classList.toggle('is-current', i === step); p.setAttribute('aria-current', i === step ? 'step' : 'false'); });
    if (statusEl) statusEl.textContent = `Step ${step + 1} of ${panels.length}: ${panels[step].getAttribute('data-step-title')}`;
    if (step === panels.length - 1) renderReview();
    if (focus) { const h = panels[step].querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } }
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 96, behavior: 'smooth' });
  };

  form.addEventListener('click', (e) => {
    const next = e.target.closest('[data-next]');
    const back = e.target.closest('[data-back]');
    const goto = e.target.closest('[data-goto]');
    if (next) { e.preventDefault(); if (validateContainer(panels[step])) { collect(); show(step + 1); } }
    if (back) { e.preventDefault(); show(step - 1); }
    if (goto) { e.preventDefault(); show(Number(goto.dataset.goto)); }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Validate every step; jump to the first one with a problem.
    for (let i = 0; i < panels.length - 1; i += 1) {
      if (!validateContainer(panels[i])) { show(i); toast('Some sections are incomplete. Missing sections are marked.', { type: 'error' }); return; }
    }
    if (!validateContainer(panels[panels.length - 1])) return;
    collect();
    /*
     * BACKEND REQUIRED
     * POST /api/applications (multipart/form-data) with the draft and documents.
     * The server creates the applicant account, stores documents in private
     * storage, emails the applicant a confirmation, and queues the application
     * for verification review. Nothing sensitive is kept in the browser.
     */
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending application…';
    window.setTimeout(() => { location.href = url('thank-you/'); }, 700);
  });

  show(0, { focus: false });
}

/* ---------------------------------------------------------------------- */
/* Generic "demo submit" forms (contact-free): show a success state         */
/* ---------------------------------------------------------------------- */
export function initDemoForm(form) {
  initLiveValidation(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateContainer(form)) return;
    const success = form.querySelector('[data-success]') || document.getElementById(form.getAttribute('data-success-target'));
    if (success) { success.hidden = false; success.setAttribute('tabindex', '-1'); success.focus(); }
    toast(form.getAttribute('data-success-message') || 'Saved (prototype: nothing was sent).', { type: 'success' });
  });
}

/* ---------------------------------------------------------------------- */
/* File input labels                                                       */
/* ---------------------------------------------------------------------- */
export function initFileInputs(root = document) {
  root.querySelectorAll('input[type="file"]').forEach((input) => {
    input.addEventListener('change', () => {
      const hint = input.closest('.form-field')?.querySelector('[data-file-name]');
      if (hint) hint.textContent = input.files?.length ? `Selected: ${input.files[0].name}` : '';
    });
  });
}
