#!/usr/bin/env python3
"""
auto_campaign.py — Prepara campana de mensajes para leads del CRM.
Toma las plantillas de pitches.json y genera mensajes personalizados
para cada lead de un segmento.

Uso:
    python3 scripts/auto_campaign.py                         # leads listos para hoy
    python3 scripts/auto_campaign.py --segmento hoteles      # todos los de un segmento
    python3 scripts/auto_campaign.py --segmento cargadores --channel whatsapp
    python3 scripts/auto_campaign.py --lead PRO-005          # un lead especifico
    python3 scripts/auto_campaign.py --save                  # guardar como interacciones
"""

import sys, os, re, json, sqlite3, argparse
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'crm', 'htk_crm.db')
PITCHES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'pitches.json')


def get_db():
    return sqlite3.connect(DB_PATH)


def load_pitches():
    if not os.path.exists(PITCHES_PATH):
        return None
    with open(PITCHES_PATH) as f:
        return json.load(f)


def find_pitch(pitches, segmento, linea_interes=''):
    best = None
    best_score = 0
    
    for t in pitches.get('plantillas_cuerpo', []):
        segs = [s.lower().strip() for s in t.get('segmentos', [])]
        seg_lower = segmento.lower().strip()
        
        if seg_lower in segs:
            score = 100
        elif any(s in seg_lower for s in segs):
            score = 50
        else:
            continue
        
        # Bonus for matching linea_interes
        if linea_interes:
            lines = [l.lower().strip() for l in t.get('lineas_interes', [])]
            if linea_interes.lower().strip() in lines:
                score += 20
        
        if score > best_score:
            best_score = score
            best = t
    
    return best


