# PLAN DE FACTURACIÓN — HTK INGENIERIA CRM
> Versión: 1.0 | Fecha: 2026-05-26 | Autor: HTK-Asistente

---

## 📋 Índice

1. [PLAN 1: Sistema de Facturación — Arquitectura Completa](#plan-1-sistema-de-facturación--arquitectura-completa)
   - [Estructura de Datos](#11-estructura-de-datos)
   - [API REST — Endpoints](#12-api-rest--endpoints)
   - [Frontend — Componentes](#13-frontend--componentes)
   - [Flujo de Navegación](#14-flujo-de-navegación)
   - [Archivos a Modificar/Crear](#15-archivos-a-modificarcrear)
   - [Estimación de Esfuerzo](#16-estimación-de-esfuerzo)
2. [PLAN 2: Plantilla de Factura — Diseño Visual](#plan-2-plantilla-de-factura--diseño-visual)
   - [Sistema de Diseño](#21-sistema-de-diseño)
   - [Estructura de la Plantilla](#22-estructura-de-la-plantilla)
   - [Datos Dinámicos](#23-datos-dinámicos)
   - [Estilos y Media Print](#24-estilos-y-media-print)
   - [Integración con el Sistema](#25-integración-con-el-sistema)

---

# PLAN 1: Sistema de Facturación — Arquitectura Completa

## 1.1 Estructura de Datos

### Tabla SQLite: `invoices`

```sql
CREATE TABLE IF NOT EXISTS invoices (
    id              TEXT PRIMARY KEY,        -- FAC-001, FAC-002...
    client_id       TEXT NOT NULL,           -- FK a clients.id
    wo_id           TEXT,                    -- FK a work_orders.id (opcional)
    numero          TEXT NOT NULL UNIQUE,    -- FAC-0001 (correlativo)
    estado          TEXT DEFAULT 'borrador', -- borrador|emitida|pagada|anulada|vencida
    fecha_emision   TEXT NOT NULL,           -- ISO datetime
    fecha_vencimiento TEXT NOT NULL,         -- ISO date
    sub_total       REAL DEFAULT 0,
    descuento       REAL DEFAULT 0,
    iva_total       REAL DEFAULT 0,
    total_general   REAL DEFAULT 0,
    notas           TEXT DEFAULT '',
    terminos        TEXT DEFAULT '',         -- Condiciones de pago
    metodo_pago     TEXT DEFAULT '',
    pagada_fecha    TEXT,                    -- Fecha de pago
    activo          BOOLEAN DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

### Tabla SQLite: `invoice_items`

```sql
CREATE TABLE IF NOT EXISTS invoice_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id      TEXT NOT NULL,           -- FK a invoices.id
    item_num        INTEGER NOT NULL,        -- Número de línea
    descripcion     TEXT NOT NULL,
    cantidad        REAL NOT NULL DEFAULT 1,
    precio_unitario REAL NOT NULL DEFAULT 0,
    iva_porcentaje  REAL DEFAULT 19,         -- IVA en porcentaje
    total_linea     REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
```

### Diagrama de Relaciones

```
┌─────────────┐       ┌──────────────┐       ┌──────────────────┐
│   clients   │       │  invoices    │       │  invoice_items   │
├─────────────┤       ├──────────────┤       ├──────────────────┤
│ id (PK)     │◄──────│ client_id    │       │ id (PK)          │
│ nombre      │       │ id (PK)      │──┐    │ invoice_id (FK)  │
│ telefono    │       │ numero       │  │    │ item_num         │
│ documento   │       │ estado       │  │    │ descripcion      │
│ direccion   │       │ sub_total    │  │    │ cantidad         │
│ email       │       │ iva_total    │  │    │ precio_unitario  │
│ ...         │       │ total_general│  │    │ iva_porcentaje   │
└─────────────┘       │ wo_id (FK)───┼──┘    │ total_linea      │
                      │ ...          │       └──────────────────┘
                      └──────────────┘
                              │
                      ┌───────┘
              ┌───────────────┐
              │ work_orders   │
              ├───────────────┤
              │ id (PK)       │
              │ cliente_nombre│
              │ estado        │
              │ presupuesto   │
              │ ...           │
              └───────────────┘
```

### Generación de Numeración

Usar la función `next_id()` existente en `app/core/db.py`:

```python
# En db.py — agregar
def next_invoice_num():
    """Genera FAC-001, FAC-002... desde SQLite"""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT MAX(CAST(SUBSTR(numero, INSTR(numero, '-') + 1) AS INTEGER)) FROM invoices"
        ).fetchone()
        max_num = row[0] if row[0] is not None else 0
        return f"FAC-{max_num + 1:04d}"
    finally:
        conn.close()
```

## 1.2 API REST — Endpoints

Todos los endpoints van en un nuevo blueprint `app/routes/api_invoices.py`.

### CRUD Principal

| Método | Ruta | Función | Auth |
|--------|------|---------|------|
| GET | `/api/facturas` | Listar facturas (filtros: `?estado=&cliente_id=&fecha_desde=&fecha_hasta=`) | ✅ |
| GET | `/api/facturas/<id>` | Detalle de una factura (con items) | ✅ |
| POST | `/api/facturas` | Crear factura | ✅ |
| PUT | `/api/facturas/<id>` | Editar factura (solo borrador) | ✅ |
| DELETE | `/api/facturas/<id>` | Anular factura | ✅ |

### Acciones Especiales

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/api/facturas/<id>/emitir` | Cambiar estado → emitida |
| POST | `/api/facturas/<id>/pagar` | Registrar pago (fecha + método) |
| POST | `/api/facturas/<id>/anular` | Anular factura |
| GET | `/api/facturas/<id>/pdf` | Obtener HTML imprimible de la factura |
| GET | `/api/facturas/<id>/enviar-whatsapp` | Enviar factura por WhatsApp al cliente |
| GET | `/api/facturas/stats` | Stats: pendientes, vencidas, total mes |

### Ejemplo: POST `/api/facturas`

```python
@api_invoices_bp.route('/api/facturas', methods=['POST'])
@login_required
def create_invoice():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    # Validaciones
    client_id = data.get('client_id')
    if not client_id:
        return jsonify({'error': 'client_id requerido'}), 400

    conn = get_db()
    try:
        numero = next_invoice_num()
        now = now_iso()
        inv_id = f"INV-{numero}"

        # Calcular totales desde los items
        items = data.get('items', [])
        sub_total = 0
        iva_total = 0

        for item in items:
            item['total_linea'] = round(
                item['cantidad'] * item['precio_unitario'] * (1 + item.get('iva_porcentaje', 19) / 100), 2
            )
            sub_total += item['cantidad'] * item['precio_unitario']
            iva_total += item['cantidad'] * item['precio_unitario'] * item.get('iva_porcentaje', 19) / 100

        descuento = float(data.get('descuento', 0))
        total_general = round(sub_total + iva_total - descuento, 2)

        conn.execute('''
            INSERT INTO invoices (id, client_id, wo_id, numero, estado,
                fecha_emision, fecha_vencimiento, sub_total, descuento,
                iva_total, total_general, notas, terminos, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'borrador', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (inv_id, client_id, data.get('wo_id'), numero,
              now, data.get('fecha_vencimiento', now[:10]),
              round(sub_total, 2), descuento, round(iva_total, 2), total_general,
              data.get('notas', ''), data.get('terminos', ''), now, now))

        # Insertar items
        for i, item in enumerate(items):
            conn.execute('''
                INSERT INTO invoice_items (invoice_id, item_num, descripcion,
                    cantidad, precio_unitario, iva_porcentaje, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (inv_id, i + 1, item['descripcion'], item['cantidad'],
                  item['precio_unitario'], item.get('iva_porcentaje', 19),
                  item['total_linea']))

        conn.commit()
        return jsonify({'id': inv_id, 'numero': numero, 'total': total_general}), 201
    finally:
        conn.close()
```

### Ejemplo: GET `/api/facturas/stats`

```python
@api_invoices_bp.route('/api/facturas/stats')
@login_required
def invoice_stats():
    conn = get_db()
    try:
        # Pendientes (emitidas pero no pagadas, no vencidas)
        pendientes = conn.execute('''
            SELECT COUNT(*) FROM invoices
            WHERE estado = 'emitida' AND activo = 1
            AND date(fecha_vencimiento) >= date('now')
        ''').fetchone()[0]

        # Vencidas (emitidas pero vencidas)
        vencidas = conn.execute('''
            SELECT COUNT(*) FROM invoices
            WHERE estado = 'emitida' AND activo = 1
            AND date(fecha_vencimiento) < date('now')
        ''').fetchone()[0]

        # Total facturado este mes
        total_mes = conn.execute('''
            SELECT COALESCE(SUM(total_general), 0) FROM invoices
            WHERE estado IN ('emitida', 'pagada')
            AND strftime('%Y-%m', fecha_emision) = strftime('%Y-%m', 'now')
        ''').fetchone()[0]

        return jsonify({
            'pendientes': pendientes,
            'vencidas': vencidas,
            'total_mes': total_mes,
            'total_pagadas': conn.execute(
                "SELECT COUNT(*) FROM invoices WHERE estado = 'pagada'"
            ).fetchone()[0]
        })
    finally:
        conn.close()
```

## 1.3 Frontend — Componentes

### 1.3.1 Sidebar (base.html)

Agregar en sidebar entre "Inventario" y "Configuración":

```html
<a class="nav-link" href="#" data-tab="facturacion">
    <i class="bi bi-receipt"></i> Facturación
    <span class="notif-badge d-none" id="factNotif">0</span>
</a>
```

### 1.3.2 Mobile Menu (base.html)

Agregar entre Inventario y Config:

```html
<a class="nav-link mobile-nav-link" href="#" data-tab="facturacion" onclick="toggleMobileMenu()">
    <i class="bi bi-receipt"></i> Facturación
</a>
```

### 1.3.3 Include (base.html)

```html
{% include 'pages/facturacion.html' %}
```

### 1.3.4 Página: `templates/pages/facturacion.html`

Estructura:
```
┌─────────────────────────────────────────────┐
│ Facturación                    [+ Nueva]     │
├─────────────────────────────────────────────┤
│ ┌─ Filtros ──────────────────────────────┐  │
│ │ Estado: [▼]  Cliente: [▼]  Desde: [ ] │  │
│ │ Hasta: [ ]  [Buscar]                   │  │
│ └────────────────────────────────────────┘  │
│ ┌─ DataTable ────────────────────────────┐  │
│ │ # │N°Fact│Cliente│Fecha│Total│Estado│▸ │  │
│ │ 1 │FAC-01│ Clien…│2/5  │$500 │✅    │ 👁│  │
│ │ 2 │FAC-02│ Clien…│2/5  │$300 │⏳    │ 👁│  │
│ └────────────────────────────────────────┘  │
│ │« 1 2 3 … »   Mostrando 1-10 de 25│        │
└─────────────────────────────────────────────┘
```

### 1.3.5 Modal de Crear/Editar Factura

Estructura del modal (modal-lg):

```
┌──────────────────────────────────────┐
│ [X] Nueva Factura                     │
├──────────────────────────────────────┤
│ Cliente:       [▼ Seleccionar...]     │
│ O.T. (opc):    [▼ Ninguna...]        │
│ Fecha Emisión: [2026-05-26]           │
│ Fecha Venc.:   [2026-06-25]           │
├──────────────────────────────────────┤
│ ── Items ──── [+ Agregar Item] ──    │
│ # │ Descripción  │ Cant │ Vr.Unit│IVA│
│ 1 │ Bobinado …   │   1   │ 120000 │19%│
│ 2 │ Cambio …     │   1   │ 85000  │19%│
├──────────────────────────────────────┤
│ Subtotal:              $205,000       │
│ Descuento:    [0]                     │
│ IVA Total:             $38,950        │
│ **TOTAL:**             **$243,950**    │
├──────────────────────────────────────┤
│ Notas: [___________________________]  │
│ Términos: [________________________]  │
├──────────────────────────────────────┤
│ [Cancelar]               [Guardar]    │
└──────────────────────────────────────┘
```

### 1.3.6 Modal de Ver/Imprimir Factura

```
┌──────────────────────────────────────┐
│ [X] FAC-0001 — Cliente         [Imprimir] [WhatsApp] [Pagar] [Anular]
├──────────────────────────────────────┤
│ ┌─ Vista Previa de Factura ───────┐  │
│ │ (iframe con la plantilla HTML)  │  │
│ └─────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 1.3.7 Dashboard — Widget de Facturación

En `pages/dashboard.html`, entre los widgets existentes, agregar:

```html
<div class="col-md-4">
  <div class="dash-card">
    <div class="dash-icon" style="background: rgba(25,135,84,0.15);">
      <i class="bi bi-receipt" style="color: #198754;"></i>
    </div>
    <div>
      <div class="dash-value" id="dashFactPendientes">0</div>
      <div class="dash-label">Facturas Pendientes</div>
    </div>
  </div>
</div>
<div class="col-md-4">
  <div class="dash-card">
    <div class="dash-icon" style="background: rgba(220,53,69,0.15);">
      <i class="bi bi-exclamation-triangle" style="color: #dc3545;"></i>
    </div>
    <div>
      <div class="dash-value" id="dashFactVencidas">0</div>
      <div class="dash-label">Facturas Vencidas</div>
    </div>
  </div>
</div>
<div class="col-md-4">
  <div class="dash-card">
    <div class="dash-icon" style="background: rgba(13,110,253,0.15);">
      <i class="bi bi-currency-dollar" style="color: #0d6efd;"></i>
    </div>
    <div>
      <div class="dash-value" id="dashFactTotalMes">$0</div>
      <div class="dash-label">Facturado este Mes</div>
    </div>
  </div>
</div>
```

### 1.3.8 Funciones JS Requeridas (en `crm.js`)

| Función | Propósito |
|---------|-----------|
| `loadFacturas()` | Carga lista + inicializa DataTable |
| `renderFacturasDT()` | Renderiza DataTable de facturas |
| `loadFacturasStats()` | Stats para dashboard |
| `showFacturaModal(id?)` | Modal crear/editar |
| `saveFactura()` | Guardar (POST/PUT) |
| `showFacturaDetail(id)` | Modal detalle con vista previa |
| `emitirFactura(id)` | Cambiar a emitida |
| `pagarFactura(id)` | Registrar pago |
| `anularFactura(id)` | Anular factura |
| `imprimirFactura(id)` | Abrir vista impresión |
| `enviarFacturaWhatsApp(id)` | Enviar por WhatsApp |
| `getFacturaHTML(id, callback)` | Obtener HTML de plantilla |
| `toggleFactTab(tab)` | Cambiar entre tabs |
| `filterFacturasDT()` | Filtrar DataTable |

## 1.4 Flujo de Navegación

### Ciclo de Vida de una Factura

```
NUEVA              EMITIDA              PAGADA
  │                    │                    │
  │ (crear borrador)   │ (enviar al         │
  │   con datos e      │  cliente por       │
  │   items)           │  WhatsApp/PDF)     │
  ▼                    ▼                    ▼
┌────────┐   ┌──────────────┐    ┌──────────────┐
│BORRADOR │──▶│   EMITIDA    │───▶│   PAGADA     │
└────────┘   └──────┬───────┘    └──────────────┘
                    │                    ▲
                    │ (no pagó a       │
                    │  tiempo)          │ (pago tardío
                    ▼                   │  pero aceptado)
               ┌──────────┐            │
               │ VENCIDA  │────────────┘
               └──────────┘
                    │
                    ▼
              ┌──────────┐
              │ ANULADA  │
              └──────────┘
```

### Flujo de Pantallas

```
[Sidebar: Facturación]
       │
       ▼
[DataTable: Lista de Facturas]
       │
       ├── [+ Nueva] ──────────────────────▶ [Modal: Crear Factura]
       │                                         │
       │                                    [Llenar datos + items]
       │                                    [Guardar → BORRADOR]
       │                                         │
       ├── [👁 Ver] ────────────────────────▶ [Modal: Detalle + Vista Previa]
       │                                         │
       │                                    [Imprimir] [WhatsApp] [Pagar] [Anular]
       │
       ├── [✏ Editar] ── (solo borrador) ──▶ [Modal: Editar Factura]
       │
       └── [🗑 Eliminar] (solo borrador) ───▶ Confirmación → Anular
```

## 1.5 Archivos a Modificar/Crear

### Nuevos Archivos

| Archivo | Descripción | Líneas estimadas |
|---------|-------------|------------------|
| `crm/app/routes/api_invoices.py` | Blueprint con endpoints CRUD + acciones | ~350 |
| `crm/templates/pages/facturacion.html` | Página de listado + tabs | ~280 |
| `crm/templates/pages/factura_template.html` | Plantilla HTML imprimible de la factura | ~200 |

### Archivos a Modificar

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `crm/app/core/db.py` | Agregar `next_invoice_num()`, migración de tablas `invoices` e `invoice_items` | +20 |
| `crm/app/__init__.py` | Importar y registrar `api_invoices_bp` en `init_db()` | +10 |
| `crm/templates/base.html` | Agregar nav link (sidebar + mobile) + include de `facturacion.html` | +6 |
| `crm/static/js/crm.js` | Agregar funciones de facturación (load, render, modal, acciones) | +350 |
| `crm/static/css/crm.css` | Estilos para tabla y modal de facturación | +80 |
| `crm/templates/pages/dashboard.html` | Widgets de facturación (3 cards) | +30 |

### Total Estimado

| Concepto | Archivos | Líneas |
|----------|----------|--------|
| **Nuevos** | 3 | ~830 |
| **Modificados** | 6 | ~496 |
| **Total** | **9** | **~1,326** |

## 1.6 Reglas y Buenas Prácticas

1. **Misma arquitectura existente**: Blueprints Flask con `@login_required`, `get_db()`, `now_iso()`
2. **Mismas convenciones JS**: `fetchJSON()`, `escHtml()`, `toastMsg()`, `showLoading()`/`hideLoading()`
3. **DataTable**: usar `initDT()` con los mismos parámetros que las otras tablas
4. **SQLite**: usar WAL mode, foreign_keys ON, transacciones con `try/finally conn.close()`
5. **Estados**: validar transiciones válidas (borrador→emitida, emitida→pagada/vencida, cualquier→anulada)
6. **No editar emitidas**: solo borradores se pueden editar
7. **Cálculos en backend**: los totales se calculan siempre en el backend, el frontend solo muestra preview
8. **Caché busters**: usar `?v=N` incremental en CSS/JS

---

# PLAN 2: Plantilla de Factura — Diseño Visual

> **Estilo:** Elegante · Contemporáneo · Dinámico
> **Inspiración:** Diseño editorial moderno, tipografía limpia, espacios generosos, acentos azul cian sobre fondo blanco puro.

## 2.1 Sistema de Diseño

### Paleta de Color

| Rol | Color | Uso |
|-----|-------|-----|
| **Primario** | `#059BDA` | Logo, acentos, total, líneas divisorias decorativas |
| **Primario oscuro** | `#038BC5` | Hover states, gradientes |
| **Fondo** | `#ffffff` | Cuerpo del documento |
| **Fondo alt** | `#fafaf9` | Cards, filas alternas de tabla |
| **Texto principal** | `#18181b` | Encabezados, datos importantes |
| **Texto secundario** | `#71717a` | Labels, metadata, notas |
| **Texto terciario** | `#a1a1aa` | Información menor |
| **Borde sutil** | `#e4e4e7` | Separadores, bordes de tabla |
| **Éxito** | `#059669` | Badge PAGADA |
| **Warning** | `#d97706` | Badge PENDIENTE |
| **Error** | `#dc2626` | Badge VENCIDA / ANULADA |

### Tipografía

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

Jerarquía:
- **H1/H2** (N° factura, total general): `800` weight, `28-32px`
- **H3** (nombres empresa/cliente): `700` weight, `16-18px`
- **Labels**: `600` weight, `9px`, `uppercase`, `letter-spacing: 0.12em`
- **Body**: `400` weight, `13px`
- **Tabla datos**: `500` weight, `12-13px`
- **Notas**: `300` weight, `11px`

### Espaciado

- Márgenes del documento: `56px` (web) / `18mm` (print)
- Gutter entre columnas: `48px`
- Gap vertical entre secciones: `40px`
- Padding interno de cards: `28px`

## 2.2 Estructura de la Plantilla

Archivo: `crm/templates/pages/factura_template.html`

Es un template Jinja2 renderizado desde el endpoint `/api/facturas/<id>/pdf`.

### Layout General — Diseño Editorial

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║  ┌─────────────────────────┐    ┌────────────────────────────┐  ║
║  │                         │    │                    FAC-    │  ║
║  │    [LOGO HTK]           │    │                     0001   │  ║
║  │    120×120px            │    │                            │  ║
║  │                         │    │  N° de Factura             │  ║
║  └─────────────────────────┘    └────────────────────────────┘  ║
║                                                                  ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │  HOUSETRONIK S.A.S.                                       │  ║
║  │  NIT 901.XXX.XXX-X                                        │  ║
║  │  Cr XX #XX-XX · Barranquilla · Colombia                   │  ║
║  │  info@htk-ingenieria.com  ·  +57 315 603 2940             │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                  ║
║  ════════════════════════════════════════════════════════════    ║
║  (línea decorativa gradiente azul → transparente, 3px alto)   ║
║                                                                  ║
║  ┌──────────────────────┐  ┌──────────────────────────────────┐  ║
║  │  FACTURAR A           │  │  DATOS DE LA FACTURA             │  ║
║  │                      │  │                                  │  ║
║  │  Carlos Méndez Gómez │  │  Emisión    26 de mayo, 2026    │  ║
║  │  CC 72.345.678       │  │  Vencimiento  25 de junio, 2026  │  ║
║  │  Cl 45 #23-12 Apto 3 │  │  Estado     ● PAGADA            │  ║
║  │  Barranquilla        │  │  O.T.       HTK-001             │  ║
║  │  +57 300 123 4567    │  │                                  │  ║
║  └──────────────────────┘  └──────────────────────────────────┘  ║
║                                                                  ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │  DETALLE DE SERVICIOS                                      │  ║
║  │  ┌───┬──────────────────────────┬──────┬──────────┬──────┐ │  ║
║  │  │ # │ Descripción              │ Cant │ Vr. Unit │ Total│ │  ║
║  │  ├───┼──────────────────────────┼──────┼──────────┼──────┤ │  ║
║  │  │ 01│ Bobinado completo motor  │   1  │  $120K   │$143K │ │  ║
║  │  │   │ trifásico 5HP — incluye  │      │          │      │ │  ║
║  │  │   │ alambre esmaltado +      │      │          │      │ │  ║
║  │  │   │ barniz aislante          │      │          │      │ │  ║
║  │  ├───┼──────────────────────────┼──────┼──────────┼──────┤ │  ║
║  │  │ 02│ Cambio de rodamientos    │   1  │   $85K   │$101K │ │  ║
║  │  │   │ SKF 6205-2RS             │      │          │      │ │  ║
║  │  └───┴──────────────────────────┴──────┴──────────┴──────┘ │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                  ║
║  ┌───────────────────────────────┐ ┌───────────────────────────┐  ║
║  │                               │ │  Subtotal      $205,000  │  ║
║  │  NOTAS                        │ │  IVA 19%        $38,950 │  ║
║  │  • Equipo en taller. Entrega  │ │                           │  ║
║  │    inmediata contra pago.     │ │  ──────────────────────── │  ║
║  │  • Garantía: 3 meses en mano  │ │  TOTAL       **$243,950**│  ║
║  │    de obra.                   │ │                           │  ║
║  │  • Repuestos con garantía del │ │  ████████████████████████ │  ║
║  │    fabricante.                │ │  (barra decorativa azul)│  ║
║  └───────────────────────────────┘ └───────────────────────────┘  ║
║                                                                  ║
║  ════════════════════════════════════════════════════════════    ║
║  (línea sutil separator)                                         ║
║                                                                  ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │  💳  PAGO                                                  │  ║
║  │  Transferencia Bancolombia 000-XXXXX-X · Efectivo ·        │  ║
║  │  Datafono                                                    │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                  ║
║                          ⚡ HTK INGENIERIA                        ║
║                Soluciones que mueven tu industria                 ║
║          HOUSETRONIK S.A.S. · Barranquilla · Colombia             ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### Características Dinámicas (solo pantalla)

1. **Número de factura con micro-animación**: al cargar, el número aparece con un sutil fade-in + slide-up (300ms ease-out)
2. **Barra decorativa gradiente**: línea horizontal con gradiente `#059BDA → transparent` que separa header del contenido
3. **Filas de tabla con hover**: en pantalla, las filas de la tabla tienen un sutil `background: #fff7ed` al pasar el mouse + transición 150ms
4. **Badge de estado animado**: dot pulsante (`@keyframes pulse`) solo en estado PENDIENTE o VENCIDA
5. **Total con peso visual**: tipografía bold 800, color azul, subrayado decorativo con barra gradiente
6. **Bordes redondeados suaves**: cards con `border-radius: 16px`, tabla con `border-radius: 12px`
7. **Sombra sutil en cards**: `box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)`
8. **Separadores decorativos**: línea doble fina entre secciones (1px + 1px con gap 2px)

## 2.3 Datos Dinámicos

### Endpoint `/api/facturas/<id>/pdf`

```python
@api_invoices_bp.route('/api/facturas/<inv_id>/pdf')
@login_required
def invoice_pdf(inv_id):
    conn = get_db()
    try:
        inv = conn.execute(
            "SELECT * FROM invoices WHERE id = ?", (inv_id,)
        ).fetchone()
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404

        items = conn.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_num",
            (inv_id,)
        ).fetchall()

        client = conn.execute(
            "SELECT * FROM clients WHERE id = ?", (inv['client_id'],)
        ).fetchone()

        return render_template('pages/factura_template.html',
            invoice=dict(inv),
            items=[dict(i) for i in items],
            client=dict(client) if client else None,
            empresa={
                'nombre': 'HOUSETRONIK S.A.S.',
                'comercial': 'HTK INGENIERIA',
                'nit': '901.XXX.XXX-X',
                'direccion': 'Cra XX #XX-XX, Barranquilla',
                'telefono': '+57 315 603 2940',
                'email': 'info@htk-ingenieria.com',
                'logo_url': '/static/img/logo_htk.png'
            }
        )
    finally:
        conn.close()
```

### Parámetros de la Plantilla

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `empresa.logo_url` | string | Ruta al logo |
| `empresa.nombre` | string | Razón social |
| `empresa.comercial` | string | Nombre comercial |
| `empresa.nit` | string | NIT de la empresa |
| `empresa.direccion` | string | Dirección |
| `empresa.telefono` | string | Teléfono |
| `empresa.email` | string | Email |
| `invoice.numero` | string | FAC-XXXX |
| `invoice.fecha_emision` | string | Fecha ISO |
| `invoice.fecha_vencimiento` | string | Fecha vencimiento |
| `invoice.estado` | string | Estado actual |
| `invoice.sub_total` | float | Subtotal |
| `invoice.descuento` | float | Descuento aplicado |
| `invoice.iva_total` | float | Total IVA |
| `invoice.total_general` | float | Total general |
| `invoice.notas` | string | Notas de la factura |
| `invoice.terminos` | string | Términos y condiciones |
| `invoice.wo_id` | string | OT relacionada |
| `client.nombre` | string | Nombre del cliente |
| `client.documento` | string | NIT/CC |
| `client.direccion` | string | Dirección del cliente |
| `client.telefono` | string | Teléfono del cliente |
| `items[]` | list | Lista de items (ver abajo) |
| `item.item_num` | int | Número de línea |
| `item.descripcion` | string | Descripción |
| `item.cantidad` | real | Cantidad |
| `item.precio_unitario` | real | Vr. unitario |
| `item.iva_porcentaje` | real | % IVA |
| `item.total_linea` | real | Total de la línea |

## 2.4 Estilos y Media Print

### CSS Completo (en `<style>` dentro del template)

```css
/* ═══════════════════════════════════════════════════════════════
   HTK INGENIERIA — Plantilla de Factura
   Estilo: Elegante · Contemporáneo · Editorial
   ═══════════════════════════════════════════════════════════════ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
  --htk-blue:  #059BDA;
  --htk-blue-dark: #038BC5;
  --bg-primary:  #ffffff;
  --bg-subtle:   #fafaf9;
  --bg-hover:    #fff7ed;
  --text-primary:   #18181b;
  --text-secondary: #71717a;
  --text-tertiary:  #a1a1aa;
  --border-subtle:  #e4e4e7;
  --border-decorative: #059BDA;
  --success:     #059669;
  --warning:     #d97706;
  --danger:      #dc2626;
  --shadow-sm:   0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:   0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-lg:   0 4px 12px rgba(0,0,0,0.08);
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --transition:  150ms ease;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
  padding: 56px;
  -webkit-font-smoothing: antialiased;
  max-width: 900px;
  margin: 0 auto;
}

/* ─── Keyframes ─── */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes pulseDot {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}

/* ─── Header ─── */
.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 48px;
}

.inv-header-logo img {
  width: 120px;
  height: auto;
}

.inv-header-num {
  text-align: right;
}

.inv-header-num .inv-num-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.inv-header-num .inv-num-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--htk-blue);
  line-height: 1;
  animation: fadeSlideUp 400ms ease-out;
}

/* ─── Empresa Info ─── */
.inv-empresa {
  margin-bottom: 28px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.inv-empresa .empresa-nombre {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

/* ─── Línea Decorativa ─── */
.inv-divider {
  height: 3px;
  background: linear-gradient(90deg, var(--border-decorative) 0%, var(--border-decorative) 30%, rgba(5,155,218,0.1) 70%, transparent 100%);
  border: none;
  border-radius: 1.5px;
  margin: 28px 0 36px;
}

/* ─── Grid 2 columnas: Cliente | Detalles ─── */
.inv-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  margin-bottom: 40px;
}

.inv-card {
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 28px;
  box-shadow: var(--shadow-sm);
}

.inv-card-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-bottom: 16px;
}

.inv-card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inv-card-body .cliente-nombre {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.inv-card-body .cliente-doc,
.inv-card-body .cliente-dir,
.inv-card-body .cliente-tel {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
}

.inv-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
}

.inv-info-row .info-label {
  font-weight: 500;
  color: var(--text-secondary);
}

.inv-info-row .info-value {
  font-weight: 600;
  color: var(--text-primary);
}

/* ─── Badge de Estado ─── */
.inv-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 20px;
}

.inv-badge .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.inv-badge.pagada     { color: var(--success); background: rgba(5,150,105,0.1); }
.inv-badge.emitida    { color: var(--warning); background: rgba(217,119,6,0.1); }
.inv-badge.pendiente  { color: var(--warning); background: rgba(217,119,6,0.1); }
.inv-badge.pendiente .dot,
.inv-badge.emitida .dot  { animation: pulseDot 2s infinite; }
.inv-badge.vencida    { color: var(--danger);  background: rgba(220,38,38,0.1); }
.inv-badge.borrador   { color: var(--text-tertiary); background: rgba(161,161,170,0.1); }
.inv-badge.anulada    { color: var(--text-tertiary); background: rgba(161,161,170,0.1); text-decoration: line-through; }

/* ─── Tabla de Items ─── */
.inv-items-section {
  margin-bottom: 36px;
}

.inv-items-section .section-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-bottom: 16px;
}

.inv-table-wrapper {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.inv-table {
  width: 100%;
  border-collapse: collapse;
}

.inv-table thead th {
  padding: 14px 16px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  background: var(--bg-subtle);
  border-bottom: 2px solid var(--border-subtle);
  text-align: right;
}

.inv-table thead th:first-child { text-align: center; width: 44px; }
.inv-table thead th:nth-child(2) { text-align: left; }

.inv-table tbody td {
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  text-align: right;
  transition: background var(--transition);
}

.inv-table tbody td:first-child {
  text-align: center;
  font-weight: 600;
  color: var(--text-tertiary);
  width: 44px;
}

.inv-table tbody td:nth-child(2) {
  text-align: left;
  font-weight: 600;
}

.inv-table tbody td.item-desc-detail {
  display: block;
  font-weight: 400;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.inv-table tbody tr:hover {
  background: var(--bg-hover);
}

.inv-table tbody tr:last-child td {
  border-bottom: none;
}

.inv-table tbody tr:nth-child(even) {
  background: var(--bg-subtle);
}

.inv-table tbody tr:nth-child(even):hover {
  background: var(--bg-hover);
}

/* ─── Totales ─── */
.inv-totals-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 48px;
  margin-bottom: 36px;
}

.inv-notes {
  flex: 1;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 24px;
}

.inv-notes .notes-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.inv-notes p {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  line-height: 1.8;
  white-space: pre-line;
}

.inv-summary {
  width: 280px;
}

.inv-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
}

.inv-summary-row .sum-label {
  font-weight: 500;
  color: var(--text-secondary);
}

.inv-summary-row .sum-value {
  font-weight: 600;
  color: var(--text-primary);
}

.inv-summary-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 12px 0;
}

.inv-summary-total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-top: 12px;
}

.inv-summary-total .total-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.inv-summary-total .total-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--htk-blue);
  line-height: 1.1;
}

.inv-summary-total .total-bar {
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, transparent 0%, rgba(5,155,218,0.2) 20%, var(--htk-blue) 100%);
  border-radius: 2px;
  margin-top: 8px;
}

/* ─── Footer Divider ─── */
.inv-footer-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 36px 0 28px;
  position: relative;
}

.inv-footer-divider::after {
  content: '';
  position: absolute;
  top: -1.5px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 3px;
  background: var(--htk-blue);
  border-radius: 1.5px;
}

/* ─── Pago ─── */
.inv-pago {
  text-align: center;
  margin-bottom: 36px;
  padding: 20px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.inv-pago .pago-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.inv-pago .pago-info {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* ─── Footer ─── */
.inv-footer {
  text-align: center;
}

.inv-footer .footer-brand {
  font-size: 14px;
  font-weight: 700;
  color: var(--htk-blue);
  letter-spacing: -0.02em;
}

.inv-footer .footer-tagline {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-tertiary);
  margin: 6px 0 4px;
}

.inv-footer .footer-legal {
  font-size: 10px;
  font-weight: 300;
  color: var(--text-tertiary);
  letter-spacing: 0.02em;
}

/* ═══════════════════════════════════════════════════════════════
   MEDIA PRINT — Optimizado para impresión en papel
   ═══════════════════════════════════════════════════════════════ */

@media print {
  @page {
    size: A4;
    margin: 18mm 16mm;
  }

  body {
    padding: 0;
    font-size: 11px;
    max-width: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .inv-header { margin-bottom: 32px; }
  .inv-header-num .inv-num-value { animation: none; font-size: 26px; }

  .inv-divider {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .inv-card {
    box-shadow: none;
    background: var(--bg-subtle) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .inv-table thead th {
    background: var(--bg-subtle) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .inv-table tbody tr:hover { background: none; }
  .inv-table tbody tr:nth-child(even) {
    background: var(--bg-subtle) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .inv-summary-total .total-value,
  .inv-summary-total .total-bar,
  .inv-footer .footer-brand,
  .inv-footer-divider::after,
  .inv-divider,
  .inv-badge {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .inv-badge .dot { animation: none; }

  .inv-meta, .inv-totals-row, .inv-items-section, .inv-pago {
    page-break-inside: avoid;
  }
}

/* ═══════════════════════════════════════════════════════════════
   RESPONSIVE — Móvil / Tablet
   ═══════════════════════════════════════════════════════════════ */

@media (max-width: 768px) {
  body {
    padding: 24px;
    font-size: 12px;
  }

  .inv-header {
    flex-direction: column;
    gap: 20px;
    align-items: flex-start;
  }

  .inv-header-num { text-align: left; }
  .inv-header-num .inv-num-value { font-size: 26px; }

  .inv-meta {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .inv-totals-row {
    flex-direction: column;
    gap: 20px;
  }

  .inv-summary { width: 100%; }

  .inv-table thead th,
  .inv-table tbody td {
    padding: 10px 8px;
    font-size: 11px;
  }

  .inv-card { padding: 20px; }
}
```

## 2.5 Integración con el Sistema

### Vista Previa en el CRM

El modal de detalle de factura carga la plantilla en un iframe:

```javascript
function showFacturaDetail(id) {
    showLoading('factLoading', 'factContent');
    openModal(
        'facturaModal',
        `FAC-${id} — Detalle`,
        `<div class="row mb-3">
            <div class="col-12 d-flex gap-2 mb-2">
                <button class="btn btn-sm btn-outline-warning" onclick="imprimirFactura('${id}')">
                    <i class="bi bi-printer"></i> Imprimir
                </button>
                <button class="btn btn-sm btn-outline-success" onclick="enviarFacturaWhatsApp('${id}')">
                    <i class="bi bi-whatsapp"></i> WhatsApp
                </button>
                <button class="btn btn-sm btn-outline-primary" onclick="emitirFactura('${id}')">
                    <i class="bi bi-check2"></i> Emitir
                </button>
                <button class="btn btn-sm btn-outline-success" onclick="pagarFactura('${id}')">
                    <i class="bi bi-currency-dollar"></i> Pagar
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="anularFactura('${id}')">
                    <i class="bi bi-x-circle"></i> Anular
                </button>
            </div>
            <div class="col-12">
                <iframe id="facturaPreview" style="width:100%;height:600px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:#fff;"
                    srcdoc="<p style='text-align:center;padding:40px;color:#999;'>Cargando factura...</p>">
                </iframe>
            </div>
        </div>`,
        null
    );

    // Cargar HTML en el iframe
    fetch(`/api/facturas/${id}/pdf`)
        .then(r => r.text())
        .then(html => {
            document.getElementById('facturaPreview').srcdoc = html;
        });
}
```

### Impresión

```javascript
function imprimirFactura(id) {
    // Abrir en nueva ventana para impresión
    const w = window.open('', '_blank');
    w.document.write('<html><head><title>Factura</title></head><body>');
    w.document.write('<p style="text-align:center;padding:20px;color:#666;">Cargando...</p>');
    w.document.write('</body></html>');

    fetch(`/api/facturas/${id}/pdf`)
        .then(r => r.text())
        .then(html => {
            w.document.write(html);
            w.document.close();
            setTimeout(() => { w.print(); }, 500);
        });
}
```

### Envío por WhatsApp

```javascript
function enviarFacturaWhatsApp(id) {
    // Obtener HTML y enviar como mensaje via bot
    fetch(`/api/facturas/${id}/pdf`)
        .then(r => r.text())
        .then(html => {
            // Opción 1: Link al CRM (recomendado)
            fetch(`/api/facturas/${id}/enviar-whatsapp`, { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    if (data.ok) toastMsg('Factura enviada por WhatsApp ✅', 'success');
                    else toastMsg('Error al enviar: ' + (data.error || ''), 'error');
                });
        });
}
```

### Endpoint de Envío WhatsApp

```python
@api_invoices_bp.route('/api/facturas/<inv_id>/enviar-whatsapp', methods=['POST'])
@login_required
def send_invoice_whatsapp(inv_id):
    conn = get_db()
    try:
        inv = dict(conn.execute(
            "SELECT * FROM invoices WHERE id = ?", (inv_id,)
        ).fetchone())
        if not inv:
            return jsonify({'error': 'Factura no encontrada'}), 404

        client = dict(conn.execute(
            "SELECT * FROM clients WHERE id = ?", (inv['client_id'],)
        ).fetchone())
        if not client:
            return jsonify({'error': 'Cliente no encontrado'}), 404

        telefono = client.get('telefono')
        if not telefono:
            return jsonify({'error': 'Cliente sin teléfono'}), 400

        # Construir mensaje
        mensaje = (
            f"⚡ *HTK INGENIERIA* — Factura {inv['numero']}\n\n"
            f"Cliente: {client.get('nombre', '')}\n"
            f"Total: ${inv['total_general']:,.0f}\n"
            f"Vence: {inv['fecha_vencimiento']}\n\n"
            f"Puedes ver tu factura aquí:\n"
            f"https://dev.htk-ingenieria.com/factura/{inv['id']}\n\n"
            f"Gracias por confiar en nosotros ⚡"
        )

        # Usar servicio de bot existente
        from app.services.bot_service import send_whatsapp
        result = send_whatsapp(telefono, mensaje)

        return jsonify({'ok': result.get('ok', False)})
    finally:
        conn.close()
```

---

## 📐 Resumen de Implementación

### Orden de Implementación Sugerido

| Fase | Descripción | Archivos | Depende de |
|------|-------------|----------|------------|
| **Fase 1** | Migración DB + Blueprint API | `db.py`, `__init__.py`, `api_invoices.py` | — |
| **Fase 2** | Plantilla de factura HTML | `factura_template.html` | Fase 1 |
| **Fase 3** | Frontend — Página + DataTable | `facturacion.html`, `crm.js`, `base.html` | Fases 1-2 |
| **Fase 4** | Modal crear/editar + items dinámicos | `crm.js`, `facturacion.html` | Fase 3 |
| **Fase 5** | Acciones: emitir, pagar, anular | `api_invoices.py`, `crm.js` | Fases 1-4 |
| **Fase 6** | Vista previa, impresión, WhatsApp | `factura_template.html`, `crm.js`, `api_invoices.py`, `bot_service.py` | Fases 1-5 |
| **Fase 7** | Dashboard widgets + notificaciones | `dashboard.html`, `crm.js`, `api_invoices.py` | Fases 1-5 |
| **Fase 8** | Logo empresa + pulido visual | `factura_template.html`, `crm.css` | Fase 2 |

### Pruebas Sugeridas

- ✅ Crear factura con 1 item → verificar cálculo correcto
- ✅ Crear factura con múltiples items → verificar subtotal, IVA, total
- ✅ Editar factura en borrador → verificar que los cambios persistan
- ✅ Emitir factura → verificar que no se pueda editar después
- ✅ Pagar factura → estado cambia a pagada
- ✅ Anular factura desde cualquier estado
- ✅ Vista previa en iframe → se renderiza correctamente
- ✅ Impresión → sin header/footer del CRM, con márgenes correctos
- ✅ WhatsApp → mensaje enviado con datos correctos
- ✅ Dashboard → widgets actualizados
- ✅ DataTable → filtros funcionando
- ✅ Vencimiento automático → lógica de estados
- ✅ Logo → se muestra correctamente en la plantilla

---

*Fin del documento. Ambos planes están diseñados para implementación secuencial. La plantilla (Plan 2) depende del Plan 1 para recibir los datos, pero puede desarrollarse de forma independiente.*
