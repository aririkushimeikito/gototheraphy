#!/usr/bin/env python3
"""
Gototherapy — static build helper (Python 3 standard library only).

What it does, in order:
  1. Generates directory pages from data/*.json using tools/templates/:
       /counselling/[town]/            (towns)
       /counselling/[issue]/           (issues)
       /counselling/[town]/[issue]/    (curated town + issue set)
       /therapist/[slug]/              (profiles)
     In production these are rendered by the backend from live data. The
     templates show exactly what the backend must output, including the
     indexing thresholds and per-role verification wording.
  2. Injects the shared header/footer/head partials between chrome markers
     in every HTML page so navigation is edited in one place.
  3. Rewrites root-relative links ("/join/") to document-relative ones
     ("../join/") so the same files work at the domain root AND under a
     sub-path such as GitHub Pages. Absolute https:// URLs (canonicals,
     Open Graph, JSON-LD) are left alone.
  4. Writes sitemap.xml from every page that is index,follow.

Usage:  python3 tools/build.py            (from the repository root)
It is idempotent: run it after any edit to a page, partial or data file.
"""
import json
import os
import re
import sys
import html
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://gototherapy.co.uk"
SKIP_DIRS = {"assets", "tools", "node_modules", ".git", "data"}

def read(p): return Path(p).read_text(encoding="utf-8")
def write(p, s):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(s, encoding="utf-8")
def esc(s): return html.escape(str(s if s is not None else ""), quote=True)
def load(name):
    d = json.loads(read(ROOT / "data" / f"{name}.json"))
    return d["records"] if isinstance(d, dict) and "records" in d else d

def render(template, ctx):
    """Tiny template language: {{key}} escaped, {{{key}}} raw, {{#key}}…{{/key}} conditional."""
    out = template
    for m in re.finditer(r"{{#(\w+)}}(.*?){{/\1}}", template, re.S):
        out = out.replace(m.group(0), m.group(2) if ctx.get(m.group(1)) else "")
    for m in re.finditer(r"{{\^(\w+)}}(.*?){{/\1}}", out, re.S):
        out = out.replace(m.group(0), m.group(2) if not ctx.get(m.group(1)) else "")
    out = re.sub(r"{{{(\w+)}}}", lambda m: str(ctx.get(m.group(1), "")), out)
    out = re.sub(r"{{(\w+)}}", lambda m: esc(ctx.get(m.group(1), "")), out)
    return out

# --------------------------------------------------------------------------
# 1. Directory pages
# --------------------------------------------------------------------------
def published(records): return [r for r in records if r["verification"]["status"] == "verified"]

def role_defs():
    d = json.loads(read(ROOT / "data" / "roles.json"))
    return {r["slug"]: r for r in d["records"]}, d["caveat"], d["checkLabels"]

def badge_for(rec, roles):
    required, unregulated = [], False
    for slug in rec.get("roles") or [rec["role"]]:
        d = roles.get(slug)
        if not d: continue
        for c in d["checks"]:
            if c not in required: required.append(c)
        if not d["regulated"]: unregulated = True
    checks = rec["verification"]["checks"]
    missing = [c for c in required if checks.get(c, {}).get("status") != "verified"]
    status = "verified" if rec["verification"]["status"] == "verified" and not missing else ("partial" if len(missing) < len(required) else "pending")
    text = roles[rec["role"]]["badge"] if status == "verified" else ("Checks in progress" if status == "partial" else "Not yet checked")
    return {"status": status, "text": text, "required": required, "missing": missing, "unregulated": unregulated}

