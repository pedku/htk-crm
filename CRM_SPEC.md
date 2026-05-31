# CRM HTK INGENIERIA — Especificación del Sistema

> Versión: 3.1 | Rama: `main` | Fecha: 2026-05-31

---

## 1. Visión General

Sistema de gestión integral para **HTK INGENIERIA (HOUSETRONIK S.A.S.)**, empresa de automatización industrial, IoT, mantenimiento electrónico y cargadores eléctricos en Barranquilla, Colombia.

### Objetivo
Centralizar la relación con clientes y prospectos: gestión de leads, conversión a clientes, órdenes de trabajo, facturación con IVA, inventario, automatización de prospección, y atención vía WhatsApp.

### Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | Flask (Python) | 3.x |
| Base de datos | SQLite | 3 (WAL mode, foreign keys ON) |
| Frontend | Bootstrap 5.3 + Bootstrap Icons + Vanilla JS | SPA modular (17 módulos) |
| WhatsApp Bot | whatsapp-web.js (Node.js) | v1.34.7 |
| PDF | WeasyPrint | 68.1 |
| Túnel público | Cloudflare Tunnel | HTTPS |
| Google Workspace | gog CLI | v0.19.0 |
| Orquestación | systemd (user) | — |

---

## 2. Arquitectura

```
htk-crm/
├── app/                          # Flask backend
│   ├── __init__.py               # App factory, DB init, migraciones
│   ├── routes/
│   │   ├── views.py              # Login, logout, index
│   │   ├── api_leads.py          # Leads, kanban, pipeline, segmentos, tags
│   │   ├── api_clients.py        # Clientes CRUD, búsqueda, perfil
│   │   ├── api_wo.py             # Órdenes de trabajo, tipos, finanzas
│   │   ├── api_invoices.py       # Facturas, items, IVA, PDF, Drive, WhatsApp
│   │   ├── api_inventory.py      # Inventario IoT/cargadores/repuestos
│   │   ├── api_bot.py            # Config y control del bot WhatsApp
│   │   └── api_misc.py           # Pitches, interacciones, estadísticas
│   └── services/
│       ├── bot_service.py        # Envío WhatsApp desde backend
│       ├── crm_service.py        # Lógica compartida CRM
│       └── wo_service.py         # Lógica órdenes de trabajo
│
├── static/
│   ├── js/                       # 17 módulos JS
│   │   ├── core.js               # Utilidades (fetchJSON, formatCurrency, toast, etc.)
│   │   ├── dashboard.js          # Widgets KPIs, pipeline funnel
│   │   ├── leads.js              # Leads table, modal, perfil
│   │   ├── leads_pitch.js        # Envío de pitches
│   │   ├── clients.js            # Clientes table, modal
│   │   ├── workorders.js         # OT table, modal, finanzas
│   │   ├── facturacion.js        # Facturas table, crear/editar/ver, IVA, items
│   │   ├── inventario.js         # Inventario products
│   │   ├── kanban.js             # Kanban board drag-drop
│   │   ├── interactions.js       # Timeline interacciones
│   │   ├── config.js             # Config sistema + bot
│   │   ├── company.js            # Datos empresa
│   │   ├── notifications.js      # Badge notificaciones
│   │   ├── search.js             # Search global (Ctrl+K)
│   │   ├── pitches.js            # Gestión pitches
│   │   ├── segments.js           # Gestión segmentos
│   │   └── crm.js                # Orquestador SPA (264 líneas)
│   └── css/
│       └── crm.css               # Tema dark, Flat Design, paleta azul #2563EB
│
├── templates/
│   ├── base.html                 # Layout SPA (sidebar, tabs, modales)
│   ├── login.html                # Login
│   └── pages/
│       ├── dashboard.html        # Dashboard
│       ├── leads.html            # Leads
│       ├── clients.html          # Clientes
│       ├── work_orders.html      # Órdenes de trabajo
│       ├── facturacion.html      # Facturas + modal crear/editar/ver
│       ├── factura_template.html        # Plantilla PDF elegante
│       ├── factura_template_print.html  # Plantilla impresión
│       ├── kanban.html           # Kanban
│       ├── inventario.html       # Inventario
│       ├── interactions.html     # Interacciones
│       ├── config.html           # Configuración
│       └── automation.html       # Automatización
│
├── bot/                          # WhatsApp Bot (Node.js)
│   ├── bot.js                    # Bot principal — máquina de estados
│   ├── config.js                 # Config
│   ├── messages.js               # Plantillas mensajes
│   ├── faq.js                    # FAQ
│   ├── notify.js                 # Notificaciones automáticas
│   ├── lid-resolver.js           # Resolución @lid
│   └── web/                      # API auxiliar del bot
│
├── run.py                        # Entry point producción (:18800)
├── run_dev.py                    # Entry point desarrollo (:18801)
├── migrate_to_sqlite.py          # Migraciones DB
├── htk_crm.db                    # SQLite
├── README.md                     # Documentación general
├── CRM_SPEC.md                   # Esta especificación
└── CONTEXT.md                    # Lenguaje compartido del dominio
```

