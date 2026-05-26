"""API Invoices Blueprint — Facturación CRUD + acciones."""
import os
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, render_template
from app.core.db import get_db, now_iso, next_invoice_num
from app.core.auth import login_required

api_invoices_bp = Blueprint('api_invoices', __name__)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

EMPRESA_DEFAULTS = {
    'nombre': 'HOUSETRONIK INGENIERÍA Y AUTOMATIZACIÓN INTELIGENTE S.A.S',
    'comercial': 'HTK INGENIERIA',
    'nit': '1.124.361.169-2',
    'direccion': 'Cra 7b #46-108, Barranquilla, Colombia',
    'telefono': '+57 315 603 2940',
    'email': 'info@htk-ingenieria.com',
    'logo_url': '/static/img/logo_htk.png'
}

def get_empresa_config():
    """Read company config from DB, fall back to defaults."""
    config = dict(EMPRESA_DEFAULTS)
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT key, value FROM bot_config WHERE key LIKE 'company_%'"
        ).fetchall()
        for r in rows:
            key = r['key'].replace('company_', '')
            if key in config and r['value']:
                config[key] = r['value']
        conn.close()
    except:
        pass
    return config

# ── LISTAR FACTURAS ──────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas')
@login_required
def list_invoices():
    conn = get_db()
    try:
        where = ['activo = 1']
        params = []

        estado = request.args.get('estado')
        if estado:
            where.append('estado = ?')
            params.append(estado)

        cliente_id = request.args.get('cliente_id')
        if cliente_id:
            where.append('client_id = ?')
            params.append(cliente_id)

        desde = request.args.get('fecha_desde')
        if desde:
            where.append('date(fecha_emision) >= ?')
            params.append(desde)

        hasta = request.args.get('fecha_hasta')
        if hasta:
            where.append('date(fecha_emision) <= ?')
            params.append(hasta)

        sql = f"SELECT * FROM invoices WHERE {' AND '.join(where)} ORDER BY created_at DESC"
        rows = conn.execute(sql, params).fetchall()
        invoices = [dict(r) for r in rows]

        # Enrich with client names
        for inv in invoices:
            client = conn.execute("SELECT nombre, telefono FROM clients WHERE id = ?",
                                  (inv['client_id'],)).fetchone()
            inv['cliente_nombre'] = client['nombre'] if client else '—'
            inv['cliente_telefono'] = client['telefono'] if client else '—'

        return jsonify(invoices)
    finally:
        conn.close()

# ── STATS ─────────────────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas/stats')
@login_required
def invoice_stats():
    conn = get_db()
    try:
        pendientes = conn.execute('''
            SELECT COUNT(*) FROM invoices
            WHERE estado = 'emitida' AND activo = 1
            AND date(fecha_vencimiento) >= date('now')
        ''').fetchone()[0]

        vencidas = conn.execute('''
            SELECT COUNT(*) FROM invoices
            WHERE estado = 'emitida' AND activo = 1
            AND date(fecha_vencimiento) < date('now')
        ''').fetchone()[0]

        total_mes = conn.execute('''
            SELECT COALESCE(SUM(total_general), 0) FROM invoices
            WHERE estado IN ('emitida', 'pagada') AND activo = 1
            AND strftime('%Y-%m', fecha_emision) = strftime('%Y-%m', 'now')
        ''').fetchone()[0]

        total_pagadas = conn.execute(
            "SELECT COUNT(*) FROM invoices WHERE estado = 'pagada' AND activo = 1"
        ).fetchone()[0]

        return jsonify({
            'pendientes': pendientes,
            'vencidas': vencidas,
            'total_mes': total_mes,
            'total_pagadas': total_pagadas
        })
    finally:
        conn.close()

# ── DETALLE ───────────────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas/<inv_id>')
@login_required
def get_invoice(inv_id):
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404

        items = conn.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_num",
            (inv_id,)
        ).fetchall()

        client = conn.execute("SELECT * FROM clients WHERE id = ?",
                              (inv['client_id'],)).fetchone()

        result = dict(inv)
        result['items'] = [dict(i) for i in items]
        result['cliente'] = dict(client) if client else None
        return jsonify(result)
    finally:
        conn.close()

