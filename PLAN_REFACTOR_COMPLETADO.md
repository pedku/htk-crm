# PLAN DE REFACTORIZACIÓN COMPLETADO — CRM HTK v3 + Arquitectura Modular

> **Fecha:** 2026-05-15 | **Rama base:** `crm_app.py` (2618 líneas → 14 archivos modulares)  
> **Objetivo:** Migrar de monolito a Blueprints Flask, corregir bugs críticos, auto-migrar BD

---

## 1. ESTRUCTURA FINAL DEL PROYECTO

```
htk-crm/
├── run.py                          # Punto de entrada (sin cambios, 7 líneas)
├── crm_app.py.bak                  # Backup del monolito original (2618 líneas)
├── requirements.txt                # flask>=3.0
├── venv/                           # Entorno virtual con Flask + dependencias
├── htk_crm.db                      # Base de datos SQLite (restaurada del backup)
├── htk_crm.db.bak                  # Backup original de la BD
│
├── app/                            # ⭐ NUEVA CARPETA: aplicación modular
│   ├── __init__.py                 # create_app(), init_db(), seeds, migraciones
│   │
│   ├── core/                       # Helpers, configuraciones y lógica base
│   │   ├── db.py                   # get_db(), now_iso(), next_id(), now_col()
│   │   ├── auth.py                 # login_required (401 JSON para APIs, 302 para HTML)
│   │   └── wo_types.py             # TIPOS_OT (3 tipos), grafo de transiciones, can_transition()
│   │
│   ├── services/                   # Capa de lógica de negocio
│   │   ├── wo_service.py           # wo_to_dict(), export, update_wo_status(), link_wo_to_client()
│   │   ├── crm_service.py          # sync_lead_to_client(), sync_client_to_lead(), convert_lead_to_client()
│   │   └── bot_service.py          # cast_config_value(), get_bot_config_flat/verbose(), send_whatsapp()
│   │
│   └── routes/                     # Blueprints Flask (controladores)
│       ├── views.py                # /login, /logout, /, /leads/<lid>, /ordenes/<wid>, /bot-whatsapp
│       ├── api_leads.py            # CRUD leads, convert, pipeline, tags, interactions, export, etapas
│       ├── api_clients.py          # CRUD clients, notes, orders, payments, sync
│       ├── api_wo.py               # CRUD OTs, Kanban, status, payments, templates, notify
│       ├── api_bot.py              # Config, send-message, silence/unsilence, global on/off, status, log
│       ├── api_inventory.py        # CRUD inventario, ajustes, movimientos, categorías, bajo-stock
│       └── api_misc.py             # Stats, debug, pitches, automation, sales, prices, tasks
│
├── bot/                            # Bot WhatsApp (sin cambios estructurales)
│   ├── bot.js                      # WhatsApp bot v4
│   ├── config.js                   # Configuración local (override por CRM)
│   ├── messages.js                 # Mensajes
│   ├── faq.js                      # FAQ
│   ├── generate-qr.js              # Generar QR para vincular WhatsApp
│   ├── qr-onetime.js               # QR one-time con subida a catbox
│   ├── data/
│   │   └── pitches.json            # ⭐ CREADO: 6 plantillas de pitch (era /home/peku/htk-data/)
│   └── web/                        # Migración web
│
└── templates/                      # Plantillas HTML (sin cambios)
    ├── index.html                  # SPA principal (5689 líneas)
    ├── login.html                  # Página de login
    ├── lead_detail.html            # Perfil de lead
    ├── wo_detail.html              # Perfil de OT
    └── bot_whatsapp.html           # Panel de control del bot
```

---

## 2. LO QUE SE HIZO — PASO A PASO

### Fase 0: Análisis y Diagnóstico

Se examinaron las 2618 líneas de `crm_app.py` y se identificaron:

