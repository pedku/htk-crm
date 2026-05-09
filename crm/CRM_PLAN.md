# PLAN CRM HTK INGENIERIA — v3.0 Profesional

## 📐 Filosofía

El CRM es el **corazón operativo** de HTK. Gestiona el ciclo de vida completo del lead → cliente → orden de trabajo. Cada entidad tiene un perfil completo con acciones contextuales. Todo es editable, todo tiene trazabilidad.

---

## 🏗️ Estructura General

```
SIDEBAR
├── 📊 Dashboard        → Resumen ejecutivo + KPIs
├── 📋 Kanban           → Vista tablero: OT + Leads
│   ├── 🛠️ Órdenes     → Columnas por estado (drag & drop)
│   └── 🎯 Prospectos   → Columnas por etapa (drag & drop)
├── 👥 Clientes         → Tabla + CRUD + Perfil completo
├── 🔧 Órdenes Trabajo  → Tabla + CRUD + Timeline + Cambio estado
├── 📈 Prospectos       → Tabla + CRUD + Perfil completo + Etapas
├── 💬 Interacciones    → Auditoría de contacto
└── ⚙️ Configuración    → Ajustes del sistema
```

---

## 📍 Perfil de Lead (Prospecto) — La pieza central

Cada lead tiene un **perfil completo** de 3 secciones:

### 🔝 Cabecera — Tarjeta de Contacto
```
┌─────────────────────────────────────────────────┐
│ [Avatar iniciales]  Nombre / Empresa             │
│                     Segmento | Línea Interés      │
│                                                   │
│ 📞 +57300XXX  [Copiar]   💬 WhatsApp [Abrir]     │
│ 📧 email@...  [Enviar]   🌐 sitio.com [Visitar]  │
│ 👤 Facebook   [Perfil]                           │
│                                                   │
│ [◀ Anterior]  🏷️ Estado actual  [Siguiente ▶]   │
│ ████████████░░░░░░░ 65%                          │
└─────────────────────────────────────────────────┘
```

### 📋 Cuerpo — Información Detallada
```
┌─────────── INFORMACIÓN ───────────┬─────── SEGUIMIENTO ───────┐
│ ID: PRO-XXX                       │ Creado: 2026-05-04        │
│ Fuente: Facebook / Web / Referido │ Último contacto: —         │
│ Contacto: +57...                  │ Próximo seg.: 2026-05-15  │
│ Segmento: B2B taller              │ Valor estim.: $500,000     │
│ Línea: Mantenimiento              │                            │
└───────────────────────────────────┴────────────────────────────┘
```

### 📜 Historial de Interacciones
```
┌─────────── INTERACCIONES ──────────────────────────────────────┐
│ 📅 2026-05-07  Pitch enviado vía WhatsApp        💬           │
│ 📅 2026-05-06  Primer contacto - Cliente interesado 📞        │
│ [+] Nueva Interacción                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 📝 Notas
```
Campo editable para notas internas.
```

### ⚡ Acciones Rápidas
```
[✏️ Editar] [📞 Llamar] [💬 WhatsApp] [📧 Email] [🔄 Convertir a Cliente] [🗑️ Eliminar]
```

---

## 📍 Perfil de Cliente

Similar al lead pero con sección adicional de **Órdenes de Trabajo vinculadas**.

```
┌─── TARJETA DE CONTACTO ───────────────────────────────────────┐
│ (misma que lead)                                               │
├─── ÓRDENES DE TRABAJO ────────────────────────────────────────┤
│ 🔧 HTK-001  Midea Inverter 12K   🟢 En reparación  $450,000  │
│ 🔧 HTK-002  LG Lavadora 12kg     🟡 Diagnosticando  $180,000 │
│ [+] Nueva Orden                                                 │
├─── INTERACCIONES ──────────────────────────────────────────────┤
│ (mismo que lead)                                                │
├─── NOTAS ──────────────────────────────────────────────────────┤
│ (campo editable)                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📍 Perfil de Orden de Trabajo

