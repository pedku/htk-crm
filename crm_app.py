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

# ── Tipos de Órdenes de Trabajo ────────────────────────────────────

TIPOS_OT = {
    'reparacion': {
        'label': 'Reparación',
        'icono': '🔧',
        'color': '#f97316',
        'estados': ['recibido','diagnosticando','presupuestado','aprobado','reparando','esperando_repuestos','completado','entregado','cancelado'],
        'campos': ['falla_reportada','diagnostico']
    },
    'fabricacion': {
        'label': 'Fabricación',
        'icono': '🏭',
        'color': '#0ea5e9',
        'estados': ['cotizando','diseno_aprobado','materiales','bobinado','ensamble','pruebas','control_calidad','finalizado','entregado','cancelado'],
        'campos': ['tipo_producto','capacidad','voltaje_entrada','voltaje_salida','fases','nucleo','refrigeracion','operario','fecha_inicio','fecha_estimada']
    },
    'instalacion': {
        'label': 'Instalación',
        'icono': '🚗',
        'color': '#10b981',
        'estados': ['agendado','en_sitio','instalando','pruebas','finalizado','facturado','cancelado'],
        'campos': ['direccion_instalacion','tipo_cargador','potencia','requiere_obra_civil','fecha_agendada','tecnico_asignado']
    }
}

def get_estado_inicial(tipo):
    """Return the initial estado for a given OT type."""
    if tipo in TIPOS_OT and TIPOS_OT[tipo]['estados']:
        return TIPOS_OT[tipo]['estados'][0]
    return 'recibido'

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

