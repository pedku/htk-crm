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
    # Allow localhost/bot access without auth for GET
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
    if request.method == 'PUT' and 'user' not in session:
        return redirect(url_for('views.login_page', next=request.path))
    if request.method == 'GET' and not is_local and 'user' not in session:
        return redirect(url_for('views.login_page', next=request.path))

    if request.method == 'GET':
        if request.args.get('verbose') == '1':
            return jsonify(get_bot_config_verbose())
        return jsonify(get_bot_config_flat())

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
@login_required
def api_bot_status():
    result = bot_action('status')
    return jsonify(result)


# ── BOT LOG ───────────────────────────────────────────────────────────

@api_bot_bp.route('/api/bot/log')
@login_required
def api_bot_log():
    log_path = os.path.join(BASE_DIR, 'bot', 'bot.log')
    try:
        if os.path.exists(log_path):
            with open(log_path) as f:
                lines = f.readlines()
                last = lines[-200:]
            return jsonify({'log': ''.join(last), 'ok': True})
        return jsonify({'log': '', 'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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