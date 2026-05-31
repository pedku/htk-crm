import logging
logger = logging.getLogger('app.routes.api_leads')
"""API Leads Blueprint — CRUD, conversion, pipeline, tags, interactions."""
import uuid
import json as json_lib
from flask import Blueprint, jsonify, request
from app.core.db import get_db, now_iso, now_col, next_id
from app.core.auth import login_required
from app.services.crm_service import sync_lead_to_client, convert_lead_to_client

api_leads_bp = Blueprint('api_leads', __name__)


# ── Helpers ──────────────────────────────────────────────────────────

def actividad_crear(lead_id, tipo, resumen, detalle=''):
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


# ── SEGMENTS CRUD ─────────────────────────────────────────────────

@api_leads_bp.route('/api/segments', methods=['GET'])
@login_required
def api_segments_get():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT key, label, color, orden, activo FROM segmentos ORDER BY orden"
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@api_leads_bp.route('/api/segments', methods=['POST'])
@login_required
def api_segments_create():
    data = request.get_json()
    key = data.get('key', '').strip().lower().replace(' ', '_')
    if not key:
        return jsonify({'error': 'Se requiere una clave para el segmento'}), 400
    conn = get_db()
    try:
        existing = conn.execute("SELECT key FROM segmentos WHERE key=?", (key,)).fetchone()
        if existing:
            return jsonify({'error': f'El segmento "{key}" ya existe'}), 409
        max_orden = conn.execute("SELECT MAX(orden) FROM segmentos").fetchone()[0] or 0
        conn.execute(
            "INSERT INTO segmentos (key, label, color, orden, activo) VALUES (?, ?, ?, ?, 1)",
            (key, data.get('label', key), data.get('color', '#6f42c1'), max_orden + 1)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM segmentos WHERE key=?", (key,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_leads_bp.route('/api/segments/<key>', methods=['PUT', 'DELETE'])
@login_required
def api_segments_item(key):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM segmentos WHERE key=?", (key,))
            conn.commit()
            return jsonify({'success': True})
        
        # PUT
        data = request.get_json()
        updates = []
        params = []
        for col in ['label', 'color', 'orden', 'activo']:
            if col in data:
                updates.append(f"{col} = ?")
                params.append(data[col])
        if updates:
            params.append(key)
            conn.execute(f"UPDATE segmentos SET {', '.join(updates)} WHERE key = ?", params)
            conn.commit()
        row = conn.execute("SELECT * FROM segmentos WHERE key=?", (key,)).fetchone()
        return jsonify(dict(row) if row else {})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── GET /api/etapas ──────────────────────────────────────────────────

@api_leads_bp.route('/api/etapas')
def api_etapas():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM etapas ORDER BY orden").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


# ── LEAD CRUD ────────────────────────────────────────────────────────

@api_leads_bp.route('/api/leads', methods=['GET', 'POST'])
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
                telefono, email, url, contacto_nombre, lid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.get('url', ''),
            data.get('contacto_nombre', ''),
            data.get('lid', '')
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_leads_bp.route('/api/leads/from-bot', methods=['POST'])
def api_leads_from_bot():
    """Endpoint sin auth para que el bot cree leads (solo localhost)."""
    # Verificar que la petición viene de localhost
    remote = request.remote_addr
    if remote not in ('127.0.0.1', 'localhost', '::1'):
        if request.headers.get('CF-Connecting-IP'):
            return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400

    conn = get_db()
    try:
        new_id = next_id('PRO', 'leads')
        
        # No guardar @lid como número de teléfono
        numero_raw = data.get('numero', '')
        telefono_val = ''
        contacto_val = ''
        if numero_raw and '@lid' not in numero_raw and '@c.us' in numero_raw:
            telefono_val = numero_raw.split('@')[0]
            contacto_val = telefono_val
        elif numero_raw and '@lid' not in numero_raw:
            telefono_val = numero_raw
            contacto_val = numero_raw
        # Si viene telefono explicito, usarlo
        if data.get('telefono'):
            tel_clean = data['telefono'].split('@')[0]
            if '@lid' not in tel_clean:
                telefono_val = tel_clean
                contacto_val = tel_clean
        
        conn.execute("""
            INSERT INTO leads (id, nombre, contacto, segmento, linea_interes, estado, fuente,
                valor_estimado, fecha_creacion, proximo_seguimiento, notas,
                telefono, email, url, contacto_nombre, lid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            data.get('nombre', ''),
            contacto_val,
            data.get('segmento', 'consumidor'),
            data.get('linea_interes', 'varios'),
            data.get('estado', 'nuevo'),
            data.get('fuente', 'WhatsApp'),
            data.get('valor_estimado'),
            data.get('fecha_creacion', now_iso()),
            data.get('proximo_seguimiento'),
            data.get('notas', data.get('detalle', '')),
            telefono_val,
            data.get('email', ''),
            data.get('url', ''),
            data.get('contacto_nombre', data.get('nombre', '')),
            data.get('lid', '')
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── (duplicado eliminado — el POST original ahora está arriba) ──
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
                telefono, email, url, contacto_nombre, lid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.get('url', ''),
            data.get('contacto_nombre', ''),
            data.get('lid', '')
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_leads_bp.route('/api/leads/<lead_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_lead(lead_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Lead no encontrado'}), 404

        if request.method == 'GET':
            result = dict(row)
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
            conn.execute("DELETE FROM clients WHERE lead_id = ?", (lead_id,))
            conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Lead {lead_id} eliminado'})

        # PUT
        data = request.get_json()
        updates = []
        params = []
        for key in ['nombre', 'contacto', 'contacto_nombre', 'segmento', 'linea_interes',
                     'estado', 'fuente', 'notas', 'valor_estimado', 'proximo_seguimiento',
                     'telefono', 'email', 'url', 'lid']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])

        if updates:
            params.append(lead_id)
            conn.execute(
                f"UPDATE leads SET {', '.join(updates)} WHERE id = ?", params
            )
            # Sync to linked client
            sync_lead_to_client(conn, lead_id, data)
            conn.commit()

        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── CONVERT LEAD TO CLIENT ───────────────────────────────────────────

@api_leads_bp.route('/api/leads/<lead_id>/convert', methods=['POST'])
@login_required
def api_convert_lead(lead_id):
    conn = get_db()
    try:
        lead = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead:
            return jsonify({'error': 'Lead no encontrado'}), 404

        new_id = convert_lead_to_client(conn, lead)
        conn.commit()

        row = conn.execute("SELECT * FROM clients WHERE id = ?", (new_id,)).fetchone()
        d = dict(row)
        # Add ordenes from link table
        linked = conn.execute(
            "SELECT wo_id FROM work_order_client_links WHERE client_id = ?", (d['id'],)
        ).fetchall()
        d['ordenes'] = [l['wo_id'] for l in linked]
        return jsonify(d), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── LEAD NOTES ────────────────────────────────────────────────────────

@api_leads_bp.route('/api/leads/<lead_id>/notes', methods=['PUT'])
@login_required
def api_update_lead_notes(lead_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Lead no encontrado'}), 404
        data = request.get_json()
        conn.execute(
            "UPDATE leads SET notas = ? WHERE id = ?",
            (data.get('notas', ''), lead_id)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── INTERACTIONS ──────────────────────────────────────────────────────

@api_leads_bp.route('/api/interactions', methods=['GET', 'POST'])
@login_required
def api_interactions():
    if request.method == 'GET':
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT i.*, l.telefono AS lead_telefono, l.nombre AS lead_nombre_2,
                       l.segmento AS lead_segmento, l.contacto AS lead_contacto,
                       l.contacto_nombre AS lead_contacto_nombre
                FROM interactions i
                LEFT JOIN leads l ON i.lead_id = l.id
                ORDER BY i.fecha DESC
            """).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                if not d.get('lead_nombre'):
                    d['lead_nombre'] = d.get('lead_nombre_2', '')
                result.append(d)
            return jsonify(result)
        finally:
            conn.close()

    # POST
    data = request.get_json()
    conn = get_db()
    try:
        new_id = next_id('INT', 'interactions')
        conn.execute("""
            INSERT INTO interactions (id, lead_id, lead_nombre, tipo, direccion, resumen,
                detalle, fecha, proximo_paso, estado)
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
        row = conn.execute(
            "SELECT * FROM interactions WHERE id = ?", (new_id,)
        ).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_leads_bp.route('/api/leads/<lead_id>/interactions', methods=['GET'])
@login_required
def api_lead_interactions(lead_id):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM interactions WHERE lead_id = ? ORDER BY fecha DESC",
            (lead_id,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@api_leads_bp.route('/api/leads/<lead_id>/interactions', methods=['POST'])
@login_required
def api_create_lead_interaction(lead_id):
    data = request.get_json()
    conn = get_db()
    try:
        lead = conn.execute(
            "SELECT * FROM leads WHERE id = ?", (lead_id,)
        ).fetchone()
        if not lead:
            return jsonify({'error': 'Lead no encontrado'}), 404
        short_id = str(uuid.uuid4()).split('-')[0]
        new_id = f"INT-{now_col().strftime('%Y%m%d-%H%M%S')}-{short_id}"
        conn.execute("""
            INSERT INTO interactions (id, lead_id, lead_nombre, tipo, direccion, resumen,
                detalle, fecha, proximo_paso, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, lead_id, lead['nombre'],
            data.get('tipo', 'manual'),
            data.get('direccion', 'saliente'),
            data.get('resumen', ''),
            data.get('detalle', ''),
            now_iso(),
            data.get('proximo_paso'),
            data.get('estado', 'pendiente')
        ))
        conn.commit()
        row = conn.execute(
            "SELECT * FROM interactions WHERE id = ?", (new_id,)
        ).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── PIPELINE / KANBAN ────────────────────────────────────────────────

@api_leads_bp.route('/api/pipeline')
def api_pipeline():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT clave, nombre, color, icono, probabilidad FROM etapas ORDER BY orden"
        ).fetchall()
        etapas = [dict(r) for r in rows]
        funnel = []
        for e in etapas:
            count = conn.execute(
                "SELECT COUNT(*) FROM leads WHERE estado = ?", (e['clave'],)
            ).fetchone()[0]
            total = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0] or 1
            funnel.append({
                **e, 'count': count,
                'pct': round(count / total * 100, 1)
            })
        return jsonify({'funnel': funnel, 'etapas': etapas})
    finally:
        conn.close()


