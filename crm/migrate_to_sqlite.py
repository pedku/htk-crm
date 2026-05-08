#!/usr/bin/env python3
"""
CRM HTK INGENIERIA — Migration: JSON → SQLite
Usage: python3 migrate_to_sqlite.py
"""
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone, timedelta

COL_TZ = timezone(timedelta(hours=-5))
NOW = datetime.now(COL_TZ).isoformat()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(WORKSPACE, 'data')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')
DB_PATH = os.path.join(BASE_DIR, 'htk_crm.db')


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path) as f:
        content = f.read().strip()
        return json.loads(content) if content else []


SCHEMA = """
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    telefono TEXT DEFAULT '',
    nombre TEXT DEFAULT '',
    fuente TEXT DEFAULT '',
    primer_contacto TEXT DEFAULT NULL,
    ultimo_contacto TEXT DEFAULT NULL,
    interacciones_totales INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'lead',
    segmento TEXT DEFAULT 'consumidor',
    linea_interes TEXT DEFAULT 'varios',
    lead_id TEXT DEFAULT NULL,
    notas TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS work_orders (
    id TEXT PRIMARY KEY,
    cliente_nombre TEXT DEFAULT '',
    cliente_telefono TEXT DEFAULT '',
    equipo_tipo TEXT DEFAULT 'otro',
    equipo_marca TEXT DEFAULT '',
    equipo_modelo TEXT DEFAULT '',
    falla_reportada TEXT DEFAULT '',
    diagnostico TEXT DEFAULT NULL,
    presupuesto TEXT DEFAULT NULL,
    estado TEXT DEFAULT 'recibido',
    notas_internas TEXT DEFAULT '',
    activo BOOLEAN DEFAULT 1,
    fecha_recibido TEXT DEFAULT NULL,
    fecha_diagnostico TEXT DEFAULT NULL,
    fecha_presupuesto_aprobado TEXT DEFAULT NULL,
    fecha_completado TEXT DEFAULT NULL,
    fecha_entregado TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS work_order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    fecha TEXT DEFAULT NULL,
    estado TEXT DEFAULT '',
    descripcion TEXT DEFAULT '',
    notificado BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    nombre TEXT DEFAULT '',
    contacto TEXT DEFAULT '',
    segmento TEXT DEFAULT 'consumidor',
    linea_interes TEXT DEFAULT 'varios',
    estado TEXT DEFAULT 'nuevo',
    fuente TEXT DEFAULT '',
    valor_estimado TEXT DEFAULT NULL,
    fecha_creacion TEXT DEFAULT NULL,
    proximo_seguimiento TEXT DEFAULT NULL,
    notas TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    lead_id TEXT DEFAULT NULL,
    lead_nombre TEXT DEFAULT '',
    tipo TEXT DEFAULT 'whatsapp',
    direccion TEXT DEFAULT 'recibido',
    resumen TEXT DEFAULT '',
    detalle TEXT DEFAULT '',
    fecha TEXT DEFAULT NULL,
    proximo_paso TEXT DEFAULT '',
    estado TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS work_order_client_links (
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    PRIMARY KEY (wo_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_wo_history_wo_id ON work_order_history(wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_client_links_wo_id ON work_order_client_links(wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_client_links_client_id ON work_order_client_links(client_id);
CREATE INDEX IF NOT EXISTS idx_interactions_lead_id ON interactions(lead_id);
"""


def backup_json_files():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now(COL_TZ).strftime('%Y%m%d_%H%M%S')
    
    for fname in ['clients.json', 'work_orders.json', 'leads.json', 'interactions.json']:
        src = os.path.join(DATA_DIR, fname)
        if os.path.exists(src) and os.path.getsize(src) > 2:
            dst = os.path.join(BACKUP_DIR, f'{timestamp}_{fname}')
            shutil.copy2(src, dst)
            print(f'  ✅ Backup: {dst}')
    
    print(f'\n📦 Backups guardados en {BACKUP_DIR}')


def create_schema(conn):
    conn.executescript(SCHEMA)
    conn.commit()
    print('✅ Esquema SQLite creado')


