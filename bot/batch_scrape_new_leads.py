# batch_scrape_new_leads.py — Scrapea leads nuevos para HTK
# Industria manufacturera + Energía solar

import json, re, ssl, time, urllib.request
from urllib.error import URLError, HTTPError

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
}

LEADS = [
    # Industria Manufacturera
    {"nombre": "Acricol Ltda", "web": "acricol.com", "segmento": "B2B fábrica", "linea": "automatizacion", "notas": "Productos acrílicos y plásticos en general. Barranquilla."},
    {"nombre": "Colorplastic SAS", "web": "colorplasticcolombia.com", "segmento": "B2B fábrica", "linea": "automatizacion", "notas": "33 años de trayectoria. Inyección de plásticos, productos para el hogar. Barranquilla."},
    {"nombre": "Plásticos Mallol SAS", "web": "plasticosmallol.com", "segmento": "B2B fábrica", "linea": "automatizacion", "notas": "Fabricación de productos plásticos. Barranquilla."},
    {"nombre": "Plasmar", "web": "plasmar.com.co", "segmento": "B2B fábrica", "linea": "automatizacion", "notas": "Recuperación posindustrial de plásticos. Barranquilla."},
    {"nombre": "Fayco Plásticos SAS", "web": "plasticosfayco.com", "segmento": "B2B fábrica", "linea": "automatizacion", "notas": "Extrusión, impresión flexográfica, empaques plásticos. Barranquilla."},
    # Energía Solar
    {"nombre": "Solenergy Soluciones", "web": "solenergysoluciones.com", "segmento": "energía solar", "linea": "energia solar", "notas": "Instalación de paneles solares. Barranquilla y Colombia."},
    {"nombre": "Grupo ENER", "web": "grupoener.com", "segmento": "energía solar", "linea": "energia solar", "notas": "Comercialización e instalación de paneles solares. Barranquilla."},
    {"nombre": "Solair Plus SAS", "web": "solair.com.co", "segmento": "energía solar", "linea": "energia solar", "notas": "Paneles solares, ingeniería, monitoreo remoto. Barranquilla."},
    {"nombre": "CleanEnergying", "web": "cleanenergying.com", "segmento": "energía solar", "linea": "energia solar", "notas": "Diseño, suministro, instalación y operación de sistemas fotovoltaicos. Barranquilla."},
    {"nombre": "Solar Costa", "web": "solarcosta.com.co", "segmento": "energía solar", "linea": "energia solar", "notas": "Soluciones solares residenciales, comerciales e industriales. Costa Caribe."},
    {"nombre": "Erco Energy", "web": "erco.energy", "segmento": "energía solar", "linea": "energia solar", "notas": "Más de 2.100 proyectos de paneles solares ejecutados. Nacional."},
    {"nombre": "CER Renovables", "web": "cerenovables.com", "segmento": "energía solar", "linea": "energia solar", "notas": "Venta e instalación de paneles solares. Barranquilla."},
    {"nombre": "Instala Solar", "web": "instalasolar.co", "segmento": "energía solar", "linea": "energia solar", "notas": "Paneles solares para hogar y negocio. Barranquilla."},
    {"nombre": "Paneles Solares Barranquilla", "web": "panelessolaresbarranquilla.com", "segmento": "energía solar", "linea": "energia solar", "notas": "Instalación de paneles solares. Barranquilla."},
]

def fetch_url(url, timeout=15):
    if not url.startswith("http"):
        url = "https://" + url
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read()
            encoding = resp.headers.get_content_charset()
            text = raw.decode(encoding or "utf-8", errors="replace")
            return text, resp.status
    except HTTPError as e:
        return "", e.code
    except URLError as e:
        return "", str(e.reason)