```
┌─── INFORMACIÓN ───────────────────┬─────── CLIENTE ───────────┐
│ ID: HTK-001                       │ 👤 Carlos Méndez          │
│ Equipo: Midea Inverter 12K BTU    │ 📞 +573001234567          │
│ Falla: No enciende                │ 💬 WhatsApp               │
│ Diagnóstico: Placa dañada         │                            │
│ Presupuesto: $450,000             │                            │
│ Estado: 🔧 Reparando              │                            │
├─────────── TIMELINE ───────────────────────────────────────────┤
│ 📥 Recibido      May 05 🟢                                      │
│ 🔍 Diagnosticando May 08 🟢                                     │
│ 💰 Presupuestado  May 08 🟢                                     │
│ ✅ Aprobado       — ⏳                                          │
│ 🔧 Reparando      — 🟡 (actual)                                 │
├─────────── NOTAS INTERNAS ─────────────────────────────────────┤
│ (campo editable)                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Sistema de Etapas (Lead Stages)

| Etapa | Acción esperada | Color |
|-------|----------------|-------|
| 🆕 Nuevo | Contactar | `bg-secondary` |
| 📞 Contactado | Enviar cotización | `bg-info` |
| 📄 Cotizado | Dar seguimiento | `bg-warning` |
| 🤝 Negociación | Cerrar trato | `bg-primary` |
| ✅ Ganado | Convertir a cliente | `bg-success` |
| ❌ Perdido | Archivar | `bg-danger` |
| 🏆 Cliente | Gestionar | `bg-success` |

**Transiciones permitidas:**
- Nuevo ↔ Contactado ↔ Cotizado ↔ Negociación ↔ Ganado ↔ Cliente
- Cualquier → Perdido (excepto cliente)

---

## 🔄 Sistema de Estados (Work Orders)

| Estado | Color | Acción del usuario |
|--------|-------|-------------------|
| 📥 Recibido | `bg-secondary` | Recibir equipo |
| 🔍 Diagnosticando | `bg-info` | Hacer diagnóstico |
| 💰 Presupuestado | `bg-warning` | Enviar presupuesto |
| ✅ Aprobado | `bg-success` | Cliente aprueba |
| 🔧 Reparando | `bg-primary` | Reparar |
| 📦 Esperando Repuestos | `bg-secondary` | Pedir repuestos |
| ✅ Completado | `bg-success` | Reparación lista |
| 📤 Entregado | `bg-success` | Entregar a cliente |
| ❌ Cancelado | `bg-danger` | Cancelar |

---

## 📊 Dashboard — KPIs

```
┌────────┬────────┬────────┬────────┐
│ Leads  │Clientes│ OT     │ Ingresos│
│ 48     │ 2      │ Activa │ $450K  │
├────────┴────────┴────────┴────────┤
│ 📈 Leads por etapa (gráfico barras)│
│ 📈 OT por estado (gráfico barras)  │
│ 📈 Líneas de interés (gráfico)     │
│ 📋 Últimas órdenes                 │
│ 📋 Próximos seguimientos           │
└────────────────────────────────────┘
```

---

## 📦 Datos a manejar

### Leads (48 registros)
- id, nombre, contacto, segmento, linea_interes, estado, fuente, valor_estimado, fecha_creacion, proximo_seguimiento, notas

### Clientes (2 registros)
- id, telefono, nombre, fuente, primer_contacto, ultimo_contacto, interacciones_totales, estado, segmento, linea_interes, lead_id, notas, ordenes vinculadas

### Órdenes de Trabajo (1 registro)
- id, cliente (nombre+tel), equipo (tipo+marca+modelo), falla, diagnostico, presupuesto, estado, fechas, historial, notas

### Interacciones (2 registros)
- Conversaciones con leads/clientes

---

## ✅ Plan de ejecución

### Fase 1 — Backend endpoints (4 nuevos)
- [x] Backend SQLite funcionando con 12 endpoints actuales
- [ ] `GET /api/leads/<id>/interactions` — interacciones de un lead
- [ ] `POST /api/leads/<id>/interactions` — crear interacción desde perfil
- [ ] `PUT /api/leads/<id>/notes` — editar notas in-place
- [ ] `PUT /api/clients/<id>/notes` — editar notas in-place

### Fase 2 — Perfil Lead Completo (ALTA PRIORIDAD)
- [x] Tarjeta de contacto (WhatsApp, email, web, FB, copiar teléfono)
- [x] Navegación de etapas (◀ ▶ + barra de progreso)
- [x] Información detallada
- [ ] **🚀 Timeline de interacciones embebido** — historial completo dentro del perfil
- [ ] **🚀 Botón "+ Nueva Interacción"** — modal rápido desde el perfil
- [ ] **🚀 Notas editables in-place** — clic para editar, guardar sin modal

### Fase 3 — Perfil Cliente Completo
- [x] Tarjeta de contacto
- [x] Órdenes vinculadas visibles
- [ ] **🚀 Timeline de interacciones embebido** (mismo que lead)
- [ ] **🚀 Notas editables in-place**

### Fase 4 — Dashboard mejorado
- [x] Stats (leads, clientes, OT activas/completadas)
- [x] Gráficos por estado y línea de interés
- [x] Últimas órdenes
- [ ] **🚀 Próximos seguimientos** — leads con fecha de follow-up cercana

### Fase 5 — Versionado y GitHub
- [ ] Commit con todo
- [ ] Push a GitHub (requiere token)

---

**🚀 = Nuevo — alto valor agregado**
