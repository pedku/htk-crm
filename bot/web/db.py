"""db.py — HTK CRM v2 Profesional"""
import sqlite3, os, json
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "htk_crm.db")
LEADS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "leads.json")

# ─── CONEXIÓN ─────────────────────────────────────────
def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    return db

def init_db():
    """Asegura que las tablas mínimas existan"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='etapas'")
    if not c.fetchone():
        # Si no hay etapas, ejecutar migración
        conn.close()
        from migrate_crm import run_migration
        run_migration()
        return
    conn.close()

# ─── ETAPAS ───────────────────────────────────────────
def etapa_listar():
    db = get_db()
    rows = db.execute("SELECT * FROM etapas ORDER BY orden").fetchall()
    db.close()
    return [dict(r) for r in rows]

def etapa_crear(data):
    db = get_db()
    c = db.execute("INSERT INTO etapas (clave, nombre, orden, color, icono, probabilidad) VALUES (?,?,?,?,?,?)",
        (data['clave'], data['nombre'], data['orden'], data.get('color','#6b7280'), data.get('icono','bi-circle'), data.get('probabilidad',0)))
    db.commit()
    db.close()
    return c.lastrowid

def etapa_actualizar(eid, data):
    db = get_db()
    fields = [f"{k} = ?" for k in data]
    vals = list(data.values()) + [eid]
    db.execute(f"UPDATE etapas SET {', '.join(fields)} WHERE id = ?", vals)
    db.commit()
    db.close()

# ─── ACTIVIDADES ──────────────────────────────────────
def actividad_crear(lead_id, tipo, descripcion, detalle="", usuario="Pedro"):
    db = get_db()
    db.execute("""
        INSERT INTO actividades (lead_id, tipo, descripcion, detalle, usuario)
        VALUES (?,?,?,?,?)
    """, (lead_id, tipo, descripcion, detalle, usuario))
    db.execute("UPDATE leads SET ultima_actividad = datetime('now','localtime') WHERE id = ?", (lead_id,))
    db.commit()
    db.close()

def actividad_listar(lead_id, limit=50):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM actividades WHERE lead_id = ? ORDER BY created_at DESC LIMIT ?",
        (lead_id, limit)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]

def actividad_listar_recientes(limit=20):
    db = get_db()
    rows = db.execute("""
        SELECT a.*, l.nombre as lead_nombre 
        FROM actividades a JOIN leads l ON a.lead_id = l.id 
        ORDER BY a.created_at DESC LIMIT ?
    """, (limit,)).fetchall()
    db.close()
    return [dict(r) for r in rows]

# ─── LEADS ────────────────────────────────────────────
def lead_listar(q="", opcion="", atendido="", etapa="", limit=100, offset=0):
    db = get_db()
    conditions = ["1"]
    params = []
    if q:
        conditions.append("(l.nombre LIKE ? OR l.numero LIKE ? OR l.detalle LIKE ? OR l.opcion LIKE ?)")
        params.extend([f"%{q}%"] * 4)
    if opcion:
        conditions.append("l.opcion = ?")
        params.append(opcion)
    if atendido == "no":
        conditions.append("l.atendido = 0")
    elif atendido == "si":
        conditions.append("l.atendido = 1")
    if etapa:
        if etapa == "sin_asignar":
            conditions.append("(l.etapa IS NULL OR l.etapa = '')")
        else:
            conditions.append("l.etapa = ?")
            params.append(etapa)

    where = " AND ".join(conditions)
    rows = db.execute(
        f"SELECT l.*, e.nombre as etapa_nombre, e.color as etapa_color, e.icono as etapa_icono, e.probabilidad as etapa_prob FROM leads l LEFT JOIN etapas e ON l.etapa = e.clave WHERE {where} ORDER BY l.fecha DESC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()
    total = db.execute(f"SELECT COUNT(*) FROM leads l WHERE {where}", params).fetchone()[0]
    db.close()
    return [dict(r) for r in rows], total

def lead_kanban():
    """Leads agrupados por etapa para vista Kanban"""
    db = get_db()
    etapas = db.execute("SELECT * FROM etapas ORDER BY orden").fetchall()
    result = []
    for e in etapas:
        leads = db.execute("""
            SELECT l.*, e2.nombre as etapa_nombre, e2.color as etapa_color, 
                   e2.icono as etapa_icono, e2.probabilidad as etapa_prob
            FROM leads l 
            LEFT JOIN etapas e2 ON l.etapa = e2.clave
            WHERE COALESCE(l.etapa, 'nuevo') = ?
            ORDER BY l.fecha DESC
        """, (e['clave'],)).fetchall()
        result.append({
            'etapa': dict(e),
            'leads': [dict(l) for l in leads]
        })
    # Leads sin etapa asignada
    sin_etapa = db.execute("""
        SELECT l.* FROM leads l 
        WHERE l.etapa IS NULL OR l.etapa = '' 
        ORDER BY l.fecha DESC
    """).fetchall()
    if sin_etapa:
        result.insert(0, {
            'etapa': {'id': 0, 'clave': 'sin_asignar', 'nombre': '📥 Sin Asignar', 'orden': 0, 'color': '#94a3b8', 'icono': 'bi-inbox', 'probabilidad': 0},
            'leads': [dict(l) for l in sin_etapa]
        })
    db.close()
    return result

def lead_crear(data):
    db = get_db()
    cursor = db.execute("""
        INSERT INTO leads (fecha, numero, nombre, canal, opcion, detalle, fuente, segmento, etapa)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (
        data.get("fecha", datetime.now().isoformat()),
        data.get("numero", ""),
        data.get("nombre", ""),
        data.get("canal", "WhatsApp"),
        data.get("opcion", ""),
        data.get("detalle", ""),
        data.get("fuente", ""),
        data.get("segmento", ""),
        data.get("etapa", "nuevo"),
    ))
    lid = cursor.lastrowid
    db.commit()
    db.close()
    return lid

