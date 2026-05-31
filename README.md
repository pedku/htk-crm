# HTK CRM v3 — Sistema Integral de Gestión Empresarial

CRM + WhatsApp Bot unificados para **HTK INGENIERIA (HOUSETRONIK S.A.S.)**  
Automatización Industrial · IoT · Mantenimiento Electrónico · Cargadores EV  
📍 Barranquilla, Colombia · 🇨🇴

---

## 🚀 Stack

| Capa | Tecnología | Detalle |
|------|-----------|---------|
| Backend | Flask 3.x + Python 3.14 | API REST + renderizado HTML |
| Base de datos | SQLite 3 | ~9,200 líneas de código total |
| Frontend | Bootstrap 5.3 + Vanilla JS (SPA) | 17 módulos JS modulares |
| Bot WhatsApp | Node.js + whatsapp-web.js | Máquina de estados sin IA |
| Túnel público | Cloudflare Tunnel | → `crm.htk-ingenieria.com` |
| PDF / Drive | WeasyPrint + `gog` CLI | Generación PDF + subida a Google Drive |
| Google Workspace | gog (Gmail, Calendar, Drive) | OAuth token refresh automático |
| Orquestación | systemd (user services) | Auto-reinicio en crash |

---

## 📦 Estructura del Proyecto

```
crm/
├── app/                          # Backend Flask (modular)
│   ├── __init__.py               # App factory, migraciones automáticas
│   ├── routes/
│   │   ├── views.py              # Login, páginas base
│   │   ├── api_leads.py          # CRUD leads, kanban, pipeline, segmentos
│   │   ├── api_clients.py        # CRUD clientes, búsqueda
│   │   ├── api_wo.py             # CRUD órdenes de trabajo, tipos, finanzas
│   │   ├── api_invoices.py       # CRUD facturas, items, IVA, PDF, Drive, WhatsApp
│   │   ├── api_inventory.py      # Inventario IoT/cargadores
│   │   ├── api_bot.py            # Configuración y control del bot
│   │   └── api_misc.py           # Pitches, interacciones, stats, export
│   └── services/
│       ├── bot_service.py        # Envío WhatsApp desde backend
│       ├── crm_service.py        # Lógica compartida
│       └── wo_service.py         # Lógica de órdenes de trabajo
│
├── static/
│   ├── js/                       # 17 módulos JavaScript modulares
│   │   ├── core.js               # Utilidades base
│   │   ├── dashboard.js          # Widgets KPIs
│   │   ├── leads.js              # Gestión de leads
│   │   ├── leads_pitch.js        # Envío de pitches
│   │   ├── clients.js            # Gestión de clientes
│   │   ├── workorders.js         # Órdenes de trabajo
│   │   ├── facturacion.js        # Facturas, items, IVA
│   │   ├── inventario.js         # Inventario
│   │   ├── kanban.js             # Tablero Kanban drag-drop
│   │   ├── interactions.js       # Interacciones/timeline
│   │   ├── config.js             # Configuración del sistema
│   │   ├── company.js            # Datos de la empresa
│   │   ├── notifications.js      # Badge de notificaciones
│   │   ├── search.js             # Búsqueda global (Ctrl+K)
│   │   ├── pitches.js            # Plantillas de pitch
│   │   ├── segments.js           # Segmentos de clientes
│   │   └── crm.js                # Orquestador SPA principal
│   └── css/
│       └── crm.css               # Tema dark, diseño flat/minimalista
│
├── templates/
│   ├── base.html                 # Layout base SPA + sidebar + navegación
│   ├── login.html                # Pantalla de login
│   └── pages/
│       ├── dashboard.html        # Dashboard con métricas
│       ├── leads.html            # Tabla y modal de leads
│       ├── clients.html          # Tabla y perfil de clientes
│       ├── work_orders.html      # Órdenes de trabajo
│       ├── facturacion.html      # Facturas + modal crear/editar/ver
│       ├── factura_template.html        # Plantilla PDF/HTML elegante
│       ├── factura_template_print.html  # Plantilla impresión A4
│       ├── kanban.html           # Tablero Kanban
│       ├── inventario.html       # Gestión de inventario
│       ├── interactions.html     # Timeline de interacciones
│       ├── config.html           # Configuración general + bot
│       └── automation.html       # Toolkit de automatización
│
├── bot/                          # WhatsApp Bot (Node.js)
│   ├── bot.js                    # Bot principal (máquina de estados)
│   ├── config.js                 # Configuración
│   ├── messages.js               # Plantillas de mensajes
│   ├── faq.js                    # FAQ y respuestas predefinidas
│   ├── notify.js                 # Notificaciones automáticas
│   ├── lid-resolver.js           # Resolución de @lid
│   └── ...
│
├── run.py                        # Entry point producción (port 18800)
├── run_dev.py                    # Entry point desarrollo (port 18801)
├── migrate_to_sqlite.py          # Migración inicial de DB
└── htk_crm.db                    # SQLite database
```

