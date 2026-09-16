/**
 * search.js — therapist search page and role directories.
 * Loads mock data, renders cards, filters, sorts, paginates, and keeps the
 * URL in sync so a search can be shared. Pagination past page one and
 * facet combinations are noindex,follow (meta robots is toggled here).
 */
import { loadAll, publishedOnly, escapeHtml, url } from './data.js';
import { setRoles, badgeHtml, badgeFor } from './verification.js';
import { parseFilters, serialiseFilters, applyFilters, sortRecords, paginate, activeFilterCount, PAGE_SIZE } from './filters.js';

const ICON_PIN = '<svg class="icon icon--sm" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>';
const ICON_VIDEO = '<svg class="icon icon--sm" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>';

export function cardHtml(r, ctx) {
  const issueNames = (r.issues || []).slice(0, 3).map((s) => ctx.issues.find((i) => i.slug === s)?.name).filter(Boolean);
  const modes = [r.inPerson ? 'In person' : null, r.online ? 'Online' : null].filter(Boolean).join(' and ');
  const demo = r.demo ? '<span class="badge badge--demo">Demo record</span>' : '';
  const accepting = r.acceptingClients ? '' : '<li><span class="status status--off">Not taking new clients</span></li>';
  return `<article class="card card--hover profile-card">
    <div class="profile-card__badges">${badgeHtml(r)}${demo}</div>
    <div class="profile-card__top">
      <span class="avatar" aria-hidden="true">${r.photo ? `<img src="${escapeHtml(r.photo)}" alt="" width="64" height="64">` : escapeHtml(r.initials)}</span>
      <div>
        <h3 class="profile-card__name"><a href="${url(`therapist/${r.slug}/`)}">${escapeHtml(r.name)}</a></h3>
        <p class="profile-card__role">${escapeHtml(r.title)}</p>
      </div>
    </div>
    <ul class="profile-card__meta">
      <li>${ICON_PIN}<span>${escapeHtml(r.location.town)}</span></li>
      ${modes ? `<li>${ICON_VIDEO}<span>${modes}</span></li>` : ''}
      ${accepting}
    </ul>
    ${issueNames.length ? `<p class="profile-card__text">Works with ${escapeHtml(issueNames.join(', ').toLowerCase())}.</p>` : `<p class="profile-card__text">${escapeHtml(r.profile?.worksWith || '')}</p>`}
    ${badgeFor(r).unregulated ? `<p class="meta">${escapeHtml(ctx.roles.caveat)}</p>` : ''}
  </article>`;
}

function emptyStateHtml(f) {
  const count = activeFilterCount(f);
  return `<div class="empty-state">
    <h2 class="h3">No matches for this search</h2>
    <p>${count > 1 ? 'Try removing one filter at a time. Location and issue together narrow things quickly.' : 'Try a different town, a broader issue, or include online sessions so location matters less.'}</p>
    <div class="empty-state__actions">
      <button type="button" class="button button--ghost" data-action="clear">Clear all filters</button>
      ${!f.online ? '<button type="button" class="button button--ghost" data-action="online">Include online sessions</button>' : ''}
    </div>
  </div>`;
}

function paginationHtml(p, f) {
  if (p.pages <= 1) return '';
  const link = (n, label, current = false) => `<a class="pagination__link" href="${serialiseFilters({ ...f, page: n })}" data-page-number="${n}"${current ? ' aria-current="page"' : ''}${label ? ` aria-label="${label}"` : ''}>${label ? '' : n}${label === 'Previous page' ? 'Previous' : label === 'Next page' ? 'Next' : ''}</a>`;
  const items = [];
  if (p.page > 1) items.push(link(p.page - 1, 'Previous page'));
  for (let n = 1; n <= p.pages; n += 1) items.push(link(n, '', n === p.page));
  if (p.page < p.pages) items.push(link(p.page + 1, 'Next page'));
  return `<nav class="pagination" aria-label="Search results pages">${items.join('')}</nav>`;
}

function setRobots(f) {
  const meta = document.querySelector('meta[name="robots"]');
  if (!meta) return;
  const facetted = f.page > 1 || activeFilterCount(f) > 0;
  meta.setAttribute('content', facetted ? 'noindex, follow' : 'index, follow');
}