@api_leads_bp.route('/api/leads/kanban')
def api_leads_kanban():
    conn = get_db()
    try:
        etapas = conn.execute(
            "SELECT clave, nombre, color FROM etapas ORDER BY orden"
        ).fetchall()
        kanban = {}
        for e in etapas:
            leads = conn.execute(
                "SELECT * FROM leads WHERE estado = ?", (e['clave'],)
            ).fetchall()
            kanban[e['clave']] = {
                'label': e['nombre'],
                'color': e['color'],
                'leads': [dict(l) for l in leads]
            }
        return jsonify(kanban)
    finally:
        conn.close()


@api_leads_bp.route('/api/leads/<lid>/etapa', methods=['PATCH'])
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


# ── TAGS ──────────────────────────────────────────────────────────────

@api_leads_bp.route('/api/tags', methods=['GET', 'POST'])
def api_tags():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            tid = None
            if data and data.get('nombre'):
                c = conn.execute(
                    "INSERT INTO tags (nombre, color) VALUES (?, ?)",
                    (data['nombre'], data.get('color', '#3b82f6'))
                )
                conn.commit()
                tid = c.lastrowid
            return jsonify({'ok': True, 'id': tid}), 201
        rows = conn.execute("SELECT * FROM tags ORDER BY nombre").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


