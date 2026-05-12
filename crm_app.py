#!/usr/bin/env python3
"""
CRM HTK INGENIERIA — Sistema de gestión integrado
Flask backend + SQLite storage | v2
"""
import os
import sqlite3
import uuid
import functools
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, request, render_template, send_from_directory, session, redirect, url_for

app = Flask(__name__)
app.secret_key = 'htk-crm-secret-key-2026-cambiame'

# Para cambiar credenciales, usar variables de entorno:
# export HTK_ADMIN_USER=pedro
# export HTK_ADMIN_PASS=tucontraseña
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
    """Export work orders with nested cliente/equipo/historial/fechas and proper types."""
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
        # Type conversions for JSON compatibility
        wo['activo'] = bool(wo.get('activo', 0))
        if wo.get('presupuesto') is not None:
            wo['presupuesto'] = float(wo['presupuesto'])
        # Load history with bool conversion
        hist_rows = conn.execute(
            "SELECT fecha, estado, descripcion, notificado FROM work_order_history WHERE wo_id = ? ORDER BY id",
            (wo['id'],)
        ).fetchall()
        wo['historial'] = []
        for h in hist_rows:
            entry = dict(h)
            entry['notificado'] = bool(entry.get('notificado', 0))
            wo['historial'].append(entry)
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


# ── Auth Decorator ──────────────────────────────────────────────────

def login_required(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('login_page', next=request.path))
        return f(*args, **kwargs)
    return decorated_function


# ── Auth Routes ─────────────────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login_page():
    if request.method == 'GET':
        if 'user' in session:
            return redirect('/')
        return render_template('login.html')
    
    # POST
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    
    admin_user = os.environ.get('HTK_ADMIN_USER', 'admin')
    admin_pass = os.environ.get('HTK_ADMIN_PASS', 'htk2026')
    
    if username == admin_user and password == admin_pass:
        session['user'] = username
        session['login_time'] = datetime.now(COL_TZ).isoformat()
        next_page = request.args.get('next', '/')
        return redirect(next_page)
    
    return render_template('login.html', error='Usuario o contraseña incorrectos')

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')


# ─── PÁGINA: Perfil de Lead ────────────────────────
@app.route('/leads/<path:lid>')
@login_required
def page_lead(lid):
    db = get_db()
    row = db.execute("SELECT * FROM leads WHERE id = ?", (lid,)).fetchone()
    if not row:
        db.close()
        return 'Lead no encontrado', 404
    lead = dict(row)
    interactions = db.execute("SELECT * FROM interactions WHERE lead_id = ? ORDER BY fecha DESC LIMIT 20", (lid,)).fetchall()
    db.close()
    actividades = [dict(i) for i in interactions]
    return render_template('lead_detail.html', lead=lead, actividades=actividades)


# ─── PÁGINA: Bot WhatsApp ────────────────────────────

def actividad_crear(lead_id, tipo, resumen, detalle=''):
    """Log interaction helper."""
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO interactions (lead_id, tipo, direccion, resumen, detalle, fecha, estado) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (lead_id, tipo, 'saliente', resumen, detalle, now_iso(), 'completado')
        )
        conn.commit()
    finally:
        conn.close()


# ── Routes HTML ──────────────────────────────────────────────────────