def extraer_telefonos(texto):
    encontrados = set()
    for m in re.finditer(r'(?:\+?57)?[\s-]*([3]\d{2}[\s-]*\d{3}[\s-]*\d{4})', texto):
        num = re.sub(r'[\s-]', '', m.group(0))
        solo = re.sub(r'\D', '', num)
        if len(solo) >= 12 and solo.startswith("57"):
            encontrados.add("+" + solo[:12])
        elif len(solo) == 10:
            encontrados.add("+57" + solo)
    for m in re.finditer(r'(?:Tel[ée]fono|Tel|Fijo|Cel|Celular|Contacto)[:\s]*(\+?\d[\d\s-]{6,12})', texto, re.I):
        num = re.sub(r'[\s-]', '', m.group(1))
        solo = re.sub(r'\D', '', num)
        if len(solo) >= 12 and solo.startswith("57"):
            encontrados.add("+" + solo[:12])
        elif 7 <= len(solo) <= 10:
            encontrados.add("+57" + solo[-10:].zfill(10))
    return sorted(encontrados)

def extraer_whatsapp(texto):
    encontrados = set()
    for m in re.finditer(r'(?:wa\.me|api\.whatsapp\.com)[/\s]*(\d+)', texto, re.I):
        encontrados.add("wa.me/" + m.group(1))
    for m in re.finditer(r'(?:WhatsApp|whatsapp)[:\s]+(\+?\d[\d\s-]{8,})', texto):
        encontrados.add(re.sub(r'\s+', '', m.group(1)))
    return sorted(encontrados)

def extraer_email(texto):
    emails = re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', texto)
    validos = [e for e in emails if not any(x in e.lower() for x in ['base64', '.png', '.jpg', '.svg', '.css', '.js', 'sentry', 'lodash', 'bundle', 'polyfill'])]
    return sorted(set(validos))

def scrape_web(url, nombre):
    print(f"  → {url}...")
    text, status = fetch_url(url)
    if not text:
        print(f"    ❌ HTTP {status}")
        return {"url": url, "error": f"HTTP {status}" if isinstance(status, int) else status}
    
    tels = extraer_telefonos(text)
    was = extraer_whatsapp(text)
    emails = extraer_email(text)
    
    # Buscar en /contacto si no hay nada
    if not tels and not was and not emails:
        for sub in ["/contacto", "/contact", "/contactenos", "/contactanos"]:
            try:
                sub_url = url.rstrip("/") + sub
                sub_text, sub_status = fetch_url(sub_url, timeout=8)
                if sub_status == 200 and sub_text:
                    sub_tels = extraer_telefonos(sub_text)
                    sub_was = extraer_whatsapp(sub_text)
                    sub_emails = extraer_email(sub_text)
                    if sub_tels or sub_was:
                        tels.extend(sub_tels)
                        was.extend(sub_was)
                        emails.extend(sub_emails)
                        print(f"    ↳ info en {sub}")
                        break
            except: pass
            time.sleep(1)
    
    return {
        "url": url,
        "status": status,
        "telefonos": tels,
        "whatsapp": was,
        "emails": emails,
    }

print("🔍 SCRAPING NUEVOS LEADS")
print("=" * 50)

resultados = []
for lead in LEADS:
    print(f"\n📄 {lead['nombre']}")
    res = scrape_web(lead["web"], lead["nombre"])
    resultados.append({**lead, **res})
    
    if res.get("error"):
        print(f"    ❌ {res['error']}")
    else:
        if res["telefonos"]:
            print(f"    📞 {', '.join(res['telefonos'][:3])}{'...' if len(res['telefonos']) > 3 else ''}")
        if res["emails"]:
            print(f"    📧 {', '.join(res['emails'][:3])}{'...' if len(res['emails']) > 3 else ''}")
        if not any([res["telefonos"], res["whatsapp"], res["emails"]]):
            print(f"    ⚠️  Sin contacto encontrado")
    
    time.sleep(2)

# Guardar resultados
with open("/home/peku/.openclaw/workspace/data/scraped_new_leads.json", "w") as f:
    json.dump(resultados, f, indent=2, ensure_ascii=False)

print(f"\n✅ {len(resultados)} leads scrapeados")
print("💾 Guardado en data/scraped_new_leads.json")
