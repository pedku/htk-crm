# PLAN: HTK CRM v3 — Sistema Integral de Gestión

> **Versión:** 2.0 | **Fecha:** 2026-05-14 | **Autor:** HTK-Asistente  
> **Modelo de ejecución:** `deepseek-v4-pro` vía sub-agente  
> **Owner:** Pedro Castro — HTK INGENIERIA (HOUSETRONIK S.A.S.)

---

## 🎯 Visión General

Un CRM donde **TODO gira alrededor de la Orden de Trabajo**:

1. La OT tiene un **tipo** (`reparación`, `fabricación`, `instalación`) que determina sus **estados, campos y plantillas**
2. El **perfil del cliente** se ve integrado DENTRO de cada OT y cada lead
3. Los **abonos/pagos** se registran en la OT y reflejan saldo pendiente
4. La **fabricación** no es una vista aparte: es un tipo de OT con sus propios estados y configuración
5. El **cliente consulta desde WhatsApp** el estado de su OT por código
6. **Todo se configura desde el CRM** — sin tocar código

---

## 🧭 Arquitectura Objetivo

```
┌─────────────────────────────────────────────────────────────────┐
│                         CRM HTK v3                              │
│                    Flask + SQLite central                        │
│                     localhost:18800                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐  │
│  │Dashboard │  Kanban  │ Clientes │   OTs    │ Configuración│  │
│  │          │ Leads+OT │  +Perfil │ Kanban+  │ Segmentos    │  │
│  │          │          │          │ Perfil   │ Bot          │  │
│  │          │          │          │          │ Plantillas   │  │
│  │          │          │          │          │ Precios      │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                       API REST                                   │
│  /api/clients  /api/leads  /api/work_orders  /api/work_orders/  │
│  <id>/payments  /api/bot/config  /api/segments                  │
│  /api/wo-templates?tipo=fabricacion                             │
├─────────────────────────────────────────────────────────────────┤
│                         │                                        │
│     ┌───────────────────┼───────────────────┐                   │
│     ▼                   ▼                   ▼                    │
│  Bot WhatsApp        Inventario          Pagos/Abonos           │
│  (bot.js v4)         (materiales)        (tracking $)           │
│  :18802              :18800/API          :18800/API             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Tipos de Órdenes de Trabajo

Cada tipo define: **estados → plantillas → campos extra → comportamiento**

### Tipo 1: 🔧 REPARACIÓN
```
recibido → diagnosticando → presupuestado → aprobado
                                               ↓
         reparando ← esperando_repuestos ──────┘
              ↓
         completado → entregado

cancelado (desde cualquier estado antes de completado)
```
**Campos extra:** `falla_reportada`, `diagnostico`, `repuestos_solicitados`

### Tipo 2: 🏭 FABRICACIÓN
```
cotizando → diseno_aprobado → materiales → bobinado
                                                  ↓
         ensamble → pruebas → control_calidad → finalizado → entregado

cancelado (desde cualquier estado antes de finalizado)
```
**Campos extra:** `tipo_producto`, `capacidad`, `voltaje_entrada`, `voltaje_salida`, `fases`, `nucleo`, `refrigeracion`, `materiales_json`, `plano_url`, `operario`

### Tipo 3: 🚗 INSTALACIÓN
```
agendado → en_sitio → instalando → pruebas → finalizado → facturado

