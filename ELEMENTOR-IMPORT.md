# Converting Gototherapy to Elementor Pro

This folder set turns the static site into Elementor Pro templates without losing the platform functions. Read this once before importing anything.

## What you get

| Folder | Contents |
|---|---|
| `elementor/templates/` | 31 importable template files: `00-header.json`, `00-footer.json` (Theme Builder) and one page template per page reachable from the header and footer, plus one example profile, town and issue page |
| `elementor/paste/` | The same 31 as clipboard files for right-click → **Paste from other site** inside the editor |
| `elementor/INDEX.json` | Every template with its WordPress slug, SEO title, meta description and robots directive (paste these into Yoast) |
| `wordpress/gototherapy-child/` | Child theme (parent: Hello Elementor) that loads the design system, the platform scripts and the Elementor bridge stylesheet |
| `assets/css/elementor-bridge.css` | Maps Elementor widget output onto the design system |

Regenerate everything after any change to the site with:

```bash
python3 tools/build.py && python3 tools/build-elementor.py
```

## How the templates are built

- **Editable content** (eyebrows, headings, paragraphs, buttons, images, FAQ accordions, link cards) is native Elementor widgets. Each carries a `gt-*` class that `elementor-bridge.css` styles, so the type scale, colours, pills and cards match the static site without any per-widget styling.
- **Functional blocks** are HTML widgets holding the exact markup from the static site: the search card and results, filters, profile previews, the six-step join form, login, the whole member account, the booking calendar, pricing states, verification lists. Each begins with a comment naming the plugin shortcode to replace it with later. The site's JavaScript finds these blocks by their `data-page` marker, so search, filters, validation, booking and the account prototype all work inside WordPress exactly as they do on the static site.
- Breadcrumbs are left out; use Yoast breadcrumbs in the header template if you want them.

## Step by step

1. **Install** Hello Elementor, Elementor, Elementor Pro and Yoast SEO. Upload `wordpress/gototherapy-child/` as a theme and activate it.
2. **Copy the assets**: put the repository's `assets/` and `data/` folders inside the child theme so the paths are `wp-content/themes/gototherapy-child/assets/…` and `…/data/…`. The scripts resolve the data files relative to their own URL, which is why the prototype functions work immediately.
3. **Create the pages** with these slugs so every internal link resolves: `find-a-therapist`, `how-it-works`, `how-we-verify`, `online-counselling`, `stories`, `about`, `join`, `login`, `account`, `thank-you`, `pricing`, `counselling`, `crisis`, `complaints`, `terms`, `privacy`, `cancellation-and-refunds`, `supervisors`, `coaches`, `trainers`, `training-providers`. Set the front page to the Home page. Story pages are children of `stories` (`stories/what-happens-in-a-first-therapy-session` and so on).
4. **Create a menu** with the slug `primary` (Appearance → Menus, then check the slug in the URL) containing: How it works, How we verify, Online counselling, Stories, About. The header template's Nav Menu widget points at it.
5. **Import the header and footer**: Templates → Theme Builder → Import, choose `00-header.json` then `00-footer.json`, and set both display conditions to *Entire site*.
6. **Import the pages**: Templates → Saved Templates → Import Templates, select all the numbered files. Then open each page in Elementor, click the folder icon, *My Templates*, and insert the matching template. Tick *Import Document Settings* so the page uses the Elementor Full Width layout with the title hidden.
   Alternatively open the page, right-click any element → *Paste from other site*, and paste the contents of the matching file from `elementor/paste/`.
7. **Images**: the templates reference the live GitHub Pages copies of the images. Elementor imports them into the media library on import. If a site blocks remote images, upload `assets/images/` to the media library and re-select them on the image widgets.
8. **Yoast**: for each page paste the SEO title, meta description and robots setting from `elementor/INDEX.json`. Login, account and thank-you must be *noindex*. The child theme also emits noindex for those three as a safeguard.
9. **Redirects**: add `301 /articles/* → /stories/*` in Yoast Premium or the Redirection plugin.

## Making the functions real

Everything works against the mock JSON in `data/` until the Gototherapy plugin exists. The plugin supplies the widgets the design system names (Join Form, Sign In, Member Account, Application Received, Search and Therapist Grid). When it is installed:

1. Point `assets/js/data.js` at the plugin's REST routes (one file; the contract is in `BACKEND-INTEGRATION.md`).
2. Replace each HTML widget with the shortcode named in its leading comment, for example `[gototherapy_search]`, `[gototherapy_join_form]`, `[gototherapy_member_account]`.
3. Let the plugin render `/therapist/[slug]/` and `/counselling/…` pages from live data; the example templates 27 to 29 show the target output and the indexing thresholds.
4. Remove the demo records from `data/therapists.json` before launch.

## Design rules that Elementor makes easy to break

- Two typefaces only. Do not add a third in Site Settings.
- `--clay` (#B4552C) is a fill colour; text uses `--clay-ink`. `--sky` is never text.
- No text over photography without a solid plate; never a gradient overlay.
- No review or rating widgets, no enquiry forms, no invented numbers or prices.
- Keep Elementor's own motion effects off; the bridge stylesheet already carries the 350 ms hover and reduced-motion rules.
