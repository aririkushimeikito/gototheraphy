/**
 * data.js — loads the mock JSON data and exposes small lookup helpers.
 *
 * BACKEND INTEGRATION POINT
 * Replace the fetch targets with the Therapist API (see BACKEND-INTEGRATION.md).
 * Everything else in the frontend reads through these functions, so the swap
 * is confined to this file.
 */

/** Site root derived from this module's URL, so the site works at "/" or under a sub-path (e.g. GitHub Pages). */
export const ROOT = new URL('../../', import.meta.url).pathname;

const ENDPOINTS = {
  therapists: `${ROOT}data/therapists.json`,   // → GET /api/therapists?status=published
  locations: `${ROOT}data/locations.json`,     // → GET /api/locations
  issues: `${ROOT}data/issues.json`,           // → GET /api/issues
  modalities: `${ROOT}data/modalities.json`,   // → GET /api/modalities
  roles: `${ROOT}data/roles.json`,             // → static config, can stay in the frontend
  articles: `${ROOT}data/articles.json`,       // → GET /api/articles (CMS)
  pricing: `${ROOT}data/pricing.json`          // → GET /api/pricing (mirrors Stripe Prices)
};

/** Builds a site-relative URL: url('find-a-therapist/') */
export function url(path) { return ROOT + String(path).replace(/^\//, ''); }

const cache = new Map();

export async function load(name) {
  if (cache.has(name)) return cache.get(name);
  const url = ENDPOINTS[name];
  if (!url) throw new Error(`Unknown data set: ${name}`);
  const promise = fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => {
      if (!r.ok) throw new Error(`Could not load ${name} (${r.status})`);
      return r.json();
    })
    .then((json) => (Array.isArray(json) || name === 'roles' || name === 'pricing' ? json : json.records ?? json));
  cache.set(name, promise);
  return promise;
}

export async function loadAll(...names) {
  const results = await Promise.all(names.map(load));
  return Object.fromEntries(names.map((n, i) => [n, results[i]]));
}

export function bySlug(list, slug) {
  return (list || []).find((item) => item.slug === slug) || null;
}

/** Published = verification complete. Pending profiles never appear in public search. */
export function publishedOnly(records) {
  return records.filter((r) => r.verification && r.verification.status === 'verified');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return new Intl.DateTimeFormat('en-GB', opts).format(d);
}
