"""API Work Orders Blueprint — CRUD, Kanban, status, payments, notifications, templates."""
import json
import re
import urllib.request
from datetime import datetime
from flask import Blueprint, jsonify, request
from app.core.db import get_db, now_iso, now_col, next_id
from app.core.wo_types import TIPOS_OT, get_estado_inicial
from app.core.auth import login_required
from app.services.wo_service import (
    wo_to_dict, export_work_orders_full,
    link_wo_to_client, update_wo_status
)

api_wo_bp = Blueprint('api_wo', __name__)


# ── GET /api/work_orders/tipos ────────────────────────────────────────

@api_wo_bp.route('/api/work_orders/tipos')
@login_required
def api_wo_tipos():
    # Return tipos with transition info for the frontend
    result = {}
    for key, info in TIPOS_OT.items():
        result[key] = {
            'label': info['label'],
            'icono': info['icono'],
            'color': info['color'],
            'estados': info['estados'],
            'campos': info['campos'],
            'transiciones': info.get('transiciones', {}),
        }
    return jsonify(result)


# ── WO CRUD ───────────────────────────────────────────────────────────

@api_wo_bp.route('/api/work_orders', methods=['GET', 'POST'])
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

        tipo = data.get('tipo', 'reparacion')
        if tipo not in TIPOS_OT:
            return jsonify({'error': f'Tipo de OT inválido: {tipo}'}), 400

        estado_inicial = get_estado_inicial(tipo)
        campos_extra = data.get('campos_extra', {})
        campos_extra_str = json.dumps(campos_extra, ensure_ascii=False) if campos_extra else '{}'

        desc_inicial_map = {
            'reparacion': 'Equipo recibido en taller.',
            'fabricacion': 'Solicitud de fabricación recibida.',
            'instalacion': 'Instalación agendada.'
        }

        conn.execute("""
            INSERT INTO work_orders (id, tipo, cliente_nombre, cliente_telefono,
                equipo_tipo, equipo_marca, equipo_modelo, falla_reportada,
                diagnostico, presupuesto, estado, notas_internas, activo,
                fecha_recibido, campos_extra, valor_total, client_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, tipo,
            cliente.get('nombre', ''), cliente.get('telefono', ''),
            equipo.get('tipo', 'otro'), equipo.get('marca', ''), equipo.get('modelo', ''),
            data.get('falla_reportada', ''), None,
            data.get('presupuesto'), estado_inicial,
            data.get('notas_internas', ''), 1, now, campos_extra_str,
            data.get('valor_total'), data.get('client_id')
        ))

        conn.execute("""
            INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
            VALUES (?, ?, ?, ?, ?)
        """, (
            new_id, now, estado_inicial,
            data.get('historial_desc', desc_inicial_map.get(tipo, 'Orden creada.')), 0
        ))

        conn.commit()
        link_wo_to_client(new_id, cliente.get('nombre', ''), cliente.get('telefono', ''))
        return jsonify(wo_to_dict(conn, new_id)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_wo_bp.route('/api/work_orders/<wo_id>', methods=['GET', 'PUT', 'DELETE'])
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
        for key in ['falla_reportada', 'diagnostico', 'presupuesto', 'notas_internas',
                     'activo', 'valor_total']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])

        if 'tipo' in data:
            if data['tipo'] not in TIPOS_OT:
                return jsonify({'error': f'Tipo de OT inválido: {data["tipo"]}'}), 400
            updates.append("tipo = ?")
            params.append(data['tipo'])
            # Reset estado to initial estado of new tipo
            nuevo_estado = get_estado_inicial(data['tipo'])
            updates.append("estado = ?")
            params.append(nuevo_estado)

        if 'client_id' in data:
            updates.append("client_id = ?")
            params.append(data['client_id'])

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
            conn.execute(
                f"UPDATE work_orders SET {', '.join(updates)} WHERE id = ?", params
            )
            conn.commit()

        return jsonify(wo_to_dict(conn, wo_id))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── KANBAN ────────────────────────────────────────────────────────────

@api_wo_bp.route('/api/work_orders/kanban')
@login_required
def api_wo_kanban():
    tipo = request.args.get('tipo')
    conn = get_db()
    try:
        # Build columnas
        if tipo and tipo in TIPOS_OT:
            t_info = TIPOS_OT[tipo]
            columnas = [
                {'estado': e, 'label': e.replace('_', ' ').title(),
                 'color': t_info['color'], 'icono': t_info.get('icono', '📋')}
                for e in t_info['estados']
            ]
        else:
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

        orders = export_work_orders_full(conn, tipo if tipo and tipo in TIPOS_OT else None)
        tarjetas = {col['estado']: [] for col in columnas}
        now = now_col()

        for o in orders:
            estado = o.get('estado', '')
            if estado not in tarjetas:
                continue

            pay_rows = conn.execute(
                "SELECT COALESCE(SUM(monto), 0) as total FROM payments WHERE wo_id = ?",
                (o['id'],)
            ).fetchone()
            total_abonado = float(pay_rows['total']) if pay_rows else 0.0
            presupuesto = float(o.get('presupuesto') or 0)
            saldo_pendiente = round(presupuesto - total_abonado, 2) if presupuesto else None
            pct_pagado = round((total_abonado / presupuesto) * 100, 1) if presupuesto > 0 else 0

            hist_row = conn.execute(
                "SELECT fecha FROM work_order_history WHERE wo_id = ? AND estado = ? ORDER BY id DESC LIMIT 1",
                (o['id'], estado)
            ).fetchone()
            dias = 0
            if hist_row and hist_row['fecha']:
                try:
                    entry_dt = datetime.fromisoformat(hist_row['fecha'])
                    if entry_dt.tzinfo:
                        dias = (now - entry_dt).days
                    else:
                        dias = (now.replace(tzinfo=None) - entry_dt).days
                except (ValueError, TypeError):
                    pass
            else:
                fecha_rec = o.get('fechas', {}).get('recibido')
                if fecha_rec:
                    try:
                        entry_dt = datetime.fromisoformat(fecha_rec)
                        if entry_dt.tzinfo:
                            dias = (now - entry_dt).days
                        else:
                            dias = (now.replace(tzinfo=None) - entry_dt).days
                    except (ValueError, TypeError):
                        pass

            equipo_desc = (
                o.get('equipo', {}).get('marca', '') + ' ' +
                o.get('equipo', {}).get('modelo', '')
            ).strip()
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


@api_wo_bp.route('/api/work_orders/<wo_id>/kanban', methods=['PATCH'])
@login_required
def api_wo_kanban_move(wo_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Orden no encontrada'}), 404

        data = request.get_json()
        new_status = data.get('estado')
        old_status = row['estado']
        wo_tipo = row['tipo'] or 'reparacion'

        success, error = update_wo_status(conn, wo_id, new_status, old_status, wo_tipo, {
            'descripcion': data.get('descripcion',
                                    f'Movido a {new_status.replace("_", " ").title()} vía Kanban'),
            'notificado': data.get('notificado'),
        })
        if not success:
            return jsonify({'error': error}), 400

        conn.commit()
        return jsonify(wo_to_dict(conn, wo_id))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── STATUS ────────────────────────────────────────────────────────────

@api_wo_bp.route('/api/work_orders/<wo_id>/status', methods=['PUT'])
@login_required
def api_wo_status(wo_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Orden no encontrada'}), 404

        data = request.get_json()
        new_status = data.get('estado')
        old_status = row['estado']
        wo_tipo = row['tipo'] or 'reparacion'

        force = data.get('force', False)
        if force:
            # Salta validación de transición — cambio directo desde el modal
            from app.core.wo_types import get_estado_inicial
            conn.execute("UPDATE work_orders SET estado = ? WHERE id = ?", (new_status, wo_id))
            if 'presupuesto' in data and data['presupuesto'] is not None:
                conn.execute("UPDATE work_orders SET presupuesto = ? WHERE id = ?",
                             (data['presupuesto'], wo_id))
            if 'diagnostico' in data and data['diagnostico']:
                conn.execute("UPDATE work_orders SET diagnostico = ? WHERE id = ?",
                             (data['diagnostico'], wo_id))
            conn.execute("""
                INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
                VALUES (?, ?, ?, ?, ?)
            """, (wo_id, now_iso(), new_status, data.get('descripcion',
                    f'Estado cambiado de {old_status} a {new_status} (manual)'), 0))
        else:
            success, error = update_wo_status(conn, wo_id, new_status, old_status, wo_tipo, {
                'descripcion': data.get('descripcion',
                                        f'Estado cambiado de {old_status} a {new_status}'),
                'presupuesto': data.get('presupuesto'),
                'diagnostico': data.get('diagnostico'),
                'notificado': data.get('notificado'),
            })
            if not success:
                return jsonify({'error': error}), 400

        conn.commit()
        return jsonify(wo_to_dict(conn, wo_id))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── PAYMENTS ──────────────────────────────────────────────────────────

@api_wo_bp.route('/api/work_orders/<wo_id>/payments', methods=['GET', 'POST'])
@login_required
def api_wo_payments(wo_id):
    conn = get_db()
    try:
        wo = conn.execute("SELECT id FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
        if not wo:
            return jsonify({'error': 'Orden no encontrada'}), 404

        if request.method == 'GET':
            rows = conn.execute(
                "SELECT * FROM payments WHERE wo_id = ? ORDER BY id", (wo_id,)
            ).fetchall()
            return jsonify([dict(r) for r in rows])

        # POST
        data = request.get_json()
        monto = data.get('monto')
        if not monto or float(monto) <= 0:
            return jsonify({'error': 'Monto requerido y debe ser > 0'}), 400

        conn.execute("""
            INSERT INTO payments (wo_id, monto, tipo, metodo, referencia, fecha, notas, registrado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            wo_id, float(monto),
            data.get('tipo', 'abono'), data.get('metodo', ''),
            data.get('referencia', ''), data.get('fecha', now_iso()),
            data.get('notas', ''), data.get('registrado_por', 'Pedro')
        ))
        conn.commit()

        row = conn.execute(
            "SELECT * FROM payments WHERE rowid = last_insert_rowid()"
        ).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_wo_bp.route(
    '/api/work_orders/<wo_id>/payments/<int:payment_id>', methods=['DELETE']
)
@login_required
def api_wo_payment(wo_id, payment_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM payments WHERE id = ? AND wo_id = ?", (payment_id, wo_id)
        ).fetchone()
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


