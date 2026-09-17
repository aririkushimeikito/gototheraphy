#!/usr/bin/env python3
"""
Builds a single self-contained HTML file of the homepage (header, footer,
styles, scripts, data and images all inlined). Run after tools/build.py.

  python3 tools/build-standalone.py            → dist/gototherapy-home.html
  python3 tools/build-standalone.py --links live   internal links → live site
  python3 tools/build-standalone.py --links hash   internal links → "#" (default)
"""
import re, json, base64, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
LIVE = 'https://aririkushimeikito.github.io/gototheraphy/'
mode = 'live' if '--links' in sys.argv and sys.argv[sys.argv.index('--links') + 1] == 'live' else 'hash'
OUT = ROOT / 'dist' / 'gototherapy-home.html'
html = (ROOT / 'index.html').read_text()

css = "\n".join((ROOT / f'assets/css/{n}.css').read_text() for n in ['variables', 'base', 'layout', 'components', 'pages', 'responsive'])
def datauri(path, mime):
    return f'data:{mime};base64,' + base64.b64encode((ROOT / path).read_bytes()).decode()
# CSS background images → data URIs
css = re.sub(r'url\("\.\./images/([a-z-]+)-\d+\.jpg"\)', lambda m: f'url("{datauri("assets/images/" + m.group(1) + "-800.webp", "image/webp")}")', css)
html = re.sub(r'<link rel="stylesheet" href="\./assets/css/[^"]+">\n?', '', html)
html = re.sub(r'<script type="module" src="\./assets/js/main\.js[^"]*"></script>\n?', '', html)
html = html.replace('<link rel="icon" href="./assets/icons/favicon.svg" type="image/svg+xml">', f'<link rel="icon" href="{datauri("assets/icons/favicon.svg", "image/svg+xml")}" type="image/svg+xml">')
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', '', html)
html = html.replace('</head>', f'<style>\n{css}\n</style>\n</head>')

html = re.sub(r'<source type="image/webp"[^>]*>\n?', '', html)
def img_sub(m):
    tag = m.group(0)
    name = re.search(r'\./assets/images/([a-z-]+)-\d+\.jpg', tag).group(1)
    tag = re.sub(r'\s*srcset="[^"]*"', '', tag); tag = re.sub(r'\s*sizes="[^"]*"', '', tag); tag = tag.replace(' loading="lazy"', '')
    return re.sub(r'src="[^"]*"', f'src="{datauri("assets/images/" + name + "-800.webp", "image/webp")}"', tag)
html = re.sub(r'<img [^>]*>', img_sub, html)

base = LIVE if mode == 'live' else '#'
html = re.sub(r'(href|action)="\./[^"]*"', lambda m: f'{m.group(1)}="{base}"' if mode == 'hash' else m.group(0).replace('="./', '="' + LIVE), html)

data = {n: json.load(open(ROOT / f'data/{n}.json')) for n in ['therapists', 'locations', 'issues', 'modalities', 'roles', 'articles', 'pricing']}
for n in ['therapists', 'locations', 'issues', 'modalities', 'articles']: data[n] = data[n]['records']
def mod(name):
    s = (ROOT / f'assets/js/{name}.js').read_text()
    s = re.sub(r'^import .*?;\n', '', s, flags=re.M)
    s = re.sub(r'^export (async )?function', r'\1function', s, flags=re.M)
    s = re.sub(r'^export const', 'const', s, flags=re.M)
    return s
data_js = mod('data')
data_js = re.sub(r"const ROOT = new URL\('\.\./\.\./', import\.meta\.url\)\.pathname;", f"const ROOT = '{LIVE if mode == 'live' else '#'}';", data_js)
data_js = re.sub(r"async function load\(name\) \{.*?\n\}\n", "const INLINE_DATA = " + json.dumps(data) + ";\nasync function load(name) { if (!(name in INLINE_DATA)) throw new Error('Unknown data set: ' + name); return INLINE_DATA[name]; }\n", data_js, flags=re.S)
if mode == 'hash':
    data_js = data_js.replace("function url(path) { return ROOT + String(path).replace(/^\\//, ''); }", "function url(path) { return '#'; }")
bundle = "\n".join([mod('ui'), mod('navigation'), mod('hours'), data_js, mod('verification'), mod('filters'), mod('search')])
if mode == 'hash':
    bundle = bundle.replace("location.href = url('find-a-therapist/') + serialiseFilters(f);", "/* links disabled in this standalone build */")
tail = """
document.documentElement.classList.add('js');
initNavigation(); initReveal(); initModals(); initTabs(); initPasswordToggles(); initYear(); initHours();
const launcher = document.querySelector('[data-search-launcher]'); if (launcher) initSearchLauncher(launcher);
const preview = document.querySelector('[data-profile-preview]'); if (preview) renderPreview(preview, { limit: 3, filter: (r) => (r.roles || [r.role]).includes('therapist') });
"""
html = html.replace('</body>', "<script>\n(function () {\n'use strict';\n" + bundle + tail + "\n})();\n</script>\n</body>")
html = html.replace('<!-- @chrome:head -->', '<!-- Standalone build: styles, scripts, data and images are inlined. -->')
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html)
print('written', OUT, round(OUT.stat().st_size / 1024), 'KB, links:', mode)
