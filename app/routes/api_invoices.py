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


def get_iva_default():
    """Get default IVA percentage from bot_config."""
    try:
        conn = get_db()
        row = conn.execute("SELECT value FROM bot_config WHERE key = 'iva_default'").fetchone()
        conn.close()
        return float(row['value']) if row else 19.0
    except:
        return 19.0


# ── IVA Config Endpoints ──────────────────────────────────────────

@api_invoices_bp.route('/api/config/iva')
@login_required
def get_iva_config():
    value = get_iva_default()
    return jsonify({'value': value})


@api_invoices_bp.route('/api/config/iva', methods=['POST'])
@login_required
def set_iva_config():
    data = request.get_json()
    if not data or 'value' not in data:
        return jsonify({'error': 'value requerido'}), 400
    try:
        val = float(data['value'])
        if val < 0 or val > 100:
            return jsonify({'error': 'El IVA debe estar entre 0 y 100'}), 400
        conn = get_db()
        existing = conn.execute("SELECT id FROM bot_config WHERE key = 'iva_default'").fetchone()
        if existing:
            conn.execute("UPDATE bot_config SET value = ? WHERE key = 'iva_default'", (str(val),))
        else:
            conn.execute("INSERT INTO bot_config (key, value, tipo, descripcion, categoria) VALUES ('iva_default', ?, 'float', 'IVA por defecto (%)', 'facturacion')", (str(val),))
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'value': val})
    except ValueError:
        return jsonify({'error': 'Valor inválido'}), 400


# ── LISTAR FACTURAS ──────────────────────────────────────────────────

@api_invoices_bp.route('/api/facturas')
@login_required
def list_invoices():
    conn = get_db()
    try:
        estado = request.args.get('estado')
        if estado == 'anulada':
            # Permitir ver anuladas explícitamente
            where = ['1=1']
            params = []
        else:
            where = ['activo = 1']
            params = []
        
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

        # Fetch linked payments (by invoice_id or by wo_id if invoice references a WO)
        linked = conn.execute(
            "SELECT * FROM payments WHERE invoice_id = ? ORDER BY fecha DESC",
            (inv_id,)
        ).fetchall()
        all_pay = [dict(p) for p in linked]
        # Also fetch legacy payments from the WO (unlinked)
        if inv['wo_id']:
            wo_rows = conn.execute(
                "SELECT * FROM payments WHERE wo_id = ? AND (invoice_id IS NULL OR invoice_id = '') ORDER BY fecha DESC",
                (inv['wo_id'],)
            ).fetchall()
            all_pay.extend(dict(p) for p in wo_rows)
        
        result = dict(inv)
        result['items'] = [dict(i) for i in items]
        result['cliente'] = dict(client) if client else None
        result['payments'] = all_pay
        total_abonado = sum(float(p['monto']) for p in all_pay)
        result['total_abonado_factura'] = round(total_abonado, 2)
        result['saldo_pendiente_factura'] = round(float(inv['total_general']) - total_abonado, 2)
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
            iva_pct = float(item.get('iva_porcentaje', get_iva_default()))
            iva_incluido = int(item.get('iva_incluido', 0))
            if iva_incluido:
                # IVA incluido en el precio: el precio ya trae IVA
                total_linea = round(cant * precio, 2)
                iva_linea = round(cant * precio * iva_pct / (100 + iva_pct), 2)
                item['total_linea'] = total_linea
                item['iva_total_linea'] = iva_linea
                sub_total += total_linea - iva_linea  # Base imponible (sin IVA)
                iva_total += iva_linea
            else:
                # IVA discriminado (default): total = precio * cant + IVA aparte
                item['total_linea'] = round(cant * precio * (1 + iva_pct / 100), 2)
                item['iva_total_linea'] = round(cant * precio * iva_pct / 100, 2)
                sub_total += cant * precio
                iva_total += item['iva_total_linea']

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
                    cantidad, precio_unitario, iva_porcentaje, iva_incluido, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (inv_id, i + 1, item['descripcion'],
                  float(item.get('cantidad', 1)), float(item.get('precio_unitario', 0)),
                  float(item.get('iva_porcentaje', get_iva_default())),
                  int(item.get('iva_incluido', 0)), item['total_linea']))

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
            iva_pct = float(item.get('iva_porcentaje', get_iva_default()))
            iva_incluido = int(item.get('iva_incluido', 0))
            if iva_incluido:
                # IVA incluido en el precio
                total_linea = round(cant * precio, 2)
                iva_linea = round(cant * precio * iva_pct / (100 + iva_pct), 2)
                item['total_linea'] = total_linea
                item['iva_total_linea'] = iva_linea
                sub_total += total_linea - iva_linea  # Base imponible (sin IVA)
                iva_total += iva_linea
            else:
                # IVA discriminado (default)
                item['total_linea'] = round(cant * precio * (1 + iva_pct / 100), 2)
                item['iva_total_linea'] = round(cant * precio * iva_pct / 100, 2)
                sub_total += cant * precio
                iva_total += item['iva_total_linea']

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
                    cantidad, precio_unitario, iva_porcentaje, iva_incluido, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (inv_id, i + 1, item['descripcion'],
                  float(item.get('cantidad', 1)), float(item.get('precio_unitario', 0)),
                  float(item.get('iva_porcentaje', get_iva_default())),
                  int(item.get('iva_incluido', 0)), item['total_linea']))

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
        conn.execute("UPDATE invoices SET estado = 'anulada', activo = 0, updated_at = ? WHERE id = ?",
                     (now_iso(), inv_id))
        conn.commit()
        return jsonify({'ok': True, 'estado': 'anulada'})
    finally:
        conn.close()

