# CRM HTK INGENIERIA — Especificación Técnica v3

> **Versión:** 3.0 | **Fecha:** 2026-05-14  
> **Empresa:** HOUSETRONIK S.A.S. — HTK INGENIERIA  
> **Stack:** Flask 3.x + SQLite 3 + Bootstrap 5 + Vanilla JS + Node.js (Bot)  

---

## 1. Arquitectura General

```
┌──────────────────────────────────────────────────────┐
│                  CRM HTK v3                          │
│              Flask + SQLite + SPA                    │
│              localhost:18800                         │
├──────────────────────────────────────────────────────┤
│  Dashboard │ Kanban │ Clientes │ OTs │ Config       │
├──────────────────────────────────────────────────────┤
│                   API REST                           │
│  /api/leads  /api/clients  /api/work_orders         │
│  /api/bot/config  /api/inventario  /api/segments    │
├──────────────────────────────────────────────────────┤
│         │                                │           │
│    SQLite DB                     WhatsApp Bot        │
│    htk_crm.db                    bot/bot.js          │
│                                  :18802              │
└──────────────────────────────────────────────────────┘
```

---

## 2. Base de Datos

### 2.1 Tablas

```sql
-- Leads (prospectos)
leads (id, nombre, contacto, segmento, linea_interes, estado, fuente, 
       fecha_creacion, proximo_seguimiento, notas, valor_estimado,
       contacto_nombre, telefono, email, url, tipo_contacto,
       direccion, ciudad, empresa, documento)

-- Clientes (convertidos desde leads)
clients (id, telefono, nombre, fuente, primer_contacto, ultimo_contacto,
         interacciones_totales, estado, segmento, linea_interes,
         lead_id, notas, contacto_nombre,
         direccion, ciudad, tipo_documento, documento, empresa, cargo,
         cumpleanos, redes_contacto)

-- Órdenes de Trabajo (3 tipos)
work_orders (id, tipo, cliente_nombre, cliente_telefono, client_id,
             equipo_tipo, equipo_marca, equipo_modelo,
             falla_reportada, diagnostico, presupuesto, valor_total,
             estado, notas_internas, activo,
             fecha_recibido, fecha_diagnostico, fecha_presupuesto_aprobado,
             fecha_completado, fecha_entregado,
             campos_extra)  -- JSON: campos dinámicos según tipo

-- Historial de OT
work_order_history (id, wo_id, fecha, estado, descripcion, notificado)

-- Relación OT ↔ Cliente
work_order_client_links (wo_id, client_id)

-- Pagos y Abonos
payments (id, wo_id, monto, tipo, metodo, referencia, fecha, notas, registrado_por)

-- Plantillas de Notificación
wo_templates (id, nombre, tipo_ot, estado_origen, asunto, mensaje, canal, activo)

-- Configuración del Bot
bot_config (key, value, tipo, descripcion, categoria)

-- Inventario
inventario (id, codigo, nombre, categoria, unidad, cantidad, stock_minimo,
            proveedor, costo_unitario, ubicacion)

-- Movimientos de Inventario
inventario_movimientos (id, item_id, tipo, cantidad, motivo, fecha)

-- Pipeline (Kanban leads)
etapas (id, clave, nombre, orden, color, icono, probabilidad)

-- Segmentos
segmentos (key, label, color, orden, activo)

-- Interacciones
interactions (id, lead_id, lead_nombre, tipo, direccion, resumen, detalle,
              fecha, proximo_paso, estado)

-- Precios
precios (id, categoria, producto, capacidad, precio_base, precio_venta, notas)

-- Ventas
ventas (id, lead_id, cliente_id, cliente_nombre, producto, capacidad,
        valor_cotizado, valor_vendido, estado, fecha, notas)

-- Tags
tags (id, nombre, color)

-- Tareas
tareas (id, lead_id, tarea, estado, prioridad, vence, created_at, completada)
```

