"""app.py — HTK CRM v2 Profesional - Backend Flask"""
import os, sys, csv, io, json
from datetime import datetime
from flask import Flask, jsonify, request, render_template, send_file, redirect, session, url_for
from flask_cors import CORS
from functools import wraps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (init_db, get_db, get_stats, lead_listar, lead_kanban, lead_obtener,
                lead_crear, lead_actualizar, lead_convertir_cliente, lead_ultimos_7_dias,
                lead_eliminar,
                opciones_leads, etapa_listar, etapa_crear, etapa_actualizar,
                actividad_crear, actividad_listar, actividad_listar_recientes, actividad_eliminar,
                tag_listar, tag_crear,
                tarea_listar, tarea_crear, tarea_actualizar, tarea_eliminar,
                cliente_listar, cliente_actualizar,
                venta_listar, venta_crear, venta_actualizar, venta_eliminar,
                precio_listar, precio_crear, precio_actualizar, precio_eliminar,
                get_conversion_funnel, get_actividad_reciente)

app = Flask(__name__)
app.secret_key = os.urandom(24).hex()
CORS(app)

# ─── LOGIN CONFIG ──────────────────────────
# Usuario y contraseña desde variables de entorno
# Cargar desde .crm_env o export manual
CRM_USER = os.environ.get("CRM_USER", "htk_admin")
CRM_PASS = os.environ.get("CRM_PASS", "Htk2026Secure!")

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('page_login'))
        return f(*args, **kwargs)
    return decorated

# ─── LOGIN / LOGOUT ────────────────────────
@app.route("/login", methods=["GET", "POST"])
def page_login():
    if request.method == "POST":
        user = request.form.get("username")
        passwd = request.form.get("password")
        if user == CRM_USER and passwd == CRM_PASS:
            session['user'] = user
            return redirect(url_for('page_dashboard'))
        return render_template("login.html", error="Usuario o contraseña incorrectos")
    return render_template("login.html", error=None)

@app.route("/logout")
def page_logout():
    session.pop('user', None)
    return redirect(url_for('page_login'))

# ─── FILTRO ESCAPEJS ──────────────────────
import re
def escapejs(val):
    val = str(val)
    val = val.replace('\\', '\\\\').replace("'", "\\'").replace('"', '\\"')
    val = re.sub(r'[\r\n]+', ' ', val)
    return val
app.jinja_env.filters['escapejs'] = escapejs

init_db()

# ─── PÁGINAS ──────────────────────────────────────────
@app.route("/")
@login_required
def page_dashboard():
    return render_template("dashboard.html", active="dashboard")

@app.route("/leads")
@login_required
def page_leads():
    return render_template("leads.html", active="leads")

@app.route("/leads/kanban")
@login_required
def page_kanban():
    return render_template("kanban.html", active="kanban")

@app.route("/leads/<int:lid>")
@login_required
def page_lead(lid):
    lead = lead_obtener(lid)
    if not lead:
        return "Lead no encontrado", 404
    actividades = actividad_listar(lid)
    tareas, _ = tarea_listar(lead_id=lid, limit=50)
    return render_template("lead_detail.html", active="leads", lead=lead, 
                          actividades=actividades, tareas=tareas)

@app.route("/clientes")
@login_required
def page_clientes():
    return render_template("clientes.html", active="clientes")

@app.route("/ventas")
@login_required
def page_ventas():
    return render_template("ventas.html", active="ventas")

@app.route("/seguimiento")
@login_required
def page_seguimiento():
    return render_template("seguimiento.html", active="seguimiento")

@app.route("/precios")
@login_required
def page_precios():
    return render_template("precios.html", active="precios")

@app.route("/metricas")
@login_required
def page_metricas():
    return render_template("metricas.html", active="metricas")

# ─── API: STATS ──────────────────────────────────────
@app.route("/api/stats")
def api_stats():
    return jsonify(get_stats())

