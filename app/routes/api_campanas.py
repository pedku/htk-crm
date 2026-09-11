"""API Campañas — Fase 2: gestionar campañas y respuestas desde el CRM.

Endpoints:
  GET  /api/campanas                      -> lista de campañas (colas) + estado
  GET  /api/campanas/<name>               -> detalle de la cola
  POST /api/campanas/<name>/pause         -> quita el cron (pausa)
  POST /api/campanas/<name>/resume        -> agrega el cron (reanuda)
  POST /api/campanas/<name>/run           -> envía el siguiente ahora (1)
  POST /api/campanas/create               -> crea una campaña (cola) desde un segmento
  GET  /api/respuestas                     -> bandeja de respuestas (pending_replies.json)
  POST /api/respuestas/responder          -> {numero, mensaje} envía por WhatsApp
  POST /api/respuestas/clasificar         -> corre clasificar_respuestas.py
"""
import os, re, json, glob, subprocess, datetime
from flask import Blueprint, jsonify, request
from app.core.auth import login_required

api_campanas_bp = Blueprint('api_campanas', __name__)

CRM_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WS = os.path.dirname(CRM_DIR)  # workspace
DATA = os.path.join(WS, 'data')
SCRIPTS = os.path.join(WS, 'scripts')
DB = os.path.join(CRM_DIR, 'htk_crm.db')
PY = '/usr/bin/python3'
BOT_SEND = 'http://localhost:18802/send'


def _queue_path(name):
    return os.path.join(DATA, f'{name}_queue.json')


def _meta(name):
    """Metadatos del job de una campaña (script, extra args, token de cron)."""
    if name == 'followup':
        return {'script': 'followup_batch.py', 'extra': [], 'token': 'followup_batch.py',
                'log': os.path.join(DATA, 'followup_log.txt')}
    return {'script': 'campaign_send.py',
            'extra': ['--queue', _queue_path(name), '--log', os.path.join(DATA, f'{name}_log.txt'),
                      '--lock', os.path.join(DATA, f'.{name}.lock'), '--cron-token', f'{name}_queue.json'],
            'token': f'{name}_queue.json', 'log': os.path.join(DATA, f'{name}_log.txt')}


def _cron_lines():
    try:
        return subprocess.run(['crontab', '-l'], capture_output=True, text=True).stdout.splitlines()
    except Exception:
        return []


def _is_running(name):
    tok = _meta(name)['token']
    return any(tok in l and 'python3' in l for l in _cron_lines())


def _add_cron(name):
    meta = _meta(name)
    if _is_running(name):
        return False
    parts = [PY, os.path.join(SCRIPTS, meta['script'])] + meta['extra']
    line = '2-59/3 * * * * ' + ' '.join(parts) + f" >> {os.path.join(DATA, name+'_cron.log')} 2>&1"
    cur = '\n'.join(_cron_lines())
    subprocess.run(['crontab', '-'], input=(cur + '\n' + line + '\n') if cur else (line + '\n'), text=True)
    return True


def _del_cron(name):
    tok = _meta(name)['token']
    lines = [l for l in _cron_lines() if tok not in l]
    subprocess.run(['crontab', '-'], input='\n'.join(lines) + '\n', text=True)
    return True


def _campaigns():
    out = []
    for f in sorted(glob.glob(os.path.join(DATA, '*_queue.json'))):
        name = os.path.basename(f)[:-len('_queue.json')]
        try:
            q = json.load(open(f))
        except Exception:
            continue
        env = sum(1 for x in q if x.get('enviado'))
        canales = {}
        for x in q:
            canales[x.get('canal', 'whatsapp')] = canales.get(x.get('canal', 'whatsapp'), 0) + 1
        out.append({'name': name, 'total': len(q), 'enviados': env,
                    'pendientes': len(q) - env, 'canales': canales,
                    'running': _is_running(name),
                    'siguiente': next((x.get('nombre') or x.get('to') for x in q if not x.get('enviado')), None)})
    return out


@api_campanas_bp.route('/api/campanas')
@login_required
def api_campanas_list():
    return jsonify(_campaigns())


