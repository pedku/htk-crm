# CRM HTK INGENIERIA — Especificación del Sistema

> Versión: 2.3 | Rama: `modular-frontend` | Fecha: 2026-05-15

---

## 1. Visión General

### ¿Qué es HTK CRM?
Sistema de gestión integral para **HTK INGENIERIA (HOUSETRONIK S.A.S.)**, empresa de automatización industrial, IoT, mantenimiento electrónico y cargadores eléctricos en Barranquilla, Colombia.

### Objetivo
Centralizar la relación con clientes y prospectos en un solo lugar: gestión de leads, conversión a clientes, órdenes de trabajo, inventario, automatización de prospección, y atención vía WhatsApp.

### Stack
| Capa | Tecnología |
|---|---|
| Backend | Flask (Python 3) + SQLite |
| Frontend | Bootstrap 5.3 + Bootstrap Icons + Vanilla JS (SPA) |
| Base de datos | SQLite (WAL mode, foreign keys ON) |
| WhatsApp | Puppeteer + Baileys (bot en Node.js, puerto 18802) |
| Despliegue | Cloudflare Tunnel (HTTPS) |
| Túneles | Cloudflare Tunnel (dominio principal) + Tailscale (desarrollo) |

---

## 2. Arquitectura de Archivos

```
htk-crm/
├── app/
│   ├── __init__.py            # Flask factory + init_db() + migraciones
│   ├── core/
│   │   ├── auth.py            # @login_required, admin_or_local_required
│   │   ├── db.py              # get_db(), next_id(), now_iso()
│   │   └── wo_types.py       # TIPOS_OT (reparación/fabricación/instalación)
│   ├── routes/
│   │   ├── views.py           # Rutas HTML (login, /, /leads/<id>, /ordenes/<id>, /bot-whatsapp)
│   │   ├── api_clients.py     # CRUD clientes + órdenes + pagos + notas
│   │   ├── api_leads.py       # CRUD leads + kanban + pipeline + interacciones + segmentos + tags
│   │   ├── api_wo.py          # CRUD órdenes de trabajo + kanban + pagos + plantillas + notificaciones
│   │   ├── api_bot.py         # Config bot + send-message + status + restart + silence
│   │   ├── api_inventory.py   # CRUD inventario + stock + movimientos + categorías
│   │   └── api_misc.py        # Stats, debug, pitches, automation scripts, sales, prices, tasks
│   └── services/
│       ├── bot_service.py     # cast_config_value, reload_bot_config, send_whatsapp, bot_action
│       ├── crm_service.py     # (placeholder)
│       └── wo_service.py      # wo_to_dict() — conversión OT a formato anidado
├── templates/
│   ├── base.html              # Shell principal (sidebar, topbar, mobile menu, modals)
│   ├── login.html             # Pantalla de login
│   ├── lead_detail.html       # Perfil dedicado de lead
│   ├── wo_detail.html         # Detalle de orden de trabajo
│   ├── bot_whatsapp.html      # Página del bot WhatsApp (SPA separada)
│   └── pages/                 # Templates modulares cargados vía Jinja {% include %}
│       ├── dashboard.html      # Métricas, funnel, leads recientes
│       ├── kanban.html         # Kanban leads + kanban órdenes de trabajo
│       ├── clients.html        # Tabla de clientes
│       ├── work_orders.html    # Tabla de órdenes de trabajo
│       ├── leads.html          # Tabla de prospectos
│       ├── interactions.html   # Timeline de interacciones
│       ├── automation.html     # Scripts de automatización
│       ├── inventario.html     # Control de inventario
│       └── config.html         # Configuración (General, Bot, Plantillas, Precios, Segmentos, Usuarios)
├── static/
│   ├── css/crm.css             # Todos los estilos (31KB)
│   └── js/crm.js               # Todo el JavaScript (169KB, ~3980 líneas)
├── bot/                        # Bot WhatsApp integrado
│   ├── bot.js                  # Lógica principal del bot
│   ├── config.js               # Configuración del bot
│   ├── messages.js             # Manejo de mensajes
│   ├── lid-resolver.js         # Resolución de @lid
│   └── ...                     # Otros módulos del bot
├── htk_crm.db                  # Base de datos SQLite
├── BUG_REPORT.md               # Documentación de bugs conocidos
└── build_modular.py            # Script de extracción de módulos (build tool)
```