# ── ACCIONES ──────────────────────────────────────────────────────────

def _change_status(inv_id, new_estado, extra_updates=None):
    conn = None
    try:
        conn = get_db()
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return None, ('Factura no encontrada', 404)

        sql = "UPDATE invoices SET estado = ?, updated_at = ?"
        params = [new_estado, now_iso()]
        if new_estado == 'pagada':
            sql += ", pagada_fecha = ?"
            params.append(now_iso()[:10])
        if new_estado == 'anulada':
            sql += ", activo = 0"
        if extra_updates:
            for k, v in extra_updates.items():
                sql += f", {k} = ?"
                params.append(v)
        sql += " WHERE id = ?"
        params.append(inv_id)
        conn.execute(sql, params)
        conn.commit()
        return {'ok': True, 'estado': new_estado, 'id': inv_id}, None
    except Exception as e:
        if conn:
            conn.rollback()
        return None, (str(e), 500)
    finally:
        if conn:
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
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404
        
        # Calcular saldo pendiente: total - (abonos vinculados + abonos legacy de la OT)
        total = float(inv['total_general'])
        abonado_total = 0.0
        
        # 1. Abonos vinculados directamente a esta factura
        for p in conn.execute("SELECT monto FROM payments WHERE invoice_id = ?", (inv_id,)).fetchall():
            abonado_total += float(p['monto'])
        
        # 2. Abonos legacy de la OT (sin invoice_id) si la factura tiene OT
        wo_id = inv['wo_id']
        if wo_id:
            for p in conn.execute("SELECT monto FROM payments WHERE wo_id = ? AND (invoice_id IS NULL OR invoice_id = '')", (wo_id,)).fetchall():
                abonado_total += float(p['monto'])
        
        saldo_pendiente = round(max(0, total - abonado_total), 2)
        
        if saldo_pendiente > 0:
            pay_wo_id = wo_id or inv_id  # fallback si no hay OT
            try:
                conn.execute('''
                    INSERT INTO payments (wo_id, invoice_id, monto, tipo, metodo, referencia, fecha, registrado_por)
                    VALUES (?, ?, ?, 'pago', ?, ?, ?, 'Sistema')
                ''', (
                    pay_wo_id, inv_id, saldo_pendiente,
                    data.get('metodo_pago', ''),
                    data.get('referencia', ''), now_iso()[:10]
                ))
                conn.commit()
            except Exception:
                conn.rollback()
        
        result, err = _change_status(inv_id, 'pagada', {'metodo_pago': data.get('metodo_pago', '')})
        if err:
            return jsonify({'error': err[0]}), err[1]
        
        # 🔔 Auto-enviar factura pagada por WhatsApp
        try:
            import threading
            t = threading.Thread(target=_send_invoice_whatsapp_background, args=(inv_id,))
            t.daemon = True
            t.start()
        except Exception as notify_e:
            print(f"⚠️ Error enviando notificación de pago: {notify_e}")
        
        return jsonify(result)
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ── LINK PAYMENTS TO INVOICE ────────────────────────────────────────

@api_invoices_bp.route('/api/facturas/<inv_id>/payments', methods=['GET'])
@login_required
def get_invoice_payments(inv_id):
    """Get payments linked to an invoice."""
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404
        payments = conn.execute(
            "SELECT * FROM payments WHERE invoice_id = ? ORDER BY fecha DESC", (inv_id,)
        ).fetchall()
        return jsonify([dict(p) for p in payments])
    finally:
        conn.close()


