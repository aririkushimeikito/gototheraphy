/**
 * account.js — professional member dashboard (prototype).
 *
 * All account data here is a DEMO member object held in memory. In the live
 * system every view reads from the authenticated session:
 *   GET /api/me, GET /api/me/profile, GET /api/me/verification,
 *   GET /api/me/availability, GET /api/me/billing, GET /api/me/bookings
 * and writes back with PATCH/POST to the same resources (BACKEND REQUIRED).
 * No account data is written to localStorage or sessionStorage.
 */
import { load, escapeHtml, formatDate, url } from './data.js';
import { setRoles, badgeFor, verificationListHtml, checkLabel } from './verification.js';
import { toast, initTabs, openModal } from './ui.js';
import { renderHours, fromAvailability } from './hours.js';
import { initDemoForm } from './forms.js';

const VIEWS = ['dashboard', 'profile', 'verification', 'availability', 'billing', 'bookings', 'settings'];

/* Subscription states from the Stripe state machine (BACKEND-INTEGRATION.md) */
const SUBSCRIPTION_STATES = {
  trialing: { label: 'Trial', status: 'pending', text: 'Your membership is in its trial period. Your first payment is scheduled.' },
  active: { label: 'Active', status: 'ok', text: 'Your membership is active and your profile is listed.' },
  past_due: { label: 'Past due', status: 'warn', text: 'Your last payment failed. Update your card to keep your profile listed.' },
  unpaid: { label: 'Unpaid', status: 'warn', text: 'Payment has not been received. Your profile is hidden until this is resolved.' },
  canceled: { label: 'Cancelled', status: 'off', text: 'Your membership is cancelled. Your profile is no longer listed.' },
  incomplete: { label: 'Payment pending', status: 'pending', text: 'Your first payment has not completed yet. Finish checkout to activate membership.' }
};