---

## 🧩 Funcionalidades

### 📊 Dashboard
- Métricas en tiempo real: leads activos, OT en taller, facturas pendientes
- Pipeline de ventas con funnel de conversión
- Próximos seguimientos y tareas pendientes

### 👥 Gestión de Leads (CRM)
- CRUD completo con datos de contacto, segmento, etapa
- Kanban board drag-drop (etapas personalizables)
- Clasificación automática por segmento
- Pitches personalizados multicanal (WhatsApp, email)
- Conversión lead → cliente con un clic
- Enriquecimiento automático (scraping web)

### 👤 Clientes
- Ficha completa: tipo persona, documento, contacto, dirección
- Historial de órdenes de trabajo vinculadas
- Total facturado y estado de cuenta
- Timeline de interacciones

### 🔧 Órdenes de Trabajo (OT)
- Tipos: reparación, mantenimiento, instalación, consultoría
- Campos dinámicos por tipo (equipo, marca, modelo, etc.)
- Finanzas: abonos, pagos, facturación desde OT
- Estados configurables por tipo
- Notificaciones automáticas de cambio de estado por WhatsApp

### 🧾 Facturación
- Items con descripción, cantidad, precio unitario, IVA
- **IVA incluido / discriminado** por item
- Cálculo automático de subtotal, IVA, descuento, total
- **PDF automático** vía WeasyPrint (2s, sin navegador)
- **Subida automática a Google Drive** > carpeta Facturas
- **Envío automático por WhatsApp** al pagar
- Estados: borrador → emitida → pagada | vencida | anulada
- Abonos vinculados a OT (hereda pagos legacy)
- Barra de progreso de pagos en vista de factura
- Plantilla PDF profesional con logo HTK

### 📦 Inventario
- Productos IoT, cargadores EV, repuestos
- Precios de venta según canal
- Stock disponible

### 🤖 WhatsApp Bot
- Máquina de estados: IDLE → PRESENTACIÓN → MENÚ → LEAD_COMPLETE
- Respuestas instantáneas predefinidas (sin LLM, baja latencia)
- Silenciamiento automático cuando Pedro responde
- Fuera de horario: mensaje automático
- Notificaciones de cambio de estado de OT
- Control global on/off desde CRM

### ⚙️ Configuración
- Datos de la empresa (logo, NIT, dirección) → se reflejan en facturas
- Configuración del bot (mensajes, tiempos, horarios)
- IVA por defecto configurable
- Segmentos y pitches editables
- Tema claro/oscuro

### 🔍 Búsqueda Global
- `Ctrl+K` para buscar leads, clientes, OT, facturas

### 📤 Toolkit de Automatización
- Enriquecer leads (scraping de websites)
- Puntuar leads (scoring automático)
- Programar seguimientos
- Generar campañas
- Backup de base de datos

---

## 🔐 Autenticación

- Login con usuario/contraseña (Flask session)
- Variables de entorno: `HTK_ADMIN_USER` / `HTK_ADMIN_PASS`
- Rutas públicas: login, vista de factura para WhatsApp