---

## 3. Base de Datos

### Tablas principales

| Tabla | Propósito | Columnas clave |
|-------|----------|----------------|
| `leads` | Prospectos | id, nombre, telefono, email, segmento, etapa, score, url |
| `clients` | Clientes | id, nombre, documento, tipo_persona, direccion, telefono, email |
| `work_orders` | Órdenes de trabajo | id, client_id, tipo, estado, equipo, presupuesto, valor_total |
| `invoices` | Facturas | id, client_id, wo_id, numero, estado, sub_total, iva_total, total_general, descuento |
| `invoice_items` | Items de factura | id, invoice_id, descripcion, cantidad, precio_unitario, iva_porcentaje, iva_incluido, total_linea |
| `payments` | Abonos/pagos | id, wo_id, invoice_id, monto, tipo, metodo, fecha |
| `inventory` | Inventario | id, categoria, tipo, producto, precio_venta, disponible |
| `interactions` | Timeline | id, tipo, entidad_id, via, resumen |
| `bot_config` | Configuración | key, value, tipo, categoria |
| `segments` | Segmentos | id, nombre, color, icono |
| `tags` | Etiquetas | id, nombre |
| `tasks` | Tareas | id, lead_id, descripcion, fecha_limite, completada |

### Migraciones automáticas
- Al iniciar `app/__init__.py` verifica columnas faltantes y las agrega
- Formato: `_ensure_columns(conn, 'table', ['col1', 'col2', ...])`

---

## 4. API REST

### Autenticación
Todas las rutas bajo `/api/*` requieren sesión Flask (`@login_required`).
Excepción: `/factura/<id>` (pública, para enlaces WhatsApp).

### Principales endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| **Leads** |||
| GET | `/api/leads` | Listar leads (filtros: segmento, etapa, search) |
| POST | `/api/leads` | Crear lead |
| PUT | `/api/leads/<id>` | Actualizar lead |
| DELETE | `/api/leads/<id>` | Eliminar lead |
| GET | `/api/kanban` | Datos para kanban board |
| GET | `/api/pipeline` | Pipeline funnel |
| **Clientes** |||
| GET | `/api/clientes` | Listar clientes |
| POST | `/api/clientes` | Crear cliente |
| **Órdenes de Trabajo** |||
| GET | `/api/work_orders` | Listar OT |
| POST | `/api/work_orders` | Crear OT |
| PUT | `/api/work_orders/<id>` | Actualizar OT |
| POST | `/api/work_orders/<id>/payments` | Agregar pago |
| **Facturación** |||
| GET | `/api/facturas` | Listar facturas |
| POST | `/api/facturas` | Crear factura con items |
| PUT | `/api/facturas/<id>` | Editar factura |
| POST | `/api/facturas/<id>/emitir` | Emitir factura |
| POST | `/api/facturas/<id>/pagar` | Pagar factura (crea pago, genera PDF, envía WhatsApp) |
| DELETE | `/api/facturas/<id>` | Anular factura |
| GET | `/api/facturas/<id>/pdf` | Vista previa PDF (HTML) |
| GET | `/api/facturas/<id>/print` | Plantilla impresión |
| POST | `/api/facturas/<id>/enviar-whatsapp` | Enviar factura por WhatsApp |
| GET | `/factura/<id>` | Vista pública (sin auth) |
| **Bot** |||
| POST | `/api/bot/send-message` | Enviar mensaje |
| POST | `/api/bot/global-on` / `off` | Control global |

---

## 5. Sistema de Facturación

### Modelo de IVA
- **IVA 19%** (Colombia)
- Por defecto configurable en Configuración
- Cada item puede tener:
  - `iva_incluido = 0`: IVA se suma al precio unitario → Total = precio × cant × 1.19
  - `iva_incluido = 1`: IVA ya está en el precio → Total = precio × cant (se extrae IVA internamente)