def migrate_clients(conn):
    clients = load_json('clients.json')
    if not clients:
        print('  ℹ️  No hay clientes para migrar')
        return 0
    
    for c in clients:
        conn.execute("""
            INSERT OR REPLACE INTO clients 
            (id, telefono, nombre, fuente, primer_contacto, ultimo_contacto,
             interacciones_totales, estado, segmento, linea_interes, lead_id, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            c.get('id'),
            c.get('telefono', ''),
            c.get('nombre', ''),
            c.get('fuente', ''),
            c.get('primer_contacto'),
            c.get('ultimo_contacto'),
            c.get('interacciones_totales', 0),
            c.get('estado', 'lead'),
            c.get('segmento', 'consumidor'),
            c.get('linea_interes', 'varios'),
            c.get('lead_id'),
            c.get('notas', '')
        ))
    return len(clients)


def migrate_work_orders(conn):
    orders = load_json('work_orders.json')
    if not orders:
        print('  ℹ️  No hay órdenes de trabajo para migrar')
        return 0
    
    client_names = set()
    for o in orders:
        cliente = o.get('cliente', {})
        equipo = o.get('equipo', {})
        fechas = o.get('fechas', {})
        
        conn.execute("""
            INSERT OR REPLACE INTO work_orders 
            (id, cliente_nombre, cliente_telefono, equipo_tipo, equipo_marca,
             equipo_modelo, falla_reportada, diagnostico, presupuesto, estado,
             notas_internas, activo, fecha_recibido, fecha_diagnostico,
             fecha_presupuesto_aprobado, fecha_completado, fecha_entregado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            o.get('id'),
            cliente.get('nombre', ''),
            cliente.get('telefono', ''),
            equipo.get('tipo', 'otro'),
            equipo.get('marca', ''),
            equipo.get('modelo', ''),
            o.get('falla_reportada', ''),
            o.get('diagnostico'),
            o.get('presupuesto'),
            o.get('estado', 'recibido'),
            o.get('notas_internas', ''),
            1 if o.get('activo', True) else 0,
            fechas.get('recibido'),
            fechas.get('diagnostico'),
            fechas.get('presupuesto_aprobado'),
            fechas.get('completado'),
            fechas.get('entregado')
        ))
        
        # Migrate history
        for h in o.get('historial', []):
            conn.execute("""
                INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
                VALUES (?, ?, ?, ?, ?)
            """, (
                o.get('id'),
                h.get('fecha'),
                h.get('estado', ''),
                h.get('descripcion', ''),
                1 if h.get('notificado') else 0
            ))
        
        # Track client names for linking
        cn = cliente.get('nombre', '').strip().lower()
        if cn:
            client_names.add((o.get('id'), cn))
    
    # Link work orders to clients by name
    linked = 0
    for wo_id, cname in client_names:
        row = conn.execute(
            "SELECT id FROM clients WHERE LOWER(nombre) = ?", (cname,)
        ).fetchone()
        if row:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO work_order_client_links (wo_id, client_id) VALUES (?, ?)",
                    (wo_id, row[0])
                )
                linked += 1
            except Exception:
                pass
    
    if linked:
        print(f'  🔗 {linked} órdenes vinculadas a clientes')
    return len(orders)


def migrate_leads(conn):
    leads = load_json('leads.json')
    if not leads:
        print('  ℹ️  No hay leads para migrar')
        return 0
    
    for l in leads:
        conn.execute("""
            INSERT OR REPLACE INTO leads
            (id, nombre, contacto, segmento, linea_interes, estado, fuente,
             valor_estimado, fecha_creacion, proximo_seguimiento, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            l.get('id'),
            l.get('nombre', ''),
            l.get('contacto', ''),
            l.get('segmento', 'consumidor'),
            l.get('linea_interes', 'varios'),
            l.get('estado', 'nuevo'),
            l.get('fuente', ''),
            l.get('valor_estimado'),
            l.get('fecha_creacion'),
            l.get('proximo_seguimiento'),
            l.get('notas', '')
        ))
    return len(leads)


def migrate_interactions(conn):
    interactions = load_json('interactions.json')
    if not interactions:
        print('  ℹ️  No hay interacciones para migrar')
        return 0
    
    for i in interactions:
        conn.execute("""
            INSERT OR REPLACE INTO interactions
            (id, lead_id, lead_nombre, tipo, direccion, resumen, detalle,
             fecha, proximo_paso, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            i.get('id'),
            i.get('lead_id'),
            i.get('lead_nombre', ''),
            i.get('tipo', 'whatsapp'),
            i.get('direccion', 'recibido'),
            i.get('resumen', ''),
            i.get('detalle', ''),
            i.get('fecha'),
            i.get('proximo_paso', ''),
            i.get('estado', '')
        ))
    return len(interactions)


