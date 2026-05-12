# HTK CRM — Sistema de Gestión Empresarial

CRM web para **HTK INGENIERIA (HOUSETRONIK S.A.S.)**, especializada en automatización industrial, IoT, mantenimiento electrónico e instalación de cargadores eléctricos.

## 🚀 Stack

- **Backend:** Flask (Python) + SQLite
- **Frontend:** Bootstrap 5 + vanilla JS (SPA)
- **Túneles:** Cloudflare Tunnel (`crm.htk-ingenieria.com`)
- **WhatsApp Bot:** Servicio independiente (puerto 18802)
- **Systemd:** `htk-crm.service` (auto-arranque)

## 📦 Instalación

```bash
# Clonar
git clone <repo> crm
cd crm

# Instalar dependencias
pip install flask

# Iniciar
python3 crm_app.py
# → http://localhost:18800
```

## 🔐 Acceso

| Usuario | Contraseña |
|---------|-----------|
| `admin` | `htk2026` |

Configurable via `HTK_ADMIN_USER` / `HTK_ADMIN_PASS`.

## 🗂 Estructura

```
crm/
├── crm_app.py              # Flask backend
├── htk_crm.db              # SQLite (datos)
├── templates/
│   ├── index.html          # SPA principal
│   ├── lead_detail.html    # Perfil de lead
│   ├── bot_whatsapp.html   # Panel del bot
│   └── login.html          # Login
├── backups/                # Backups automáticos
├── backup_db.sh            # Script de backup
└── PLAN_MIGRACION_V3.md    # Documentación técnica
```

## ✨ Funcionalidades

- **Dashboard** — KPIs, pipeline funnel, próximos seguimientos
- **Kanban** — Drag & drop de leads y órdenes de trabajo
- **Prospectos** — Tabla con filtros por estado y segmento
- **Clientes** — Ficha unificada con historial
- **Órdenes de Trabajo** — Ciclo completo: recibido → entregado
- **Perfil de Lead** — Timeline, notas editables, pitches multichannel
- **Pitches** — Plantillas por segmento con variables dinámicas
- **WhatsApp Bot** — Envío directo desde perfil del lead
- **Automatización** — Enriquecimiento, scoring, scheduling, campañas
- **Búsqueda global** — Ctrl+K / Cmd+K

## 🌐 Acceso Web

`https://crm.htk-ingenieria.com`
