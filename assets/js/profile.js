/**
 * profile.js — therapist profile page enhancements.
 * The profile HTML is rendered statically (by the backend in production, by
 * tools/build.py in this prototype). JavaScript adds: live practice hours,
 * the booking interface, and the verification detail list.
 */
import { load } from './data.js';
import { setRoles, verificationListHtml } from './verification.js';
import { initBooking } from './booking.js';
import { renderHours, fromAvailability } from './hours.js';

export async function initProfile(page) {
  const id = page.getAttribute('data-therapist-id');
  const [therapists, roles] = await Promise.all([load('therapists'), load('roles')]);
  setRoles(roles);
  const record = therapists.find((t) => t.id === id);
  if (!record) return;
  const verEl = page.querySelector('[data-verification-detail]');
  if (verEl) verEl.innerHTML = verificationListHtml(record);
  const hoursEl = page.querySelector('[data-hours="member"]');
  if (hoursEl) renderHours(hoursEl, fromAvailability(record.availability, 'Practice hours'), { table: true });
  const bookingEl = page.querySelector('[data-booking]');
  if (bookingEl) initBooking(bookingEl, record);
}