@app.route("/api/lead-week")
def api_lead_week():
    return jsonify(lead_ultimos_7_dias())

@app.route("/api/opciones")
def api_opciones():
    return jsonify(opciones_leads())

@app.route("/api/pipeline")
def api_pipeline():
    return jsonify(get_conversion_funnel())

# ─── API: LEADS ──────────────────────────────────────
@app.route("/api/leads", methods=["GET"])
def api_leads_get():
    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))
    rows, total = lead_listar(
        q=request.args.get("q", ""),
        opcion=request.args.get("opcion", ""),
        atendido=request.args.get("atendido", ""),
        etapa=request.args.get("etapa", ""),
        limit=limit, offset=offset
    )
    return jsonify({"data": rows, "total": total})

@app.route("/api/leads/kanban", methods=["GET"])
def api_leads_kanban():
    return jsonify(lead_kanban())

@app.route("/api/leads", methods=["POST"])
def api_leads_post():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos requeridos"}), 400
    lid = lead_crear(data)
    # Registrar actividad
    actividad_crear(lid, 'sistema', '🆕 Lead creado', data.get('detalle', ''))
    return jsonify({"id": lid, "ok": True}), 201

@app.route("/api/leads/<int:lid>", methods=["GET"])
def api_lead_get(lid):
    lead = lead_obtener(lid)
    if not lead:
        return jsonify({"error": "No encontrado"}), 404
    return jsonify(lead)

@app.route("/api/leads/<int:lid>", methods=["PATCH"])
def api_leads_patch(lid):
    data = request.get_json()
    ok = lead_actualizar(lid, data)
    return jsonify({"ok": ok})

@app.route("/api/leads/<int:lid>/convertir", methods=["POST"])
def api_leads_convertir(lid):
    cid, err = lead_convertir_cliente(lid)
    if err:
        return jsonify({"error": err}), 400 if cid is None else 200
    return jsonify({"cliente_id": cid, "ok": True}), 201

@app.route("/api/leads/<int:lid>/etapa", methods=["PATCH"])
def api_leads_etapa(lid):
    data = request.get_json()
    if 'etapa' not in data:
        return jsonify({"error": "etapa requerida"}), 400
    ok = lead_actualizar(lid, {'etapa': data['etapa']})
    return jsonify({"ok": ok})

# ─── API: ACTIVIDADES ────────────────────────────────
@app.route("/api/leads/<int:lid>/actividades", methods=["GET"])
def api_lead_actividades(lid):
    return jsonify(actividad_listar(lid))

@app.route("/api/leads/<int:lid>/actividades", methods=["POST"])
def api_lead_actividad_crear(lid):
    data = request.get_json()
    if not data or not data.get('descripcion'):
        return jsonify({"error": "descripcion requerida"}), 400
    actividad_crear(lid, data.get('tipo', 'nota'), data['descripcion'], data.get('detalle', ''))
    return jsonify({"ok": True}), 201

@app.route("/api/actividades/recientes", methods=["GET"])
def api_actividades_recientes():
    return jsonify(actividad_listar_recientes(20))

# ─── API: TAGS ───────────────────────────────────────
@app.route("/api/tags", methods=["GET"])
def api_tags_get():
    return jsonify(tag_listar())

@app.route("/api/tags", methods=["POST"])
def api_tags_post():
    data = request.get_json()
    tid = tag_crear(data.get('nombre', ''), data.get('color', '#3b82f6'))
    return jsonify({"id": tid, "ok": True}), 201

# ─── API: ETAPAS ─────────────────────────────────────
@app.route("/api/etapas", methods=["GET"])
def api_etapas_get():
    return jsonify(etapa_listar())

# ─── API: CLIENTES ───────────────────────────────────
@app.route("/api/clientes", methods=["GET"])
def api_clientes_get():
    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))
    rows, total = cliente_listar(q=request.args.get("q", ""), limit=limit, offset=offset)
    return jsonify({"data": rows, "total": total})

