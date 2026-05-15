"""migrate_crm.py — Migración profesional del CRM HTK"""
import sqlite3, os, json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "htk_crm.db")
LEADS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "leads.json")

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

print("🔧 Iniciando migración CRM profesional...")

# ─── 1. NUEVAS COLUMNAS EN LEADS ─────────────────────
print("📦 Agregando columnas a leads...")
migrations = [
    "ALTER TABLE leads ADD COLUMN etapa TEXT DEFAULT 'nuevo'",
    "ALTER TABLE leads ADD COLUMN fuente TEXT DEFAULT ''",
    "ALTER TABLE leads ADD COLUMN segmento TEXT DEFAULT ''",
    "ALTER TABLE leads ADD COLUMN tags TEXT DEFAULT ''",
    "ALTER TABLE leads ADD COLUMN ultima_actividad TEXT",
    "ALTER TABLE leads ADD COLUMN fecha_cierre_estimada TEXT",
    "ALTER TABLE leads ADD COLUMN usuario_asignado TEXT DEFAULT ''",
]
for m in migrations:
    try:
        c.execute(m)
        print(f"  ✅ {m.split()[-1]}")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print(f"  ⏭️ Ya existe: {m.split()[-1]}")
        else:
            print(f"  ⚠️ {e}")

# ─── 2. TABLA DE ACTIVIDADES ─────────────────────────
print("📦 Creando tabla actividades...")
c.execute("""
    CREATE TABLE IF NOT EXISTS actividades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,  -- llamada, whatsapp, email, nota, etapa, sistema
        descripcion TEXT NOT NULL,
        detalle TEXT DEFAULT '',
        usuario TEXT DEFAULT 'Pedro',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
""")
print("  ✅ actividades")

# ─── 3. TABLA DE ETAPAS ──────────────────────────────
print("📦 Creando tabla etapas...")
c.execute("""
    CREATE TABLE IF NOT EXISTS etapas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clave TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        orden INTEGER NOT NULL,
        color TEXT DEFAULT '#6b7280',
        icono TEXT DEFAULT 'bi-circle',
        probabilidad INTEGER DEFAULT 0
    )
""")

# Insertar etapas por defecto si no existen
etapas = [
    ('nuevo', '🆕 Nuevo', 1, '#3b82f6', 'bi-inbox', 0),
    ('contactado', '📞 Contactado', 2, '#8b5cf6', 'bi-telephone', 10),
    ('conversacion', '💬 En Conversación', 3, '#f59e0b', 'bi-chat-dots', 25),
    ('cotizacion', '📄 Cotización', 4, '#06b6d4', 'bi-file-text', 50),
    ('negociacion', '🤝 Negociación', 5, '#ec4899', 'bi-handshake', 75),
    ('ganado', '🏆 Ganado', 6, '#10b981', 'bi-trophy', 100),
    ('perdido', '❌ Perdido', 7, '#ef4444', 'bi-x-circle', 0),
]
for e in etapas:
    try:
        c.execute("INSERT OR IGNORE INTO etapas (clave, nombre, orden, color, icono, probabilidad) VALUES (?,?,?,?,?,?)", e)
    except Exception as ex:
        print(f"  ⚠️ {ex}")
print("  ✅ etapas (7 etapas)")

# ─── 4. TABLA DE TAGS ────────────────────────────────
print("📦 Creando tabla tags...")
c.execute("""
    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#3b82f6'
    )
""")

tags_iniciales = [
    ('Interesado', '#10b981'),
    ('Llamar después', '#f59e0b'),
    ('Correo rebotado', '#ef4444'),
    ('Cliente recurrente', '#8b5cf6'),
    ('Alta prioridad', '#dc2626'),
    ('Seguimiento semanal', '#06b6d4'),
]
for t in tags_iniciales:
    try:
        c.execute("INSERT OR IGNORE INTO tags (nombre, color) VALUES (?,?)", t)
    except:
        pass
print("  ✅ tags")

# ─── 5. MIGRAR LEADS DE JSON A SQLITE (si hay nuevos) ─
print("📦 Verificando leads pendientes desde JSON...")
try:
    if os.path.exists(LEADS_JSON):
        existing = {r['nombre'] for r in c.execute("SELECT nombre FROM leads").fetchall()}
        with open(LEADS_JSON, 'r') as f:
            json_leads = json.load(f)
        nuevos = 0
        for l in json_leads:
            if l.get('nombre') not in existing:
                c.execute("""
                    INSERT INTO leads (fecha, numero, nombre, canal, opcion, detalle, atendido, notas, fuente, segmento)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (
                    l.get('fecha_creacion', datetime.now().isoformat()),
                    l.get('contacto', ''),
                    l.get('nombre', ''),
                    l.get('fuente', 'Web'),
                    l.get('linea_interes', '').title(),
                    l.get('notas', ''),
                    0,
                    l.get('notas', ''),
                    l.get('fuente', 'Web'),
                    l.get('segmento', ''),
                ))
                nuevos += 1
        if nuevos:
            print(f"  ✅ Migrados {nuevos} nuevos leads desde JSON")
        else:
            print(f"  ✅ Sin leads nuevos para migrar")
except Exception as e:
    print(f"  ⚠️ Error migrando leads: {e}")

conn.commit()

# ─── 6. VERIFICAR ESTADO FINAL ───────────────────────
print("\n📊 Estado final:")
for t in ['leads', 'actividades', 'etapas', 'tags', 'clientes', 'ventas', 'tareas']:
    count = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"  {t}: {count} registros")

# Mostrar distribución de etapas
print("\n📊 Leads por etapa:")
for r in c.execute("""
    SELECT COALESCE(etapa, 'nuevo') as e, COUNT(*) as c 
    FROM leads GROUP BY e ORDER BY c DESC
""").fetchall():
    print(f"  {r['e']}: {r['c']}")

conn.close()
print("\n✅ Migración completa!")
