# Prompt: rebuild the Gototherapy website in a new repository

Copy everything below the line into a new Claude Code session (Fable 5.1) opened on the target repository. Attach the two source PDFs and the three image zips to the same message if you have them; the prompt works without them because the source repository and the live site are public.

---

You are Claude Fable 5.1 acting as a senior frontend engineer. Reproduce the Gototherapy website in THIS repository, byte-for-byte where possible, and deploy it to GitHub Pages from `main`. The finished site must look and function exactly like the reference.

REFERENCE
- Live site: https://aririkushimeikito.github.io/gototheraphy/
- Source repository (public): https://github.com/aririkushimeikito/gototheraphy (branch `main`)
- Raw file base: https://raw.githubusercontent.com/aririkushimeikito/gototheraphy/main/
- The live site is a static build of that repository: HTML5, CSS3 and vanilla JavaScript modules only. No frameworks, no build dependency at runtime. A Python 3 helper (`tools/build.py`, standard library) generates directory pages, injects the shared header and footer, rewrites links to be document-relative and writes the sitemap.

STEP 1 — GET THE SOURCE (do this first, do not rebuild from memory)
1. Try, in this order, and stop at the first that works:
   a. `git clone --depth 1 https://github.com/aririkushimeikito/gototheraphy.git /tmp/src`
   b. Fetch every file listed in the MANIFEST below from the raw file base with curl.
   c. Fetch every file from the live site base URL (GitHub Pages serves all repository files, including `tools/`, `data/` and the Markdown docs).
2. Copy the entire tree into this repository's root, excluding `.git`. Keep the exact folder structure. Do not rename, reformat, minify or "improve" anything.
3. If none of the three sources is reachable, say so plainly, then rebuild from the SPECIFICATION section using the attached PDFs and images. Do not silently mix the two approaches.

STEP 2 — IMAGES
- The repository already contains the optimised images in `assets/images/` (WebP and JPEG at 480, 800, 1100 or 500 widths) and the full original set as WebP in `assets/images/library/`. If you obtained the source, nothing else is needed.
- If you had to rebuild, the attached zips map to these names; convert each to WebP (quality 80) and JPEG (quality 82, progressive) at the widths shown:
  `images_set3/1.png → hero-room-plants` (1100, 800, 480) · `set3/7 → room-wood-panelled` · `set3/8 → desk-laptop-candle` · `set3/4 → child-session-sunlit` · `set3/5 → child-session-blocks` · `set3/3 → conversation-two-men` · `set3/2 → young-people-music` · `images_set2/1.png → conversation-armchairs` (800, 480) · `images_set1/4.png → session-sunlit-conversation` (500) · `set1/5 → living-room-empty` · `set1/1 → therapist-loft-conversation` · `set1/7 → supervision-office` · `set1/9 → professional-armchair` · `set1/2 → child-busy-board`.
  Every original goes into `assets/images/library/` as `set1-01.webp` … `set3-08.webp` at 800px max. The remaining Set 2 images are clinical stock and are never placed on a page: the design system rules them out.

STEP 3 — BUILD AND VERIFY
1. Run `python3 tools/build.py` from the repository root. Expected output: 47 generated directory pages, 75 processed pages, 18 URLs in `sitemap.xml`, 57 noindex pages.
2. Serve with `python3 -m http.server 8090` and run a headless browser check (Playwright is available in Claude Code on the web) across these pages: `/`, `/find-a-therapist/`, `/therapist/demo-therapist-a/`, `/join/`, `/login/`, `/account/`, `/pricing/`, `/how-it-works/`, `/how-we-verify/`, `/online-counselling/`, `/stories/`, `/about/`, `/counselling/brighton/`, `/crisis/`, `/404.html`. Each must have exactly one `<h1>`, no console errors other than the Google Fonts request (blocked in the sandbox only), and no horizontal overflow at 320, 375, 390, 414, 768, 1024, 1280, 1440 and 1920 px.
3. Confirm the interactions: mobile menu opens with aria-expanded and closes on Escape; search filters change the results and the URL (Brighton → 3 demo cards, Brighton + addiction → empty state); booking on a profile lets you pick a day and time, request it, and shows the confirmation dialog; join step 1 shows the error summary when empty and moves to step 2 when valid; the account billing view switches subscription states.
4. Run `python3 tools/build-elementor.py` (needs `pip install beautifulsoup4`) so `elementor/` is regenerated. Expected: 31 templates.
5. Compare against the live site: same page titles, same meta descriptions, same H1 text on the homepage ("A therapist you can actually check."), same header (wordmark "gototherapy" with "therapy" in clay ink, nav: How it works, How we verify, Online counselling, Stories, About; buttons: Log in, Join as a professional, Find a therapist), same footer columns.

STEP 4 — DEPLOY
- Commit everything to `main` and push. Keep `.nojekyll` at the root. GitHub Pages must be set to deploy from `main` at `/ (root)`.
- Reply with the live URL of this repository's Pages site and a list of anything that differs from the reference, with the reason.