@app.route("/api/clientes/<int:cid>", methods=["PATCH"])
def api_clientes_patch(cid):
    data = request.get_json()
    ok = cliente_actualizar(cid, data)
    return jsonify({"ok": ok})

# ─── API: VENTAS ─────────────────────────────────────
@app.route("/api/ventas", methods=["GET"])
def api_ventas_get():
    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))
    rows, total = venta_listar(estado=request.args.get("estado", ""), limit=limit, offset=offset)
    return jsonify({"data": rows, "total": total})

@app.route("/api/ventas", methods=["POST"])
def api_ventas_post():
    data = request.get_json()
    vid = venta_crear(data)
    return jsonify({"id": vid, "ok": True}), 201

@app.route("/api/ventas/<int:vid>", methods=["PATCH"])
def api_ventas_patch(vid):
    data = request.get_json()
    ok = venta_actualizar(vid, data)
    return jsonify({"ok": ok})

# ─── API: TAREAS ─────────────────────────────────────
@app.route("/api/tareas", methods=["GET"])
def api_tareas_get():
    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))
    rows, total = tarea_listar(
        estado=request.args.get("estado", ""),
        lead_id=request.args.get("lead_id", type=int),
        limit=limit, offset=offset
    )
    return jsonify({"data": rows, "total": total})

@app.route("/api/tareas", methods=["POST"])
def api_tareas_post():
    data = request.get_json()
    tid = tarea_crear(data)
    # Si está asociada a un lead, registrar actividad
    if data.get('lead_id'):
        actividad_crear(data['lead_id'], 'tarea', f"📋 Tarea creada: {data.get('tarea', '')}", 
                       f"Vence: {data.get('vence', 'sin fecha')} | Prioridad: {data.get('prioridad', 'Media')}")
    return jsonify({"id": tid, "ok": True}), 201

@app.route("/api/tareas/<int:tid>", methods=["PATCH"])
def api_tareas_patch(tid):
    data = request.get_json()
    ok = tarea_actualizar(tid, data)
    return jsonify({"ok": ok})

@app.route("/api/tareas/<int:tid>", methods=["DELETE"])
def api_tareas_delete(tid):
    tarea_eliminar(tid)
    return jsonify({"ok": True})

# ─── API: PRECIOS ─────────────────────────────────────
@app.route("/api/precios", methods=["GET"])
def api_precios_get():
    return jsonify(precio_listar(q=request.args.get("q", "")))

@app.route("/api/precios", methods=["POST"])
def api_precios_post():
    data = request.get_json()
    pid = precio_crear(data)
    return jsonify({"id": pid, "ok": True}), 201

@app.route("/api/precios/<int:pid>", methods=["PATCH"])
def api_precios_patch(pid):
    data = request.get_json()
    precio_actualizar(pid, data)
    return jsonify({"ok": True})

@app.route("/api/precios/<int:pid>", methods=["DELETE"])
def api_precios_delete(pid):
    precio_eliminar(pid)
    return jsonify({"ok": True})

# ─── API: DELETE ──────────────────────────────────────
@app.route("/api/leads/<int:lid>", methods=["DELETE"])
def api_leads_delete(lid):
    lead_eliminar(lid)
    return jsonify({"ok": True})

@app.route("/api/ventas/<int:vid>", methods=["DELETE"])
def api_ventas_delete(vid):
    venta_eliminar(vid)
    return jsonify({"ok": True})

@app.route("/api/leads/<int:lid>/actividades/<int:aid>", methods=["DELETE"])
def api_actividad_delete(lid, aid):
    actividad_eliminar(aid)
    return jsonify({"ok": True})

# ─── EXPORT ──────────────────────────────────────────
@app.route("/api/export")
def api_export():
    db = get_db()
    rows = db.execute("SELECT * FROM leads ORDER BY fecha DESC").fetchall()
    db.close()
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

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=18800, debug=False)
