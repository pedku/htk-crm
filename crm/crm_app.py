#!/usr/bin/env python3
"""
CRM HTK INGENIERIA — Sistema de gestión integrado
Flask backend + SQLite storage | v2
"""
import os
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, request, render_template, send_from_directory

app = Flask(__name__)
BASE_DIR = os.path.join(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, 'htk_crm.db')

# ── Helpers ──────────────────────────────────────────────────────────

COL_TZ = timezone(timedelta(hours=-5))

def now_iso():
    return datetime.now(COL_TZ).isoformat()

def now_col():
    return datetime.now(COL_TZ)

def get_db():
    """Get SQLite connection with row_factory for dict-like rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def load_json(filename, export_from_db=True):
    """
    Export data from SQLite as JSON-compatible list.
    Mimics old load_json() interface for backwards compatibility.
    """
    conn = get_db()
    try:
        if filename == 'clients.json':
            rows = conn.execute("SELECT * FROM clients ORDER BY id").fetchall()
            return [dict(r) for r in rows]
        elif filename == 'leads.json':
            rows = conn.execute("SELECT * FROM leads ORDER BY id").fetchall()
            return [dict(r) for r in rows]
        elif filename == 'work_orders.json':
            return export_work_orders_full(conn)
        elif filename == 'interactions.json':
            rows = conn.execute("SELECT * FROM interactions ORDER BY fecha DESC").fetchall()
            return [dict(r) for r in rows]
        else:
            return []
    finally:
        conn.close()

def save_json(filename, data):
    """
    Dummy save — data is already in SQLite via API calls.
    Kept for backwards compatibility; writes to disk as fallback.
    """
    # No-op: SQLite is the source of truth now.
    pass

def export_work_orders_full(conn):
    """Export work orders with nested cliente/equipo/historial/fechas."""
    orders = conn.execute("SELECT * FROM work_orders ORDER BY id").fetchall()
    result = []
    for o in orders:
        wo = dict(o)
        # Reconstruct nested objects
        wo['cliente'] = {
            'nombre': wo.pop('cliente_nombre', ''),
            'telefono': wo.pop('cliente_telefono', '')
        }
        wo['equipo'] = {
            'tipo': wo.pop('equipo_tipo', 'otro'),
            'marca': wo.pop('equipo_marca', ''),
            'modelo': wo.pop('equipo_modelo', '')
        }
        wo['fechas'] = {
            'recibido': wo.pop('fecha_recibido', None),
            'diagnostico': wo.pop('fecha_diagnostico', None),
            'presupuesto_aprobado': wo.pop('fecha_presupuesto_aprobado', None),
            'completado': wo.pop('fecha_completado', None),
            'entregado': wo.pop('fecha_entregado', None)
        }
        # Load history
        hist_rows = conn.execute(
            "SELECT fecha, estado, descripcion, notificado FROM work_order_history WHERE wo_id = ? ORDER BY id",
            (wo['id'],)
        ).fetchall()
        wo['historial'] = [dict(h) for h in hist_rows]
        result.append(wo)
    return result

def next_id(prefix, table, id_column='id'):
    """Generate next ID like HTK-002, PRO-049 from SQLite."""
    conn = get_db()
    try:
        row = conn.execute(
            f"SELECT MAX(CAST(SUBSTR({id_column}, INSTR({id_column}, '-') + 1) AS INTEGER)) FROM {table}"
        ).fetchone()
        max_num = row[0] if row[0] is not None else 0
        return f"{prefix}-{max_num + 1:03d}"
    finally:
        conn.close()

def link_wo_to_client(wo_id, cliente_nombre, cliente_telefono):
    """Link work order to matching client by name or phone."""
    conn = get_db()
    try:
        # Try name match
        if cliente_nombre:
            row = conn.execute(
                "SELECT id FROM clients WHERE LOWER(nombre) = LOWER(?)", 
                (cliente_nombre.strip(),)
            ).fetchone()
            if row:
                conn.execute(
                    "INSERT OR IGNORE INTO work_order_client_links (wo_id, client_id) VALUES (?, ?)",
                    (wo_id, row['id'])
                )
                conn.execute(
                    "UPDATE clients SET interacciones_totales = interacciones_totales + 1, ultimo_contacto = ? WHERE id = ?",
                    (now_iso(), row['id'])
                )
                conn.commit()
                return
        
        # Try phone match
        if cliente_telefono:
            row = conn.execute(
                "SELECT id FROM clients WHERE telefono = ?",
                (cliente_telefono.strip(),)
            ).fetchone()
            if row:
                conn.execute(
                    "INSERT OR IGNORE INTO work_order_client_links (wo_id, client_id) VALUES (?, ?)",
                    (wo_id, row['id'])
                )
                conn.execute(
                    "UPDATE clients SET interacciones_totales = interacciones_totales + 1, ultimo_contacto = ? WHERE id = ?",
                    (now_iso(), row['id'])
                )
                conn.commit()
    finally:
        conn.close()


# ── Routes HTML ──────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stats')
def api_stats():
    conn = get_db()
    try:
        leads = conn.execute("SELECT * FROM leads").fetchall()
        clients = conn.execute("SELECT * FROM clients").fetchall()
        wo = conn.execute("SELECT * FROM work_orders").fetchall()
        
        leads_list = [dict(l) for l in leads]
        wo_list = [dict(w) for w in wo]
        
        return jsonify({
            'total_leads': len(leads),
            'total_clients': len(clients),
            'total_work_orders': len(wo),
            'active_work_orders': len([w for w in wo if w['activo']]),
            'completed_work_orders': len([w for w in wo if w['estado'] in ('completado', 'entregado')]),
            'leads_by_status': {s: len([l for l in leads_list if l.get('estado') == s]) for s in set(l.get('estado', 'unknown') for l in leads_list)},
            'wo_by_status': {s: len([w for w in wo_list if w.get('estado') == s]) for s in set(w.get('estado', 'unknown') for w in wo_list)},
            'leads_by_linea': {s: len([l for l in leads_list if l.get('linea_interes') == s]) for s in set(l.get('linea_interes', 'unknown') for l in leads_list)},
        })
    finally:
        conn.close()


# ── API Clientes ─────────────────────────────────────────────────────

def client_to_dict(row):
    """Convert a client DB row to dict with ordenes from link table."""
    d = dict(row)
    conn = get_db()
    try:
        linked = conn.execute(
            "SELECT wo_id FROM work_order_client_links WHERE client_id = ?", 
            (d['id'],)
        ).fetchall()
        d['ordenes'] = [l['wo_id'] for l in linked]
    finally:
        conn.close()
    return d

@app.route('/api/clients', methods=['GET', 'POST'])
def api_clients():
    if request.method == 'GET':
        conn = get_db()
        try:
            rows = conn.execute("SELECT * FROM clients ORDER BY id").fetchall()
            return jsonify([client_to_dict(r) for r in rows])
        finally:
            conn.close()
    
    # POST
    data = request.get_json()
    conn = get_db()
    try:
        new_id = next_id('CLI', 'clients')
        now = now_iso()
        conn.execute("""
            INSERT INTO clients (id, telefono, nombre, fuente, primer_contacto, ultimo_contacto,
                interacciones_totales, estado, segmento, linea_interes, lead_id, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            data.get('telefono', ''),
            data.get('nombre', ''),
            data.get('fuente', ''),
            data.get('primer_contacto', now),
            data.get('ultimo_contacto', now),
            data.get('interacciones_totales', 0),
            data.get('estado', 'lead'),
            data.get('segmento', 'consumidor'),
            data.get('linea_interes', 'varios'),
            data.get('lead_id'),
            data.get('notas', '')
        ))
        conn.commit()
        
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (new_id,)).fetchone()
        return jsonify(client_to_dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/clients/<client_id>', methods=['GET', 'PUT', 'DELETE'])
def api_client(client_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        if request.method == 'GET':
            result = client_to_dict(row)
            # Load work order details
            wo_ids = result.get('ordenes', [])
            result['ordenes_detalle'] = []
            for wo_id in wo_ids:
                wo_row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
                if wo_row:
                    wo = dict(wo_row)
                    wo['cliente'] = {'nombre': wo.pop('cliente_nombre', ''), 'telefono': wo.pop('cliente_telefono', '')}
                    wo['equipo'] = {'tipo': wo.pop('equipo_tipo', 'otro'), 'marca': wo.pop('equipo_marca', ''), 'modelo': wo.pop('equipo_modelo', '')}
                    result['ordenes_detalle'].append(wo)
            return jsonify(result)
        
        if request.method == 'DELETE':
            conn.execute("DELETE FROM clients WHERE id = ?", (client_id,))
            conn.execute("DELETE FROM work_order_client_links WHERE client_id = ?", (client_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Cliente {client_id} eliminado'})
        
        # PUT
        data = request.get_json()
        updates = []
        params = []
        for key in ['nombre', 'telefono', 'fuente', 'estado', 'segmento', 'linea_interes', 'notas', 'lead_id']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        updates.append("ultimo_contacto = ?")
        params.append(now_iso())
        params.append(client_id)
        
        if updates:
            conn.execute(f"UPDATE clients SET {', '.join(updates)} WHERE id = ?", params)
        
        # Update linked orders if provided
        if 'ordenes' in data:
            conn.execute("DELETE FROM work_order_client_links WHERE client_id = ?", (client_id,))
            for wo_id in data['ordenes']:
                conn.execute(
                    "INSERT OR IGNORE INTO work_order_client_links (wo_id, client_id) VALUES (?, ?)",
                    (wo_id, client_id)
                )
        
        conn.commit()
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        return jsonify(client_to_dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── API Leads ────────────────────────────────────────────────────────

@app.route('/api/leads', methods=['GET', 'POST'])
def api_leads():
    if request.method == 'GET':
        conn = get_db()
        try:
            rows = conn.execute("SELECT * FROM leads ORDER BY id").fetchall()
            return jsonify([dict(r) for r in rows])
        finally:
            conn.close()
    
    # POST
    data = request.get_json()
    conn = get_db()
    try:
        new_id = next_id('PRO', 'leads')
        conn.execute("""
            INSERT INTO leads (id, nombre, contacto, segmento, linea_interes, estado, fuente,
                valor_estimado, fecha_creacion, proximo_seguimiento, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            data.get('nombre', ''),
            data.get('contacto', ''),
            data.get('segmento', 'consumidor'),
            data.get('linea_interes', 'varios'),
            data.get('estado', 'nuevo'),
            data.get('fuente', ''),
            data.get('valor_estimado'),
            data.get('fecha_creacion', now_iso()),
            data.get('proximo_seguimiento'),
            data.get('notas', '')
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/leads/<lead_id>', methods=['GET', 'PUT', 'DELETE'])
def api_lead(lead_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Lead no encontrado'}), 404
        
        if request.method == 'GET':
            return jsonify(dict(row))
        
        if request.method == 'DELETE':
            conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Lead {lead_id} eliminado'})
        
        data = request.get_json()
        updates = []
        params = []
        for key in ['nombre', 'contacto', 'segmento', 'linea_interes', 'estado', 'fuente', 'notas', 'valor_estimado', 'proximo_seguimiento']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        
        if updates:
            params.append(lead_id)
            conn.execute(f"UPDATE leads SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/leads/<lead_id>/convert', methods=['POST'])
def api_convert_lead(lead_id):
    """Convert a lead to a client"""
    conn = get_db()
    try:
        lead = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead:
            return jsonify({'error': 'Lead no encontrado'}), 404
        
        new_id = next_id('CLI', 'clients')
        now = now_iso()
        conn.execute("""
            INSERT INTO clients (id, telefono, nombre, fuente, primer_contacto, ultimo_contacto,
                interacciones_totales, estado, segmento, linea_interes, lead_id, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            lead['contacto'],
            lead['nombre'],
            lead['fuente'],
            now,
            now,
            0,
            'lead',
            lead['segmento'],
            lead['linea_interes'],
            lead_id,
            lead['notas'] or ''
        ))
        conn.execute("UPDATE leads SET estado = 'cliente' WHERE id = ?", (lead_id,))
        conn.commit()
        
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (new_id,)).fetchone()
        return jsonify(client_to_dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── API Órdenes de Trabajo ──────────────────────────────────────────

def wo_to_dict(conn, wo_id):
    """Convert work order DB row to full nested format."""
    row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
    if not row:
        return None
    wo = dict(row)
    wo['cliente'] = {'nombre': wo.pop('cliente_nombre', ''), 'telefono': wo.pop('cliente_telefono', '')}
    wo['equipo'] = {'tipo': wo.pop('equipo_tipo', 'otro'), 'marca': wo.pop('equipo_marca', ''), 'modelo': wo.pop('equipo_modelo', '')}
    wo['fechas'] = {
        'recibido': wo.pop('fecha_recibido', None),
        'diagnostico': wo.pop('fecha_diagnostico', None),
        'presupuesto_aprobado': wo.pop('fecha_presupuesto_aprobado', None),
        'completado': wo.pop('fecha_completado', None),
        'entregado': wo.pop('fecha_entregado', None)
    }
    hist_rows = conn.execute(
        "SELECT fecha, estado, descripcion, notificado FROM work_order_history WHERE wo_id = ? ORDER BY id",
        (wo['id'],)
    ).fetchall()
    wo['historial'] = [dict(h) for h in hist_rows]
    return wo

@app.route('/api/work_orders', methods=['GET', 'POST'])
def api_work_orders():
    conn = get_db()
    try:
        if request.method == 'GET':
            return jsonify(export_work_orders_full(conn))
        
        # POST
        data = request.get_json()
        new_id = next_id('HTK', 'work_orders')
        now = now_iso()
        
        cliente = data.get('cliente', {})
        equipo = data.get('equipo', {})
        
        conn.execute("""
            INSERT INTO work_orders (id, cliente_nombre, cliente_telefono, equipo_tipo, equipo_marca,
                equipo_modelo, falla_reportada, diagnostico, presupuesto, estado,
                notas_internas, activo, fecha_recibido)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            cliente.get('nombre', ''),
            cliente.get('telefono', ''),
            equipo.get('tipo', 'otro'),
            equipo.get('marca', ''),
            equipo.get('modelo', ''),
            data.get('falla_reportada', ''),
            None,
            data.get('presupuesto'),
            'recibido',
            data.get('notas_internas', ''),
            1,
            now
        ))
        
        conn.execute("""
            INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
            VALUES (?, ?, ?, ?, ?)
        """, (
            new_id,
            now,
            'recibido',
            data.get('historial_desc', 'Equipo recibido en taller.'),
            0
        ))
        
        conn.commit()
        
        # Link to client if exists
        link_wo_to_client(new_id, cliente.get('nombre', ''), cliente.get('telefono', ''))
        
        return jsonify(wo_to_dict(conn, new_id)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/work_orders/<wo_id>', methods=['GET', 'PUT', 'DELETE'])
def api_work_order(wo_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
        if request.method == 'GET':
            return jsonify(wo_to_dict(conn, wo_id))
        
        if request.method == 'DELETE':
            conn.execute("DELETE FROM work_orders WHERE id = ?", (wo_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Orden {wo_id} eliminada'})
        
        # PUT
        data = request.get_json()
        updates = []
        params = []
        for key in ['falla_reportada', 'diagnostico', 'presupuesto', 'notas_internas', 'activo']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        
        if 'cliente' in data:
            if 'nombre' in data['cliente']:
                updates.append("cliente_nombre = ?")
                params.append(data['cliente']['nombre'])
            if 'telefono' in data['cliente']:
                updates.append("cliente_telefono = ?")
                params.append(data['cliente']['telefono'])
        
        if 'equipo' in data:
            if 'tipo' in data['equipo']:
                updates.append("equipo_tipo = ?")
                params.append(data['equipo']['tipo'])
            if 'marca' in data['equipo']:
                updates.append("equipo_marca = ?")
                params.append(data['equipo']['marca'])
            if 'modelo' in data['equipo']:
                updates.append("equipo_modelo = ?")
                params.append(data['equipo']['modelo'])
        
        if updates:
            params.append(wo_id)
            conn.execute(f"UPDATE work_orders SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        
        return jsonify(wo_to_dict(conn, wo_id))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

VALID_WO_STATUSES = ('recibido', 'diagnosticando', 'presupuestado', 'aprobado', 'reparando', 'esperando_repuestos', 'completado', 'entregado', 'cancelado')

@app.route('/api/work_orders/<wo_id>/status', methods=['PUT'])
def api_wo_status(wo_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        data = request.get_json()
        new_status = data.get('estado')
        if new_status not in VALID_WO_STATUSES:
            return jsonify({'error': 'Estado inválido'}), 400
        
        old_status = row['estado']
        now = now_iso()
        
        # Update specific date fields
        if new_status == 'diagnosticando' and not row['fecha_diagnostico']:
            conn.execute("UPDATE work_orders SET fecha_diagnostico = ? WHERE id = ?", (now, wo_id))
        elif new_status == 'aprobado' and not row['fecha_presupuesto_aprobado']:
            conn.execute("UPDATE work_orders SET fecha_presupuesto_aprobado = ? WHERE id = ?", (now, wo_id))
        elif new_status == 'completado' and not row['fecha_completado']:
            conn.execute("UPDATE work_orders SET fecha_completado = ? WHERE id = ?", (now, wo_id))
        elif new_status == 'entregado' and not row['fecha_entregado']:
            conn.execute("UPDATE work_orders SET fecha_entregado = ? WHERE id = ?", (now, wo_id))
        
        # Update status
        conn.execute("UPDATE work_orders SET estado = ? WHERE id = ?", (new_status, wo_id))
        
        # Update presupuesto if provided
        if 'presupuesto' in data and data['presupuesto'] is not None:
            conn.execute("UPDATE work_orders SET presupuesto = ? WHERE id = ?", (data['presupuesto'], wo_id))
        
        # Update diagnostico if provided
        if 'diagnostico' in data:
            conn.execute("UPDATE work_orders SET diagnostico = ? WHERE id = ?", (data['diagnostico'], wo_id))
        
        # Add history entry
        conn.execute("""
            INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
            VALUES (?, ?, ?, ?, ?)
        """, (
            wo_id,
            now,
            new_status,
            data.get('descripcion', f'Estado cambiado de {old_status} a {new_status}'),
            1 if data.get('notificado') else 0
        ))
        
        conn.commit()
        return jsonify(wo_to_dict(conn, wo_id))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── API Interacciones ────────────────────────────────────────────────

@app.route('/api/interactions', methods=['GET', 'POST'])
def api_interactions():
    if request.method == 'GET':
        conn = get_db()
        try:
            rows = conn.execute("SELECT * FROM interactions ORDER BY fecha DESC").fetchall()
            return jsonify([dict(r) for r in rows])
        finally:
            conn.close()
    
    # POST
    data = request.get_json()
    conn = get_db()
    try:
        new_id = next_id('INT', 'interactions')
        conn.execute("""
            INSERT INTO interactions (id, lead_id, lead_nombre, tipo, direccion, resumen, detalle,
                fecha, proximo_paso, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            data.get('lead_id'),
            data.get('lead_nombre', ''),
            data.get('tipo', 'whatsapp'),
            data.get('direccion', 'recibido'),
            data.get('resumen', ''),
            data.get('detalle', ''),
            data.get('fecha', now_iso()),
            data.get('proximo_paso', ''),
            data.get('estado', '')
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM interactions WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── Debug route ──────────────────────────────────────────────────────

@app.route('/api/debug')
def api_debug():
    """Debug endpoint to verify data integrity."""
    conn = get_db()
    try:
        tables = {}
        for table in ['clients', 'work_orders', 'work_order_history', 'leads', 'interactions', 'work_order_client_links']:
            count = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()[0]
            tables[table] = count
        return jsonify(tables)
    finally:
        conn.close()


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(os.path.join(BASE_DIR, 'templates'), exist_ok=True)
    # Ensure DB exists with schema on startup
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        print("⚠️  DB no encontrada. Ejecuta migrate_to_sqlite.py primero.")
    
    print("⚡ CRM HTK INGENIERIA v2 (SQLite) corriendo en http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
