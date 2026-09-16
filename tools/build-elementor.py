#!/usr/bin/env python3
"""
Gototherapy — Elementor Pro template generator.

Converts the built static pages into Elementor template JSON:
  elementor/templates/*.json   importable via Elementor → Templates → Import
                               (header/footer via Theme Builder → Import)
  elementor/paste/*.json       clipboard format for right-click → "Paste from other site"

Editable content (headings, paragraphs, buttons, images, FAQs, cards) becomes
native Elementor widgets carrying gt-* classes that assets/css/elementor-bridge.css
styles. Functional blocks (search, join, login, account, booking, pricing states,
profile previews) are kept verbatim inside HTML widgets so the platform JavaScript
keeps working; each carries a comment naming the plugin shortcode to swap in.

Requires: beautifulsoup4 (pip install beautifulsoup4). Run after tools/build.py.
"""
import json, re, random, string, html
from pathlib import Path
from urllib.parse import urljoin
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
OUT_T = ROOT / "elementor/templates"; OUT_P = ROOT / "elementor/paste"
SITE = "https://gototherapy.co.uk"
IMAGE_BASE = "https://aririkushimeikito.github.io/gototheraphy"      # Elementor imports remote images into the media library
THEME_BASE = "/wp-content/themes/gototherapy-child"                  # where assets/ and data/ live inside WordPress
SKIP_DIRS = {"assets", "tools", "node_modules", ".git", "data", "elementor", "wordpress", "articles"}

PAGES = ["", "find-a-therapist", "how-it-works", "how-we-verify", "online-counselling", "stories", "about", "join", "login", "account", "thank-you",
         "pricing", "counselling", "crisis", "complaints", "terms", "privacy", "cancellation-and-refunds", "supervisors", "coaches", "trainers", "training-providers",
         "stories/what-happens-in-a-first-therapy-session", "stories/how-do-i-know-if-therapy-is-working", "stories/can-i-have-therapy-online", "stories/how-much-does-therapy-cost-in-the-uk",
         "therapist/demo-therapist-a", "counselling/brighton", "counselling/anxiety"]

SHORTCODES = {"search": "[gototherapy_search]", "join": "[gototherapy_join_form]", "login": "[gototherapy_sign_in]", "account": "[gototherapy_member_account]",
              "profile": "[gototherapy_profile]", "directory": "[gototherapy_therapist_grid]", "home": "[gototherapy_search_card]", "pricing": "[gototherapy_pricing]", "generic": ""}

def uid(): return "".join(random.choice("0123456789abcdef") for _ in range(7))

# ---------------------------------------------------------------- element factories
def container(children, *, boxed=True, row=False, classes="", extra=None, width=None):
    s = {"content_width": "boxed" if boxed else "full", "flex_direction": "row" if row else "column", "_css_classes": classes.strip()}
    if row:
        s.update({"flex_direction_tablet": "column", "flex_direction_mobile": "column", "flex_align_items": "center",
                  "flex_gap": {"column": "48", "row": "32", "unit": "px", "size": 48}, "flex_gap_tablet": {"column": "32", "row": "32", "unit": "px", "size": 32}})
    else:
        s.update({"flex_gap": {"column": "20", "row": "20", "unit": "px", "size": 20}})
    if width: s.update({"width": {"unit": "%", "size": width}, "width_tablet": {"unit": "%", "size": 100}, "width_mobile": {"unit": "%", "size": 100}})
    if extra: s.update(extra)
    return {"id": uid(), "elType": "container", "settings": s, "elements": children, "isInner": not boxed}

def widget(wtype, settings):
    return {"id": uid(), "elType": "widget", "widgetType": wtype, "settings": settings, "elements": []}

def heading(text, size="h2", classes="", link=None):
    s = {"title": text, "header_size": size, "_css_classes": classes}
    if link: s["link"] = {"url": link, "is_external": "", "nofollow": "", "custom_attributes": ""}
    return widget("heading", s)