export async function initSearch(rootEl) {
  const form = rootEl.querySelector('[data-search-form]');
  const results = rootEl.querySelector('[data-search-results]');
  const summary = rootEl.querySelector('[data-search-summary]');
  const pager = rootEl.querySelector('[data-search-pagination]');
  const live = rootEl.querySelector('[data-search-live]');
  const fixedRole = rootEl.getAttribute('data-role') || '';

  let ctx;
  try {
    ctx = await loadAll('therapists', 'locations', 'issues', 'modalities', 'roles');
  } catch (err) {
    results.innerHTML = '<div class="empty-state"><h2 class="h3">Search is unavailable</h2><p>The directory data could not be loaded. Please try again in a moment.</p></div>';
    return;
  }
  setRoles(ctx.roles);
  const published = publishedOnly(ctx.therapists);

  // Populate selects from data (counts are computed, never typed)
  const fill = (name, list, labelKey = 'name') => {
    const sel = form?.querySelector(`[name="${name}"]`);
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = `<option value="">${sel.getAttribute('data-any') || 'Any'}</option>` + list.map((o) => `<option value="${escapeHtml(o.slug)}">${escapeHtml(o[labelKey])}</option>`).join('');
    sel.value = keep;
  };
  const townsWithMembers = ctx.locations.filter((l) => published.some((r) => r.location.slug === l.slug && (!fixedRole || (r.roles || [r.role]).includes(fixedRole))));
  fill('location', townsWithMembers);
  fill('issue', ctx.issues);
  fill('modality', ctx.modalities);
  fill('role', ctx.roles.records);

  let filters = parseFilters(location.search, fixedRole ? { role: fixedRole } : {});

  const writeForm = () => {
    if (!form) return;
    ['q', 'location', 'issue', 'role', 'modality', 'sort'].forEach((k) => { const el = form.elements[k]; if (el) el.value = filters[k] || ''; });
    ['online', 'accepting'].forEach((k) => { const el = form.elements[k]; if (el) el.checked = !!filters[k]; });
  };
  const readForm = () => {
    if (!form) return;
    const fd = new FormData(form);
    filters = { ...filters, q: (fd.get('q') || '').toString().trim(), location: fd.get('location') || '', issue: fd.get('issue') || '', role: fixedRole || fd.get('role') || '', modality: fd.get('modality') || '', online: fd.get('online') === '1', accepting: fd.get('accepting') === '1', sort: fd.get('sort') || 'name' };
  };

  const render = ({ push = true, announce = true } = {}) => {
    const matched = sortRecords(applyFilters(published, filters), filters.sort);
    const p = paginate(matched, filters.page, PAGE_SIZE);
    filters.page = p.page;
    results.innerHTML = p.items.length ? p.items.map((r) => cardHtml(r, ctx)).join('') : emptyStateHtml(filters);
    results.classList.toggle('profile-grid', p.items.length > 0);
    if (pager) pager.innerHTML = paginationHtml(p, filters);
    if (summary) {
      const from = p.total ? (p.page - 1) * PAGE_SIZE + 1 : 0;
      const to = Math.min(p.total, p.page * PAGE_SIZE);
      summary.innerHTML = `<p>${p.total ? `Showing ${from}–${to} of ${p.total} ${p.total === 1 ? 'profile' : 'profiles'}` : 'No profiles match'}${activeFilterCount(filters) ? ` with ${activeFilterCount(filters)} ${activeFilterCount(filters) === 1 ? 'filter' : 'filters'}` : ''}. Demo records only.</p>${activeFilterCount(filters) ? '<button type="button" class="button button--quiet button--small" data-action="clear">Clear filters</button>' : ''}`;
    }
    if (live && announce) live.textContent = p.total ? `${p.total} profiles found.` : 'No profiles found.';
    setRobots(filters);
    if (push) history.replaceState(null, '', location.pathname + serialiseFilters(fixedRole ? { ...filters, role: '' } : filters));
  };

  form?.addEventListener('submit', (e) => { e.preventDefault(); readForm(); filters.page = 1; render(); results.focus?.(); });
  form?.addEventListener('change', (e) => { if (e.target.matches('select, input[type="checkbox"]')) { readForm(); filters.page = 1; render(); } });
  form?.querySelector('[name="q"]')?.addEventListener('input', () => { readForm(); filters.page = 1; render({ announce: false }); });

  rootEl.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'clear') { filters = parseFilters('', fixedRole ? { role: fixedRole } : {}); writeForm(); render(); }
      if (action.dataset.action === 'online') { filters.online = true; filters.page = 1; writeForm(); render(); }
      return;
    }
    const page = e.target.closest('[data-page-number]');
    if (page) { e.preventDefault(); filters.page = Number(page.dataset.pageNumber); render(); rootEl.querySelector('[data-search-top]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  // Quick chips (e.g. issue shortcuts) anywhere in the page
  document.querySelectorAll('[data-filter-chip]').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const [k, v] = chip.getAttribute('data-filter-chip').split('=');
      filters = { ...filters, [k]: v === '1' ? true : v, page: 1 };
      writeForm(); render();
      rootEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  writeForm();
  render({ push: false });
}

/** Homepage search card: submits to /find-a-therapist/ with query parameters. */
export function initSearchLauncher(form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const f = parseFilters('', { location: fd.get('location') || '', issue: fd.get('issue') || '', online: fd.get('online') === '1', role: fd.get('role') || '' });
    location.href = url('find-a-therapist/') + serialiseFilters(f);
  });
  loadAll('locations', 'issues', 'therapists').then(({ locations, issues, therapists }) => {
    const published = publishedOnly(therapists);
    const towns = locations.filter((l) => published.some((r) => r.location.slug === l.slug));
    const loc = form.querySelector('[name="location"]');
    const iss = form.querySelector('[name="issue"]');
    if (loc) loc.innerHTML = '<option value="">Anywhere in the UK</option>' + towns.map((t) => `<option value="${escapeHtml(t.slug)}">${escapeHtml(t.name)}</option>`).join('');
    if (iss) iss.innerHTML = '<option value="">Anything</option>' + issues.map((i) => `<option value="${escapeHtml(i.slug)}">${escapeHtml(i.name)}</option>`).join('');
  }).catch(() => {});
}

/** Renders a small preview grid (homepage, town pages). */
export async function renderPreview(el, { limit = 3, filter = () => true } = {}) {
  try {
    const ctx = await loadAll('therapists', 'issues', 'roles');
    setRoles(ctx.roles);
    const list = publishedOnly(ctx.therapists).filter(filter).slice(0, limit);
    el.innerHTML = list.length ? list.map((r) => cardHtml(r, ctx)).join('') : '<div class="empty-state"><h3 class="h3">No verified profiles yet</h3><p>Profiles appear here once a person has completed their checks.</p></div>';
    el.classList.toggle('profile-grid', list.length > 0);
    return list;
  } catch (err) {
    el.innerHTML = '<p class="mute">Profiles could not be loaded.</p>';
    return [];
  }
}
