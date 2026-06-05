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


def get_bot_config_categorias():
    """Return config grouped by category for the UI."""
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM bot_config ORDER BY categoria, grupo, key").fetchall()
        grouped = {}
        for r in rows:
            cat = r['categoria']
            if cat not in grouped:
                grouped[cat] = []
            raw = r['value']
            tipo = r['tipo']
            if tipo in ('bool', 'boolean'):
                raw_lower = raw.lower() if isinstance(raw, str) else str(raw).lower()
                raw = 'true' if raw_lower in ('1', 'true', 'yes', 'on') else 'false'
            grouped[cat].append({
                'key': r['key'],
                'value': raw,
                'tipo': tipo,
                'descripcion': r['descripcion'] or '',
                'categoria': cat,
                'grupo': r['grupo'] or '',
                'opciones': r['opciones'] or ''
            })
        return grouped
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
def send_email(to, subject, body, html=False, attachments=None):
    """Send email via SMTP using configured credentials.
    
    Args:
        to: Recipient email
        subject: Email subject
        body: Email body text
        html: If True, body is HTML
        attachments: Optional list of dicts with 'path' and 'name' keys
    """
    import smtplib
    import os
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.mime.base import MIMEBase
    from email import encoders
    
    conn = get_db()
    try:
        config_rows = conn.execute(
            "SELECT key, value FROM bot_config WHERE categoria='correo'"
        ).fetchall()
        config = {r['key']: r['value'] for r in config_rows}
    finally:
        conn.close()
    
    host = config.get('smtp_host', 'smtp.gmail.com')
    port = int(config.get('smtp_port', '587'))
    user = config.get('smtp_user', 'info@htk-ingenieria.com')
    password = os.environ.get('SMTP_PASS', config.get('smtp_pass', ''))
    from_name = config.get('email_from_name', 'HTK INGENIERÍA')
    enabled = config.get('smtp_enabled', '1') in ('1', 'true')
    
    if not enabled or not password:
        return {'ok': False, 'error': 'SMTP no configurado o deshabilitado'}
    
    try:
        msg = MIMEMultipart()
        msg['Subject'] = subject
        msg['From'] = f'{from_name} <{user}>'
        msg['To'] = to
        
        subtype = 'html' if html else 'plain'
        msg.attach(MIMEText(body, subtype, 'utf-8'))
        
        # Attach files if provided
        if attachments:
            for att in attachments:
                filepath = att.get('path', '')
                filename = att.get('name', os.path.basename(filepath))
                if not filepath or not os.path.exists(filepath):
                    continue
                try:
                    with open(filepath, 'rb') as f:
                        part = MIMEBase('application', 'octet-stream')
                        part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename="{filename}"'
                    )
                    msg.attach(part)
                except Exception as e:
                    print(f"⚠️ Error adjuntando {filepath}: {e}")
        
        server = smtplib.SMTP(host, port, timeout=15)
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
        server.quit()
        return {'ok': True, 'to': to, 'subject': subject, 'attachments': len(attachments or [])}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
