"""
Healthcheck endpoint: verifica DB, Google Drive y WhatsApp Bot.
F1.3 del ROADMAP v5.
"""
import time
import subprocess
import os
from flask import Blueprint, jsonify
from app.core.db import get_db

health_bp = Blueprint('health', __name__)
START_TIME = time.time()

BOT_URL = 'http://localhost:18802'  # WhatsApp bot endpoint


@health_bp.route('/api/health')
def health():
    checks = {}

    # 1. Database
    try:
        conn = get_db()
        conn.execute("SELECT 1")
        conn.close()
        checks['db'] = {'status': 'ok'}
    except Exception as e:
        checks['db'] = {'status': 'error', 'detail': str(e)}

    # 2. Google Drive (via gog CLI — check auth listing)
    try:
        env = {**os.environ,
               'GOG_KEYRING_BACKEND': 'file',
               'GOG_KEYRING_PASSWORD': 'htk_gog_keyring_2026'}
        result = subprocess.run(
            ['/home/peku/.local/bin/gog', 'auth', 'list', '--no-input', '--json'],
            env=env, capture_output=True, timeout=10, text=True
        )
        if result.returncode == 0 and 'info@htk-ingenieria.com' in result.stdout:
            checks['drive'] = {'status': 'ok'}
        else:
            checks['drive'] = {'status': 'error', 'detail': result.stderr[:200] or 'no token'}
    except Exception as e:
        checks['drive'] = {'status': 'error', 'detail': str(e)[:200]}

    # 3. WhatsApp Bot (check if port 18802 is listening)
    try:
        result = subprocess.run(
            ['ss', '-tlnp'], capture_output=True, timeout=5, text=True
        )
        bot_up = ':18802' in result.stdout
        checks['whatsapp_bot'] = {'status': 'ok' if bot_up else 'down'}
    except Exception as e:
        checks['whatsapp_bot'] = {'status': 'down', 'detail': str(e)[:100]}

    # Uptime
    uptime_secs = int(time.time() - START_TIME)
    hours, rem = divmod(uptime_secs, 3600)
    minutes = rem // 60

    all_ok = all(v['status'] == 'ok' for v in checks.values())
    overall = 'ok' if all_ok else 'degraded'

    return jsonify({
        'status': overall,
        'checks': checks,
        'uptime': f'{hours}h {minutes}m',
        'version': '3.1.0'
    }), 200 if all_ok else 503