---

## 3. Base de Datos — Schema Completo

### bot_config (17 rows)
```sql
CREATE TABLE bot_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  tipo TEXT DEFAULT 'texto',
  descripcion TEXT,
  categoria TEXT DEFAULT 'general'
)
```

### clients (3 rows)
```sql
CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    telefono TEXT DEFAULT '',
    nombre TEXT DEFAULT '',
    fuente TEXT DEFAULT '',
    primer_contacto TEXT DEFAULT NULL,
    ultimo_contacto TEXT DEFAULT NULL,
    interacciones_totales INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'lead',
    segmento TEXT DEFAULT 'consumidor',
    linea_interes TEXT DEFAULT 'varios',
    lead_id TEXT DEFAULT NULL,
    notas TEXT DEFAULT ''
, contacto_nombre TEXT DEFAULT '', direccion TEXT, ciudad TEXT DEFAULT 'Barranquilla', tipo_documento TEXT, documento TEXT, empresa TEXT, cargo TEXT, cumpleanos TEXT, redes_contacto TEXT, email TEXT DEFAULT '')
```

### etapas (7 rows)
```sql
CREATE TABLE etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT UNIQUE,
  nombre TEXT,
  orden INTEGER,
  color TEXT DEFAULT '#3b82f6',
  icono TEXT DEFAULT 'bi-circle',
  probabilidad INTEGER DEFAULT 0
)
```

### interactions (15 rows)
```sql
CREATE TABLE interactions (
    id TEXT PRIMARY KEY,
    lead_id TEXT DEFAULT NULL,
    lead_nombre TEXT DEFAULT '',
    tipo TEXT DEFAULT 'whatsapp',
    direccion TEXT DEFAULT 'recibido',
    resumen TEXT DEFAULT '',
    detalle TEXT DEFAULT '',
    fecha TEXT DEFAULT NULL,
    proximo_paso TEXT DEFAULT '',
    estado TEXT DEFAULT ''
)
```

### inventario (12 rows)
```sql
CREATE TABLE inventario (
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
```

### inventario_movimientos (3 rows)
```sql
CREATE TABLE inventario_movimientos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    tipo TEXT NOT NULL,
                    cantidad REAL NOT NULL,
                    motivo TEXT,
                    fecha TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES inventario(id)
                )
```

### leads (57 rows)
```sql
CREATE TABLE leads (
    id TEXT PRIMARY KEY,
    nombre TEXT DEFAULT '',
    contacto TEXT DEFAULT '',
    segmento TEXT DEFAULT 'consumidor',
    linea_interes TEXT DEFAULT 'varios',
    estado TEXT DEFAULT 'nuevo',
    fuente TEXT DEFAULT '',
    fecha_creacion TEXT DEFAULT NULL,
    proximo_seguimiento TEXT DEFAULT NULL,
    notas TEXT DEFAULT ''
, valor_estimado REAL, contacto_nombre TEXT DEFAULT '', telefono TEXT DEFAULT "", email TEXT DEFAULT "", url TEXT DEFAULT "", tipo_contacto TEXT DEFAULT "")
```

### lid_mappings (0 rows)
```sql
CREATE TABLE lid_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lid TEXT UNIQUE NOT NULL,
                numero TEXT DEFAULT ''
            )
```

### payments (1 rows)
```sql
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wo_id TEXT NOT NULL,
  monto REAL NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'abono',
  metodo TEXT,
  referencia TEXT,
  fecha TEXT NOT NULL,
  notas TEXT,
  registrado_por TEXT DEFAULT 'Pedro',
  FOREIGN KEY (wo_id) REFERENCES work_orders(id)
)
```

### precios (0 rows)
```sql
CREATE TABLE precios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT,
  producto TEXT,
  capacidad TEXT,
  precio_base REAL DEFAULT 0,
  precio_venta REAL DEFAULT 0,
  notas TEXT
)
```

### segmentos (11 rows)
```sql
CREATE TABLE segmentos (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT DEFAULT "#6c757d",
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT 1
)
```

### sqlite_sequence (7 rows)
```sql
CREATE TABLE sqlite_sequence(name,seq)
```

### tags (6 rows)
```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT,
  color TEXT DEFAULT '#3b82f6'
)
```