def lead_obtener(lid):
    db = get_db()
    row = db.execute("""
        SELECT l.*, e.nombre as etapa_nombre, e.color as etapa_color, e.icono as etapa_icono
        FROM leads l LEFT JOIN etapas e ON l.etapa = e.clave WHERE l.id = ?
    """, (lid,)).fetchone()
    db.close()
    return dict(row) if row else None

def lead_actualizar(lid, data):
    db = get_db()
    fields = []
    vals = []
    # Detectar cambio de etapa para registrar actividad
    cambio_etapa = False
    if 'etapa' in data:
        old = db.execute("SELECT etapa FROM leads WHERE id = ?", (lid,)).fetchone()
        if old and old['etapa'] != data['etapa']:
            cambio_etapa = True
            old_etapa = old['etapa']

    for k in ("atendido", "resultado", "valor_estimado", "notas", "contactado_fecha", 
              "cliente_id", "etapa", "fuente", "segmento", "tags", "usuario_asignado",
              "fecha_cierre_estimada", "nombre", "numero", "detalle", "opcion"):
        if k in data:
            if k == "atendido":
                fields.append(f"{k} = ?")
                vals.append(1 if data[k] else 0)
                if data[k]:
                    fields.append("contactado_fecha = ?")
                    vals.append(datetime.now().strftime("%Y-%m-%d %H:%M"))
            else:
                fields.append(f"{k} = ?")
                vals.append(data[k])
    if not fields:
        db.close()
        return False
    vals.append(lid)
    db.execute(f"UPDATE leads SET {', '.join(fields)} WHERE id = ?", vals)

    # Registrar actividad de cambio de etapa
    if cambio_etapa:
        nueva_etapa_data = db.execute("SELECT nombre FROM etapas WHERE clave = ?", (data['etapa'],)).fetchone()
        nueva_nombre = nueva_etapa_data['nombre'] if nueva_etapa_data else data['etapa']
        old_etapa_data = db.execute("SELECT nombre FROM etapas WHERE clave = ?", (old_etapa,)).fetchone()
        old_nombre = old_etapa_data['nombre'] if old_etapa_data else (old_etapa or 'sin etapa')
        db.execute("""
            INSERT INTO actividades (lead_id, tipo, descripcion, detalle, usuario)
            VALUES (?, 'etapa', ?, ?, 'Pedro')
        """, (lid, f"Avanzó de {old_nombre} a {nueva_nombre}", json.dumps({'de': old_etapa, 'a': data['etapa']})))

    db.commit()
    db.close()
    return True