### 2.2 Tipos de Órdenes de Trabajo

| Tipo | Estados | Campos extra |
|------|---------|-------------|
| `reparacion` | recibido, diagnosticando, presupuestado, aprobado, reparando, esperando_repuestos, completado, entregado, cancelado | falla_reportada, diagnostico |
| `fabricacion` | cotizando, diseno_aprobado, materiales, bobinado, ensamble, pruebas, control_calidad, finalizado, entregado, cancelado | tipo_producto, capacidad, voltaje_entrada, voltaje_salida, fases, nucleo, refrigeracion, operario, fecha_inicio, fecha_estimada |
| `instalacion` | agendado, en_sitio, instalando, pruebas, finalizado, facturado, cancelado | direccion_instalacion, tipo_cargador, potencia, requiere_obra_civil, fecha_agendada, tecnico_asignado |

---

## 3. Backend — `crm_app.py`

### 3.1 Dependencias
- Flask (rutas, templates, sesiones)
- SQLite 3 (via `sqlite3` módulo estándar)
- `urllib.request` (comunicación con el bot :18802)

### 3.2 Autenticación
- Session-based (Flask sessions)
- Credenciales vía `HTK_ADMIN_USER` / `HTK_ADMIN_PASS` (default: admin/htk2026)
- Decorador `@login_required` con bypass para localhost en GET (permite al bot consultar sin auth)

### 3.3 API REST (rutas principales)

```
/api/stats                          GET     Dashboard KPIs
/api/leads                          GET/POST
/api/leads/<id>                     GET/PUT/DELETE
/api/leads/<id>/convert             POST     Lead → Cliente
/api/leads/<id>/interactions        GET/POST
/api/leads/<id>/notes               PUT
/api/leads/<id>/etapa               PATCH    Kanban move
/api/leads/kanban                   GET      Kanban leads
/api/clients                        GET/POST
/api/clients/<id>                   GET/PUT/DELETE
/api/clients/<id>/orders            GET
/api/clients/<id>/payments          GET
/api/clients/<id>/notes             PUT
/api/work_orders                    GET/POST  ?tipo=
/api/work_orders/tipos              GET
/api/work_orders/kanban             GET       ?tipo=
/api/work_orders/<id>               GET/PUT/DELETE
/api/work_orders/<id>/status        PUT
/api/work_orders/<id>/kanban        PATCH
/api/work_orders/<id>/payments      GET/POST
/api/work_orders/<id>/payments/<pid> DELETE
/api/work_orders/<id>/notify        POST
/api/wo-templates                   GET/POST  ?tipo_ot=
/api/wo-templates/<id>              PUT/DELETE
/api/inventario                     GET/POST  ?categoria=&search=
/api/inventario/<id>                GET/PUT/DELETE
/api/inventario/<id>/ajustar        POST
/api/inventario/<id>/movimientos    GET
/api/inventario/bajo-stock          GET
/api/inventario/categorias          GET
/api/bot/config                     GET/PUT
/api/bot/config/reload              POST
/api/bot/status                     GET
/api/bot/log                        GET
/api/bot/silence                    POST
/api/bot/unsilence                  POST
/api/bot/global-off                 POST
/api/bot/global-on                  POST
/api/send-message                   POST     Proxy → :18802
/api/segments                       GET
/api/pipeline                       GET
/api/tags                           GET
/api/prices                         GET/POST
/api/prices/<id>                    PATCH/DELETE
/api/sales                          GET/POST
/api/sales/<id>                     PATCH/DELETE
/api/tasks                          GET/POST
/api/tasks/<id>                     PATCH/DELETE
/api/export                         GET      CSV
/api/lead-week                      GET
/api/opciones                       GET
/api/auto/enrich                    POST
/api/auto/score                     GET
/api/auto/schedule                  POST
/api/auto/campaign                  POST
/api/auto/backup                    POST
```

---

## 4. Frontend — `index.html` (SPA)