### tareas (0 rows)
```sql
CREATE TABLE tareas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT,
  tarea TEXT,
  estado TEXT DEFAULT 'pendiente',
  prioridad TEXT DEFAULT 'media',
  vence TEXT,
  created_at TEXT,
  completada INTEGER DEFAULT 0
)
```

### ventas (0 rows)
```sql
CREATE TABLE ventas (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  cliente_id TEXT,
  cliente_nombre TEXT,
  producto TEXT,
  capacidad TEXT,
  valor_cotizado REAL DEFAULT 0,
  valor_vendido REAL DEFAULT 0,
  estado TEXT DEFAULT 'cotizado',
  fecha TEXT,
  notas TEXT
)
```

### wo_templates (19 rows)
```sql
CREATE TABLE wo_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo_ot TEXT NOT NULL,
  estado_origen TEXT NOT NULL,
  asunto TEXT,
  mensaje TEXT NOT NULL,
  canal TEXT DEFAULT 'whatsapp',
  activo BOOLEAN DEFAULT 1
)
```

### work_order_client_links (1 rows)
```sql
CREATE TABLE work_order_client_links (
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    PRIMARY KEY (wo_id, client_id)
)
```

### work_order_history (7 rows)
```sql
CREATE TABLE work_order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    fecha TEXT DEFAULT NULL,
    estado TEXT DEFAULT '',
    descripcion TEXT DEFAULT '',
    notificado BOOLEAN DEFAULT 0
)
```

### work_orders (1 rows)
```sql
CREATE TABLE work_orders (
    id TEXT PRIMARY KEY,
    cliente_nombre TEXT DEFAULT '',
    cliente_telefono TEXT DEFAULT '',
    equipo_tipo TEXT DEFAULT 'otro',
    equipo_marca TEXT DEFAULT '',
    equipo_modelo TEXT DEFAULT '',
    falla_reportada TEXT DEFAULT '',
    diagnostico TEXT DEFAULT NULL,
    estado TEXT DEFAULT 'recibido',
    notas_internas TEXT DEFAULT '',
    activo BOOLEAN DEFAULT 1,
    fecha_recibido TEXT DEFAULT NULL,
    fecha_diagnostico TEXT DEFAULT NULL,
    fecha_presupuesto_aprobado TEXT DEFAULT NULL,
    fecha_completado TEXT DEFAULT NULL,
    fecha_entregado TEXT DEFAULT NULL
, presupuesto REAL, tipo TEXT NOT NULL DEFAULT 'reparacion', campos_extra TEXT DEFAULT '{}', valor_total REAL, client_id TEXT)
```



---

## 4. Frontend — Templates

### 4.1 base.html (Shell principal)
- Carga `static/css/crm.css`, Bootstrap CDN, Bootstrap Icons CDN
- Contenido: Mobile topbar, mobile menu overlay, save-flash, toast container, sidebar (11 tabs), topbar con búsqueda global, `{% include %}` de 9 templates de `pages/`, modals (genericModal, templateEditorModal)
- Scripts: Bootstrap bundle + `static/js/crm.js`

### 4.2 templates/pages/

| Archivo | Tab | Tamaño | Contenido clave |
|---|---|---|---|
| `dashboard.html` | Dashboard | 4.3KB | Stats cards, pipeline funnel, leads semanales, upcoming followups |
| `kanban.html` | Kanban | 5.2KB | Kanban leads (drag & drop) + Kanban OT (3 tipos) |
| `clients.html` | Clientes | 1.3KB | Tabla clientes con búsqueda, modal crear/editar, detalle con tabs |
| `work_orders.html` | Órdenes Trabajo | 1.9KB | Tabla OT con filtros, detalle con timeline, pagos, notificaciones |
| `leads.html` | Prospectos | 2.4KB | Tabla leads con filtros, modal crear/editar, detalle con perfil + pitches |
| `interactions.html` | Interacciones | 0.9KB | Timeline de todas las interacciones |
| `automation.html` | Automatización | 5.5KB | Scripts: enrich, score, schedule, campaign, backup |
| `inventario.html` | Inventario | 1.4KB | Tabla inventario con búsqueda/filtros, crear/editar/eliminar, ajuste stock |
| `config.html` | Configuración | 15KB | 6 sub-tabs: General, Bot WhatsApp, Plantillas OT, Precios, Segmentos, Usuarios |