def personalize(text, lead_name, lead_contact='', contact_person=''):
    """Replace [Contacto], [Empresa], [Nombre] with actual data."""
    default_greeting = contact_person or lead_name.split()[0] if lead_name else 'señor'
    replacements = {
        '[Contacto]': default_greeting,
        '[contacto]': default_greeting.lower(),
        '[Empresa]': lead_name or 'su empresa',
        '[empresa]': (lead_name or 'su empresa').lower(),
        '[Nombre]': contact_person or lead_name or 'cliente',
        '[nombre]': (contact_person or lead_name or 'cliente').lower(),
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def get_leads_for_campaign(segment=None, lead_id=None, only_due_today=False):
    db = get_db()
    
    if lead_id:
        cur = db.execute('SELECT id, nombre, segmento, linea_interes, contacto, contacto_nombre FROM leads WHERE id=?', (lead_id,))
    elif segment:
        cur = db.execute("SELECT id, nombre, segmento, linea_interes, contacto, contacto_nombre FROM leads WHERE segmento=? AND estado='nuevo'", (segment,))
    elif only_due_today:
        today = datetime.now().strftime('%Y-%m-%d')
        cur = db.execute("SELECT id, nombre, segmento, linea_interes, contacto, contacto_nombre FROM leads WHERE estado='nuevo' AND proximo_seguimiento LIKE ? || '%'", (today,))
    else:
        cur = db.execute("SELECT id, nombre, segmento, linea_interes, contacto, contacto_nombre FROM leads WHERE estado='nuevo' AND segmento!='' ORDER BY segmento")
    
    return cur.fetchall()


def format_contact_info(contacto):
    """Extract contact info for display."""
    c = contacto or ''
    tel = ''
    email = ''
    wa = ''
    
    tm = re.search(r'Tel:\s*([^\s|]+)', c)
    if tm: tel = tm.group(1)
    em = re.search(r'Email:\s*([^\s|]+)', c)
    if em: email = em.group(1)
    wm = re.search(r'WA:\s*([^\s|]+)', c)
    if wm: wa = wm.group(1)
    
    # Fallback: raw number in text
    if not tel:
        tm2 = re.search(r'(3\d{9})', c)
        if tm2: tel = tm2.group(1)
    
    return tel, email, wa


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Auto-campaign message generator')
    parser.add_argument('--segmento', help='Segmento a campaña')
    parser.add_argument('--lead', help='Lead especifico')
    parser.add_argument('--channel', choices=['whatsapp', 'email'], default='whatsapp',
                        help='Canal (default: whatsapp)')
    parser.add_argument('--today', action='store_true', help='Solo leads con seguimiento hoy')
    parser.add_argument('--save', action='store_true', help='Guardar como interacciones pendientes')
    parser.add_argument('--list-segments', action='store_true', help='Listar segmentos disponibles')
    args = parser.parse_args()

    if args.list_segments:
        db = get_db()
        cur = db.execute("SELECT segmento, COUNT(*) FROM leads WHERE estado='nuevo' GROUP BY segmento ORDER BY COUNT(*) DESC")
        print('Segmentos disponibles:')
        for r in cur.fetchall():
            print('  %s (%d leads)' % (r[0], r[1]))
        sys.exit(0)

    pitches = load_pitches()
    if not pitches:
        print('Error: no se encontro data/pitches.json')
        sys.exit(1)

    leads = get_leads_for_campaign(args.segmento, args.lead, args.today)
    if not leads:
        msg = 'hoy' if args.today else 'ese segmento'
        print('No hay leads nuevos en %s.' % msg)
        sys.exit(0)

    channel = args.channel
    channel_info = pitches.get('canales', {}).get(channel, {})
    max_chars = channel_info.get('max_chars', 1000)

    print('Preparando campana por %s para %d leads:\n' % (channel, len(leads)))
    print('=' * 80)

    generated = []
    
    for lead in leads:
        lid, nombre, segmento, linea, contacto = lead[:5]
        contact_person = lead[5] if len(lead) > 5 else ''
        template = find_pitch(pitches, segmento, linea)
        
        if not template:
            print('\n%s %s: NO HAY PITCH para segmento "%s"' % (lid, nombre[:25], segmento))
            continue
        
        body = template.get(channel, template.get('whatsapp', ''))
        if not body:
            print('\n%s %s: NO HAY %s en plantilla "%s"' % (lid, nombre[:25], channel, template.get('id', '')))
            continue
        
        # Personalize
        msg = personalize(body, nombre, contacto, contact_person)
        
        # Truncate if needed
        if len(msg) > max_chars:
            msg = msg[:max_chars-3] + '...'
        
        tel, email, wa = format_contact_info(contacto)
        target = tel or email or '(sin contacto directo)'
        
        print('\n%s %s' % (lid, nombre))
        print('  Plantilla: %s' % template.get('id', ''))
        print('  Enviar a:  %s' % target)
        print('  Longitud:  %d/%d chars' % (len(msg), max_chars))
        print('  Mensaje:')
        for line in msg.split('\n'):
            print('    %s' % line)
        
        generated.append({
            'lead_id': lid,
            'nombre': nombre,
            'canal': channel,
            'destino': target,
            'mensaje': msg,
            'plantilla': template.get('id', ''),
        })
        
        if args.save:
            db = get_db()
            now = datetime.now().isoformat()
            iid = 'INT-' + now[:19].replace(':', '')
            db.execute("""INSERT INTO interactions 
                (id, lead_id, nombre, tipo, direccion, resumen, contenido, fecha, proximo_paso, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (iid, lid, nombre, channel, 'pendiente',
                 'Campana auto-generada para %s' % segmento,
                 msg[:200], now, 'Enviar mensaje', 'pendiente'))
            db.commit()
            print('  [Guardado como interaccion pendiente]')

    print('\n' + '=' * 80)
    print('Generados: %d mensajes para %d leads' % (len(generated), len(leads)))
    if args.save:
        print('Guardados como interacciones pendientes en CRM.')
    else:
        print('Usa --save para guardar como interacciones en el CRM.')