def card_html(r, issues, roles, caveat):
    b = badge_for(r, roles)
    names = [i["name"] for i in issues if i["slug"] in r["issues"]][:3]
    modes = " and ".join([m for m, ok in (("In person", r["inPerson"]), ("Online", r["online"])) if ok])
    cls = {"verified": "badge--verified", "partial": "badge--partial"}.get(b["status"], "badge--pending")
    icon = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>' if b["status"] == "verified" else '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
    return f'''<article class="card card--hover profile-card">
  <div class="profile-card__badges"><span class="badge {cls}">{icon}<span>{esc(b["text"])}</span></span>{'<span class="badge badge--demo">Demo record</span>' if r.get("demo") else ''}</div>
  <div class="profile-card__top">
    <span class="avatar" aria-hidden="true">{esc(r["initials"])}</span>
    <div><h3 class="profile-card__name"><a href="/therapist/{esc(r["slug"])}/">{esc(r["name"])}</a></h3><p class="profile-card__role">{esc(r["title"])}</p></div>
  </div>
  <ul class="profile-card__meta"><li><svg class="icon icon--sm" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg><span>{esc(r["location"]["town"])}</span></li>{f'<li><svg class="icon icon--sm" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg><span>{modes}</span></li>' if modes else ''}{'' if r["acceptingClients"] else '<li><span class="status status--off">Not taking new clients</span></li>'}</ul>
  <p class="profile-card__text">{("Works with " + esc(", ".join(names).lower()) + ".") if names else esc(r["profile"]["worksWith"])}</p>
  {f'<p class="meta">{esc(caveat)}</p>' if b["unregulated"] else ''}
</article>'''

def picture(name, alt, sizes="(min-width: 900px) 50vw, 100vw", cls="", widths=(1100, 800, 480), eager=False):
    imgdir = ROOT / "assets/images"
    avail = [w for w in widths if (imgdir / f"{name}-{w}.webp").exists()]
    if not avail:
        avail = [500] if (imgdir / f"{name}-500.webp").exists() else []
    if not avail: return ""
    big = max(avail)
    from PIL import Image  # only for dimensions; falls back if Pillow missing
    try:
        w, h = Image.open(imgdir / f"{name}-{big}.jpg").size
    except Exception:
        w, h = big, int(big * 0.64)
    srcset = lambda ext: ", ".join(f"/assets/images/{name}-{x}.{ext} {x}w" for x in sorted(avail))
    cls_attr = f' class="{cls}"' if cls else ""
    loading = "eager" if eager else "lazy"
    prio = ' fetchpriority="high"' if eager else ""
    return (f'<picture{cls_attr}><source type="image/webp" srcset="{srcset("webp")}" sizes="{sizes}">'
            f'<img src="/assets/images/{name}-{big}.jpg" srcset="{srcset("jpg")}" sizes="{sizes}" alt="{esc(alt)}" width="{w}" height="{h}" '
            f'loading="{loading}" decoding="async"{prio}></picture>')

def breadcrumb_ld(items):
    return json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + u} for i, (n, u) in enumerate(items)]}, ensure_ascii=False)

def breadcrumbs_html(items):
    lis = []
    for i, (n, u) in enumerate(items):
        if i == len(items) - 1: lis.append(f'<li><span aria-current="page">{esc(n)}</span></li>')
        else: lis.append(f'<li><a href="{u}">{esc(n)}</a></li>')
    return f'<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>{"".join(lis)}</ol></nav>'

