"""API Clients Blueprint — CRUD, notes, orders, payments."""
from flask import Blueprint, jsonify, request
from app.core.db import get_db, now_iso, next_id
from app.core.auth import login_required
from app.services.crm_service import sync_client_to_lead
from app.services.wo_service import wo_to_dict

api_clients_bp = Blueprint('api_clients', __name__)


def client_to_dict(row, conn=None):
    """Convert a client DB row to dict with ordenes from link table."""
    d = dict(row)
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True
    try:
        linked = conn.execute(
            "SELECT wo_id FROM work_order_client_links WHERE client_id = ?",
            (d['id'],)
        ).fetchall()
        d['ordenes'] = [l['wo_id'] for l in linked]
    finally:
        if should_close:
            conn.close()
    return d


@api_clients_bp.route('/api/clients/by-phone/<phone>', methods=['GET'])
@login_required
def api_clients_by_phone(phone):
    """Buscar cliente por número de teléfono."""
    conn = get_db()
    try:
        # Buscar en tabla clients
        row = conn.execute(
            "SELECT id, nombre, telefono, estado FROM clients WHERE telefono LIKE ? LIMIT 1",
            (f'%{phone}%',)
        ).fetchone()
        
        if not row:
            # Buscar en tabla leads
            row = conn.execute(
                "SELECT id, nombre, telefono, estado FROM leads WHERE telefono LIKE ? LIMIT 1",
                (f'%{phone}%',)
            ).fetchone()
        
        if not row:
            return jsonify({'error': 'No encontrado'}), 404
        
        return jsonify(dict(row))
    finally:
        conn.close()


@api_clients_bp.route('/api/clients/by-lid/<lid>', methods=['GET'])
@login_required
def api_clients_by_lid(lid):
    """Buscar cliente/lead por @lid de WhatsApp."""
    conn = get_db()
    try:
        # Buscar en tabla leads primero (más probable para WhatsApp)
        row = conn.execute(
            "SELECT id, nombre, telefono, estado, lid FROM leads WHERE lid = ? LIMIT 1",
            (lid,)
        ).fetchone()
        
        if not row:
            return jsonify({'error': 'No encontrado'}), 404
        
        return jsonify(dict(row))
    finally:
        conn.close()


