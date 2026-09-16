/**
 * directory.js — town, issue and town+issue pages.
 * The editorial copy is static. The matching profiles are rendered from the
 * data set so counts are computed at render time, never typed.
 */
import { loadAll, publishedOnly } from './data.js';
import { setRoles } from './verification.js';
import { cardHtml } from './search.js';

export async function initDirectory(page) {
  const town = page.getAttribute('data-town') || '';
  const issue = page.getAttribute('data-issue') || '';
  const grid = page.querySelector('[data-directory-results]');
  const countEl = page.querySelector('[data-directory-count]');
  if (!grid) return;
  const ctx = await loadAll('therapists', 'issues', 'roles');
  setRoles(ctx.roles);
  const list = publishedOnly(ctx.therapists).filter((r) => (!town || r.location.slug === town) && (!issue || r.issues.includes(issue)) && (r.roles || [r.role]).includes('therapist'));
  if (countEl) countEl.textContent = list.length ? `${list.length} verified ${list.length === 1 ? 'profile' : 'profiles'}` : 'No verified profiles yet';
  grid.innerHTML = list.length
    ? list.map((r) => cardHtml(r, ctx)).join('')
    : `<div class="empty-state"><h3 class="h3">No verified therapists listed here yet</h3><p>Profiles appear once a person has completed their checks. Online sessions widen the choice: many therapists elsewhere in the UK work online.</p><div class="empty-state__actions"><a class="button button--primary" href="${new URL('../../find-a-therapist/?online=1', import.meta.url).pathname}">See therapists who work online</a></div></div>`;
  grid.classList.toggle('profile-grid', list.length > 0);
}
