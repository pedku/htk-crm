#!/usr/bin/env python3
"""
migrate_fix_crm.py — Normaliza opciones, migra leads faltantes y actualiza segmentos.
Ejecuta con: python3 migrate_fix_crm.py
"""
import json, sqlite3, os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "htk_crm.db")
LEADS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "leads.json")

def conectar():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def normalizar_opcion(op):
    """Normaliza opciones a un formato estándar."""
    mapa = {
        'automatizacion': 'automatización',
        'Automatizacion': 'automatización',
        'Automatización': 'automatización',
        'cargadores': 'cargadores EV',
        'Cargadores': 'cargadores EV',
        'energia solar': 'energía solar',
        'mantenimiento': 'mantenimiento',
        'Mantenimiento': 'mantenimiento',
        'hoteles': 'hoteles',
        'restaurantes': 'restaurantes',
    }
    return mapa.get(op, op.lower())

def run():
    conn = conectar()
    c = conn.cursor()
    
    # ─── 1. Normalizar opciones duplicadas ───────
    print("📦 Normalizando opciones...")
    opciones_actuales = [r['opcion'] for r in c.execute("SELECT DISTINCT opcion FROM leads WHERE opcion != ''").fetchall()]
    for op in opciones_actuales:
        normalizada = normalizar_opcion(op)
        if normalizada != op:
            c.execute("UPDATE leads SET opcion = ? WHERE opcion = ?", (normalizada, op))
            print(f"  ✅ \"{op}\" → \"{normalizada}\"")
    
    # ─── 2. Sincronizar segmentos desde JSON ─────
    print("\n📦 Sincronizando segmentos desde JSON...")
    with open(LEADS_JSON) as f:
        json_leads = json.load(f)
    
    for l in json_leads:
        nombre = l.get('nombre', '')
        segmento = l.get('segmento', '')
        telefono = l.get('telefono', '')
        email = l.get('email', '')
        url = l.get('url', '')
        notas = l.get('notas', '')
        
        if segmento:
            c.execute("UPDATE leads SET segmento = ? WHERE nombre = ? AND (segmento IS NULL OR segmento = '')", 
                     (segmento, nombre))
        if telefono:
            c.execute("UPDATE leads SET numero = ? WHERE nombre = ? AND (numero IS NULL OR numero = '')", 
                     (telefono, nombre))
        if notas:
            c.execute("UPDATE leads SET detalle = ? WHERE nombre = ? AND (detalle IS NULL OR detalle = '')", 
                     (notas, nombre))
    
    print("  ✅ Segmentos sincronizados")
    
    # ─── 3. Migrar leads faltantes ───────────────
    print("\n📦 Migrando leads faltantes desde JSON...")
    nombres_db = {r['nombre'] for r in c.execute("SELECT nombre FROM leads").fetchall()}
    
    nuevos = 0
    for l in json_leads:
        nombre = l.get('nombre', '')
        if nombre and nombre not in nombres_db:
            opcion = normalizar_opcion(l.get('linea_interes', l.get('segmento', '')))
            c.execute("""
                INSERT INTO leads (fecha, numero, nombre, canal, opcion, detalle, fuente, segmento, etapa)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                l.get('fecha_creacion', datetime.now().isoformat()),
                l.get('telefono', l.get('contacto', '')),
                nombre,
                l.get('fuente', 'Web'),
                opcion,
                l.get('notas', ''),
                l.get('fuente', 'Web'),
                l.get('segmento', ''),
                l.get('estado', 'nuevo'),
            ))
            nuevos += 1
    
    print(f"  ✅ {nuevos} nuevos leads migrados")
    
    # ─── 4. Mostrar resultado ────────────────────
    print("\n📊 Estado final:")
    for t in ['leads', 'actividades', 'etapas', 'tags']:
        count = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {count}")
    
    print("\n📊 Leads por opción:")
    for r in c.execute("SELECT opcion, COUNT(*) as c FROM leads WHERE opcion != '' GROUP BY opcion ORDER BY c DESC").fetchall():
        print(f"  {r['opcion']:<20} → {r['c']}")
    
    print("\n📊 Leads por segmento:")
    for r in c.execute("SELECT COALESCE(segmento, '(vacio)') as s, COUNT(*) as c FROM leads GROUP BY s ORDER BY c DESC").fetchall():
        print(f"  {r['s']:<25} → {r['c']}")
    
    print("\n📊 Leads por etapa:")
    for r in c.execute("SELECT COALESCE(etapa, 'nuevo') as e, COUNT(*) as c FROM leads GROUP BY e ORDER BY c DESC").fetchall():
        print(f"  {r['e']:<15} → {r['c']}")
    
    conn.commit()
    conn.close()
    print("\n✅ Migración completa!")

if __name__ == '__main__':
    run()