def build_directory():
    therapists = load("therapists"); towns = load("locations"); issues = load("issues"); modalities = load("modalities")
    roles, caveat, labels = role_defs()
    pub = [r for r in published(therapists) if "therapist" in (r.get("roles") or [r["role"]])]
    tpl_town = read(ROOT / "tools/templates/town.html")
    tpl_issue = read(ROOT / "tools/templates/issue.html")
    tpl_town_issue = read(ROOT / "tools/templates/town-issue.html")
    tpl_profile = read(ROOT / "tools/templates/profile.html")
    generated = []

    # Towns
    for t in towns:
        matches = [r for r in pub if r["location"]["slug"] == t["slug"]]
        real = [r for r in matches if not r.get("demo")]  # demo records never count towards indexing
        indexable = len(real) >= 3 and bool(t.get("longform"))
        longform = "".join(f"<p>{esc(p)}</p>" for p in t["longform"]) if t.get("longform") else \
            '<div class="placeholder"><span class="placeholder__label">Content required — do not publish</span>Long-form section for this town (250–350 words, three or four paragraphs: what looking for a therapist here is like, what is locally specific, why online sessions might suit). This page stays noindex until it exists and three or more verified therapists are listed.</div>'
        issue_links = "".join(f'<li><a href="/counselling/{t["slug"]}/{i["slug"]}/">{esc(i["name"])} in {esc(t["name"])}</a></li>' for i in issues if any(i["slug"] in r["issues"] for r in matches)) or "<li class='mute'>Issue pages for this town appear once there are enough verified matches.</li>"
        crumbs = [("Home", "/"), ("Counselling", "/counselling/"), (f"Counselling in {t['name']}", f"/counselling/{t['slug']}/")]
        ctx = dict(town=t["name"], region=t["region"], slug=t["slug"], longform=longform, indexable=indexable,
                   robots="index, follow" if indexable else "noindex, follow",
                   title=f"Counselling in {t['name']} | Verified Therapists | Gototherapy",
                   description=f"Find verified counsellors and psychotherapists in {t['name']}. Every therapist listed has had their registration, insurance and supervision checked by a person.",
                   cards="".join(card_html(r, issues, roles, caveat) for r in matches),
                   has_matches=bool(matches), issue_links=issue_links,
                   breadcrumbs=breadcrumbs_html(crumbs), breadcrumb_ld=breadcrumb_ld(crumbs),
                   collection_ld=json.dumps({"@context": "https://schema.org", "@type": "CollectionPage", "name": f"Counselling in {t['name']}", "url": f"{SITE}/counselling/{t['slug']}/", "isPartOf": {"@type": "WebSite", "name": "Gototherapy", "url": SITE + "/"}, "about": {"@type": "Place", "name": t["name"], "address": {"@type": "PostalAddress", "addressLocality": t["name"], "addressRegion": t["region"], "addressCountry": "GB"}}}, ensure_ascii=False),
                   picture=picture("hero-room-plants", f"A calm, plant-filled therapy room with two people talking, the kind of space you might find in {t['name']}", cls="photo photo--wide"))
        write(ROOT / "counselling" / t["slug"] / "index.html", render(tpl_town, ctx)); generated.append(f"/counselling/{t['slug']}/")

        # Town + issue (curated: only where this town has 3+ verified matches for the issue)
        for i in issues:
            ti = [r for r in matches if i["slug"] in r["issues"]]
            if len(ti) < 1: continue
            idx = len([r for r in ti if not r.get("demo")]) >= 3 and indexable and bool(i.get("longform")) and bool(i.get("clinicalReviewer"))
            crumbs2 = crumbs + [(f"{i['name']} in {t['name']}", f"/counselling/{t['slug']}/{i['slug']}/")]
            ctx2 = dict(town=t["name"], issue=i["name"], issue_lower=i["name"].lower(), issue_slug=i["slug"], slug=t["slug"], short=i["short"], robots="index, follow" if idx else "noindex, follow",
                        canonical=f"{SITE}/counselling/{t['slug']}/{i['slug']}/" if idx else f"{SITE}/counselling/{t['slug']}/",
                        title=f"{i['name']} Therapists in {t['name']} | Gototherapy",
                        description=f"Verified therapists in {t['name']} who work with {i['name'].lower()}. Registration, insurance and supervision checked by a person before anyone is listed.",
                        cards="".join(card_html(r, issues, roles, caveat) for r in ti), has_matches=bool(ti),
                        breadcrumbs=breadcrumbs_html(crumbs2), breadcrumb_ld=breadcrumb_ld(crumbs2),
                        collection_ld=json.dumps({"@context": "https://schema.org", "@type": "CollectionPage", "name": f"{i['name']} therapists in {t['name']}", "url": f"{SITE}/counselling/{t['slug']}/{i['slug']}/", "isPartOf": {"@type": "WebSite", "name": "Gototherapy", "url": SITE + "/"}}, ensure_ascii=False))
            write(ROOT / "counselling" / t["slug"] / i["slug"] / "index.html", render(tpl_town_issue, ctx2)); generated.append(f"/counselling/{t['slug']}/{i['slug']}/")

    # Issues
    for i in issues:
        matches = [r for r in pub if i["slug"] in r["issues"]]
        indexable = len([r for r in matches if not r.get("demo")]) >= 3 and bool(i.get("longform")) and bool(i.get("clinicalReviewer"))
        if i.get("longform"):
            longform = "".join(f'<h3 class="h3">{esc(s["h3"])}</h3>' + "".join(f"<p>{esc(p)}</p>" for p in s["p"]) for s in i["longform"])
        else:
            longform = '<div class="placeholder"><span class="placeholder__label">Content required — do not publish</span>Long-form section for this issue (400–600 words with H3 subheadings: what it feels like day to day, when it is worth talking to somebody, what kinds of therapy people commonly work with, what a first session tends to cover). Every clinical statement must be one a BACP-registered therapist would sign.</div>'
        reviewer = f'<div class="reviewer"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg><p>Clinically reviewed by {esc(i["clinicalReviewer"])}.</p></div>' if i.get("clinicalReviewer") else '<div class="reviewer"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg><p><strong>Clinical reviewer required.</strong> This page is not indexed until a named, registered clinician has reviewed it.</p></div>'
        town_links = "".join(f'<li><a href="/counselling/{t["slug"]}/{i["slug"]}/">{esc(i["name"])} in {esc(t["name"])}</a></li>' for t in towns if any(r["location"]["slug"] == t["slug"] for r in matches)) or "<li class='mute'>Town pages for this issue appear once there are enough verified matches.</li>"
        crumbs = [("Home", "/"), ("Counselling", "/counselling/"), (i["name"], f"/counselling/{i['slug']}/")]
        pic = picture(i["image"], f"{i['name']}: a quiet room where a conversation can happen", cls="photo photo--wide") if i.get("image") else ""
        ctx = dict(issue=i["name"], issue_lower=i["name"].lower(), slug=i["slug"], short=i["short"], longform=longform, reviewer=reviewer,
                   robots="index, follow" if indexable else "noindex, follow",
                   title=f"{i['name']} Counselling UK | Verified Therapists | Gototherapy"[:60] if len(f"{i['name']} Counselling UK | Verified Therapists | Gototherapy") <= 60 else f"{i['name']} Counselling UK | Gototherapy",
                   description=f"Verified UK therapists who work with {i['name'].lower()}. What it can feel like, when it is worth talking to somebody, and what a first session tends to cover.",
                   cards="".join(card_html(r, issues, roles, caveat) for r in matches), has_matches=bool(matches), town_links=town_links,
                   breadcrumbs=breadcrumbs_html(crumbs), breadcrumb_ld=breadcrumb_ld(crumbs), picture=pic,
                   collection_ld=json.dumps({"@context": "https://schema.org", "@type": "CollectionPage", "name": f"{i['name']} counselling", "url": f"{SITE}/counselling/{i['slug']}/", "isPartOf": {"@type": "WebSite", "name": "Gototherapy", "url": SITE + "/"}}, ensure_ascii=False))
        write(ROOT / "counselling" / i["slug"] / "index.html", render(tpl_issue, ctx)); generated.append(f"/counselling/{i['slug']}/")

    # Profiles
    mods = {m["slug"]: m for m in modalities}
    iss = {i["slug"]: i for i in issues}
    for r in therapists:
        b = badge_for(r, roles)
        indexable = bool(r.get("photo")) and r.get("words", 0) >= 150 and b["status"] == "verified" and not r.get("demo")
        crumbs = [("Home", "/"), ("Find a therapist", "/find-a-therapist/"), (r["name"], f"/therapist/{r['slug']}/")]
        modal_html = "".join(f'<div class="modality"><p class="modality__name">{esc(mods[m]["name"])}</p><p class="modality__desc">{esc(mods[m]["desc"])}</p></div>' for m in r["modalities"] if m in mods)
        issue_html = "".join(f'<li><a class="chip chip--tap" href="/counselling/{s}/">{esc(iss[s]["name"])}</a></li>' for s in r["issues"] if s in iss)
        fee_html = (f'<p><strong>£{r["fees"]["session"]}</strong> per {esc(r["fees"].get("duration", "session"))}{" · concessions available" if r["fees"].get("concessions") else ""}</p>' if r.get("fees") else '<p class="mute">This member has not published fees yet. Ask when you get in touch; you are allowed to ask about cost before anything else.</p>')
        role_names = ", ".join(roles[s]["name"] for s in (r.get("roles") or [r["role"]]) if s in roles)
        badge_cls = {"verified": "badge--verified", "partial": "badge--partial"}.get(b["status"], "badge--pending")
        person_ld = {"@context": "https://schema.org", "@type": "Person", "name": r["name"], "jobTitle": r["title"], "url": f"{SITE}/therapist/{r['slug']}/", "address": {"@type": "PostalAddress", "addressLocality": r["location"]["town"], "addressRegion": r["location"]["region"], "addressCountry": "GB"}, "knowsAbout": [iss[s]["name"] for s in r["issues"] if s in iss]}
        ctx = dict(name=r["name"], initials=r["initials"], title_text=r["title"], town=r["location"]["town"], region=r["location"]["region"], town_slug=r["location"]["slug"], role_names=role_names,
                   id=r["id"], slug=r["slug"], demo=r.get("demo"), online=r["online"], inperson=r["inPerson"], accepting=r["acceptingClients"],
                   modes=" and ".join([m for m, ok in (("In person", r["inPerson"]), ("Online", r["online"])) if ok]),
                   badge_text=b["text"], badge_cls=badge_cls, unregulated=b["unregulated"], caveat=caveat, pending=b["status"] != "verified",
                   works_with=r["profile"]["worksWith"], sessions=r["profile"]["sessions"], drawn_to=r["profile"]["drawnTo"], before_contact=r["profile"]["beforeContact"],
                   modalities=modal_html, issues=issue_html, has_issues=bool(issue_html), fees=fee_html,
                   robots="index, follow" if indexable else "noindex, follow",
                   title=f"{r['name']}, {r['title'].split(' (')[0]} in {r['location']['town']} | Gototherapy",
                   description=f"{r['name']}, {r['title'].split(' (')[0].lower()} in {r['location']['town']}. {b['text']}. Read who they work with, what sessions are like, and what to know before you get in touch."[:155],
                   breadcrumbs=breadcrumbs_html(crumbs), breadcrumb_ld=breadcrumb_ld(crumbs), person_ld=json.dumps(person_ld, ensure_ascii=False))
        write(ROOT / "therapist" / r["slug"] / "index.html", render(tpl_profile, ctx)); generated.append(f"/therapist/{r['slug']}/")

    # Counselling hub lists
    hub = ROOT / "counselling/index.html"
    if hub.exists():
        s = read(hub)
        town_items = "".join(f'<li><a href="/counselling/{t["slug"]}/">{esc(t["name"])}</a></li>' for t in towns)
        issue_items = "".join(f'<li><a href="/counselling/{i["slug"]}/">{esc(i["name"])}</a></li>' for i in issues)
        s = re.sub(r"(<!-- @gen:towns -->).*?(<!-- /@gen:towns -->)", lambda m: m.group(1) + town_items + m.group(2), s, flags=re.S)
        s = re.sub(r"(<!-- @gen:issues -->).*?(<!-- /@gen:issues -->)", lambda m: m.group(1) + issue_items + m.group(2), s, flags=re.S)
        write(hub, s)
    return generated