def text(html_str, classes=""): return widget("text-editor", {"editor": html_str, "_css_classes": classes})
def button(label, url, classes=""): return widget("button", {"text": label, "link": {"url": url, "is_external": "", "nofollow": ""}, "_css_classes": classes, "size": "md"})
def image(url, classes="", alt=""): return widget("image", {"image": {"url": url, "id": 0, "alt": alt, "source": "library"}, "image_size": "full", "caption_source": "none", "_css_classes": classes})
def html_widget(markup, note=""): return widget("html", {"html": (f"<!-- {note} -->\n" if note else "") + markup})
def accordion(items): return widget("accordion", {"tabs": [{"_id": uid(), "tab_title": t, "tab_content": c} for t, c in items], "selected_icon": {"value": "fas fa-plus", "library": "fa-solid"}, "selected_active_icon": {"value": "fas fa-minus", "library": "fa-solid"}})
def icon_list(items): return widget("icon-list", {"icon_list": [{"_id": uid(), "text": t, "link": {"url": u, "is_external": "", "nofollow": ""}, "selected_icon": {"value": "", "library": ""}} for t, u in items], "view": "traditional", "space_between": {"unit": "px", "size": 0}})

# ---------------------------------------------------------------- helpers
def abs_href(href, page_path):
    if not href or href.startswith(("http", "mailto:", "tel:", "#")): return href
    return urljoin(page_path, href)

def fix_links(tag, page_path):
    for a in tag.find_all(["a", "form"]):
        for attr in ("href", "action"):
            if a.has_attr(attr): a[attr] = abs_href(a[attr], page_path)
    for el in tag.find_all(["img", "source"]):
        for attr in ("src", "srcset"):
            if el.has_attr(attr):
                v = el[attr]
                parts = [p.strip() for p in v.split(",")] if attr == "srcset" else [v]
                fixed = []
                for p in parts:
                    url, *rest = p.split(" ")
                    url = abs_href(url, page_path)
                    if url.startswith("/assets/"): url = THEME_BASE + url
                    fixed.append(" ".join([url] + rest))
                el[attr] = ", ".join(fixed)

def classes(tag): return tag.get("class", []) if isinstance(tag, Tag) else []
def has(tag, c): return c in classes(tag)

def is_functional(tag):
    if not isinstance(tag, Tag): return False
    if tag.name in ("form", "dialog", "noscript"): return True
    if tag.find(["form", "dialog"]): return True
    for el in [tag] + tag.find_all(True):
        for a in el.attrs:
            if a.startswith("data-") and a not in ("data-stagger", "data-year"): return True
    return False

def inner(tag): return "".join(str(c) for c in tag.contents).strip()

def image_from(tag, page_path):
    img = tag if tag.name == "img" else tag.find("img")
    if not img: return None
    src = abs_href(img.get("src", ""), page_path)
    if src.startswith("/assets/"): src = IMAGE_BASE + src
    cls = "gt-photo"
    fig = tag if tag.name == "figure" else tag.find_parent("figure")
    for c in classes(tag) + (classes(fig) if fig else []):
        if c == "photo--wide": cls += " gt-photo--wide"
        if c == "photo--square": cls += " gt-photo--square"
        if c == "hero__media": cls += " gt-photo--panel"
    return image(src, cls, img.get("alt", ""))

# ---------------------------------------------------------------- conversion
def convert_children(parent, page_path, state, depth=0):
    out = []
    for node in parent.children:
        if isinstance(node, NavigableString):
            if node.strip(): out.append(text(str(node).strip()))
            continue
        if not isinstance(node, Tag): continue
        out.extend(convert_node(node, page_path, state, depth))
    return out