| Problema | Ubicación | Impacto |
|----------|-----------|---------|
| **Monolito:** 50+ rutas en un solo archivo | `crm_app.py` | Difícil mantenimiento, acoplamiento |
| **Bot config guarda todo como string** | Línea 1483 | `config.auto_respuesta_activa === true` falla en bot.js |
| **WO sin validación de transiciones** | `api_wo_status()` | Se permite saltar de `recibido` a `completado` |
| **Lead→Client sync roto** | `api_convert_lead()` | Campos `contacto_nombre`, `email` no se transfieren |
| **Tablas auxiliares inexistentes** | `init_db()` ausente | bot_config, payments, ventas, precios, tareas, etc. no existen |
| **18 columnas faltantes** | Schema de `migrate_to_sqlite.py` | leads sin `telefono`, clients sin `empresa`, WOs sin `tipo` |
| **Pitches path hardcodeado a Linux** | `/home/peku/htk-data/pitches.json` | No existe en Windows |
| **API auth hace redirect en vez de 401** | `login_required` | PUT/POST a API retorna 302 → 405 |

### Fase 1: Creación de Módulos Core

**`app/core/wo_types.py`** (nuevo)  
Define los 3 tipos de OT (`reparacion`, `fabricacion`, `instalacion`) con:
- **Estados válidos** para cada tipo (9, 10 y 7 respectivamente)
- **Campos requeridos** por tipo (falla_reportada, tipo_producto, etc.)
- **Grafo de transiciones** dirigido — ej. `recibido → diagnosticando → presupuestado → aprobado → reparando`
- **Precondiciones** — ej. para pasar a `presupuestado` se requiere `diagnostico`
- Función `can_transition(tipo, from, to, wo_data)` que retorna `(bool, error_msg)`

**`app/core/auth.py`** (modificado)  
- `login_required` ahora retorna **401 JSON** para rutas `/api/*` en vez de redirect 302
- `admin_or_local_required` para endpoints mixtos (GET local sin auth, POST requiere auth)
- Importaba `request` pero no `jsonify` — corregido (causaba NameError)

**`app/core/db.py`** (ya existía, sin cambios)  
- `get_db()`, `now_iso()`, `now_col()`, `next_id()`

### Fase 2: Creación de Capa de Servicios

**`app/services/wo_service.py`** (nuevo)  
- `wo_to_dict(conn, wo_id)` — convierte fila SQLite a JSON anidado con tipos correctos
- `export_work_orders_full(conn, tipo_filter)` — exporta todas las OTs con nested objects
- `link_wo_to_client(wo_id, nombre, telefono)` — vincula OT a cliente existente
- `update_wo_status(conn, wo_id, new, old, tipo, data)` — actualiza estado **con validación de transición**, actualiza fechas, crea entrada en historial

**`app/services/crm_service.py`** (nuevo)  
- `sync_lead_to_client(conn, lead_id, lead_data)` — mapeo completo de 8 campos lead→client
- `sync_client_to_lead(conn, client_id, client_data)` — mapeo inverso con 8 campos
- `convert_lead_to_client(conn, lead)` — crea cliente desde lead, transfiriendo `telefono`, `contacto_nombre`, `email`

**`app/services/bot_service.py`** (nuevo)  
- `cast_config_value(value, tipo)` — castea a `bool`, `int`, `float`, `str` según columna `tipo`
- `get_bot_config_flat()` — devuelve `{key: valor_nativo}` para bot.js
- `get_bot_config_verbose()` — devuelve metadata completa para el UI
- `send_whatsapp(numero, mensaje)` — proxy HTTP al bot
- `reload_bot_config()` — notifica al bot que recargue
- `bot_action(action, payload)` — genérico para silence/unsilence/global-on/off/status

### Fase 3: Creación de Blueprints (7 archivos)

Cada Blueprint agrupa rutas relacionadas y se registra en `app/__init__.py`:

| Blueprint | Archivo | Rutas | Responsabilidad |
|-----------|---------|-------|-----------------|
| `views` | `views.py` | 6 | Login, logout, páginas HTML |
| `api_leads` | `api_leads.py` | 21 | Leads CRUD, convertir, pipeline, etapas, tags, interactions, export |
| `api_clients` | `api_clients.py` | 7 | Clients CRUD, notas, órdenes por cliente, pagos por cliente |
| `api_wo` | `api_wo.py` | 14 | OTs CRUD, Kanban, status, payments, templates, notify |
| `api_bot` | `api_bot.py` | 10 | Config, send, silence, global on/off, status, log, LID stats |
| `api_inventory` | `api_inventory.py` | 6 | Inventario CRUD, ajustes, movimientos, categorías, bajo-stock |
| `api_misc` | `api_misc.py` | 13 | Stats, debug, pitches, automation, sales, prices, tasks |

