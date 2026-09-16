# Backend integration

The frontend is static HTML/CSS/JS and is complete as an interface. Anything that needs a secret, a database, a payment or an email is marked **BACKEND REQUIRED** in the code and listed here. No backend technology is assumed; the contract below is plain JSON over HTTPS with httpOnly cookie sessions.

## Security rules already enforced in the frontend

- Nothing sensitive is written to `localStorage`, `sessionStorage` or the URL. Join-form drafts live in memory for the page session only.
- No API secrets, Stripe secret keys, database credentials or auth secrets exist in frontend files. Only `STRIPE_PUBLISHABLE_KEY` may ever appear, and Checkout/Portal redirects do not need it.
- Card details never touch the site: Stripe Checkout and the Stripe Billing Portal handle them.
- There is no enquiry form. Visitor searches are not sent to the server.

## 1. Data (`assets/js/data.js`)

Replace the endpoints in one file; everything else reads through it.

| Frontend name | Prototype | Production endpoint |
|---|---|---|
| therapists | `/data/therapists.json` | `GET /api/therapists?status=published` (paginated; server renders profile pages) |
| locations | `/data/locations.json` | `GET /api/locations` |
| issues | `/data/issues.json` | `GET /api/issues` |
| modalities | `/data/modalities.json` | `GET /api/modalities` |
| roles | `/data/roles.json` | Static config (per-role check rules and badge text) |
| articles | `/data/articles.json` | `GET /api/articles` (CMS) |
| pricing | `/data/pricing.json` | `GET /api/pricing` (mirrors Stripe Prices) |

The therapist record schema is documented at the top of `data/therapists.json`. Counts, fee ranges and availability must be computed at render time from live data, never typed.

## 2. Authentication API

| Action | Endpoint | Frontend location |
|---|---|---|
| Sign in | `POST /api/auth/login {email, password, remember}` → sets httpOnly, SameSite=Lax session cookie | `forms.js → initLoginForm` |
| Sign out | `POST /api/auth/logout` | `account.js` (sign-out button) |
| Password reset | `POST /api/auth/password-reset {email}` → emailed, expiring link | `login/index.html` (modal) |
| Change password | `POST /api/auth/password {current, new}` | `account/#settings` |
| Current user | `GET /api/me` | `account.js → initAccount` |

Rate-limit login and reset. Never reveal whether an email exists.

## 3. Applications and verification workflow

`POST /api/applications` (multipart/form-data) receives the six-step join form: personal details, roles, register details, insurance, supervisor contact, identity document, practice details, profile text, consents. The server:

1. Creates the applicant account (unverified) and emails a confirmation.
2. Stores documents in **private** object storage with virus scanning; identity images are deleted after the check.
3. Queues the application for a person to review.

### Admin / verification UI (to build server-side; states are already used by the frontend)

Per application: `received → in review → awaiting applicant → approved → published`, or `rejected`. Per check (`registration`, `insurance`, `supervision`, `identity`, `supervision-training`, `accreditation`): `pending | verified | expired | not-required`, with `detail`, `checkedOn`, `expires`, `checkedBy`. Required checks per role come from `data/roles.json`; holding two roles requires the union. The badge text and the unregulated caveat are derived in `verification.js` and must be reproduced server-side for rendered profiles (see `tools/build.py → badge_for`).

Workflow actions: approve, reject (with reason to applicant), request document, record supervisor confirmation (email link the supervisor clicks), publish profile, unpublish, assign badge (automatic from checks), annual recheck (scheduler creates a recheck task 12 months after `lastReviewed`), expiry tracking (emails at 60/30/7 days; profile hidden on expiry until renewed). Every action appends to the verification history shown in the member account.

Member endpoints used by `account.js`: `GET/PATCH /api/me/profile`, `POST /api/me/photo`, `GET /api/me/verification`, `POST /api/me/documents`, `GET/PUT /api/me/availability`, `GET /api/me/bookings`.

## 4. Payments (Stripe)

The subscription state machine mirrors Stripe's subscription status and is rendered in `account.js` (`SUBSCRIPTION_STATES`): `incomplete` (payment pending), `trialing`, `active`, `past_due` (payment failed), `unpaid`, `canceled`.

| Operation | Endpoint (server) | Stripe call | Frontend |
|---|---|---|---|
| Start membership after acceptance | `POST /api/billing/checkout-session` → `{url}` | Checkout Session (mode=subscription, customer created or reused) | Redirect |
| Manage card, invoices, cancel | `POST /api/billing/portal-session` → `{url}` | Billing Portal session | Redirect |
| Cancel | `POST /api/billing/cancel` | `subscription.update(cancel_at_period_end=true)` | Cancel modal |
| Status | `GET /api/me/billing` | From webhook-synced record | Billing view |
| Receipts | link | `invoice.hosted_invoice_url` | Billing history |
| Refund | admin only | `refunds.create` | — |

Webhooks to handle: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Profile visibility = checks complete **and** subscription in `active|trialing` (and `past_due` during the grace period decided in the cancellation policy). Prices live in Stripe; `data/pricing.json` mirrors them and must never carry an invented amount.

## 5. Booking API

Used by `booking.js` (visitor side) and `account.js` (member side).

| Endpoint | Purpose |
|---|---|
| `GET /api/therapists/:id/availability?from&to` | Slots already netted against confirmed bookings and calendar busy time |
| `POST /api/bookings {therapistId, date, time, mode}` | Creates a `pending` request; emails therapist |
| `POST /api/bookings/:id/confirm` \| `decline` \| `cancel` \| `reschedule` | State transitions; emails both parties |

States: `available, selected, pending, confirmed, cancelled, unavailable` (plus `declined` on the member side). Store the time and format only; never the visitor's reasons for coming.

Calendar sync options, all behind the same endpoints: Google Calendar (OAuth, free/busy + event create), Microsoft 365 (Graph, same), a Calendly-style tool (webhook on booking), or the custom scheduler. `POST /api/me/calendar/connect` starts the OAuth flow.

## 6. Email

Transactional emails (server-triggered): application received; supervisor confirmation request; checks complete / document requested; membership activated; payment failed; document expiring; annual recheck due; session requested / confirmed / declined / cancelled; password reset. Use a transactional provider with DKIM/SPF set up for gototherapy.co.uk. No marketing email without the notification preference set in `/account/#settings`.

## 7. Content (CMS)

Stories, town long-form copy and issue long-form copy can move to a CMS that outputs the same fields as `data/articles.json`, `data/locations.json` and `data/issues.json`. The issue page must carry a named clinical reviewer before it is indexed. Rendered pages must keep the direct-answer paragraph, one H1, question headings and the schema described in `SEO-IMPLEMENTATION.md`.

## 8. Operating hours

`assets/js/hours.js → SUPPORT_HOURS` is the single configuration object. Replace it with `GET /api/hours` (same shape: `timezone`, `week`, `closures`, `special`). Member practice hours come from their availability record through `fromAvailability()`.

## 9. Server rendering of directory pages

`tools/build.py` shows exactly what the backend must render for `/counselling/[town]/`, `/counselling/[issue]/`, `/counselling/[town]/[issue]/` and `/therapist/[slug]/`, including the indexing thresholds (photo + 150 words + verified registration for profiles; 3+ verified matches and long-form copy for towns; plus a clinical reviewer for issues), the per-role badge, the printed caveat for unregulated roles, breadcrumbs and JSON-LD.