def lead_convertir_cliente(lid):
    db = get_db()
    lead = db.execute("SELECT * FROM leads WHERE id = ?", (lid,)).fetchone()
    if not lead:
        db.close()
        return None, "Lead no encontrado"
    lead = dict(lead)
    if lead["convertido_cliente"]:
        db.close()
        return lead["cliente_id"], "Ya convertido"

    nombre = lead.get("nombre", "")
    telefono = lead.get("numero", "")
    if not nombre and not telefono:
        db.close()
        return None, "El lead no tiene nombre ni teléfono"

    cursor = db.execute("""
        INSERT INTO clientes (lead_id, nombre, telefono, primer_contacto, clasificacion)
        VALUES (?,?,?,?,'Regular')
    """, (lid, nombre, telefono, lead.get("fecha", datetime.now().isoformat())))
    cid = cursor.lastrowid
    db.execute("UPDATE leads SET convertido_cliente = 1, cliente_id = ?, etapa = 'ganado' WHERE id = ?", (cid, lid))
    
    # Registrar actividad
    db.execute("""
        INSERT INTO actividades (lead_id, tipo, descripcion, usuario)
        VALUES (?, 'sistema', ?, 'Sistema')
    """, (lid, f"✅ Lead convertido a cliente (ID: {cid})"))
    
    db.commit()
    db.close()
    return cid, None

# ─── STATS PROFESIONALES ─────────────────────────────
def get_stats():
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    month_start = datetime.now().replace(day=1).strftime("%Y-%m-%d")

    # Pipeline counts
    pipeline = {}
    for r in db.execute("""
        SELECT COALESCE(etapa, 'sin_asignar') as e, COUNT(*) as c 
        FROM leads GROUP BY e
    """).fetchall():
        pipeline[r['e']] = r['c']

    # Tareas vencidas
    vencidas = db.execute("""
        SELECT COUNT(*) FROM tareas 
        WHERE completada = 0 AND vence != '' AND vence < date('now')
    """).fetchone()[0]

    stats = {
        "hoy": db.execute("SELECT COUNT(*) FROM leads WHERE date(fecha) = ?", (today,)).fetchone()[0],
        "semana": db.execute("SELECT COUNT(*) FROM leads WHERE (julianday('now') - julianday(fecha)) <= 7").fetchone()[0],
        "mes": db.execute("SELECT COUNT(*) FROM leads WHERE date(fecha) >= ?", (month_start,)).fetchone()[0],
        "pendientes": db.execute("SELECT COUNT(*) FROM leads WHERE atendido = 0 AND opcion NOT IN ('Respuesta genérica','Nuevo contacto')").fetchone()[0],
        "urgentes": db.execute("SELECT COUNT(*) FROM leads WHERE opcion = 'URGENTE' AND atendido = 0").fetchone()[0],
        "total": db.execute("SELECT COUNT(*) FROM leads").fetchone()[0],
        "clientes": db.execute("SELECT COUNT(*) FROM clientes").fetchone()[0],
        "ventas_activas": db.execute("SELECT COUNT(*) FROM ventas WHERE estado NOT IN ('Entregado','Cancelado')").fetchone()[0],
        "tareas_vencidas": vencidas,
        "pipeline": pipeline,
        "etapas": [dict(r) for r in db.execute("SELECT * FROM etapas ORDER BY orden").fetchall()],
    }
    db.close()
    return stats

def lead_ultimos_7_dias():
    db = get_db()
    rows = db.execute("""
        SELECT strftime('%w', fecha) as dia, COUNT(*) as total
        FROM leads WHERE (julianday('now') - julianday(fecha)) <= 7
        GROUP BY dia ORDER BY dia
    """).fetchall()
    db.close()
    return [dict(r) for r in rows]

def opciones_leads():
    db = get_db()
    rows = db.execute("SELECT DISTINCT opcion FROM leads WHERE opcion != '' ORDER BY opcion").fetchall()
    db.close()
    return [r["opcion"] for r in rows]

# ─── TAGS ────────────────────────────────────────────
def tag_listar():
    db = get_db()
    rows = db.execute("SELECT * FROM tags ORDER BY nombre").fetchall()
    db.close()
    return [dict(r) for r in rows]

