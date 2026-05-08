# MEMORY.md — HTK INGENIERIA (HOUSETRONIK S.A.S.)

> Last updated: 2026-05-08

---

## 🏢 Datos de la Empresa

| Razón Social | HOUSETRONIK S.A.S. |
| Nombre Comercial | HTK INGENIERIA |
| Ubicación | Barranquilla, Colombia |
| Líneas | Automatización Industrial / IoT / Mantenimiento Electrónico / Cargadores Eléctricos |
| Propietario | Pedro Castro |

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
- **Service:** systemd user `htk-crm.service` (auto-arranque)
- **Pestañas:** Dashboard | Clientes | Órdenes Trabajo | Prospectos | Interacciones
- **CRUD completo:** Clientes, Órdenes, Leads — crear, editar, eliminar
- **Workflow OT:** Cambio de estados con presupuesto + diagnóstico + historial
- **Conversión:** Leads → Cliente con 1 clic
- **Auto-link:** Órdenes se vinculan automáticamente al cliente por nombre/tel

## 🤖 WhatsApp Bot
Workspace propio: `/home/peku/.openclaw/workspaces/whatsapp-bot`
Modelo: DeepSeek Flash | Responde solo menú predefinido

---