# ── NOTIFICATIONS ─────────────────────────────────────────────────────

@api_wo_bp.route('/api/work_orders/<wo_id>/notify', methods=['POST'])
@login_required
def api_wo_notify(wo_id):
    conn = get_db()
    try:
        wo_row = conn.execute(
            "SELECT * FROM work_orders WHERE id = ?", (wo_id,)
        ).fetchone()
        if not wo_row:
            return jsonify({'ok': False, 'error': 'Orden no encontrada'}), 404

        wo = dict(wo_row)
        telefono = wo.get('cliente_telefono', '')
        if not telefono:
            if wo.get('client_id'):
                client_row = conn.execute(
                    "SELECT telefono FROM clients WHERE id = ?", (wo['client_id'],)
                ).fetchone()
                if client_row:
                    telefono = client_row['telefono'] or ''
        if not telefono:
            return jsonify({
                'ok': False,
                'error': 'No hay número de teléfono para el cliente'
            }), 400

        tipo_ot = wo.get('tipo', 'reparacion')
        estado = wo.get('estado', '')
        template = conn.execute(
            "SELECT * FROM wo_templates WHERE tipo_ot = ? AND estado_origen = ? AND activo = 1",
            (tipo_ot, estado)
        ).fetchone()
        if not template:
            template = conn.execute(
                "SELECT * FROM wo_templates WHERE tipo_ot = '*' AND estado_origen = ? AND activo = 1",
                (estado,)
            ).fetchone()
        if not template:
            return jsonify({
                'ok': False,
                'error': f'No hay plantilla activa para {tipo_ot}/{estado}'
            }), 400

        tmpl = dict(template)
        mensaje = tmpl['mensaje']

        try:
            campos_extra = json.loads(wo.get('campos_extra', '{}') or '{}')
        except (json.JSONDecodeError, TypeError):
            campos_extra = {}

        presupuesto = wo.get('presupuesto')
        presupuesto_str = f"{presupuesto:,.0f}".replace(',', '.') if presupuesto else '0'
        fecha_str = datetime.now(now_col().tzinfo).strftime('%d/%m/%Y')

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
            return jsonify({
                'ok': False, 'error': f'Bot WhatsApp no disponible: {str(e)}'
            }), 500

        # Register interaction
        lead_id = None
        lead_row = conn.execute(
            "SELECT lead_id FROM clients WHERE id = ?",
            (wo.get('client_id', ''),)
        ).fetchone()
        if lead_row:
            lead_id = lead_row['lead_id']

        if lead_id:
            conn.execute("""
                INSERT INTO interactions (lead_id, tipo, direccion, resumen, detalle, fecha, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                lead_id, 'whatsapp', 'saliente',
                f'Notificación OT {wo_id} ({estado})',
                mensaje[:200], now_iso(), 'completado'
            ))

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


# ── WO TEMPLATES ──────────────────────────────────────────────────────

@api_wo_bp.route('/api/wo-templates', methods=['GET', 'POST'])
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
                rows = conn.execute(
                    "SELECT * FROM wo_templates ORDER BY tipo_ot, estado_origen"
                ).fetchall()
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
            data.get('nombre'), data.get('tipo_ot', '*'),
            data.get('estado_origen', ''), data.get('asunto', ''),
            data.get('mensaje'), data.get('canal', 'whatsapp'),
            1 if data.get('activo', True) else 0
        ))
        conn.commit()
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute(
            "SELECT * FROM wo_templates WHERE id = ?", (new_id,)
        ).fetchone()
        d = dict(row)
        d['activo'] = bool(d.get('activo', 0))
        return jsonify(d), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_wo_bp.route('/api/wo-templates/<int:template_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_wo_template(template_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM wo_templates WHERE id = ?", (template_id,)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Plantilla no encontrada'}), 404

        if request.method == 'GET':
            d = dict(row)
            d['activo'] = bool(d.get('activo', 0))
            return jsonify(d)

        if request.method == 'DELETE':
            conn.execute("DELETE FROM wo_templates WHERE id = ?", (template_id,))
            conn.commit()
            return jsonify({
                'success': True, 'message': f'Plantilla {template_id} eliminada'
            })

        # PUT
        data = request.get_json()
        updates = []
        params = []
        for key in ['nombre', 'tipo_ot', 'estado_origen', 'asunto', 'mensaje', 'canal', 'activo']:
            if key in data:
                updates.append(f"{key} = ?")
                val = data[key]
                if key == 'activo':
                    val = 1 if val else 0
                params.append(val)
        if updates:
            params.append(template_id)
            conn.execute(
                f"UPDATE wo_templates SET {', '.join(updates)} WHERE id = ?", params
            )
            conn.commit()

        row = conn.execute(
            "SELECT * FROM wo_templates WHERE id = ?", (template_id,)
        ).fetchone()
        d = dict(row)
        d['activo'] = bool(d.get('activo', 0))
        return jsonify(d)
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()