def tag_crear(nombre, color="#3b82f6"):
    db = get_db()
    try:
        c = db.execute("INSERT INTO tags (nombre, color) VALUES (?,?)", (nombre, color))
        db.commit()
        db.close()
        return c.lastrowid
    except sqlite3.IntegrityError:
        db.close()
        return None

# ─── TAREAS ──────────────────────────────────────────
def tarea_listar(estado="", lead_id=None, limit=100, offset=0):
    db = get_db()
    params = []
    conditions = ["1"]
    if estado and estado != "todas":
        if estado == "pendientes":
            conditions.append("completada = 0")
        elif estado == "completadas":
            conditions.append("completada = 1")
        else:
            conditions.append("estado = ?")
            params.append(estado)
    if lead_id:
        conditions.append("lead_id = ?")
        params.append(lead_id)
    where = " AND ".join(conditions)
    query = "SELECT * FROM tareas WHERE " + where + " ORDER BY CASE WHEN vence != '' AND vence < date('now') AND completada = 0 THEN 0 ELSE 1 END, vence ASC, created_at DESC LIMIT ? OFFSET ?"
    rows = db.execute(query, params + [limit, offset]).fetchall()
    total = db.execute(f"SELECT COUNT(*) FROM tareas WHERE {where}", params).fetchone()[0]
    db.close()
    return [dict(r) for r in rows], total

def tarea_crear(data):
    db = get_db()
    cursor = db.execute("""
        INSERT INTO tareas (vence, cliente_lead, tarea, estado, prioridad, notas, lead_id)
        VALUES (?,?,?,?,?,?,?)
    """, (
        data.get("vence", ""),
        data.get("cliente_lead", ""),
        data.get("tarea", ""),
        data.get("estado", "Pendiente"),
        data.get("prioridad", "Media"),
        data.get("notas", ""),
        data.get("lead_id"),
    ))
    tid = cursor.lastrowid
    db.commit()
    db.close()
    return tid

def tarea_actualizar(tid, data):
    db = get_db()
    fields = []
    vals = []
    for k in ("estado", "prioridad", "notas", "completada", "vence", "tarea", "cliente_lead", "lead_id"):
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    if not fields:
        db.close()
        return False
    vals.append(tid)
    db.execute(f"UPDATE tareas SET {', '.join(fields)} WHERE id = ?", vals)
    db.commit()
    db.close()
    return True