def convert_node(node, page_path, state, depth):
    n = node.name; cl = classes(node)
    if n == "nav" and has(node, "breadcrumbs"): return []            # Yoast breadcrumbs take over
    if n == "script": return []
    if is_functional(node):
        fix_links(node, page_path)
        markup = str(node)
        if not state["wrapped"]:
            markup = f'<div data-page="{state["page"]}">\n{markup}\n</div>'; state["wrapped"] = True
        sc = SHORTCODES.get(state["page"], "")
        return [html_widget(markup, f"Functional block, kept verbatim. When the Gototherapy plugin is installed, replace with {sc}" if sc else "Functional block, kept verbatim.")]
    if n in ("h1", "h2", "h3", "h4"):
        size = "h1" if n == "h1" else n
        cls = "gt-h1" if n == "h1" else ("gt-h2" if "h2" in cl else "gt-h3")
        a = node.find("a")
        link = abs_href(a.get("href"), page_path) if a else None
        return [heading(inner(a) if a else inner(node), size, cls, link)]
    if n == "p" and "eyebrow" in cl:
        return [heading(inner(node), "p", "gt-eyebrow" + (" gt-eyebrow--ember" if "eyebrow--ember" in cl else ""))]
    if n == "p":
        cls = "gt-lead" if "lead" in cl else "gt-answer" if "answer" in cl else "gt-meta" if ("meta" in cl or "legal-updated" in cl) else "gt-soft" if "soft" in cl else ""
        fix_links(node, page_path); return [text(f"<p>{inner(node)}</p>", cls)]
    if n == "div" and ("prose" in cl or "directory-longform" in cl):
        fix_links(node, page_path)
        # promote headings inside prose to widgets so they are editable, text between them becomes text widgets
        out, buf = [], []
        def flush():
            if buf: out.append(text("".join(buf), "gt-prose")); buf.clear()
        for c in node.children:
            if isinstance(c, Tag) and c.name in ("h2", "h3"):
                flush(); out.extend(convert_node(c, page_path, state, depth + 1))
            elif isinstance(c, Tag) and (c.name == "div" and ("placeholder" in classes(c) or "note-panel" in classes(c))):
                flush(); out.append(html_widget(str(c)))
            elif isinstance(c, Tag): buf.append(str(c))
            elif str(c).strip(): buf.append(str(c))
        flush(); return out
    if n == "a" and "button" in cl:
        cls = "gt-button-ghost" if "button--ghost" in cl else "gt-button-quiet" if "button--quiet" in cl else ""
        return [button(node.get_text(" ", strip=True), abs_href(node.get("href"), page_path), cls)]
    if n == "a" and "text-link" in cl:
        return [button(node.get_text(" ", strip=True), abs_href(node.get("href"), page_path), "gt-button-quiet")]
    if n in ("picture", "img") or (n == "figure" and "photo" in cl):
        w = image_from(node, page_path); return [w] if w else []
    if n == "div" and "faq" in cl:
        items = []
        for d in node.find_all("details"):
            s = d.find("summary"); body = d.find("div", class_="faq__a")
            for svg in s.find_all("svg"): svg.decompose()
            fix_links(body, page_path)
            items.append((s.get_text(" ", strip=True), inner(body)))
        return [accordion(items)]
    if n == "a" and "card" in cl:
        h = node.find(["h2", "h3"]); p = node.find("p")
        kids = []
        if h: kids.append(heading(inner(h), "h3", "gt-h3", abs_href(node.get("href"), page_path)))
        if p: kids.append(text(f"<p>{inner(p)}</p>", "gt-soft"))
        return [container(kids, boxed=False, classes="gt-card")]
    if n in ("article", "div") and "card" in cl and not is_functional(node):
        fix_links(node, page_path)
        kids = convert_children(node, page_path, state, depth + 1)
        return [container(kids, boxed=False, classes="gt-card")]
    if n == "div" and ("note-panel" in cl or "placeholder" in cl or "reviewer" in cl):
        fix_links(node, page_path); return [html_widget(str(node))]
    if n == "blockquote" or n in ("ul", "ol", "table") or "table-wrap" in cl or "crisis-block" in cl or "legal-toc" in cl or "avatar" in cl:
        fix_links(node, page_path); return [html_widget(str(node))]
    # Button groups as a wrapping row
    if n == "div" and any(c in cl for c in ("hero__actions", "search-card__actions", "form-actions", "empty-state__actions")):
        kids = convert_children(node, page_path, state, depth + 1)
        return [container(kids, boxed=False, row=True, classes="gt-actions", extra={"flex_wrap": "wrap", "flex_gap": {"column": "12", "row": "12", "unit": "px", "size": 12}, "flex_direction_tablet": "row", "flex_direction_mobile": "row"})]
    # Layout wrappers
    if n in ("div", "header", "section", "article") and any(c in cl for c in ("split", "hero__grid", "grid", "profile-hero__grid", "section__head--split")):
        row_children = []
        cols = [c for c in node.children if isinstance(c, Tag)]
        share = round(100 / max(1, len(cols)), 2) if len(cols) <= 4 else None
        for c in cols:
            kids = convert_node(c, page_path, state, depth + 1) if (c.name in ("picture", "figure", "a") or is_functional(c) or c.name in ("h1", "h2", "h3", "p", "blockquote", "ul", "ol")) else convert_children(c, page_path, state, depth + 1)
            row_children.append(container(kids, boxed=False, width=share, classes="gt-col" + (" gt-prose" if has(c, "prose") else "")))
        return [container(row_children, boxed=False, row=True, classes="gt-row" + (" gt-grid" if "grid" in cl else ""))]
    if n in ("div", "aside", "header", "section", "article", "main", "figure", "ul", "ol", "li"):
        return convert_children(node, page_path, state, depth + 1)
    fix_links(node, page_path); return [html_widget(str(node))]

