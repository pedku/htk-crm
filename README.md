# HTK CRM v3 — Sistema Integral de Gestión

CRM + WhatsApp Bot unificados para **HTK INGENIERIA (HOUSETRONIK S.A.S.)**  
Automatización Industrial · IoT · Mantenimiento Electrónico · Cargadores EV  
📍 Barranquilla, Colombia

---

## 🚀 Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Flask 3.x (Python) + SQLite 3 |
| Frontend | Bootstrap 5.3 + Vanilla JS (SPA, una sola página) |
| Bot WhatsApp | Node.js + whatsapp-web.js v1.34.7 + Puppeteer (Chrome headless) |
| Túnel | Cloudflare Tunnel → `crm.htk-ingenieria.com` |
| Orquestación | systemd (user services) |

---

## 📦 Instalación

```bash
git clone git@github.com:pedku/htk-crm.git
cd htk-crm

# Backend
pip install flask

# WhatsApp Bot
cd bot && npm install && cd ..

# Iniciar
python3 crm_app.py              # → http://localhost:18800
cd bot && node bot.js           # → Bot WhatsApp :18802
```

---

## 🗂️ Estructura

```
crm/
├── crm_app.py                  # Backend Flask — API REST + HTML server
├── htk_crm.db                  # SQLite — base de datos unificada
├── templates/
│   ├── index.html              # SPA principal (tab-based UI)
│   ├── login.html              # Pantalla de login
│   ├── lead_detail.html        # Perfil de lead
│   └── bot_whatsapp.html       # Panel del bot
├── bot/                        # WhatsApp Bot (integrado)
│   ├── bot.js                  # Bot principal v4 — máquina de estados
│   ├── config.js               # Configuración local (fallback si CRM offline)
│   ├── messages.js             # Mensajes predefinidos (fallback)
│   ├── faq.js                  # Respuestas FAQ
│   ├── lid-resolver.js         # Resolución de @lid → número real
│   ├── notify.js               # Notificaciones push
│   ├── qr-onetime.js           # Generador QR + upload a Catbox (120s timeout)
│   ├── qr-service.sh           # Servicio QR con Catbox auto-refresh
│   ├── data/                   # Datos operativos (silencios, outbound, etc.)
│   └── web/                    # Interfaz web legacy del bot
├── scripts/                    # Automation Toolkit
│   ├── auto_enrich.py          # Scraping de websites de leads
│   ├── auto_score.py           # Scoring 0-100
│   ├── auto_schedule.py        # Programación de seguimientos
│   └── auto_campaign.py        # Generación de mensajes personalizados
├── backups/                    # Backups automáticos (14d retención)
├── backup_db.sh                # Script de backup comprimido
└── PLAN_CRM_v3.md              # Plan de implementación v3
```

---

## 🔐 Acceso

| Usuario | Contraseña | Configurable |
|---------|-----------|-------------|
| `admin` | `htk2026` | `HTK_ADMIN_USER` / `HTK_ADMIN_PASS` |

---

## ✨ Funcionalidades

### 📊 Dashboard
- KPIs en tiempo real: leads, clientes, OTs activas, completadas
- Widgets financieros: presupuestado, abonado, pendiente
- Pipeline funnel con porcentajes por etapa
- Próximos seguimientos desde leads
- Indicador de conexión del bot 🟢/🔴

### 🏷️ Kanban Dual
- **Kanban de Leads** — Drag & drop entre etapas (nuevo → contactado → cotizado → negociacion → ganado)
- **Kanban de Órdenes de Trabajo** — Drag & drop con columnas dinámicas por tipo de OT
- **Sub-tabs** para alternar entre Leads y OTs
- Color coding: verde = completado, rojo = atrasado (>7d), naranja = esperando

### 👤 Perfil de Cliente (4 tabs)
- 📋 **Datos** — Nombre, teléfono, email, documento, empresa, cargo, dirección, ciudad
- 🔧 **Órdenes** — Todas las OTs vinculadas con estados y pagos
- 📊 **Historial** — Timeline de interacciones WhatsApp + notas
- 💰 **Pagos** — Historial de abonos con saldo pendiente

### 🔧 Órdenes de Trabajo (3 tipos)
| Tipo | Estados | Ejemplo |
|------|---------|---------|
| 🔧 **Reparación** | recibido → diagnosticando → presupuestado → aprobado → reparando → completado → entregado | Aire acondicionado, tarjeta electrónica |
| 🏭 **Fabricación** | cotizando → diseño_aprobado → materiales → bobinado → ensamble → pruebas → control_calidad → finalizado → entregado | Elevadores, estabilizadores |
| 🚗 **Instalación** | agendado → en_sitio → instalando → pruebas → finalizado → facturado | Cargadores EV |

