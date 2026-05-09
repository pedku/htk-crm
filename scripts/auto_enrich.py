#!/usr/bin/env python3
"""
auto_enrich.py — Enriquecimiento autonomo de leads del CRM HTK.
Sin IA. Scrapea sitios web y actualiza la BD directo.

Uso:
    python3 scripts/auto_enrich.py                       # leads con web y sin telefono
    python3 scripts/auto_enrich.py --segmento hoteles    # solo un segmento
    python3 scripts/auto_enrich.py --lead PRO-005        # un lead especifico
    python3 scripts/auto_enrich.py --force               # todos aunque tengan telefono
    python3 scripts/auto_enrich.py --search-hoteles      # buscar hoteles desde web
    python3 scripts/auto_enrich.py --search-restaurantes # buscar restaurantes
"""

import sys, os, re, sqlite3, argparse, time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'crm', 'htk_crm.db')
TIMEOUT = 20
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

PHONE_RE = re.compile(r'[+]?\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,4}')
EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+[.][a-zA-Z]{2,}')
WA_RE = re.compile(r'(?:wa[.]me|api[.]whatsapp|whatsapp[.]com)/(?:send)?(?:\?phone=)?([+]?\d+)')
DOMAIN_RE = re.compile(r'Web:\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})')
URL_RE = re.compile(r'https?://[^\s|)\]]+')

SKIP_EMAILS = {'sentry', 'noreply', 'no-reply', 'example.com', 'wix', '@wix',
               '.png@', '.jpg@', '.css@', '.svg@', '.js@'}


def get_db():
    return sqlite3.connect(DB_PATH)


def extract_urls(text):
    urls = []
    for m in URL_RE.finditer(text):
        urls.append(m.group().rstrip('/'))
    for m in DOMAIN_RE.finditer(text):
        d = m.group(1)
        if not d.startswith('http'):
            d = 'https://' + d
        urls.append(d.rstrip('/'))
    return urls


