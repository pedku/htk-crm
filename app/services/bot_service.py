"""Service layer for Bot config and communication."""
import json
import re
import urllib.request
from app.core.db import get_db


def cast_config_value(value, tipo):
    """
    Cast a value to its proper Python type based on the bot_config.tipo column.
    
    Args:
        value: The raw value (usually string from JSON)
        tipo: 'bool', 'int', 'str', or 'json'
    
    Returns:
        Properly typed value for DB storage
    """
    if tipo == 'bool':
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value)
    elif tipo == 'int':
        return int(value)
    elif tipo == 'float':
        return float(value)
    elif tipo == 'json':
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False)
    else:
        return str(value)


def get_bot_config_flat():
    """
    Get bot config as flat dict {key: value} for bot.js consumption.
    Values are properly typed (bool, int, str).
    """
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM bot_config ORDER BY categoria, key").fetchall()
        result = {}
        for r in rows:
            key = r['key']
            tipo = r['tipo']
            raw_value = r['value']
            if tipo == 'bool':
                result[key] = raw_value.lower() in ('true', '1') if isinstance(raw_value, str) else bool(raw_value)
            elif tipo == 'int':
                result[key] = int(raw_value) if raw_value else 0
            elif tipo == 'float':
                result[key] = float(raw_value) if raw_value else 0.0
            elif tipo == 'json':
                try:
                    result[key] = json.loads(raw_value) if raw_value else {}
                except (json.JSONDecodeError, TypeError):
                    result[key] = raw_value
            else:
                result[key] = raw_value
        return result
    finally:
        conn.close()


def get_bot_config_verbose():
    """
    Get bot config with full metadata (value, tipo, descripcion, categoria).
    Booleans are normalized to 'true'/'false' strings for frontend compatibility.
    """
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM bot_config ORDER BY categoria, key").fetchall()
        meta = {}
        for r in rows:
            raw = r['value']
            tipo = r['tipo']
            # Normalize booleans to 'true'/'false' strings for frontend toggles
            if tipo == 'bool':
                raw_lower = raw.lower() if isinstance(raw, str) else str(raw).lower()
                raw = 'true' if raw_lower in ('1', 'true', 'yes', 'on') else 'false'
            meta[r['key']] = {
                'value': raw,
                'tipo': tipo,
                'descripcion': r['descripcion'],
                'categoria': r['categoria']
            }
        return meta
    finally:
        conn.close()


def reload_bot_config():
    """Notify the bot to reload its configuration."""
    try:
        payload = json.dumps({'action': 'reload_config'}).encode()
        req = urllib.request.Request(
            'http://localhost:18802/reload-config',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def send_whatsapp(numero, mensaje):
    """Send WhatsApp message via bot proxy."""
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
            return json.loads(resp.read())
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def bot_action(action, payload_data=None):
    """Generic bot action proxy (silence, unsilence, global-off, global-on, status)."""
    endpoints = {
        'silence': 'silence',
        'unsilence': 'unsilence',
        'global-off': 'global-off',
        'global-on': 'global-on',
        'status': 'status',
    }
    if action not in endpoints:
        return {'ok': False, 'error': f'Unknown action: {action}'}
    
    try:
        payload = json.dumps(payload_data or {}).encode()
        req = urllib.request.Request(
            f'http://localhost:18802/{endpoints[action]}',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {'ok': False, 'error': str(e)}