### Cálculo de totales

```
Para cada item:
  si iva_incluido:
    total_linea = cant × precio
    iva_linea = total_linea × iva% / (100 + iva%)
    base_linea = total_linea - iva_linea
  sino:
    total_linea = cant × precio × (1 + iva%/100)
    iva_linea = cant × precio × iva%/100
    base_linea = cant × precio

sub_total = Σ base_linea
iva_total = Σ iva_linea
total_general = sub_total + iva_total - descuento
```

### Flujo al pagar
```
POST /api/facturas/<id>/pagar
  ├── 1. Calcula saldo pendiente (total - abonos vinculados - abonos legacy OT)
  ├── 2. Crea registro de pago en payments
  ├── 3. Cambia estado → 'pagada'
  └── 4. Background thread:
        ├── Genera PDF con WeasyPrint (pdf-gen.py)
        ├── Sube a Google Drive → carpeta "Facturas"
        └── Envía PDF por WhatsApp al cliente
```

### PDF Generation
- Script: `/home/peku/htk-whatsapp-bot/pdf-gen.py`
- Fetch HTML desde `/factura/<id>`
- WeasyPrint → PDF (2 segundos)
- Upload Google Drive vía `gog drive upload`
- Output: `facturas/<id>.pdf`

---

## 6. WhatsApp Bot

### Máquina de estados
```
IDLE → PRESENTACION → MENU
  ├── SUBMENU_EE → AWAITING_DETAIL → LEAD_COMPLETE
  └── CONSULTA_OT
```

### Comportamientos
- **Silenciamiento:** Si Pedro responde → bot calla (estado SILENT)
- **Fuera de horario:** Lun-Vie 8-18, Sáb 8-13 → mensaje automático
- **Dedup:** Message ID para evitar duplicados
- **Global off:** Persistente en JSON, controlable desde CRM

### Endpoints del bot (Node.js, puerto 18802)
- `/send-message` — Enviar texto
- `/send-document` — Enviar PDF (ruta local)
- `/notify-ot-status` — Notificar cambio de estado OT

---

## 7. Automatización (Toolkit)

Scripts autónomos sin IA, accesibles desde pestaña Automatización:

| Script | Función |
|--------|---------|
| `auto_enrich.py` | Scrapea websites de leads, extrae teléfonos/emails |
| `auto_score.py` | Puntúa leads 0-100 por datos + segmento |
| `auto_schedule.py` | Asigna próximo seguimiento en horario laboral |
| `auto_campaign.py` | Genera mensajes desde pitches.json |
| `backup_db.sh` | Backup comprimido, retención 14 días |

---

## 8. Google Workspace (gog)

- **CLI:** gog v0.19.0
- **Cuenta:** info@htk-ingenieria.com
- **Servicios:** Gmail, Calendar, Drive, Contacts
- **Auth:** OAuth 2.0 con refresh token
- **Keyring:** file-based (GOG_KEYRING_BACKEND=file)
- **Drive folder:** `1iCIFtVBh4feypxGe-s3bM3VMA72Jat0r` (Facturas)

---

## 9. Diseño y UX

| Elemento | Valor |
|----------|-------|
| Estilo | Flat Design + Minimalism |
| Paleta primaria | Azul #2563EB |
| Tipografía | Plus Jakarta Sans |
| Tema default | Dark mode |
| Iconos | Bootstrap Icons |
| Framework CSS | Bootstrap 5.3 |

---

## 10. Despliegue

### Servicios systemd
```
htk-crm.service       → Flask :18800 (producción)
htk-crm-dev.service   → Flask :18801 (desarrollo)
cloudflared-tunnel    → HTTPS crm.htk-ingenieria.com
bot.js (pm2/nohup)    → Node.js :18802
```

### Ramas Git
```
main → producción (código estable, funcional)
dev  → desarrollo (se copia desde main para nuevas features)
```

---

## 11. Mantenimiento

### Logs
- **CRM:** journalctl --user -u htk-crm
- **Bot:** `/home/peku/htk-whatsapp-bot/bot.log`

### Backup
```bash
# Manual
~/scripts/backup_db.sh

# Automático (cron)
0 6,18 * * * ~/scripts/backup_db.sh
```

### Update
```bash
cd ~/.openclaw/workspace/crm
git checkout main && git pull
systemctl --user restart htk-crm
```