cancelado (desde cualquier estado antes de facturado)
```
**Campos extra:** `direccion_instalacion`, `tipo_cargador`, `potencia`, `requiere_obra_civil`, `fecha_agendada`, `tecnico_asignado`

---

## 📊 Esquema de Datos Completo

### Tabla Principal: `work_orders` (MODIFICADA)
```sql
CREATE TABLE work_orders (
  id                TEXT PRIMARY KEY,        -- HTK-XXX
  tipo              TEXT NOT NULL DEFAULT 'reparacion',  -- 'reparacion','fabricacion','instalacion'
  
  -- Cliente (vinculado)
  cliente_nombre    TEXT,
  cliente_telefono  TEXT,
  client_id         TEXT,                    -- FK a clients.id
  
  -- Equipo
  equipo_tipo       TEXT,
  equipo_marca      TEXT,
  equipo_modelo     TEXT,
  
  -- Estados y fechas
  estado            TEXT NOT NULL DEFAULT 'recibido',
  fecha_recibido    TEXT,
  fecha_diagnostico TEXT,                   -- reparación
  fecha_presupuesto_aprobado TEXT,
  fecha_completado  TEXT,
  fecha_entregado   TEXT,
  fecha_fin         TEXT,                   -- fabricación: fecha final estimada
  
  -- Finanzas
  presupuesto       REAL,
  valor_total       REAL,                   -- valor final facturado
  
  -- Campos dinámicos según tipo (JSON)
  campos_extra      TEXT DEFAULT '{}',      -- JSON con campos específicos del tipo
  
  -- Reparación
  falla_reportada   TEXT,
  diagnostico       TEXT,
  
  -- General
  notas_internas    TEXT,
  activo            BOOLEAN DEFAULT 1,
  
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

**`campos_extra` (JSON)** — almacena los campos específicos de cada tipo:

```json
// Tipo: fabricacion
{
  "tipo_producto": "elevador",
  "capacidad": "5kVA",
  "voltaje_entrada": "90V-110V",
  "voltaje_salida": "115V",
  "fases": "monofasico",
  "nucleo": "silicio",
  "refrigeracion": "aire",
  "materiales": [
    {"codigo": "CU-12", "nombre": "Alambre cobre #12", "cantidad": 2, "unidad": "kg", "usado": true},
    {"codigo": "NU-01", "nombre": "Núcleo silicio", "cantidad": 1, "unidad": "unidad", "usado": true}
  ],
  "plano_url": "",
  "operario": "Carlos",
  "fecha_inicio": "2026-05-14",
  "fecha_estimada": "2026-05-20",
  "etapa_calidad": []
}

// Tipo: instalacion
{
  "direccion_instalacion": "Cra 51B #94-420, Barranquilla",
  "tipo_cargador": "Nivel 2",
  "potencia": "7.4kW",
  "requiere_obra_civil": false,
  "fecha_agendada": "2026-05-20",
  "tecnico_asignado": "Pedro"
}
```

### Tabla: `wo_templates` — Plantillas por tipo y estado
```sql
CREATE TABLE wo_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL,
  tipo_ot         TEXT NOT NULL,            -- 'reparacion','fabricacion','instalacion','*'
  estado_origen   TEXT NOT NULL,
  asunto          TEXT,
  mensaje         TEXT NOT NULL,
  canal           TEXT DEFAULT 'whatsapp',
  activo          BOOLEAN DEFAULT 1
);
```

### Tabla: `payments` — Abonos y pagos
```sql
CREATE TABLE payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wo_id           TEXT NOT NULL,
  monto           REAL NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'abono',  -- 'abono', 'pago_total', 'reembolso'
  metodo          TEXT,                      -- 'efectivo', 'transferencia', 'nequi', 'daviplata'
  referencia      TEXT,
  fecha           TEXT NOT NULL,
  notas           TEXT,
  registrado_por  TEXT DEFAULT 'Pedro',
  FOREIGN KEY (wo_id) REFERENCES work_orders(id)
);
```

**Lógica de pagos:**
- `presupuesto` = valor cotizado
- `abonos = SUM(payments WHERE tipo IN ('abono','pago_total'))`
- `saldo_pendiente = presupuesto - abonos`
- Cuando `saldo_pendiente ≤ 0` → estado de pago: **pagado**
- Cuando `saldo_pendiente > 0 AND abonos > 0` → **abonado**
- Cuando `abonos = 0 AND presupuesto > 0` → **pendiente**

### Tabla: `bot_config` — Configuración del bot
```sql
CREATE TABLE bot_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  tipo        TEXT DEFAULT 'texto',
  descripcion TEXT,
  categoria   TEXT DEFAULT 'general'
);
```

### Tablas Existentes (sin cambios estructurales)
- `leads`, `clients` (expandidas), `interactions`, `etapas`, `segmentos`, `precios`, `ventas`, `tags`, `tareas`, `work_order_history`, `work_order_client_links`

### MODIFICACIONES a `clients`
```sql
ALTER TABLE clients ADD COLUMN direccion TEXT;
ALTER TABLE clients ADD COLUMN ciudad TEXT DEFAULT 'Barranquilla';
ALTER TABLE clients ADD COLUMN tipo_documento TEXT;
ALTER TABLE clients ADD COLUMN documento TEXT;
ALTER TABLE clients ADD COLUMN empresa TEXT;
ALTER TABLE clients ADD COLUMN cargo TEXT;
ALTER TABLE clients ADD COLUMN cumpleanos TEXT;
ALTER TABLE clients ADD COLUMN redes_contacto TEXT;
```

---

## 👤 Perfil de Cliente (DENTRO de Leads, OTs, y vista propia)

### Vista Integrada — se muestra en 3 lugares:

#### A) En el Lead (modal/pestaña)
```
┌─────────────────────────────────────────┐
│ 👤 Juan Pérez                           │
│ 📞 57300123456 | ✉️ juan@email.com      │
│ 🏢 Hotel Las Palmas | Cargo: Gerente    │
│ 📍 Cra 51 #94-420, Barranquilla         │
│ 🏷️ Segmento: hoteles                    │
│ 💰 Valor estimado: $2,500,000           │
├─────────────────────────────────────────┤
│ 📊 Historial:                           │
│  14/05 - WhatsApp: "Necesito elevador"  │
│  13/05 - Llamada: Cotización inicial    │
├─────────────────────────────────────────┤
│ 📝 Notas:                               │
│  [texto editable]                       │
└─────────────────────────────────────────┘
```

#### B) En la OT (panel lateral o sección superior)
```
┌─────────────────────────────────────────┐
│ HTK-042 — 🔧 Reparación                  │
├─────────────────────────────────────────┤
│ ┌─ CLIENTE ──────────────────────────┐  │
│ │ 👤 Juan Pérez                       │  │
│ │ 📞 57300123456                      │  │
│ │ 🏢 Hotel Las Palmas                 │  │
│ │ 🔧 3 órdenes anteriores             │  │
│ │ [Ver perfil completo]               │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ┌─ EQUIPO ───────────────────────────┐  │
│ │ Elevador 5kVA Trifásico            │  │
│ │ Marca: Siemens | Modelo: ELV-5000   │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ┌─ FINANZAS ─────────────────────────┐  │
│ │ Presupuesto: $450,000              │  │
│ │ Abonado: $200,000 | Pendiente: $250K│  │
│ │ [➕ Registrar abono]                │  │
│ └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

#### C) Vista de Cliente (pestaña Clientes → click en uno)
```
4 pestañas internas:
 📋 Datos  |  🔧 Órdenes  |  📊 Historial  |  💰 Pagos
```

---

## 📦 Fases de Implementación

---

### FASE 1 — Base de Datos + Tipos de OT
**⏱ 1 día | 🔴 Alta | Depende de: —**

#### Cambios en BD
1. Agregar columna `tipo` a `work_orders` (default: 'reparacion')
2. Agregar columna `campos_extra TEXT DEFAULT '{}'`
3. Agregar columna `valor_total REAL`
4. Agregar columna `client_id TEXT` (FK a clients)
5. Crear tabla `payments`
6. Crear tabla `wo_templates`
7. Crear tabla `bot_config`
8. Agregar columnas a `clients`

#### Backend
- `GET /api/work_orders?tipo=fabricacion` — filtrar por tipo
- `GET /api/work_orders/tipos` — devuelve tipos disponibles con sus estados:
  ```json
  {
    "reparacion": {
      "label": "Reparación",
      "icono": "🔧",
      "estados": ["recibido","diagnosticando","presupuestado","aprobado","reparando","esperando_repuestos","completado","entregado","cancelado"],
      "campos": ["falla_reportada","diagnostico"]
    },
    "fabricacion": {
      "label": "Fabricación",
      "icono": "🏭",
      "estados": ["cotizando","diseno_aprobado","materiales","bobinado","ensamble","pruebas","control_calidad","finalizado","entregado","cancelado"],
      "campos": ["tipo_producto","capacidad","voltaje_entrada","voltaje_salida","fases","nucleo","refrigeracion","operario","fecha_inicio","fecha_estimada"]
    },
    "instalacion": {
      "label": "Instalación",
      "icono": "🚗",
      "estados": ["agendado","en_sitio","instalando","pruebas","finalizado","facturado","cancelado"],
      "campos": ["direccion_instalacion","tipo_cargador","potencia","requiere_obra_civil","fecha_agendada","tecnico_asignado"]
    }
  }
  ```
- `POST /api/work_orders` — acepta `tipo` y `campos_extra` 
- `PUT /api/work_orders/<id>` — actualiza `campos_extra` (merge JSON)

#### Frontend
- Al crear OT, selector de tipo que cambia los campos del formulario dinámicamente
- Mostrar campos específicos según tipo en el detalle de OT

---

### FASE 2 — Perfil de Cliente Integrado
**⏱ 2 días | 🔴 Alta | Depende de: F1**

#### Backend
- `GET /api/clients/<id>` — devuelve:
  ```json
  {
    "id": "CLI-001",
    "nombre": "Juan Pérez",
    "telefono": "57300123456",
    "email": "juan@email.com",
    "empresa": "Hotel Las Palmas",
    "cargo": "Gerente",
    "direccion": "Cra 51 #94-420",
    "ciudad": "Barranquilla",
    "documento": "12345678",
    "segmento": "hoteles",
    "notas": "...",
    "ordenes": [
      {"id": "HTK-042", "tipo": "fabricacion", "estado": "bobinado", "presupuesto": 450000},
      {"id": "HTK-030", "tipo": "reparacion", "estado": "entregado", "presupuesto": 120000}
    ],
    "ordenes_count": 3,
    "total_facturado": 570000,
    "saldo_pendiente": 250000,
    "ultimo_contacto": "2026-05-14T13:00:00",
    "interacciones": [...]
  }
  ```
- `GET /api/clients/<id>/orders` — OTs del cliente con detalle
- `GET /api/clients/<id>/payments` — historial de pagos del cliente

#### Frontend (3 integraciones)
1. **Dentro del Lead** — panel de perfil si el lead ya es cliente
2. **Dentro de la OT** — tarjeta de cliente en la parte superior con:
   - Datos de contacto + link a perfil completo
   - Órdenes anteriores (mini-tabla con ID, tipo, estado)
   - Estado de pagos (abonado / pendiente / pagado)
3. **Pestaña Clientes** — vista completa con 4 tabs:
   - 📋 Datos generales + documento + empresa
   - 🔧 Órdenes (tabla con filtro por tipo y estado)
   - 📊 Historial (timeline WhatsApp + llamadas + notas)
   - 💰 Pagos (historial de abonos con saldo)

---

### FASE 3 — Kanban de Órdenes de Trabajo
**⏱ 2 días | 🔴 Alta | Depende de: F1**

#### Backend
- `GET /api/work_orders/kanban?tipo=fabricacion` — agrupa OTs por estado para Kanban
  ```json
  {
    "cotizando": {
      "label": "Cotizando",
      "color": "#f59e0b",
      "icono": "📋",
      "ordenes": [...]
    },
    "diseno_aprobado": {...},
    ...
  }
  ```
- El Kanban carga las columnas desde `/api/work_orders/tipos` → los estados del tipo seleccionado

#### Frontend
- **Selector de tipo** arriba del Kanban: `Todos | Reparación | Fabricación | Instalación`
- Columnas dinámicas según el tipo seleccionado
- **Drag & drop** con cambio de estado automático
- Tarjeta de OT muestra:
  ```
  ┌──────────────────────────┐
  │ HTK-042    🏭 Fabricación │
  │ Elevador 5kVA            │
  │ 👤 Juan Pérez             │
  │ 📅 14 may | ⏱ 3 días     │
  │ 💰 $450K | Abono: $200K   │
  │ ━━━━━━━━━━━ 44% pagado   │
  └──────────────────────────┘
  ```
  - **Barra de progreso de pago** (verde = pagado, naranja = abonado, rojo = pendiente)
- **Color coding:** rojo si excede SLA, verde si completado/entregado
- Filtros: tipo, cliente, rango de fechas, operario
- **Click en tarjeta** → modal con perfil completo de OT + cliente + pagos

---

### FASE 4 — Pagos y Abonos
**⏱ 1 día | 🟡 Media | Depende de: F1**

#### Backend
- `GET /api/work_orders/<id>/payments` — listar pagos de una OT
- `POST /api/work_orders/<id>/payments` — registrar abono:
  ```json
  {
    "monto": 200000,
    "tipo": "abono",
    "metodo": "nequi",
    "referencia": "Pago parcial 50%",
    "fecha": "2026-05-14"
  }
  ```
- `DELETE /api/work_orders/<id>/payments/<payment_id>` — eliminar pago (solo si no está finalizado)
- `GET /api/payments/resumen` — resumen de caja: total abonado hoy/semana/mes, pendiente total

#### Frontend
- **En el detalle de OT:** sección de Finanzas
  ```
  ┌─────────────────────────────────────────┐
  │ 💰 FINANZAS                              │
  │                                          │
  │ Presupuesto:  $450,000                   │
  │ Abonado:      $200,000  ━━━━━━━ 44%     │
  │ Pendiente:    $250,000                   │
  │                                          │
  │ Historial de pagos:                      │
  │  14/05 - $200,000 (Nequi) - Abono       │
  │                                          │
  │ [+ Registrar abono]                      │
  └─────────────────────────────────────────┘
  ```
- Modal "Registrar Abono": monto, método (dropdown), referencia, fecha
- **Dashboard:** widget de caja del día con total abonos

---

### FASE 5 — Plantillas por Tipo y Estado
**⏱ 1 día | 🟡 Media | Depende de: F3**

#### Plantillas predefinidas (seeds)

**🔧 REPARACIÓN:**
| Estado | Plantilla |
|--------|-----------|
| `recibido` | "🔧 *HTK INGENIERIA* — {cliente}, recibimos tu {equipo}. Orden: *{id}*. Diagnóstico en 48-72h." |
| `presupuestado` | "📋 Diagnóstico listo: {diagnostico}. Presupuesto: *${presupuesto}*. Responde *APROBAR* para iniciar." |
| `reparando` | "🔧 Tu equipo está en reparación. {id} — {equipo}. Te avisamos al terminar." |
| `esperando_repuestos` | "⏳ Pedimos repuestos para tu {equipo}. Orden {id}. Te avisamos cuando lleguen." |
| `completado` | "✅ ¡Listo! {id} — {equipo}. Pasa por nuestro taller. Total: ${presupuesto}." |

**🏭 FABRICACIÓN:**
| Estado | Plantilla |
|--------|-----------|
| `cotizando` | "🏭 *HTK INGENIERIA* — {cliente}, estamos cotizando tu {tipo_producto} {capacidad}. Te enviamos la propuesta pronto." |
| `diseno_aprobado` | "✅ Diseño aprobado. Iniciamos fabricación de tu {tipo_producto} {capacidad}. Orden: *{id}*" |
| `materiales` | "📦 Adquiriendo materiales para tu {tipo_producto}. {id}" |
| `bobinado` | "🔧 En proceso de bobinado. {id} — {tipo_producto} {capacidad}." |
| `ensamble` | "🔩 Ensamblando tu {tipo_producto}. {id}" |
| `pruebas` | "⚡ Probando tu {tipo_producto}. Verificamos voltajes y protección. {id}" |
| `control_calidad` | "✅ Control de calidad aprobado. {id} — {tipo_producto} listo." |
| `finalizado` | "🏁 ¡Fabricación completada! {id} — {tipo_producto} {capacidad}. Total: ${presupuesto}." |

**🚗 INSTALACIÓN:**
| Estado | Plantilla |
|--------|-----------|
| `agendado` | "📅 Instalación agendada: {fecha_agendada}. Técnico: {tecnico_asignado}. {id}" |
| `en_sitio` | "👷 Técnico en sitio. Iniciando instalación de tu {tipo_cargador}. {id}" |
| `instalando` | "🔌 Instalando {tipo_cargador} {potencia}. {id}" |
| `pruebas` | "⚡ Realizando pruebas del cargador. {id}" |
| `finalizado` | "✅ Instalación completada. {id} — {tipo_cargador}. ¡Disfruta!" |
| `facturado` | "📄 Factura emitida. {id} — Total: ${presupuesto}. Gracias por confiar en HTK." |

#### Backend
- `GET /api/wo-templates?tipo_ot=fabricacion` — plantillas filtradas por tipo
- `POST/PUT/DELETE /api/wo-templates/<id>` — CRUD
- `POST /api/work_orders/<id>/notify` — envía mensaje usando plantilla del estado actual

#### Frontend
- Pestaña "Configuración → Plantillas OT"
- Filtro por tipo de OT
- Tabla con: Tipo OT, Estado, Preview del mensaje, Activo, Acciones
- Editor de plantilla con preview en vivo de placeholders
- Placeholders dinámicos según tipo:
  - Todos: `{id}`, `{cliente}`, `{equipo}`, `{estado}`, `{presupuesto}`, `{fecha}`
  - Reparación: `{diagnostico}`
  - Fabricación: `{tipo_producto}`, `{capacidad}`, `{fecha_estimada}`
  - Instalación: `{tipo_cargador}`, `{potencia}`, `{fecha_agendada}`, `{tecnico_asignado}`

---

### FASE 6 — Configuración del Bot desde CRM
**⏱ 2 días | 🟡 Media | Depende de: F1**

#### Keys de configuración (tabla `bot_config`)
```json
{
  "horario": {
    "semana_inicio": 8,
    "semana_fin": 18,
    "sabado_inicio": 8,
    "sabado_fin": 13
  },
  "comportamiento": {
    "reset_timeout_ms": 1800000,
    "max_auto_mensajes": 5,
    "auto_respuesta_activa": true,
    "derivar_sin_respuesta": true,
    "silenciar_lead_minutos": 30,
    "silenciar_pitch_dias": 7,
    "consulta_ot_activa": true
  },
  "mensajes": {
    "presentacion": "...",
    "bienvenida": "...",
    "fuera_horario": "...",
    "derivar_ingeniero": "...",
    "despedida": "..."
  },
  "conexion": {
    "crm_api_url": "http://localhost:18800",
    "crm_api_key": ""
  }
}
```

#### Backend
- `GET /api/bot/config` — devuelve toda la config como JSON plano
- `PUT /api/bot/config` — actualiza keys en batch
- `POST /api/bot/config/reload` → notifica al bot que recargue

#### bot.js — Integración
```javascript
// Al iniciar, bot.js sobreescribe config.js con valores del CRM
async function loadConfigFromCRM() {
  try {
    const resp = await fetch('http://localhost:18800/api/bot/config');
    if (!resp.ok) return console.log('⚠️ CRM no disponible, usando config.js local');
    const crmConfig = await resp.json();
    
    // Horario
    if (crmConfig.horario_semana_inicio) config.horario.semana.inicio = Number(crmConfig.horario_semana_inicio);
    if (crmConfig.horario_semana_fin) config.horario.semana.fin = Number(crmConfig.horario_semana_fin);
    if (crmConfig.horario_sabado_inicio) config.horario.sabado.inicio = Number(crmConfig.horario_sabado_inicio);
    if (crmConfig.horario_sabado_fin) config.horario.sabado.fin = Number(crmConfig.horario_sabado_fin);
    
    // Timeout y límites
    if (crmConfig.reset_timeout_ms) config.resetTimeoutMs = Number(crmConfig.reset_timeout_ms);
    if (crmConfig.max_auto_mensajes) config.maxAutoMensajes = Number(crmConfig.max_auto_mensajes);
    
    // URLs
    if (crmConfig.crm_api_url) config.crmApiUrl = crmConfig.crm_api_url;
    
    // Mensajes (sobrescribe messages.js)
    if (crmConfig.mensaje_bienvenida) msgs.bienvenida = crmConfig.mensaje_bienvenida;
    if (crmConfig.mensaje_fuera_horario) msgs.fuera_horario = crmConfig.mensaje_fuera_horario;
    if (crmConfig.mensaje_derivar) msgs.derivar_ingeniero = crmConfig.mensaje_derivar;
    if (crmConfig.mensaje_despedida) msgs.despedida = crmConfig.mensaje_despedida;
    
    // Toggles
    if (crmConfig.consulta_ot_activa !== undefined) config.consultaOTActiva = crmConfig.consulta_ot_activa === 'true';
    
    console.log('✅ Configuración cargada desde CRM');
  } catch(e) {
    console.log('⚠️ CRM no disponible, usando config.js local');
  }
}
```

#### Frontend
- Pestaña "Configuración → Bot"
- Secciones plegables:
  - ⏰ **Horario laboral**
  - 🔧 **Comportamiento** (sliders/inputs para timeouts y límites)
  - 📝 **Mensajes** (textarea con preview WhatsApp simulado)
  - 🔌 **Conexión** (URL del CRM, indicador 🟢/🔴)

---

### FASE 7 — Consulta de OT desde WhatsApp
**⏱ 1 día | 🟡 Media | Depende de: F6**

#### Nueva opción en menú del Bot
```
7️⃣ 📋 Consultar estado de mi orden
```

#### Flujo en bot.js
```javascript
// Nuevo estado
CONSULTA_OT: "consulta_ot"

// En el handler:
if (session.estado === ESTADOS.CONSULTA_OT) {
  const codigo = texto.trim().toUpperCase();
  if (codigo === 'MENU') { /* volver al menú */ }
  
  const respuesta = await consultarOT(codigo);
  session.estado = ESTADOS.MENU;
  return respuesta;
}

async function consultarOT(codigo) {
  try {
    const crmUrl = config.crmApiUrl || 'http://localhost:18800';
    const resp = await fetch(`${crmUrl}/api/work_orders/${codigo}`);
    if (!resp.ok) return `❌ No encontré la orden *${codigo}*. Verifica el código.`;
    
    const ot = await resp.json();
    
    let msg = `📋 *${ot.id}* — ${ot.tipo === 'fabricacion' ? '🏭' : ot.tipo === 'instalacion' ? '🚗' : '🔧'} ${ot.tipo.toUpperCase()}\n\n`;
    msg += `🔧 Equipo: ${ot.equipo.tipo} ${ot.equipo.marca} ${ot.equipo.modelo}\n`;
    msg += `📍 Estado: *${ot.estado.toUpperCase()}*\n`;
    
    if (ot.fechas?.recibido) msg += `📅 Recibido: ${formatFecha(ot.fechas.recibido)}\n`;
    
    // Timeline
    if (ot.historial?.length > 0) {
      msg += `\n📜 *Historial:*\n`;
      for (const h of ot.historial) {
        msg += `${iconoEstado(h.estado)} ${formatFecha(h.fecha)} — ${h.descripcion}\n`;
      }
    }
    
    // Pagos
    if (ot.presupuesto) {
      const pagos = await fetch(`${crmUrl}/api/work_orders/${codigo}/payments`).then(r => r.json());
      const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0);
      const pendiente = ot.presupuesto - totalAbonado;
      
      msg += `\n💰 Presupuesto: $${formatearPesos(ot.presupuesto)}`;
      if (totalAbonado > 0) {
        msg += `\n💵 Abonado: $${formatearPesos(totalAbonado)}`;
        if (pendiente > 0) msg += `\n⚠️ Pendiente: $${formatearPesos(pendiente)}`;
        else msg += `\n✅ *TOTALMENTE PAGADO*`;
      }
    }
    
    // Fabricación: etapa actual
    if (ot.tipo === 'fabricacion' && ot.campos_extra) {
      const extra = JSON.parse(ot.campos_extra);
      if (extra.operario) msg += `\n👷 Operario: ${extra.operario}`;
      if (extra.fecha_estimada) msg += `\n📅 Entrega est.: ${formatFecha(extra.fecha_estimada)}`;
    }
    
    return msg;
  } catch(e) {
    return '❌ Error consultando. Intenta más tarde o llama al 📞 +57 315 6032940';
  }
}
```

#### Ejemplo de respuesta
```
📋 *HTK-042* — 🏭 FABRICACIÓN