---

## 🚀 Instalación

```bash
git clone git@github.com:pedku/htk-crm.git
cd htk-crm

# Backend
pip install flask weasyprint

# Configurar variables de entorno
echo 'HTK_ADMIN_USER=admin' >> .env
echo 'HTK_ADMIN_PASS=htk2026' >> .env

# WhatsApp Bot
cd bot && npm install && cd ..

# Iniciar
python3 run.py                  # → http://localhost:18800
cd bot && node bot.js           # → Bot WhatsApp :18802
```

---

## 🌐 URLs

| Entorno | URL |
|---------|-----|
| Producción | `https://crm.htk-ingenieria.com` |
| Desarrollo local | `http://localhost:18800` |
| API Factura pública | `/factura/INV-FAC-XXXX` (sin auth) |

---

## 🔄 Flujo de Facturación Completo

```
Crear factura (borrador)
  ↓
Agregar items (con/sin IVA incluido)
  ↓
Emitir → estado: emitida
  ↓
Pagar → estado: pagada
  ├── Crea registro de pago
  ├── Genera PDF (WeasyPrint)
  ├── Sube a Google Drive > Facturas
  └── Envía PDF por WhatsApp (background thread)
```

---

## 🛠️ Servicios systemd

```bash
systemctl --user status htk-crm      # CRM producción :18800
systemctl --user status htk-crm-dev  # CRM desarrollo :18801
```

---

## 📐 Arquitectura del Frontend

Monolito original (5,240 líneas en `crm.js`) → **17 módulos JS independientes** (264 líneas `crm.js`)

Cada módulo JS está alineado con su contraparte en `app/routes/`:

| Módulo JS | Ruta Backend |
|-----------|-------------|
| `leads.js` | `api_leads.py` |
| `clients.js` | `api_clients.py` |
| `workorders.js` | `api_wo.py` |
| `facturacion.js` | `api_invoices.py` |
| `inventario.js` | `api_inventory.py` |
| `kanban.js` | `api_leads.py` |
| `config.js` | `api_bot.py`, `api_misc.py` |

---

## 🎨 Diseño

- **Estilo:** Flat Design + Minimalism
- **Paleta:** Azul HTK `#2563EB`
- **Tipografía:** Plus Jakarta Sans (Google Fonts)
- **Tema:** Dark mode (default), soporte light mode
- **Framework:** Bootstrap 5.3

---

## 🔧 Google Workspace (gog)

Servicios conectados vía `gog` CLI:
- Gmail (enviar/leer correos)
- Google Calendar (crear/consultar eventos)
- Google Drive (subir/buscar archivos)
- Contacts

Autenticación: OAuth 2.0 con refresh token automático  
Cuenta: `info@htk-ingenieria.com`

---

## 📊 Base de Datos

Tablas principales:
- `leads` — Prospectos con scoring, segmento, etapa
- `clients` — Clientes (convertidos de leads o nuevos)
- `work_orders` — Órdenes de trabajo con finanzas
- `invoices` — Facturas con IVA y estados
- `invoice_items` — Items de factura (con/sin IVA incluido)
- `payments` — Abonos/pagos vinculados a OT y facturas
- `inventory` — Inventario de productos
- `interactions` — Timeline de interacciones
- `bot_config` — Configuración del bot y sistema
- `segments`, `tags`, `tasks` — Soporte CRM

---

## 📝 Convenciones

- **Ramas:** `main` (producción) → `dev` (desarrollo, copia desde main)
- **Commits:** en español, formato: `tipo: descripción breve`
- **DB:** migraciones automáticas en `app/__init__.py` al iniciar
- **Cache-busting:** `?v=N` en scripts CSS/JS

---

## 🔜 Pendientes

- [ ] Facturación electrónica (DIAN Colombia)
- [ ] Dashboard financiero avanzado
- [ ] App móvil PWA
- [ ] Integración con pasarela de pagos
- [ ] Sistema de tickets de soporte