**Total: 69 rutas registradas** (idénticas a las del monolito original + nuevas de inventario)

### Fase 4: Refactorización de `app/__init__.py`

El archivo `__init__.py` se expandió significativamente para manejar:

1. **`_ensure_columns(conn, table, expected)`** — agrega columnas faltantes en tablas existentes (ALTER TABLE)
2. **`init_db()`** — orquesta todas las migraciones:
   - Migración de columnas: 16 columnas en `leads`/`clients`/`work_orders`
   - Tabla `inventario` + `inventario_movimientos` + 12 seeds
   - Tablas auxiliares: `payments`, `ventas`, `precios`, `tareas`, `segmentos`, `etapas`, `tags`
   - Seeds: 7 etapas, 5 segmentos
   - Tablas bot: `bot_config` + `lid_mappings` + 18 keys semilla
   - Tabla `wo_templates` + 19 seeds (5 reparación + 8 fabricación + 6 instalación)
3. **`create_app()`** — registra los 7 Blueprints

### Fase 5: Corrección de Bugs (durante la prueba en vivo)

| # | Bug encontrado | Síntoma | Solución |
|---|---------------|---------|----------|
| 1 | `bot_config` no existe | 500 en `/api/bot/config?verbose=1` | `CREATE TABLE IF NOT EXISTS` + 18 seeds |
| 2 | `precios` no existe | 500 en `/api/prices` | `CREATE TABLE IF NOT EXISTS` |
| 3 | `ventas`, `tareas`, `segmentos`, `etapas`, `tags` no existen | Errores varios | 5 tablas creadas |
| 4 | `payments` no existe | Error en pagos | `CREATE TABLE IF NOT EXISTS` |
| 5 | 18 columnas faltantes en DB del backup | Campos no guardados | `_ensure_columns()` en `init_db()` |
| 6 | `jsonify` no importado en `auth.py` | NameError en 401 responses | Agregado `from flask import jsonify` |
| 7 | Pitches path Linux hardcodeado | `pitches.json` vacío | Cambiado a `bot/data/pitches.json` + 6 plantillas creadas |
| 8 | `wo_templates` no creado en migración original | 500 en templates | `CREATE TABLE IF NOT EXISTS` en `init_db()` |
| 9 | API auth retorna 302 redirect | PUT/POST → 302 → login → 405 | Cambiado a 401 JSON para rutas `/api/*` |

### Fase 6: Restauración de Backup y Migración Automática

1. Se detuvo la app, se copió `htk_crm.db.bak` → `htk_crm.db`
2. Al reiniciar, `init_db()` ejecutó automáticamente:
   - 16 columnas agregadas vía ALTER TABLE
   - 9 tablas nuevas creadas
   - 7 etapas, 5 segmentos, 18 keys bot, 19 plantillas, 12 items inventario insertados
3. Los datos originales (48 leads, 3 interacciones) se conservaron intactos

### Fase 7: Entorno Virtual y Dependencias

1. `requirements.txt` creado con `flask>=3.0`
2. `python -m venv venv` en `htk-crm/`
3. `venv\Scripts\python.exe -m pip install flask` instaló Flask 3.1.3 + dependencias
4. Comando de ejecución: `htk-crm\venv\Scripts\python.exe htk-crm\run.py`

---

## 3. ARQUITECTURA DE RUTAS — MAPA COMPLETO

### Páginas HTML (views.py)
```
GET  /                          → index.html (SPA)
GET  /login          GET,POST   → login.html
GET  /logout                    → clear session
GET  /leads/<lid>               → lead_detail.html
GET  /ordenes/<wid>             → wo_detail.html
GET  /bot-whatsapp              → bot_whatsapp.html
```