# ─── CLIENTES ─────────────────────────────────────────
def cliente_listar(q="", limit=100, offset=0):
    db = get_db()
    params = []
    where = "1"
    if q:
        where = "(nombre LIKE ? OR telefono LIKE ?)"
        params = [f"%{q}%"] * 2
    rows = db.execute(
        f"SELECT * FROM clientes WHERE {where} ORDER BY ultimo_contacto DESC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()
    total = db.execute(f"SELECT COUNT(*) FROM clientes WHERE {where}", params).fetchone()[0]
    db.close()
    return [dict(r) for r in rows], total

def cliente_actualizar(cid, data):
    db = get_db()
    fields = []
    vals = []
    for k in ("nombre", "telefono", "email", "direccion", "ciudad", "clasificacion", "notas",
              "total_compras", "num_compras"):
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    if not fields:
        db.close()
        return False
    fields.append("ultimo_contacto = datetime('now','localtime')")
    vals.append(cid)
    db.execute(f"UPDATE clientes SET {', '.join(fields)} WHERE id = ?", vals)
    db.commit()
    db.close()
    return True

# ─── VENTAS ───────────────────────────────────────────
def venta_listar(estado="", limit=100, offset=0):
    db = get_db()
    params = []
    where = "1"
    if estado:
        where = "estado = ?"
        params = [estado]
    rows = db.execute(
        f"SELECT * FROM ventas WHERE {where} ORDER BY fecha_cotizacion DESC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()
    total = db.execute(f"SELECT COUNT(*) FROM ventas WHERE {where}", params).fetchone()[0]
    db.close()
    return [dict(r) for r in rows], total

def venta_crear(data):
    db = get_db()
    cursor = db.execute("""
        INSERT INTO ventas (lead_id, cliente_id, cliente_nombre, producto, capacidad,
                           valor_cotizado, estado, notas)
        VALUES (?,?,?,?,?,?,?,?)
    """, (
        data.get("lead_id"),
        data.get("cliente_id"),
        data.get("cliente_nombre", ""),
        data.get("producto", ""),
        data.get("capacidad", ""),
        data.get("valor_cotizado", 0),
        data.get("estado", "Cotizado"),
        data.get("notas", ""),
    ))
    vid = cursor.lastrowid
    db.commit()
    db.close()
    return vid

def venta_actualizar(vid, data):
    db = get_db()
    fields = []
    vals = []
    for k in ("estado", "valor_vendido", "deposito_50", "saldo_50",
              "fecha_inicio_fab", "fecha_entrega", "notas", "producto", "capacidad",
              "valor_cotizado", "cliente_nombre"):
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    if not fields:
        db.close()
        return False
    vals.append(vid)
    db.execute(f"UPDATE ventas SET {', '.join(fields)} WHERE id = ?", vals)
    db.commit()
    db.close()
    return True

# ─── MÉTRICAS ─────────────────────────────────────────
def get_conversion_funnel():
    """Datos del embudo de conversión"""
    db = get_db()
    funnel = []
    for r in db.execute("""
        SELECT e.clave, e.nombre, e.color, e.probabilidad, e.orden,
               COUNT(l.id) as total
        FROM etapas e
        LEFT JOIN leads l ON COALESCE(l.etapa, 'nuevo') = e.clave
        GROUP BY e.clave ORDER BY e.orden
    """).fetchall():
        funnel.append(dict(r))
    db.close()
    return funnel

def get_actividad_reciente():
    return actividad_listar_recientes(20)

# ─── PRECIOS CRUD ─────────────────────────────────────
def precio_listar(q=""):
    db = get_db()
    if q:
        rows = db.execute(
            "SELECT * FROM precios WHERE producto LIKE ? OR categoria LIKE ? OR tipo LIKE ? ORDER BY categoria, producto",
            (f"%{q}%", f"%{q}%", f"%{q}%")
        ).fetchall()
    else:
        rows = db.execute("SELECT * FROM precios ORDER BY categoria, producto").fetchall()
    db.close()
    return [dict(r) for r in rows]

def precio_crear(data):
    db = get_db()
    c = db.execute("""
        INSERT INTO precios (categoria, tipo, producto, capacidad, precio_base, precio_venta,
                            plazo_fabricacion, garantia, notas, incluye_instalacion)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (
        data.get('categoria',''), data.get('tipo',''), data.get('producto',''),
        data.get('capacidad',''), data.get('precio_base',0), data.get('precio_venta',0),
        data.get('plazo_fabricacion',''), data.get('garantia',''), data.get('notas',''),
        data.get('incluye_instalacion',0)
    ))
    db.commit(); db.close()
    return c.lastrowid

def precio_actualizar(pid, data):
    db = get_db()
    fields = [f"{k} = ?" for k in data]
    vals = list(data.values()) + [pid]
    db.execute(f"UPDATE precios SET {', '.join(fields)} WHERE id = ?", vals)
    db.commit(); db.close()

def precio_eliminar(pid):
    db = get_db()
    db.execute("DELETE FROM precios WHERE id = ?", (pid,))
    db.commit(); db.close()

# ─── DELETE ────────────────────────────────────────────
def lead_eliminar(lid):
    db = get_db()
    db.execute("DELETE FROM actividades WHERE lead_id = ?", (lid,))
    db.execute("DELETE FROM tareas WHERE lead_id = ?", (lid,))
    db.execute("DELETE FROM leads WHERE id = ?", (lid,))
    db.commit(); db.close()

def tarea_eliminar(tid):
    db = get_db()
    db.execute("DELETE FROM tareas WHERE id = ?", (tid,))
    db.commit(); db.close()

def actividad_eliminar(aid):
    db = get_db()
    db.execute("DELETE FROM actividades WHERE id = ?", (aid,))
    db.commit(); db.close()

def venta_eliminar(vid):
    db = get_db()
    db.execute("DELETE FROM ventas WHERE id = ?", (vid,))
    db.commit(); db.close()