@api_campanas_bp.route('/api/campanas/<name>')
@login_required
def api_campanas_detail(name):
    p = _queue_path(name)
    if not os.path.exists(p):
        return jsonify({'error': 'no existe'}), 404
    q = json.load(open(p))
    return jsonify({'name': name, 'running': _is_running(name), 'items': q})


@api_campanas_bp.route('/api/campanas/<name>/pause', methods=['POST'])
@login_required
def api_campanas_pause(name):
    _del_cron(name)
    return jsonify({'ok': True, 'running': False})


@api_campanas_bp.route('/api/campanas/<name>/resume', methods=['POST'])
@login_required
def api_campanas_resume(name):
    added = _add_cron(name)
    return jsonify({'ok': True, 'running': True, 'added': added})


@api_campanas_bp.route('/api/campanas/<name>/run', methods=['POST'])
@login_required
def api_campanas_run(name):
    if not os.path.exists(_queue_path(name)):
        return jsonify({'error': 'no existe'}), 404
    meta = _meta(name)
    cmd = [PY, os.path.join(SCRIPTS, meta['script'])] + meta['extra']
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    return jsonify({'ok': True, 'out': ((p.stdout or '') + (p.stderr or ''))[-800:]})


@api_campanas_bp.route('/api/campanas/create', methods=['POST'])
@login_required
def api_campanas_create():
    import sqlite3
    b = request.get_json(force=True) or {}
    nombre = re.sub(r'[^a-z0-9_]+', '_', (b.get('nombre') or '').strip().lower())
    segmento = (b.get('segmento') or '').strip()
    canal = b.get('canal', 'whatsapp')
    mensaje = b.get('mensaje') or ''
    asunto = b.get('asunto') or ''
    limit = int(b.get('limit') or 30)
    estados = b.get('estados') or ['nuevo', 'contactado']
    if not nombre or not segmento or not mensaje:
        return jsonify({'error': 'faltan nombre/segmento/mensaje'}), 400
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    def esmov(t):
        if not t:
            return None
        n = re.sub(r'\D', '', t)
        if n.startswith('57'):
            n = n[2:]
        return '57' + n if (len(n) == 10 and n[0] == '3') else None
    rows = con.execute("SELECT id,nombre,telefono,email,estado FROM leads WHERE segmento LIKE ?",
                       ('%' + segmento + '%',)).fetchall()
    q = []
    for r in rows:
        if r['estado'] not in estados:
            continue
        if canal == 'whatsapp':
            to = esmov(r['telefono'])
            if not to:
                continue
            q.append({'id': r['id'], 'lead_id': r['id'], 'nombre': r['nombre'], 'canal': 'whatsapp',
                      'to': to, 'mensaje': mensaje, 'enviado': False})
        else:
            if not r['email']:
                continue
            q.append({'id': r['id'], 'lead_id': r['id'], 'nombre': r['nombre'], 'canal': 'email',
                      'to': r['email'], 'asunto': asunto, 'mensaje': mensaje, 'enviado': False})
        if len(q) >= limit:
            break
    con.close()
    json.dump(q, open(_queue_path(nombre), 'w'), ensure_ascii=False, indent=2)
    return jsonify({'ok': True, 'name': nombre, 'total': len(q)})


@api_campanas_bp.route('/api/respuestas')
@login_required
def api_respuestas():
    p = os.path.join(DATA, 'pending_replies.json')
    d = json.load(open(p)) if os.path.exists(p) else []
    return jsonify(d)


@api_campanas_bp.route('/api/respuestas/responder', methods=['POST'])
@login_required
def api_respuestas_responder():
    import urllib.request
    b = request.get_json(force=True) or {}
    to, msg = b.get('numero'), b.get('mensaje')
    if not to or not msg:
        return jsonify({'error': 'faltan numero/mensaje'}), 400
    data = json.dumps({'to': to, 'message': msg}).encode()
    req = urllib.request.Request(BOT_SEND, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return jsonify(json.loads(r.read().decode()))
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400


@api_campanas_bp.route('/api/respuestas/clasificar', methods=['POST'])
@login_required
def api_respuestas_clasificar():
    p = subprocess.run([PY, os.path.join(SCRIPTS, 'clasificar_respuestas.py')],
                       capture_output=True, text=True, timeout=120)
    return jsonify({'ok': True, 'out': ((p.stdout or '') + (p.stderr or ''))[-800:]})