### 💰 Pagos y Abonos
- Registro de abonos por OT (efectivo, transferencia, Nequi, Daviplata)
- Barra de progreso de pago en tarjetas Kanban
- Saldo pendiente automático
- Historial de pagos por cliente

### 📨 Plantillas de Notificación (19 predefinidas)
- Plantillas por tipo de OT + estado — 5 reparación, 8 fabricación, 6 instalación
- Editor con preview WhatsApp simulado
- 14 placeholders dinámicos: `{id}`, `{cliente}`, `{equipo}`, `{presupuesto}`, `{tipo_producto}`, etc.
- Envío one-click desde el detalle de OT

### 🤖 WhatsApp Bot v4
- **Máquina de estados** — 7 estados: IDLE → PRESENTACION → MENU → SUBMENU_EE → AWAITING_DETAIL → CONSULTA_OT → LEAD_COMPLETE
- **Menú interactivo** — 7 opciones incluyendo consulta de estado de OT
- **Configurable desde CRM** — 17 parámetros sin tocar código (horario, comportamiento, mensajes)
- **Recarga en caliente** — `/reload-config` sin reiniciar el bot
- **Consulta de OT** — Cliente ingresa código (HTK-042) y recibe estado, timeline, pagos

### 📦 Inventario de Materiales
- 12 materiales semilla (cobre, núcleos, barniz, protecciones, cables)
- CRUD completo con ajustes de stock (entrada/salida)
- Alertas de stock bajo con colores 🔴/🟢
- Filtro por categoría y búsqueda

### ⚙️ Configuración (6 sub-pestañas)
- **General** — Info del sistema, stats, backups
- **Bot WhatsApp** — Horario, comportamiento, mensajes, conexión
- **Plantillas OT** — CRUD de plantillas de notificación
- **Precios** — Lista de precios de productos
- **Segmentos** — Gestión de segmentos personalizados
- **Usuarios** — Placeholder

### 🔍 Búsqueda Global
- `Ctrl+K` / `Cmd+K` — buscar leads, clientes, OTs
- Resultados con badges de estado y tipo

---

## 🔌 API REST

### Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/stats` | Estadísticas del dashboard |
| GET/POST | `/api/leads` | CRUD leads |
| GET/PUT/DELETE | `/api/leads/<id>` | Lead individual |
| POST | `/api/leads/<id>/convert` | Convertir lead → cliente |
| GET/POST | `/api/clients` | CRUD clientes |
| GET/PUT/DELETE | `/api/clients/<id>` | Cliente individual |
| GET | `/api/clients/<id>/orders` | OTs del cliente |
| GET | `/api/clients/<id>/payments` | Pagos del cliente |
| GET/POST | `/api/work_orders` | CRUD OTs (filtro `?tipo=`) |
| GET/PUT/DELETE | `/api/work_orders/<id>` | OT individual |
| GET | `/api/work_orders/tipos` | Tipos de OT con estados |
| GET | `/api/work_orders/kanban?tipo=` | Kanban de OTs |
| PATCH | `/api/work_orders/<id>/kanban` | Mover en Kanban |
| PUT | `/api/work_orders/<id>/status` | Cambiar estado |
| POST | `/api/work_orders/<id>/notify` | Enviar notificación WhatsApp |
| GET/POST | `/api/work_orders/<id>/payments` | Pagos de OT |
| GET/POST | `/api/wo-templates?tipo_ot=` | Plantillas de notificación |
| GET/PUT | `/api/bot/config` | Configuración del bot |
| POST | `/api/bot/config/reload` | Recargar config en bot |
| GET/POST | `/api/inventario` | Inventario CRUD |
| GET | `/api/inventario/bajo-stock` | Alertas stock |
| GET | `/api/segments` | Segmentos |
| GET | `/api/pipeline` | Pipeline funnel |
| GET | `/api/leads/kanban` | Kanban de leads |

---

## 📊 Base de Datos (SQLite)

### Tablas principales
`leads`, `clients`, `work_orders`, `work_order_history`, `interactions`, `work_order_client_links`, `payments`, `wo_templates`, `bot_config`, `inventario`, `inventario_movimientos`, `etapas`, `segmentos`, `precios`, `ventas`, `tags`, `tareas`

---

## 🌐 Acceso Web

**`https://crm.htk-ingenieria.com`** (Cloudflare Tunnel)

---

## 🛠️ Desarrollo

```bash
# Reiniciar CRM
systemctl --user restart htk-crm.service

# Reiniciar solo el bot
cd bot && node bot.js

# Backup manual
bash backup_db.sh

# Verificar sintaxis JS
node --check bot/bot.js

# Ver logs del bot
tail -f bot/bot.log
```

---

> ⚡ **HTK INGENIERIA** — _Soluciones en ingeniería de confianza._  
> CRM v3 · 2026-05-14
