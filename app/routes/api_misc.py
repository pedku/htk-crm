"""API Misc Blueprint — Stats, pitches, automation, sales, prices, tasks, debug."""
import os
import json
import subprocess
import csv
import io
from datetime import datetime
from flask import Blueprint, jsonify, request, send_file
from app.core.db import get_db, now_iso, now_col
from app.core.auth import login_required

api_misc_bp = Blueprint('api_misc', __name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PITCHES_PATH = os.path.join(BASE_DIR, 'bot', 'data', 'pitches.json')


# ── STATS ─────────────────────────────────────────────────────────────

@api_misc_bp.route('/api/stats')
@login_required
def api_stats():
    conn = get_db()
    try:
        leads = conn.execute("SELECT * FROM leads").fetchall()
        clients = conn.execute("SELECT * FROM clients").fetchall()
        wo = conn.execute("SELECT * FROM work_orders").fetchall()

        leads_list = [dict(l) for l in leads]
        wo_list = [dict(w) for w in wo]

        return jsonify({
            'total_leads': len(leads),
            'total_clients': len(clients),
            'total_work_orders': len(wo),
            'active_work_orders': len([w for w in wo if w['activo']]),
            'completed_work_orders': len([w for w in wo if w['estado'] in ('completado', 'entregado')]),
            'leads_by_status': {
                s: len([l for l in leads_list if l.get('estado') == s])
                for s in set(l.get('estado', 'unknown') for l in leads_list)
            },
            'wo_by_status': {
                s: len([w for w in wo_list if w.get('estado') == s])
                for s in set(w.get('estado', 'unknown') for w in wo_list)
            },
            'leads_by_linea': {
                s: len([l for l in leads_list if l.get('linea_interes') == s])
                for s in set(l.get('linea_interes', 'unknown') for l in leads_list)
            },
        })
    finally:
        conn.close()


# ── DEBUG ─────────────────────────────────────────────────────────────

@api_misc_bp.route('/api/debug')
@login_required
def api_debug():
    conn = get_db()
    try:
        tables = {}
        for table in ['clients', 'work_orders', 'work_order_history', 'leads',
                       'interactions', 'work_order_client_links',
                       'inventario', 'inventario_movimientos']:
            count = conn.execute(
                f"SELECT COUNT(*) as cnt FROM {table}"
            ).fetchone()[0]
            tables[table] = count
        return jsonify(tables)
    finally:
        conn.close()


# ── PITCHES ───────────────────────────────────────────────────────────

def _load_pitches():
    if os.path.exists(PITCHES_PATH):
        with open(PITCHES_PATH) as f:
            return json.load(f)
    return {'canales': {}, 'plantillas_cuerpo': []}

def _save_pitches(pitches):
    pt = os.path.dirname(PITCHES_PATH)
    if not os.path.exists(pt):
        os.makedirs(pt, exist_ok=True)
    with open(PITCHES_PATH, 'w') as f:
        json.dump(pitches, f, indent=2, ensure_ascii=False)


@api_misc_bp.route('/api/pitches', methods=['GET', 'POST', 'PUT', 'DELETE'])
@login_required
def api_pitches():
    if request.method == 'GET':
        return jsonify(_load_pitches())

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    pitches = _load_pitches()

    if request.method == 'POST':
        # Crear nueva plantilla
        template = {
            'id': data.get('id', f'pitch_{len(pitches["plantillas_cuerpo"]) + 1}'),
            'titulo': data.get('titulo', 'Nueva plantilla'),
            'segmentos': data.get('segmentos', []),
            'whatsapp': data.get('whatsapp', ''),
            'email': data.get('email', ''),
            'asunto_email': data.get('asunto_email', '')
        }
        pitches['plantillas_cuerpo'].append(template)
        _save_pitches(pitches)
        return jsonify(template), 201

    if request.method == 'PUT':
        # Actualizar plantilla existente
        template_id = data.get('id')
        if not template_id:
            return jsonify({'error': 'Falta id de plantilla'}), 400
        
        found = False
        for t in pitches['plantillas_cuerpo']:
            if t.get('id') == template_id:
                for key in ['titulo', 'segmentos', 'whatsapp', 'email', 'asunto_email']:
                    if key in data:
                        t[key] = data[key]
                found = True
                break
        
        if not found:
            return jsonify({'error': 'Plantilla no encontrada'}), 404
        
        _save_pitches(pitches)
        return jsonify({'ok': True})

    if request.method == 'DELETE':
        template_id = data.get('id')
        if not template_id:
            return jsonify({'error': 'Falta id de plantilla'}), 400
        
        before = len(pitches['plantillas_cuerpo'])
        pitches['plantillas_cuerpo'] = [t for t in pitches['plantillas_cuerpo'] if t.get('id') != template_id]
        if len(pitches['plantillas_cuerpo']) == before:
            return jsonify({'error': 'Plantilla no encontrada'}), 404
        
        _save_pitches(pitches)
        return jsonify({'success': True})


@api_misc_bp.route('/api/pitches/by-segment/<segment>', methods=['GET'])
@login_required
def api_pitches_by_segment(segment):
    if not os.path.exists(PITCHES_PATH):
        return jsonify([])
    with open(PITCHES_PATH) as f:
        pitches = json.load(f)
    templates = pitches.get('plantillas_cuerpo', [])
    matched = [t for t in templates if segment in t.get('segmentos', [])]
    return jsonify(matched)


# ── AUTOMATION ────────────────────────────────────────────────────────

def run_script(script_name, args=None):
    script_path = os.path.join(os.path.dirname(BASE_DIR), 'scripts', script_name)
    if not os.path.exists(script_path):
        return {'ok': False, 'error': 'Script no encontrado: ' + script_path}
    cmd = ['python3', script_path]
    if args:
        cmd.extend(args)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return {
            'ok': result.returncode == 0,
            'output': result.stdout,
            'error': result.stderr
        }
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': 'Timeout (300s)'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@api_misc_bp.route('/api/auto/enrich', methods=['POST'])
@login_required
def api_auto_enrich():
    data = request.get_json(silent=True) or {}
    args = []
    if data.get('segmento'):
        args.extend(['--segmento', data['segmento']])
    if data.get('lead'):
        args.extend(['--lead', data['lead']])
    if data.get('force'):
        args.append('--force')
    result = run_script('auto_enrich.py', args)
    return jsonify(result)


@api_misc_bp.route('/api/auto/score', methods=['GET'])
@login_required
def api_auto_score():
    seg = request.args.get('segmento')
    top = request.args.get('top', '0')
    args = ['--top', top]
    if seg:
        args.extend(['--segmento', seg])
    result = run_script('auto_score.py', args)
    return jsonify(result)


@api_misc_bp.route('/api/auto/schedule', methods=['POST'])
@login_required
def api_auto_schedule():
    data = request.get_json(silent=True) or {}
    args = []
    if data.get('segmento'):
        args.extend(['--segmento', data['segmento']])
    if data.get('start'):
        args.extend(['--start', data['start']])
    if data.get('dry_run'):
        args.append('--dry-run')
    result = run_script('auto_schedule.py', args)
    return jsonify(result)


@api_misc_bp.route('/api/auto/campaign', methods=['POST'])
@login_required
def api_auto_campaign():
    data = request.get_json(silent=True) or {}
    args = []
    if data.get('segmento'):
        args.extend(['--segmento', data['segmento']])
    if data.get('lead'):
        args.extend(['--lead', data['lead']])
    if data.get('channel'):
        args.extend(['--channel', data['channel']])
    else:
        args.extend(['--channel', 'whatsapp'])
    if data.get('save'):
        args.append('--save')
    result = run_script('auto_campaign.py', args)
    return jsonify(result)


@api_misc_bp.route('/api/auto/backup', methods=['POST'])
@login_required
def api_auto_backup():
    import glob
    script_path = os.path.join(BASE_DIR, 'backup_db.sh')
    if not os.path.exists(script_path):
        return jsonify({'ok': False, 'error': 'backup_db.sh no encontrado'})
    try:
        result = subprocess.run(
            ['bash', script_path], capture_output=True, text=True, timeout=30
        )
        backup_dir = os.path.join(BASE_DIR, 'backups')
        backups = []
        if os.path.exists(backup_dir):
            for f in sorted(
                glob.glob(os.path.join(backup_dir, '*.backup*')), reverse=True
            )[:10]:
                fname = os.path.basename(f)
                fsize = os.path.getsize(f)
                backups.append({'name': fname, 'size': fsize})
        return jsonify({
            'ok': result.returncode == 0,
            'output': result.stdout,
            'error': result.stderr,
            'backups': backups
        })
    except subprocess.TimeoutExpired:
        return jsonify({'ok': False, 'error': 'Timeout'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})


# ── SALES ─────────────────────────────────────────────────────────────

@api_misc_bp.route('/api/sales', methods=['GET', 'POST'])
def api_sales():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            sid = f"VTA-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            conn.execute(
                "INSERT INTO ventas (id, lead_id, cliente_id, cliente_nombre, producto, capacidad, valor_cotizado, estado, fecha, notas) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (sid, data.get('lead_id', ''), data.get('cliente_id', ''),
                 data.get('cliente_nombre', ''), data.get('producto', ''),
                 data.get('capacidad', ''), data.get('valor_cotizado', 0),
                 'cotizado', datetime.now().isoformat(), data.get('notas', ''))
            )
            conn.commit()
            row = conn.execute("SELECT * FROM ventas WHERE id = ?", (sid,)).fetchone()
            return jsonify(dict(row)), 201
        rows = conn.execute("SELECT * FROM ventas ORDER BY fecha DESC").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@api_misc_bp.route('/api/sales/<sid>', methods=['PATCH', 'DELETE'])