### 4.3 Otras páginas
- `login.html` — Autenticación vía HTK_ADMIN_USER/PASS (default admin/htk2026)
- `lead_detail.html` — Perfil completo de lead con timeline + pitches
- `wo_detail.html` — Detalle de OT con historial + pagos
- `bot_whatsapp.html` — Página SPA de gestión del bot

---

## 5. Frontend — JavaScript (static/js/crm.js, ~3980 líneas)

### 5.1 Datos Globales
```js
const API = window.location.origin;
let clients = [], workOrders = [], leads = [], interactions = [];
let modalInstance = null;
let currentKanbanView = 'kanban';
let currentKanbanSub = 'wo';
let TIPOS_OT = {};
```

### 5.2 Constantes
- `ESTADOS_WO` — 24 estados (recibido..entregado + fabricación + instalación)
- `ESTADOS_LEAD` — 7 estados pipeline
- `ESTADOS_CLIENTE` — 4 estados (lead, contacto, cliente, inactivo)
- `LEAD_STATUS_ORDER` — Orden pipeline

### 5.3 Utilidades Compartidas
| Función | Propósito |
|---|---|
| `fetchJSON(url)` | Fetch autenticado |
| `showToast(msg, type)` | Toast notification |
| `formatCurrency(n)` | $1.234.567 |
| `escHtml(s)` | Escape HTML |
| `formatDate(iso)` | dd/mm/aaaa |
| `applyTheme()` / `toggleTheme()` | Dark/light mode |
| `handleLogout()` | Cerrar sesión |
| `loadSegments()` / `segmentOptionsHtml()` / `populateSegmentSelects()` | Segmentos dinámicos |
| `setModal(title, body, footer)` / `showModal(type, id)` / `saveModal(type, id)` / `deleteItem()` | CRUD modal |
| `searchGlobal()` | Búsqueda Ctrl+K |
| `checkBotStatus()` | Estado del bot (5 estados: conectado/sin WhatsApp/apagado/offline/no auth) |
| `restartBot()` | Reinicia bot vía /api/bot/restart |
| `updateNotifications()` / `loadOTNotifBadges()` | Badges sidebar |

### 5.4 Funciones por Tab
- **Dashboard:** `loadDashboard()`, `loadPipeline()`, `loadOTFinancialStats()`, `renderUpcomingFollowups()`
- **Kanban:** `loadKanban()`, `loadKanbanWO()`, `loadKanbanLeads()`, `switchKanbanWOTipo()`, `renderKanbanWO()`, `renderKanbanLeads()`, drag & drop handlers
- **Clientes:** `loadClients()`, `renderClients()`, `showClientDetail()`, `switchClientTab()`, `saveClientField()`
- **Órdenes Trabajo:** `loadWorkOrders()`, `renderWorkOrders()`, `showWODetail()`, `showStatusModal()`, `updateStatus()`, `notifyClient()`, `showPaymentModal()`, `savePayment()`
- **Prospectos:** `loadLeads()`, `renderLeads()`, `showLeadDetail()`, `convertLead()`, `changeLeadStage()`, `updateLeadField()`, `loadPitchTemplates()`, `renderPitchUI()`, `sendPitch()`
- **Interacciones:** `loadInteractions()`, `renderInteractions()`, `showAddInteraction()`, `saveInteraction()`
- **Automatización:** `runAuto()`, `showBackupList()`
- **Inventario:** `loadInventario()`, `saveInventarioItem()`, `deleteInventarioItem()`, `showAjusteStockModal()`, `ajustarStock()`
- **Configuración:** `switchConfigTab()`, `loadBotConfig()`, `guardarConfigBot()`, `recargarConfigBot()`, `loadTemplates()`, `renderTemplatesTable()`, `showTemplateEditor()`, `saveTemplate()`, `loadSegmentsTab()`, `loadGeneralConfig()`, `loadPricesTab()`

### 5.5 DOM Init
Al cargar: applyTheme → cargar TIPOS_OT → populateSegmentSelects → initConfigSubtabs → loadDashboard/Clients/WorkOrders/Leads → loadInteractions → checkBotStatus (cada 60s) → loadOTNotifBadges (cada 60s)

---

## 6. Backend — API Endpoints (52 endpoints)