# --------------------------------------------------------------------------
# 2 + 3. Chrome injection and link rewriting
# --------------------------------------------------------------------------
def html_files():
    for p in ROOT.rglob("*.html"):
        if any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts): continue
        yield p

def inject_chrome(s, partials):
    for name, content in partials.items():
        s = re.sub(rf"(<!-- @chrome:{name} -->).*?(<!-- /@chrome:{name} -->)", lambda m: m.group(1) + "\n" + content.strip() + "\n" + m.group(2), s, flags=re.S)
    return s

ATTR_RE = re.compile(r'(\b(?:href|src|action|poster|data-href)=")/(?!/)')
SRCSET_RE = re.compile(r'(\bsrcset=")([^"]*)"')

def relativise(s, depth):
    prefix = "./" if depth == 0 else "../" * depth
    s = ATTR_RE.sub(lambda m: m.group(1) + prefix, s)
    s = SRCSET_RE.sub(lambda m: m.group(1) + re.sub(r'(^|,\s*)/(?!/)', lambda n: n.group(1) + prefix, m.group(2)) + '"', s)
    # CSS url() in inline styles
    s = re.sub(r'url\(\s*(["\']?)/(?!/)', lambda m: f"url({m.group(1)}{prefix}", s)
    return s

def asset_version():
    """Short content hash of all CSS/JS, appended as ?v= so browsers never serve a stale stylesheet against new HTML."""
    import hashlib
    h = hashlib.sha1()
    for p in sorted((ROOT / "assets").rglob("*")):
        if p.suffix in (".css", ".js"): h.update(p.read_bytes())
    return h.hexdigest()[:8]