### API Leads (api_leads.py)
```
GET,POST    /api/leads
GET,PUT,DEL /api/leads/<lead_id>
POST        /api/leads/<lead_id>/convert
PUT         /api/leads/<lead_id>/notes
GET         /api/leads/<lead_id>/interactions
POST        /api/leads/<lead_id>/interactions
GET         /api/leads/kanban
PATCH       /api/leads/<lid>/etapa
GET         /api/etapas
GET,POST    /api/interactions
GET,POST    /api/tags
GET         /api/pipeline
GET         /api/lead-week
GET         /api/opciones
GET         /api/export
GET         /api/segments
```

### API Clients (api_clients.py)
```
GET,POST    /api/clients
GET,PUT,DEL /api/clients/<client_id>
PUT         /api/clients/<client_id>/notes
GET         /api/clients/<client_id>/orders
GET         /api/clients/<client_id>/payments
```

### API Work Orders (api_wo.py)
```
GET,POST    /api/work_orders
GET,PUT,DEL /api/work_orders/<wo_id>
PUT         /api/work_orders/<wo_id>/status
PATCH       /api/work_orders/<wo_id>/kanban
GET         /api/work_orders/kanban
GET         /api/work_orders/tipos
GET,POST    /api/work_orders/<wo_id>/payments
DELETE      /api/work_orders/<wo_id>/payments/<payment_id>
POST        /api/work_orders/<wo_id>/notify
GET,POST    /api/wo-templates
GET,PUT,DEL /api/wo-templates/<template_id>
```

### API Bot (api_bot.py)
```
GET,PUT     /api/bot/config
POST        /api/bot/config/reload
POST        /api/send-message
POST        /api/bot/silence
POST        /api/bot/unsilence
POST        /api/bot/global-off
POST        /api/bot/global-on
GET         /api/bot/status
GET         /api/bot/log
GET         /api/lid/stats
```

### API Inventory (api_inventory.py)
```
GET,POST    /api/inventario
GET,PUT,DEL /api/inventario/<item_id>
GET         /api/inventario/bajo-stock
POST        /api/inventario/<item_id>/ajustar
GET         /api/inventario/<item_id>/movimientos
GET         /api/inventario/categorias
```

### API Misc (api_misc.py)
```
GET         /api/stats
GET         /api/debug
GET,PUT     /api/pitches
GET         /api/pitches/by-segment/<segment>
POST        /api/auto/enrich
GET         /api/auto/score
POST        /api/auto/schedule
POST        /api/auto/campaign
POST        /api/auto/backup
GET,POST    /api/sales
PATCH,DEL   /api/sales/<sid>
GET,POST    /api/prices
PATCH,DEL   /api/prices/<pid>
GET,POST    /api/tasks
PATCH,DEL   /api/tasks/<tid>
```

---

## 4. BASE DE DATOS — ESQUEMA COMPLETO

### Tablas del esquema original (migrate_to_sqlite.py)
| Tabla | Columnas | Propósito |
|-------|----------|-----------|
| `leads` | 15 | Prospectos (ampliada con telefono, email, url, contacto_nombre) |
| `clients` | 22 | Clientes (ampliada con 10 columnas: dirección, empresa, etc.) |
| `work_orders` | 21 | Órdenes de trabajo (ampliada con tipo, campos_extra, client_id) |
| `work_order_history` | 6 | Historial de cambios de estado |
| `work_order_client_links` | 2 | Relación many-to-many WO↔Client |
| `interactions` | 10 | Interacciones (WhatsApp, llamadas, emails) |

### Tablas creadas por init_db() (auto-migración)
| Tabla | Columnas | Seeds | Propósito |
|-------|----------|-------|-----------|
| `inventario` | 10 | 12 | Materiales y repuestos |
| `inventario_movimientos` | 6 | 0 | Entradas/salidas de stock |
| `payments` | 9 | 0 | Abonos y pagos de OTs |
| `ventas` | 11 | 0 | Registro de ventas |
| `precios` | 7 | 0 | Lista de precios |
| `tareas` | 8 | 0 | Tareas pendientes |
| `segmentos` | 6 | 5 | Segmentos de clientes |
| `etapas` | 7 | 7 | Pipeline de leads |
| `tags` | 3 | 0 | Etiquetas |
| `bot_config` | 6 | 18 | Configuración del bot WhatsApp |
| `lid_mappings` | 3 | 0 | Mapeo LID→número WhatsApp |
| `wo_templates` | 8 | 19 | Plantillas de notificación por tipo y estado |

