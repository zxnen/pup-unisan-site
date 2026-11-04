from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
        self.duplicates = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('href'):
            self.links.append(attrs['href'])
        if attrs.get('id'):
            value = attrs['id']
            if value in self.ids:
                self.duplicates.add(value)
            self.ids.add(value)

pages = sorted(p for p in ROOT.glob('*.html') if p.name != '404.html')
for page in pages:
    source = page.read_text()
    parser = Links()
    parser.feed(source)
    if re.search(r'class="[^"]*(?:^|\s)container(?:\s|"|$)', source):
        errors.append(f'{page.name}: use page-container to avoid overriding Bootstrap .container')
    if 'name="viewport"' not in source:
        errors.append(f'{page.name}: missing responsive viewport')
    if 'bootstrap@5.3.8/dist/css/bootstrap.min.css' not in source:
        errors.append(f'{page.name}: Bootstrap 5.3 CDN is missing')
    if 'css/styles.css' not in source:
        errors.append(f'{page.name}: custom stylesheet is missing')
    if 'integrity="sha384-' not in source or 'crossorigin="anonymous"' not in source:
        errors.append(f'{page.name}: Bootstrap CDN integrity attributes are missing')
    if page.name != 'cookie-policy.html' and 'js/main.js' not in source:
        errors.append(f'{page.name}: shared app entry point is missing')
    if page.name != 'cookie-policy.html' and 'class="nav-toggle"' not in source:
        errors.append(f'{page.name}: accessible mobile menu is missing')
    for value in parser.duplicates:
        errors.append(f'{page.name}: duplicate id {value!r}')
    for href in parser.links:
        if href.startswith(('https://','http://','mailto:','tel:','javascript:','#')):
            continue
        target = href.split('#',1)[0].split('?',1)[0]
        if target and not (ROOT / target).exists():
            errors.append(f'{page.name}: missing local link target {target!r}')

css = (ROOT / 'css/styles.css').read_text()
for breakpoint in ('max-width: 760px','max-width: 860px'):
    if breakpoint not in css:
        errors.append(f'CSS: responsive breakpoint {breakpoint} is missing')
if '.container {' in css or '.container.narrow' in css:
    errors.append('CSS: custom page layout must not override Bootstrap .container')
for path in ('supabase/main/migrations/004_admin_activity.sql','supabase/main/migrations/005_media_storage.sql',
             'supabase/faculty/migrations/002_faculty_storage.sql','netlify/functions/faculty-media.mjs',
             'js/controllers/dashboard/mediaSection.js'):
    if not (ROOT/path).exists():
        errors.append(f'missing implementation file {path}')
if 'summary' not in (ROOT/'netlify/functions/moderation.mjs').read_text():
    errors.append('dashboard live summary endpoint is missing')
if '.supabase\\.(co|in)' not in (ROOT/'js/facultySupabaseClient.js').read_text():
    errors.append('faculty client URL validation should support configured Supabase .co and .in domains')
if "'All'" not in (ROOT/'js/controllers/facultyController.js').read_text() or 'faculty-categories' not in (ROOT/'js/controllers/facultyController.js').read_text():
    errors.append('faculty category filters are missing')
for secret_pattern in (r'sb_secret_[A-Za-z0-9_-]{20,}', r'eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{20,}'):
    for path in list(ROOT.glob('*.html')) + list((ROOT/'js').rglob('*.js')) + list((ROOT/'netlify').rglob('*.mjs')):
        if re.search(secret_pattern, path.read_text()):
            errors.append(f'{path.relative_to(ROOT)}: possible privileged credential found')

for path in ('supabase/main/migrations/001_schema.sql','supabase/main/migrations/002_rls.sql','supabase/main/migrations/003_public_security.sql','supabase/faculty/migrations/001_faculty.sql'):
    if not (ROOT/path).exists():
        errors.append(f'missing database migration {path}')

if errors:
    print('\n'.join(f'FAIL: {error}' for error in errors))
    sys.exit(1)
print(f'PASS: checked {len(pages)} pages, local links, responsive assets, secret patterns, and database migration files.')
