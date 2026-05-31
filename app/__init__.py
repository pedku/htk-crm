import os
import sqlite3
import logging
from flask import Flask

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'htk_crm.db')


def _ensure_columns(conn, table, expected_columns):
    """Add missing columns to an existing table."""
    try:
        info = conn.execute(f"PRAGMA table_info({table})").fetchall()
    except Exception:
        return
    existing = {r[1] for r in info}
    for col in expected_columns:
        if col not in existing:
            try:
                if col in ('activo',):
                    col_type = 'BOOLEAN DEFAULT 1'
                elif col in ('tipo_persona',):
                    col_type = "TEXT DEFAULT 'natural'"
                elif col in ('valor_total', 'presupuesto', 'valor_estimado'):
                    col_type = 'TEXT DEFAULT NULL'
                elif col in ('iva_incluido',):
                    col_type = 'INTEGER DEFAULT 0'
                else:
                    col_type = "TEXT DEFAULT ''"
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
                print(f"  → Migración: columna {col} agregada a {table}")
            except Exception as e:
                print(f"  ⚠ No se pudo agregar {col} a {table}: {e}")


def init_db():
    """Run migrations and seed data on startup."""
    from app.core.db import get_db, now_iso

    # ── Migración de columnas faltantes en tablas existentes ──
    migrate_conn = sqlite3.connect(DB_PATH)
    try:
        _ensure_columns(migrate_conn, 'leads', [
            'contacto_nombre', 'telefono', 'email', 'url'
        ])
        _ensure_columns(migrate_conn, 'clients', [
            'contacto_nombre', 'direccion', 'ciudad', 'tipo_documento',
            'documento', 'empresa', 'cargo', 'cumpleanos', 'redes_contacto', 'email',
            'tipo_persona', 'nombre_comercial'
        ])
        _ensure_columns(migrate_conn, 'work_orders', [
            'tipo', 'campos_extra', 'valor_total', 'client_id'
        ])
        migrate_conn.commit()
    finally:
        migrate_conn.close()

    # ── Tablas de Inventario ────────────────────────────
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute('''
            CREATE TABLE IF NOT EXISTS inventario (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE,
                nombre TEXT NOT NULL,
                categoria TEXT,
                unidad TEXT DEFAULT 'unidad',
                cantidad REAL DEFAULT 0,
                stock_minimo REAL DEFAULT 0,
                proveedor TEXT,
                costo_unitario REAL DEFAULT 0,
                ubicacion TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS inventario_movimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                tipo TEXT NOT NULL,
                cantidad REAL NOT NULL,
                motivo TEXT,
                fecha TEXT NOT NULL,
                FOREIGN KEY (item_id) REFERENCES inventario(id)
            )
        ''')
        # Seeds
        count = conn.execute("SELECT COUNT(*) FROM inventario").fetchone()[0]
        if count == 0:
            seeds = [
                ('CU-12', 'Alambre de cobre #12', 'bobinado', 'kg', 0, 5, 'Cobres del Norte', 58000, 'Estante A1'),
                ('CU-14', 'Alambre de cobre #14', 'bobinado', 'kg', 0, 5, 'Cobres del Norte', 48000, 'Estante A1'),
                ('CU-10', 'Alambre de cobre #10', 'bobinado', 'kg', 0, 3, 'Cobres del Norte', 72000, 'Estante A1'),
                ('NU-FE', 'Núcleo de ferrita', 'bobinado', 'unidad', 0, 2, 'Proveedor Nacional', 35000, 'Estante B2'),
                ('NU-SI', 'Núcleo de silicio', 'bobinado', 'unidad', 0, 2, 'Proveedor Nacional', 85000, 'Estante B2'),
                ('BA-01', 'Barniz aislante', 'bobinado', 'litro', 0, 2, 'Químicos del Caribe', 28000, 'Estante C1'),
                ('TE-01', 'Terminales de conexión', 'electronico', 'unidad', 0, 20, 'ElectroPartes Ltda', 800, 'Estante D3'),
                ('PR-TM', 'Protección termomagnética', 'protecciones', 'unidad', 0, 5, 'Schneider Electric', 45000, 'Estante E1'),
                ('PR-SP', 'Supresor de picos', 'protecciones', 'unidad', 0, 3, 'Schneider Electric', 35000, 'Estante E1'),
                ('GA-01', 'Gabinete metálico estándar', 'estructura', 'unidad', 0, 2, 'Metalúrgica del Norte', 120000, 'Estante F1'),
                ('CA-01', 'Cable AWG 10', 'electronico', 'metro', 0, 20, 'ElectroPartes Ltda', 3500, 'Estante D1'),
                ('CA-02', 'Cable AWG 12', 'electronico', 'metro', 0, 30, 'ElectroPartes Ltda', 2200, 'Estante D1'),
            ]
            conn.executemany(
                "INSERT INTO inventario (codigo, nombre, categoria, unidad, cantidad, stock_minimo, proveedor, costo_unitario, ubicacion) VALUES (?,?,?,?,?,?,?,?,?)",
                seeds
            )
            conn.commit()
            print(f"  → Inventario: {len(seeds)} items semilla insertados.")
    finally:
        conn.close()

    # ── Tablas de Facturación ───────────────────────
    conn_fac = sqlite3.connect(DB_PATH)
    try:
        conn_fac.execute("PRAGMA journal_mode=WAL")
        conn_fac.execute("PRAGMA foreign_keys=ON")
        # Ensure invoice_items has iva_incluido column
        _ensure_columns(conn_fac, 'invoice_items', ['iva_incluido'])
        conn_fac.execute('''
            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                wo_id TEXT,
                numero TEXT NOT NULL UNIQUE,
                estado TEXT DEFAULT 'borrador',
                fecha_emision TEXT NOT NULL,
                fecha_vencimiento TEXT NOT NULL,
                sub_total REAL DEFAULT 0,
                descuento REAL DEFAULT 0,
                iva_total REAL DEFAULT 0,
                total_general REAL DEFAULT 0,
                notas TEXT DEFAULT '',
                terminos TEXT DEFAULT '',
                metodo_pago TEXT DEFAULT '',
                pagada_fecha TEXT,
                activo BOOLEAN DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        ''')
        conn_fac.execute('''
            CREATE TABLE IF NOT EXISTS invoice_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id TEXT NOT NULL,
                item_num INTEGER NOT NULL,
                descripcion TEXT NOT NULL,
                cantidad REAL NOT NULL DEFAULT 1,
                precio_unitario REAL NOT NULL DEFAULT 0,
                iva_porcentaje REAL DEFAULT 19,
                iva_incluido INTEGER DEFAULT 0,
                total_linea REAL NOT NULL DEFAULT 0,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
            )
        ''')
        conn_fac.commit()
    finally:
        conn_fac.close()

    # ── Tablas Auxiliares (payments, ventas, precios, tareas, segmentos, etapas, tags) ──
    conn_aux = sqlite3.connect(DB_PATH)
    try:
        conn_aux.execute("PRAGMA journal_mode=WAL")
        conn_aux.execute('''
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wo_id TEXT DEFAULT NULL REFERENCES work_orders(id) ON DELETE SET NULL,
                invoice_id TEXT DEFAULT NULL REFERENCES invoices(id) ON DELETE SET NULL,
                monto REAL NOT NULL,
                tipo TEXT DEFAULT 'abono',
                metodo TEXT DEFAULT '',
                referencia TEXT DEFAULT '',
                fecha TEXT DEFAULT NULL,
                notas TEXT DEFAULT '',
                registrado_por TEXT DEFAULT ''
            )
        ''')
        try:
            conn_aux.execute('''
                ALTER TABLE payments ADD COLUMN invoice_id TEXT DEFAULT NULL REFERENCES invoices(id) ON DELETE SET NULL
            ''')
        except:
            pass
        conn_aux.execute('''
            CREATE TABLE IF NOT EXISTS ventas (
                id TEXT PRIMARY KEY,
                lead_id TEXT DEFAULT '',
                cliente_id TEXT DEFAULT '',
                cliente_nombre TEXT DEFAULT '',
                producto TEXT DEFAULT '',
                capacidad TEXT DEFAULT '',
                valor_cotizado REAL DEFAULT 0,
                valor_vendido REAL DEFAULT 0,
                estado TEXT DEFAULT 'cotizado',
                fecha TEXT DEFAULT NULL,
                notas TEXT DEFAULT ''
            )
        ''')
        conn_aux.execute('''
            CREATE TABLE IF NOT EXISTS precios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                categoria TEXT DEFAULT '',
                producto TEXT DEFAULT '',
                capacidad TEXT DEFAULT '',
                precio_base REAL DEFAULT 0,
                precio_venta REAL DEFAULT 0,
                notas TEXT DEFAULT ''
            )
        ''')
        conn_aux.execute('''
            CREATE TABLE IF NOT EXISTS tareas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id TEXT DEFAULT '',
                tarea TEXT DEFAULT '',
                estado TEXT DEFAULT 'pendiente',
                prioridad TEXT DEFAULT 'media',
                vence TEXT DEFAULT '',
                completada BOOLEAN DEFAULT 0,
                created_at TEXT DEFAULT NULL
            )
        ''')
        conn_aux.execute('''
            CREATE TABLE IF NOT EXISTS segmentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                label TEXT DEFAULT '',
                color TEXT DEFAULT '#3b82f6',
                orden INTEGER DEFAULT 0,
                activo BOOLEAN DEFAULT 1
            )
        ''')
        conn_aux.execute('''
            CREATE TABLE IF NOT EXISTS etapas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                clave TEXT UNIQUE NOT NULL,
                nombre TEXT DEFAULT '',
                color TEXT DEFAULT '#6b7280',
                icono TEXT DEFAULT '',
                probabilidad REAL DEFAULT 0,
                orden INTEGER DEFAULT 0
            )
        ''')
        conn_aux.execute('''
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                color TEXT DEFAULT '#3b82f6'
            )
        ''')
        conn_aux.commit()

        # Seed etapas if empty
        count_et = conn_aux.execute("SELECT COUNT(*) FROM etapas").fetchone()[0]
        if count_et == 0:
            etapas_seeds = [
                ('nuevo', 'Nuevo', '#6b7280', 'bi-star', 10, 1),
                ('contactado', 'Contactado', '#3b82f6', 'bi-chat', 25, 2),
                ('cotizado', 'Cotizado', '#f59e0b', 'bi-calculator', 50, 3),
                ('negociacion', 'Negociación', '#8b5cf6', 'bi-handshake', 75, 4),
                ('ganado', 'Ganado', '#10b981', 'bi-trophy', 100, 5),
                ('perdido', 'Perdido', '#ef4444', 'bi-x-circle', 0, 6),
                ('cliente', 'Cliente', '#06b6d4', 'bi-person-check', 100, 7),
            ]
            conn_aux.executemany(
                "INSERT INTO etapas (clave, nombre, color, icono, probabilidad, orden) VALUES (?, ?, ?, ?, ?, ?)",
                etapas_seeds
            )
            conn_aux.commit()
            print(f"  → Etapas: {len(etapas_seeds)} semilla insertadas.")

        # Seed segmentos if empty
        count_sg = conn_aux.execute("SELECT COUNT(*) FROM segmentos").fetchone()[0]
        if count_sg == 0:
            seg_seeds = [
                ('consumidor', 'Consumidor', '#6b7280', 1, 1),
                ('empresa', 'Empresa', '#3b82f6', 2, 1),
                ('hoteles', 'Hoteles', '#f59e0b', 3, 1),
                ('industria', 'Industria', '#ef4444', 4, 1),
                ('gobierno', 'Gobierno', '#10b981', 5, 1),
            ]
            conn_aux.executemany(
                "INSERT INTO segmentos (key, label, color, orden, activo) VALUES (?, ?, ?, ?, ?)",
                seg_seeds
            )
            conn_aux.commit()
            print(f"  → Segmentos: {len(seg_seeds)} semilla insertados.")
    finally:
        conn_aux.close()

    # ── Tablas de Bot Config ──
    conn2 = sqlite3.connect(DB_PATH)
    try:
        conn2.execute("PRAGMA journal_mode=WAL")
        conn2.execute('''
            CREATE TABLE IF NOT EXISTS bot_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT DEFAULT '',
                tipo TEXT DEFAULT 'str',
                descripcion TEXT DEFAULT '',
                categoria TEXT DEFAULT 'general'
            )
        ''')
        conn2.execute('''
            CREATE TABLE IF NOT EXISTS lid_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lid TEXT UNIQUE NOT NULL,
                numero TEXT DEFAULT ''
            )
        ''')
        # Seed bot_config if empty
        count_bc = conn2.execute("SELECT COUNT(*) FROM bot_config").fetchone()[0]
        if count_bc == 0:
            seeds_bot = [
                ('horario_semana_inicio', '8', 'int', 'Hora inicio L-V', 'horario'),
                ('horario_semana_fin', '18', 'int', 'Hora fin L-V', 'horario'),
                ('horario_sabado_inicio', '8', 'int', 'Hora inicio sábado', 'horario'),
                ('horario_sabado_fin', '13', 'int', 'Hora fin sábado', 'horario'),
                ('reset_timeout_ms', '1800000', 'int', 'Timeout sin actividad (ms)', 'comportamiento'),
                ('max_auto_mensajes', '5', 'int', 'Máx mensajes automáticos', 'comportamiento'),
                ('silenciar_lead_minutos', '30', 'int', 'Silenciar lead (minutos)', 'comportamiento'),
                ('silenciar_pitch_dias', '2', 'int', 'Silenciar pitch (días)', 'comportamiento'),
                ('auto_respuesta_activa', '1', 'bool', 'Auto-respuesta activa', 'comportamiento'),
                ('derivar_sin_respuesta', '1', 'bool', 'Derivar si no se entiende', 'comportamiento'),
                ('consulta_ot_activa', '1', 'bool', 'Activar consulta de OT', 'comportamiento'),
                ('mensaje_presentacion', 'Hola {nombre}, soy el asistente virtual de *HTK INGENIERIA* ⚡\n\n¿En qué puedo ayudarte hoy?', 'str', 'Mensaje de presentación', 'mensajes'),
                ('mensaje_bienvenida', '¡Bienvenido/a a HTK INGENIERIA! 👋\n\nSomos especialistas en ingeniería eléctrica:\n🔧 *Reparación* de equipos\n🏭 *Fabricación* de transformadores\n🚗 *Instalación* de cargadores EV\n\n¿Qué servicio te interesa?', 'str', 'Mensaje de bienvenida', 'mensajes'),
                ('mensaje_fuera_horario', 'Gracias por escribir a HTK INGENIERIA. En este momento estamos fuera del horario de atención.\n\n⏰ L-V 8am-6pm | Sáb 8am-1pm\n\nTe responderemos apenas abramos. ¡Gracias por tu paciencia! 🙏', 'str', 'Mensaje fuera de horario', 'mensajes'),
                ('mensaje_derivar', 'Un momento, te conecto con un ingeniero de HTK para darte información más detallada. 🙌\n\nPedro te responderá pronto. ¡Gracias!', 'str', 'Mensaje derivación', 'mensajes'),
                ('mensaje_despedida', '¡Gracias por contactar a HTK INGENIERIA! ⚡\n\nSi necesitas algo más, aquí estoy. ¡Que tengas un excelente día!', 'str', 'Mensaje despedida', 'mensajes'),
                ('crm_api_url', 'http://localhost:18800', 'str', 'URL del CRM', 'conexion'),
                ('bot_global_off', '0', 'bool', 'Bot apagado globalmente', 'conexion'),
                # ── Control de chat activo (Pedro atiende desde la bandeja) ──
                ('active_chat_cooldown_min', '10', 'int', 'Cooldown chat activo (min). Default: 10min', 'comportamiento'),
                ('active_chat_ttl_min', '60', 'int', 'TTL total chat activo (min). Default: 60min', 'comportamiento'),
                ('inactividad_aviso_min', '5', 'int', 'Min sin respuesta antes de avisar inactividad', 'comportamiento'),
                ('inactividad_cierre_min', '10', 'int', 'Min sin respuesta antes de cerrar por inactividad', 'comportamiento'),
                # ── Mensajes de inactividad y cierre ──
                ('msg_aviso_inactividad', '¿Sigues ahí? Te recordamos que estamos pendientes de tu mensaje. En 5 minutos cerraremos esta conversación si no hay respuesta.', 'str', 'Aviso de inactividad (chat activo)', 'mensajes'),
                ('msg_cierre_inactividad', 'Conversación cerrada por inactividad. Si necesitas algo más, escribe *HOLA* para continuar.', 'str', 'Cierre por inactividad', 'mensajes'),
                ('msg_reapertura', 'La conversación anterior ha finalizado. ¿En qué puedo ayudarte?\n\n— *MENU* para ver servicios\n— O cuéntame directamente', 'str', 'Reapertura tras chat activo', 'mensajes'),
                ('iva_default', '19', 'float', 'IVA por defecto (%)', 'facturacion'),
            ]
            conn2.executemany(
                "INSERT INTO bot_config (key, value, tipo, descripcion, categoria) VALUES (?, ?, ?, ?, ?)",
                seeds_bot
            )
            conn2.commit()
            print(f"  → Bot config: {len(seeds_bot)} keys semilla insertadas.")
    finally:
        conn2.close()

    # ── Seed WO Templates ──
    seed_conn = get_db()
    try:
        # Create table if not exists
        seed_conn.execute('''
            CREATE TABLE IF NOT EXISTS wo_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                tipo_ot TEXT DEFAULT '*',
                estado_origen TEXT DEFAULT '',
                asunto TEXT DEFAULT '',
                mensaje TEXT NOT NULL,
                canal TEXT DEFAULT 'whatsapp',
                activo BOOLEAN DEFAULT 1
            )
        ''')
        seed_conn.commit()
        count = seed_conn.execute("SELECT COUNT(*) FROM wo_templates").fetchone()[0]
        if count == 0:
            seeds = [
                ('Reparación — Recibido', 'reparacion', 'recibido', 'Tu orden en HTK',
                 '🔧 *HTK INGENIERIA*\n\n{cliente}, recibimos tu *{equipo}*.\nTu orden es: *{id}*\n\nLo revisaremos y te enviaremos el diagnóstico.\n⏱ Tiempo estimado: 48-72h', 'whatsapp', 1),
                ('Reparación — Presupuestado', 'reparacion', 'presupuestado', 'Diagnóstico completado',
                 '📋 *Diagnóstico completado*\n\n{cliente}, orden *{id}*\nEquipo: {equipo}\nDiagnóstico: {diagnostico}\nPresupuesto: *${presupuesto}*\n\nResponde *APROBAR* para iniciar la reparación.', 'whatsapp', 1),
                ('Reparación — Reparando', 'reparacion', 'reparando', 'Equipo en reparación',
                 '🔧 *Tu equipo está en reparación*\n\n{cliente}, orden *{id}* — {equipo}\n\nEstado actual: *{estado}*\nTe avisaremos cuando esté listo. ⚡', 'whatsapp', 1),
                ('Reparación — Esperando Repuestos', 'reparacion', 'esperando_repuestos', 'Actualización de tu orden',
                 '⏳ *Actualización de tu orden*\n\n{cliente}, orden *{id}* — {equipo}\n\nEstamos esperando repuestos. Te avisaremos cuando lleguen.\nGracias por tu paciencia 🙏', 'whatsapp', 1),
                ('Reparación — Completado', 'reparacion', 'completado', '¡Tu equipo está listo!',
                 '✅ *¡Tu equipo está listo!*\n\n{cliente}, orden *{id}* — {equipo}\n\nPuedes recogerlo en nuestro taller:\n📍 Barranquilla\n💰 Total: ${presupuesto}\n\n¡Gracias por confiar en HTK! ⚡', 'whatsapp', 1),
                ('Fabricación — Cotizando', 'fabricacion', 'cotizando', 'Cotizando tu equipo',
                 '🏭 *HTK INGENIERIA*\n\n{cliente}, estamos cotizando tu {tipo_producto} {capacidad}.\nTe enviamos la propuesta pronto.', 'whatsapp', 1),
                ('Fabricación — Diseño Aprobado', 'fabricacion', 'diseno_aprobado', 'Diseño aprobado',
                 '✅ Diseño aprobado. Iniciamos fabricación de tu {tipo_producto} {capacidad}.\nOrden: *{id}*', 'whatsapp', 1),
                ('Fabricación — Materiales', 'fabricacion', 'materiales', 'Adquiriendo materiales',
                 '📦 Adquiriendo materiales para tu {tipo_producto}.\n{id}', 'whatsapp', 1),
                ('Fabricación — Bobinado', 'fabricacion', 'bobinado', 'En proceso de bobinado',
                 '🔧 En proceso de bobinado. {id} — {tipo_producto} {capacidad}.', 'whatsapp', 1),
                ('Fabricación — Ensamble', 'fabricacion', 'ensamble', 'Ensamblando equipo',
                 '🔩 Ensamblando tu {tipo_producto}. {id}', 'whatsapp', 1),
                ('Fabricación — Pruebas', 'fabricacion', 'pruebas', 'Probando equipo',
                 '⚡ Probando tu {tipo_producto}. Verificamos voltajes y protección. {id}', 'whatsapp', 1),
                ('Fabricación — Control Calidad', 'fabricacion', 'control_calidad', 'Control de calidad aprobado',
                 '✅ Control de calidad aprobado. {id} — {tipo_producto} listo.', 'whatsapp', 1),
                ('Fabricación — Finalizado', 'fabricacion', 'finalizado', '¡Fabricación completada!',
                 '🏁 *¡Fabricación completada!*\n\n{id} — {tipo_producto} {capacidad}\nTotal: ${presupuesto}\n\nGracias por confiar en HTK INGENIERIA ⚡', 'whatsapp', 1),
                ('Instalación — Agendado', 'instalacion', 'agendado', 'Instalación agendada',
                 '📅 Instalación agendada: {fecha_agendada}\nTécnico: {tecnico_asignado}\n{id}', 'whatsapp', 1),
                ('Instalación — En Sitio', 'instalacion', 'en_sitio', 'Técnico en sitio',
                 '👷 Técnico en sitio. Iniciando instalación de tu {tipo_cargador}. {id}', 'whatsapp', 1),
                ('Instalación — Instalando', 'instalacion', 'instalando', 'Instalando cargador',
                 '🔌 Instalando {tipo_cargador} {potencia}. {id}', 'whatsapp', 1),
                ('Instalación — Pruebas', 'instalacion', 'pruebas', 'Realizando pruebas',
                 '⚡ Realizando pruebas del cargador. {id}', 'whatsapp', 1),
                ('Instalación — Finalizado', 'instalacion', 'finalizado', 'Instalación completada',
                 '✅ Instalación completada. {id} — {tipo_cargador}. ¡Disfruta!', 'whatsapp', 1),
                ('Instalación — Facturado', 'instalacion', 'facturado', 'Factura emitida',
                 '📄 Factura emitida. {id} — Total: ${presupuesto}. Gracias por confiar en HTK.', 'whatsapp', 1),
            ]
            seed_conn.executemany(
                "INSERT INTO wo_templates (nombre, tipo_ot, estado_origen, asunto, mensaje, canal, activo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                seeds
            )
            seed_conn.commit()
            print(f"  → {len(seeds)} plantillas de notificación insertadas.")
        else:
            print(f"  → {count} plantillas ya existen en wo_templates — seeds omitidos.")
    finally:
        seed_conn.close()


