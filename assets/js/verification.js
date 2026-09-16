/**
 * verification.js — role-specific verification logic.
 *
 * The badge is conditional on role (Design System v2.0, Part Six). A therapist,
 * a supervisor and a coach cannot share one badge. Unregulated roles print a
 * caveat on the profile itself.
 */
import { escapeHtml } from './data.js';

let rolesConfig = null;
export function setRoles(config) { rolesConfig = config; }

function roleDef(slug) {
  const list = rolesConfig?.records || rolesConfig || [];
  return list.find((r) => r.slug === slug) || null;
}

export function roleName(slug) {
  return roleDef(slug)?.name || slug;
}

export function checkLabel(key) {
  return rolesConfig?.checkLabels?.[key] || key;
}

export function caveatText() {
  return rolesConfig?.caveat || 'This is not a regulated profession in the UK, so there is no register to check.';
}

/**
 * Returns the badge to print for a record. Holding two roles means meeting
 * both standards, so the required checks are the union across roles.
 */
export function badgeFor(record) {
  const roles = record.roles?.length ? record.roles : [record.role];
  const required = new Set();
  let unregulated = false;
  const badgeParts = [];
  roles.forEach((slug) => {
    const def = roleDef(slug);
    if (!def) return;
    def.checks.forEach((c) => required.add(c));
    if (!def.regulated) unregulated = true;
    badgeParts.push(def.badge);
  });
  const checks = record.verification?.checks || {};
  const missing = [...required].filter((c) => checks[c]?.status !== 'verified');
  const status = record.verification?.status === 'verified' && missing.length === 0 ? 'verified' : missing.length < required.size ? 'partial' : 'pending';
  const primary = roleDef(record.role);
  return {
    status,
    text: status === 'verified' ? (primary?.badge || badgeParts[0] || 'Checked') : status === 'partial' ? 'Checks in progress' : 'Not yet checked',
    required: [...required],
    missing,
    unregulated
  };
}

export function badgeHtml(record, { small = false } = {}) {
  const b = badgeFor(record);
  const cls = b.status === 'verified' ? 'badge--verified' : b.status === 'partial' ? 'badge--partial' : 'badge--pending';
  const icon = b.status === 'verified'
    ? '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  return `<span class="badge ${cls}${small ? ' badge--small' : ''}">${icon}<span>${escapeHtml(b.text)}</span></span>`;
}

export function verificationListHtml(record) {
  const b = badgeFor(record);
  const checks = record.verification?.checks || {};
  const items = b.required.map((key) => {
    const c = checks[key];
    const ok = c?.status === 'verified';
    const cls = ok ? 'ok' : 'pending';
    const icon = ok
      ? '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>';
    const note = c ? escapeHtml(c.detail) : 'Not yet supplied';
    const when = c?.checkedOn ? ` · checked ${escapeHtml(c.checkedOn)}` : '';
    const exp = c?.expires ? ` · expires ${escapeHtml(c.expires)}` : '';
    return `<li class="verify-list__item verify-list__item--${cls}">${icon}<div><span class="verify-list__label">${escapeHtml(checkLabel(key))}: ${ok ? 'checked' : 'pending'}</span><span class="verify-list__note">${note}${when}${exp}</span></div></li>`;
  });
  const caveat = b.unregulated ? `<p class="caveat">${escapeHtml(caveatText())}</p>` : '';
  const reviewed = record.verification?.lastReviewed
    ? `<p class="meta" style="margin:1rem 0 0">Last reviewed ${escapeHtml(record.verification.lastReviewed)}. Next annual recheck ${escapeHtml(record.verification.nextReview || 'to be scheduled')}.</p>`
    : '<p class="meta" style="margin:1rem 0 0">Checks are in progress. This profile is not shown in public search until a person completes them.</p>';
  return `<ul class="verify-list">${items.join('')}</ul>${caveat}${reviewed}`;
}