def section_container(sec, page_path, state):
    cl = classes(sec)
    cls = "gt-section"
    if "section--tight" in cl or "hero--page" in cl or "hero--utility" in cl: cls += " gt-section--tight"
    if "section--flush-top" in cl: cls += " gt-section--flush-top"
    extra = {}
    if "section--band" in cl: cls += " gt-band"; extra = {"background_background": "classic", "background_color": "#EBE5DB"}
    if "section--dark" in cl: cls += " gt-dark"; extra = {"background_background": "classic", "background_color": "#2B2520"}
    if "hero" in cl: cls += " gt-hero"
    if "article-head" in cl or "article-body" in cl: cls += " gt-section--tight"
    if is_functional(sec) and (has(sec, "account-shell") or has(sec, "join-shell") or has(sec, "auth") or has(sec, "profile-layout") or has(sec, "profile-hero") or sec.get("data-search") is not None):
        fix_links(sec, page_path)
        markup = str(sec)
        if not state["wrapped"]:
            markup = f'<div data-page="{state["page"]}">\n{markup}\n</div>'; state["wrapped"] = True
        sc = SHORTCODES.get(state["page"], "")
        return container([html_widget(markup, f"Functional block, kept verbatim. Replace with {sc} when the plugin is installed." if sc else "Functional block")], classes=cls, extra=extra)
    kids = []
    if has(sec, "container"):
        kids = convert_node(sec, page_path, state, 0) if any(c in cl for c in ("split", "hero__grid", "grid")) else convert_children(sec, page_path, state)
    else:
        wrappers = [c for c in sec.children if isinstance(c, Tag) and has(c, "container")] or [sec]
        for w in wrappers:
            if any(c in classes(w) for c in ("split", "hero__grid", "grid", "account-shell", "join-shell", "profile-layout")):
                kids.extend(convert_node(w, page_path, state, 0))
            else:
                kids.extend(convert_children(w, page_path, state))
    return container(kids, classes=cls, extra=extra)

def convert_page(path):
    src = ROOT / (path or ".") / "index.html"
    soup = BeautifulSoup(src.read_text(encoding="utf-8"), "html.parser")
    page_path = "/" + (path + "/" if path else "")
    body = soup.body; page_type = body.get("data-page", "generic")
    main = soup.find("main")
    state = {"page": page_type, "wrapped": False}
    elements = []
    tops = [c for c in main.children if isinstance(c, Tag)]
    for sec in tops:
        if sec.name == "article":                      # story pages
            for part in [c for c in sec.children if isinstance(c, Tag)]: elements.append(section_container(part, page_path, state))
            continue
        if sec.name == "dialog":                       # modals belong with the functional block
            fix_links(sec, page_path); elements.append(container([html_widget(str(sec), "Modal used by the functional block above")], classes="gt-section--flush-top")); continue
        if sec.name == "div" and has(sec, "sticky-cta"): continue
        elements.append(section_container(sec, page_path, state))
    title = soup.title.get_text(strip=True) if soup.title else (path or "Home")
    meta = {"title": title, "description": (soup.find("meta", attrs={"name": "description"}) or {}).get("content", ""), "robots": (soup.find("meta", attrs={"name": "robots"}) or {}).get("content", "index, follow"), "url": SITE + page_path}
    return elements, meta

# ---------------------------------------------------------------- header / footer
def header_template():
    brand = heading('<a href="/">goto<span>therapy</span></a>', "div", "gt-brand")
    nav = widget("nav-menu", {"menu": "primary", "layout": "horizontal", "align_items": "center", "pointer": "none", "toggle": "burger", "dropdown": "tablet", "full_width": "stretch", "_css_classes": "gt-nav"})
    actions = container([button("Log in", "/login/", "gt-button-quiet"), button("Join as a professional", "/join/", "gt-button-ghost"), button("Find a therapist", "/find-a-therapist/")], boxed=False, row=True, classes="gt-header-actions", extra={"flex_gap": {"column": "8", "row": "8", "unit": "px", "size": 8}, "flex_direction_tablet": "row", "flex_direction_mobile": "column"})
    row = container([container([brand], boxed=False, classes="gt-header-brand", extra={"width": {"unit": "%", "size": 20}}), container([nav], boxed=False, classes="gt-header-nav", extra={"width": {"unit": "%", "size": 45}}), container([actions], boxed=False, classes="gt-header-cta", extra={"width": {"unit": "%", "size": 35}, "flex_justify_content": "flex-end"})],
                    boxed=True, row=True, classes="gt-header-inner", extra={"flex_gap": {"column": "16", "row": "8", "unit": "px", "size": 16}, "flex_direction_tablet": "row", "flex_direction_mobile": "row", "flex_wrap": "wrap"})
    return [container([row], boxed=False, classes="gt-header", extra={"background_background": "classic", "background_color": "rgba(245,242,236,0.92)"})]