def api_sale(sid):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM ventas WHERE id = ?", (sid,))
            conn.commit()
            return jsonify({'ok': True})
        data = request.get_json()
        allowed = ['cliente_nombre', 'producto', 'capacidad',
                    'valor_cotizado', 'valor_vendido', 'estado', 'notas']
        updates = [f"{k}=?" for k in data if k in allowed]
        if updates:
            params = [data[k] for k in data if k in allowed]
            params.append(sid)
            conn.execute(
                f"UPDATE ventas SET {','.join(updates)} WHERE id = ?", params
            )
            conn.commit()
        row = conn.execute("SELECT * FROM ventas WHERE id = ?", (sid,)).fetchone()
        return jsonify(dict(row) if row else {'error': 'No encontrada'})
    finally:
        conn.close()


# ── PRICES ────────────────────────────────────────────────────────────

@api_misc_bp.route('/api/prices', methods=['GET', 'POST'])
def api_prices():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            c = conn.execute(
                "INSERT INTO precios (categoria, producto, capacidad, precio_base, precio_venta, notas) VALUES (?,?,?,?,?,?)",
                (data.get('categoria', ''), data.get('producto', ''),
                 data.get('capacidad', ''), data.get('precio_base', 0),
                 data.get('precio_venta', 0), data.get('notas', ''))
            )
            conn.commit()
            return jsonify({'id': c.lastrowid, 'ok': True}), 201
        rows = conn.execute(
            "SELECT * FROM precios ORDER BY categoria, producto"
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@api_misc_bp.route('/api/prices/<int:pid>', methods=['PATCH', 'DELETE'])
def api_price(pid):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM precios WHERE id = ?", (pid,))
            conn.commit()
            return jsonify({'ok': True})
        data = request.get_json()
        allowed = ['categoria', 'producto', 'capacidad',
                    'precio_base', 'precio_venta', 'notas']
        updates = [f"{k}=?" for k in data if k in allowed]
        if updates:
            params = [data[k] for k in data if k in allowed]
            params.append(pid)
            conn.execute(f"UPDATE precios SET {','.join(updates)} WHERE id = ?", params)
            conn.commit()
        return jsonify({'ok': True})
    finally:
        conn.close()


# ── TASKS ─────────────────────────────────────────────────────────────

@api_misc_bp.route('/api/tasks', methods=['GET', 'POST'])
def api_tasks():
    conn = get_db()
    try:
        if request.method == 'POST':
            data = request.get_json()
            c = conn.execute(
                "INSERT INTO tareas (lead_id, tarea, estado, prioridad, vence, created_at) VALUES (?,?,?,?,?,?)",
                (data.get('lead_id', ''), data.get('tarea', ''),
                 'pendiente', data.get('prioridad', 'media'),
                 data.get('vence', ''), datetime.now().isoformat())
            )
            conn.commit()
            return jsonify({'id': c.lastrowid, 'ok': True}), 201
        rows = conn.execute(
            "SELECT * FROM tareas ORDER BY completada ASC, vence ASC"
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@api_misc_bp.route('/api/tasks/<int:tid>', methods=['PATCH', 'DELETE'])
def api_task(tid):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM tareas WHERE id = ?", (tid,))
            conn.commit()
            return jsonify({'ok': True})
        data = request.get_json()
        allowed = ['tarea', 'estado', 'prioridad', 'vence', 'completada']
        updates = [f"{k}=?" for k in data if k in allowed]
        if updates:
            params = [data[k] for k in data if k in allowed]
            params.append(tid)
            conn.execute(f"UPDATE tareas SET {','.join(updates)} WHERE id = ?", params)
            conn.commit()
        return jsonify({'ok': True})
    finally:
        conn.close()
# ── COMPANY CONFIG ───────────────────────────────────────────────────

DEFAULT_COMPANY = {
    'nombre': 'HOUSETRONIK INGENIERÍA Y AUTOMATIZACIÓN INTELIGENTE S.A.S',
    'comercial': 'HTK INGENIERIA',
    'nit': '1.124.361.169-2',
    'direccion': 'Cra 7b #46-108, Barranquilla, Colombia',
    'telefono': '+57 315 603 2940',
    'email': 'info@htk-ingenieria.com'
}

@api_misc_bp.route('/api/company', methods=['GET', 'PUT'])
@login_required
def api_company():
    conn = get_db()
    try:
        if request.method == 'GET':
            rows = conn.execute(
                "SELECT key, value FROM bot_config WHERE key LIKE 'company_%'"
            ).fetchall()
            config = dict(DEFAULT_COMPANY)
            for r in rows:
                key = r['key'].replace('company_', '')
                if key in config and r['value']:
                    config[key] = r['value']
            return jsonify(config)

        # PUT
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Datos requeridos'}), 400
        for key in DEFAULT_COMPANY:
            if key in data:
                conn.execute(
                    "INSERT OR REPLACE INTO bot_config (key, value, tipo, categoria) VALUES (?, ?, 'str', 'company')",
                    (f'company_{key}', str(data[key]))
                )
        conn.commit()
        return jsonify({'ok': True})
    finally:
        conn.close()