def scrape_url(url):
    result = {"url": url, "phones": [], "emails": [], "whatsapps": [], "error": None}
    try:
        import requests
        from bs4 import BeautifulSoup
        headers = {'User-Agent': USER_AGENT, 'Accept-Language': 'es-CO,es;q=0.9'}
        resp = requests.get(url, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        html = resp.text

        phones = set()
        for m in PHONE_RE.finditer(html):
            clean = re.sub(r'[\s-]', '', m.group())
            digits = re.sub(r'\D', '', clean)
            if 8 <= len(digits) <= 15:
                phones.add(clean)

        emails = set()
        for m in EMAIL_RE.finditer(html):
            addr = m.group().lower().strip().rstrip('.')
            if not any(x in addr for x in SKIP_EMAILS):
                emails.add(addr)

        whatsapps = set()
        for m in WA_RE.finditer(html):
            whatsapps.add(m.group(1))

        soup = BeautifulSoup(html, 'html.parser')
        for a in soup.find_all('a', href=True):
            href = a['href']
            if href.startswith('mailto:'):
                addr = href[7:].split('?')[0].lower().strip()
                if '@' in addr and not any(x in addr for x in SKIP_EMAILS):
                    emails.add(addr)
            elif 'wa.me' in href or 'whatsapp' in href:
                wm = WA_RE.search(href)
                if wm:
                    whatsapps.add(wm.group(1))

        result['phones'] = sorted(phones)
        result['emails'] = sorted(emails)
        result['whatsapps'] = sorted(whatsapps)

    except Exception as e:
        result['error'] = str(e)[:120]

    return result


def update_lead(lid, data):
    db = get_db()
    cur = db.execute('SELECT contacto, notas FROM leads WHERE id=?', (lid,))
    row = cur.fetchone()
    if not row:
        return False

    current = row[0] or ''
    notes = row[1] or ''

    additions = []
    for p in data.get('phones', []):
        if p not in current:
            additions.append('Tel: ' + p)
    for e in data.get('emails', []):
        if e not in current:
            additions.append('Email: ' + e)
    for w in data.get('whatsapps', []):
        if w not in current:
            additions.append('WA: ' + w)

    if additions:
        sep = ' | ' if current else ''
        new_contact = current + sep + ' | '.join(additions)
        url = data.get('url', 'web')
        note_line = '\n[Auto-enrich] Datos extraidos de ' + url
        db.execute('UPDATE leads SET contacto=? WHERE id=?', (new_contact, lid))
        db.execute('UPDATE leads SET notas=? WHERE id=?',
                   (notes + note_line if notes else note_line, lid))
        db.commit()
        return len(additions)
    return 0


def get_leads_to_scrape(segment=None, lead_id=None, force=False):
    db = get_db()
    if lead_id:
        cur = db.execute('SELECT id, nombre, segmento, contacto FROM leads WHERE id=?', (lead_id,))
    elif segment:
        cur = db.execute('SELECT id, nombre, segmento, contacto FROM leads WHERE segmento=? AND estado="nuevo"', (segment,))
    else:
        cur = db.execute("SELECT id, nombre, segmento, contacto FROM leads WHERE estado='nuevo' AND segmento!=''")

    results = []
    for r in cur.fetchall():
        lid, nombre, seg, contacto = r
        c = contacto or ''

        if not force:
            # Skip if already has a valid phone
            phones_found = PHONE_RE.findall(c)
            has_phone = any(len(re.sub(r'\D', '', p)) >= 8 for p in phones_found)
            if has_phone:
                continue

        urls = extract_urls(c)
        if urls:
            results.append((lid, nombre, seg, urls[0]))
    return results


def search_businesses(segment):
    queries = {
        'hoteles': 'site:booking.com OR site:tripadvisor.com OR site:expedia.com hoteles Barranquilla telefono',
        'restaurantes': 'restaurantes Barranquilla telefono contacto WhatsApp',
    }
    query = queries.get(segment, segment + ' Barranquilla contacto telefono email')

    import urllib.parse
    search_url = 'https://www.google.com/search?q=' + urllib.parse.quote(query)

    try:
        import requests
        from bs4 import BeautifulSoup
        headers = {'User-Agent': USER_AGENT, 'Accept-Language': 'es-CO,es;q=0.9'}
        resp = requests.get(search_url, headers=headers, timeout=15)

        phones = set()
        emails = set()

        for m in PHONE_RE.finditer(resp.text):
            clean = re.sub(r'[\s-]', '', m.group())
            digits = re.sub(r'\D', '', clean)
            if 8 <= len(digits) <= 15:
                phones.add(clean)

        for m in EMAIL_RE.finditer(resp.text):
            addr = m.group().lower().strip()
            if '@' in addr and not any(x in addr for x in SKIP_EMAILS):
                emails.add(addr)

        return {'phones': sorted(phones), 'emails': sorted(emails), 'error': None}
    except Exception as e:
        return {'phones': [], 'emails': [], 'error': str(e)[:120]}


def show_summary():
    db = get_db()
    cur = db.execute("SELECT COUNT(*) FROM leads WHERE estado='nuevo'")
    total = cur.fetchone()[0]
    cur = db.execute("SELECT COUNT(*) FROM leads WHERE estado='nuevo' AND contacto!=''")
    con_datos = cur.fetchone()[0]
    
    cur = db.execute("""
        SELECT segmento, COUNT(*) as total,
               SUM(CASE WHEN contacto!='' AND contacto IS NOT NULL THEN 1 ELSE 0 END) as con_contacto
        FROM leads WHERE estado='nuevo' AND segmento!=''
        GROUP BY segmento ORDER BY total DESC
    """)
    print('  Resumen por segmento:')
    print('  %-25s %5s %5s %5s' % ('Segmento', 'Total', 'Datos', '%'))
    print('  ' + '-' * 42)
    for r in cur.fetchall():
        pct = (r[2] / r[1] * 100) if r[1] > 0 else 0
        print('  %-25s %5d %5d %4d%%' % (r[0], r[1], r[2], pct))
    print()
    print('  Leads nuevos con datos: %d/%d (%.0f%%)' % (con_datos, total, (con_datos/total*100) if total > 0 else 0))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Auto-enrich CRM leads')
    parser.add_argument('--segmento', help='Solo un segmento especifico')
    parser.add_argument('--lead', help='Solo un lead especifico')
    parser.add_argument('--force', action='store_true', help='Incluir leads que ya tienen telefono')
    parser.add_argument('--search-hoteles', action='store_true', help='Buscar hoteles desde web')
    parser.add_argument('--search-restaurantes', action='store_true', help='Buscar restaurantes')
    parser.add_argument('--summary', action='store_true', help='Mostrar resumen de datos')
    args = parser.parse_args()

    if args.summary:
        show_summary()
        sys.exit(0)

    if args.search_hoteles or args.search_restaurantes:
        seg = 'hoteles' if args.search_hoteles else 'restaurantes'
        print('\nBuscando %s en Barranquilla...' % seg)
        result = search_businesses(seg)
        p = len(result.get('phones', []))
        e = len(result.get('emails', []))
        print('  Encontrados: %d telefonos, %d emails' % (p, e))
        if result.get('phones'):
            print('  Telefonos:', ', '.join(result['phones'][:5]))
        if result.get('emails'):
            print('  Emails:', ', '.join(result['emails'][:5]))
        if result.get('error'):
            print('  Error:', result['error'])
        sys.exit(0)

    leads = get_leads_to_scrape(args.segmento, args.lead, args.force)
    if not leads:
        print("No hay leads pendientes de scrapear.")
        show_summary()
        sys.exit(0)

    total = len(leads)
    enriched = 0
    errors = 0
    no_data = 0

    print('\nScrapeando %d leads...\n' % total)

    for i, (lid, nombre, seg, url) in enumerate(leads, 1):
        sys.stdout.write('  [%d/%d] %s %-30s ' % (i, total, lid, nombre[:28]))
        sys.stdout.flush()

        result = scrape_url(url)
        has = len(result['phones']) + len(result['emails']) + len(result['whatsapps'])

        if result['error']:
            print('X ' + result['error'])
            errors += 1
        elif has > 0:
            added = update_lead(lid, result)
            print('OK +%d datos (tel:%d email:%d wa:%d)' %
                  (added, len(result['phones']), len(result['emails']), len(result['whatsapps'])))
            enriched += 1
        else:
            print('- Sin datos extraibles')
            no_data += 1

        time.sleep(1.5)

    print('\n' + '=' * 50)
    print('Scraping completo:')
    print('  Total leads:   %d' % total)
    print('  Enriquecidos:  %d' % enriched)
    print('  Sin datos:     %d' % no_data)
    print('  Errores:       %d' % errors)
    print()
    show_summary()
