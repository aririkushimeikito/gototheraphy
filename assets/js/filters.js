/**
 * filters.js — pure functions for search state: parse from the URL, apply to
 * records, sort, paginate, and serialise back to the URL.
 * No DOM here, so the same logic can run server-side later.
 */

export const PAGE_SIZE = 9;

export const DEFAULT_FILTERS = { q: '', location: '', issue: '', role: '', online: false, modality: '', accepting: false, sort: 'name', page: 1 };

export function parseFilters(search = window.location.search, overrides = {}) {
  const p = new URLSearchParams(search);
  return {
    ...DEFAULT_FILTERS,
    q: (p.get('q') || '').trim(),
    location: p.get('location') || '',
    issue: p.get('issue') || '',
    role: p.get('role') || '',
    modality: p.get('modality') || '',
    online: p.get('online') === '1',
    accepting: p.get('accepting') === '1',
    sort: p.get('sort') || 'name',
    page: Math.max(1, Number(p.get('page')) || 1),
    ...overrides
  };
}

export function serialiseFilters(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.location) p.set('location', f.location);
  if (f.issue) p.set('issue', f.issue);
  if (f.role) p.set('role', f.role);
  if (f.modality) p.set('modality', f.modality);
  if (f.online) p.set('online', '1');
  if (f.accepting) p.set('accepting', '1');
  if (f.sort && f.sort !== 'name') p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

function textOf(r) {
  return [r.name, r.title, r.location?.town, r.location?.region, ...(r.issues || []), ...(r.modalities || []), r.profile?.worksWith].join(' ').toLowerCase();
}

export function applyFilters(records, f) {
  const q = f.q.toLowerCase();
  return records.filter((r) => {
    if (f.role && !(r.roles || [r.role]).includes(f.role)) return false;
    if (f.location && r.location?.slug !== f.location) return false;
    if (f.issue && !(r.issues || []).includes(f.issue)) return false;
    if (f.modality && !(r.modalities || []).includes(f.modality)) return false;
    if (f.online && !r.online) return false;
    if (f.accepting && !r.acceptingClients) return false;
    if (q && !textOf(r).includes(q)) return false;
    return true;
  });
}

export function sortRecords(records, sort) {
  const list = [...records];
  if (sort === 'recent') list.sort((a, b) => (b.verification?.lastReviewed || '').localeCompare(a.verification?.lastReviewed || ''));
  else if (sort === 'location') list.sort((a, b) => (a.location?.town || '').localeCompare(b.location?.town || '') || a.name.localeCompare(b.name));
  else list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

export function paginate(records, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(records.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { items: records.slice(start, start + size), page: current, pages, total: records.length };
}

export function activeFilterCount(f) {
  return ['location', 'issue', 'role', 'modality'].filter((k) => f[k]).length + (f.online ? 1 : 0) + (f.accepting ? 1 : 0) + (f.q ? 1 : 0);
}