def footer_template():
    cols = [
        container([heading("goto<span>therapy</span>", "div", "gt-brand"), text("<p>A UK directory of therapists, supervisors, coaches and trainers whose registration, insurance and supervision have been checked by a person.</p>")], boxed=False, width=34),
        container([heading("Finding therapy", "p"), icon_list([("Find a therapist", "/find-a-therapist/"), ("How it works", "/how-it-works/"), ("How we verify", "/how-we-verify/"), ("Online counselling", "/online-counselling/"), ("Counselling by town and issue", "/counselling/"), ("Stories", "/stories/")])], boxed=False, width=22),
        container([heading("For professionals", "p"), icon_list([("Join as a professional", "/join/"), ("Membership and pricing", "/pricing/"), ("Log in", "/login/"), ("Supervisors", "/supervisors/"), ("Coaches", "/coaches/"), ("Trainers and training providers", "/trainers/")])], boxed=False, width=22),
        container([heading("Gototherapy", "p"), icon_list([("About", "/about/"), ("Urgent support", "/crisis/"), ("Complaints", "/complaints/"), ("Terms of service", "/terms/"), ("Privacy policy", "/privacy/"), ("Cancellation and refunds", "/cancellation-and-refunds/")])], boxed=False, width=22),
    ]
    grid = container(cols, boxed=True, row=True, classes="gt-footer-grid", extra={"flex_align_items": "flex-start"})
    crisis = container([container([text('<p>Gototherapy is a directory, not an emergency service. If you or someone else is in immediate danger, call 999. For other urgent help, see <a href="/crisis/">urgent support</a>.</p>')], boxed=False, classes="gt-crisis")], boxed=True)
    bottom = container([text('<p>&copy; <span data-year>2026</span> Gototherapy. gototherapy.co.uk. British English throughout. &nbsp;·&nbsp; <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></p>', "gt-meta")], boxed=True, classes="gt-footer-bottom")
    return [container([grid, crisis, bottom], boxed=False, classes="gt-footer", extra={"background_background": "classic", "background_color": "#2B2520"})]

# ---------------------------------------------------------------- output
def write_template(name, elements, ttype, title, page_settings=None):
    OUT_T.mkdir(parents=True, exist_ok=True); OUT_P.mkdir(parents=True, exist_ok=True)
    tpl = {"content": elements, "page_settings": page_settings or {}, "version": "0.4", "title": title, "type": ttype}
    (OUT_T / f"{name}.json").write_text(json.dumps(tpl, ensure_ascii=False, indent=1), encoding="utf-8")
    paste = {"type": "elementor", "siteurl": SITE, "elements": elements}
    (OUT_P / f"{name}.json").write_text(json.dumps(paste, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    random.seed(7)
    write_template("00-header", header_template(), "header", "Gototherapy — Header")
    write_template("00-footer", footer_template(), "footer", "Gototherapy — Footer")
    index = []
    for i, p in enumerate(PAGES, 1):
        els, meta = convert_page(p)
        slug = (p or "home").replace("/", "__")
        settings = {"template": "elementor_header_footer", "hide_title": "yes"}
        write_template(f"{i:02d}-{slug}", els, "page", meta["title"], settings)
        n_html = sum(1 for _ in json.dumps(els).split('"widgetType": "html"')) - 1
        index.append({"file": f"{i:02d}-{slug}.json", "wordpress_slug": (p.split('/')[-1] if p else ""), "path": "/" + (p + "/" if p else ""), "title": meta["title"], "description": meta["description"], "robots": meta["robots"], "html_widgets": n_html})
    (ROOT / "elementor/INDEX.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(PAGES) + 2} templates to elementor/templates and elementor/paste")
    for row in index: print(f"  {row['file']:<60} html widgets: {row['html_widgets']}")
