# PLAN DE MIGRACIÓN — V1 → V3 CRM HTK INGENIERIA

> **V1:** `/home/peku/htk-crm-web/` (puerto 18800) — Flask con templates separados
> **V3:** `/home/peku/.openclaw/workspace/crm/` (puerto 5000) — SPA en index.html
> **Objetivo:** Portar funcionalidades faltantes de V1 a V3

---

## 📊 DIAGNÓSTICO — Qué tiene cada versión

| Funcionalidad | V1 | V3 |
|---|---|---|
| Pipeline Kanban (drag & drop) | ✅ Completo | ❌ Solo kanban básico |
| Dashboard con métricas | ✅ Completo | ✅ Stats básicos |
| Clientes (CRUD completo) | ✅ | ✅ |
| Ventas (cotización → venta) | ✅ | ❌ No existe |
| Órdenes de Trabajo | ❌ | ✅ Completo |
| Precios (catálogo) | ✅ | ❌ No existe |
| Seguimiento / Tareas | ✅ | ❌ No existe |
| Interacciones / Actividades | ✅ Actividades | ✅ Interacciones |
| Automatización (scripts) | ❌ | ✅ Completo |
| Bot WhatsApp integrado | ✅ Página separada | ✅ SPA + API |
| Pipeline funnel API | ✅ get_conversion_funnel | ❌ No existe |
| Etapas configurables | ✅ Tabla `etapas` | ❌ Hardcodeadas |
| Tags | ✅ | ❌ |
| Métricas mensuales | ✅ Tabla `metricas` | ❌ |
| Export CSV | ✅ | ❌ |

---

## 🥇 FASE 1 — PIPELINE KANBAN (ALTA PRIORIDAD)

### Backend (7 endpoints)

| Endpoint | Descripción | Status |
|----------|-------------|--------|
| `GET /api/pipeline` | Funnel de conversión (stats por etapa) | ❌ Nuevo |
| `GET /api/leads/kanban` | Leads agrupados por etapa | ❌ Nuevo |
| `PATCH /api/leads/<id>/etapa` | Cambiar etapa del lead | ❌ Nuevo |
| `GET /api/etapas` | Etapas configurables | ❌ Nuevo |
| `GET /api/tags` | Tags para leads | ❌ Nuevo |
| `POST /api/tags` | Crear tag | ❌ Nuevo |
| `GET /api/lead-week` | Leads últimos 7 días | ❌ Nuevo |

### Frontend

| Componente | Descripción | Status |
|------------|-------------|--------|
| Tab `#tab-kanban` | Vista kanban con columnas por etapa | ❌ Nuevo |
| Drag & drop | Arrastrar lead entre etapas | ❌ Nuevo |
| Etapa configurable | Selector de etapa en perfil lead | ❌ Nuevo |

---

## 🥈 FASE 2 — DASHBOARD MEJORADO

### Backend

| Endpoint | Descripción | Status |
|----------|-------------|--------|
| `GET /api/lead-week` | Leads por día (últimos 7) | ❌ Nuevo |
| `GET /api/opciones` | Opciones/tipos disponibles | ❌ Nuevo |

### Frontend

| Componente | Descripción | Status |
|------------|-------------|--------|
| Pipeline funnel | Gráfico de embudo en dashboard | ❌ Nuevo |
| Leads semanales | Gráfico de barras últimos 7 días | ❌ Nuevo |

---

## 🥉 FASE 3 — VENTAS + PRECIOS + TAREAS

### Backend (6 endpoints)

| Endpoint | Descripción | Status |
|----------|-------------|--------|
| `GET/POST /api/sales` | CRUD ventas | ❌ Nuevo |
| `GET/PUT/DELETE /api/sales/<id>` | Venta individual | ❌ Nuevo |
| `GET/POST /api/prices` | Catálogo de precios | ❌ Nuevo |
| `PUT/DELETE /api/prices/<id>` | Precio individual | ❌ Nuevo |
| `GET/POST /api/tasks` | Tareas/seguimiento | ❌ Nuevo |
| `PATCH /api/tasks/<id>` | Actualizar tarea | ❌ Nuevo |