# ─── PÁGINA: Bot WhatsApp ────────────────────────────
@app.route('/bot-whatsapp')
def page_bot_whatsapp():
    return render_template('bot_whatsapp.html')

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/api/stats')
@login_required
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
@login_required
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
@login_required
def api_client(client_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        if request.method == 'GET':
            result = client_to_dict(row)
            # Load work order details using wo_to_dict for proper types
            wo_ids = result.get('ordenes', [])
            result['ordenes_detalle'] = []
            for wo_id in wo_ids:
                wo_detail = wo_to_dict(conn, wo_id)
                if wo_detail:
                    result['ordenes_detalle'].append(wo_detail)
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
@login_required
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
                valor_estimado, fecha_creacion, proximo_seguimiento, notas,
                telefono, email, url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.get('notas', ''),
            data.get('telefono', ''),
            data.get('email', ''),
            data.get('url', '')
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
@login_required
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
        for key in ['nombre', 'contacto', 'contacto_nombre', 'segmento', 'linea_interes', 'estado', 'fuente', 'notas', 'valor_estimado', 'proximo_seguimiento', 'telefono', 'email', 'url']:
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
@login_required
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
    """Convert work order DB row to full nested format with proper types."""
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
    # Type conversions for JSON compatibility
    wo['activo'] = bool(wo.get('activo', 0))
    if wo.get('presupuesto') is not None:
        wo['presupuesto'] = float(wo['presupuesto']) if isinstance(wo['presupuesto'], int) else float(wo['presupuesto'])
    # Load history with bool conversion
    hist_rows = conn.execute(
        "SELECT fecha, estado, descripcion, notificado FROM work_order_history WHERE wo_id = ? ORDER BY id",
        (wo['id'],)
    ).fetchall()
    wo['historial'] = []
    for h in hist_rows:
        entry = dict(h)
        entry['notificado'] = bool(entry.get('notificado', 0))
        wo['historial'].append(entry)
    return wo

@app.route('/api/work_orders', methods=['GET', 'POST'])
@login_required
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
@login_required
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
@login_required
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
@login_required
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


# ── Interacciones por Lead ──────────────────────────────────────────

@app.route('/api/leads/<lead_id>/interactions', methods=['GET'])
@login_required
def api_lead_interactions(lead_id):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM interactions WHERE lead_id = ? ORDER BY fecha DESC", (lead_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/api/leads/<lead_id>/interactions', methods=['POST'])
@login_required
def api_create_lead_interaction(lead_id):
    data = request.get_json()
    conn = get_db()
    try:
        lead = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead:
            return jsonify({'error': 'Lead no encontrado'}), 404
        import uuid
        now = now_iso()
        short_id = str(uuid.uuid4()).split('-')[0]
        new_id = f"INT-{now_col().strftime('%Y%m%d-%H%M%S')}-{short_id}"
        conn.execute("""
            INSERT INTO interactions (id, lead_id, lead_nombre, tipo, direccion, resumen, detalle, fecha, proximo_paso, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, lead_id, lead['nombre'],
            data.get('tipo', 'manual'),
            data.get('direccion', 'saliente'),
            data.get('resumen', ''),
            data.get('detalle', ''),
            now,
            data.get('proximo_paso'),
            data.get('estado', 'pendiente')
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM interactions WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ── Notas Editables ─────────────────────────────────────────────────

@app.route('/api/leads/<lead_id>/notes', methods=['PUT'])
@login_required
def api_update_lead_notes(lead_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Lead no encontrado'}), 404
        data = request.get_json()
        conn.execute("UPDATE leads SET notas = ? WHERE id = ?", (data.get('notas', ''), lead_id))
        conn.commit()
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/clients/<client_id>/notes', methods=['PUT'])
@login_required
def api_update_client_notes(client_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        data = request.get_json()
        conn.execute("UPDATE clients SET notas = ? WHERE id = ?", (data.get('notas', ''), client_id))
        conn.commit()
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ── Debug route ──────────────────────────────────────────────────────

@app.route('/api/debug')
@login_required
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


# ── API Pitches ──────────────────────────────────────────────────────

PITCHES_PATH = '/home/peku/htk-data/pitches.json'

@app.route('/api/pitches', methods=['GET', 'PUT'])
@login_required
def api_pitches():
    import json

    if request.method == 'GET':
        if os.path.exists(PITCHES_PATH):
            with open(PITCHES_PATH) as f:
                return jsonify(json.load(f))
        return jsonify({'canales': {}, 'plantillas_cuerpo': []})

    # PUT – save edited template
    if request.method == 'PUT':
        data = request.get_json()
        template_id = data.get('id')
        canal = data.get('canal')
        texto = data.get('texto', '')

        if not template_id or not canal:
            return jsonify({'error': 'Faltan id o canal'}), 400

        if os.path.exists(PITCHES_PATH):
            with open(PITCHES_PATH) as f:
                pitches = json.load(f)
        else:
            pitches = {'canales': {}, 'plantillas_cuerpo': []}

        found = False
        for t in pitches.get('plantillas_cuerpo', []):
            if t.get('id') == template_id:
                t[canal] = texto
                found = True
                break

        if not found:
            return jsonify({'error': 'Plantilla no encontrada'}), 404

        pt = os.path.dirname(PITCHES_PATH)
        if not os.path.exists(pt):
            os.makedirs(pt, exist_ok=True)
        with open(PITCHES_PATH, 'w') as f:
            json.dump(pitches, f, indent=2, ensure_ascii=False)

        return jsonify({'ok': True})


@app.route('/api/pitches/by-segment/<segment>', methods=['GET'])
@login_required
def api_pitches_by_segment(segment):
    import json
    if not os.path.exists(PITCHES_PATH):
        return jsonify([])
    with open(PITCHES_PATH) as f:
        pitches = json.load(f)
    templates = pitches.get('plantillas_cuerpo', [])
    matched = [t for t in templates if segment in t.get('segmentos', [])]
    return jsonify(matched)


# ── Automation Endpoints ─────────────────────────────────────────────

def run_script(script_name, args=None):
    """Run a Python script from scripts/ dir and capture output."""
    import subprocess
    script_path = os.path.join(os.path.dirname(BASE_DIR), 'scripts', script_name)
    if not os.path.exists(script_path):
        return {'ok': False, 'error': 'Script no encontrado: ' + script_path}
    cmd = ['python3', script_path]
    if args:
        cmd.extend(args)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return {'ok': result.returncode == 0, 'output': result.stdout, 'error': result.stderr}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': 'Timeout (300s)'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.route('/api/auto/enrich', methods=['POST'])
@login_required
def api_auto_enrich():
    data = request.get_json(silent=True) or {}
    args = []
    if data.get('segmento'):
        args.extend(['--segmento', data['segmento']])
    if data.get('lead'):
        args.extend(['--lead', data['lead']])
    if data.get('force'):
        args.append('--force')
    result = run_script('auto_enrich.py', args)
    return jsonify(result)


@app.route('/api/auto/score', methods=['GET'])
@login_required
def api_auto_score():
    seg = request.args.get('segmento')
    top = request.args.get('top', '0')
    args = ['--top', top]
    if seg:
        args.extend(['--segmento', seg])
    result = run_script('auto_score.py', args)
    return jsonify(result)


@app.route('/api/auto/schedule', methods=['POST'])
@login_required
def api_auto_schedule():
    data = request.get_json(silent=True) or {}
    args = []
    if data.get('segmento'):
        args.extend(['--segmento', data['segmento']])
    if data.get('start'):
        args.extend(['--start', data['start']])
    if data.get('dry_run'):
        args.append('--dry-run')
    result = run_script('auto_schedule.py', args)
    return jsonify(result)


@app.route('/api/auto/campaign', methods=['POST'])
@login_required
def api_auto_campaign():
    data = request.get_json(silent=True) or {}
    args = []
    if data.get('segmento'):
        args.extend(['--segmento', data['segmento']])
    if data.get('lead'):
        args.extend(['--lead', data['lead']])
    if data.get('channel'):
        args.extend(['--channel', data['channel']])
    else:
        args.extend(['--channel', 'whatsapp'])
    if data.get('save'):
        args.append('--save')
    result = run_script('auto_campaign.py', args)
    return jsonify(result)


@app.route('/api/auto/backup', methods=['POST'])
@login_required
def api_auto_backup():
    import subprocess
    script_path = os.path.join(BASE_DIR, 'backup_db.sh')
    if not os.path.exists(script_path):
        return jsonify({'ok': False, 'error': 'backup_db.sh no encontrado'})
    try:
        result = subprocess.run(['bash', script_path], capture_output=True, text=True, timeout=30)
        # List backups
        backup_dir = os.path.join(BASE_DIR, 'backups')
        backups = []
        if os.path.exists(backup_dir):
            import glob
            for f in sorted(glob.glob(os.path.join(backup_dir, '*.backup*')), reverse=True)[:10]:
                fname = os.path.basename(f)
                fsize = os.path.getsize(f)
                backups.append({'name': fname, 'size': fsize})
        return jsonify({
            'ok': result.returncode == 0,
            'output': result.stdout,
            'error': result.stderr,
            'backups': backups
        })
    except subprocess.TimeoutExpired:
        return jsonify({'ok': False, 'error': 'Timeout'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})



# ── API: PIPELINE / KANBAN ──────────────────────────────
@app.route('/api/pipeline')
def api_pipeline():
    conn = get_db()
    try:
        rows = conn.execute("SELECT clave, nombre, color, icono, probabilidad FROM etapas ORDER BY orden").fetchall()
        etapas = [dict(r) for r in rows]
        funnel = []
        for e in etapas:
            count = conn.execute("SELECT COUNT(*) FROM leads WHERE estado = ?", (e['clave'],)).fetchone()[0]
            total = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0] or 1
            funnel.append({**e, 'count': count, 'pct': round(count / total * 100, 1)})
        return jsonify({'funnel': funnel, 'etapas': etapas})
    finally:
        conn.close()

@app.route('/api/leads/kanban')
def api_leads_kanban():
    conn = get_db()
    try:
        etapas = conn.execute("SELECT clave, nombre, color FROM etapas ORDER BY orden").fetchall()
        kanban = {}
        for e in etapas:
            leads = conn.execute("SELECT * FROM leads WHERE estado = ?", (e['clave'],)).fetchall()
            kanban[e['clave']] = {
                'label': e['nombre'],
                'color': e['color'],
                'leads': [dict(l) for l in leads]
            }
        return jsonify(kanban)
    finally:
        conn.close()

@app.route('/api/leads/<lid>/etapa', methods=['PATCH'])
def api_lead_etapa(lid):
    data = request.get_json()
    etapa = data.get('etapa', '')
    conn = get_db()
    try:
        conn.execute("UPDATE leads SET estado = ? WHERE id = ?", (etapa, lid))
        conn.commit()
        return jsonify({'ok': True, 'etapa': etapa})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/etapas')
def api_etapas():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM etapas ORDER BY orden").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/api/tags')
def api_tags():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            tid = None
            if data and data.get('nombre'):
                c = conn.execute("INSERT INTO tags (nombre,color) VALUES (?,?)", 
                    (data['nombre'], data.get('color','#3b82f6')))
                conn.commit()
                tid = c.lastrowid
            return jsonify({'ok': True, 'id': tid}), 201
        rows = conn.execute("SELECT * FROM tags ORDER BY nombre").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/api/lead-week')
def api_lead_week():
    conn = get_db()
    try:
        from datetime import datetime, timedelta
        days = []
        for i in range(6, -1, -1):
            d = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            count = conn.execute("SELECT COUNT(*) FROM leads WHERE fecha_creacion LIKE ?", (d+'%',)).fetchone()[0]
            days.append({'fecha': d, 'count': count, 'label': (datetime.now()-timedelta(days=i)).strftime('%a')})
        return jsonify(days)
    finally:
        conn.close()

@app.route('/api/opciones')
def api_opciones():
    conn = get_db()
    try:
        rows = conn.execute("SELECT DISTINCT linea_interes FROM leads WHERE linea_interes IS NOT NULL AND linea_interes != ''").fetchall()
        return jsonify([r['linea_interes'] for r in rows])
    finally:
        conn.close()

@app.route('/api/export')
def api_export():
    import csv, io
    from flask import send_file
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM leads ORDER BY fecha_creacion DESC").fetchall()
        output = io.StringIO()
        writer = csv.writer(output)
        if rows:
            writer.writerow(rows[0].keys())
            for r in rows:
                writer.writerow(dict(r).values())
        output.seek(0)
        return send_file(io.BytesIO(output.getvalue().encode('utf-8-sig')),
            mimetype='text/csv', as_attachment=True,
            download_name=f"leads_htk_{datetime.now().strftime('%Y%m%d')}.csv")
    finally:
        conn.close()

@app.route('/api/sales', methods=['GET','POST'])
def api_sales():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            sid = f"VTA-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            conn.execute("INSERT INTO ventas (id, lead_id, cliente_id, cliente_nombre, producto, capacidad, valor_cotizado, estado, fecha, notas) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (sid, data.get('lead_id',''), data.get('cliente_id',''), data.get('cliente_nombre',''), 
                 data.get('producto',''), data.get('capacidad',''), data.get('valor_cotizado',0), 'cotizado', 
                 datetime.now().isoformat(), data.get('notas','')))
            conn.commit()
            row = conn.execute("SELECT * FROM ventas WHERE id = ?", (sid,)).fetchone()
            return jsonify(dict(row)), 201
        rows = conn.execute("SELECT * FROM ventas ORDER BY fecha DESC").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/api/sales/<sid>', methods=['PATCH','DELETE'])
def api_sale(sid):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM ventas WHERE id = ?", (sid,))
            conn.commit()
            return jsonify({'ok': True})
        data = request.get_json()
        updates = [f"{k}=?" for k in data if k in ['cliente_nombre','producto','capacidad','valor_cotizado','valor_vendido','estado','notas']]
        if updates:
            params = [data[k] for k in data if k in ['cliente_nombre','producto','capacidad','valor_cotizado','valor_vendido','estado','notas']]
            params.append(sid)
            conn.execute(f"UPDATE ventas SET {','.join(updates)} WHERE id = ?", params)
            conn.commit()
        row = conn.execute("SELECT * FROM ventas WHERE id = ?", (sid,)).fetchone()
        return jsonify(dict(row) if row else {'error': 'No encontrada'})
    finally:
        conn.close()

@app.route('/api/prices', methods=['GET','POST'])
def api_prices():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            c = conn.execute("INSERT INTO precios (categoria, producto, capacidad, precio_base, precio_venta, notas) VALUES (?,?,?,?,?,?)",
                (data.get('categoria',''), data.get('producto',''), data.get('capacidad',''), data.get('precio_base',0), data.get('precio_venta',0), data.get('notas','')))
            conn.commit()
            return jsonify({'id': c.lastrowid, 'ok': True}), 201
        rows = conn.execute("SELECT * FROM precios ORDER BY categoria, producto").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/api/prices/<int:pid>', methods=['PATCH','DELETE'])
def api_price(pid):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM precios WHERE id = ?", (pid,))
            conn.commit()
            return jsonify({'ok': True})
        data = request.get_json()
        updates = [f"{k}=?" for k in data if k in ['categoria','producto','capacidad','precio_base','precio_venta','notas']]
        if updates:
            params = [data[k] for k in data if k in ['categoria','producto','capacidad','precio_base','precio_venta','notas']]
            params.append(pid)
            conn.execute(f"UPDATE precios SET {','.join(updates)} WHERE id = ?", params)
            conn.commit()
        return jsonify({'ok': True})
    finally:
        conn.close()

@app.route('/api/tasks', methods=['GET','POST'])
def api_tasks():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            c = conn.execute("INSERT INTO tareas (lead_id, tarea, estado, prioridad, vence, created_at) VALUES (?,?,?,?,?,?)",
                (data.get('lead_id',''), data.get('tarea',''), 'pendiente', data.get('prioridad','media'), data.get('vence',''), datetime.now().isoformat()))
            conn.commit()
            return jsonify({'id': c.lastrowid, 'ok': True}), 201
        rows = conn.execute("SELECT * FROM tareas ORDER BY completada ASC, vence ASC").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route('/api/tasks/<int:tid>', methods=['PATCH','DELETE'])
def api_task(tid):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM tareas WHERE id = ?", (tid,))
            conn.commit()
            return jsonify({'ok': True})
        data = request.get_json()
        updates = [f"{k}=?" for k in data if k in ['tarea','estado','prioridad','vence','completada']]
        if updates:
            params = [data[k] for k in data if k in ['tarea','estado','prioridad','vence','completada']]
            params.append(tid)
            conn.execute(f"UPDATE tareas SET {','.join(updates)} WHERE id = ?", params)
            conn.commit()
        return jsonify({'ok': True})
    finally:
        conn.close()

# ── Main ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(os.path.join(BASE_DIR, 'templates'), exist_ok=True)
    # Ensure DB exists with schema on startup
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        print("--  DB no encontrada. Ejecuta migrate_to_sqlite.py primero.")
    
    # ── API Enviar WhatsApp (proxy al bot API) ──
    @app.route('/api/send-message', methods=['POST'])
    @login_required
    def api_send_message():
        import json, re, urllib.request
        data = request.get_json()
        numero = data.get('numero')
        mensaje = data.get('mensaje')
        lead_id = data.get('lead_id')
        
        if not numero or not mensaje:
            return jsonify({'ok': False, 'error': 'numero y mensaje requeridos'}), 400
        
        numero_limpio = re.sub(r'[^0-9]', '', numero)
        
        try:
            payload = json.dumps({'to': numero_limpio, 'message': mensaje}).encode()
            req = urllib.request.Request(
                'http://localhost:18802/send',
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
            if lead_id and result.get('ok'):
                actividad_crear(lead_id, 'whatsapp', 'WhatsApp enviado', mensaje[:150])
            return jsonify(result)
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
    
    # ── POST /api/bot/silence — silencia un lead ──
    @app.route('/api/bot/silence', methods=['POST'])
    @login_required
    def api_bot_silence():
        import json, re, urllib.request
        data = request.get_json()
        numero = data.get('numero')
        if not numero:
            return jsonify({'ok': False, 'error': 'numero requerido'}), 400
        numero_limpio = re.sub(r'[^0-9]', '', numero)
        try:
            payload = json.dumps({'numero': numero_limpio}).encode()
            req = urllib.request.Request('http://localhost:18802/silence', data=payload,
                headers={'Content-Type': 'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
            return jsonify(result)
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
    
    # ── POST /api/bot/unsilence — desilencia un lead ──
    @app.route('/api/bot/unsilence', methods=['POST'])
    @login_required
    def api_bot_unsilence():
        import json, re, urllib.request
        data = request.get_json()
        numero = data.get('numero')
        if not numero:
            return jsonify({'ok': False, 'error': 'numero requerido'}), 400
        numero_limpio = re.sub(r'[^0-9]', '', numero)
        try:
            payload = json.dumps({'numero': numero_limpio}).encode()
            req = urllib.request.Request('http://localhost:18802/unsilence', data=payload,
                headers={'Content-Type': 'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
            return jsonify(result)
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
    
    # ── POST /api/bot/global-off — apagar bot ──
    @app.route('/api/bot/global-off', methods=['POST'])
    @login_required
    def api_bot_global_off():
        import json, urllib.request
        try:
            payload = json.dumps({}).encode()
            req = urllib.request.Request('http://localhost:18802/global-off', data=payload,
                headers={'Content-Type': 'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
            return jsonify(result)
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
    
    # ── POST /api/bot/global-on — encender bot ──
    @app.route('/api/bot/global-on', methods=['POST'])
    @login_required
    def api_bot_global_on():
        import json, urllib.request
        try:
            payload = json.dumps({}).encode()
            req = urllib.request.Request('http://localhost:18802/global-on', data=payload,
                headers={'Content-Type': 'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
            return jsonify(result)
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
    
    # ── GET /api/bot/status — estado del bot ──
    @app.route('/api/bot/status')
    @login_required
    def api_bot_status():
        import json, urllib.request
        try:
            payload = json.dumps({}).encode()
            req = urllib.request.Request('http://localhost:18802/status', data=payload,
                headers={'Content-Type': 'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=5) as resp:
                result = json.loads(resp.read())
            return jsonify(result)
        except Exception as e:
            return jsonify({'ok': False, 'status': 'offline', 'error': str(e)})
    
    # ── GET /api/bot/log — últimas líneas del log ──
    @app.route('/api/bot/log')
    @login_required
    def api_bot_log():
        log_path = '/home/peku/htk-whatsapp-bot/bot.log'
        try:
            if os.path.exists(log_path):
                with open(log_path) as f:
                    lines = f.readlines()
                    last = lines[-200:]
                return jsonify({'log': ''.join(last), 'ok': True})
            return jsonify({'log': '', 'ok': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    print("CRM HTK INGENIERIA v2 (SQLite) corriendo en http://localhost:5000")
    app.run(host='127.0.0.1', port=18800, debug=False)