@api_clients_bp.route('/api/clients/from-bot', methods=['POST'])
def api_clients_from_bot():
    """Endpoint sin auth para que el bot registre clientes (solo localhost)."""
    remote = request.remote_addr
    if remote not in ('127.0.0.1', 'localhost', '::1'):
        if request.headers.get('CF-Connecting-IP'):
            return jsonify({'error': 'Forbidden'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400
    
    conn = get_db()
    try:
        telefono = data.get('telefono', '')
        # Buscar si ya existe por teléfono primero
        existing = None
        if telefono:
            existing = conn.execute(
                "SELECT id FROM clients WHERE telefono LIKE ?",
                (f'%{telefono}%',)
            ).fetchone()
        
        if existing:
            # Ya existe — actualizar datos si faltan
            updates = []
            params = []
            for field in ('nombre', 'tipo_documento', 'documento', 'direccion'):
                if data.get(field):
                    updates.append(f"{field} = ?")
                    params.append(data[field])
            if updates:
                params.append(existing['id'])
                conn.execute(
                    f"UPDATE clients SET {', '.join(updates)} WHERE id = ?",
                    params
                )
                conn.commit()
            return jsonify({'ok': True, 'cliente_id': existing['id'], 'actualizado': True}), 200
        
        # Crear nuevo cliente
        new_id = f"CLI-{int(__import__('time').time() * 1000) % 100000}"
        now = __import__('datetime').datetime.now().isoformat()
        conn.execute("""
            INSERT INTO clients (id, telefono, nombre, fuente, primer_contacto,
                ultimo_contacto, interacciones_totales, estado, tipo_documento,
                documento, direccion, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            telefono,
            data.get('nombre', ''),
            data.get('fuente', 'WhatsApp'),
            now, now, 1,
            data.get('estado', 'cliente'),
            data.get('tipo_documento', ''),
            data.get('documento', ''),
            data.get('direccion', ''),
            data.get('notas', 'Registro automático desde WhatsApp bot')
        ))
        conn.commit()
        return jsonify({'ok': True, 'cliente_id': new_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_clients_bp.route('/api/clients', methods=['GET', 'POST'])
@login_required
def api_clients():
    if request.method == 'GET':
        conn = get_db()
        try:
            search = request.args.get('search', '').strip()
            if search:
                like = f'%{search}%'
                rows = conn.execute(
                    "SELECT * FROM clients WHERE nombre LIKE ? OR documento LIKE ? OR telefono LIKE ? OR empresa LIKE ? OR email LIKE ? ORDER BY nombre",
                    (like, like, like, like, like)
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM clients ORDER BY id").fetchall()
            return jsonify([client_to_dict(r, conn) for r in rows])
        finally:
            conn.close()

    # POST
    data = request.get_json()
    conn = get_db()
    try:
        new_id = next_id('CLI', 'clients')
        now = now_iso()
        conn.execute("""
            INSERT INTO clients (id, telefono, nombre, fuente, primer_contacto,
                ultimo_contacto, interacciones_totales, estado, segmento,
                linea_interes, lead_id, notas, contacto_nombre, email,
                tipo_documento, documento, direccion, ciudad, empresa, cargo,
                tipo_persona, nombre_comercial)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.get('notas', ''),
            data.get('contacto_nombre', ''),
            data.get('email', ''),
            data.get('tipo_documento', ''),
            data.get('documento', ''),
            data.get('direccion', ''),
            data.get('ciudad', ''),
            data.get('empresa', ''),
            data.get('cargo', ''),
            data.get('tipo_persona', 'natural'),
            data.get('nombre_comercial', '')
        ))
        conn.commit()

        row = conn.execute("SELECT * FROM clients WHERE id = ?", (new_id,)).fetchone()
        return jsonify(client_to_dict(row, conn)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_clients_bp.route('/api/clients/<client_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_client(client_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Cliente no encontrado'}), 404

        if request.method == 'GET':
            result = client_to_dict(row, conn)
            # Load work order details
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
            result['total_facturado'] = sum(
                (o.get('presupuesto') or 0) for o in result['ordenes_detalle']
            )
            result['saldo_pendiente_total'] = sum(
                (o.get('saldo_pendiente') or 0) for o in result['ordenes_detalle']
            )
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
            conn.execute(
                "UPDATE leads SET estado = 'nuevo' "
                "WHERE id IN (SELECT lead_id FROM clients WHERE id = ?) AND estado = 'cliente'",
                (client_id,)
            )
            conn.execute("DELETE FROM clients WHERE id = ?", (client_id,))
            conn.execute("DELETE FROM work_order_client_links WHERE client_id = ?", (client_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Cliente {client_id} eliminado'})

        # PUT
        data = request.get_json()
        updates = []
        params = []
        for key in ['nombre', 'telefono', 'fuente', 'estado', 'segmento', 'linea_interes',
                     'notas', 'lead_id', 'contacto_nombre', 'direccion', 'ciudad',
                     'tipo_documento', 'documento', 'empresa', 'cargo',
                     'cumpleanos', 'redes_contacto', 'email',
                     'tipo_persona', 'nombre_comercial']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        updates.append("ultimo_contacto = ?")
        params.append(now_iso())
        params.append(client_id)

        if updates:
            conn.execute(
                f"UPDATE clients SET {', '.join(updates)} WHERE id = ?", params
            )
            # Sync to linked lead
            sync_client_to_lead(conn, client_id, data)

        # Update linked orders if provided
        if 'ordenes' in data:
            conn.execute(
                "DELETE FROM work_order_client_links WHERE client_id = ?", (client_id,)
            )
            for wo_id in data['ordenes']:
                conn.execute(
                    "INSERT OR IGNORE INTO work_order_client_links (wo_id, client_id) VALUES (?, ?)",
                    (wo_id, client_id)
                )

        conn.commit()
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        return jsonify(client_to_dict(row, conn))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── Client Notes ──────────────────────────────────────────────────────

@api_clients_bp.route('/api/clients/<client_id>/notes', methods=['PUT'])
@login_required
def api_update_client_notes(client_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        data = request.get_json()
        conn.execute(
            "UPDATE clients SET notas = ? WHERE id = ?",
            (data.get('notas', ''), client_id)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── Client Orders ─────────────────────────────────────────────────────

@api_clients_bp.route('/api/clients/<client_id>/orders', methods=['GET'])
@login_required
def api_client_orders(client_id):
    conn = get_db()
    try:
        client = conn.execute(
            "SELECT * FROM clients WHERE id = ?", (client_id,)
        ).fetchone()
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


# ── Client Payments ───────────────────────────────────────────────────

@api_clients_bp.route('/api/clients/<client_id>/payments', methods=['GET'])
@login_required
def api_client_payments(client_id):
    conn = get_db()
    try:
        client = conn.execute(
            "SELECT * FROM clients WHERE id = ?", (client_id,)
        ).fetchone()
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