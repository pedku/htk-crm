# CRM HTK INGENIERIA — Especificación Técnica Completa

> **Versión:** 2.0 (SQLite)  
> **Última actualización:** 2026-05-13  
> **Empresa:** HOUSETRONIK S.A.S. — HTK INGENIERIA  
> **Ubicación:** Barranquilla, Colombia  
> **Stack:** Flask 3.x + SQLite 3 + Bootstrap 5 + Vanilla JS  

---

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [Base de Datos (SQLite)](#2-base-de-datos-sqlite)
3. [Backend — crm_app.py](#3-backend--crm_apppy)
4. [Frontend — index.html (SPA)](#4-frontend--indexhtml-spa)
5. [Scripts de Automatización](#5-scripts-de-automatización)
6. [Archivos de Datos](#6-archivos-de-datos)
7. [Skills de Prospección](#7-skills-de-prospección)
8. [Sistema de Órdenes de Trabajo](#8-sistema-de-órdenes-de-trabajo)
9. [Integraciones](#9-integraciones)
10. [Flujo de Datos](#10-flujo-de-datos)
11. [Seguridad](#11-seguridad)
12. [Próximos Pasos / Mejoras Potenciales](#12-próximos-pasos--mejoras-potenciales)

---

## 1. Arquitectura General

### 1.1 Stack Tecnológico

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Lenguaje Backend | Python | 3.14 |
| Framework Web | Flask | 3.x |
| Base de Datos | SQLite 3 (modo WAL) | 3.x |
| Frontend CSS | Bootstrap 5 (CDN) | 5.3.3 |
| Frontend JS | Vanilla JavaScript | ES6+ |
| Iconos | Bootstrap Icons (CDN) | 1.11.3 |
| Túnel Público | Cloudflare Tunnel | — |
| Orquestación IA | OpenClaw Gateway | v2026.5.3-1 |
| WhatsApp Bot | Node.js 24.15 | Servicio independiente |
| SO | Ubuntu Linux (peku-hp) | 7.0.0-14-generic (x64) |

### 1.2 Servicios Systemd

| Servicio | Puerto | Ruta | Descripción |
|----------|--------|------|-------------|
| `openclaw-gateway` | 18789 | `/home/peku/.config/nvm/...` | Orquestador de agentes IA, cron, sesiones |
| `htk-crm` | 18800 | `/home/peku/htk-crm-web/` | CRM antiguo (V1, legacy, corriendo en 18800) |
| `htk-crm-principal` | 5000 | `/home/peku/htk-crm/` | CRM principal (V2, path antiguo) |
| `htk-whatsapp-bot` | 18802 | `/home/peku/htk-whatsapp-bot/` | Bot WhatsApp Node.js |
| `htk-web` | 8080 | `/home/peku/htk-web/` | Sitio web estático HTK |
| `cloudflared-tunnel` | — | — | Túnel público (`crm.htk-ingenieria.com`) |

**Nota:** El CRM V2 actual se ejecuta desde `/home/peku/.openclaw/workspace/crm/crm_app.py` en puerto 18800 (iniciado manualmente o vía htk-crm.service). El servicio `htk-crm` apunta a `/home/peku/htk-crm-web/` (V1 legacy).

### 1.3 Estructura de Directorios

```
/home/peku/.openclaw/workspace/
├── AGENTS.md                    # Reglas del agente IA
├── SOUL.md                      # Personalidad y principios
├── IDENTITY.md                  # Identidad del asistente
├── USER.md                      # Perfil de Pedro Castro
├── TOOLS.md                     # Manejo de archivos
├── MEMORY.md                    # Memoria a largo plazo
├── memory/                      # Notas diarias
├── crm/                         # ⭐ CRM — Corazón operativo
│   ├── crm_app.py               # Backend Flask (~1360 líneas)
│   ├── htk_crm.db               # Base de datos SQLite
│   ├── templates/
│   │   ├── index.html           # SPA principal (~3980 líneas)
│   │   ├── login.html           # Página de login
│   │   ├── lead_detail.html     # Perfil de lead
│   │   └── bot_whatsapp.html    # Panel bot WhatsApp
│   ├── backup_db.sh             # Script de backup
│   ├── backups/                 # Backups rotativos
│   ├── parse_contacto.py        # Parser de contactos
│   ├── migrate_to_sqlite.py     # Migración inicial
│   ├── CRM_PLAN.md              # Plan de desarrollo
│   ├── PLAN_MIGRACION_V3.md     # Plan de migración
│   └── README.md                # Documentación
├── scripts/                     # Scripts de automatización
│   ├── auto_enrich.py           # Enriquecimiento de leads
│   ├── auto_score.py            # Scoring de leads
│   ├── auto_schedule.py         # Programación de seguimientos
│   ├── auto_campaign.py         # Campañas de prospección
│   └── archive_conversation.py  # Archivo de conversaciones
├── data/                        # Datos y configuraciones
│   ├── pitches.json             # Plantillas de mensajes
│   ├── pitches.md               # Documentación de pitches
│   ├── notifications.json       # Plantillas de notificación WO
│   ├── schema.md                # Esquema legacy (JSON)
│   └── conversations/           # Conversaciones archivadas
├── skills/                      # Skills del agente
│   └── lead-finder/
│       ├── SKILL.md             # Workflow de prospección
│       ├── scripts/             # Scrapers y utilidades
│       └── references/          # Criterios de calificación
└── docs/                        # Documentación adicional
```

### 1.4 Diagrama de Despliegue

```
┌─────────────────────────────────────────────────────────────┐
│                     peku-hp (Ubuntu)                        │
│                                                             │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ openclaw-gateway │  │  htk-crm     │  │ whatsapp-bot │ │
│  │    :18789        │  │  :18800      │  │   :18802     │ │
│  │  (Orquestación)  │  │  (Flask+DB)  │  │  (Node.js)   │ │
│  └────────┬─────────┘  └──────┬───────┘  └──────┬───────┘ │
│           │                   │                  │          │
│           │         ┌─────────┴─────────┐        │          │
│           │         │  htk_crm.db       │        │          │
│           │         │  (SQLite, WAL)    │        │          │
│           │         └───────────────────┘        │          │
│           │                                      │          │
│  ┌────────┴──────────┐              ┌────────────┴───────┐ │
│  │  cloudflared      │              │  WhatsApp API     │ │
│  │  tunnel           │              │  (Meta Business)  │ │
│  └────────┬──────────┘              └────────────────────┘ │
│           │                                                │
└───────────┼────────────────────────────────────────────────┘
            │
    ┌───────┴───────┐
    │   Internet    │
    │ crm.htk-      │
    │ ingenieria.com│
    └───────────────┘
```

---

## 2. Base de Datos (SQLite)

### 2.1 Resumen de Tablas

| # | Tabla | Descripción | ID Pattern |
|---|-------|-------------|------------|
| 1 | `leads` | Prospectos / leads de negocio | PRO-XXX |
| 2 | `clients` | Clientes convertidos | CLI-XXX |
| 3 | `work_orders` | Órdenes de trabajo | HTK-XXX |
| 4 | `work_order_history` | Historial de estados WO | autoincremental |
| 5 | `work_order_client_links` | Relación M:N WO ↔ Cliente | compuesta |
| 6 | `interactions` | Interacciones con leads/clientes | INT-YYYYMMDD-HHMMSS-uuid |
| 7 | `segmentos` | Catálogo de segmentos de mercado | key (texto) |
| 8 | `etapas` | Etapas del pipeline de ventas | autoincremental |
| 9 | `ventas` | Cotizaciones y ventas | VTA-YYYYMMDDHHMMSS |
| 10 | `precios` | Catálogo de precios | autoincremental |
| 11 | `tareas` | Tareas y seguimientos | autoincremental |
| 12 | `tags` | Etiquetas para leads | autoincremental |

**Configuración de BD:** `PRAGMA journal_mode=WAL` | `PRAGMA foreign_keys=ON`

### 2.2 Esquema Detallado

#### 2.2.1 Tabla `leads`

```sql
CREATE TABLE leads (
    id TEXT PRIMARY KEY,                    -- PRO-001, PRO-002...
    nombre TEXT DEFAULT '',                 -- Nombre del contacto o empresa
    contacto TEXT DEFAULT '',               -- Info de contacto (legacy)
    contacto_nombre TEXT DEFAULT '',        -- Nombre del contacto individual
    telefono TEXT DEFAULT '',               -- Número telefónico
    email TEXT DEFAULT '',                  -- Correo electrónico
    url TEXT DEFAULT '',                    -- Sitio web del lead
    tipo_contacto TEXT DEFAULT '',          -- Tipo: email, whatsapp, llamada
    segmento TEXT DEFAULT 'consumidor',     -- Segmento de mercado
    linea_interes TEXT DEFAULT 'varios',    -- Línea de servicio interesada
    estado TEXT DEFAULT 'nuevo',            -- Estado/etapa del pipeline
    fuente TEXT DEFAULT '',                 -- Fuente de origen
    fecha_creacion TEXT DEFAULT NULL,       -- ISO datetime
    proximo_seguimiento TEXT DEFAULT NULL,  -- ISO datetime
    notas TEXT DEFAULT '',                  -- Notas internas
    valor_estimado REAL                     -- Valor estimado en COP
);
```

**Estados posibles:** `nuevo`, `contactado`, `cotizado`, `negociacion`, `ganado`, `perdido`, `cliente`

**Segmentos comunes:** `B2B taller`, `B2B industria`, `B2B comercio`, `distribuidor cargadores`, `hoteles`, `restaurantes`, `energia solar`, `consumidor`

**Líneas de interés:** `mantenimiento`, `automatizacion`, `iot`, `cargadores`, `varios`

#### 2.2.2 Tabla `clients`

```sql
CREATE TABLE clients (
    id TEXT PRIMARY KEY,                    -- CLI-001, CLI-002...
    telefono TEXT DEFAULT '',               -- Teléfono principal
    nombre TEXT DEFAULT '',                 -- Nombre del cliente
    contacto_nombre TEXT DEFAULT '',        -- Nombre del contacto
    fuente TEXT DEFAULT '',                 -- Fuente de origen
    primer_contacto TEXT DEFAULT NULL,      -- ISO datetime
    ultimo_contacto TEXT DEFAULT NULL,      -- ISO datetime
    interacciones_totales INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'lead',             -- lead | contacto | cliente | inactivo
    segmento TEXT DEFAULT 'consumidor',
    linea_interes TEXT DEFAULT 'varios',
    lead_id TEXT DEFAULT NULL,              -- FK → leads.id (origen)
    notas TEXT DEFAULT ''                   -- Notas internas
);
```

#### 2.2.3 Tabla `work_orders`

```sql
CREATE TABLE work_orders (
    id TEXT PRIMARY KEY,                    -- HTK-001, HTK-002...
    cliente_nombre TEXT DEFAULT '',         -- Nombre del cliente
    cliente_telefono TEXT DEFAULT '',       -- Teléfono del cliente
    equipo_tipo TEXT DEFAULT 'otro',        -- Tipo de equipo
    equipo_marca TEXT DEFAULT '',           -- Marca del equipo
    equipo_modelo TEXT DEFAULT '',          -- Modelo del equipo
    falla_reportada TEXT DEFAULT '',        -- Falla descrita por el cliente
    diagnostico TEXT DEFAULT NULL,          -- Diagnóstico técnico
    presupuesto REAL,                       -- Presupuesto en COP
    estado TEXT DEFAULT 'recibido',         -- Estado actual WO
    notas_internas TEXT DEFAULT '',         -- Notas para uso interno
    activo BOOLEAN DEFAULT 1,              -- 1 = activo, 0 = archivado
    fecha_recibido TEXT DEFAULT NULL,       -- ISO datetime
    fecha_diagnostico TEXT DEFAULT NULL,
    fecha_presupuesto_aprobado TEXT DEFAULT NULL,
    fecha_completado TEXT DEFAULT NULL,
    fecha_entregado TEXT DEFAULT NULL
);
```

**Estados de WO:** `recibido` → `diagnosticando` → `presupuestado` → `aprobado` → `reparando` | `esperando_repuestos` → `completado` → `entregado` | `cancelado`

**Tipos de equipo:** `aire_acondicionado`, `lavadora`, `refrigerador`, `plc`, `variador`, `fuente`, `electrodomestico`, `cargador`, `otro`

#### 2.2.4 Tabla `work_order_history`

```sql
CREATE TABLE work_order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    fecha TEXT DEFAULT NULL,                -- ISO datetime del cambio
    estado TEXT DEFAULT '',                 -- Estado registrado
    descripcion TEXT DEFAULT '',            -- Descripción del cambio
    notificado BOOLEAN DEFAULT 0           -- Si se notificó al cliente
);
```

Cada cambio de estado en una WO genera automáticamente una entrada en esta tabla.

#### 2.2.5 Tabla `work_order_client_links`

```sql
CREATE TABLE work_order_client_links (
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    PRIMARY KEY (wo_id, client_id)
);
```

Relación muchos-a-muchos con eliminación en cascada. Al crear una WO, el sistema intenta vincularla automáticamente con un cliente por nombre o teléfono.

#### 2.2.6 Tabla `interactions`

```sql
CREATE TABLE interactions (
    id TEXT PRIMARY KEY,                    -- INT-YYYYMMDD-HHMMSS-uuid
    lead_id TEXT DEFAULT NULL,              -- FK → leads.id
    lead_nombre TEXT DEFAULT '',            -- Nombre del lead (denormalizado)
    tipo TEXT DEFAULT 'whatsapp',           -- Tipo de interacción
    direccion TEXT DEFAULT 'recibido',      -- entrante | saliente
    resumen TEXT DEFAULT '',                -- Resumen breve
    detalle TEXT DEFAULT '',                -- Detalle completo
    fecha TEXT DEFAULT NULL,                -- ISO datetime
    proximo_paso TEXT DEFAULT '',           -- Siguiente acción planeada
    estado TEXT DEFAULT ''                  -- pendiente | completado
);
```

**Tipos de interacción:** `whatsapp`, `llamada`, `email`, `manual`, `presencial`, `pitch`

#### 2.2.7 Tabla `segmentos`

```sql
CREATE TABLE segmentos (
    key TEXT PRIMARY KEY,                   -- Clave única del segmento
    label TEXT NOT NULL,                    -- Etiqueta visible
    color TEXT DEFAULT '#6c757d',           -- Color en UI
    orden INTEGER DEFAULT 0,                -- Orden de aparición
    activo BOOLEAN DEFAULT 1               -- 1 = activo
);
```

#### 2.2.8 Tabla `etapas`

```sql
CREATE TABLE etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT UNIQUE,                      -- Clave: nuevo, contactado, etc.
    nombre TEXT,                            -- Nombre visible
    orden INTEGER,                          -- Orden en pipeline
    color TEXT DEFAULT '#3b82f6',           -- Color UI
    icono TEXT DEFAULT 'bi-circle',         -- Icono Bootstrap
    probabilidad INTEGER DEFAULT 0          -- % de cierre estimado
);
```

**Etapas por defecto:**

| clave | nombre | orden | color | probabilidad |
|-------|--------|-------|-------|-------------|
| nuevo | Nuevo | 1 | `#6c757d` | 10% |
| contactado | Contactado | 2 | `#0dcaf0` | 25% |
| cotizado | Cotizado | 3 | `#ffc107` | 50% |
| negociacion | Negociación | 4 | `#0d6efd` | 75% |
| ganado | Ganado | 5 | `#198754` | 90% |
| perdido | Perdido | 6 | `#dc3545` | 0% |
| cliente | Cliente | 7 | `#00d4aa` | 100% |

#### 2.2.9 Tabla `ventas`

```sql
CREATE TABLE ventas (
    id TEXT PRIMARY KEY,                    -- VTA-YYYYMMDDHHMMSS
    lead_id TEXT,                           -- Lead origen
    cliente_id TEXT,                        -- Cliente asociado
    cliente_nombre TEXT,                    -- Nombre denormalizado
    producto TEXT,                          -- Producto/servicio
    capacidad TEXT,                         -- Capacidad/especificación
    valor_cotizado REAL DEFAULT 0,          -- Valor cotizado en COP
    valor_vendido REAL DEFAULT 0,           -- Valor final en COP
    estado TEXT DEFAULT 'cotizado',         -- cotizado | vendido | cancelado
    fecha TEXT,                             -- ISO datetime
    notas TEXT                              -- Notas
);
```

#### 2.2.10 Tabla `precios`

```sql
CREATE TABLE precios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT,                         -- Categoría del producto
    producto TEXT,                          -- Nombre del producto
    capacidad TEXT,                         -- Capacidad/especificación
    precio_base REAL DEFAULT 0,             -- Precio base en COP
    precio_venta REAL DEFAULT 0,            -- Precio de venta en COP
    notas TEXT
);
```

#### 2.2.11 Tabla `tareas`

```sql
CREATE TABLE tareas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT,                           -- Lead asociado
    tarea TEXT,                             -- Descripción de la tarea
    estado TEXT DEFAULT 'pendiente',        -- pendiente | en_progreso | completada
    prioridad TEXT DEFAULT 'media',         -- alta | media | baja
    vence TEXT,                             -- Fecha de vencimiento
    created_at TEXT,                        -- Fecha de creación
    completada INTEGER DEFAULT 0            -- 0|1
);
```

#### 2.2.12 Tabla `tags`

```sql
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,                            -- Nombre del tag
    color TEXT DEFAULT '#3b82f6'            -- Color UI
);
```

### 2.3 Generación de IDs

Los IDs se generan con el helper `next_id(prefix, table)` que ejecuta:

```python
def next_id(prefix, table, id_column='id'):
    conn = get_db()
    row = conn.execute(
        f"SELECT MAX(CAST(SUBSTR({id_column}, INSTR({id_column}, '-') + 1) AS INTEGER)) FROM {table}"
    ).fetchone()
    max_num = row[0] if row[0] is not None else 0
    return f"{prefix}-{max_num + 1:03d}"
```

**Patrones:**
- `PRO-XXX` → `leads` (ej: PRO-001, PRO-049)
- `CLI-XXX` → `clients` (ej: CLI-001)
- `HTK-XXX` → `work_orders` (ej: HTK-001)
- `INT-YYYYMMDD-HHMMSS-uuid` → `interactions`
- `VTA-YYYYMMDDHHMMSS` → `ventas`

---

## 3. Backend — crm_app.py

### 3.1 Inicialización

```python
app = Flask(__name__)
app.secret_key = 'htk-crm-secret-key-2026-cambiame'

BASE_DIR = os.path.join(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, 'htk_crm.db')
COL_TZ = timezone(timedelta(hours=-5))  # Colombia: UTC-5
```

- Timezone: `America/Bogota` (UTC-5)
- DB: SQLite con WAL mode + foreign keys
- Credenciales: `HTK_ADMIN_USER` / `HTK_ADMIN_PASS` env vars (default: `admin` / `htk2026`)

### 3.2 Catálogo de Endpoints API

#### 3.2.1 Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/login` | Página de login (redirige a `/` si ya autenticado) |
| `POST` | `/login` | Autentica usuario contra env vars |
| `GET` | `/logout` | Destruye session Flask y redirige a login |

**Auth flow:**
```python
@login_required  # Decorador en todas las rutas protegidas
def login_required(f):
    if 'user' not in session:
        return redirect(url_for('login_page', next=request.path))
    return f(*args, **kwargs)
```

#### 3.2.2 Páginas HTML

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | SPA principal `index.html` |
| `GET` | `/leads/<lid>` | Perfil detallado de lead (template `lead_detail.html`) |
| `GET` | `/bot-whatsapp` | Panel del bot WhatsApp (`bot_whatsapp.html`) |

#### 3.2.3 Dashboard

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/stats` | Estadísticas agregadas del dashboard |

**Respuesta:**
```json
{
  "total_leads": 48,
  "total_clients": 2,
  "total_work_orders": 5,
  "active_work_orders": 3,
  "completed_work_orders": 2,
  "leads_by_status": {"nuevo": 20, "contactado": 15, ...},
  "wo_by_status": {"recibido": 1, "reparando": 2, ...},
  "leads_by_linea": {"mantenimiento": 25, "cargadores": 10, ...}
}
```

#### 3.2.4 API Clientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/clients` | Listar todos los clientes |
| `POST` | `/api/clients` | Crear nuevo cliente |
| `GET` | `/api/clients/<id>` | Obtener cliente con detalle de WO vinculadas |
| `PUT` | `/api/clients/<id>` | Actualizar cliente (incluye vinculación de WO) |
| `DELETE` | `/api/clients/<id>` | Eliminar cliente (cascada en links) |

**Ejemplo GET /api/clients:**
```json
[
  {
    "id": "CLI-001",
    "nombre": "Carlos Méndez",
    "telefono": "+573001234567",
    "fuente": "whatsapp",
    "primer_contacto": "2026-05-04T10:00:00-05:00",
    "ultimo_contacto": "2026-05-12T15:30:00-05:00",
    "interacciones_totales": 5,
    "estado": "cliente",
    "segmento": "B2B taller",
    "linea_interes": "mantenimiento",
    "ordenes": ["HTK-001"]
  }
]
```

**POST /api/clients:**
```json
{
  "nombre": "Nuevo Cliente",
  "telefono": "+57300...",
  "fuente": "referido",
  "segmento": "B2B industria",
  "linea_interes": "mantenimiento"
}
```

**GET /api/clients/CLI-001 → incluye `ordenes_detalle`** con objetos WO completos.

#### 3.2.5 API Leads

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/leads` | Listar todos los leads |
| `POST` | `/api/leads` | Crear nuevo lead |
| `GET` | `/api/leads/<id>` | Obtener lead individual |
| `PUT` | `/api/leads/<id>` | Actualizar lead |
| `DELETE` | `/api/leads/<id>` | Eliminar lead |
| `POST` | `/api/leads/<id>/convert` | Convertir lead → cliente |

**POST /api/leads:**
```json
{
  "nombre": "Empresa XYZ",
  "contacto": "+57300...",
  "telefono": "+573001112233",
  "email": "contacto@empresa.com",
  "url": "https://empresa.com",
  "segmento": "hoteles",
  "linea_interes": "mantenimiento",
  "fuente": "web",
  "valor_estimado": 5000000,
  "notas": "Interesado en mantenimiento de AA"
}
```

**POST /api/leads/PRO-001/convert →** Crea un cliente con `CLI-XXX`, copia datos del lead, actualiza estado del lead a `cliente`.

#### 3.2.6 API Work Orders

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/work_orders` | Listar todas las WO (formato nesting: cliente, equipo, fechas, historial) |
| `POST` | `/api/work_orders` | Crear nueva WO |
| `GET` | `/api/work_orders/<id>` | Obtener WO individual con historial |
| `PUT` | `/api/work_orders/<id>` | Actualizar WO (datos generales) |
| `DELETE` | `/api/work_orders/<id>` | Eliminar WO (cascada en history y links) |
| `PUT` | `/api/work_orders/<id>/status` | Cambiar estado de WO (con registro en historial) |

**POST /api/work_orders:**
```json
{
  "cliente": {"nombre": "Juan Pérez", "telefono": "+57..."},
  "equipo": {"tipo": "aire_acondicionado", "marca": "Midea", "modelo": "Inverter 12K"},
  "falla_reportada": "No enciende el display",
  "presupuesto": null,
  "notas_internas": "",
  "historial_desc": "Equipo recibido en taller."
}
```

**PUT /api/work_orders/HTK-001/status:**
```json
{
  "estado": "diagnosticando",
  "descripcion": "Iniciando diagnóstico de placa de control"
}
```

Al cambiar estado, se actualizan automáticamente las fechas correspondientes:
- `diagnosticando` → `fecha_diagnostico`
- `aprobado` → `fecha_presupuesto_aprobado`
- `completado` → `fecha_completado`
- `entregado` → `fecha_entregado`

#### 3.2.7 API Interacciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/interactions` | Listar todas las interacciones |
| `POST` | `/api/interactions` | Crear interacción general |
| `GET` | `/api/leads/<id>/interactions` | Interacciones de un lead específico |
| `POST` | `/api/leads/<id>/interactions` | Crear interacción desde perfil de lead |

#### 3.2.8 API Notas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `PUT` | `/api/leads/<id>/notes` | Actualizar notas de lead (in-place edit) |
| `PUT` | `/api/clients/<id>/notes` | Actualizar notas de cliente |

#### 3.2.9 API Segmentos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/segments` | Listar segmentos activos (key, label, color, orden) |

#### 3.2.10 API Pitches

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/pitches` | Obtener archivo `pitches.json` completo |
| `PUT` | `/api/pitches` | Editar plantilla individual (canal + texto) |
| `GET` | `/api/pitches/by-segment/<segment>` | Filtrar plantillas por segmento |

#### 3.2.11 API Pipeline / Kanban

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/pipeline` | Funnel de conversión (etapas + conteos + %) |
| `GET` | `/api/leads/kanban` | Leads agrupados por etapa para vista kanban |
| `PATCH` | `/api/leads/<lid>/etapa` | Cambiar etapa de un lead (drag & drop) |
| `GET` | `/api/etapas` | Listar todas las etapas configuradas |

**GET /api/pipeline:**
```json
{
  "etapas": [
    {"clave": "nuevo", "nombre": "Nuevo", "color": "#6c757d", "icono": "bi-circle", "probabilidad": 10}
  ],
  "funnel": [
    {"clave": "nuevo", "nombre": "Nuevo", "color": "#6c757d", "count": 20, "pct": 41.7},
    {"clave": "contactado", "nombre": "Contactado", "count": 10, "pct": 20.8}
  ]
}
```

**PATCH /api/leads/PRO-001/etapa:**
```json
{"etapa": "contactado"}
```

#### 3.2.12 API Ventas y Precios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/sales` | Listar todas las ventas |
| `POST` | `/api/sales` | Crear venta (`VTA-YYYYMMDDHHMMSS`) |
| `PATCH` | `/api/sales/<sid>` | Actualizar venta |
| `DELETE` | `/api/sales/<sid>` | Eliminar venta |
| `GET` | `/api/prices` | Listar precios |
| `POST` | `/api/prices` | Crear precio |
| `PATCH` | `/api/prices/<pid>` | Actualizar precio |
| `DELETE` | `/api/prices/<pid>` | Eliminar precio |

#### 3.2.13 API Tareas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/tasks` | Listar tareas (orden: completada ASC, vence ASC) |
| `POST` | `/api/tasks` | Crear tarea |
| `PATCH` | `/api/tasks/<tid>` | Actualizar tarea (tarea, estado, prioridad, vence, completada) |
| `DELETE` | `/api/tasks/<tid>` | Eliminar tarea |

#### 3.2.14 API Tags y Utilidades

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/tags` | Listar tags |
| `POST` | `/api/tags` | Crear tag |
| `GET` | `/api/lead-week` | Leads por día (últimos 7 días) |
| `GET` | `/api/opciones` | Opciones — líneas de interés disponibles |
| `GET` | `/api/export` | Exportar leads a CSV (UTF-8 BOM) |

**GET /api/lead-week:**
```json
[
  {"fecha": "2026-05-07", "count": 3, "label": "Thu"},
  {"fecha": "2026-05-08", "count": 5, "label": "Fri"}
]
```

#### 3.2.15 API Automatización

| Método | Ruta | Descripción | Args opcionales |
|--------|------|-------------|-----------------|
| `POST` | `/api/auto/enrich` | Ejecutar `auto_enrich.py` | `--segmento`, `--lead`, `--force` |
| `GET` | `/api/auto/score` | Ejecutar `auto_score.py` | `--segmento`, `--top` |
| `POST` | `/api/auto/schedule` | Ejecutar `auto_schedule.py` | `--segmento`, `--start`, `--dry-run` |
| `POST` | `/api/auto/campaign` | Ejecutar `auto_campaign.py` | `--segmento`, `--lead`, `--channel`, `--save` |
| `POST` | `/api/auto/backup` | Ejecutar `backup_db.sh` | — |

**Ejemplo POST /api/auto/enrich:**
```json
{"segmento": "hoteles", "force": true}
```

**Respuesta:**
```json
{"ok": true, "output": "Procesados 5 leads\nEnriquecidos 3\n", "error": ""}
```

#### 3.2.16 API WhatsApp Bot Bridge

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/send-message` | Enviar mensaje WhatsApp vía bot |
| `POST` | `/api/bot/silence` | Silenciar notificaciones para un número |
| `POST` | `/api/bot/unsilence` | Reactivar notificaciones |
| `POST` | `/api/bot/global-off` | Apagar bot globalmente |
| `POST` | `/api/bot/global-on` | Encender bot |
| `GET` | `/api/bot/status` | Estado del bot (online/offline) |
| `GET` | `/api/bot/log` | Últimas 200 líneas del log |

**POST /api/send-message:**
```json
{
  "numero": "+573001234567",
  "mensaje": "Hola, ¿cómo estás?",
  "lead_id": "PRO-005"
}
```

#### 3.2.17 API LID y Debug

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/lid/stats` | Estadísticas de resolución LID |
| `GET` | `/api/debug` | Conteo de registros por tabla |

**GET /api/debug:**
```json
{"clients": 2, "work_orders": 5, "leads": 48, "interactions": 12, "work_order_history": 8, "work_order_client_links": 3}
```

### 3.3 Helper Functions Clave

```python
def get_db():
    """SQLite connection con WAL mode + row_factory"""
    
def now_iso():
    """Datetime actual en Colombia UTC-5, formato ISO"""
    
def next_id(prefix, table):
    """Genera ID secuencial PRO-XXX, CLI-XXX, HTK-XXX"""
    
def wo_to_dict(conn, wo_id):
    """Convierte fila WO plana → objeto anidado con cliente, equipo, fechas, historial"""
    
def client_to_dict(row):
    """Convierte cliente + carga WO vinculadas vía work_order_client_links"""
    
def link_wo_to_client(wo_id, nombre, telefono):
    """Vincula WO con cliente existente por nombre o teléfono"""
    
def export_work_orders_full(conn):
    """Exporta todas las WO con historial anidado"""
    
def run_script(script_name, args):
    """Ejecuta script python del directorio scripts/ con timeout 300s"""
```

---

## 4. Frontend — index.html (SPA)

### 4.1 Estructura General

El frontend es una **Single Page Application** de ~3980 líneas construida con:

- **Bootstrap 5.3.3** (CDN) — Layout, modales, forms, tabs
- **Bootstrap Icons 1.11.3** (CDN) — Iconografía
- **Vanilla JS** — Sin frameworks, fetch API nativo
- **CSS Custom Properties** — Tema oscuro HTK

### 4.2 Diseño de Página

```
┌──────────────┬──────────────────────────────────────────┐
│   SIDEBAR    │           MAIN CONTENT                   │
│              │                                          │
│  ⚡ HTK CRM  │  ┌─ Global Search ─────────────────────┐ │
│              │  │ 🔍 Buscar leads, clientes, OT...    │ │
│  Dashboard   │  └────────────────────────────────────┘ │
│  Kanban      │                                          │
│  Clientes    │  ┌─ Tab Content ───────────────────────┐ │
│  Órdenes     │  │                                      │ │
│  Prospectos  │  │  (dashboard | kanban | clients |    │ │
│  Interacc.   │  │   workorders | leads |              │ │
│  Automatiz.  │  │   interactions | automation)        │ │
│  WhatsApp    │  │                                      │ │
│              │  └────────────────────────────────────┘ │
│  🌙 Tema     │                                          │
│  🚪 Salir    │                                          │
└──────────────┴──────────────────────────────────────────┘
```

### 4.3 Sistema de Tabs

Navegación vía sidebar + mobile menu. Cada tab se activa con `data-tab`:

| Tab | ID | Descripción |
|-----|----|-------------|
| 📊 Dashboard | `tab-dashboard` | KPIs + gráficos + próximos seguimientos |
| 📋 Kanban | `tab-kanban` | Tablero drag & drop por etapas |
| 👥 Clientes | `tab-clients` | Tabla CRUD + edición modal |
| 🔧 Órdenes | `tab-workorders` | WO con timeline, cambio de estado |
| 📈 Prospectos | `tab-leads` | Tabla leads + filtros + modal CRUD |
| 💬 Interacciones | `tab-interactions` | Registro de auditoría |
| ⚙️ Automatización | `tab-automation` | Botonera de scripts |

### 4.4 Tema Oscuro / Claro

- **Default:** Dark (`data-bs-theme="dark"`)
- **Toggle:** Botón en sidebar + mobile menu
- **Persistencia:** `localStorage.getItem('htk-theme')`
- **Colores custom:**
  - `--htk-primary: #00d4aa` (verde menta)
  - `--htk-dark: #0d1b2a` (fondo)
  - `--htk-card: #1b2838` (tarjetas)
  - `--htk-sidebar: #0f1a2b` (sidebar)

### 4.5 Búsqueda Global (Ctrl+K)

- **Atajo:** `Ctrl+K` / `Cmd+K`
- **Implementación:** Input con dropdown de resultados
- **Alcance:** Busca en leads, clientes y work orders simultáneamente
- **Resultados:** Nombre, ID, tipo (lead/cliente/WO), segmento, línea
- **Navegación:** Click en resultado → abre perfil o navega al tab correspondiente
- **Diseño:** Caja de búsqueda con borde redondeado, icono de lupa, dropdown animado

### 4.6 Dashboard

```
┌──────────┬──────────┬──────────┬──────────┐
│ 🎯 Leads │ 👥 Clien │ 🔧 OT    │ 💰 Ingre │
│    48    │    2     │  Activas │  $450K   │
├──────────┴──────────┴──────────┴──────────┤
│  📈 WO por Estado (gráfico barras)        │
│  📈 Leads por Línea (gráfico barras)      │
│  📋 Últimas Órdenes (tabla resumida)      │
│  📋 Próximos Seguimientos                 │
└───────────────────────────────────────────┘
```

### 4.7 Kanban Board

- **Layout:** Columnas horizontales con scroll
- **Etapas:** Cargadas dinámicamente desde `/api/etapas`
- **Cards:** Nombre, segmento, línea, valor estimado, próxima fecha
- **Drag & Drop:** HTML5 Drag and Drop API nativo
- **Endpoint:** `PATCH /api/leads/<lid>/etapa` al soltar
- **Columnas:** Mínimo 240px, máximo 280px

### 4.8 Tabla Leads

- **Columnas:** ID, Nombre, Contacto, Segmento, Línea, Estado, Fuente, Fecha, Valor
- **Filtros:** Por estado, segmento, línea de interés (selects dinámicos)
- **Inline edit:** Click en celda → input → Enter guarda
- **Modal CRUD:** Formulario completo para crear/editar
- **Acciones:** Ver perfil, convertir a cliente, eliminar
- **Export:** Botón CSV vía `/api/export`

### 4.9 Tabla Clientes

- **Columnas:** ID, Nombre, Teléfono, Segmento, Estado, Último contacto
- **Vista expandible:** Click en fila → detalle con WO vinculadas
- **Modal CRUD:** Similar a leads con campos específicos de cliente

### 4.10 Tabla Work Orders

- **Columnas:** ID, Cliente, Equipo, Estado, Fecha, Presupuesto
- **Timeline:** Componente visual con historial de estados
- **Cambio de estado:** Dropdown con estados válidos + descripción
- **Filtros:** Por estado (activas, completadas, todas)

### 4.11 Automatización Panel

Botones para ejecutar scripts con parámetros opcionales:

```
┌─────────────────────────────────────────┐
│ ⚙️ Automatización                       │
├─────────────────────────────────────────┤
│ [Enriquecer Leads]  Segmento: [______]  │
│ [Scoring]           Top N:    [__]      │
│ [Programar Seguimientos] Dry Run ☐      │
│ [Generar Campaña]   Canal: [WhatsApp ▼] │
│ [Backup BD]                             │
└─────────────────────────────────────────┘
```

---

## 5. Scripts de Automatización

### 5.1 `auto_enrich.py` — Enriquecimiento de Leads

**Propósito:** Scrapea sitios web de leads para extraer teléfonos y emails.

**Stack técnico:**
- `requests` + `BeautifulSoup4` para scraping HTTP
- `re` (regex) para extracción de patrones
- `sqlite3` para lectura/escritura directa en BD

**Uso:**
```bash
python3 scripts/auto_enrich.py                          # leads con web y sin teléfono
python3 scripts/auto_enrich.py --segmento hoteles       # filtrar por segmento
python3 scripts/auto_enrich.py --lead PRO-005           # lead específico
python3 scripts/auto_enrich.py --force                  # re-procesar todos
```

**Patrones de extracción:**
- `PHONE_RE`: Detecta números de teléfono colombianos e internacionales
- `EMAIL_RE`: Correos electrónicos estándar
- `WA_RE`: Links de WhatsApp (`wa.me`, `api.whatsapp`)
- `DOMAIN_RE`: Dominios web en texto

**Filtros de ruido:** Excluye `sentry`, `noreply`, `no-reply`, `@wix`, emails de assets (`.png@`, `.jpg@`, `.css@`, `.js@`)

**Timeout:** 20 segundos por URL

### 5.2 `auto_score.py` — Scoring de Leads

**Propósito:** Asigna puntuación 0-100 a cada lead sin usar IA.

**Criterios de puntuación:**

| Factor | Peso | Criterio |
|--------|------|----------|
| Segmento | 25% | `B2B taller`=90, `distribuidor cargadores`=85, `B2B fabrica`=75, `hoteles`=60, `consumidor`=40 |
| Teléfono | 25% | 100 si tiene, 0 si no |
| Email | 15% | 100 si tiene, 0 si no |
| WhatsApp | 10% | Detectado en datos |
| Web | 5% | Tiene URL |
| Estado | 10% | `nuevo`=100, `contactado`=80, `perdido`=0 |
| Antigüedad | 10% | Más reciente = más puntos (decae por día) |

**Uso:**
```bash
python3 scripts/auto_score.py                    # puntuar todos
python3 scripts/auto_score.py --segmento hoteles # un segmento
python3 scripts/auto_score.py --top 10           # top N leads
```

### 5.3 `auto_schedule.py` — Programación de Seguimientos

**Propósito:** Asigna `proximo_seguimiento` a leads respetando horario laboral colombiano.

**Horario laboral:**
- Lunes a Viernes: 8:00 AM — 6:00 PM
- Sábado: 8:00 AM — 1:00 PM
- Domingo: No laboral

**Distribución:**
- Agrupa leads por segmento (orden de prioridad)
- Distribuye en slots de 15 minutos
- Los segmentos prioritarios van primero
- Empieza desde el día siguiente hábil

**Uso:**
```bash
python3 scripts/auto_schedule.py                        # programar todos los nuevos
python3 scripts/auto_schedule.py --segmento hoteles     # un segmento
python3 scripts/auto_schedule.py --start 2026-05-15     # desde fecha específica
python3 scripts/auto_schedule.py --dry-run              # preview sin guardar
```

### 5.4 `auto_campaign.py` — Generación de Campañas

**Propósito:** Genera mensajes personalizados desde `pitches.json` para cada lead.

**Matching de plantillas:**
1. Busca coincidencia exacta de segmento → 100 puntos base
2. Coincidencia parcial de segmento → 50 puntos base
3. Bonus por coincidencia de `linea_interes` → +20 puntos
4. Selecciona la plantilla con mayor score

**Modos:**
- **Preview** (default): Muestra los mensajes generados sin guardar
- **Save** (`--save`): Guarda como interacciones en la BD

**Uso:**
```bash
python3 scripts/auto_campaign.py                                # leads con seguimiento hoy
python3 scripts/auto_campaign.py --segmento cargadores          # un segmento
python3 scripts/auto_campaign.py --channel email                # cambiar canal
python3 scripts/auto_campaign.py --lead PRO-005                 # lead específico
python3 scripts/auto_campaign.py --save                         # guardar en BD
```

### 5.5 `archive_conversation.py` — Archivo de Conversaciones

**Propósito:** Convierte un transcript JSONL de sesión IA a markdown legible.

**Uso:**
```bash
python3 scripts/archive_conversation.py transcript.jsonl "etiqueta_opcional"
```

**Output:** `data/conversations/conv_YYYY-MM-DD_HHMMSS.md`

---

## 6. Archivos de Datos

### 6.1 `data/pitches.json` — Plantillas de Prospección

Estructura:
```json
{
  "canales": {
    "whatsapp": {"nombre": "WhatsApp", "icono": "bi-whatsapp", "color": "#25D366", "max_chars": 1000},
    "email": {"nombre": "Email", "icono": "bi-envelope-fill", "color": "#0dcaf0", "max_chars": 5000}
  },
  "plantillas_cuerpo": [
    {
      "id": "talleres-aire",
      "nombre": "Talleres de Aire Acondicionado",
      "segmentos": ["B2B taller", "taller"],
      "lineas_interes": ["mantenimiento"],
      "whatsapp": "Buenos días... (texto completo)",
      "email": "Asunto: ... (texto completo con HTML)",
      "variables": ["Contacto", "Empresa"],
      "detonante": "Si responde 'sí', 'me interesa'..."
    }
  ]
}
```

**11 plantillas actuales:**

| ID | Nombre | Segmentos |
|----|--------|-----------|
| `talleres-aire` | Talleres de AA | B2B taller |
| `talleres-electronica` | Talleres Electrónica | B2B taller |
| `fabricas-plasticos` | Fábricas Plásticos | B2B industria |
| `distribuidores-cargadores` | Distribuidores EV | distribuidor cargadores |
| `hoteles` | Hoteles | hoteles |
| `restaurantes` | Restaurantes | restaurantes |
| `energia-solar` | Energía Solar | energia solar |
| `B2B-comercio` | Comercio General | B2B comercio |
| `consumidor-mantenimiento` | Consumidor Mant. | consumidor |
| `consumidor-cargadores` | Consumidor EV | consumidor |
| `seguimiento-general` | Seguimiento Genérico | todos |

### 6.2 `data/pitches.md` — Documentación de Pitches

Formato markdown con secciones por segmento, incluyendo:
- Enfoque de venta
- Pitch WhatsApp completo
- Pitch Email completo
- Detonantes de interés (🚨 alertas para Pedro)

### 6.3 `data/notifications.json` — Plantillas de Notificación WO

8 plantillas para estados de órdenes de trabajo:
- `recibido`, `diagnosticando`, `presupuestado`, `aprobado`, `reparando`, `esperando_repuestos`, `completado`, `entregado`, `cancelado`

Variables disponibles: `{cliente}`, `{equipo}`, `{marca}`, `{modelo}`, `{diagnostico}`, `{presupuesto}`, `{estado}`

### 6.4 Estrategias de Segmentación

| Archivo | Contenido |
|---------|-----------|
| `data/estrategia_segmentacion.md` | Análisis general de segmentos y priorización |
| `data/estrategia_hoteles_restaurantes.md` | Estrategia para sector hoteles y restaurantes |
| `data/estrategia_nuevos_sectores.md` | Exploración de nuevos sectores |

### 6.5 `data/conversations/` — Archivos de Chat

Carpeta con archivos de conversaciones archivadas en markdown:
```
conv_2026-05-13_080014.md
```

### 6.6 `data/schema.md` — Esquema Legacy

Documentación del esquema JSON original (pre-migración a SQLite). Útil como referencia histórica.

---

## 7. Skills de Prospección

### 7.1 Lead Finder Skill

**Ubicación:** `skills/lead-finder/SKILL.md`

**Workflow completo:**
```
1. ANALIZAR SECTOR → 2. BUSCAR LEADS → 3. CALIFICAR → 4. ENRIQUECER → 5. CRM
```

**Pasos detallados:**
1. **Análisis de sector:** Web search + directorios + cámaras de comercio → archivo `data/estrategia_[sector].md`
2. **Búsqueda de leads:** Web search queries dirigidas + directorios online
3. **Calificación:** Usar `references/qualification_criteria.md` — priorizar leads medianos/pequeños
4. **Enriquecimiento:** Scraping del sitio web con Scrapling o `scrape_company_site.py`
5. **Integración CRM:** Actualizar `leads.json` vía Flask API + registrar interacciones

**Directorios usados:**
- `directoriode.co/barranquilla/`
- `eldirectorio.co/empresas/barranquilla/`
- `probarranquilla.org`
- Páginas Amarillas Colombia

### 7.2 Scripts Auxiliares

| Archivo | Descripción |
|---------|-------------|
| `scripts/scrape_company_site.py` | Scraper individual de sitios web con Scrapling |
| `scripts/crm_utils.py` | Utilidades para leer/escribir leads.json e interacciones |

### 7.3 Criterios de Calificación

**Archivo:** `references/qualification_criteria.md`

**Regla de oro:** No ir por los peces gordos. Empresa joven = leads medianos/pequeños con potencial real. Dueños que deciden rápido, procesos simples.

**Criterios clave:**
- Contactabilidad (teléfono/email disponible)
- Segmento priorizado para empresa joven
- Accesibilidad (dueño directo vs. corporativo)
- Tamaño del prospecto (mediano/pequeño > grande)
- Proximidad geográfica (Barranquilla/Atlántico)

---

## 8. Sistema de Órdenes de Trabajo

### 8.1 Flujo de Estados

```
recibido ──→ diagnosticando ──→ presupuestado ──→ aprobado
                                                     │
              ┌──────────────────────────────────────┘
              ▼
         reparando ──→ completado ──→ entregado
              │
              ├──→ esperando_repuestos ──→ reparando
              │
              └──→ cancelado (desde cualquier estado)
```

### 8.2 Transiciones de Estado

| Estado | Siguientes estados válidos |
|--------|---------------------------|
| `recibido` | `diagnosticando`, `cancelado` |
| `diagnosticando` | `presupuestado`, `cancelado` |
| `presupuestado` | `aprobado`, `cancelado` |
| `aprobado` | `reparando`, `esperando_repuestos`, `cancelado` |
| `reparando` | `completado`, `esperando_repuestos`, `cancelado` |
| `esperando_repuestos` | `reparando`, `cancelado` |
| `completado` | `entregado` |
| `entregado` | (terminal) |
| `cancelado` | (terminal) |

### 8.3 Registro de Historial

Cada cambio de estado genera automáticamente una entrada en `work_order_history`:
- `wo_id`: ID de la orden
- `fecha`: ISO datetime del cambio
- `estado`: Nuevo estado
- `descripcion`: Texto descriptivo
- `notificado`: Si se envió notificación al cliente

### 8.4 Fechas Automáticas

Al cambiar a ciertos estados, se registra automáticamente la fecha:
- `diagnosticando` → `fecha_diagnostico`
- `aprobado` → `fecha_presupuesto_aprobado`
- `completado` → `fecha_completado`
- `entregado` → `fecha_entregado`

### 8.5 Vinculación con Clientes

Al crear una WO, el sistema intenta vincularla con un cliente existente:
1. Busca por coincidencia exacta de nombre (`LOWER(nombre) = LOWER(?)`)
2. Si no encuentra, busca por teléfono
3. Si encuentra match, inserta en `work_order_client_links` y actualiza `interacciones_totales` + `ultimo_contacto`

### 8.6 Notificaciones

Cada estado tiene una plantilla de notificación en `data/notifications.json` con formato WhatsApp-ready (negritas markdown, emojis, variables).

---

## 9. Integraciones

### 9.1 WhatsApp Bot (Puerto 18802)

**Tecnología:** Node.js 24.15  
**Ruta:** `/home/peku/htk-whatsapp-bot/bot.js`  
**Log:** `/home/peku/htk-whatsapp-bot/bot.log`

**API de control (desde el CRM):**

| Endpoint CRM | Endpoint Bot | Propósito |
|-------------|-------------|-----------|
| `POST /api/send-message` | `POST /send` | Enviar mensaje WhatsApp |
| `POST /api/bot/silence` | `POST /silence` | Silenciar número |
| `POST /api/bot/unsilence` | `POST /unsilence` | Desilenciar número |
| `POST /api/bot/global-off` | `POST /global-off` | Apagar bot |
| `POST /api/bot/global-on` | `POST /global-on` | Encender bot |
| `GET /api/bot/status` | `POST /status` | Estado del bot |
| `GET /api/bot/log` | (lee archivo local) | Últimas 200 líneas de log |

**Número vinculado:** `+573156032940`

### 9.2 Website HTK (Puerto 8080)

**Servicio:** `htk-web.service`  
**Tecnología:** `python3 -m http.server 8080 --bind 127.0.0.1`  
**Ruta:** `/home/peku/htk-web/`  
**Propósito:** Sitio web público estático de HTK INGENIERIA

### 9.3 Cloudflare Tunnel

**Servicio:** `cloudflared-tunnel.service`  
**Dominio público:** `https://crm.htk-ingenieria.com`  
**Propósito:** Exponer el CRM (puerto 18800) a internet de forma segura

### 9.4 OpenClaw Gateway (Puerto 18789)

**Servicio:** `openclaw-gateway` (user systemd)  
**Tecnología:** Node.js 24.15  
**Ruta:** `/home/peku/.config/nvm/versions/node/v24.15.0/lib/node_modules/openclaw/`  
**Propósito:** Orquestación de agentes IA, sesiones, cron jobs

**Funciones relevantes para el CRM:**
- Recibe mensajes de Telegram y los enruta al agente IA
- El agente puede ejecutar herramientas CRM vía API HTTP
- Maneja cron jobs para tareas periódicas (heartbeats)
- Gestiona sesiones de conversación archivables

### 9.5 Google Gemini API

**Uso:** Modelos baratos para heartbeats y tareas periódicas ligeras  
**Modelo heartbeat:** `gemini-2.0-flash-lite`  
**API Key:** Configurada en env de openclaw-gateway

---

## 10. Flujo de Datos

### 10.1 Prospección de Leads

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Web      │───→│ Scraping │───→│ Scoring  │───→│ CRM      │───→│ Pitch    │
│ Search   │    │ enriquece│    │ prioriza │    │ guarda   │    │ envía    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                     │
                                                     ▼
                                              ┌──────────┐
                                              │ Seguim.  │
                                              │ program. │
                                              └──────────┘
```

**Paso a paso:**
1. **Web Search:** Buscar empresas del sector en Barranquilla/Atlántico
2. **Scraping:** `auto_enrich.py` extrae teléfonos, emails, WhatsApp de sitios web
3. **Scoring:** `auto_score.py` asigna puntuación 0-100 basada en datos y segmento
4. **CRM:** Los leads se guardan vía `POST /api/leads`
5. **Pitch:** `auto_campaign.py` genera mensajes personalizados desde pitches.json
6. **Seguimiento:** `auto_schedule.py` programa próximo contacto en horario laboral

### 10.2 Ciclo de Vida de Orden de Trabajo

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Cliente  │───→│ Recepción│───→│ Diagnós- │───→│ Presu-   │───→│ Aproba-  │
│ contacta │    │ equipo   │    │ tico     │    │ puesto   │    │ ción     │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                                     │
                                                                     ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Entrega  │←───│ Comple-  │←───│ Repara-  │←───│ Espera   │←───│ Repara-  │
│          │    │ tado     │    │ ción     │    │ repuestos│    │ ción     │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

Cada transición:
1. Actualiza el estado en `work_orders`
2. Registra fecha automática si aplica
3. Crea entrada en `work_order_history`
4. (Opcional) Notifica al cliente vía WhatsApp usando plantilla de `notifications.json`

### 10.3 Flujo de Automatización

```
┌────────────┐     HTTP POST      ┌──────────────┐     subprocess     ┌────────────┐
│ Frontend   │───────────────────→│ crm_app.py   │───────────────────→│ scripts/   │
│ Botonera   │                    │ /api/auto/*  │                    │ auto_*.py  │
└────────────┘                    └──────────────┘                    └────────────┘
                                         │                                  │
                                         │                                  │
                                         ▼                                  ▼
                                  ┌──────────────┐                   ┌────────────┐
                                  │ Respuesta    │←─── stdout ──────│ SQLite     │
                                  │ JSON al FE   │     stderr       │ read/write │
                                  └──────────────┘                   └────────────┘
```

### 10.4 Sesión IA → CRM

```
┌──────────┐    ┌────────────┐    ┌──────────────┐    ┌──────────┐
│ Telegram │───→│ OpenClaw   │───→│ Agente IA    │───→│ HTTP API │
│ Usuario  │    │ Gateway    │    │ (DeepSeek)   │    │ CRM      │
└──────────┘    └────────────┘    └──────────────┘    └──────────┘
     │                                                      │
     │              ┌──────────────┐                        │
     └──────────────│ Respuesta    │←─── JSON ──────────────┘
                    │ WhatsApp     │
                    └──────────────┘
```

### 10.5 Arquitectura de Mensajería WhatsApp

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│ WhatsApp │←──→│ htk-whatsapp │←──→│ crm_app.py   │←──→│ htk_crm  │
│ API      │    │ -bot :18802  │    │ :18800       │    │ .db      │
│ (Meta)   │    │ (Node.js)    │    │ (Flask)      │    │ (SQLite) │
└──────────┘    └──────────────┘    └──────────────┘    └──────────┘
                       │                    │
                       │ logs               │ control API
                       ▼                    ▼
                ┌──────────────┐    ┌──────────────┐
                │ bot.log      │    │ silence/     │
                │              │    │ unsilence/   │
                │              │    │ global-off/on│
                └──────────────┘    └──────────────┘
```

---

## 11. Seguridad

### 11.1 Autenticación

- **Flask Session:** Cookie firmada con `secret_key`
- **Decorador `@login_required`:** Todas las rutas protegidas excepto `/login`
- **Credenciales:** Vía variables de entorno `HTK_ADMIN_USER` / `HTK_ADMIN_PASS`
- **Valores por defecto:** `admin` / `htk2026`
- **Logout:** `session.clear()` + redirect a login

### 11.2 Aislamiento de Red

- **Todos los servicios bindean a `127.0.0.1` (loopback-only)**
- Solo `cloudflared-tunnel` expone el CRM al exterior
- El túnel Cloudflare provee TLS y protección DDoS básica
- No hay exposición directa a internet de ningún puerto

### 11.3 Base de Datos

- **WAL mode:** Mejor concurrencia y recuperación ante crash
- **Foreign keys ON:** Integridad referencial con CASCADE
- **Backups:** Script `backup_db.sh` + directorio `backups/` con rotación
- El archivo `.db` está en el filesystem local, no accesible vía web

### 11.4 Limitaciones de Seguridad Actuales

- **Cookie secret hardcodeada** en el código (debe ir a env var)
- **Sin rate limiting** en endpoints API
- **Sin CORS configurado** (innecesario si solo loopback)
- **Sin HTTPS local** (innecesario con túnel Cloudflare)
- **Sin logs de acceso** estructurados
- **Credenciales por defecto** accesibles (cambiar en producción)

---

## 12. Próximos Pasos / Mejoras Potenciales

### 12.1 Corto Plazo (1-3 meses)

| Prioridad | Mejora | Impacto |
|-----------|--------|---------|
| 🔴 Alta | Migrar `secret_key` y credenciales a variables de entorno | Seguridad |
| 🔴 Alta | Unificar servicios CRM (deprecar V1 en `/htk-crm-web/`) | Mantenibilidad |
| 🟡 Media | Dashboard con métricas financieras (ingresos, pipeline value) | Visibilidad |
| 🟡 Media | Mejorar UI de perfil de lead (timeline, interacciones embebidas) | UX |
| 🟡 Media | Dashboard de próximos seguimientos en página principal | Productividad |

### 12.2 Mediano Plazo (3-6 meses)

| Mejora | Descripción |
|--------|-------------|
| PostgreSQL | Migrar a PostgreSQL para mejor concurrencia y backups |
| API REST pública | Tokens JWT para acceso externo (app móvil, integraciones) |
| WebSockets | Dashboard en tiempo real con Flask-SocketIO |
| Pipeline de ventas completo | Integración cotización → venta → facturación |
| Reportes PDF | Generación de reportes ejecutivos automáticos |
| Multi-usuario | Roles (admin, técnico, vendedor) con permisos |

### 12.3 Largo Plazo (6-12 meses)

| Mejora | Descripción |
|--------|-------------|
| Mobile App | App nativa para técnicos en campo (React Native / PWA) |
| IA avanzada | Scoring predictivo con ML, detección de intención en chats |
| Backup cloud | Backup automático a S3/Google Drive |
| Integración contable | Conexión con sistema de facturación electrónica DIAN |
| Portal de cliente | Autoservicio para consultar estado de órdenes |
| Dashboard IoT | Monitoreo de equipos instalados en tiempo real |

### 12.4 Deuda Técnica Identificada

1. **Código duplicado:** `import json, re, urllib.request` repetido en cada endpoint del bot bridge
2. **Sin tests:** Cero cobertura de pruebas unitarias o de integración
3. **Sin type hints:** Código Python sin anotaciones de tipos
4. **Frontend monolítico:** 3980 líneas en un solo archivo HTML
5. **API inconsistente:** Algunas rutas tienen `@login_required`, otras no
6. **Logging rudimentario:** Sin sistema de logging estructurado
7. **Sin migraciones:** La BD se crea con `migrate_to_sqlite.py` (one-shot)
8. **Sin documentación de API:** No hay OpenAPI/Swagger

---

## Apéndice A: Ejemplos de Uso de API (curl)

### Consultar estadísticas del dashboard
```bash
curl -c cookies.txt -X POST http://localhost:18800/login \
  -d "username=admin&password=htk2026"
curl -b cookies.txt http://localhost:18800/api/stats
```

### Crear un lead nuevo
```bash
curl -b cookies.txt -X POST http://localhost:18800/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Hotel Las Américas",
    "telefono": "+573001112233",
    "email": "info@hotelamericas.com",
    "segmento": "hoteles",
    "linea_interes": "mantenimiento",
    "fuente": "web",
    "valor_estimado": 5000000
  }'
```

### Cambiar estado de una orden de trabajo
```bash
curl -b cookies.txt -X PUT http://localhost:18800/api/work_orders/HTK-001/status \
  -H "Content-Type: application/json" \
  -d '{"estado": "diagnosticando", "descripcion": "Iniciando revisión de placa"}'
```

### Obtener pipeline kanban
```bash
curl -b cookies.txt http://localhost:18800/api/leads/kanban
```

### Ejecutar enriquecimiento automático
```bash
curl -b cookies.txt -X POST http://localhost:18800/api/auto/enrich \
  -H "Content-Type: application/json" \
  -d '{"segmento": "hoteles"}'
```

### Enviar mensaje WhatsApp desde el CRM
```bash
curl -b cookies.txt -X POST http://localhost:18800/api/send-message \
  -H "Content-Type: application/json" \
  -d '{"numero": "+573001234567", "mensaje": "Hola desde HTK", "lead_id": "PRO-005"}'
```

### Exportar leads a CSV
```bash
curl -b cookies.txt http://localhost:18800/api/export -o leads_htk.csv
```

---

## Apéndice B: Estados y Colores en UI

### Estados de Lead (Pipeline)

| Estado | Color Bootstrap |
|--------|----------------|
| Nuevo | `bg-secondary` |
| Contactado | `bg-info` |
| Cotizado | `bg-warning` |
| Negociación | `bg-primary` |
| Ganado | `bg-success` |
| Perdido | `bg-danger` |
| Cliente | `bg-success` (verde HTK `#00d4aa`) |

### Estados de Work Order

| Estado | Color Bootstrap | Icono Sugerido |
|--------|----------------|----------------|
| Recibido | `bg-secondary` | 📥 |
| Diagnosticando | `bg-info` | 🔍 |
| Presupuestado | `bg-warning` | 💰 |
| Aprobado | `bg-success` | ✅ |
| Reparando | `bg-primary` | 🔧 |
| Esperando Repuestos | `bg-secondary` | 📦 |
| Completado | `bg-success` | ✅ |
| Entregado | `bg-success` | 📤 |
| Cancelado | `bg-danger` | ❌ |

---

## Apéndice C: Glosario de Términos

| Término | Definición |
|---------|-----------|
| **Lead** | Prospecto de negocio, potencial cliente |
| **Cliente** | Lead convertido que ya ha hecho negocio con HTK |
| **WO / Orden de Trabajo** | Registro de servicio técnico (reparación/mantenimiento) |
| **Pipeline** | Embudo de ventas con etapas de conversión |
| **Kanban** | Vista tablero con columnas por estado |
| **Segmento** | Categoría de mercado del lead (B2B taller, hoteles, etc.) |
| **Línea de Interés** | Servicio específico que le interesa al lead |
| **Pitch** | Mensaje de prospección personalizado por segmento |
| **Enriquecimiento** | Proceso de completar datos faltantes de un lead |
| **Scoring** | Puntuación numérica de calidad del lead (0-100) |
| **Seguimiento** | Próxima fecha/hora para contactar al lead |
| **HTK-XXX** | Prefijo de IDs de órdenes de trabajo |
| **PRO-XXX** | Prefijo de IDs de leads/prospectos |
| **CLI-XXX** | Prefijo de IDs de clientes |
| **VTA-XXX** | Prefijo de IDs de ventas |

---

> **Documento generado para HTK INGENIERIA (HOUSETRONIK S.A.S.)**  
> **Autor:** HTK-Asistente (OpenClaw AI)  
> **Fecha:** 2026-05-13  
> **Versión:** 1.0