🔧 Equipo: Elevador 5kVA Siemens ELV-5000
📍 Estado: *BOBINADO*

📜 *Historial:*
✅ 14/05 — Cotización enviada
✅ 15/05 — Diseño aprobado por el cliente
✅ 16/05 — Materiales adquiridos
🔧 17/05 — Inicio de bobinado

💰 Presupuesto: $450,000
💵 Abonado: $200,000
⚠️ Pendiente: $250,000

👷 Operario: Carlos
📅 Entrega est.: 20/05/2026
```

---

### FASE 8 — Inventario de Materiales
**⏱ 1 día | 🟢 Baja | Depende de: F1**

#### Backend
- `GET/POST /api/inventario` — listar/crear items
- `PUT/DELETE /api/inventario/<id>` — editar/eliminar
- `GET /api/inventario/bajo-stock` — alertas de stock bajo
- `POST /api/inventario/<id>/ajustar` — entrada/salida

#### Vinculación con fabricación
- Cuando una OT de tipo `fabricación` usa un material, se descuenta del inventario
- El campo `materiales` en `campos_extra` registra qué se usó

#### Frontend
- Tabla con columnas: Código, Nombre, Categoría, Stock, Stock Mín, Proveedor
- Color rojo si `stock < stock_minimo`
- Botón "+" para entrada rápida

---

### FASE 9 — UI Configuración y Pulido Final
**⏱ 1 día | 🟢 Baja | Depende de: Todo**

- Pestaña "Configuración" en sidebar
- Sub-secciones: Segmentos | Bot | Plantillas OT | Precios | Usuarios
- Indicador 🟢/🔴 de conexión del bot en header
- Contador de notificaciones en sidebar
- Búsqueda global incluye OTs y clientes

---

## 🤖 Arquitectura de Ejecución

### Regla absoluta
> **Toda ejecución de código del plan DEBE usar `sessions_spawn` con `model: "deepseek/deepseek-v4-pro"` y `context: "fork"`.**

### Justificación
1. El modelo Pro (`deepseek-v4-pro`) tiene capacidad de razonamiento profundo para implementar 400+ líneas de código complejo sin errores
2. `context: "fork"` le da al sub-agente acceso al plan completo y al código existente
3. Cada fase se implementa aislada, con sus propias pruebas, antes de pasar a la siguiente
4. Las fases independientes (1 y 5) pueden ejecutarse en paralelo si se desea

### Template por fase
```javascript
sessions_spawn({
  task: `
FASE N: [nombre]
Plan de referencia: /home/peku/.openclaw/workspace/PLAN_CRM_v3.md

Implementar exactamente lo descrito en la fase N del plan:
- Cambios en BD: [lista]
- Cambios en backend (crm_app.py): [lista de endpoints]
- Cambios en frontend (index.html): [lista de secciones]
- Cambios en bot (bot.js): [si aplica]

Al terminar:
1. Verificar que cada endpoint responde con curl
2. Confirmar que no se rompió funcionalidad existente
3. Reportar exactamente qué se modificó y qué endpoints nuevos existen
  `,
  model: "deepseek/deepseek-v4-pro",
  context: "fork",
  mode: "run"
});
```

---

## ✅ Checklist de Implementación

| # | Fase | Backend | Frontend | Bot | Pruebas | Estado |
|---|------|---------|----------|-----|---------|--------|
| 1 | Tipos de OT + BD | Migración + API tipos | Form tipo dinámico | — | curl | ⬜ |
| 2 | Perfil Cliente Integrado | API cliente/OT/pagos | 3 vistas integradas | — | UI | ⬜ |
| 3 | Kanban OT por tipo | Agrupar API | Drag-drop dinámico | — | UI | ⬜ |
| 4 | Pagos y Abonos | API payments | Sección finanzas | — | curl + UI | ⬜ |
| 5 | Plantillas x Tipo x Estado | CRUD + notify | Editor + preview | — | Enviar test | ⬜ |
| 6 | Config Bot desde CRM | API config | Form settings | loadConfig | Recargar | ⬜ |
| 7 | Consulta OT WhatsApp | — | — | Nuevo estado | Test real | ⬜ |
| 8 | Inventario | CRUD + stock | Tabla + alertas | — | Bajo stock | ⬜ |
| 9 | UI Configuración | — | Pestañas + badges | — | Navegación | ⬜ |

---

## 📐 Convenciones

- **Backend:** Python 3 + Flask + SQLite (queries directas, sin ORM)
- **Frontend:** HTML5 + Bootstrap 5 + vanilla JS
- **Bot:** Node.js + whatsapp-web.js v1.34.7
- **IDs:** `HTK-XXX` (OTs), `CLI-XXX` (clientes), `PRO-XXX` (leads)
- **Colores HTK:** Primario `#f97316` / Secundario `#0ea5e9`
- **DB:** `/home/peku/.openclaw/workspace/crm/htk_crm.db`
- **Workspace:** `/home/peku/.openclaw/workspace/`

---

> ⚡ **HTK INGENIERIA** — _Soluciones en ingeniería de confianza._
> 
> Plan v2.0 — 2026-05-14 14:30 GMT-5