def process_pages():
    partials = {n: read(ROOT / "tools/partials" / f"{n}.html") for n in ("head", "header", "footer")}
    v = asset_version()
    partials["head"] = re.sub(r'((?:href|src)="/assets/[^"?]+\.(?:css|js))(?:\?v=\w+)?"', lambda m: f'{m.group(1)}?v={v}"', partials["head"])
    pages = []
    for p in html_files():
        s = read(p)
        s = inject_chrome(s, partials)
        depth = len(p.relative_to(ROOT).parts) - 1
        if p.name != "404.html":  # the 404 page is served for any path, so it keeps root-relative links
            s = relativise(s, depth)
        write(p, s)
        robots = re.search(r'<meta name="robots" content="([^"]+)"', s)
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', s)
        pages.append({"path": "/" + "/".join(p.relative_to(ROOT).parts[:-1]) + ("/" if depth else ""), "robots": robots.group(1) if robots else "index, follow", "canonical": canon.group(1) if canon else None})
    return pages

# --------------------------------------------------------------------------
# 4. Sitemap
# --------------------------------------------------------------------------
def write_sitemap(pages):
    urls = []
    for pg in pages:
        if "noindex" in pg["robots"]: continue
        if not pg["canonical"]: continue
        expected = SITE + pg["path"]
        if pg["canonical"] != expected: continue  # canonicalised elsewhere: leave it out
        urls.append(expected)
    urls = sorted(set(urls), key=lambda u: (u.count("/"), u))
    body = "\n".join(f"  <url><loc>{esc(u)}</loc></url>" for u in urls)
    write(ROOT / "sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n')
    return urls

if __name__ == "__main__":
    gen = build_directory()
    pages = process_pages()
    urls = write_sitemap(pages)
    print(f"Generated {len(gen)} directory pages, processed {len(pages)} pages, sitemap has {len(urls)} URLs.")
    noidx = [p["path"] for p in pages if "noindex" in p["robots"]]
    print(f"noindex: {len(noidx)} pages")
