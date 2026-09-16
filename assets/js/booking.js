/**
 * booking.js — scheduling interface on therapist profiles.
 *
 * Generates the next 14 days from the member's weekly availability and lets
 * a visitor choose a date, a time and a session type, then request the slot.
 * States: available, selected, pending, confirmed, cancelled, unavailable.
 *
 * BACKEND INTEGRATION POINTS (see BACKEND-INTEGRATION.md → Booking API)
 *   GET  /api/therapists/:id/availability?from=&to=   → real slots
 *   POST /api/bookings                                → creates a PENDING request
 *   POST /api/bookings/:id/cancel                     → CANCELLED
 *   POST /api/bookings/:id/reschedule                 → new PENDING slot
 * Calendar sync (Google Calendar, Microsoft 365, or a Calendly-style tool)
 * belongs behind the same endpoints; the UI does not care which.
 *
 * Nothing here is connected to a live calendar. Requests are held in memory
 * for the page session only.
 */
import { toast, openModal } from './ui.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SLOT_MINUTES = 60;

function iso(d) { return d.toISOString().slice(0, 10); }
function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function fromMin(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

/** Mock slot generator. A real API returns slots already netted against bookings. */
export function generateSlots(availability, days = 14, { seed = 3 } = {}) {
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 1; i <= days; i += 1) {
    const d = new Date(today.getTime() + i * 86400000);
    const ranges = availability?.[DAY_KEYS[d.getDay()]] || [];
    const slots = [];
    ranges.forEach((r) => {
      for (let m = toMin(r.start); m + SLOT_MINUTES <= toMin(r.end); m += SLOT_MINUTES) {
        // Deterministic mock: mark some slots as already taken so the UI shows the state
        const taken = ((m / 60) + i * seed) % 5 === 0;
        slots.push({ time: fromMin(m), state: taken ? 'unavailable' : 'available' });
      }
    });
    out.push({ date: iso(d), label: d.toLocaleDateString('en-GB', { weekday: 'short' }), day: d.getDate(), month: d.toLocaleDateString('en-GB', { month: 'short' }), slots });
  }
  return out;
}