### 4.1 Stack
- Bootstrap 5.3 (CSS + JS)
- Bootstrap Icons 1.11
- Vanilla JavaScript (sin frameworks)
- CSS custom properties (dark mode)

### 4.2 Pestañas principales
```
Dashboard  |  Kanban  |  Clientes  |  Órdenes  |  Prospectos  |  Interacciones  |  Inventario  |  Automatización  |  Configuración
```

### 4.3 Estados JavaScript
```javascript
ESTADOS_LEAD  = { nuevo, contactado, cotizado, negociacion, ganado, perdido, cliente }
ESTADOS_WO   = { recibido, diagnosticando, ..., cotizando, bobinado, ..., agendado, ... }  // 24 estados
ESTADOS_CLIENTE = { lead, cliente, inactivo }
TIPOS_OT     = { reparacion, fabricacion, instalacion }  // Cargado desde API
```

### 4.4 Funciones principales (~140 funciones)
- `loadDashboard()` — KPIs + pipeline + seguimientos + stats financieros
- `loadKanban()` — Router a `loadKanbanWO()` / `loadKanbanLeads()`
- `loadKanbanWO()` — Kanban de OTs con drag-drop + selector de tipo
- `loadClients()` / `showClientDetail()` — Lista + perfil 4-tabs
- `loadWorkOrders()` / `renderWorkOrders()` / `showWODetail()` — Tabla + detalle OT
- `loadLeads()` / `renderLeads()` / `showLeadDetail()` — Tabla + perfil lead
- `loadInventario()` — Inventario CRUD
- `switchConfigTab()` — Sub-pestañas de configuración
- `checkBotStatus()` — Indicador bot cada 60s

---

## 5. WhatsApp Bot — `bot/bot.js`

### 5.1 Máquina de Estados
```
IDLE → PRESENTACION → MENU → SUBMENU_EE → AWAITING_DETAIL → LEAD_COMPLETE
                                                              ↑
                         CONSULTA_OT ─────────────────────────┘
```

### 5.2 Menú del Bot (7 opciones)
1. 🔧 Reparación de equipos
2. ⚡ Elevadores y Estabilizadores
3. ⚙️ Automatización industrial
4. 🚗 Cargadores eléctricos
5. 📡 Monitoreo IoT
6. 🛠️ Otra consulta
7. 📋 Consultar estado de mi orden (código HTK-XXX)

### 5.3 Configuración desde CRM
- `loadConfigFromCRM()` — Carga 17 parámetros desde `/api/bot/config`
- Fallback a `config.js` + `messages.js` locales si CRM offline
- `/reload-config` — Recarga en caliente vía API HTTP (:18802)

### 5.4 Consulta de OT
- Cliente ingresa código → bot consulta `GET /api/work_orders/<id>`
- Respuesta: estado, timeline (5 eventos), pagos, datos de fabricación/instalación
- 21 íconos mapeados para todos los estados

---

## 6. Scripts de Automatización

| Script | Función |
|--------|---------|
| `auto_enrich.py` | Scraping de websites de leads (teléfonos, emails) |
| `auto_score.py` | Scoring 0-100 por datos + segmento |
| `auto_schedule.py` | Programación de seguimientos en horario laboral |
| `auto_campaign.py` | Generación de mensajes desde pitches.json |

---

## 7. Seguridad

- Login con sesión Flask (`@login_required`)
- Bypass localhost para el bot (solo GET)
- API keys vía variables de entorno
- No se exponen notas internas en la consulta pública de OT
- Backup automático cada 12h (crontab) con retención 14 días

---

## 8. Despliegue

```bash
# Servicios systemd (user)
systemctl --user enable htk-crm.service
systemctl --user start htk-crm.service

# Cloudflare Tunnel
cloudflared tunnel run htk-crm
```

---

> ⚡ **HTK INGENIERIA** — v3.0 · 2026-05-14