export async function initAccount(shell) {
  const params = new URLSearchParams(location.search);
  const memberId = params.get('as') || 'demo-therapist-a';
  const [therapists, roles, pricing] = await Promise.all([load('therapists'), load('roles'), load('pricing')]);
  setRoles(roles);
  const member = therapists.find((t) => t.id === memberId) || therapists[0];
  const state = {
    member: structuredClone(member),
    subscription: { state: params.get('sub') || (member.verification.status === 'verified' ? 'active' : 'incomplete'), plan: pricing.plans[0], renews: '2026-10-16', cardLast4: '4242', invoices: [
      { id: 'inv_demo_003', date: '2026-09-16', amount: null, status: 'paid' },
      { id: 'inv_demo_002', date: '2026-08-16', amount: null, status: 'paid' },
      { id: 'inv_demo_001', date: '2026-07-16', amount: null, status: 'paid' }
    ] },
    bookings: [
      { id: 'bk_demo_1', date: '2026-09-22', time: '10:00', mode: 'online', state: 'pending', who: 'Enquirer (demo)' },
      { id: 'bk_demo_2', date: '2026-09-18', time: '14:00', mode: 'in-person', state: 'confirmed', who: 'Enquirer (demo)' }
    ],
    history: [
      { date: member.verification.lastReviewed || '2026-08-30', text: 'Annual review completed by a person', tone: 'ok' },
      { date: '2026-03-01', text: 'Insurance certificate renewed and rechecked', tone: 'ok' },
      { date: '2025-09-04', text: 'Application approved. Profile published.', tone: 'ok' },
      { date: '2025-08-30', text: 'Application received', tone: '' }
    ]
  };

  /* ---- Routing between views (hash based so links are shareable) ---- */
  const links = [...shell.querySelectorAll('.account-nav__link')];
  const views = Object.fromEntries(VIEWS.map((v) => [v, shell.querySelector(`[data-view="${v}"]`)]));
  const showView = (name, { focus = false } = {}) => {
    const target = VIEWS.includes(name) ? name : 'dashboard';
    VIEWS.forEach((v) => views[v]?.classList.toggle('is-active', v === target));
    links.forEach((a) => { if (a.getAttribute('href') === `#${target}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (focus) { const h = views[target]?.querySelector('h1, h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } }
    document.title = `${views[target]?.getAttribute('data-title') || 'Account'} | Gototherapy`;
  };
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), { focus: true }));
  showView(location.hash.slice(1));

  /* ---- Header ---- */
  const setText = (sel, text) => shell.querySelectorAll(sel).forEach((el) => { el.textContent = text; });
  setText('[data-member-name]', state.member.name);
  setText('[data-member-title]', state.member.title);
  setText('[data-member-initials]', state.member.initials);

  /* ---- Dashboard ---- */
  const renderDashboard = () => {
    const badge = badgeFor(state.member);
    const sub = SUBSCRIPTION_STATES[state.subscription.state];
    const completion = profileCompletion(state.member);
    const el = views.dashboard;
    el.querySelector('[data-dash-membership]').innerHTML = `<p class="dashboard-card__value">${sub.label}</p><p class="dashboard-card__text status status--${sub.status}">${sub.text}</p>`;
    el.querySelector('[data-dash-verification]').innerHTML = `<p class="dashboard-card__value">${badge.status === 'verified' ? 'Complete' : badge.status === 'partial' ? 'In progress' : 'Pending'}</p><p class="dashboard-card__text">${badge.status === 'verified' ? `Next annual recheck ${formatDate(state.member.verification.nextReview)}.` : `${badge.missing.length} ${badge.missing.length === 1 ? 'check' : 'checks'} outstanding: ${badge.missing.map(checkLabel).join(', ').toLowerCase()}.`}</p>`;
    el.querySelector('[data-dash-profile]').innerHTML = `<p class="dashboard-card__value">${completion.percent}%</p><div class="meter" role="img" aria-label="Profile ${completion.percent}% complete"><div class="meter__fill" style="width:${completion.percent}%"></div></div><p class="dashboard-card__text">${completion.missing.length ? `Still to add: ${completion.missing.join(', ')}.` : 'Every section is filled in.'}</p>`;
    el.querySelector('[data-dash-availability]').innerHTML = `<p class="dashboard-card__value">${state.member.acceptingClients ? 'Open' : 'Closed'}</p><p class="dashboard-card__text">${state.member.acceptingClients ? 'Your profile says you are taking new clients.' : 'Your profile says you are not taking new clients right now.'}</p>`;
    el.querySelector('[data-dash-visibility]').innerHTML = `<p class="dashboard-card__value">${badge.status === 'verified' && ['active', 'trialing'].includes(state.subscription.state) ? 'Listed' : 'Not listed'}</p><p class="dashboard-card__text">${badge.status === 'verified' && ['active', 'trialing'].includes(state.subscription.state) ? 'Your profile appears in search.' : 'Your profile is hidden until checks are complete and membership is active.'}</p>`;
    const hoursEl = el.querySelector('[data-hours="support"]');
    if (hoursEl && !hoursEl.dataset.ready) { import('./hours.js').then((m) => { m.renderHours(hoursEl, m.SUPPORT_HOURS, { table: false }); hoursEl.dataset.ready = '1'; }); }
    const myHours = el.querySelector('[data-hours="member"]');
    if (myHours) renderHours(myHours, fromAvailability(state.member.availability, 'Your practice'), { table: false });
  };

  /* ---- Profile ---- */
  const profileForm = views.profile.querySelector('form');
  const fillProfile = () => {
    const m = state.member;
    const f = profileForm.elements;
    f.title.value = m.title; f.town.value = m.location.town; f.online.checked = m.online; f.inperson.checked = m.inPerson; f.accepting.checked = m.acceptingClients;
    f.worksWith.value = m.profile.worksWith; f.sessions.value = m.profile.sessions; f.drawnTo.value = m.profile.drawnTo; f.beforeContact.value = m.profile.beforeContact;
    f.fee.value = m.fees?.session ?? ''; f.concessions.checked = !!m.fees?.concessions;
    Promise.all([load('issues'), load('modalities')]).then(([issues, modalities]) => {
      const iss = profileForm.querySelector('[data-issue-options]');
      const mod = profileForm.querySelector('[data-modality-options]');
      iss.innerHTML = issues.map((i) => `<label class="form-check"><input type="checkbox" name="issues" value="${i.slug}" ${m.issues.includes(i.slug) ? 'checked' : ''}><span class="form-check__label">${escapeHtml(i.name)}</span></label>`).join('');
      mod.innerHTML = modalities.map((i) => `<label class="form-check"><input type="checkbox" name="modalities" value="${i.slug}" ${m.modalities.includes(i.slug) ? 'checked' : ''}><span class="form-check__label">${escapeHtml(i.name)}<span class="form-field__hint">${escapeHtml(i.desc)}</span></span></label>`).join('');
    });
  };
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = profileForm.elements;
    const m = state.member;
    m.title = f.title.value.trim(); m.location.town = f.town.value.trim(); m.online = f.online.checked; m.inPerson = f.inperson.checked; m.acceptingClients = f.accepting.checked;
    m.profile = { worksWith: f.worksWith.value.trim(), sessions: f.sessions.value.trim(), drawnTo: f.drawnTo.value.trim(), beforeContact: f.beforeContact.value.trim() };
    m.issues = [...profileForm.querySelectorAll('input[name="issues"]:checked')].map((i) => i.value);
    m.modalities = [...profileForm.querySelectorAll('input[name="modalities"]:checked')].map((i) => i.value);
    m.fees = f.fee.value ? { session: Number(f.fee.value), currency: 'GBP', duration: '50 minutes', concessions: f.concessions.checked } : null;
    // BACKEND REQUIRED: PATCH /api/me/profile
    toast('Profile saved (prototype: held in memory only).', { type: 'success' });
    renderDashboard();
  });

  /* ---- Verification ---- */
  const renderVerification = () => {
    const el = views.verification;
    el.querySelector('[data-verification-list]').innerHTML = verificationListHtml(state.member);
    el.querySelector('[data-verification-badge]').innerHTML = `<p class="dashboard-card__label">Badge shown on your profile</p><p>${escapeHtml(badgeFor(state.member).text)}</p>`;
    const expiring = Object.entries(state.member.verification.checks).filter(([, c]) => c.expires).sort((a, b) => a[1].expires.localeCompare(b[1].expires));
    el.querySelector('[data-expiry-list]').innerHTML = expiring.length ? expiring.map(([k, c]) => {
      const days = Math.round((new Date(c.expires) - new Date()) / 86400000);
      const tone = days < 0 ? 'warn' : days < 60 ? 'warn' : 'ok';
      return `<li class="verify-list__item verify-list__item--${tone === 'ok' ? 'ok' : 'pending'}"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 11h18"/></svg><div><span class="verify-list__label">${escapeHtml(checkLabel(k))} ${days < 0 ? 'expired' : 'expires'} ${formatDate(c.expires)}</span><span class="verify-list__note">${days < 0 ? 'Upload the renewed document to stay listed.' : days < 60 ? `${days} days left. Upload the renewal when you have it.` : 'Nothing to do yet.'}</span></div></li>`;
    }).join('') : '<li class="mute">No expiry dates on file.</li>';
    el.querySelector('[data-verification-history]').innerHTML = state.history.map((h) => `<li class="timeline__item timeline__item--${h.tone}"><p class="timeline__date">${formatDate(h.date)}</p><p class="timeline__text">${escapeHtml(h.text)}</p></li>`).join('');
    const docs = el.querySelector('[data-document-list]');
    docs.innerHTML = Object.entries(state.member.verification.checks).map(([k, c]) => `<li class="doc-list__item"><span class="doc-list__icon"><svg class="icon icon--sm" aria-hidden="true" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg></span><div><p class="doc-list__name">${escapeHtml(checkLabel(k))} evidence</p><p class="doc-list__meta">${c.status === 'verified' ? `Checked ${formatDate(c.checkedOn)}` : 'Awaiting review'}${c.expires ? ` · expires ${formatDate(c.expires)}` : ''}</p></div><button type="button" class="button button--ghost button--small" data-upload="${k}">Replace</button></li>`).join('');
  };
  views.verification.addEventListener('click', (e) => {
    const b = e.target.closest('[data-upload]');
    if (b) { openModal('upload-modal', b); document.getElementById('upload-modal-check').textContent = checkLabel(b.dataset.upload); }
  });
  const uploadForm = document.getElementById('upload-form');
  uploadForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const file = uploadForm.querySelector('input[type="file"]');
    if (!file.files?.length) { file.focus(); return; }
    // BACKEND REQUIRED: POST /api/me/documents (multipart, private storage, virus scan). Nothing is uploaded here.
    document.getElementById('upload-modal').close();
    state.history.unshift({ date: new Date().toISOString().slice(0, 10), text: `New document uploaded for review: ${file.files[0].name}`, tone: '' });
    renderVerification();
    toast('Document received for review (prototype: not actually uploaded).', { type: 'success' });
    uploadForm.reset();
  });

  /* ---- Availability ---- */
  const availForm = views.availability.querySelector('form');
  const renderAvailability = () => {
    const days = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
    availForm.querySelector('[data-avail-rows]').innerHTML = days.map(([k, name]) => {
      const r = state.member.availability[k]?.[0];
      return `<div class="avail-row"><span class="avail-row__day">${name}</span><div class="avail-row__slots">
        <label class="switch"><input type="checkbox" name="open-${k}" ${r ? 'checked' : ''}><span class="switch__track" aria-hidden="true"></span><span class="visually-hidden">${name} available</span></label>
        <label class="visually-hidden" for="start-${k}">${name} start</label><input class="form-control" type="time" id="start-${k}" name="start-${k}" value="${r?.start || '09:00'}" ${r ? '' : 'disabled'}>
        <span class="mute">to</span>
        <label class="visually-hidden" for="end-${k}">${name} end</label><input class="form-control" type="time" id="end-${k}" name="end-${k}" value="${r?.end || '17:00'}" ${r ? '' : 'disabled'}>
      </div></div>`;
    }).join('');
    availForm.elements['accepting'].checked = state.member.acceptingClients;
    availForm.elements['mode-online'].checked = state.member.online;
    availForm.elements['mode-inperson'].checked = state.member.inPerson;
  };
  availForm.addEventListener('change', (e) => {
    if (e.target.name?.startsWith('open-')) {
      const k = e.target.name.slice(5);
      availForm.elements[`start-${k}`].disabled = !e.target.checked;
      availForm.elements[`end-${k}`].disabled = !e.target.checked;
    }
  });
  availForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = {};
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((k) => {
      const on = availForm.elements[`open-${k}`].checked;
      a[k] = on ? [{ start: availForm.elements[`start-${k}`].value, end: availForm.elements[`end-${k}`].value }] : [];
    });
    state.member.availability = a;
    state.member.acceptingClients = availForm.elements['accepting'].checked;
    state.member.online = availForm.elements['mode-online'].checked;
    state.member.inPerson = availForm.elements['mode-inperson'].checked;
    // BACKEND REQUIRED: PUT /api/me/availability
    toast('Availability saved (prototype).', { type: 'success' });
    renderDashboard();
  });

  /* ---- Billing ---- */
  const renderBilling = () => {
    const el = views.billing;
    const sub = SUBSCRIPTION_STATES[state.subscription.state];
    const plan = state.subscription.plan;
    el.querySelector('[data-billing-plan]').innerHTML = `<p class="dashboard-card__label">Current plan</p><p class="dashboard-card__value">${escapeHtml(plan.name)}</p><p class="dashboard-card__text">${plan.amount == null ? '<span class="placeholder" style="display:inline-block;padding:.35rem .7rem"><span class="placeholder__label">Price required</span>Set in Stripe and pricing.json</span>' : `£${plan.amount} per ${plan.interval}`}</p>`;
    el.querySelector('[data-billing-status]').innerHTML = `<p class="dashboard-card__label">Subscription</p><p class="dashboard-card__value">${sub.label}</p><p class="dashboard-card__text status status--${sub.status}">${sub.text}</p>${['active', 'trialing', 'past_due'].includes(state.subscription.state) ? `<p class="dashboard-card__text">Renews ${formatDate(state.subscription.renews)} · card ending ${state.subscription.cardLast4}</p>` : ''}`;
    const actions = el.querySelector('[data-billing-actions]');
    const s = state.subscription.state;
    actions.innerHTML = [
      s === 'incomplete' ? '<button type="button" class="button button--primary" data-bill="checkout">Complete payment</button>' : '',
      ['past_due', 'unpaid'].includes(s) ? '<button type="button" class="button button--primary" data-bill="portal">Update card</button>' : '',
      ['active', 'trialing', 'past_due'].includes(s) ? '<button type="button" class="button button--ghost" data-bill="portal">Manage billing</button><button type="button" class="button button--ghost" data-bill="cancel">Cancel subscription</button>' : '',
      s === 'canceled' ? '<button type="button" class="button button--primary" data-bill="checkout">Restart membership</button>' : ''
    ].join('');
    el.querySelector('[data-invoice-rows]').innerHTML = state.subscription.invoices.map((i) => `<tr><td>${formatDate(i.date)}</td><td>${escapeHtml(i.id)}</td><td>${i.amount == null ? '<span class="mute">Amount from Stripe</span>' : `£${i.amount}`}</td><td><span class="status status--${i.status === 'paid' ? 'ok' : i.status === 'failed' ? 'warn' : 'pending'}">${i.status.charAt(0).toUpperCase() + i.status.slice(1)}</span></td><td><a href="#" data-invoice="${i.id}">Receipt</a></td></tr>`).join('');
    el.querySelector('[data-state-select]').value = s;
  };
  views.billing.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bill]');
    const inv = e.target.closest('[data-invoice]');
    if (inv) { e.preventDefault(); toast('BACKEND REQUIRED: receipts are served from Stripe (invoice.hosted_invoice_url).', { type: 'info' }); }
    if (!b) return;
    const a = b.dataset.bill;
    if (a === 'checkout') { toast('BACKEND REQUIRED: POST /api/billing/checkout-session → redirect to Stripe Checkout.', { type: 'info', timeout: 7000 }); }
    if (a === 'portal') { toast('BACKEND REQUIRED: POST /api/billing/portal-session → redirect to the Stripe Billing Portal.', { type: 'info', timeout: 7000 }); }
    if (a === 'cancel') { openModal('cancel-modal', b); }
  });
  document.getElementById('cancel-confirm')?.addEventListener('click', () => {
    // BACKEND REQUIRED: POST /api/billing/cancel → Stripe subscription.cancel_at_period_end
    state.subscription.state = 'canceled';
    document.getElementById('cancel-modal').close();
    renderBilling(); renderDashboard();
    toast('Subscription cancelled (simulated). Your profile is no longer listed.', { type: 'info' });
  });
  views.billing.querySelector('[data-state-select]').addEventListener('change', (e) => {
    state.subscription.state = e.target.value;
    if (e.target.value === 'past_due') state.subscription.invoices.unshift({ id: 'inv_demo_004', date: new Date().toISOString().slice(0, 10), amount: null, status: 'failed' });
    renderBilling(); renderDashboard();
  });

  /* ---- Bookings ---- */
  const renderBookings = () => {
    const el = views.bookings.querySelector('[data-bookings]');
    if (!state.bookings.length) { el.innerHTML = '<div class="empty-state"><h3 class="h3">No session requests</h3><p>Requests from people who find your profile appear here. You can confirm, decline or suggest another time.</p></div>'; return; }
    el.innerHTML = `<ul class="booking-list">${state.bookings.map((b) => `<li class="booking-list__item"><div><p><strong>${formatDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })} at ${b.time}</strong> · ${b.mode === 'online' ? 'Online' : 'In person'} · ${escapeHtml(b.who)}</p><p class="status status--${b.state === 'confirmed' ? 'ok' : b.state === 'cancelled' || b.state === 'declined' ? 'off' : 'pending'}">${b.state.charAt(0).toUpperCase() + b.state.slice(1)}</p></div><div class="booking-list__actions">${b.state === 'pending' ? `<button type="button" class="button button--primary button--small" data-bk="confirm" data-id="${b.id}">Confirm</button><button type="button" class="button button--ghost button--small" data-bk="decline" data-id="${b.id}">Decline</button>` : b.state === 'confirmed' ? `<button type="button" class="button button--ghost button--small" data-bk="cancel" data-id="${b.id}">Cancel</button>` : ''}</div></li>`).join('')}</ul>`;
  };
  views.bookings.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bk]');
    if (!b) return;
    const bk = state.bookings.find((x) => x.id === b.dataset.id);
    if (!bk) return;
    bk.state = b.dataset.bk === 'confirm' ? 'confirmed' : b.dataset.bk === 'decline' ? 'declined' : 'cancelled';
    // BACKEND REQUIRED: POST /api/bookings/:id/(confirm|decline|cancel) → emails both parties
    renderBookings();
    toast(`Session ${bk.state} (prototype).`, { type: 'success' });
  });

  /* ---- Settings ---- */
  views.settings.querySelectorAll('form').forEach((f) => initDemoForm(f));
  views.settings.querySelector('[data-signout]')?.addEventListener('click', (e) => {
    e.preventDefault();
    // BACKEND REQUIRED: POST /api/auth/logout → clears the httpOnly session cookie
    location.href = url('login/') + '?signed-out=1';
  });

  initTabs(shell);
  fillProfile(); renderDashboard(); renderVerification(); renderAvailability(); renderBilling(); renderBookings();

  // Demo member switcher
  shell.querySelector('[data-member-switch]')?.addEventListener('change', (e) => { location.search = `?as=${e.target.value}`; });
  const sw = shell.querySelector('[data-member-switch]');
  if (sw) { sw.innerHTML = therapists.map((t) => `<option value="${t.id}" ${t.id === state.member.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join(''); }
}

function profileCompletion(m) {
  const checks = [
    ['photo', !!m.photo, 'a photo'],
    ['worksWith', m.profile.worksWith?.length > 40, 'who you work with'],
    ['sessions', m.profile.sessions?.length > 40, 'what sessions are like'],
    ['drawnTo', m.profile.drawnTo?.length > 40, 'what drew you to the work'],
    ['beforeContact', m.profile.beforeContact?.length > 40, 'what to know before contacting you'],
    ['issues', m.issues.length > 0, 'issues you work with'],
    ['modalities', m.modalities.length > 0, 'your approach'],
    ['fees', !!m.fees, 'fees'],
    ['availability', Object.values(m.availability).some((d) => d.length), 'availability']
  ];
  const done = checks.filter((c) => c[1]).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter((c) => !c[1]).map((c) => c[2]) };
}