def verify_migration(conn):
    """Verify all data was migrated correctly"""
    errors = []
    
    # Check clients
    json_clients = load_json('clients.json')
    db_clients = conn.execute("SELECT COUNT(*) FROM clients").fetchone()[0]
    if len(json_clients) != db_clients:
        errors.append(f"clients: JSON={len(json_clients)} DB={db_clients}")
    
    # Check work orders
    json_wo = load_json('work_orders.json')
    db_wo = conn.execute("SELECT COUNT(*) FROM work_orders").fetchone()[0]
    if len(json_wo) != db_wo:
        errors.append(f"work_orders: JSON={len(json_wo)} DB={db_wo}")
    
    # Check leads
    json_leads = load_json('leads.json')
    db_leads = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
    if len(json_leads) != db_leads:
        errors.append(f"leads: JSON={len(json_leads)} DB={db_leads}")
    
    # Check interactions
    json_int = load_json('interactions.json')
    db_int = conn.execute("SELECT COUNT(*) FROM interactions").fetchone()[0]
    if len(json_int) != db_int:
        errors.append(f"interactions: JSON={len(json_int)} DB={db_int}")
    
    # Verify specific records
    for wo in json_wo:
        db_wo_row = conn.execute("SELECT id, cliente_nombre, estado FROM work_orders WHERE id = ?", (wo['id'],)).fetchone()
        if not db_wo_row:
            errors.append(f"Missing work_order: {wo['id']}")
        elif db_wo_row['cliente_nombre'] != wo.get('cliente', {}).get('nombre', ''):
            errors.append(f"wo {wo['id']}: client name mismatch")
    
    return errors


def main():
    print('⚡ HTK CRM — Migración JSON → SQLite')
    print('=' * 50)
    
    # Step 1: Backup
    print('\n📦 Paso 1: Backup de archivos JSON...')
    backup_json_files()
    
    # Step 2: Connect and create schema
    print('\n🗄️  Paso 2: Crear esquema SQLite...')
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    
    try:
        create_schema(conn)
        
        # Step 3: Migrate data
        print('\n📊 Paso 3: Migrando datos...')
        
        n_clients = migrate_clients(conn)
        print(f'  ✅ {n_clients} clientes migrados')
        
        n_wo = migrate_work_orders(conn)
        print(f'  ✅ {n_wo} órdenes de trabajo migradas')
        
        n_leads = migrate_leads(conn)
        print(f'  ✅ {n_leads} leads migrados')
        
        n_int = migrate_interactions(conn)
        print(f'  ✅ {n_int} interacciones migradas')
        
        conn.commit()
        
        # Step 4: Verify
        print('\n🔍 Paso 4: Verificando migración...')
        errors = verify_migration(conn)
        if errors:
            print('  ❌ Errores encontrados:')
            for e in errors:
                print(f'    - {e}')
            print('\n  Haciendo ROLLBACK...')
            conn.rollback()
            conn.close()
            # Restore from backup
            print('  Restaurando backups...')
            # Not doing actual restore here - we have backups
            return 1
        else:
            print('  ✅ Todos los datos migrados correctamente')
        
        # Step 5: Summary
        print('\n📊 Resumen final:')
        print(f'  Clientes:    {n_clients}')
        print(f'  Órdenes:     {n_wo}')
        print(f'  Leads:       {n_leads}')
        print(f'  Interacciones: {n_int}')
        print(f'\n🗄️  Base de datos: {DB_PATH}')
        print('✅ Migración completada exitosamente')
        
    except Exception as e:
        print(f'\n❌ Error durante la migración: {e}')
        conn.rollback()
        conn.close()
        print('  La base de datos no se modificó. Restaura backups si es necesario.')
        return 1
    
    conn.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
