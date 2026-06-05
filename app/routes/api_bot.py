import logging
logger = logging.getLogger('app.routes.api_bot')
"""API Bot Blueprint — Config, send-message, silence/unsilence, global on/off, status, log."""
import os
import json
import re
import urllib.request
from flask import Blueprint, jsonify, request, session, redirect, url_for
from app.core.db import get_db, now_iso
from app.core.auth import login_required
from app.services.bot_service import (
    cast_config_value, get_bot_config_flat,
    get_bot_config_verbose, reload_bot_config,
    send_whatsapp, bot_action, send_email
)

api_bot_bp = Blueprint('api_bot', __name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOT_LOG_PATH = '/home/peku/htk-whatsapp-bot/bot.log'
BOT_DIR = '/home/peku/htk-whatsapp-bot'


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


# ── BOT CONFIG ────────────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/config', methods=['GET', 'PUT'])
def api_bot_config():
    # Allow localhost/bot access without auth for GET, or authenticated users
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
    is_authenticated = 'user' in session
    
    if request.method == 'GET':
        if not is_local and not is_authenticated:
            return jsonify({'error': 'Unauthorized'}), 401
        if request.args.get('verbose') == '1':
            return jsonify(get_bot_config_verbose())
        return jsonify(get_bot_config_flat())

    if request.method == 'PUT':
        # Allow localhost PUT without auth for config
        if not is_authenticated and not is_local:
            return jsonify({'error': 'Unauthorized'}), 401
        # PUT: bulk update with type casting
        data = request.get_json()
        conn = get_db()
        try:
            updated = 0
            for key, value in data.items():
                row = conn.execute(
                    "SELECT key, tipo FROM bot_config WHERE key = ?", (key,)
                ).fetchone()
                if row:
                    tipo = row['tipo']
                    casted_value = cast_config_value(value, tipo)
                    # Store as string in SQLite (all config values are TEXT)
                    store_value = str(casted_value) if not isinstance(casted_value, str) else casted_value
                    if tipo == 'bool':
                        store_value = '1' if casted_value else '0'
                    elif tipo == 'int':
                        store_value = str(int(casted_value))
                    elif tipo == 'float':
                        store_value = str(float(casted_value))
                    else:
                        store_value = str(casted_value)
                    conn.execute(
                        "UPDATE bot_config SET value = ? WHERE key = ?",
                        (store_value, key)
                    )
                    updated += 1
            conn.commit()
            return jsonify({'ok': True, 'updated': updated})
        except Exception as e:
            conn.rollback()
            return jsonify({'error': str(e)}), 500
        finally:
            conn.close()


@api_bot_bp.route('/api/bot/config/categorias', methods=['GET'])
def api_bot_config_categorias():
    """Return config grouped by category for the UI."""
    from app.services.bot_service import get_bot_config_categorias
    return jsonify(get_bot_config_categorias())


@api_bot_bp.route('/api/bot/config/reload', methods=['POST'])
def api_bot_config_reload():
    # Allow localhost without auth
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1') and not request.headers.get('CF-Connecting-IP')
    if 'user' not in session and not is_local:
        return jsonify({'error': 'No autenticado'}), 401
    result = reload_bot_config()
    return jsonify(result)


# ── SEND MESSAGE ─────────────────────────────────────────────────────

@api_bot_bp.route('/api/send-message', methods=['POST'])
@login_required
def api_send_message():
    data = request.get_json()
    numero = data.get('numero')
    mensaje = data.get('mensaje')
    lead_id = data.get('lead_id')

    if not numero or not mensaje:
        return jsonify({'ok': False, 'error': 'numero y mensaje requeridos'}), 400

    result = send_whatsapp(numero, mensaje)
    if lead_id and result.get('ok'):
        actividad_crear(lead_id, 'whatsapp', 'WhatsApp enviado', mensaje[:150])
    return jsonify(result)


# ── SILENCE / UNSILENCE ───────────────────────────────────────────────

@api_bot_bp.route('/api/bot/silence', methods=['POST'])
@login_required
def api_bot_silence():
    data = request.get_json()
    numero = data.get('numero')
    if not numero:
        return jsonify({'ok': False, 'error': 'numero requerido'}), 400
    result = bot_action('silence', {'numero': re.sub(r'[^0-9]', '', numero)})
    return jsonify(result)


@api_bot_bp.route('/api/bot/unsilence', methods=['POST'])
@login_required
def api_bot_unsilence():
    data = request.get_json()
    numero = data.get('numero')
    if not numero:
        return jsonify({'ok': False, 'error': 'numero requerido'}), 400
    result = bot_action('unsilence', {'numero': re.sub(r'[^0-9]', '', numero)})
    return jsonify(result)


# ── GLOBAL ON / OFF ───────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/global-off', methods=['POST'])
def api_bot_global_off():
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1') and not request.headers.get('CF-Connecting-IP')
    if 'user' not in session and not is_local:
        return jsonify({'error': 'No autenticado'}), 401
    result = bot_action('global-off')
    return jsonify(result)


@api_bot_bp.route('/api/bot/global-on', methods=['POST'])
def api_bot_global_on():
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1') and not request.headers.get('CF-Connecting-IP')
    if 'user' not in session and not is_local:
        return jsonify({'error': 'No autenticado'}), 401
    result = bot_action('global-on')
    return jsonify(result)


# ── BOT STATUS ────────────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/status')
def api_bot_status():
    """Bot status with auth handling for localhost."""
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1') and not request.headers.get('CF-Connecting-IP')
    is_auth = 'user' in session
    if not is_local and not is_auth:
        return jsonify({'ok': False, 'error': 'No autenticado', 'status': 'auth_required'}), 401
    result = bot_action('status')
    if result.get('ok'):
        result['connected'] = result.get('connected', False)
    return jsonify(result)


# ── BOT RESTART ──────────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/restart', methods=['POST'])
@login_required
def api_bot_restart():
    """Restart WhatsApp bot via systemd user service."""
    import subprocess, time
    try:
        subprocess.run(['systemctl', '--user', 'stop', 'htk-whatsapp-bot'],
                      capture_output=True, timeout=5)
        subprocess.run(['pkill', '-f', 'node.*bot\\.js'], capture_output=True, timeout=5)
        time.sleep(2)
        r = subprocess.run(['systemctl', '--user', 'restart', 'htk-whatsapp-bot'],
                          capture_output=True, text=True, timeout=15)
        if r.returncode == 0:
            return jsonify({'ok': True, 'message': 'Bot reiniciado correctamente'})
        return jsonify({'ok': True, 'message': 'Bot reiniciado (fallback)', 'stderr': r.stderr[:200]})
    except subprocess.TimeoutExpired:
        return jsonify({'ok': False, 'error': 'Timeout al reiniciar'}), 500
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── BOT LOG ───────────────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/log')
@login_required
def api_bot_log():
    log_path = BOT_LOG_PATH
    try:
        if os.path.exists(log_path):
            with open(log_path, 'rb') as f:
                # Read last 200 lines (log can be huge — 50MB+)
                f.seek(0, 2)
                size = f.tell()
                if size > 100000:
                    f.seek(size - 100000)
                    chunk = f.read(100000).decode('utf-8', errors='replace')
                    lines = chunk.split('\n')
                    last = lines[-200:]
                else:
                    f.seek(0)
                    last = f.read().decode('utf-8', errors='replace').split('\n')[-200:]
            return jsonify({'log': '\n'.join(last), 'ok': True})
        return jsonify({'log': '', 'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── BOT START / STOP ─────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/start', methods=['POST'])
@login_required
def api_bot_start():
    """Start WhatsApp bot via systemd user service."""
    import subprocess
    try:
        r = subprocess.run(['systemctl', '--user', 'start', 'htk-whatsapp-bot'],
                          capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return jsonify({'ok': True, 'message': 'Bot iniciado correctamente'})
        return jsonify({'ok': False, 'error': r.stderr[:300]}), 500
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bot_bp.route('/api/send-pending', methods=['POST'])
@login_required
def api_send_pending():
    """Send a single pending interaction via WhatsApp."""
    data = request.get_json()
    interaction_id = data.get('interaction_id')
    if not interaction_id:
        return jsonify({'ok': False, 'error': 'interaction_id requerido'}), 400
    
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT i.*, l.telefono, l.nombre AS lead_nombre
            FROM interactions i
            LEFT JOIN leads l ON i.lead_id = l.id
            WHERE i.id = ?
        """, (interaction_id,)).fetchone()
        if not row:
            return jsonify({'ok': False, 'error': 'Interacción no encontrada'}), 404
        
        telefono = row['telefono'] or ''
        # Extract phone from contacto if telefono is empty
        if not telefono:
            import re
            tm = re.search(r'3\d{9}', row['lead_contacto'] or '')
            if tm:
                telefono = tm.group()
        if not telefono:
            # Try to extract any 10+ digit number from contacto
            tm = re.search(r'(\d{10,13})', row['lead_contacto'] or '')
            if tm:
                telefono = tm.group(1)
        
        if not telefono:
            return jsonify({'ok': False, 'error': 'El lead no tiene teléfono'}), 400
        
        mensaje = row['detalle'] or ''
        if not mensaje:
            return jsonify({'ok': False, 'error': 'La interacción no tiene contenido'}), 400
        
        # Send
        result = send_whatsapp(telefono, mensaje)
        
        if result.get('ok'):
            # Update interaction status
            conn.execute(
                "UPDATE interactions SET estado = 'enviado', proximo_paso = 'Esperar respuesta' WHERE id = ?",
                (interaction_id,)
            )
            # Update lead estado: nuevo -> contactado
            conn.execute(
                "UPDATE leads SET estado = 'contactado', proximo_seguimiento = date('now','+2 days') WHERE id = ? AND estado = 'nuevo'",
                (row['lead_id'],)
            )
            conn.commit()
        
        return jsonify({
            'ok': result.get('ok', False),
            'to': telefono,
            'lead': row['lead_nombre'],
            'error': result.get('error'),
            'interaction_id': interaction_id
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    finally:
        conn.close()


@api_bot_bp.route('/api/send-campaign', methods=['POST'])
@login_required
def api_send_campaign():
    """Send ALL pending WhatsApp interactions. Returns results per lead."""
    conn = get_db()
    try:
        # Get all pending WhatsApp interactions with lead data
        rows = conn.execute("""
            SELECT i.id AS int_id, i.detalle, i.lead_id, l.telefono, l.nombre, l.contacto
            FROM interactions i
            LEFT JOIN leads l ON i.lead_id = l.id
            WHERE (i.estado = 'pendiente' OR i.estado IS NULL OR i.estado = '')
              AND (i.tipo = 'whatsapp' OR i.tipo = 'WhatsApp')
              AND i.direccion IN ('saliente', 'pendiente')
              AND l.telefono IS NOT NULL AND l.telefono != ''
            ORDER BY l.nombre
        """).fetchall()
        
        if not rows:
            return jsonify({'ok': False, 'error': 'No hay interacciones pendientes con teléfono'})
        
        results = []
        sent_count = 0
        skip_count = 0
        
        for r in rows:
            telefono = r['telefono'] or ''
            if not telefono:
                import re
                tm = re.search(r'3\d{9}', r['contacto'] or '')
                if tm:
                    telefono = tm.group()
            
            if not telefono:
                results.append({
                    'lead': r['nombre'],
                    'ok': False,
                    'error': 'Sin teléfono'
                })
                skip_count += 1
                continue
            
            mensaje = r['detalle'] or ''
            if not mensaje:
                results.append({
                    'lead': r['nombre'],
                    'ok': False,
                    'error': 'Sin contenido'
                })
                skip_count += 1
                continue
            
            result = send_whatsapp(telefono, mensaje)
            if result.get('ok'):
                conn.execute(
                    "UPDATE interactions SET estado = 'enviado', proximo_paso = 'Esperar respuesta' WHERE id = ?",
                    (r['int_id'],)
                )
                # Update lead estado: nuevo -> contactado
                conn.execute(
                    "UPDATE leads SET estado = 'contactado', proximo_seguimiento = date('now','+2 days') WHERE id = ? AND estado = 'nuevo'",
                    (r['lead_id'],)
                )
                sent_count += 1
            else:
                skip_count += 1
            
            results.append({
                'lead': r['nombre'],
                'to': telefono,
                'ok': result.get('ok', False),
                'error': result.get('error')
            })
        
        conn.commit()
        return jsonify({
            'ok': True,
            'total': len(rows),
            'sent': sent_count,
            'skipped': skip_count,
            'results': results
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    finally:
        conn.close()


@api_bot_bp.route('/api/bot/stop', methods=['POST'])
@login_required
def api_bot_stop():
    """Stop WhatsApp bot via systemd user service."""
    import subprocess
    try:
        r = subprocess.run(['systemctl', '--user', 'stop', 'htk-whatsapp-bot'],
                          capture_output=True, text=True, timeout=10)
        subprocess.run(['pkill', '-f', 'node.*bot\\.js'], capture_output=True, timeout=5)
        return jsonify({'ok': True, 'message': 'Bot detenido'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── BOT QR ────────────────────────────────────────────────────────────
import subprocess, time as _time_module
NODE_BIN = '/home/peku/.config/nvm/versions/node/v24.15.0/bin/node'

@api_bot_bp.route('/api/bot/qr')
def api_bot_qr():
    """Return QR image from bot (local non-Docker setup)."""
    # Paths to check in order
    possible_paths = [
        os.path.join(BOT_DIR, 'qr-code.png'),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'img', 'bot_qr.png'),
    ]
    
    try:
        import shutil
        # Try to copy fresh QR from bot (handles local nohup setup)
        src = os.path.join(BOT_DIR, 'qr-code.png')
        if os.path.exists(src) and os.path.getsize(src) > 100:
            from flask import send_file
            resp = send_file(src, mimetype='image/png')
            resp.headers['Cache-Control'] = 'no-cache'
            resp.headers['Pragma'] = 'no-cache'
            resp.headers['Expires'] = '0'
            return resp
        
        # Fallback to other paths
        for p in possible_paths:
            if os.path.exists(p) and os.path.getsize(p) > 100:
                from flask import send_file
                resp = send_file(p, mimetype='image/png')
                resp.headers['Cache-Control'] = 'no-cache' 
                resp.headers['Pragma'] = 'no-cache'
                resp.headers['Expires'] = '0'
                return resp
        
        return jsonify({'ok': False, 'error': 'QR no generado aún'}), 202
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bot_bp.route('/api/bot/qr-status')
def api_bot_qr_status():
    """Check QR auth status."""
    status_path = os.path.join(BOT_DIR, 'qr-status.json')
    if os.path.exists(status_path):
        with open(status_path) as f:
            return jsonify(json.load(f))
    return jsonify({'status': 'unknown'})


# ── LID STATS ─────────────────────────────────────────────────────────

@api_bot_bp.route('/api/lid/stats')
@login_required
def api_lid_stats():
    conn = get_db()
    try:
        total = conn.execute(
            "SELECT COUNT(*) FROM interactions WHERE direccion='recibido'"
        ).fetchone()[0]
        total_lid = conn.execute("SELECT COUNT(*) FROM lid_mappings").fetchone()[0]
        return jsonify({
            'ok': True,
            'total_interactions': total,
            'lid_mappings': total_lid
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    finally:
        conn.close()

# ── SEND EMAIL ───────────────────────────────────────────────────────

@api_bot_bp.route('/api/send-email', methods=['POST'])
def api_send_email():
    # Allow localhost without auth (for internal tools)
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
    if 'user' not in session and not is_local:
        return jsonify({'error': 'No autenticado'}), 401
    data = request.get_json()
    to = data.get('to')
    subject = data.get('subject')
    body = data.get('body')
    lead_id = data.get('lead_id')
    html = data.get('html', False)
    attachments = data.get('attachments')  # [{'path': '...', 'name': '...'}, ...]
    
    if not to or not subject or not body:
        return jsonify({'ok': False, 'error': 'to, subject y body requeridos'}), 400
    
    result = send_email(to, subject, body, html, attachments)
    if lead_id and result.get('ok'):
        actividad_crear(lead_id, 'email', 'Email enviado: ' + subject, body[:150])
    return jsonify(result)