### Frontend (tabs nuevos)

| Tab | Descripción |
|-----|-------------|
| `#tab-sales` | Tabla ventas + crear/editar |
| `#tab-prices` | Catálogo de precios |
| `#tab-tasks` | Tareas y seguimientos |

---

## 🏗️ ESTRUCTURA DE DATOS V3 (DB actual)

```
leads: id, nombre, contacto, segmento, linea_interes, estado, fuente, fecha_creacion, proximo_seguimiento, notas, valor_estimado, contacto_nombre, telefono, email, url, tipo_contacto
interactions: id, lead_id, lead_nombre, tipo, direccion, resumen, detalle, fecha, proximo_paso, estado
clients: id, telefono, nombre, fuente, primer_contacto, ultimo_contacto, interacciones_totales, estado, segmento, linea_interes
work_orders: id, cliente_nombre, cliente_telefono, equipo_tipo, equipo_marca, equipo_modelo, falla_reportada, diagnostico, presupuesto, estado, fecha_ingreso, fecha_salida, notas_internas
```

### Nuevas tablas necesarias (desde V1)

```sql
CREATE TABLE etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT UNIQUE,
  nombre TEXT,
  orden INTEGER,
  color TEXT,
  icono TEXT,
  probabilidad INTEGER DEFAULT 0
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT,
  color TEXT
);

CREATE TABLE ventas (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  cliente_id TEXT,
  cliente_nombre TEXT,
  producto TEXT,
  capacidad TEXT,
  valor_cotizado REAL,
  valor_vendido REAL,
  estado TEXT DEFAULT 'cotizado',
  fecha_cotizacion TEXT,
  fecha_venta TEXT,
  notas TEXT
);

CREATE TABLE precios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT,
  producto TEXT,
  capacidad TEXT,
  precio_base REAL,
  precio_venta REAL,
  notas TEXT
);

CREATE TABLE tareas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT,
  tarea TEXT,
  estado TEXT DEFAULT 'pendiente',
  prioridad TEXT DEFAULT 'media',
  vence TEXT,
  created_at TEXT,
  completada INTEGER DEFAULT 0
);
```

---

## 📋 CHECKLIST DE EJECUCIÓN

### Fase 1 — Pipeline Kanban (HOY)
- [ ] Migrar `db.py:lead_kanban()`, `get_conversion_funnel()`, `etapa_listar()` a V3
- [ ] Crear endpoints en `crm_app.py` (pipeline, kanban, etapas, tags)
- [ ] Agregar tab `#tab-kanban` con drag & drop en `index.html`
- [ ] Agregar columna de etapa en tabla leads
- [ ] Agregar API `PATCH /leads/<id>/etapa`

### Fase 2 — Dashboard mejorado
- [ ] Endpoint lead-week + opciones
- [ ] Gráfico funnel + leads semanales en dashboard

### Fase 3 — Ventas + Precios + Tareas
- [ ] Backend endpoints
- [ ] Tabs SPA correspondientes

---

## 🔧 EJECUCIÓN INMEDIATA

```bash
# 1. Crear tablas nuevas en V3
python3 -c "
import sqlite3
db = sqlite3.connect('/home/peku/.openclaw/workspace/crm/htk_crm.db')
# ... CREATE TABLE statements ...
db.commit()
db.close()
"
```

```bash
# 2. Migrar funciones de db.py de V1 a V3
# Copiar: get_conversion_funnel, lead_kanban, etapa_listar, etc.
```

```bash
# 3. Agregar endpoints a crm_app.py
# Pipeline, Kanban, Etapas, Tags, Sales, Prices, Tasks
```

```bash
# 4. Actualizar index.html con nuevos tabs
# kanban, pipeline funnel, ventas, precios, tareas
```
