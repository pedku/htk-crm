#!/usr/bin/env python3
"""
auto_score.py — Puntua leads del CRM HTK sin IA.
Asigna puntuacion 0-100 basada en:
  - Datos de contacto disponibles
  - Segmento (prioridad de negocio)
  - Estado actual
  - Antiguedad

Uso:
    python3 scripts/auto_score.py                    # puntuar todos
    python3 scripts/auto_score.py --segmento hoteles # solo un segmento
    python3 scripts/auto_score.py --lead PRO-005     # solo un lead
    python3 scripts/auto_score.py --top 10           # top N leads
"""

import sys, os, re, sqlite3, argparse
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'crm', 'htk_crm.db')

# Prioridad de segmento para empresa joven
SEGMENT_PRIORITY = {
    'B2B taller':          90,   # Ya hay un cliente aqui
    'distribuidor cargadores': 85,  # Linea directa de HTK
    'B2B fabrica':         75,   # Automatizacion industrial
    'B2B comercio':        70,
    'energia solar':       65,   # Crecimiento pero requiere mas prospeccion
    'hoteles':             60,
    'restaurantes':        55,
    'consumidor':          40,
}

# Peso de cada factor
WEIGHTS = {
    'segmento':     0.25,
    'telefono':     0.25,
    'email':        0.15,
    'whatsapp':     0.10,
    'web':          0.05,
    'estado':       0.10,
    'antiguedad':   0.10,
}


def get_db():
    return sqlite3.connect(DB_PATH)


def score_lead(row):
    lid = row[0]
    nombre = row[1]
    contacto = row[2]
    segmento = row[3]
    linea_interes = row[4]
    estado = row[5]
    fuente = row[6]
    fecha_creacion = row[7]
    proximo = row[8]
    notas = row[9]
    valor_estimado = row[10] if len(row) > 10 else 0
    score = 0.0
    details = []
    c = contacto or ''
    n = notas or ''

    # 1. Segmento priority
    seg_score = SEGMENT_PRIORITY.get(segmento, 30)
    score += seg_score * WEIGHTS['segmento']
    details.append('segmento:%d' % seg_score)

    # 2. Has phone (Colombian valid)
    has_phone = bool(re.search(r'(?:Tel:|telefono|contacto)\s*[:]?\s*[+]?3\d{9}', c, re.I) or
                     re.search(r'3\d{9}', c))
    if has_phone:
        score += 100 * WEIGHTS['telefono']
        details.append('tel:+100')
    else:
        # Partial: might have phone in notas
        has_phone_notes = bool(re.search(r'3\d{9}', n))
        if has_phone_notes:
            score += 50 * WEIGHTS['telefono']
            details.append('tel:+50(notas)')
        else:
            details.append('tel:+0')

    # 3. Has email
    has_email = bool(re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', c))
    if has_email:
        score += 100 * WEIGHTS['email']
        details.append('email:+100')
    else:
        details.append('email:+0')

    # 4. Has WhatsApp
    has_wa = bool(re.search(r'WA:|whatsapp|wa\.me|322', c, re.I))
    if has_wa:
        score += 100 * WEIGHTS['whatsapp']
        details.append('wa:+100')

    # 5. Has website
    has_web = bool(re.search(r'Web:|http|www\.', c, re.I))
    if has_web:
        score += 100 * WEIGHTS['web']
        details.append('web:+100')

    # 6. Estado score
    estado_scores = {
        'nuevo': 30,
        'contactado': 60,
        'interesado': 85,
        'calificado': 80,
        'negociacion': 90,
        'cliente': 100,
        'perdido': 0,
    }
    est_score = estado_scores.get(estado, 20)
    score += est_score * WEIGHTS['estado']
    details.append('estado:%d' % est_score)

    # 7. Antiguedad (newer = higher priority)
    try:
        created = datetime.fromisoformat(fecha_creacion) if fecha_creacion else datetime.now()
        days_old = (datetime.now() - created).days
        age_score = max(0, 100 - days_old * 2)  # pierde 2 puntos por dia
    except:
        age_score = 50
    score += age_score * WEIGHTS['antiguedad']
    details.append('edad:%d' % age_score)

    return round(score, 1), details


def get_all_leads(segment=None, lead_id=None):
    db = get_db()
    if lead_id:
        cur = db.execute('SELECT * FROM leads WHERE id=?', (lead_id,))
    elif segment:
        cur = db.execute('SELECT * FROM leads WHERE segmento=?', (segment,))
    else:
        cur = db.execute('SELECT * FROM leads')
    return cur.fetchall()


def get_columns():
    db = get_db()
    return [r[1] for r in db.execute('PRAGMA table_info(leads)').fetchall()]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Auto-score CRM leads')
    parser.add_argument('--segmento', help='Solo un segmento')
    parser.add_argument('--lead', help='Solo un lead')
    parser.add_argument('--top', type=int, default=0, help='Mostrar solo top N')
    args = parser.parse_args()

    leads = get_all_leads(args.segmento, args.lead)
    cols = get_columns()

    if not leads:
        print('No leads encontrados')
        sys.exit(0)

    scored = []
    for lead in leads:
        s, details = score_lead(lead)
        scored.append((s, lead, details))

    scored.sort(key=lambda x: -x[0])

    if args.top:
        scored = scored[:args.top]

    print('\nPuntuacion de Leads HTK\n')
    print('%-10s %-35s %-22s %6s  %s' % ('ID', 'Empresa', 'Segmento', 'Score', 'Prioridad'))
    print('-' * 85)
    
    for s, lead, details in scored:
        lid = lead[0]
        nombre = (lead[1] or '')[:33]
        segmento = (lead[3] or '')[:20]
        estado = lead[5] or ''
        
        if s >= 70:
            prio = 'ALTA'
        elif s >= 45:
            prio = 'MEDIA'
        else:
            prio = 'BAJA'
        
        print('%-10s %-35s %-22s %5.1f  %s' % (lid, nombre, segmento, s, prio))

    print()
    print('Categorias:')
    altas = sum(1 for s, _, _ in scored if s >= 70)
    medias = sum(1 for s, _, _ in scored if 45 <= s < 70)
    bajas = sum(1 for s, _, _ in scored if s < 45)
    print('  ALTA  (>=70): %d' % altas)
    print('  MEDIA (45-69): %d' % medias)
    print('  BAJA  (<45):  %d' % bajas)