# ── LEAD WEEK ─────────────────────────────────────────────────────────

@api_leads_bp.route('/api/lead-week')
def api_lead_week():
    from datetime import datetime, timedelta
    conn = get_db()
    try:
        days = []
        for i in range(6, -1, -1):
            d = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            count = conn.execute(
                "SELECT COUNT(*) FROM leads WHERE fecha_creacion LIKE ?",
                (d + '%',)
            ).fetchone()[0]
            days.append({
                'fecha': d,
                'count': count,
                'label': (datetime.now() - timedelta(days=i)).strftime('%a')
            })
        return jsonify(days)
    finally:
        conn.close()


# ── OPCIONES ──────────────────────────────────────────────────────────

@api_leads_bp.route('/api/opciones')
def api_opciones():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT DISTINCT linea_interes FROM leads "
            "WHERE linea_interes IS NOT NULL AND linea_interes != ''"
        ).fetchall()
        return jsonify([r['linea_interes'] for r in rows])
    finally:
        conn.close()


# ── EXPORT ────────────────────────────────────────────────────────────

@api_leads_bp.route('/api/export')
def api_export():
    import csv, io
    from flask import send_file
    from datetime import datetime
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM leads ORDER BY fecha_creacion DESC"
        ).fetchall()
        output = io.StringIO()
        writer = csv.writer(output)
        if rows:
            writer.writerow(rows[0].keys())
            for r in rows:
                writer.writerow(dict(r).values())
        output.seek(0)
        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f"leads_htk_{datetime.now().strftime('%Y%m%d')}.csv"
        )
    finally:
        conn.close()