@api_invoices_bp.route('/api/facturas/<inv_id>/payments', methods=['POST'])
@login_required
def link_payment_to_invoice(inv_id):
    """Link an existing payment to this invoice, or create a new one."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400
    
    conn = get_db()
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404
        
        payment_id = data.get('payment_id')
        if payment_id:
            # Link existing payment
            payment = conn.execute(
                "SELECT * FROM payments WHERE id = ?", (payment_id,)
            ).fetchone()
            if not payment:
                return jsonify({'error': 'Pago no encontrado'}), 404
            conn.execute(
                "UPDATE payments SET invoice_id = ? WHERE id = ?", (inv_id, payment_id)
            )
        else:
            # Create new payment linked to invoice
            monto = data.get('monto')
            if not monto or float(monto) <= 0:
                return jsonify({'error': 'Monto requerido'}), 400
            conn.execute('''
                INSERT INTO payments (wo_id, invoice_id, monto, tipo, metodo, referencia, fecha, registrado_por)
                VALUES (?, ?, ?, 'pago', ?, ?, ?, ?)
            ''', (
                inv['wo_id'] or '', inv_id, float(monto),
                data.get('metodo', ''), data.get('referencia', ''),
                data.get('fecha', now_iso()[:10]), data.get('registrado_por', 'Pedro')
            ))
        
        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_invoices_bp.route('/api/facturas/<inv_id>/payments/<int:payment_id>', methods=['DELETE'])
@login_required
def unlink_payment_from_invoice(inv_id, payment_id):
    """Unlink a payment from this invoice."""
    conn = get_db()
    try:
        payment = conn.execute(
            "SELECT * FROM payments WHERE id = ? AND invoice_id = ?", (payment_id, inv_id)
        ).fetchone()
        if not payment:
            return jsonify({'error': 'Pago no encontrado o no vinculado a esta factura'}), 404
        conn.execute(
            "UPDATE payments SET invoice_id = NULL WHERE id = ?", (payment_id,)
        )
        conn.commit()
        return jsonify({'ok': True, 'message': 'Pago desvinculado de la factura'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


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

        # Fetch payments
        linked = conn.execute(
            "SELECT * FROM payments WHERE invoice_id = ? ORDER BY fecha DESC",
            (inv_id,)
        ).fetchall()
        all_pay = [dict(p) for p in linked]
        if inv['wo_id']:
            wo_rows = conn.execute(
                "SELECT * FROM payments WHERE wo_id = ? AND (invoice_id IS NULL OR invoice_id = '') ORDER BY fecha DESC",
                (inv['wo_id'],)
            ).fetchall()
            all_pay.extend(dict(p) for p in wo_rows)
        total_abonado = sum(float(p['monto']) for p in all_pay)

        return render_template('pages/factura_template.html',
            invoice=dict(inv),
            items=[dict(i) for i in items],
            client=dict(client) if client else None,
            empresa=get_empresa_config(),
            payments=all_pay,
            total_abonado=round(total_abonado, 2))
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

        linked = conn.execute(
            "SELECT * FROM payments WHERE invoice_id = ? ORDER BY fecha DESC",
            (inv_id,)
        ).fetchall()
        all_pay = [dict(p) for p in linked]
        if inv['wo_id']:
            wo_rows = conn.execute(
                "SELECT * FROM payments WHERE wo_id = ? AND (invoice_id IS NULL OR invoice_id = '') ORDER BY fecha DESC",
                (inv['wo_id'],)
            ).fetchall()
            all_pay.extend(dict(p) for p in wo_rows)

        return render_template('pages/factura_template_print.html',
            invoice=dict(inv),
            items=[dict(i) for i in items],
            client=dict(client) if client else None,
            empresa=get_empresa_config(),
            payments=all_pay,
            total_abonado=round(sum(float(p['monto']) for p in all_pay), 2))
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

        total = inv.get('total_general', 0)
        caption = (
            f"⚡ *HTK INGENIERIA* — Factura {inv['numero']}\n\n"
            f"Cliente: {client.get('nombre', '—')}\n"
            f"Total: ${total:,.0f} COP\n"
            f"Vence: {inv['fecha_vencimiento']}\n\n"
            f"Gracias por confiar en nosotros ⚡"
        )

        # Generate PDF via puppeteer, then send via bot
        import subprocess, os
        BOT_DIR = '/home/peku/htk-whatsapp-bot'
        FACTURAS_DIR = os.path.join(BOT_DIR, 'facturas')
        pdf_path = os.path.join(FACTURAS_DIR, f'{inv_id}.pdf')
        
        import subprocess, os, json as py_json, urllib.request
        BOT_DIR = '/home/peku/htk-whatsapp-bot'
        pdf_path = os.path.join(BOT_DIR, 'facturas', f'{inv_id}.pdf')
        
        def send_via_bot(file_path, msg_caption):
            payload = py_json.dumps({'to': telefono, 'document': file_path, 'caption': msg_caption}).encode()
            req = urllib.request.Request(
                'http://localhost:18802/send-document',
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return py_json.loads(resp.read())
        
        def send_text_fallback():
            from app.services.bot_service import send_whatsapp as sw
            msg = (
                f"⚡ *HTK INGENIERIA* — Factura {inv['numero']}\n\n"
                f"Cliente: {client.get('nombre', '—')}\n"
                f"Total: ${total:,.0f} COP\n"
                f"Vence: {inv['fecha_vencimiento']}\n\n"
                f"Gracias por confiar en nosotros ⚡"
            )
            return sw(telefono, msg)
        
        # 1. Try generating PDF fresh
        pdf_ok = False
        if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) < 1000:
            try:
                result = subprocess.run(
                    ['node', 'pdf-gen.js', inv_id],
                    cwd=BOT_DIR, capture_output=True, timeout=45, text=True
                )
                pdf_ok = os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 1000
                if not pdf_ok:
                    print(f"PDF gen failed: {result.stderr[-200:] if result.stderr else 'no error'}")
            except Exception as e:
                print(f"PDF gen exception: {e}")
        else:
            pdf_ok = True
        
        # 2. Send PDF if available, else text fallback
        if pdf_ok:
            try:
                result = send_via_bot(pdf_path, caption)
                return jsonify({'ok': True, 'pdf': pdf_path, 'bot': result})
            except Exception as e:
                print(f"Bot send failed: {e}")
                # Fallback to text
                try:
                    result = send_text_fallback()
                    return jsonify({'ok': True, 'fallback': True, 'bot_result': result})
                except Exception as e2:
                    return jsonify({'ok': True, 'simulado': True, 'telefono': telefono,
                                   'nota': f'Bot no disponible: {e2}'})
        else:
            try:
                result = send_text_fallback()
                return jsonify({'ok': True, 'fallback': True, 'bot_result': result})
            except Exception as e2:
                return jsonify({'ok': True, 'simulado': True, 'telefono': telefono,
                               'nota': f'Bot no disponible: {e2}'})
    finally:
        conn.close()


def _send_invoice_whatsapp_background(inv_id):
    """Send invoice PDF via WhatsApp (background thread, no auth needed)."""
    import subprocess, os, urllib.request, json as py_json
    BOT_DIR = '/home/peku/htk-whatsapp-bot'
    pdf_path = os.path.join(BOT_DIR, 'facturas', f'{inv_id}.pdf')
    
    # Generate PDF if not exists
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) < 1000:
        try:
            subprocess.run(
                ['node', 'pdf-gen.js', inv_id],
                cwd=BOT_DIR, capture_output=True, timeout=45, text=True
            )
        except:
            pass
    
    # Send if PDF exists
    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 1000:
        conn2 = get_db()
        try:
            inv = conn2.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
            if inv:
                client = conn2.execute("SELECT * FROM clients WHERE id = ?", (inv['client_id'],)).fetchone()
                if client and client.get('telefono'):
                    telefono = str(client['telefono']).strip()
                    total = float(inv['total_general'])
                    caption = (
                        f"⚡ *HTK INGENIERIA* — Factura {inv['numero']} ✅ PAGADA\n\n"
                        f"Cliente: {client.get('nombre', '—')}\n"
                        f"Total pagado: ${total:,.0f} COP\n\n"
                        f"¡Gracias por tu pago! ⚡"
                    )
                    try:
                        payload = py_json.dumps({'to': telefono, 'document': pdf_path, 'caption': caption}).encode()
                        req = urllib.request.Request(
                            'http://localhost:18802/send-document',
                            data=payload, headers={'Content-Type': 'application/json'}, method='POST'
                        )
                        with urllib.request.urlopen(req, timeout=30) as resp:
                            print(f"✅ Factura {inv_id} enviada por pago")
                    except Exception as e:
                        print(f"⚠️ Error enviando factura pagada: {e}")
        finally:
            conn2.close()


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

        linked = conn.execute(
            "SELECT * FROM payments WHERE invoice_id = ? ORDER BY fecha DESC",
            (inv_id,)
        ).fetchall()
        all_pay = [dict(p) for p in linked]
        if inv['wo_id']:
            wo_rows = conn.execute(
                "SELECT * FROM payments WHERE wo_id = ? AND (invoice_id IS NULL OR invoice_id = '') ORDER BY fecha DESC",
                (inv['wo_id'],)
            ).fetchall()
            all_pay.extend(dict(p) for p in wo_rows)

        return render_template('pages/factura_template_print.html',
            invoice=dict(inv),
            items=[dict(i) for i in items],
            client=dict(client) if client else None,
            empresa=get_empresa_config(),
            payments=all_pay,
            total_abonado=round(sum(float(p['monto']) for p in all_pay), 2))
    finally:
        conn.close()