### 6.1 Vistas HTML (views.py) — 6 rutas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET/POST | `/login` | No | Login |
| GET | `/logout` | No | Logout |
| GET | `/` | Local o auth | Página principal (base.html) |
| GET | `/leads/<lid>` | Local o auth | Perfil lead |
| GET | `/ordenes/<wid>` | Local o auth | Detalle OT |
| GET | `/bot-whatsapp` | Local o auth | Página bot |

### 6.2 API Bot (api_bot.py) — 11 rutas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET/PUT | `/api/bot/config` | GET: local/auth, PUT: auth | Config bot |
| POST | `/api/bot/config/reload` | Auth | Recargar config en bot |
| POST | `/api/send-message` | Auth | Enviar WhatsApp |
| POST | `/api/bot/silence` | Auth | Silenciar número |
| POST | `/api/bot/unsilence` | Auth | Dessilenciar |
| POST | `/api/bot/global-off` | Auth | Apagar bot |
| POST | `/api/bot/global-on` | Auth | Encender bot |
| GET | `/api/bot/status` | Local o auth | Estado (+connected) |
| POST | `/api/bot/restart` | Auth | Reiniciar vía systemd |
| GET | `/api/bot/log` | Auth | Log del bot |
| GET | `/api/lid/stats` | Auth | Stats @lid |

### 6.3 API Clientes (api_clients.py) — 5 rutas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET/POST | `/api/clients` | Auth | CRUD clientes |
| GET/PUT/DELETE | `/api/clients/<id>` | Auth | Cliente individual |
| PUT | `/api/clients/<id>/notes` | Auth | Notas |
| GET | `/api/clients/<id>/orders` | Auth | Órdenes vinculadas |
| GET | `/api/clients/<id>/payments` | Auth | Pagos vinculados |

### 6.4 API Leads (api_leads.py) — 16 rutas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/segments` | Auth | Segmentos |
| GET | `/api/etapas` | Local | Etapas pipeline |
| GET/POST | `/api/leads` | Auth | CRUD leads |
| GET/PUT/DELETE | `/api/leads/<id>` | Auth | Lead individual |
| POST | `/api/leads/<id>/convert` | Auth | Convertir lead→cliente |
| PUT | `/api/leads/<id>/notes` | Auth | Notas lead |
| GET/POST | `/api/interactions` | Auth | Interacciones |
| GET/POST | `/api/leads/<id>/interactions` | Auth | Interacciones de lead |
| GET | `/api/pipeline` | Local | Funnel conversión |
| GET | `/api/leads/kanban` | Local | Kanban leads |
| PATCH | `/api/leads/<id>/etapa` | Auth | Cambiar etapa |
| GET/POST | `/api/tags` | Local/Auth | Tags |
| GET | `/api/lead-week` | Local | Leads 7 días |
| GET | `/api/opciones` | Local | Opciones |
| GET | `/api/export` | Local | CSV |

### 6.5 API Órdenes Trabajo (api_wo.py) — 11 rutas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/work_orders/tipos` | Auth | Tipos OT |
| GET/POST | `/api/work_orders` | Auth | CRUD OT |
| GET/PUT/DELETE | `/api/work_orders/<id>` | Auth | OT individual |
| GET | `/api/work_orders/kanban` | Local | Kanban OT |
| PATCH | `/api/work_orders/<id>/kanban` | Auth | Mover en kanban |
| PUT | `/api/work_orders/<id>/status` | Auth | Cambiar estado |
| GET/POST | `/api/work_orders/<id>/payments` | Auth | Pagos |
| DELETE | `/api/work_orders/<id>/payments/<pid>` | Auth | Eliminar pago |
| POST | `/api/work_orders/<id>/notify` | Auth | Notificar WhatsApp |
| GET/POST | `/api/wo-templates` | Auth | Plantillas |
| GET/PUT/DELETE | `/api/wo-templates/<id>` | Auth | Plantilla individual |

### 6.6 API Inventario (api_inventory.py) — 6 rutas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/inventario/bajo-stock` | Auth | Bajo stock |
| GET/POST | `/api/inventario` | Auth | CRUD items |
| GET/PUT/DELETE | `/api/inventario/<id>` | Auth | Item individual |
| POST | `/api/inventario/<id>/ajustar` | Auth | Ajuste stock |
| GET | `/api/inventario/<id>/movimientos` | Auth | Movimientos |
| GET | `/api/inventario/categorias` | Auth | Categorías |

