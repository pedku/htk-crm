# MEMORY.md — HTK INGENIERIA (HOUSETRONIK S.A.S.)

> Last updated: 2026-05-28 (mañana)

---

## 🏗️ Arquitectura Frontend CRM (2026-05-28)
Monolito → 17 modulos: crm.js 5240l → 264l (-95%). Cada modulo JS alineado con su contraparte en app/routes/.

## 🎨 UI Redesign (2026-05-28)
ui-ux-pro-max skill: Flat Design + Minimalism. Paleta azul #2563EB, Plus Jakarta Sans.

## 📊 Prospeccion (2026-05-28)
+43 leads: 15 restaurantes, 13 hoteles, 15 constructoras. Nuevo segmento constructor. Total CRM: 147 leads. Pitches profesionales sin emojis agregados.

---

## 🏢 Datos de la Empresa

| Razón Social | HOUSETRONIK S.A.S. |
| Nombre Comercial | HTK INGENIERIA |
| Ubicación | Barranquilla, Colombia |
| Líneas | Automatización Industrial / IoT / Mantenimiento Electrónico / Cargadores Eléctricos |
| Propietario | Pedro Castro |
| Email Corporativo | info@htk-ingenieria.com |
| WhatsApp Business | +57 315 603 2940 |
| Teléfono Personal | +57 320 813 0156 |

---

## 👥 Clientes y Leads

*(Pendiente de carga)*

## 📋 Proyectos Activos

*(Pendiente)*

## 💰 Finanzas

*(Pendiente)*

## 📦 Inventario

*(Pendiente)*

---

## ⚙️ Sistema de Órdenes de Trabajo (2026-05-05)
`data/work_orders.json` — seguimiento de equipos en taller
`data/notifications.json` — plantillas de notificación para cada estado

## 📊 CRM HTK (2026-05-05)
`data/clients.json` — ficha unificada de clientes
`data/interactions.json` — auditoría de conversaciones WhatsApp

## 💻 CRM Web Integrado (2026-05-08)
- `crm/crm_app.py` — Flask backend corriendo en `localhost:5000`
- `crm/templates/index.html` — Interfaz web single-page (dark mode)
- `crm/templates/login.html` — Pantalla de login
- **Service:** systemd user `htk-crm.service` (auto-arranque)
- **Pestañas:** Dashboard | Kanban | Clientes | Órdenes Trabajo | Prospectos | Interacciones | **Automatización**
- **Login requerido:** admin / htk2026 (via HTK_ADMIN_USER/PASS)
- **Kitchen sink:** Perfiles lead/cliente c/ timeline, notas editables, Kanban drag-drop, pitches multichannel, search global (Ctrl+K), próximos seguimientos en dashboard, notifications badge
- **Git:** 3 commits (v2 base → v3 features → toolkit)

## 🤖 WhatsApp Bot
Workspace propio: `/home/peku/.openclaw/workspaces/whatsapp-bot`
Modelo: DeepSeek Flash | Responde solo menú predefinido

---
## 🛠️ Automation Toolkit (2026-05-08)
Scripts autónomos en `scripts/` — sin IA:
- `auto_enrich.py` — Scrapea websites de leads, extrae teléfonos/emails/nombres
- `auto_score.py` — Puntúa leads 0-100 por datos + segmento
- `auto_schedule.py` — Asigna `proximo_seguimiento` en horario laboral (Lun-Vie 8-18, Sáb 8-13)
- `auto_campaign.py` — Genera mensajes personalizados desde pitches.json
- `backup_db.sh` — Backup comprimido con retención 14d

Todos accesibles desde CRM → pestaña Automatización.
Backup automático cada 12h via crontab (6am/6pm).

### 📊 Estado leads (May 8)
- 48 leads total, **47/48 con datos de contacto**
- 42 leads nuevos, todos con seguimiento programado desde Sáb 9/05
- Segmentos: B2B fábrica(13), cargadores(9), energía solar(9), taller(7=1cliente), hoteles(5), restaurantes(2), comercio(1)
- Prioridad: cargadores > taller > fábrica > solar > hoteles > restaurantes
- Solo falta Los Kioscos (contacto encontrado pero necesita scraping fino)

### 🎯 Últimos pasos
- Sáb 9/05 8am: contactar distribuidores cargadores (6 con tel + email)

## 🧠 Recordatorio — Facturación (Pendiente 2026-05-24)

**Pedro enviará plantilla de factura** (hoja de cálculo o PDF) para diseñar el sistema de facturación integrado con el CRM.

**Acordado:**
- Sistema completo con items, IVA 19%, PDF generado automáticamente
- Vinculado a órdenes de trabajo
- Envío de factura al cliente por WhatsApp desde el CRM
- Esperando plantilla para iniciar desarrollo

---

## 🏆 Hitos Comerciales

### 2026-05-15 — Reestructuración CRM Completa 🏗️
Se reestructuró el CRM de monolito a modular:
- **Frontend:** index.html (5801 líneas) → base.html + 9 templates pages/ + CSS/JS separados
- **Auth:** Fixed Cloudflare bypass (CF-Connecting-IP header)
- **Bug fixes:** toastMsg faltante, load functions crash, saveModal sin response.ok
- **Features:** perfil OT completo con WhatsApp/estado/pagos, links en tabla OT
- **Branch:** `modular-frontend` en GitHub (8 commits nuevos)
- **Dev URL:** `dev.htk-ingenieria.com`

### 2026-05-12 — EDC (Electrolineras de Colombia) ✅
**PRO-017** — Entrevista virtual concretada. **Acuerdo verbal como distribuidores** de sus equipos de carga EV en Barranquilla y la Costa Caribe.
- Pendiente: definir márgenes comerciales, instalación piloto, certificación fabricante
- Estado CRM: `negociacion`
- Próximo seguimiento: 2026-05-15

---
