#!/usr/bin/env python3
"""Extract CSS + JS + tabs from index.html into modular structure."""
import re, os

BASE = '/home/peku/htk-crm-dev'
SRC = os.path.join(BASE, 'templates', 'index.html')
PAGES = os.path.join(BASE, 'templates', 'pages')
STATIC_CSS = os.path.join(BASE, 'static', 'css')
STATIC_JS = os.path.join(BASE, 'static', 'js')

os.makedirs(PAGES, exist_ok=True)
os.makedirs(STATIC_CSS, exist_ok=True)
os.makedirs(STATIC_JS, exist_ok=True)

with open(SRC) as f:
    html = f.read()

total_divs_open = html.count('<div')
total_divs_close = html.count('</div>')
print(f"Source: {len(html)} chars, divs: {total_divs_open}/{total_divs_close}")

# ── 1. Extract CSS ──────────────────────────────────────────────────
style_m = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
css = style_m.group(1).strip()
with open(os.path.join(STATIC_CSS, 'crm.css'), 'w') as f:
    f.write(css)
print(f"✅ CSS: {len(css)} chars")

# Remove style from working copy
html = html[:style_m.start()] + html[style_m.end():]

# Add CSS link in head
html = html.replace(
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">\n <link rel="stylesheet" href="/static/css/crm.css">'
)

# ── 2. Extract JS ───────────────────────────────────────────────────
# Find bootstrap CDN + the main script block
bs_m = re.search(r'(<script src="https://cdn\.jsdelivr\.net/npm/bootstrap.*?</script>)\s*<script>\s*\n(.*?)</script>\s*\n\s*</body>', html, re.DOTALL)
if bs_m:
    bootstrap_tag = bs_m.group(1)
    js_code = bs_m.group(2)
    # Remove both from html
    html = html[:bs_m.start()] + '\n</div>\n</div>\n</div>\n\n</body>\n</html>'
else:
    raise Exception("Could not find bootstrap+script block")

with open(os.path.join(STATIC_JS, 'crm.js'), 'w') as f:
    f.write(js_code)
print(f"✅ JS: {len(js_code)} chars, {len(js_code.splitlines())} lines")

# ── 3. Find tab boundaries ─────────────────────────────────────────
tab_names = [
    'dashboard', 'kanban', 'clients', 'workorders', 
    'leads', 'interactions', 'automation', 'config', 'inventario'
]

tab_positions = {}
for tn in tab_names:
    m = re.search(rf'<div id="tab-{tn}"', html)
    if m:
        tab_positions[tn] = m.start()

sorted_tabs = sorted(tab_positions.items(), key=lambda x: x[1])
print(f"Found {len(sorted_tabs)} tabs")

# ── 4. Create base.html ────────────────────────────────────────────
first_tab_start = sorted_tabs[0][1]
shell = html[:first_tab_start]

# Add Jinja includes
includes = '\n'
for tn, _ in sorted_tabs:
    filename = f'pages/{tn}.html'
    if tn == 'workorders':
        filename = 'pages/work_orders.html'
    inc = "{% include '" + filename + "' %}"
    includes += ' ' + inc + '\n'

shell += includes

# Find and keep the shared modals (genericModal, templateEditorModal)
# They are after the last tab content but before </body>
# We need to extract them from the original HTML
last_tab_end = tab_positions[sorted_tabs[-1][0]]
# Find the next </div> that closes the last tab 
# Actually, let me find the modals between last tab and JS block
after_tabs = html[last_tab_end:]
# Find genericModal
gm_start = after_tabs.find('<div class="modal fade" id="genericModal"')
tm_start = after_tabs.find('<div class="modal fade" id="templateEditorModal"')

if gm_start >= 0 and tm_start >= 0:
    # Try to find where modals end (before the closing container)
    # The modals should be between last tab and the closing container divs
    # Look for the end of templateEditorModal
    # Find the closing </div> pattern: the modals end before the container-fluid closes
    modal_end = after_tabs.rfind('</div>', tm_start, after_tabs.rfind('</div>'))
    modals_html = after_tabs[gm_start:modal_end + 6]
    # But we need a cleaner approach...
    # Actually the modals are right before </div>\n</div>\n</div> (close of main content)
    # Let me find the closing container pattern
    closing_m = re.search(r'\n(</div>\s*\n\s*</div>\s*\n\s*</div>)', after_tabs)
    if closing_m:
        modals_html = after_tabs[gm_start:closing_m.start()]
        shell += '\n' + modals_html + '\n'
        # Add closing container 
        shell += closing_m.group(1)

# Add script tags at the end
shell += f'\n\n{bootstrap_tag}\n<script src="/static/js/crm.js"></script>\n\n</body>\n</html>'

with open(os.path.join(BASE, 'templates', 'base.html'), 'w') as f:
    f.write(shell)
print(f"✅ base.html: {len(shell)} chars")

# ── 5. Extract tab templates ───────────────────────────────────────
for i, (tn, start) in enumerate(sorted_tabs):
    if i + 1 < len(sorted_tabs):
        end = sorted_tabs[i+1][1]
    else:
        # Last tab: end at the modals section
        end = last_tab_end + gm_start if gm_start >= 0 else len(html)
    
    tab_html = html[start:end].rstrip()
    
    filename = f'{tn}.html'
    if tn == 'workorders':
        filename = 'work_orders.html'
    
    filepath = os.path.join(PAGES, filename)
    with open(filepath, 'w') as f:
        f.write(tab_html)
    
    # Check div balance
    opens = tab_html.count('<div')
    closes = tab_html.count('</div>')
    balance = '✅' if opens == closes else f'❌ ({opens}/{closes})'
    print(f"  {balance} pages/{filename}: {len(tab_html)} chars")

# ── 6. Update views.py ──────────────────────────────────────────────
views_py = os.path.join(BASE, 'app', 'routes', 'views.py')
with open(views_py) as f:
    vcode = f.read()
vcode = vcode.replace("render_template('index.html')", "render_template('base.html')")
with open(views_py, 'w') as f:
    f.write(vcode)
print(f"✅ views.py updated")

# ── 7. Final verification ──────────────────────────────────────────
total_o = 0
total_c = 0
for fn in os.listdir(PAGES):
    with open(os.path.join(PAGES, fn)) as f:
        t = f.read()
    total_o += t.count('<div')
    total_c += t.count('</div>')
print(f"\n📊 Page templates: {total_o} opens / {total_c} closes")
with open(os.path.join(BASE, 'templates', 'base.html')) as f:
    base = f.read()
base_o = base.count('<div')
base_c = base.count('</div>')
print(f"   Base + includes: {base_o}/{base_c}")
print(f"   Overall: {base_o + total_o}/{base_c + total_c}")