# ── CREAR ─────────────────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas', methods=['POST'])
@login_required
def create_invoice():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    client_id = data.get('client_id')
    if not client_id:
        return jsonify({'error': 'client_id requerido'}), 400

    conn = get_db()
    try:
        numero = next_invoice_num()
        now = now_iso()
        inv_id = f"INV-{numero}"

        items = data.get('items', [])
        sub_total = 0.0
        iva_total = 0.0

        for item in items:
            cant = float(item.get('cantidad', 0))
            precio = float(item.get('precio_unitario', 0))
            iva_pct = float(item.get('iva_porcentaje', 19))
            item['total_linea'] = round(cant * precio * (1 + iva_pct / 100), 2)
            sub_total += cant * precio
            iva_total += cant * precio * iva_pct / 100

        descuento = float(data.get('descuento', 0))
        total_general = round(sub_total + iva_total - descuento, 2)
        fecha_venc = data.get('fecha_vencimiento', now[:10])

        conn.execute('''
            INSERT INTO invoices (id, client_id, wo_id, numero, estado,
                fecha_emision, fecha_vencimiento, sub_total, descuento,
                iva_total, total_general, notas, terminos, metodo_pago, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'borrador', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (inv_id, client_id, data.get('wo_id'), numero,
              now, fecha_venc,
              round(sub_total, 2), descuento, round(iva_total, 2), total_general,
              data.get('notas', ''), data.get('terminos', ''), data.get('metodo_pago', ''),
              now, now))

        for i, item in enumerate(items):
            conn.execute('''
                INSERT INTO invoice_items (invoice_id, item_num, descripcion,
                    cantidad, precio_unitario, iva_porcentaje, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (inv_id, i + 1, item['descripcion'],
                  float(item.get('cantidad', 1)), float(item.get('precio_unitario', 0)),
                  float(item.get('iva_porcentaje', 19)), item['total_linea']))

        conn.commit()
        return jsonify({'id': inv_id, 'numero': numero, 'total_general': total_general}), 201
    finally:
        conn.close()

# ── EDITAR ────────────────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas/<inv_id>', methods=['PUT'])
@login_required
def update_invoice(inv_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404
        if inv['estado'] != 'borrador':
            return jsonify({'error': 'Solo se pueden editar facturas en borrador'}), 400

        items = data.get('items', [])
        sub_total = 0.0
        iva_total = 0.0

        for item in items:
            cant = float(item.get('cantidad', 0))
            precio = float(item.get('precio_unitario', 0))
            iva_pct = float(item.get('iva_porcentaje', 19))
            item['total_linea'] = round(cant * precio * (1 + iva_pct / 100), 2)
            sub_total += cant * precio
            iva_total += cant * precio * iva_pct / 100

        descuento = float(data.get('descuento', 0))
        total_general = round(sub_total + iva_total - descuento, 2)
        now = now_iso()

        conn.execute('''
            UPDATE invoices SET client_id=?, wo_id=?, fecha_emision=?, fecha_vencimiento=?,
                sub_total=?, descuento=?, iva_total=?, total_general=?,
                notas=?, terminos=?, metodo_pago=?, updated_at=?
            WHERE id=?
        ''', (data.get('client_id', inv['client_id']),
              data.get('wo_id', inv['wo_id']),
              data.get('fecha_emision', inv['fecha_emision']),
              data.get('fecha_vencimiento', inv['fecha_vencimiento']),
              round(sub_total, 2), descuento, round(iva_total, 2), total_general,
              data.get('notas', inv['notas']),
              data.get('terminos', inv['terminos']),
              data.get('metodo_pago', inv['metodo_pago']),
              now, inv_id))

        # Replace items
        conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?", (inv_id,))
        for i, item in enumerate(items):
            conn.execute('''
                INSERT INTO invoice_items (invoice_id, item_num, descripcion,
                    cantidad, precio_unitario, iva_porcentaje, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (inv_id, i + 1, item['descripcion'],
                  float(item.get('cantidad', 1)), float(item.get('precio_unitario', 0)),
                  float(item.get('iva_porcentaje', 19)), item['total_linea']))

        conn.commit()
        return jsonify({'ok': True, 'total_general': total_general})
    finally:
        conn.close()

# ── ELIMINAR / ANULAR ────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas/<inv_id>', methods=['DELETE'])
@login_required
def delete_invoice(inv_id):
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404
        conn.execute("UPDATE invoices SET estado = 'anulada', updated_at = ? WHERE id = ?",
                     (now_iso(), inv_id))
        conn.commit()
        return jsonify({'ok': True, 'estado': 'anulada'})
    finally:
        conn.close()

# ── ACCIONES ──────────────────────────────────────────────────────────

def _change_status(inv_id, new_estado, extra_updates=None):
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return None, ('Factura no encontrada', 404)

        sql = "UPDATE invoices SET estado = ?, updated_at = ?"
        params = [new_estado, now_iso()]
        if new_estado == 'pagada':
            sql += ", pagada_fecha = ?"
            params.append(now_iso()[:10])
        if extra_updates:
            for k, v in extra_updates.items():
                sql += f", {k} = ?"
                params.append(v)
        sql += " WHERE id = ?"
        params.append(inv_id)
        conn.execute(sql, params)
        conn.commit()
        return {'ok': True, 'estado': new_estado, 'id': inv_id}, None
    finally:
        conn.close()

@api_invoices_bp.route('/api/facturas/<inv_id>/emitir', methods=['POST'])
@login_required
def emitir_factura(inv_id):
    result, err = _change_status(inv_id, 'emitida')
    if err:
        return jsonify({'error': err[0]}), err[1]
    return jsonify(result)

@api_invoices_bp.route('/api/facturas/<inv_id>/pagar', methods=['POST'])
@login_required
def pagar_factura(inv_id):
    data = request.get_json() or {}
    result, err = _change_status(inv_id, 'pagada', {'metodo_pago': data.get('metodo_pago', '')})
    if err:
        return jsonify({'error': err[0]}), err[1]
    return jsonify(result)

@api_invoices_bp.route('/api/facturas/<inv_id>/anular', methods=['POST'])
@login_required
def anular_factura(inv_id):
    result, err = _change_status(inv_id, 'anulada')
    if err:
        return jsonify({'error': err[0]}), err[1]
    return jsonify(result)

# ── PDF / VISTA PREVIA ────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas/<inv_id>/pdf')
@login_required
def invoice_pdf(inv_id):
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return '<p style="text-align:center;padding:40px;color:#999;">Factura no encontrada</p>', 404

        items = conn.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_num",
            (inv_id,)
        ).fetchall()

        client = conn.execute("SELECT * FROM clients WHERE id = ?",
                              (inv['client_id'],)).fetchone()

        return render_template('pages/factura_template.html',
            invoice=dict(inv),
            items=[dict(i) for i in items],
            client=dict(client) if client else None,
            empresa=get_empresa_config())
    finally:
        conn.close()

# ── PLANTILLA DE IMPRESIÓN (tablas HTML puras) ────────────────────────

@api_invoices_bp.route('/api/facturas/<inv_id>/print')
@login_required
def invoice_print(inv_id):
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return '<p>Factura no encontrada</p>', 404

        items = conn.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_num",
            (inv_id,)
        ).fetchall()

        client = conn.execute("SELECT * FROM clients WHERE id = ?",
                              (inv['client_id'],)).fetchone()

        return render_template('pages/factura_template_print.html',
            invoice=dict(inv),
            items=[dict(i) for i in items],
            client=dict(client) if client else None,
            empresa=get_empresa_config())
    finally:
        conn.close()

@api_invoices_bp.route('/api/facturas/<inv_id>/enviar-whatsapp', methods=['POST'])
@login_required
def send_invoice_whatsapp(inv_id):
    conn = get_db()
    try:
        inv = dict(conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone())
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404

        client = dict(conn.execute("SELECT * FROM clients WHERE id = ?",
                                    (inv['client_id'],)).fetchone())
        if not client:
            return jsonify({'error': 'Cliente no encontrado'}), 404

        telefono = client.get('telefono', '').strip()
        if not telefono:
            return jsonify({'error': 'Cliente sin teléfono'}), 400

        # Build message
        total = inv.get('total_general', 0)
        mensaje = (
            f"⚡ *HTK INGENIERIA* — Factura {inv['numero']}\n\n"
            f"Cliente: {client.get('nombre', '—')}\n"
            f"Total: ${total:,.0f} COP\n"
            f"Vence: {inv['fecha_vencimiento']}\n\n"
            f"Puedes ver tu factura aquí:\n"
            f"http://localhost:5000/factura/{inv['id']}\n\n"
            f"Gracias por confiar en nosotros ⚡"
        )

        # Try to use bot service
        try:
            from app.services.bot_service import send_whatsapp
            result = send_whatsapp(telefono, mensaje)
            return jsonify({'ok': True, 'bot_result': result})
        except Exception as e:
            return jsonify({'ok': True, 'simulado': True, 'telefono': telefono,
                           'mensaje': mensaje, 'nota': f'Bot no disponible: {e}'})
    finally:
        conn.close()

# ── RUTA PÚBLICA DE VISTA DE FACTURA ─────────────────────────────────

@api_invoices_bp.route('/factura/<inv_id>')
def public_factura_view(inv_id):
    """Public view of invoice (no auth) for WhatsApp links."""
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return '<h1>Factura no encontrada</h1>', 404

        items = conn.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_num",
            (inv_id,)
        ).fetchall()

        client = conn.execute("SELECT * FROM clients WHERE id = ?",
                              (inv['client_id'],)).fetchone()

        return render_template('pages/factura_template_print.html',
            invoice=dict(inv),
            items=[dict(i) for i in items],
            client=dict(client) if client else None,
            empresa=get_empresa_config())
    finally:
        conn.close()
