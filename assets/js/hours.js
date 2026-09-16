/**
 * hours.js — operating hours engine.
 *
 * One configuration object, easy to replace with backend data later
 * (GET /api/hours or the member's availability from the Therapist API).
 * Times are in the Europe/London zone. Nothing is hard-coded as "open":
 * the status is computed from the current day and time every minute.
 *
 * PLACEHOLDER: SUPPORT_HOURS below are illustrative configuration for the
 * prototype. Confirm real member-support hours before publishing.
 */

export const SUPPORT_HOURS = {
  timezone: 'Europe/London',
  label: 'Member support',
  placeholder: true,
  week: {
    mon: [{ open: '09:00', close: '17:00' }],
    tue: [{ open: '09:00', close: '17:00' }],
    wed: [{ open: '09:00', close: '17:00' }],
    thu: [{ open: '09:00', close: '17:00' }],
    fri: [{ open: '09:00', close: '16:00' }],
    sat: [],
    sun: []
  },
  // Special closures: ISO dates. A date here overrides the weekly pattern.
  closures: [
    { date: '2026-12-25', reason: 'Christmas Day' },
    { date: '2026-12-26', reason: 'Boxing Day' },
    { date: '2027-01-01', reason: 'New Year’s Day' }
  ],
  // Special hours: ISO date → array of ranges (empty array = closed)
  special: {
    '2026-12-24': [{ open: '09:00', close: '13:00' }]
  }
};

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Current wall-clock parts in the configured timezone. */
function nowIn(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekday = get('weekday').toLowerCase().slice(0, 3);
  const hour = Number(get('hour')) % 24;
  return { day: weekday, minutes: hour * 60 + Number(get('minute')), iso: `${get('year')}-${get('month')}-${get('day')}` };
}

function rangesFor(config, dayKey, iso) {
  if (config.closures?.some((c) => c.date === iso)) return { ranges: [], closure: config.closures.find((c) => c.date === iso) };
  if (config.special && config.special[iso]) return { ranges: config.special[iso], closure: null };
  return { ranges: config.week[dayKey] || [], closure: null };
}

/** Normalises member availability ({start,end}) into the {open,close} shape. */
export function fromAvailability(availability, label = 'Availability') {
  const week = {};
  DAYS.forEach((d) => { week[d] = (availability?.[d] || []).map((r) => ({ open: r.start, close: r.end })); });
  return { timezone: 'Europe/London', label, week, closures: [], special: {} };
}

/**
 * Computes the open/closed state.
 * @returns {{ isOpen:boolean, text:string, detail:string, todayRanges:Array, day:string }}
 */
export function getStatus(config, date = new Date()) {
  const now = nowIn(config.timezone, date);
  const { ranges, closure } = rangesFor(config, now.day, now.iso);
  const current = ranges.find((r) => now.minutes >= toMinutes(r.open) && now.minutes < toMinutes(r.close));
  if (current) {
    return { isOpen: true, text: 'Open now', detail: `Closes at ${current.close}`, todayRanges: ranges, day: now.day };
  }
  const later = ranges.find((r) => now.minutes < toMinutes(r.open));
  if (later) {
    return { isOpen: false, text: 'Closed now', detail: `Opens at ${later.open}`, todayRanges: ranges, day: now.day };
  }
  // Find the next day with hours (up to 14 days ahead to clear closures)
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(date.getTime() + i * 86400000);
    const n = nowIn(config.timezone, d);
    const next = rangesFor(config, n.day, n.iso);
    if (next.ranges.length) {
      const dayLabel = i === 1 ? 'tomorrow' : `on ${DAY_NAMES[n.day]}`;
      return { isOpen: false, text: closure ? `Closed for ${closure.reason}` : 'Closed now', detail: `Opens ${dayLabel} at ${next.ranges[0].open}`, todayRanges: ranges, day: now.day };
    }
  }
  return { isOpen: false, text: 'Closed', detail: 'No opening hours are set', todayRanges: ranges, day: now.day };
}

/** Renders a status line and optional weekly table into an element. */
export function renderHours(el, config, { table = true } = {}) {
  const update = () => {
    const s = getStatus(config);
    const rows = table
      ? `<ul class="hours__list">${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => {
        const r = config.week[d] || [];
        const txt = r.length ? r.map((x) => `${x.open}–${x.close}`).join(', ') : 'Closed';
        return `<li class="hours__row${d === s.day ? ' is-today' : ''}"><span>${DAY_NAMES[d]}</span><span>${txt}</span></li>`;
      }).join('')}</ul>`
      : '';
    const note = config.placeholder ? '<p class="hours__note">Placeholder hours for the prototype. Confirm before publishing.</p>' : '';
    el.innerHTML = `<p class="hours__status status ${s.isOpen ? 'status--ok' : 'status--off'}"><span>${config.label}: ${s.text}.</span> <span class="mute">${s.detail}</span></p>${rows}${note}`;
  };
  update();
  const timer = window.setInterval(update, 60000);
  return () => window.clearInterval(timer);
}

export function initHours(root = document) {
  root.querySelectorAll('[data-hours="support"]').forEach((el) => renderHours(el, SUPPORT_HOURS, { table: el.hasAttribute('data-hours-table') }));
}