RULES THAT MUST SURVIVE (from the Gototherapy Design System v2.0 and the SEO document; the repository already complies)
- Colours only from the tokens in `assets/css/variables.css`. `--clay` (#B4552C) is a fill, never text on paper; text uses `--clay-ink` (#A34D28). `--sky` (#C9BCA9) is decoration only. Ember appears at most three times per screen.
- Two typefaces only: Instrument Serif (display, never bold) and Schibsted Grotesk (400/500/600). Google Fonts link stays as is.
- No `!important`, style by class not element, 44 × 44 px tap targets, 350 ms hover lift of 2 px, 800 ms reveal with 70 ms stagger, hero drift 26–34 s, reduced motion disables animation, content visible without JavaScript.
- No reviews, ratings, testimonials, enquiry forms, invented practitioners, fees, counts, waiting times or outcome claims. Demo records are labelled and noindex and never count towards indexing thresholds. Every `CONTENT REQUIRED — DO NOT PUBLISH` placeholder stays until real content replaces it.
- Verification is per role (therapist, supervisor, coach, trainer, training provider); unregulated roles print "This is not a regulated profession in the UK, so there is no register to check." on the profile itself.
- Canonical URLs: `/find-a-therapist/` and `/stories/` (live URLs win); `/articles/` redirects to `/stories/`; `/counselling/[town]/`, `/counselling/[issue]/`, `/counselling/[town]/[issue]/` and `/therapist/[slug]/` are the directory structure. Login, account and thank-you are noindex. Pagination and facets are noindex, follow.
- Links are document-relative so the site works at the domain root and under a GitHub Pages sub-path. Absolute `https://gototherapy.co.uk/…` URLs appear only in canonicals, Open Graph and JSON-LD.

MANIFEST (every non-generated file; generated pages under `counselling/` and `therapist/` come from `tools/build.py`, and `elementor/` from `tools/build-elementor.py`)
.nojekyll 404.html BACKEND-INTEGRATION.md ELEMENTOR-IMPORT.md README.md SEO-IMPLEMENTATION.md REBUILD-PROMPT.md _redirects robots.txt sitemap.xml index.html
about/index.html account/index.html articles/index.html cancellation-and-refunds/index.html coaches/index.html complaints/index.html counselling/index.html crisis/index.html find-a-therapist/index.html how-it-works/index.html how-we-verify/index.html join/index.html login/index.html online-counselling/index.html pricing/index.html privacy/index.html supervisors/index.html terms/index.html thank-you/index.html trainers/index.html training-providers/index.html
stories/index.html stories/what-happens-in-a-first-therapy-session/index.html stories/how-do-i-know-if-therapy-is-working/index.html stories/can-i-have-therapy-online/index.html stories/how-much-does-therapy-cost-in-the-uk/index.html
assets/css/variables.css assets/css/base.css assets/css/layout.css assets/css/components.css assets/css/pages.css assets/css/responsive.css assets/css/elementor-bridge.css
assets/js/main.js assets/js/navigation.js assets/js/ui.js assets/js/data.js assets/js/verification.js assets/js/filters.js assets/js/search.js assets/js/forms.js assets/js/booking.js assets/js/account.js assets/js/profile.js assets/js/directory.js assets/js/hours.js
assets/icons/favicon.svg assets/icons/logo.svg assets/icons/apple-touch-icon.png
assets/images/{hero-room-plants,room-wood-panelled,desk-laptop-candle,child-session-sunlit,child-session-blocks,conversation-two-men,young-people-music}-{480,800,1100}.{webp,jpg} assets/images/conversation-armchairs-{480,800}.{webp,jpg} assets/images/{session-sunlit-conversation,living-room-empty,therapist-loft-conversation,supervision-office,professional-armchair,child-busy-board}-500.{webp,jpg} assets/images/library/set1-01…09.webp set2-01…23.webp set3-01…08.webp
data/therapists.json data/locations.json data/issues.json data/modalities.json data/roles.json data/articles.json data/pricing.json
tools/build.py tools/build-elementor.py tools/partials/head.html tools/partials/header.html tools/partials/footer.html tools/templates/town.html tools/templates/issue.html tools/templates/town-issue.html tools/templates/profile.html
wordpress/gototherapy-child/style.css wordpress/gototherapy-child/functions.php

SPECIFICATION (only if the source could not be obtained)
Read both attached PDFs completely first: `gototherapy-design-system.pdf` (Design System v2.0, Stone & Ember) and `SEO-Pages.pdf` (Yoast titles, descriptions, focus keyphrases, noindex rules, the slug inconsistency). Then build, in this order, a static site with the manifest above: tokens and global styles; header, footer, buttons, cards, forms; homepage (hero with search card below the text and image, what Gototherapy is, verification section on the dark anchor, four numbered steps, online counselling split, demo profile preview grid, three story cards, professional CTA, question accordion); find-a-therapist with working search, filters, sort, pagination and empty states against `data/therapists.json`; role directories reusing the same search with a fixed role; generated town, issue, town+issue and profile pages with per-role badges, booking interface and live practice hours; how it works; how we verify; six-step join flow with validation, back navigation and a review step; login; member account with dashboard, profile, verification, availability, session requests, billing (Stripe subscription states) and settings; pricing driven by `data/pricing.json` with no invented prices; booking module; stories index and four articles of 900–1000+ words each with a 40–60 word direct answer, question H2s, an NHS self-referral paragraph and a "what if it is not working" paragraph; online counselling; about; terms, privacy, cancellation and refunds, complaints and crisis as labelled placeholder structures; operating-hours engine in `assets/js/hours.js` with one configuration object; JSON-LD per page type (Organization and WebSite on home, CollectionPage and BreadcrumbList on directories, Person on profiles, Article on stories, WebPage elsewhere); `robots.txt`, `sitemap.xml`, `_redirects`; README, SEO-IMPLEMENTATION.md, BACKEND-INTEGRATION.md, ELEMENTOR-IMPORT.md; Elementor Pro templates and the child theme. Every operation needing a server is marked `BACKEND REQUIRED` and nothing sensitive is stored in the browser.