export function initBooking(el, record) {
  const online = !!record.online;
  const inPerson = !!record.inPerson;
  const days = generateSlots(record.availability);
  const requests = []; // in-memory only
  let selectedDate = days.find((d) => d.slots.some((s) => s.state === 'available'))?.date || days[0]?.date;
  let selectedTime = null;
  let mode = online ? 'online' : 'in-person';

  const datesEl = el.querySelector('[data-booking-dates]');
  const slotsEl = el.querySelector('[data-booking-slots]');
  const summaryEl = el.querySelector('[data-booking-summary]');
  const listEl = el.querySelector('[data-booking-list]');
  const requestBtn = el.querySelector('[data-booking-request]');
  const modeInputs = el.querySelectorAll('input[name="session-mode"]');
  const liveEl = el.querySelector('[data-booking-live]');

  modeInputs.forEach((i) => {
    if ((i.value === 'online' && !online) || (i.value === 'in-person' && !inPerson)) { i.disabled = true; i.closest('label')?.classList.add('mute'); }
    if (i.value === mode) i.checked = true;
    i.addEventListener('change', () => { mode = i.value; renderSummary(); });
  });

  const renderDates = () => {
    datesEl.innerHTML = days.map((d) => {
      const any = d.slots.some((s) => s.state === 'available');
      return `<button type="button" class="booking__date" data-date="${d.date}" aria-pressed="${d.date === selectedDate}" ${any ? '' : 'disabled'} aria-label="${d.label} ${d.day} ${d.month}${any ? '' : ', no availability'}"><span>${d.label}</span><strong>${d.day}</strong><span>${d.month}</span></button>`;
    }).join('');
  };
  const renderSlots = () => {
    const day = days.find((d) => d.date === selectedDate);
    if (!day || !day.slots.length) {
      slotsEl.innerHTML = '<div class="empty-state"><h3 class="h3">No availability on this day</h3><p>Availability changes as members update it. Try another day, or search for someone else who works online.</p></div>';
      return;
    }
    slotsEl.innerHTML = day.slots.map((s) => {
      const pending = requests.find((r) => r.date === day.date && r.time === s.time && r.state === 'pending');
      const confirmed = requests.find((r) => r.date === day.date && r.time === s.time && r.state === 'confirmed');
      if (confirmed) return `<button type="button" class="slot slot--selected" disabled aria-label="${s.time}, confirmed">${s.time} <span class="visually-hidden">confirmed</span></button>`;
      if (pending) return `<button type="button" class="slot slot--pending" disabled aria-label="${s.time}, requested">${s.time}</button>`;
      if (s.state !== 'available') return `<button type="button" class="slot slot--unavailable" disabled aria-label="${s.time}, unavailable">${s.time}</button>`;
      return `<button type="button" class="slot" data-time="${s.time}" aria-pressed="${s.time === selectedTime}">${s.time}</button>`;
    }).join('');
  };
  const renderSummary = () => {
    const day = days.find((d) => d.date === selectedDate);
    if (!selectedTime || !day) { summaryEl.innerHTML = '<p class="mute">Choose a day and a time to request a session.</p>'; requestBtn.disabled = true; return; }
    const dateText = new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    summaryEl.innerHTML = `<p><strong>${dateText} at ${selectedTime}</strong></p><p>${mode === 'online' ? 'Online session' : 'In person'} · ${SLOT_MINUTES} minutes · ${record.fees ? 'Fee as listed' : 'Fee to be confirmed by the therapist'}</p><p class="meta">This sends a request. The therapist confirms or suggests another time.</p>`;
    requestBtn.disabled = false;
  };
  const renderList = () => {
    if (!listEl) return;
    if (!requests.length) { listEl.innerHTML = ''; listEl.closest('[data-booking-requests]')?.setAttribute('hidden', ''); return; }
    listEl.closest('[data-booking-requests]')?.removeAttribute('hidden');
    listEl.innerHTML = requests.map((r) => `<li class="booking-list__item">
      <div><p><strong>${new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${r.time}</strong> · ${r.mode === 'online' ? 'Online' : 'In person'}</p><p class="status status--${r.state === 'confirmed' ? 'ok' : r.state === 'cancelled' ? 'off' : 'pending'}">${r.state.charAt(0).toUpperCase() + r.state.slice(1)}</p></div>
      <div class="booking-list__actions">${r.state !== 'cancelled' ? `<button type="button" class="button button--ghost button--small" data-cancel="${r.id}">Cancel</button><button type="button" class="button button--ghost button--small" data-reschedule="${r.id}">Reschedule</button>` : ''}${r.state === 'pending' ? `<button type="button" class="button button--quiet button--small" data-confirm="${r.id}" title="Prototype only: simulates the therapist confirming">Simulate confirm</button>` : ''}</div>
    </li>`).join('');
  };
  const announce = (t) => { if (liveEl) liveEl.textContent = t; };

  el.addEventListener('click', (e) => {
    const date = e.target.closest('[data-date]');
    const slot = e.target.closest('[data-time]');
    const cancel = e.target.closest('[data-cancel]');
    const confirm = e.target.closest('[data-confirm]');
    const resched = e.target.closest('[data-reschedule]');
    if (date) { selectedDate = date.dataset.date; selectedTime = null; renderDates(); renderSlots(); renderSummary(); announce(`Showing times for ${date.getAttribute('aria-label')}.`); }
    if (slot) { selectedTime = slot.dataset.time; renderSlots(); renderSummary(); announce(`${selectedTime} selected.`); }
    if (cancel) { const r = requests.find((x) => x.id === cancel.dataset.cancel); if (r) { r.state = 'cancelled'; renderList(); renderSlots(); toast('Request cancelled.', { type: 'info' }); } }
    if (confirm) { const r = requests.find((x) => x.id === confirm.dataset.confirm); if (r) { r.state = 'confirmed'; renderList(); renderSlots(); toast('Session confirmed (simulated).', { type: 'success' }); } }
    if (resched) { const r = requests.find((x) => x.id === resched.dataset.reschedule); if (r) { r.state = 'cancelled'; renderList(); renderSlots(); toast('Pick a new time below to reschedule.', { type: 'info' }); el.querySelector('[data-booking-dates]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
  });

  requestBtn.addEventListener('click', () => {
    if (!selectedTime) return;
    // BACKEND REQUIRED: POST /api/bookings { therapistId, date, time, mode }
    const req = { id: `req-${Date.now()}`, therapistId: record.id, date: selectedDate, time: selectedTime, mode, state: 'pending' };
    requests.unshift(req);
    selectedTime = null;
    renderSlots(); renderSummary(); renderList();
    const confirmEl = document.getElementById('booking-confirm-text');
    if (confirmEl) confirmEl.textContent = `Your request for ${new Date(req.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} at ${req.time} has been noted. In the live system the therapist would receive it by email and confirm, decline or suggest another time.`;
    openModal('booking-modal', requestBtn);
  });

  renderDates(); renderSlots(); renderSummary(); renderList();
}