def export_work_orders_full(conn, tipo_filter=None):
    """Export work orders with nested cliente/equipo/historial/fechas and proper types."""
    if tipo_filter:
        orders = conn.execute("SELECT * FROM work_orders WHERE tipo = ? ORDER BY id", (tipo_filter,)).fetchall()
    else:
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
        # Parse campos_extra JSON
        try:
            import json
            wo['campos_extra'] = json.loads(wo.get('campos_extra', '{}') or '{}')
        except (json.JSONDecodeError, TypeError):
            wo['campos_extra'] = {}
        # Type conversions for JSON compatibility
        wo['activo'] = bool(wo.get('activo', 0))
        if wo.get('presupuesto') is not None:
            wo['presupuesto'] = float(wo['presupuesto'])
        if wo.get('valor_total') is not None:
            wo['valor_total'] = float(wo['valor_total'])
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
            # Allow localhost GET without auth (bot.js, healthchecks)
            is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
            if is_local and request.method == 'GET':
                return f(*args, **kwargs)
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
                    result['ordenes_detalle'].append({
                        'id': wo_detail['id'],
                        'tipo': wo_detail.get('tipo', 'reparacion'),
                        'estado': wo_detail.get('estado', ''),
                        'presupuesto': wo_detail.get('presupuesto'),
                        'equipo_tipo': wo_detail.get('equipo', {}).get('tipo', ''),
                        'equipo_marca': wo_detail.get('equipo', {}).get('marca', ''),
                        'equipo_modelo': wo_detail.get('equipo', {}).get('modelo', ''),
                        'fecha_recibido': wo_detail.get('fechas', {}).get('recibido'),
                        'saldo_pendiente': wo_detail.get('saldo_pendiente'),
                        'total_abonado': wo_detail.get('total_abonado', 0)
                    })
            result['ordenes_count'] = len(result['ordenes_detalle'])
            result['total_facturado'] = sum((o.get('presupuesto') or 0) for o in result['ordenes_detalle'])
            result['saldo_pendiente_total'] = sum((o.get('saldo_pendiente') or 0) for o in result['ordenes_detalle'])
            # Load last 10 interactions from linked lead
            result['interacciones'] = []
            if result.get('lead_id'):
                int_rows = conn.execute(
                    "SELECT * FROM interactions WHERE lead_id = ? ORDER BY fecha DESC LIMIT 10",
                    (result['lead_id'],)
                ).fetchall()
                result['interacciones'] = [dict(i) for i in int_rows]
            return jsonify(result)
        
        if request.method == 'DELETE':
            # Reset linked lead to 'nuevo' if client was converted from lead
            conn.execute("UPDATE leads SET estado = 'nuevo' WHERE id IN (SELECT lead_id FROM clients WHERE id = ?) AND estado = 'cliente'", (client_id,))
            conn.execute("DELETE FROM clients WHERE id = ?", (client_id,))
            conn.execute("DELETE FROM work_order_client_links WHERE client_id = ?", (client_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Cliente {client_id} eliminado'})
        
        # PUT
        data = request.get_json()
        updates = []
        params = []
        # All client fields including new ones from Fase 1
        for key in ['nombre', 'telefono', 'fuente', 'estado', 'segmento', 'linea_interes', 'notas', 'lead_id',
                    'contacto_nombre', 'direccion', 'ciudad', 'tipo_documento', 'documento', 'empresa', 'cargo',
                    'cumpleanos', 'redes_contacto']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        updates.append("ultimo_contacto = ?")
        params.append(now_iso())
        params.append(client_id)
        
        if updates:
            conn.execute(f"UPDATE clients SET {', '.join(updates)} WHERE id = ?", params)
            # Sync back to linked lead
            if 'lead_id' not in data:
                lead_row = conn.execute("SELECT lead_id FROM clients WHERE id = ?", (client_id,)).fetchone()
                linked_lead_id = lead_row['lead_id'] if lead_row else None
            else:
                linked_lead_id = data.get('lead_id')
            if linked_lead_id:
                lead_updates = []
                lead_params = []
                sync_fields = {'nombre':'nombre', 'telefono':'telefono', 'segmento':'segmento',
                               'linea_interes':'linea_interes', 'fuente':'fuente', 'notas':'notas',
                               'contacto_nombre':'contacto_nombre'}
                for client_key, lead_key in sync_fields.items():
                    if client_key in data:
                        lead_updates.append(f"{lead_key} = ?")
                        lead_params.append(data[client_key])
                if lead_updates:
                    lead_params.append(linked_lead_id)
                    conn.execute(f"UPDATE leads SET {', '.join(lead_updates)} WHERE id = ?", lead_params)
        
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
            result = dict(row)
            # If lead is converted to client, include client data
            if result.get('estado') == 'cliente':
                client_row = conn.execute(
                    "SELECT * FROM clients WHERE lead_id = ?", (lead_id,)
                ).fetchone()
                if client_row:
                    c = dict(client_row)
                    wo_count = conn.execute(
                        "SELECT COUNT(*) FROM work_order_client_links WHERE client_id = ?",
                        (c['id'],)
                    ).fetchone()[0]
                    result['cliente_vinculado'] = {
                        'id': c['id'],
                        'nombre': c.get('nombre', ''),
                        'telefono': c.get('telefono', ''),
                        'empresa': c.get('empresa', ''),
                        'segmento': c.get('segmento', ''),
                        'ciudad': c.get('ciudad', ''),
                        'ordenes_count': wo_count
                    }
            return jsonify(result)
        
        if request.method == 'DELETE':
            # Also delete linked client if lead was converted
            conn.execute("DELETE FROM clients WHERE lead_id = ?", (lead_id,))
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
            # Sync to linked client if this lead was converted
            lead_row = conn.execute("SELECT estado FROM leads WHERE id = ?", (lead_id,)).fetchone()
            if lead_row and lead_row['estado'] == 'cliente':
                client = conn.execute("SELECT id FROM clients WHERE lead_id = ?", (lead_id,)).fetchone()
                if client:
                    client_updates = []
                    client_params = []
                    sync_fields = {'nombre':'nombre', 'telefono':'telefono', 'segmento':'segmento', 
                                   'linea_interes':'linea_interes', 'fuente':'fuente', 'notas':'notas',
                                   'contacto_nombre':'contacto_nombre'}
                    for lead_key, client_key in sync_fields.items():
                        if lead_key in data:
                            client_updates.append(f"{client_key} = ?")
                            client_params.append(data[lead_key])
                    if client_updates:
                        client_params.append(client['id'])
                        conn.execute(f"UPDATE clients SET {', '.join(client_updates)} WHERE id = ?", client_params)
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
                interacciones_totales, estado, segmento, linea_interes, lead_id, notas, contacto_nombre)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            lead['telefono'] or lead['contacto'],
            lead['nombre'],
            lead['fuente'],
            now,
            now,
            0,
            'cliente',
            lead['segmento'],
            lead['linea_interes'],
            lead_id,
            lead['notas'] or '',
            lead['contacto_nombre'] or ''
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
    import json
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
    # Parse campos_extra JSON
    try:
        wo['campos_extra'] = json.loads(wo.get('campos_extra', '{}') or '{}')
    except (json.JSONDecodeError, TypeError):
        wo['campos_extra'] = {}
    # Type conversions for JSON compatibility
    wo['activo'] = bool(wo.get('activo', 0))
    if wo.get('presupuesto') is not None:
        wo['presupuesto'] = float(wo['presupuesto']) if isinstance(wo['presupuesto'], int) else float(wo['presupuesto'])
    if wo.get('valor_total') is not None:
        wo['valor_total'] = float(wo['valor_total'])
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
    # Load payments
    pay_rows = conn.execute(
        "SELECT id, monto, tipo, metodo, referencia, fecha, notas, registrado_por FROM payments WHERE wo_id = ? ORDER BY id",
        (wo_id,)
    ).fetchall()
    wo['payments'] = [dict(p) for p in pay_rows]
    wo['total_abonado'] = sum(p['monto'] for p in pay_rows)
    if wo.get('presupuesto'):
        wo['saldo_pendiente'] = round(wo['presupuesto'] - wo['total_abonado'], 2)
    else:
        wo['saldo_pendiente'] = None
    # Load linked client data if client_id is set
    wo['client_id'] = wo.get('client_id')
    wo['cliente_vinculado'] = None
    if wo.get('client_id'):
        client_row = conn.execute("SELECT * FROM clients WHERE id = ?", (wo['client_id'],)).fetchone()
        if client_row:
            c = dict(client_row)
            # Count previous orders
            prev_count = conn.execute(
                "SELECT COUNT(*) FROM work_order_client_links WHERE client_id = ?",
                (wo['client_id'],)
            ).fetchone()[0]
            total_fact = conn.execute(
                "SELECT COALESCE(SUM(presupuesto), 0) FROM work_orders w JOIN work_order_client_links l ON w.id = l.wo_id WHERE l.client_id = ?",
                (wo['client_id'],)
            ).fetchone()[0]
            wo['cliente_vinculado'] = {
                'id': c['id'],
                'nombre': c.get('nombre', ''),
                'telefono': c.get('telefono', ''),
                'empresa': c.get('empresa', ''),
                'segmento': c.get('segmento', ''),
                'ciudad': c.get('ciudad', ''),
                'ordenes_previas': prev_count,
                'total_facturado': float(total_fact)
            }
    return wo

@app.route('/api/work_orders/tipos')
@login_required
def api_wo_tipos():
    return jsonify(TIPOS_OT)


@app.route('/api/work_orders', methods=['GET', 'POST'])
@login_required
def api_work_orders():
    conn = get_db()
    try:
        if request.method == 'GET':
            tipo_filter = request.args.get('tipo')
            if tipo_filter and tipo_filter not in TIPOS_OT:
                return jsonify({'error': f'Tipo inválido: {tipo_filter}'}), 400
            return jsonify(export_work_orders_full(conn, tipo_filter))
        
        # POST
        data = request.get_json()
        new_id = next_id('HTK', 'work_orders')
        now = now_iso()
        
        cliente = data.get('cliente', {})
        equipo = data.get('equipo', {})
        
        # Tipo de OT
        tipo = data.get('tipo', 'reparacion')
        if tipo not in TIPOS_OT:
            return jsonify({'error': f'Tipo de OT inválido: {tipo}'}), 400
        
        estado_inicial = get_estado_inicial(tipo)
        
        # Campos extra (JSON)
        import json
        campos_extra = data.get('campos_extra', {})
        campos_extra_str = json.dumps(campos_extra, ensure_ascii=False) if campos_extra else '{}'
        
        # Historial desc
        desc_inicial_map = {
            'reparacion': 'Equipo recibido en taller.',
            'fabricacion': 'Solicitud de fabricación recibida.',
            'instalacion': 'Instalación agendada.'
        }
        
        conn.execute("""
            INSERT INTO work_orders (id, tipo, cliente_nombre, cliente_telefono, equipo_tipo, equipo_marca,
                equipo_modelo, falla_reportada, diagnostico, presupuesto, estado,
                notas_internas, activo, fecha_recibido, campos_extra, valor_total, client_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            tipo,
            cliente.get('nombre', ''),
            cliente.get('telefono', ''),
            equipo.get('tipo', 'otro'),
            equipo.get('marca', ''),
            equipo.get('modelo', ''),
            data.get('falla_reportada', ''),
            None,
            data.get('presupuesto'),
            estado_inicial,
            data.get('notas_internas', ''),
            1,
            now,
            campos_extra_str,
            data.get('valor_total'),
            data.get('client_id')
        ))
        
        conn.execute("""
            INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
            VALUES (?, ?, ?, ?, ?)
        """, (
            new_id,
            now,
            estado_inicial,
            data.get('historial_desc', desc_inicial_map.get(tipo, 'Orden creada.')),
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
        import json
        data = request.get_json()
        updates = []
        params = []
        for key in ['falla_reportada', 'diagnostico', 'presupuesto', 'notas_internas', 'activo', 'valor_total']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        
        # Tipo — validar si viene
        if 'tipo' in data:
            if data['tipo'] not in TIPOS_OT:
                return jsonify({'error': f'Tipo de OT inválido: {data["tipo"]}'}), 400
            updates.append("tipo = ?")
            params.append(data['tipo'])
        
        # client_id
        if 'client_id' in data:
            updates.append("client_id = ?")
            params.append(data['client_id'])
        
        # Campos extra — hacer merge con existente
        if 'campos_extra' in data:
            existing_raw = row['campos_extra'] or '{}'
            try:
                existing = json.loads(existing_raw)
            except (json.JSONDecodeError, TypeError):
                existing = {}
            existing.update(data['campos_extra'])
            updates.append("campos_extra = ?")
            params.append(json.dumps(existing, ensure_ascii=False))
        
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

# ── KANBAN de Órdenes de Trabajo ──────────────────────────────

@app.route('/api/work_orders/kanban')
@login_required
def api_wo_kanban():
    """
    GET /api/work_orders/kanban?tipo=X
    Devuelve columnas dinámicas + tarjetas agrupadas por estado.
    Sin tipo: todos los tipos mezclados (columnas = union de todos los estados).
    Con tipo: solo columnas y OTs de ese tipo.
    """
    import json
    tipo = request.args.get('tipo')
    conn = get_db()
    try:
        # ── Build columnas ──
        if tipo and tipo in TIPOS_OT:
            t_info = TIPOS_OT[tipo]
            columnas = [
                {'estado': e, 'label': e.replace('_', ' ').title(),
                 'color': t_info['color'], 'icono': t_info.get('icono', '📋')}
                for e in t_info['estados']
            ]
        else:
            # Union of all estados, preserving order per type
            seen = set()
            columnas = []
            for t_key, t_info in TIPOS_OT.items():
                for e in t_info['estados']:
                    if e not in seen:
                        seen.add(e)
                        columnas.append({
                            'estado': e,
                            'label': e.replace('_', ' ').title(),
                            'color': t_info['color'],
                            'icono': t_info.get('icono', '📋')
                        })

        # ── Get OTs ──
        orders = export_work_orders_full(conn, tipo if tipo and tipo in TIPOS_OT else None)

        # ── Build tarjetas ──
        tarjetas = {}
        for col in columnas:
            tarjetas[col['estado']] = []

        now = now_col()
        for o in orders:
            estado = o.get('estado', '')
            if estado not in tarjetas:
                continue

            # Calculate payments
            pay_rows = conn.execute(
                "SELECT COALESCE(SUM(monto), 0) as total FROM payments WHERE wo_id = ?",
                (o['id'],)
            ).fetchone()
            total_abonado = float(pay_rows['total']) if pay_rows else 0.0
            presupuesto = float(o.get('presupuesto') or 0)
            saldo_pendiente = round(presupuesto - total_abonado, 2) if presupuesto else None
            pct_pagado = round((total_abonado / presupuesto) * 100, 1) if presupuesto > 0 else 0

            # Calculate days in current estado
            hist_row = conn.execute(
                "SELECT fecha FROM work_order_history WHERE wo_id = ? AND estado = ? ORDER BY id DESC LIMIT 1",
                (o['id'], estado)
            ).fetchone()
            if hist_row and hist_row['fecha']:
                try:
                    entry_dt = datetime.fromisoformat(hist_row['fecha'])
                    if entry_dt.tzinfo:
                        dias = (now - entry_dt).days
                    else:
                        dias = (now.replace(tzinfo=None) - entry_dt).days
                except (ValueError, TypeError):
                    dias = 0
            else:
                # Fallback: use fecha_recibido
                fecha_rec = o.get('fechas', {}).get('recibido')
                if fecha_rec:
                    try:
                        entry_dt = datetime.fromisoformat(fecha_rec)
                        if entry_dt.tzinfo:
                            dias = (now - entry_dt).days
                        else:
                            dias = (now.replace(tzinfo=None) - entry_dt).days
                    except (ValueError, TypeError):
                        dias = 0
                else:
                    dias = 0

            # Equipment description
            equipo_desc = (o.get('equipo', {}).get('marca', '') + ' ' +
                          o.get('equipo', {}).get('modelo', '')).strip()
            if not equipo_desc:
                equipo_desc = o.get('equipo', {}).get('tipo', 'Sin equipo')

            tarjeta = {
                'id': o['id'],
                'tipo': o.get('tipo', 'reparacion'),
                'cliente_nombre': o.get('cliente', {}).get('nombre', ''),
                'equipo': equipo_desc,
                'estado': estado,
                'fecha_recibido': o.get('fechas', {}).get('recibido'),
                'presupuesto': presupuesto,
                'total_abonado': total_abonado,
                'saldo_pendiente': saldo_pendiente,
                'dias_en_estado': dias,
                'pct_pagado': pct_pagado
            }
            tarjetas[estado].append(tarjeta)

        return jsonify({'columnas': columnas, 'tarjetas': tarjetas})
    finally:
        conn.close()


@app.route('/api/work_orders/<wo_id>/kanban', methods=['PATCH'])
@login_required
def api_wo_kanban_move(wo_id):
    """
    PATCH /api/work_orders/<id>/kanban
    Mueve una OT a un nuevo estado vía Kanban drag-drop.
    Igual que PUT status pero dedicado al Kanban.
    """
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Orden no encontrada'}), 404

        data = request.get_json()
        new_status = data.get('estado')

        # Validate against tipo-specific estados
        wo_tipo = row['tipo'] or 'reparacion'
        valid_statuses = TIPOS_OT.get(wo_tipo, {}).get('estados', ['recibido'])
        if new_status not in valid_statuses:
            return jsonify({'error': f'Estado inválido para tipo {wo_tipo}: {new_status}'}), 400

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

        # Add history entry
        estado_label = new_status.replace('_', ' ').title()
        conn.execute("""
            INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
            VALUES (?, ?, ?, ?, ?)
        """, (
            wo_id,
            now,
            new_status,
            data.get('descripcion', f'Movido a {estado_label} vía Kanban'),
            1 if data.get('notificado') else 0
        ))

        conn.commit()
        return jsonify(wo_to_dict(conn, wo_id))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


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
        
        # Validate against tipo-specific estados
        wo_tipo = row['tipo'] or 'reparacion'
        valid_statuses = TIPOS_OT.get(wo_tipo, {}).get('estados', ['recibido'])
        if new_status not in valid_statuses:
            return jsonify({'error': f'Estado inválido para tipo {wo_tipo}: {new_status}'}), 400
        
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
        for table in ['clients', 'work_orders', 'work_order_history', 'leads', 'interactions', 'work_order_client_links', 'inventario', 'inventario_movimientos']:
            count = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()[0]
            tables[table] = count
        return jsonify(tables)
    finally:
        conn.close()


# ── API Client Orders & Payments ──────────────────────────────────

@app.route('/api/clients/<client_id>/orders', methods=['GET'])
@login_required
def api_client_orders(client_id):
    """Returns all work orders for a client with summary fields."""
    conn = get_db()
    try:
        client = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not client:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        linked = conn.execute(
            "SELECT wo_id FROM work_order_client_links WHERE client_id = ?",
            (client_id,)
        ).fetchall()
        wo_ids = [l['wo_id'] for l in linked]
        orders = []
        for wo_id in wo_ids:
            wo = wo_to_dict(conn, wo_id)
            if wo:
                orders.append({
                    'id': wo['id'],
                    'tipo': wo.get('tipo', 'reparacion'),
                    'estado': wo.get('estado', ''),
                    'fecha_recibido': wo.get('fechas', {}).get('recibido'),
                    'presupuesto': wo.get('presupuesto'),
                    'total_abonado': wo.get('total_abonado', 0),
                    'saldo_pendiente': wo.get('saldo_pendiente'),
                    'equipo_tipo': wo.get('equipo', {}).get('tipo', ''),
                    'equipo_marca': wo.get('equipo', {}).get('marca', ''),
                    'equipo_modelo': wo.get('equipo', {}).get('modelo', ''),
                    'falla_reportada': wo.get('falla_reportada', ''),
                    'cliente_nombre': wo.get('cliente', {}).get('nombre', ''),
                    'fecha_completado': wo.get('fechas', {}).get('completado'),
                    'fecha_entregado': wo.get('fechas', {}).get('entregado')
                })
        orders.sort(key=lambda o: o.get('fecha_recibido') or '', reverse=True)
        return jsonify(orders)
    finally:
        conn.close()

@app.route('/api/clients/<client_id>/payments', methods=['GET'])
@login_required
def api_client_payments(client_id):
    """Returns all payments for a client through their work orders."""
    conn = get_db()
    try:
        client = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not client:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        linked = conn.execute(
            "SELECT wo_id FROM work_order_client_links WHERE client_id = ?",
            (client_id,)
        ).fetchall()
        wo_ids = [l['wo_id'] for l in linked]
        if not wo_ids:
            return jsonify([])
        placeholders = ','.join('?' for _ in wo_ids)
        rows = conn.execute(
            f"SELECT p.*, w.cliente_nombre, w.presupuesto as wo_presupuesto "
            f"FROM payments p LEFT JOIN work_orders w ON p.wo_id = w.id "
            f"WHERE p.wo_id IN ({placeholders}) ORDER BY p.fecha DESC, p.id DESC",
            wo_ids
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

# ── API Payments ───────────────────────────────────────────────────

@app.route('/api/work_orders/<wo_id>/payments', methods=['GET', 'POST'])
@login_required
def api_wo_payments(wo_id):
    conn = get_db()
    try:
        # Verify WO exists
        wo = conn.execute("SELECT id FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not wo:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if request.method == 'GET':
            rows = conn.execute(
                "SELECT * FROM payments WHERE wo_id = ? ORDER BY id", (wo_id,)
            ).fetchall()
            return jsonify([dict(r) for r in rows])
        
        # POST: registrar abono/pago
        data = request.get_json()
        monto = data.get('monto')
        if not monto or float(monto) <= 0:
            return jsonify({'error': 'Monto requerido y debe ser > 0'}), 400
        
        conn.execute("""
            INSERT INTO payments (wo_id, monto, tipo, metodo, referencia, fecha, notas, registrado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            wo_id,
            float(monto),
            data.get('tipo', 'abono'),
            data.get('metodo', ''),
            data.get('referencia', ''),
            data.get('fecha', now_iso()),
            data.get('notas', ''),
            data.get('registrado_por', 'Pedro')
        ))
        conn.commit()
        
        row = conn.execute("SELECT * FROM payments WHERE rowid = last_insert_rowid()").fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/work_orders/<wo_id>/payments/<int:payment_id>', methods=['DELETE'])
@login_required
def api_wo_payment(wo_id, payment_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM payments WHERE id = ? AND wo_id = ?", (payment_id, wo_id)).fetchone()
        if not row:
            return jsonify({'error': 'Pago no encontrado'}), 404
        conn.execute("DELETE FROM payments WHERE id = ?", (payment_id,))
        conn.commit()
        return jsonify({'success': True, 'message': f'Pago {payment_id} eliminado'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── API Bot Config ──────────────────────────────────────────────────

@app.route('/api/bot/config', methods=['GET', 'PUT'])
def api_bot_config():
    # Allow localhost/bot access without auth for GET; require auth for PUT and external GET
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
    if request.method == 'PUT' and 'user' not in session:
        # PUT always requires auth
        return redirect(url_for('login_page', next=request.path))
    if request.method == 'GET' and not is_local and 'user' not in session:
        return redirect(url_for('login_page', next=request.path))
    
    conn = get_db()
    try:
        if request.method == 'GET':
            rows = conn.execute("SELECT * FROM bot_config ORDER BY categoria, key").fetchall()
            # Flat format: { key: value, ... } for easy consumption by bot.js
            result = {}
            meta = {}
            for r in rows:
                result[r['key']] = r['value']
                meta[r['key']] = {
                    'value': r['value'],
                    'tipo': r['tipo'],
                    'descripcion': r['descripcion'],
                    'categoria': r['categoria']
                }
            # If client requests verbose, return full metadata
            if request.args.get('verbose') == '1':
                return jsonify(meta)
            return jsonify(result)
        
        # PUT: bulk update
        data = request.get_json()
        updated = 0
        for key, value in data.items():
            row = conn.execute("SELECT key FROM bot_config WHERE key = ?", (key,)).fetchone()
            if row:
                conn.execute("UPDATE bot_config SET value = ? WHERE key = ?", (str(value), key))
                updated += 1
        conn.commit()
        return jsonify({'ok': True, 'updated': updated})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/bot/config/reload', methods=['POST'])
@login_required
def api_bot_config_reload():
    """Notify the bot to reload its configuration from the CRM."""
    import json as _json, urllib.request as _urllib
    try:
        payload = _json.dumps({'action': 'reload_config'}).encode()
        req = _urllib.request.Request('http://localhost:18802/reload-config', data=payload,
            headers={'Content-Type': 'application/json'}, method='POST')
        with _urllib.request.urlopen(req, timeout=10) as resp:
            result = _json.loads(resp.read())
        return jsonify(result)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


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


@app.route('/api/segments')
@login_required
def api_segments():
    conn = get_db()
    try:
        rows = conn.execute("SELECT key, label, color, orden FROM segmentos WHERE activo=1 ORDER BY orden").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


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



# ── API: WO Templates (Plantillas de Notificación) ────────────

@app.route('/api/wo-templates', methods=['GET', 'POST'])
@login_required
def api_wo_templates():
    conn = get_db()
    try:
        if request.method == 'GET':
            tipo_filter = request.args.get('tipo_ot')
            if tipo_filter:
                rows = conn.execute(
                    "SELECT * FROM wo_templates WHERE tipo_ot IN (?, '*') ORDER BY tipo_ot, estado_origen",
                    (tipo_filter,)
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM wo_templates ORDER BY tipo_ot, estado_origen").fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d['activo'] = bool(d.get('activo', 0))
                result.append(d)
            return jsonify(result)
        
        # POST
        data = request.get_json()
        if not data.get('nombre') or not data.get('mensaje'):
            return jsonify({'error': 'nombre y mensaje requeridos'}), 400
        conn.execute("""
            INSERT INTO wo_templates (nombre, tipo_ot, estado_origen, asunto, mensaje, canal, activo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get('nombre'),
            data.get('tipo_ot', '*'),
            data.get('estado_origen', ''),
            data.get('asunto', ''),
            data.get('mensaje'),
            data.get('canal', 'whatsapp'),
            1 if data.get('activo', True) else 0
        ))
        conn.commit()
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute("SELECT * FROM wo_templates WHERE id = ?", (new_id,)).fetchone()
        d = dict(row)
        d['activo'] = bool(d.get('activo', 0))
        return jsonify(d), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/wo-templates/<int:template_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_wo_template(template_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM wo_templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Plantilla no encontrada'}), 404
        
        if request.method == 'GET':
            d = dict(row)
            d['activo'] = bool(d.get('activo', 0))
            return jsonify(d)
        
        if request.method == 'DELETE':
            conn.execute("DELETE FROM wo_templates WHERE id = ?", (template_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Plantilla {template_id} eliminada'})
        
        # PUT
        data = request.get_json()
        updates = []
        params = []
        for key in ['nombre', 'tipo_ot', 'estado_origen', 'asunto', 'mensaje', 'canal', 'activo']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key] if key != 'activo' else (1 if data[key] else 0))
        if updates:
            params.append(template_id)
            conn.execute(f"UPDATE wo_templates SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        
        row = conn.execute("SELECT * FROM wo_templates WHERE id = ?", (template_id,)).fetchone()
        d = dict(row)
        d['activo'] = bool(d.get('activo', 0))
        return jsonify(d)
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/work_orders/<wo_id>/notify', methods=['POST'])
@login_required
def api_wo_notify(wo_id):
    import json, re, urllib.request
    conn = get_db()
    try:
        # 1. Load WO
        wo_row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not wo_row:
            return jsonify({'ok': False, 'error': 'Orden no encontrada'}), 404
        
        wo = dict(wo_row)
        
        # Check if we have a phone number
        telefono = wo.get('cliente_telefono', '')
        if not telefono:
            # Try to find from linked client
            if wo.get('client_id'):
                client_row = conn.execute("SELECT telefono FROM clients WHERE id = ?", (wo['client_id'],)).fetchone()
                if client_row:
                    telefono = client_row['telefono'] or ''
        if not telefono:
            return jsonify({'ok': False, 'error': 'No hay número de teléfono para el cliente'}), 400
        
        # 2. Find matching template
        tipo_ot = wo.get('tipo', 'reparacion')
        estado = wo.get('estado', '')
        template = conn.execute(
            "SELECT * FROM wo_templates WHERE tipo_ot = ? AND estado_origen = ? AND activo = 1",
            (tipo_ot, estado)
        ).fetchone()
        if not template:
            # Fallback: tipo_ot='*'
            template = conn.execute(
                "SELECT * FROM wo_templates WHERE tipo_ot = '*' AND estado_origen = ? AND activo = 1",
                (estado,)
            ).fetchone()
        if not template:
            return jsonify({'ok': False, 'error': f'No hay plantilla activa para {tipo_ot}/{estado}'}), 400
        
        tmpl = dict(template)
        mensaje = tmpl['mensaje']
        
        # 3. Replace placeholders
        # Parse campos_extra
        try:
            campos_extra = json.loads(wo.get('campos_extra', '{}') or '{}')
        except (json.JSONDecodeError, TypeError):
            campos_extra = {}
        
        # Format presupuesto as Colombian pesos
        presupuesto = wo.get('presupuesto')
        if presupuesto is not None:
            presupuesto_str = f"{presupuesto:,.0f}".replace(',', '.')
        else:
            presupuesto_str = '0'
        
        from datetime import datetime
        fecha_str = datetime.now(COL_TZ).strftime('%d/%m/%Y')
        
        equipo_str = ' '.join(filter(None, [
            wo.get('equipo_tipo', ''),
            wo.get('equipo_marca', ''),
            wo.get('equipo_modelo', '')
        ])).strip()
        
        replacements = {
            '{id}': wo['id'],
            '{cliente}': wo.get('cliente_nombre', ''),
            '{equipo}': equipo_str,
            '{estado}': estado,
            '{presupuesto}': presupuesto_str,
            '{fecha}': fecha_str,
            '{diagnostico}': wo.get('diagnostico', '') or '',
            '{tipo_producto}': campos_extra.get('tipo_producto', ''),
            '{capacidad}': campos_extra.get('capacidad', ''),
            '{fecha_estimada}': campos_extra.get('fecha_estimada', ''),
            '{tipo_cargador}': campos_extra.get('tipo_cargador', ''),
            '{potencia}': campos_extra.get('potencia', ''),
            '{fecha_agendada}': campos_extra.get('fecha_agendada', ''),
            '{tecnico_asignado}': campos_extra.get('tecnico_asignado', ''),
        }
        
        for placeholder, value in replacements.items():
            mensaje = mensaje.replace(placeholder, str(value))
        
        # 4. Send via WhatsApp bot
        numero_limpio = re.sub(r'[^0-9]', '', telefono)
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
        except Exception as e:
            return jsonify({'ok': False, 'error': f'Bot WhatsApp no disponible: {str(e)}'}), 500
        
        # 5. Register interaction
        lead_id = None
        lead_row = conn.execute(
            "SELECT lead_id FROM clients WHERE id = ?", (wo.get('client_id', ''),)
        ).fetchone()
        if lead_row:
            lead_id = lead_row['lead_id']
        
        if lead_id:
            now = now_iso()
            conn.execute("""
                INSERT INTO interactions (lead_id, tipo, direccion, resumen, detalle, fecha, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                lead_id,
                'whatsapp',
                'saliente',
                f'Notificación OT {wo_id} ({estado})',
                mensaje[:200],
                now,
                'completado'
            ))
        
        # 6. Mark history entry as notified
        conn.execute("""
            UPDATE work_order_history SET notificado = 1
            WHERE wo_id = ? AND estado = ? AND notificado = 0
            ORDER BY id DESC LIMIT 1
        """, (wo_id, estado))
        conn.commit()
        
        return jsonify({
            'ok': True,
            'message': f'Notificación enviada a {telefono}',
            'template_id': tmpl['id'],
            'plantilla': tmpl['nombre'],
            'canal': 'whatsapp',
            'result': result
        })
    except Exception as e:
        conn.rollback()
        return jsonify({'ok': False, 'error': str(e)}), 500
    finally:
        conn.close()


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
@login_required
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

# ── API Inventario ──────────────────────────────────────────────────

@app.route('/api/inventario/bajo-stock', methods=['GET'])
@login_required
def api_inventario_bajo_stock():
    """GET /api/inventario/bajo-stock — items con cantidad < stock_minimo"""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM inventario WHERE cantidad < stock_minimo ORDER BY (stock_minimo - cantidad) DESC"
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/inventario', methods=['GET', 'POST'])
@login_required
def api_inventario():
    if request.method == 'GET':
        conn = get_db()
        try:
            categoria = request.args.get('categoria')
            search = request.args.get('search', '').strip()
            query = "SELECT * FROM inventario WHERE 1=1"
            params = []
            if categoria:
                query += " AND categoria = ?"
                params.append(categoria)
            if search:
                query += " AND (nombre LIKE ? OR codigo LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " ORDER BY categoria, nombre"
            rows = conn.execute(query, params).fetchall()
            return jsonify([dict(r) for r in rows])
        finally:
            conn.close()

    # POST — crear item
    data = request.get_json()
    conn = get_db()
    try:
        conn.execute('''
            INSERT INTO inventario (codigo, nombre, categoria, unidad, cantidad, stock_minimo, proveedor, costo_unitario, ubicacion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('codigo', ''),
            data.get('nombre', ''),
            data.get('categoria', ''),
            data.get('unidad', 'unidad'),
            data.get('cantidad', 0),
            data.get('stock_minimo', 0),
            data.get('proveedor', ''),
            data.get('costo_unitario', 0),
            data.get('ubicacion', '')
        ))
        conn.commit()
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/inventario/<int:item_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_inventario_item(item_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Item no encontrado'}), 404

        if request.method == 'GET':
            return jsonify(dict(row))

        if request.method == 'DELETE':
            conn.execute("DELETE FROM inventario_movimientos WHERE item_id = ?", (item_id,))
            conn.execute("DELETE FROM inventario WHERE id = ?", (item_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Item {row["codigo"]} eliminado'})

        # PUT — editar item
        data = request.get_json()
        updates = []
        params = []
        for key in ['codigo', 'nombre', 'categoria', 'unidad', 'cantidad', 'stock_minimo', 'proveedor', 'costo_unitario', 'ubicacion']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        if updates:
            params.append(item_id)
            conn.execute(f"UPDATE inventario SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/inventario/<int:item_id>/ajustar', methods=['POST'])
@login_required
def api_inventario_ajustar(item_id):
    """POST /api/inventario/<id>/ajustar — entrada/salida de stock"""
    data = request.get_json()
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Item no encontrado'}), 404

        tipo = data.get('tipo', 'entrada')
        cantidad = float(data.get('cantidad', 0))
        if cantidad <= 0:
            return jsonify({'error': 'Cantidad debe ser > 0'}), 400
        if tipo not in ('entrada', 'salida', 'ajuste'):
            return jsonify({'error': 'Tipo inválido: use entrada, salida o ajuste'}), 400

        # Calcular nueva cantidad
        if tipo == 'salida':
            nueva_cantidad = row['cantidad'] - cantidad
        else:
            nueva_cantidad = row['cantidad'] + cantidad

        if nueva_cantidad < 0:
            return jsonify({'error': f'Stock insuficiente. Actual: {row["cantidad"]} {row["unidad"]}'}), 400

        motivo = data.get('motivo', '')
        now = now_iso()

        # Registrar movimiento
        conn.execute('''
            INSERT INTO inventario_movimientos (item_id, tipo, cantidad, motivo, fecha)
            VALUES (?, ?, ?, ?, ?)
        ''', (item_id, tipo, cantidad, motivo, now))

        # Actualizar stock
        conn.execute("UPDATE inventario SET cantidad = ? WHERE id = ?", (nueva_cantidad, item_id))
        conn.commit()

        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/inventario/<int:item_id>/movimientos', methods=['GET'])
@login_required
def api_inventario_movimientos(item_id):
    """GET /api/inventario/<id>/movimientos — historial de movimientos"""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM inventario_movimientos WHERE item_id = ? ORDER BY fecha DESC LIMIT 50",
            (item_id,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/inventario/categorias', methods=['GET'])
@login_required
def api_inventario_categorias():
    """GET /api/inventario/categorias — lista de categorías únicas"""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT DISTINCT categoria FROM inventario WHERE categoria IS NOT NULL AND categoria != '' ORDER BY categoria"
        ).fetchall()
        return jsonify([r['categoria'] for r in rows])
    finally:
        conn.close()


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(os.path.join(BASE_DIR, 'templates'), exist_ok=True)
    
    # ── Migración: Tablas de Inventario ────────────────────────────
    def migrate_inventario():
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute('''
                CREATE TABLE IF NOT EXISTS inventario (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codigo TEXT UNIQUE,
                    nombre TEXT NOT NULL,
                    categoria TEXT,
                    unidad TEXT DEFAULT 'unidad',
                    cantidad REAL DEFAULT 0,
                    stock_minimo REAL DEFAULT 0,
                    proveedor TEXT,
                    costo_unitario REAL DEFAULT 0,
                    ubicacion TEXT
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS inventario_movimientos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    tipo TEXT NOT NULL,
                    cantidad REAL NOT NULL,
                    motivo TEXT,
                    fecha TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES inventario(id)
                )
            ''')
            # Seeds: insertar si la tabla inventario está vacía
            count = conn.execute("SELECT COUNT(*) FROM inventario").fetchone()[0]
            if count == 0:
                seeds = [
                    ('CU-12', 'Alambre de cobre #12', 'bobinado', 'kg', 0, 5, 'Cobres del Norte', 58000, 'Estante A1'),
                    ('CU-14', 'Alambre de cobre #14', 'bobinado', 'kg', 0, 5, 'Cobres del Norte', 48000, 'Estante A1'),
                    ('CU-10', 'Alambre de cobre #10', 'bobinado', 'kg', 0, 3, 'Cobres del Norte', 72000, 'Estante A1'),
                    ('NU-FE', 'Núcleo de ferrita', 'bobinado', 'unidad', 0, 2, 'Proveedor Nacional', 35000, 'Estante B2'),
                    ('NU-SI', 'Núcleo de silicio', 'bobinado', 'unidad', 0, 2, 'Proveedor Nacional', 85000, 'Estante B2'),
                    ('BA-01', 'Barniz aislante', 'bobinado', 'litro', 0, 2, 'Químicos del Caribe', 28000, 'Estante C1'),
                    ('TE-01', 'Terminales de conexión', 'electronico', 'unidad', 0, 20, 'ElectroPartes Ltda', 800, 'Estante D3'),
                    ('PR-TM', 'Protección termomagnética', 'protecciones', 'unidad', 0, 5, 'Schneider Electric', 45000, 'Estante E1'),
                    ('PR-SP', 'Supresor de picos', 'protecciones', 'unidad', 0, 3, 'Schneider Electric', 35000, 'Estante E1'),
                    ('GA-01', 'Gabinete metálico estándar', 'estructura', 'unidad', 0, 2, 'Metalúrgica del Norte', 120000, 'Estante F1'),
                    ('CA-01', 'Cable AWG 10', 'electronico', 'metro', 0, 20, 'ElectroPartes Ltda', 3500, 'Estante D1'),
                    ('CA-02', 'Cable AWG 12', 'electronico', 'metro', 0, 30, 'ElectroPartes Ltda', 2200, 'Estante D1'),
                ]
                conn.executemany(
                    "INSERT INTO inventario (codigo, nombre, categoria, unidad, cantidad, stock_minimo, proveedor, costo_unitario, ubicacion) VALUES (?,?,?,?,?,?,?,?,?)",
                    seeds
                )
                conn.commit()
                print(f"  → Inventario: {len(seeds)} items semilla insertados.")
        finally:
            conn.close()
    
    migrate_inventario()
    
    # Ensure DB exists with schema on startup
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        print("--  DB no encontrada. Ejecuta migrate_to_sqlite.py primero.")
    
    # ── Seed WO Templates (only if table is empty) ──
    seed_conn = get_db()
    try:
        count = seed_conn.execute("SELECT COUNT(*) FROM wo_templates").fetchone()[0]
        if count == 0:
            seeds = [
                # REPARACIÓN (5)
                ('Reparación — Recibido', 'reparacion', 'recibido', 'Tu orden en HTK',
                 '🔧 *HTK INGENIERIA*\n\n{cliente}, recibimos tu *{equipo}*.\nTu orden es: *{id}*\n\nLo revisaremos y te enviaremos el diagnóstico.\n⏱ Tiempo estimado: 48-72h', 'whatsapp', 1),
                ('Reparación — Presupuestado', 'reparacion', 'presupuestado', 'Diagnóstico completado',
                 '📋 *Diagnóstico completado*\n\n{cliente}, orden *{id}*\nEquipo: {equipo}\nDiagnóstico: {diagnostico}\nPresupuesto: *${presupuesto}*\n\nResponde *APROBAR* para iniciar la reparación.', 'whatsapp', 1),
                ('Reparación — Reparando', 'reparacion', 'reparando', 'Equipo en reparación',
                 '🔧 *Tu equipo está en reparación*\n\n{cliente}, orden *{id}* — {equipo}\n\nEstado actual: *{estado}*\nTe avisaremos cuando esté listo. ⚡', 'whatsapp', 1),
                ('Reparación — Esperando Repuestos', 'reparacion', 'esperando_repuestos', 'Actualización de tu orden',
                 '⏳ *Actualización de tu orden*\n\n{cliente}, orden *{id}* — {equipo}\n\nEstamos esperando repuestos. Te avisaremos cuando lleguen.\nGracias por tu paciencia 🙏', 'whatsapp', 1),
                ('Reparación — Completado', 'reparacion', 'completado', '¡Tu equipo está listo!',
                 '✅ *¡Tu equipo está listo!*\n\n{cliente}, orden *{id}* — {equipo}\n\nPuedes recogerlo en nuestro taller:\n📍 Barranquilla\n💰 Total: ${presupuesto}\n\n¡Gracias por confiar en HTK! ⚡', 'whatsapp', 1),
                # FABRICACIÓN (8)
                ('Fabricación — Cotizando', 'fabricacion', 'cotizando', 'Cotizando tu equipo',
                 '🏭 *HTK INGENIERIA*\n\n{cliente}, estamos cotizando tu {tipo_producto} {capacidad}.\nTe enviamos la propuesta pronto.', 'whatsapp', 1),
                ('Fabricación — Diseño Aprobado', 'fabricacion', 'diseno_aprobado', 'Diseño aprobado',
                 '✅ Diseño aprobado. Iniciamos fabricación de tu {tipo_producto} {capacidad}.\nOrden: *{id}*', 'whatsapp', 1),
                ('Fabricación — Materiales', 'fabricacion', 'materiales', 'Adquiriendo materiales',
                 '📦 Adquiriendo materiales para tu {tipo_producto}.\n{id}', 'whatsapp', 1),
                ('Fabricación — Bobinado', 'fabricacion', 'bobinado', 'En proceso de bobinado',
                 '🔧 En proceso de bobinado. {id} — {tipo_producto} {capacidad}.', 'whatsapp', 1),
                ('Fabricación — Ensamble', 'fabricacion', 'ensamble', 'Ensamblando equipo',
                 '🔩 Ensamblando tu {tipo_producto}. {id}', 'whatsapp', 1),
                ('Fabricación — Pruebas', 'fabricacion', 'pruebas', 'Probando equipo',
                 '⚡ Probando tu {tipo_producto}. Verificamos voltajes y protección. {id}', 'whatsapp', 1),
                ('Fabricación — Control Calidad', 'fabricacion', 'control_calidad', 'Control de calidad aprobado',
                 '✅ Control de calidad aprobado. {id} — {tipo_producto} listo.', 'whatsapp', 1),
                ('Fabricación — Finalizado', 'fabricacion', 'finalizado', '¡Fabricación completada!',
                 '🏁 *¡Fabricación completada!*\n\n{id} — {tipo_producto} {capacidad}\nTotal: ${presupuesto}\n\nGracias por confiar en HTK INGENIERIA ⚡', 'whatsapp', 1),
                # INSTALACIÓN (6)
                ('Instalación — Agendado', 'instalacion', 'agendado', 'Instalación agendada',
                 '📅 Instalación agendada: {fecha_agendada}\nTécnico: {tecnico_asignado}\n{id}', 'whatsapp', 1),
                ('Instalación — En Sitio', 'instalacion', 'en_sitio', 'Técnico en sitio',
                 '👷 Técnico en sitio. Iniciando instalación de tu {tipo_cargador}. {id}', 'whatsapp', 1),
                ('Instalación — Instalando', 'instalacion', 'instalando', 'Instalando cargador',
                 '🔌 Instalando {tipo_cargador} {potencia}. {id}', 'whatsapp', 1),
                ('Instalación — Pruebas', 'instalacion', 'pruebas', 'Realizando pruebas',
                 '⚡ Realizando pruebas del cargador. {id}', 'whatsapp', 1),
                ('Instalación — Finalizado', 'instalacion', 'finalizado', 'Instalación completada',
                 '✅ Instalación completada. {id} — {tipo_cargador}. ¡Disfruta!', 'whatsapp', 1),
                ('Instalación — Facturado', 'instalacion', 'facturado', 'Factura emitida',
                 '📄 Factura emitida. {id} — Total: ${presupuesto}. Gracias por confiar en HTK.', 'whatsapp', 1),
            ]
            seed_conn.executemany(
                "INSERT INTO wo_templates (nombre, tipo_ot, estado_origen, asunto, mensaje, canal, activo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                seeds
            )
            seed_conn.commit()
            print(f"  {len(seeds)} plantillas de notificación insertadas.")
        else:
            print(f"  {count} plantillas ya existen en wo_templates — seeds omitidos.")
    finally:
        seed_conn.close()
    
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
    
    # ── GET /api/lid/stats — estadísticas de resolución ──
    @app.route('/api/lid/stats')
    @login_required
    def api_lid_stats():
        try:
            conn = get_db()
            total = conn.execute("SELECT COUNT(*) FROM interactions WHERE direccion='recibido'").fetchone()[0]
            total_lid = conn.execute("SELECT COUNT(*) FROM lid_mappings").fetchone()[0]
            return jsonify({'ok': True, 'total_interactions': total, 'lid_mappings': total_lid})
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
        finally:
            conn.close()

    print("CRM HTK INGENIERIA v2 (SQLite) corriendo en http://localhost:5000")
    app.run(host='127.0.0.1', port=18800, debug=False)
