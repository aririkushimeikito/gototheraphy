# SEO, GEO and AEO implementation

Source of truth: `SEO-Pages.pdf` (Yoast details) and Part Eight of `gototherapy-design-system.pdf`. Where they disagree with each other, this document records the decision.

## 1. Canonical URL strategy (the slug inconsistency)

The SEO document identifies that the live site uses `/find-a-therapist/` and `/stories/`, while the design system's templates linked to `/counselling/` and `/articles/`. One canonical strategy has been implemented:

| Concept | Canonical URL | Notes |
|---|---|---|
| Therapist search | `/find-a-therapist/` | Live SEO URL. Focus keyphrase "verified therapists UK". |
| Article surface | `/stories/` and `/stories/[slug]/` | Live SEO URL. Focus keyphrase "starting therapy". |
| Directory by town / issue | `/counselling/[town]/`, `/counselling/[issue]/`, `/counselling/[town]/[issue]/` | Kept from the design system: these are distinct directory pages, not duplicates of the search page. `/counselling/` itself is a hub. |
| Old paths | `/articles/`, `/articles/[slug]/` | **301 → `/stories/…`**. `/articles/index.html` exists only as a meta-refresh stub carrying `noindex` and a canonical to `/stories/` for hosts that cannot 301. |

All internal links point at canonical URLs only. Every page declares exactly one canonical (`https://gototherapy.co.uk/…/`, non-www, https, trailing slash).

Redirect rules are shipped in `_redirects` (Netlify / Cloudflare Pages). Equivalents:

```apache
# Apache .htaccess
RedirectMatch 301 ^/articles/(.*)$ /stories/$1
```

```nginx
# nginx
location ~ ^/articles/(.*)$ { return 301 /stories/$1; }
```

## 2. Page metadata

Titles and descriptions are taken verbatim from the SEO document. The home title uses the trimmed 51-character form the document suggests ("Find a Therapist in the UK | Verified | Gototherapy"), because the design-system pattern is 63 characters.

| Page | Title (chars) | Description (chars) | Robots |
|---|---|---|---|
| `/` | Find a Therapist in the UK \| Verified \| Gototherapy (51) | 147 | index |
| `/find-a-therapist/` | Browse Verified Therapists in the UK \| Gototherapy (50) | 152 | index |
| `/how-it-works/` | How to Find a Therapist in the UK \| Gototherapy (47) | 147 | index |
| `/how-we-verify/` | How We Verify Every Therapist \| Gototherapy (43) | 149 | index |
| `/stories/` | Stories About Starting Therapy \| Gototherapy (44) | 147 | index |
| `/about/` | About Gototherapy \| A Directory You Can Check (45) | 151 | index |
| `/join/` | Join a Verified Therapist Directory \| Gototherapy (49) | 148 | index |
| `/pricing/` | Membership and Pricing for Professionals \| Gototherapy (54) | 146 | index |
| `/login/` | Log In \| Gototherapy (20) | 146 | **noindex, follow** |
| `/account/` | Your Member Account \| Gototherapy (33) | 144 | **noindex, nofollow** |

Home and Find a therapist keep their split focus keyphrases (find a therapist UK vs verified therapists UK) so they do not cannibalise each other. H1s carry the proposition rather than the page name, as the design system requires, so the keyphrase lives in title, description and body copy.

Pages written for this build (online counselling, role directories, counselling hub, stories, legal, crisis, complaints) follow the same patterns: title under 60 characters, description 140–155, one H1 with a proposition.

## 3. Indexing rules

Implemented in page heads and, for generated pages, in `tools/build.py`:

| Indexed | Not indexed |
|---|---|
| Home, About, How it works, How we verify, Online counselling, Find a therapist, role directories, Counselling hub, Stories index and articles, Join, Pricing | Login, Account, Thank-you, 404 |
| Town pages with long-form copy **and** 3+ verified (non-demo) therapists | Town pages below the threshold |
| Issue pages with long-form copy, a named clinical reviewer **and** 3+ verified matches | Issue pages below the threshold (currently all: no reviewer yet) |
| Town + issue pages meeting all of the above (curated set) | Otherwise canonical points at the town page |
| Profiles with a photograph, 150+ words and a verified registration | Demo profiles (all), pending profiles |
| | Search results with any filter or page > 1 (`noindex, follow`, set live by `search.js`) |
| | Legal, crisis and complaints pages while they still carry `CONTENT REQUIRED` placeholders (flip the meta to `index, follow` when complete) |

Never `nofollow` on directory pages: pagination and facets are `noindex, follow`.

`sitemap.xml` is generated from the pages whose robots directive allows indexing and whose canonical equals their own URL. `robots.txt` disallows `/login/`, `/account/`, `/thank-you/`, `/data/`, `/tools/` and points at the sitemap.

## 4. Structured data (JSON-LD)

| Page type | Types |
|---|---|
| Home | `Organization`, `WebSite` (with `SearchAction` to `/find-a-therapist/?q=`) |
| Find a therapist, role directories, counselling hub, town, issue, town+issue | `CollectionPage`, `BreadcrumbList` |
| Profile | `Person`, `BreadcrumbList` |
| Story | `Article`, `BreadcrumbList` |
| Static pages | `WebPage`, `BreadcrumbList` |

No `AggregateRating`, `Review`, `Offer` or organisation statistics anywhere: the content does not support them and the design system forbids review fields.

## 5. GEO (generative engine optimisation)

Every important page opens with a `.answer` paragraph: a self-contained, quotable answer to the page's primary question in natural language (home, find a therapist, how it works, how we verify, online counselling, about, pricing, join, stories index, every article, every town and issue page). Entities are stated plainly and consistently: Gototherapy (organisation) → verification (process, per role) → professional (person, with role and register) → location (town) → issue. Anchor text is descriptive throughout; there are no "click here" links.

## 6. AEO (answer engine optimisation)

Question-form H2/H3s with a concise answer immediately below appear on how it works ("What does a first therapy session involve?", "How much does therapy cost?", "How do I know if it is the right fit?"), how we verify ("How does Gototherapy verify a therapist?", "What does therapist verification mean?"), online counselling ("Can I have therapy online?", "Who does online counselling suit?"), the homepage answers block, and each article. FAQ blocks use native `<details>` so the answers are in the HTML, not loaded on demand. No FAQ schema is emitted, because the questions are page content rather than a standalone FAQ.

## 7. Internal linking

Contextual links connect home ↔ find a therapist ↔ how it works ↔ how we verify ↔ online counselling ↔ stories ↔ town/issue pages ↔ profiles ↔ pricing ↔ join. Footer lists are short and deliberate (three columns, six links each). Links only target pages with substantial content; thin generated pages link up to their town page rather than sideways.

## 8. Before launch checklist

1. Remove every `demo: true` record from `data/therapists.json` and run the build.
2. Replace every `CONTENT REQUIRED` placeholder; then flip legal, crisis and complaints pages to `index, follow`.
3. Add clinical reviewers to issue pages.
4. Confirm the support hours in `assets/js/hours.js`.
5. Put the 301 rules in place on the host; verify `/articles/` and `/counselling` resolve correctly.
6. Submit `sitemap.xml` in Search Console; check that `/login/` and `/account/` are not indexed.
