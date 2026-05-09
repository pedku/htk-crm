#!/usr/bin/env python3
"""
auto_schedule.py — Asigna proximo_seguimiento a leads sin IA.
Distribuye en horario laboral (Lun-Vie 8:00-18:00, Sab 8:00-13:00).
Agrupa por segmento para optimizar el outreach.

Uso:
    python3 scripts/auto_schedule.py                     # programar todos los leads nuevos
    python3 scripts/auto_schedule.py --segmento hoteles  # solo un segmento
    python3 scripts/auto_schedule.py --start 2026-05-11  # desde que dia (default: manana)
    python3 scripts/auto_schedule.py --dry-run           # solo mostrar, no actualizar
"""

import sys, os, re, sqlite3, argparse
from datetime import datetime, timedelta, time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'crm', 'htk_crm.db')
TZ = -5  # Colombia UTC-5

# Orden de segmentos por prioridad (primero los mas importantes)
SEGMENT_ORDER = [
    'distribuidor cargadores',
    'B2B taller',
    'B2B fabrica',
    'energia solar',
    'B2B comercio',
    'hoteles',
    'restaurantes',
    'consumidor',
]

BUSINESS_HOURS = {
    0: None,   # Domingo
    1: (8, 18),  # Lunes
    2: (8, 18),  # Martes
    3: (8, 18),  # Miercoles
    4: (8, 18),  # Jueves
    5: (8, 18),  # Viernes
    6: (8, 13),  # Sabado
}


def get_db():
    return sqlite3.connect(DB_PATH)


def next_business_slot(from_date, slot_minutes=15):
    """
    Yield (datetime, segment_count) tuples for business hours.
    Each slot is `slot_minutes` long.
    """
    current = from_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    while True:
        wd = current.weekday()
        # Sunday (6 in ISO, but weekday() returns 6 for Sunday)
        wd_py = current.weekday()  # 0=Mon, 6=Sun
        hours = BUSINESS_HOURS.get(wd_py, None)
        
        if hours is None:
            current += timedelta(days=1)
            current = current.replace(hour=0, minute=0)
            continue
        
        start_h, end_h = hours
        slot_start = current.replace(hour=start_h, minute=0)
        slot_end = current.replace(hour=end_h, minute=0)
        
        slot = slot_start
        while slot + timedelta(minutes=slot_minutes) <= slot_end:
            yield slot
            slot += timedelta(minutes=slot_minutes)
        
        current += timedelta(days=1)
        current = current.replace(hour=0, minute=0)


def get_pending_leads(segment=None):
    db = get_db()
    if segment:
        cur = db.execute("SELECT id, nombre, segmento, contacto FROM leads WHERE estado='nuevo' AND segmento=? ORDER BY segmento, id", (segment,))
    else:
        cur = db.execute("SELECT id, nombre, segmento, contacto FROM leads WHERE estado='nuevo' AND segmento!='' ORDER BY segmento, id")
    
    # Group by segment
    by_seg = {}
    for r in cur.fetchall():
        seg = r[2] or 'otro'
        if seg not in by_seg:
            by_seg[seg] = []
        by_seg[seg].append(r)
    
    # Sort segments by priority
    ordered = []
    for seg in SEGMENT_ORDER:
        if seg in by_seg:
            ordered.append((seg, by_seg[seg]))
    for seg in sorted(by_seg.keys()):
        if seg not in SEGMENT_ORDER:
            ordered.append((seg, by_seg[seg]))
    
    return ordered


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Auto-schedule lead follow-ups')
    parser.add_argument('--segmento', help='Solo un segmento')
    parser.add_argument('--start', help='Fecha inicio YYYY-MM-DD (default: manana)')
    parser.add_argument('--dry-run', action='store_true', help='Solo mostrar, no actualizar')
    args = parser.parse_args()

    # Start from tomorrow or specified date
    if args.start:
        start_date = datetime.strptime(args.start, '%Y-%m-%d')
    else:
        start_date = datetime.now() + timedelta(days=1)
    
    # If today is still business hours, use today
    now = datetime.now()
    wd = now.weekday()
    bh = BUSINESS_HOURS.get(wd, None)
    if bh:
        h = now.hour
        if bh[0] <= h < bh[1]:
            start_date = now

    pending = get_pending_leads(args.segmento)
    
    if not pending:
        print('No hay leads nuevos pendientes de programar.')
        sys.exit(0)

    total_leads = sum(len(leads) for _, leads in pending)
    print('Programando %d leads en %d segmentos\n' % (total_leads, len(pending)))
    
    slot_gen = next_business_slot(start_date)
    updated = 0
    
    for seg_name, leads in pending:
        # 2-3 leads per segment per slot
        leads_per_slot = max(2, min(4, len(leads) // 3 + 1))
        
        print('%s (%d leads):' % (seg_name, len(leads)))
        
        for i in range(0, len(leads), leads_per_slot):
            batch = leads[i:i + leads_per_slot]
            slot = next(slot_gen)
            slot_str = slot.strftime('%a %d/%m %H:%M')
            
            if not args.dry_run:
                db = get_db()
                for lead in batch:
                    db.execute('UPDATE leads SET proximo_seguimiento=? WHERE id=?',
                               (slot.isoformat(), lead[0]))
                db.commit()
            
            for lead in batch:
                has_tel = bool(re.search(r'Tel:|3\d{9}', lead[3] or ''))
                has_email = bool(re.search(r'@', lead[3] or ''))
                icon = '📞' if has_tel else ('✉️' if has_email else '🌐')
                print('  %s %s | %s %s -> %s' % (icon, lead[0], lead[1][:25], slot_str, has_tel and 'TEL' or (has_email and 'EMAIL' or 'WEB')))
            
            updated += len(batch)
        
        print()
    
    if args.dry_run:
        print('Modo dry-run: no se actualizo nada.')
    else:
        print('Actualizados: %d leads con fecha de seguimiento.' % updated)