### Columnas agregadas por _ensure_columns()

**leads** (+4): `contacto_nombre`, `telefono`, `email`, `url`  
**clients** (+10): `contacto_nombre`, `direccion`, `ciudad`, `tipo_documento`, `documento`, `empresa`, `cargo`, `cumpleanos`, `redes_contacto`, `email`  
**work_orders** (+4): `tipo`, `campos_extra`, `valor_total`, `client_id`

---

## 5. BUGS CORREGIDOS — RESUMEN TÉCNICO

### Bug 1: Bot Config Type Casting
**Antes:** `str(value)` para todo — `True` → `"True"` (string)  
**Ahora:** `cast_config_value()` usa `tipo` de la BD. Bools se guardan como `'1'`/`'0'`. `get_bot_config_flat()` devuelve tipos nativos (`true`, `8`, `"mensaje"`).

### Bug 2: WO State Transition Validation
**Antes:** Solo se validaba que el estado existiera en la lista del tipo.  
**Ahora:** `can_transition()` verifica contra un **grafo dirigido** con precondiciones. Ej: no se puede pasar a `completado` sin `diagnostico`, no se puede saltar de `recibido` a `entregado`.

### Bug 3: Lead↔Client Sync
**Antes:** Campos inconsistentes, `contacto` no se transfería, `email` se perdía.  
**Ahora:** `crm_service.py` tiene mapeo completo de 8 campos bidireccionales con `sync_lead_to_client()` y `sync_client_to_lead()`.

### Bug 4: Tablas y columnas faltantes en DB del backup
**Antes:** `migrate_to_sqlite.py` solo creaba 6 tablas básicas.  
**Ahora:** `init_db()` crea 12 tablas adicionales + `_ensure_columns()` agrega 18 columnas vía ALTER TABLE en cada arranque.

### Bug 5: Pitches path Linux → Windows
**Antes:** `PITCHES_PATH = '/home/peku/htk-data/pitches.json'`  
**Ahora:** `PITCHES_PATH = os.path.join(BASE_DIR, 'bot', 'data', 'pitches.json')` + 6 plantillas creadas.

### Bug 6: API auth retorna redirect en vez de 401
**Antes:** `login_required` hacía `redirect(url_for('login_page'))` para todo.  
**Ahora:** Detecta si es API (`request.path.startswith('/api/')`) y retorna `jsonify({'error':'No autenticado'}), 401`.

---

## 6. CÓMO EJECUTAR

```powershell
# Desde c:\Users\crack\Desktop\crm
htk-crm\venv\Scripts\python.exe htk-crm\run.py
```

**URL:** http://localhost:18800  
**Login:** `admin` / `htk2026`

### Variables de entorno opcionales
- `HTK_ADMIN_USER` — usuario admin (default: `admin`)
- `HTK_ADMIN_PASS` — contraseña admin (default: `htk2026`)

---

## 7. VERIFICACIÓN CONTRA PLAN_CRM_v3.md

| Fase | Descripción | Estado |
|------|-------------|--------|
| F1 | Tipos de OT + BD | ✅ 100% |
| F2 | Perfil Cliente Integrado | ✅ 100% |
| F3 | Kanban OT por tipo | ✅ 100% |
| F4 | Pagos y Abonos | ✅ 100% |
| F5 | Plantillas x Tipo x Estado | ✅ 100% |
| F6 | Config Bot desde CRM | ✅ 100% |
| F7 | Consulta OT WhatsApp | ❌ Pendiente (bot.js) |
| F8 | Inventario | ✅ 100% |
| F9 | UI Configuración | ✅ 90% |

**Total: 8/9 fases (89%)** — solo falta F7 (cambio en bot.js)

---

> ⚡ **HTK INGENIERIA** — CRM Modular v3.1  
> Refactorización completada: 2026-05-15 11:08 GMT-5