# CONTEXT — HTK INGENIERIA CRM

## Proyecto
Sistema CRM web para HTK INGENIERIA (HOUSETRONIK INGENIERÍA Y AUTOMATIZACIÓN INTELIGENTE S.A.S).
Gestión de leads, clientes, órdenes de trabajo, inventario, facturación y automatización de prospección.

## Stack
- **Backend:** Flask (Python 3), SQLite, Blueprints
- **Frontend:** Jinja2 templates, Bootstrap 5, jQuery + DataTables, vanilla JS
- **Auth:** Flask sessions, @login_required decorator
- **Despliegue:** systemd, cloudflared tunnel
- **Repositorio:** `git@github.com:pedku/htk-crm.git` — branch `dev` → `origin/modular-frontend`

## Arquitectura
- **`crm/app/__init__.py`** — create_app(), init_db(), registro de blueprints
- **`crm/app/routes/`** — Blueprints Flask: `api_clients.py`, `api_leads.py`, `api_wo.py`, `api_bot.py`, `api_inventory.py`, `api_invoices.py`, `api_misc.py`, `views.py`
- **`crm/app/core/`** — `auth.py` (login_required, _is_local), `db.py` (get_db, next_id, now_iso), `wo_types.py`
- **`crm/app/services/`** — Lógica de negocio: `wo_service.py`, `bot_service.py`, `crm_service.py`
- **`crm/static/js/crm.js`** — Único JS principal (~5000 líneas). Contiene TODAS las funciones del frontend
- **`crm/static/css/crm.css`** — Único CSS principal
- **`crm/static/img/`** — Logo corporativo (`logo_htk.png`)
- **`crm/templates/`** — Jinja2 templates
  - `base.html` — Layout SPA con sidebar + includes de todas las páginas
  - `pages/` — Una página por pestaña (dashboard, clients, work_orders, leads, facturacion, inventario, etc.)
  - `client_detail.html`, `lead_detail.html`, `wo_detail.html` — Páginas de perfil individual
  - `login.html`, `bot_whatsapp.html` — Páginas independientes

## Base de datos
- SQLite en `crm/htk_crm.db`
- Tablas: `clients`, `leads`, `work_orders`, `work_order_history`, `work_order_client_links`, `interactions`, `inventario`, `inventario_movimientos`, `invoices`, `invoice_items`, `payments`, `ventas`, `precios`, `tareas`, `segmentos`, `etapas`, `tags`, `bot_config`, `wo_templates`, `lid_mappings`

## Convenciones de código

### JavaScript
- Funciones globales sin namespaces. Nombres descriptivos: `loadXxx()`, `renderXxx()`, `showXxx()`, `saveXxx()`
- Fetch API con `fetchJSON()` helper que tiene try/catch interno
- DataTables con función helper `initDT()`. Si DataTables no está disponible, fallback a render HTML manual
- **NO existe `renderLeads()`/`renderClients()`/`renderWorkOrders()/`toastMsg()`** — usar `renderXxxDT()` y `showToast()`
- Convención de modales: `showModal(type, id)` → renderiza en `#genericModal`. `setModal()` para custom modals
- Variables auxiliares: `modalInstance`, `API = window.location.origin`
- Elementos del DOM con prefijo `f_` para formularios

### Python (Flask)
- Endpoints API con prefijo `/api/` y decorador `@login_required`
- Blueprints registrados en `create_app()` dentro de `__init__.py`
- DB connection: `get_db()` → `try/finally conn.close()` siempre
- IDs auto-generados: `next_id('CLI', 'clients')` genera `CLI-001`, `CLI-002`...
- Respuestas API: `return jsonify({...})`

### CSS
- Tema oscuro por defecto, `[data-bs-theme="light"]` para modo claro
- Color primario: `#059BDA` (azul HTK corporativo)
- Clases: `.btn-htk`, `.stat-card`, `.table-container`, `.action-btn`, `.search-box`
- Animaciones: `@keyframes fadeSlideUp`, `@keyframes pulseDot`

## Dependencias externas
- Bootstrap 5.3.3 (CDN)
- jQuery 3.7.1 (CDN)
- DataTables 1.13.6 (CDN)
- Google Fonts: Inter (opcional, invoice template)
- cloudflared para túnel

## Identidad Corporativa
- Razón social: HOUSETRONIK INGENIERÍA Y AUTOMATIZACIÓN INTELIGENTE S.A.S
- Nombre comercial: HTK INGENIERIA
- NIT: 1.124.361.169-2
- Dirección: Cra 7b #46-108, Barranquilla, Colombia
- Email: info@htk-ingenieria.com
- Teléfono: +57 315 603 2940
- Color: #059BDA
