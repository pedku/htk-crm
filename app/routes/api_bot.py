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
    send_whatsapp, bot_action
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
        if not is_authenticated:
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


@api_bot_bp.route('/api/bot/config/reload', methods=['POST'])
@login_required
def api_bot_config_reload():
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
@login_required
def api_bot_global_off():
    result = bot_action('global-off')
    return jsonify(result)


@api_bot_bp.route('/api/bot/global-on', methods=['POST'])
@login_required
def api_bot_global_on():
    result = bot_action('global-on')
    return jsonify(result)


# ── BOT STATUS ────────────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/status')
def api_bot_status():
    """Bot status with auth handling for localhost."""
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
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
    """QR login: stop bot, restart it, wait for QR, return image."""
    qr_path = os.path.join(BOT_DIR, 'qr-code.png')
    
    try:
        # 1. Stop and restart bot to generate fresh QR
        try:
            subprocess.run(['systemctl', '--user', 'stop', 'htk-whatsapp-bot'],
                          capture_output=True, timeout=8)
        except:
            pass
        subprocess.run(['pkill', '-9', '-f', 'bot\\.js'], capture_output=True, timeout=5)
        _time_module.sleep(2)
        
        # 2. Start bot (it will generate QR internally)
        subprocess.run(['systemctl', '--user', 'start', 'htk-whatsapp-bot'],
                      capture_output=True, timeout=8)
        
        # 3. Wait for QR image to be generated (bot.js saves it)
        for _ in range(20):
            _time_module.sleep(1)
            if os.path.exists(qr_path) and os.path.getsize(qr_path) > 100:
                age = _time_module.time() - os.path.getmtime(qr_path)
                if age < 5:  # Fresh QR
                    from flask import send_file
                    resp = send_file(qr_path, mimetype='image/png')
                    resp.headers['Cache-Control'] = 'no-cache'
                    return resp
        
        return jsonify({'ok': False, 'error': 'QR no generado aún, intenta de nuevo'}), 202
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