def create_app():
    app = Flask(__name__, template_folder='../templates', static_folder='../static')
    app.secret_key = 'htk-crm-secret-key-2026-cambiame'

    # Run DB migrations and seeds
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        print("⚠ DB no encontrada. Ejecuta migrate_to_sqlite.py primero.")
    init_db()

    # Logging estructurado (F1.2)
    from app.logging_config import setup_logging
    setup_logging(app)

    # Register Blueprints
    from app.routes.views import views_bp
    from app.routes.api_leads import api_leads_bp
    from app.routes.api_clients import api_clients_bp
    from app.routes.api_wo import api_wo_bp
    from app.routes.api_bot import api_bot_bp
    from app.routes.api_inventory import api_inventory_bp
    from app.routes.api_misc import api_misc_bp
    from app.routes.api_invoices import api_invoices_bp

    app.register_blueprint(views_bp)
    app.register_blueprint(api_leads_bp)
    app.register_blueprint(api_clients_bp)
    app.register_blueprint(api_wo_bp)
    app.register_blueprint(api_bot_bp)
    app.register_blueprint(api_inventory_bp)
    app.register_blueprint(api_misc_bp)
    app.register_blueprint(api_invoices_bp)

    # Healthcheck endpoint (F1.3)
    from app.routes.health import health_bp
    app.register_blueprint(health_bp)

    # Cache-busting: evitar que el navegador cachee HTML
    @app.after_request
    def add_no_cache_header(response):
        # Prevent Cloudflare and browser from caching any assets
        ct = response.content_type or ''
        if 'text/html' in ct or 'javascript' in ct or 'css' in ct or 'json' in ct or 'image/' in ct:
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    return app