### 6.7 API Misc (api_misc.py) — 14 rutas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/stats` | Auth | Dashboard stats |
| GET | `/api/debug` | Local | Debug |
| GET/PUT | `/api/pitches` | Auth | Pitches |
| GET | `/api/pitches/by-segment/<s>` | Auth | Pitch x segmento |
| POST | `/api/auto/enrich` | Auth | Script enrich |
| GET | `/api/auto/score` | Auth | Script score |
| POST | `/api/auto/schedule` | Auth | Script schedule |
| POST | `/api/auto/campaign` | Auth | Script campaign |
| POST | `/api/auto/backup` | Auth | Backup DB |
| GET/POST | `/api/sales` | Auth | Ventas |
| PATCH/DELETE | `/api/sales/<id>` | Auth | Venta individual |
| GET/POST | `/api/prices` | Auth | Precios |
| PATCH/DELETE | `/api/prices/<id>` | Auth | Precio individual |
| GET/POST | `/api/tasks` | Auth | Tareas |
| PATCH/DELETE | `/api/tasks/<id>` | Auth | Tarea individual |

---

## 7. Servicios y Core

### bot_service.py
- `cast_config_value(value, tipo)` — Castea a bool/int/str/json
- `get_bot_config_flat()` — Dict {key: value} para bot.js
- `get_bot_config_verbose()` — Dict con metadata para frontend
- `reload_bot_config()` — POST a localhost:18802/reload-config
- `send_whatsapp(numero, mensaje)` — POST a localhost:18802/send
- `bot_action(action, payload)` — Proxy: silence/unsilence/global-on/off/status

### wo_service.py
- `wo_to_dict(conn, wo_id)` — Transforma fila DB → dict anidado (fechas, historial, pagos, cliente vinculado)

### auth.py
- `@login_required`: Requiere session. GET localhost sin auth. API retorna 401 JSON.
- `admin_or_local_required`: Auth para mutaciones, GET localhost sin auth.

### db.py
- `get_db()`: Conexión SQLite WAL + foreign keys
- `next_id(prefix, table)`: IDs secuenciales (PRO-049, CLI-001)
- `now_iso()`: Timestamp Colombia GMT-5

### wo_types.py
- `TIPOS_OT`: reparación (9 estados), fabricación (10), instalación (7)
- `get_estado_inicial(tipo)`: Retorna primer estado del tipo

---

## 8. Migraciones (init_db)

Al arrancar:
1. Agrega columnas faltantes a `leads`, `clients`, `work_orders`
2. Crea tablas: inventario, inventario_movimientos, payments, ventas, precios, tareas, segmentos, etapas, tags
3. Crea tablas bot: bot_config, lid_mappings, wo_templates
4. Seeds: inventario (12 items), etapas (7), segmentos (5), bot_config (18 keys), wo_templates (19 plantillas)

---

## 9. Integración Bot WhatsApp

- Bot: Node.js en `localhost:18802`
- Endpoints: /send, /status, /silence, /unsilence, /reload-config, /global-on, /global-off
- Reinicio: `systemctl --user restart htk-whatsapp-bot`
- Flujo config: CRM guarda en DB → POST /reload-config al bot → bot lee de CRM API

---

## 10. Workflows

### Lead → Cliente
nuevo → contactado → cotizado → negociacion → ganado → POST convert → cliente vinculado + sync bidireccional

### Órdenes de Trabajo
Crear con tipo + estado inicial → avanzar por workflow del tipo → pagos → notificaciones WhatsApp → historial

### Dashboard
/api/stats (totales) + /api/pipeline (funnel) + /api/lead-week (semanales) + followups próximos

---

## 11. Despliegue

| Entorno | Directorio | Rama | Puerto | URL |
|---|---|---|---|---|
| Producción | `htk-crm-v3/` | main (4b855ef) | 18800 | crm.htk-ingenieria.com |
| Desarrollo | `htk-crm-dev/` | modular-frontend | 18801 | v3.htk-ingenieria.com |

Archivados: `_archived/htk-crm-web_viejo`, `_archived/htk-crm_viejo`

---

## 12. Bugs Conocidos → BUG_REPORT.md

---

*Documento generado desde análisis del código fuente. Última actualización: 2026-05-15*
