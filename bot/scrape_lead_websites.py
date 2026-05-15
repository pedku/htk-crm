# scrape_lead_websites.py — Buscar teléfonos/WhatsApp en webs de leads HTK
# Usa requests + regex (Scrapling no funcionó con estos hosts)

import json, re, sys, time, ssl
import urllib.request
from urllib.error import URLError, HTTPError

LEADS_PATH = "/home/peku/.openclaw/workspace/data/leads.json"

# Leads que YA tienen teléfono — saltarlos
SKIP_IDS = {"PRO-002", "PRO-018", "PRO-019", "PRO-020", "PRO-021",
            "PRO-022", "PRO-023", "PRO-024"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
}

def fetch_url(url, timeout=15):
    """Fetch URL con urllib (no requiere dependencias externas)."""
    if not url.startswith("http"):
        url = "https://" + url

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read()
            # Intentar detectar encoding
            encoding = resp.headers.get_content_charset()
            if encoding:
                text = raw.decode(encoding, errors="replace")
            else:
                # Detectar por meta tags o default
                text = raw.decode("utf-8", errors="replace")
            return text, resp.status
    except HTTPError as e:
        return "", e.code
    except URLError as e:
        return "", str(e.reason)

def extraer_telefonos(texto):
    """Extrae números colombianos de un texto."""
    encontrados = set()

    # Buscar números completos con posible prefijo 57
    for m in re.finditer(r'(?:\+?57)?[\s-]*([3]\d{2}[\s-]*\d{3}[\s-]*\d{4})', texto):
        raw = m.group(0)
        num = re.sub(r'[\s-]', '', raw)
        solo_digitos = re.sub(r'\D', '', num)
        if len(solo_digitos) >= 12 and solo_digitos.startswith("57"):
            encontrados.add("+" + solo_digitos[:12])
        elif len(solo_digitos) == 10:
            encontrados.add("+57" + solo_digitos)

    # Buscar números de 7 dígitos (fijo Barranquilla)
    for m in re.finditer(r'(?:Tel[ée]fono|Tel|Fijo|Cel|Celular|Contacto)[:\s]*(\+?\d[\d\s-]{6,12})', texto, re.I):
        raw = m.group(1)
        num = re.sub(r'[\s-]', '', raw)
        solo_digitos = re.sub(r'\D', '', num)
        if len(solo_digitos) >= 12 and solo_digitos.startswith("57"):
            encontrados.add("+" + solo_digitos[:12])
        elif 7 <= len(solo_digitos) <= 10:
            encontrados.add("+57" + solo_digitos[-10:].zfill(10))

    return sorted(encontrados)

def extraer_whatsapp(texto):
    """Busca enlaces de WhatsApp."""
    encontrados = set()
    for m in re.finditer(r'(?:wa\.me|api\.whatsapp\.com)[/\s]*(\d+)', texto, re.I):
        encontrados.add("wa.me/" + m.group(1))
    for m in re.finditer(r'(?:WhatsApp|whatsapp)[:\s]+(\+?\d[\d\s-]{8,})', texto):
        encontrados.add(re.sub(r'\s+', '', m.group(1)))
    # Icono de WhatsApp con número al lado
    for m in re.finditer(r'whatsapp.*?(\+?57[\d\s-]{7,})', texto, re.I):
        encontrados.add(re.sub(r'[\s-]', '', m.group(1)))
    return sorted(encontrados)

def extraer_email(texto):
    emails = re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', texto)
    # Filtrar falsos positivos (imágenes base64, etc.)
    validos = [e for e in emails if not any(x in e.lower() for x in ['base64', '.png', '.jpg', '.svg', '.css', '.js'])]
    return sorted(set(validos))

def scrape_web(url, lead_id, lead_nombre):
    """Visita una URL y extrae info de contacto."""
    print(f"  → {url}")
    text, status = fetch_url(url)

    if not text:
        return {"url": url, "status": status, "error": f"HTTP {status}" if isinstance(status, int) else status}

    telefonos = extraer_telefonos(text)
    whatsapps = extraer_whatsapp(text)
    emails = extraer_email(text)

    resultado = {
        "url": url,
        "status": status,
        "telefonos": telefonos,
        "whatsapp": whatsapps,
        "emails": emails,
    }

    # Si no encontramos nada, buscar en subpáginas
    if not telefonos and not whatsapps and not emails:
        for sub in ["/contacto", "/contact", "/contactenos", "/contactanos"]:
            try:
                sub_url = url.rstrip("/") + sub
                print(f"    ↳ {sub}...")
                sub_text, sub_status = fetch_url(sub_url, timeout=10)
                if sub_status != 200 or not sub_text:
                    continue
                sub_tels = extraer_telefonos(sub_text)
                sub_was = extraer_whatsapp(sub_text)
                sub_emails = extraer_email(sub_text)
                if sub_tels or sub_was:
                    resultado["telefonos"].extend(sub_tels)
                    resultado["whatsapp"].extend(sub_was)
                    resultado["emails"].extend(sub_emails)
                    break
            except Exception:
                continue
            time.sleep(1)

    return resultado

def main():
    with open(LEADS_PATH) as f:
        leads = json.load(f)

    # Filtrar leads PRO sin teléfono
    targets = []
    for lead in leads:
        lid = lead.get("id", "")
        if not lid.startswith("PRO-"):
            continue
        if lid in SKIP_IDS:
            continue

        contacto = lead.get("contacto", "")
        notas = lead.get("notas", "")

        # Extraer URL de web
        texto_completo = contacto + " " + notas
        web_match = re.search(r'(?:Web|Sitio|sitio):\s*([^\s|,]+)', texto_completo, re.I)
        if web_match:
            url = web_match.group(1).strip().rstrip(".")
            targets.append({**lead, "web": url})
            continue

        url_match = re.search(r'(https?://[^\s|,)]+)', texto_completo)
        if url_match:
            url = url_match.group(1).strip().rstrip(".)")
            targets.append({**lead, "web": url})

    print(f"🔍 Escaneando {len(targets)} webs de leads...\n")

    resultados = []
    for t in targets:
        print(f"\n📄 {t['id']} — {t['nombre']}")

        res = scrape_web(t["web"], t["id"], t["nombre"])
        resultados.append({"id": t["id"], "nombre": t["nombre"], **res})

        if res.get("error"):
            print(f"  ❌ {res['error']}")
        else:
            if res["telefonos"]:
                print(f"  📞 {', '.join(res['telefonos'])}")
            if res["whatsapp"]:
                print(f"  💬 {', '.join(res['whatsapp'])}")
            if res["emails"]:
                print(f"  📧 {', '.join(res['emails'])}")
            if not any([res["telefonos"], res["whatsapp"], res["emails"]]):
                print(f"  ⚠️  Sin info de contacto")

        time.sleep(1.5)

    # Resumen
    print("\n" + "━" * 55)
    print("📊  RESUMEN")
    print("━" * 55)
    for r in resultados:
        datos = r.get("telefonos", []) + r.get("whatsapp", [])
        icono = "✅" if datos else ("⚠️" if r.get("error") else "❌")
        print(f"  {icono} {r['id']} {r['nombre']}")
        if datos:
            print(f"     {', '.join(datos)}")

    outpath = LEADS_PATH.replace("leads.json", "scraped_contacts.json")
    with open(outpath, "w") as f:
        json.dump(resultados, f, indent=2, ensure_ascii=False)
    print(f"\n💾 Resultados guardados en {outpath}")

if __name__ == "__main__":
    main()
