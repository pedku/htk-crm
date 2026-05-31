# HTK CRM — Roadmap de Mejoras v5

> Rama: `main` | Fecha: 2026-05-31 | Basado en v4 + mejoras de detalle, herramientas y funcionalidad

---

## Evaluación de Madurez Actual

| Área | Madurez | Comentario |
|------|---------|------------|
| Leads & CRM | ⭐⭐⭐⭐ | Kanban, scoring, pitches, enriquecimiento |
| Clientes | ⭐⭐⭐⭐ | Ficha completa, historial, timeline |
| Órdenes de Trabajo | ⭐⭐⭐⭐ | Tipos dinámicos, finanzas, notificaciones |
| Facturación | ⭐⭐⭐⭐ | IVA, PDF, Drive, WhatsApp |
| Inventario | ⭐⭐⭐ | Básico, falta stock tracking y alertas |
| Dashboard | ⭐⭐⭐ | KPIs funcionales, falta módulo financiero |
| Automatización | ⭐⭐⭐ | Scripts autónomos, sin orquestación central |
| Testing | ⭐ | Cero tests automatizados |
| DevOps | ⭐⭐ | systemd + cron, sin CI/CD |
| Seguridad | ⭐⭐ | Login básico, sin roles, sin 2FA |

**Puntaje: 28/50 — Sistema funcional y robusto en el core, con deuda técnica en calidad y operaciones.**

**Meta v5: llegar a 40/50 al finalizar F1–F4.**

---

## Principios de Ingeniería para esta Etapa

1. **No romper lo que funciona.** Cada mejora se hace en `dev` y se mergea a `main` validada. PR obligatorio, nunca push directo a `main`.
2. **Tests ANTES de refactorizar.** Si algo no tiene tests, no se toca. Si se toca, se testea. Cobertura mínima objetivo: 70% en rutas críticas.
3. **Documentar decisiones.** Cada cambio de arquitectura → ADR en `docs/adr/YYYY-MM-DD-titulo.md`.
4. **Migraciones forward-only.** Nunca modificar la DB hacia atrás. Solo agregar columnas/tablas. Usar scripts `migrations/YYYYMMDD_descripcion.sql`.
5. **Observabilidad primero.** Logging estructurado antes que nuevos features complejos. Si no puedes verlo, no puedes arreglarlo.
6. **Una cosa a la vez.** Cada ítem del roadmap = una rama `feature/nombre`, un PR, una revisión, un merge.

---

## FASE 1 — Fundación de Calidad (Semanas 1–2)

> 🎯 Objetivo: Base sólida antes de agregar features. Cero regresiones al avanzar.

---

### 1.1 — Test Suite de Integración

**Qué:** Tests de integración para los endpoints críticos. Prioridad sobre unit tests excesivos.

**Por qué ahora:** El sistema corre en producción. Cualquier cambio futuro debe poder verificarse en segundos, no en horas de pruebas manuales.

**Dependencias:**
```bash
pip install pytest pytest-flask pytest-cov
```

**Estructura de archivos:**
```
tests/
├── conftest.py              # Fixtures globales
├── test_api_leads.py        # CRUD leads, filtros, scoring, kanban
├── test_api_invoices.py     # Crear factura, IVA incluido/discriminado, pagar, anular, PDF
├── test_api_wo.py           # CRUD OT, cambio de estado, finanzas, fotos
└── test_api_clients.py      # CRUD clientes, timeline, historial
```

**conftest.py completo:**
```python
# tests/conftest.py
import pytest
from app import create_app
import sqlite3, os

@pytest.fixture(scope="session")
def app():
    app = create_app({"TESTING": True, "DATABASE": ":memory:"})
    with app.app_context():
        # Crea esquema en DB en memoria
        db = get_db()
        with open("schema.sql") as f:
            db.executescript(f.read())
    yield app

@pytest.fixture()
def client(app):
    """Cliente HTTP ya autenticado para pruebas."""
    c = app.test_client()
    # Login programático
    c.post("/auth/login", json={"user": "admin", "password": "test"})
    return c
```

**Ejemplos de tests críticos:**
```python
# tests/test_api_invoices.py

def test_create_invoice_iva_incluido(client):
    """IVA incluido: total NO debe duplicar el IVA."""
    resp = client.post('/api/facturas', json={
        'client_id': 'CLI-001',
        'items': [{'descripcion': 'Servicio A', 'cantidad': 1,
                   'precio_unitario': 119000, 'iva_porcentaje': 19,
                   'iva_incluido': 1}]
    })
    data = resp.get_json()
    assert resp.status_code == 201
    assert data['total_general'] == 119000   # No 141,610
    assert data['iva_total'] == 19000        # IVA extraído correctamente
    assert data['subtotal'] == 100000

def test_invoice_payment_marks_as_paid(client):
    """Pagar una factura cambia estado a 'pagada'."""
    # Crear
    fac = client.post('/api/facturas', json={...}).get_json()
    fac_id = fac['id']
    # Pagar
    resp = client.post(f'/api/facturas/{fac_id}/pagar', json={'metodo': 'efectivo'})
    assert resp.status_code == 200
    assert resp.get_json()['estado'] == 'pagada'

def test_invoice_pdf_generates(client):
    """PDF de factura se genera sin error."""
    fac = client.post('/api/facturas', json={...}).get_json()
    resp = client.get(f'/api/facturas/{fac["id"]}/pdf')
    assert resp.status_code == 200
    assert resp.content_type == 'application/pdf'
```

**Correr tests + cobertura:**
```bash
pytest tests/ -v --cov=app --cov-report=term-missing
# Meta: >70% en app/api_invoices.py, app/api_leads.py, app/api_wo.py
```

**Tiempo estimado:** 5–7 horas

---

### 1.2 — Logging Estructurado

**Qué:** Reemplazar todos los `print()` dispersos con `logging` estructurado con niveles, rotación y contexto de request.

**Por qué:** Los errores en producción hoy son invisibles. Con logging podemos rastrear exactamente cuándo falla la generación de PDF, el envío de WhatsApp o el cálculo de IVA.

**Implementación completa:**
```python
# app/logging_config.py
import logging
from logging.handlers import RotatingFileHandler
import os

LOG_FORMAT = '%(asctime)s [%(levelname)s] %(name)s [%(funcName)s:%(lineno)d]: %(message)s'
LOG_FILE = os.environ.get('LOG_FILE', 'crm.log')

def setup_logging(app):
    # Handler de archivo con rotación (5MB × 3 archivos = 15MB máximo)
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    file_handler.setLevel(logging.INFO)

    # Handler de consola para desarrollo
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    console_handler.setLevel(logging.DEBUG if app.debug else logging.WARNING)

    app.logger.addHandler(file_handler)
    app.logger.addHandler(console_handler)
    app.logger.setLevel(logging.DEBUG if app.debug else logging.INFO)

    # Log cada request completado
    @app.after_request
    def log_request(response):
        if not request.path.startswith('/static'):
            app.logger.info(
                f'{request.method} {request.path} → {response.status_code}'
            )
        return response
```

**Uso en módulos:**
```python
# En api_invoices.py, api_wo.py, api_leads.py
import logging
logger = logging.getLogger(__name__)

def create_invoice():
    logger.info(f"Creando factura para client_id={request.json.get('client_id')}")
    try:
        # ... lógica ...
        logger.info(f"Factura FAC-{fac_id} creada, total={total}")
    except Exception as e:
        logger.error(f"Error creando factura: {e}", exc_info=True)
        return jsonify(error=str(e)), 500
```

**Ver logs en tiempo real:**
```bash
tail -f crm.log | grep ERROR          # Solo errores
tail -f crm.log | grep "FAC-"         # Flujo de facturación
tail -f crm.log | grep "500"          # Requests fallidos
```

**Tiempo estimado:** 2–3 horas

---

### 1.3 — Healthcheck Endpoint

**Qué:** `GET /api/health` que verifique activamente DB, Drive y bot WhatsApp. Devuelve JSON estructurado.

**Implementación:**
```python
# app/api_health.py
import time, subprocess
START_TIME = time.time()

@bp.route('/api/health')
def health():
    checks = {}

    # DB
    try:
        get_db().execute("SELECT 1")
        checks['db'] = {'status': 'ok'}
    except Exception as e:
        checks['db'] = {'status': 'error', 'detail': str(e)}

    # Google Drive (verifica token válido)
    try:
        drive_service.files().list(pageSize=1).execute()
        checks['drive'] = {'status': 'ok'}
    except Exception as e:
        checks['drive'] = {'status': 'error', 'detail': str(e)}

    # Bot WhatsApp (verifica proceso systemd)
    result = subprocess.run(['systemctl', 'is-active', 'htk-bot'],
                            capture_output=True, text=True)
    checks['whatsapp_bot'] = {
        'status': 'ok' if result.stdout.strip() == 'active' else 'down'
    }

    uptime_secs = int(time.time() - START_TIME)
    hours, rem = divmod(uptime_secs, 3600)
    minutes = rem // 60

    overall = 'ok' if all(v['status'] == 'ok' for v in checks.values()) else 'degraded'

    return jsonify({
        'status': overall,
        'checks': checks,
        'uptime': f'{hours}h {minutes}m',
        'version': '2.0.0'
    }), 200 if overall == 'ok' else 503
```

**Respuesta ejemplo:**
```json
{
  "status": "ok",
  "checks": {
    "db": {"status": "ok"},
    "drive": {"status": "ok"},
    "whatsapp_bot": {"status": "ok"}
  },
  "uptime": "3h 42m",
  "version": "2.0.0"
}
```

**Tiempo estimado:** 1–2 horas

---

## FASE 2 — Robustez Financiera (Semanas 3–4)

> 🎯 Objetivo: Que el área de facturación sea un activo del negocio, no solo un registro.

---

### 2.1 — Recordatorios de Facturas por Vencer

**Qué:** Cron diario a las 8am que detecta facturas próximas a vencer (≤3 días) o vencidas sin pagar, y envía recordatorio por WhatsApp.

**Flujo completo:**
```
Cron 8am
  → SELECT facturas WHERE estado='emitida' AND fecha_vencimiento <= NOW() + 3 días
  → Por cada factura:
      → Formatea mensaje personalizado con N° factura, monto, fecha
      → Envía WhatsApp al cliente vía bot_service.py
      → Registra en tabla `recordatorios_enviados` (evita duplicados el mismo día)
      → Loguea resultado (enviado / error)
```

**Script completo:**
```python
# scripts/recordatorio_facturas.py
import sys, os, logging
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app, get_db
from app.bot_service import send_whatsapp
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('recordatorio_facturas')

def run():
    app = create_app()
    with app.app_context():
        db = get_db()
        hoy = datetime.now().date()
        limite = hoy + timedelta(days=3)

        facturas = db.execute("""
            SELECT f.id, f.numero, f.total_general, f.fecha_vencimiento,
                   c.nombre, c.telefono
            FROM facturas f
            JOIN clients c ON c.id = f.client_id
            WHERE f.estado = 'emitida'
              AND f.fecha_vencimiento <= ?
              AND NOT EXISTS (
                SELECT 1 FROM recordatorios_enviados r
                WHERE r.factura_id = f.id AND r.fecha = ?
              )
        """, (str(limite), str(hoy))).fetchall()

        for fac in facturas:
            vence = datetime.strptime(fac['fecha_vencimiento'], '%Y-%m-%d').date()
            dias = (vence - hoy).days

            if dias < 0:
                msg = (f"⚠️ HTK — Hola {fac['nombre']}, tu factura {fac['numero']} "
                       f"por ${fac['total_general']:,.0f} venció hace {abs(dias)} día(s). "
                       f"Por favor contáctanos para regularizar.")
            else:
                msg = (f"⚡ HTK — Hola {fac['nombre']}, tu factura {fac['numero']} "
                       f"por ${fac['total_general']:,.0f} vence el "
                       f"{vence.strftime('%d/%m/%Y')} ({dias} día(s)).")

            ok = send_whatsapp(fac['telefono'], msg)
            if ok:
                db.execute("INSERT INTO recordatorios_enviados (factura_id, fecha) VALUES (?, ?)",
                           (fac['id'], str(hoy)))
                db.commit()
                logger.info(f"Recordatorio enviado: {fac['numero']} → {fac['telefono']}")
            else:
                logger.error(f"Fallo enviando recordatorio: {fac['numero']}")

if __name__ == '__main__':
    run()
```

**Tabla necesaria (migración):**
```sql
-- migrations/20260531_recordatorios_enviados.sql
CREATE TABLE IF NOT EXISTS recordatorios_enviados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,          -- YYYY-MM-DD
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(factura_id, fecha)     -- Evita duplicados
);
```

**Cron job:**
```bash
# crontab -e
0 8 * * 1-6 cd /home/htk/crm && python3 scripts/recordatorio_facturas.py >> logs/recordatorios.log 2>&1
```

**Tiempo estimado:** 3 horas

---

### 2.2 — Exportación Excel/CSV de Facturas

**Qué:** Botón "Exportar" en la pestaña Facturación descarga CSV con los filtros aplicados actualmente en pantalla.

**Endpoint:**
```python
# GET /api/facturas/export?estado=emitida&desde=2026-01-01&hasta=2026-05-31&formato=csv
@bp.route('/api/facturas/export')
def export_facturas():
    estado = request.args.get('estado')
    desde  = request.args.get('desde', '2000-01-01')
    hasta  = request.args.get('hasta', '2099-12-31')

    query = """
        SELECT f.numero, c.nombre AS cliente, f.fecha_emision, f.fecha_vencimiento,
               f.subtotal, f.iva_total, f.total_general, f.estado, f.metodo_pago
        FROM facturas f
        JOIN clients c ON c.id = f.client_id
        WHERE f.fecha_emision BETWEEN ? AND ?
    """
    params = [desde, hasta]
    if estado:
        query += " AND f.estado = ?"
        params.append(estado)

    rows = get_db().execute(query, params).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['N° Factura', 'Cliente', 'Fecha Emisión', 'Vencimiento',
                     'Subtotal', 'IVA', 'Total', 'Estado', 'Método Pago'])
    for row in rows:
        writer.writerow([
            row['numero'], row['cliente'],
            row['fecha_emision'], row['fecha_vencimiento'],
            f"{row['subtotal']:,.0f}", f"{row['iva_total']:,.0f}",
            f"{row['total_general']:,.0f}", row['estado'], row['metodo_pago'] or ''
        ])

    output.seek(0)
    filename = f"facturas_{desde}_{hasta}.csv"
    return Response(
        output.getvalue(),
        mimetype='text/csv; charset=utf-8-sig',   # utf-8-sig: Excel lo abre sin caracteres raros
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )
```

**Frontend (botón):**
```javascript
// En facturación.js — construye la URL con los filtros actuales de la pantalla
function exportarFacturas() {
    const params = new URLSearchParams({
        estado: filtroEstado.value || '',
        desde:  filtroDesdeFecha.value || '',
        hasta:  filtroHastaFecha.value || ''
    });
    window.location.href = `/api/facturas/export?${params}`;
}
```

**Tiempo estimado:** 2 horas

---

### 2.3 — Dashboard Financiero

**Qué:** Sección "Finanzas" en el Dashboard con métricas clave y gráfico de ingresos.

**Widgets:**
- 💰 Ingresos del mes actual vs mes anterior (con % de cambio y color verde/rojo)
- 🕐 Total facturado pendiente de cobro ($)
- 🏆 Top 5 clientes por facturación acumulada
- 📊 Gráfico de barras: ingresos de los últimos 6 meses

**Endpoint de estadísticas:**
```python
# GET /api/finanzas/stats
@bp.route('/api/finanzas/stats')
def finanzas_stats():
    db = get_db()

    # Ingresos mes actual y anterior
    mes_actual  = datetime.now().strftime('%Y-%m')
    mes_anterior = (datetime.now().replace(day=1) - timedelta(days=1)).strftime('%Y-%m')

    def ingresos_mes(mes):
        r = db.execute("""
            SELECT COALESCE(SUM(total_general), 0) AS total
            FROM facturas WHERE estado='pagada' AND strftime('%Y-%m', fecha_pago) = ?
        """, (mes,)).fetchone()
        return r['total']

    ing_actual   = ingresos_mes(mes_actual)
    ing_anterior = ingresos_mes(mes_anterior)
    variacion = round(((ing_actual - ing_anterior) / ing_anterior * 100)
                      if ing_anterior else 0, 1)

    # Facturas pendientes de cobro
    pendiente = db.execute("""
        SELECT COALESCE(SUM(total_general), 0) AS total
        FROM facturas WHERE estado = 'emitida'
    """).fetchone()['total']

    # Top 5 clientes
    top_clientes = db.execute("""
        SELECT c.nombre, SUM(f.total_general) AS total
        FROM facturas f JOIN clients c ON c.id = f.client_id
        WHERE f.estado = 'pagada'
        GROUP BY c.id ORDER BY total DESC LIMIT 5
    """).fetchall()

    # Últimos 6 meses (incluyendo el actual)
    meses = []
    for i in range(5, -1, -1):
        d = (datetime.now().replace(day=1) - timedelta(days=i*30))
        mes = d.strftime('%Y-%m')
        label = d.strftime('%b %Y')
        total = ingresos_mes(mes)
        meses.append({'mes': label, 'total': total})

    return jsonify({
        'ingresos_mes_actual':  ing_actual,
        'ingresos_mes_anterior': ing_anterior,
        'variacion_pct': variacion,
        'pendiente_cobro': pendiente,
        'top_clientes': [dict(r) for r in top_clientes],
        'ultimos_6_meses': meses
    })
```

**Frontend con Chart.js:**
```javascript
// dashboard.js — Gráfico de barras de los últimos 6 meses
async function cargarDashboardFinanciero() {
    const data = await fetch('/api/finanzas/stats').then(r => r.json());

    // Widgets numéricos
    document.getElementById('ingresos-mes').textContent = formatCOP(data.ingresos_mes_actual);
    document.getElementById('variacion-pct').textContent =
        `${data.variacion_pct > 0 ? '▲' : '▼'} ${Math.abs(data.variacion_pct)}%`;
    document.getElementById('variacion-pct').className =
        data.variacion_pct >= 0 ? 'text-success' : 'text-danger';
    document.getElementById('pendiente-cobro').textContent = formatCOP(data.pendiente_cobro);

    // Gráfico de barras (Chart.js CDN)
    const ctx = document.getElementById('grafico-ingresos').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.ultimos_6_meses.map(m => m.mes),
            datasets: [{
                label: 'Ingresos ($)',
                data:   data.ultimos_6_meses.map(m => m.total),
                backgroundColor: '#2E75B6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { ticks: { callback: v => formatCOP(v) } } }
        }
    });
}

function formatCOP(v) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
}
```

**Tiempo estimado:** 4–5 horas

---

## FASE 3 — Experiencia de Cliente (Semanas 5–6)

> 🎯 Objetivo: Que el cliente sienta que HTK es profesional y transparente.

---

### 3.1 — Fotos en Órdenes de Trabajo

**Qué:** Subir fotos del equipo antes/durante/después de la reparación. Máximo 5 fotos por OT.

**Migración DB:**
```sql
-- migrations/20260601_fotos_ot.sql
ALTER TABLE work_orders ADD COLUMN fotos TEXT DEFAULT '[]';
-- Columna JSON: [{"url": "/uploads/OT-042_1.jpg", "tag": "antes", "fecha": "2026-06-01"}]
```

**Endpoint de carga:**
```python
# POST /api/work_orders/<id>/fotos
import uuid, os
from werkzeug.utils import secure_filename

UPLOAD_FOLDER = 'static/uploads/ot'
ALLOWED = {'jpg', 'jpeg', 'png', 'webp'}
MAX_FOTOS = 5

@bp.route('/api/work_orders/<wo_id>/fotos', methods=['POST'])
def upload_foto_ot(wo_id):
    wo = get_db().execute("SELECT fotos FROM work_orders WHERE id=?", (wo_id,)).fetchone()
    if not wo:
        return jsonify(error='OT no encontrada'), 404

    fotos = json.loads(wo['fotos'] or '[]')
    if len(fotos) >= MAX_FOTOS:
        return jsonify(error=f'Máximo {MAX_FOTOS} fotos por OT'), 400

    file = request.files.get('foto')
    tag  = request.form.get('tag', 'general')   # antes / durante / despues / general
    if not file or file.filename.rsplit('.', 1)[-1].lower() not in ALLOWED:
        return jsonify(error='Archivo inválido'), 400

    filename = f"OT-{wo_id}_{uuid.uuid4().hex[:8]}.jpg"
    path = os.path.join(UPLOAD_FOLDER, filename)
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    file.save(path)

    fotos.append({"url": f"/static/uploads/ot/{filename}", "tag": tag,
                  "fecha": datetime.now().strftime('%Y-%m-%d')})
    get_db().execute("UPDATE work_orders SET fotos=? WHERE id=?",
                     (json.dumps(fotos), wo_id))
    get_db().commit()

    return jsonify(fotos=fotos), 201
```

**Frontend:**
```html
<!-- Modal de OT: sección de fotos -->
<div id="seccion-fotos">
    <div id="galeria-fotos" class="d-flex flex-wrap gap-2"></div>
    <select id="foto-tag" class="form-select form-select-sm mt-2" style="width:auto">
        <option value="antes">Antes</option>
        <option value="durante">Durante</option>
        <option value="despues">Después</option>
    </select>
    <input type="file" id="foto-input" accept="image/*" class="d-none" multiple>
    <button class="btn btn-sm btn-outline-secondary mt-1"
            onclick="document.getElementById('foto-input').click()">
        📷 Agregar foto
    </button>
</div>
```

**Tiempo estimado:** 4 horas

---

### 3.2 — Firma Digital en OT (Entrega)

**Qué:** Al entregar un equipo, el cliente firma en pantalla táctil o ratón. La firma queda en la OT y en el PDF.

**Librerías:** `signature_pad` v4.x (8 KB, sin dependencias) — CDN: `https://cdn.jsdelivr.net/npm/signature_pad@4/dist/signature_pad.umd.min.js`

**Migración DB:**
```sql
ALTER TABLE work_orders ADD COLUMN firma_entrega TEXT;   -- base64 PNG
ALTER TABLE work_orders ADD COLUMN fecha_entrega TEXT;
```

**Backend:**
```python
# POST /api/work_orders/<id>/firma
@bp.route('/api/work_orders/<wo_id>/firma', methods=['POST'])
def guardar_firma(wo_id):
    firma_b64 = request.json.get('firma')  # data:image/png;base64,...
    if not firma_b64 or not firma_b64.startswith('data:image/png;base64,'):
        return jsonify(error='Firma inválida'), 400

    db = get_db()
    db.execute("""
        UPDATE work_orders
        SET firma_entrega=?, fecha_entrega=?, estado='entregado'
        WHERE id=?
    """, (firma_b64, datetime.now().isoformat(), wo_id))
    db.commit()

    # Notificación WhatsApp al cliente
    wo = db.execute("SELECT * FROM work_orders WHERE id=?", (wo_id,)).fetchone()
    send_whatsapp(wo['cliente_telefono'],
                  f"✅ HTK — Tu equipo OT-{wo_id} fue entregado. ¡Gracias por tu confianza!")

    logger.info(f"OT-{wo_id} entregada con firma digital")
    return jsonify(ok=True), 200
```

**Frontend:**
```html
<!-- Modal de entrega con canvas de firma -->
<div id="modal-firma" class="modal">
    <h5>Firma de recepción — OT-{{ wo.id }}</h5>
    <canvas id="canvas-firma" width="400" height="180"
            style="border:1px solid #ccc; touch-action:none; border-radius:4px"></canvas>
    <div class="mt-2 d-flex gap-2">
        <button onclick="signaturePad.clear()" class="btn btn-sm btn-outline-secondary">
            Borrar
        </button>
        <button onclick="guardarFirma()" class="btn btn-sm btn-success">
            ✅ Confirmar entrega
        </button>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/signature_pad@4/dist/signature_pad.umd.min.js"></script>
<script>
const canvas = document.getElementById('canvas-firma');
const signaturePad = new SignaturePad(canvas, { backgroundColor: '#ffffff' });

async function guardarFirma() {
    if (signaturePad.isEmpty()) {
        alert('Por favor firma antes de confirmar.');
        return;
    }
    const firma = signaturePad.toDataURL('image/png');
    await fetch(`/api/work_orders/${woId}/firma`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ firma })
    });
    location.reload();
}
</script>
```

**Tiempo estimado:** 3 horas

---

### 3.3 — Link de Tracking para Cliente

**Qué:** URL pública `crm.htk-ingenieria.com/status/OT-042` donde el cliente ve el estado de su equipo sin necesidad de login. El bot la envía automáticamente cuando el cliente pregunta.

**Ruta pública (sin autenticación):**
```python
# app/views_public.py
@bp.route('/status/<wo_id>')
def tracking(wo_id):
    wo = get_db().execute("""
        SELECT wo.*, c.nombre AS cliente_nombre
        FROM work_orders wo
        JOIN clients c ON c.id = wo.client_id
        WHERE wo.id = ?
    """, (wo_id,)).fetchone()

    if not wo:
        abort(404)

    # Timeline de cambios de estado
    timeline = get_db().execute("""
        SELECT estado, fecha, notas
        FROM wo_estado_log
        WHERE wo_id = ?
        ORDER BY fecha ASC
    """, (wo_id,)).fetchall()

    return render_template('public/tracking.html', wo=wo, timeline=timeline)
```

**Template `templates/public/tracking.html`:**
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Estado de tu equipo — HTK</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.min.css">
</head>
<body class="bg-light">
<div class="container py-4" style="max-width:500px">
    <h5 class="fw-bold">🔧 Estado de tu equipo</h5>
    <p class="text-muted mb-1">OT-{{ wo.id }} · {{ wo.cliente_nombre }}</p>

    <!-- Badge de estado actual -->
    <span class="badge fs-6 bg-{{ color_estado(wo.estado) }}">{{ wo.estado | upper }}</span>

    <!-- Tiempo estimado (si aplica) -->
    {% if wo.fecha_estimada_entrega %}
    <p class="mt-2">⏱ Entrega estimada: <strong>{{ wo.fecha_estimada_entrega }}</strong></p>
    {% endif %}

    <!-- Timeline visual -->
    <h6 class="mt-4">Historial</h6>
    <ul class="list-group list-group-flush">
        {% for evento in timeline %}
        <li class="list-group-item px-0">
            <small class="text-muted">{{ evento.fecha }}</small><br>
            <strong>{{ evento.estado }}</strong>
            {% if evento.notas %}<br><span class="text-muted small">{{ evento.notas }}</span>{% endif %}
        </li>
        {% endfor %}
    </ul>

    <p class="mt-4 text-muted small text-center">
        ¿Dudas? Escríbenos al WhatsApp 📱
    </p>
</div>
</body>
</html>
```

**Integración con bot:**
```python
# En bot_service.py — respuesta a "¿cuál es el estado de mi equipo?"
def handle_estado_equipo(cliente_tel):
    wo = get_ultima_ot_activa(cliente_tel)
    if wo:
        url = f"https://crm.htk-ingenieria.com/status/{wo['id']}"
        send_whatsapp(cliente_tel,
            f"🔧 El estado de tu equipo es: *{wo['estado']}*\n"
            f"Puedes ver el detalle aquí:\n{url}")
```

**Tiempo estimado:** 3 horas

---

## FASE 4 — Operaciones (Semanas 7–8)

> 🎯 Objetivo: Que el sistema se monitoree a sí mismo y que cualquier cambio sea seguro.

---

### 4.1 — CI/CD con GitHub Actions

**Qué:** Pipeline que corre los tests automáticamente en cada push a `dev` y en cada PR hacia `main`.

**Archivo completo:**
```yaml
# .github/workflows/test.yml
name: Tests & Lint

on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'   # Versión estable LTS
          cache: 'pip'

      - name: Instalar dependencias
        run: pip install -r requirements.txt pytest pytest-flask pytest-cov

      - name: Correr tests
        run: pytest tests/ -v --cov=app --cov-report=xml --cov-fail-under=60

      - name: Subir cobertura
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage.xml
        continue-on-error: true   # No falla el CI si codecov está caído

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install flake8
      - run: flake8 app/ --max-line-length=120 --ignore=E501,W503
```

**Agregar badge al README.md:**
```markdown
![Tests](https://github.com/tuusuario/htk-crm/actions/workflows/test.yml/badge.svg)
```

**Tiempo estimado:** 2 horas

---

### 4.2 — Backup Automático a Google Drive

**Qué:** El backup diario de la DB se comprime y sube automáticamente a Google Drive > carpeta "Backups CRM". Se mantienen los últimos 30 días.

**Script mejorado:**
```bash
#!/bin/bash
# scripts/backup_db.sh

set -euo pipefail

DB_PATH="/home/htk/crm/crm.db"
BACKUP_DIR="/tmp/crm_backups"
FOLDER_ID="<BACKUPS_DRIVE_FOLDER_ID>"     # ID de la carpeta en Drive
FECHA=$(date +%Y-%m-%d_%H%M)
FILENAME="crm_backup_${FECHA}.tar.gz"

mkdir -p "$BACKUP_DIR"

# 1. Crear backup consistente con SQLite
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/crm_${FECHA}.db"

# 2. Comprimir
tar -czf "$BACKUP_DIR/$FILENAME" -C "$BACKUP_DIR" "crm_${FECHA}.db"
rm "$BACKUP_DIR/crm_${FECHA}.db"

# 3. Subir a Drive con gdrive v3
gdrive files upload \
    --parent "$FOLDER_ID" \
    "$BACKUP_DIR/$FILENAME"

echo "✅ Backup subido: $FILENAME"
logger "HTK-CRM: backup subido a Drive: $FILENAME"

# 4. Limpiar backups locales > 7 días
find "$BACKUP_DIR" -name "crm_backup_*.tar.gz" -mtime +7 -delete

# 5. Rotar Drive: mantener últimos 30
python3 - <<'PYEOF'
import subprocess, json, sys
result = subprocess.run(['gdrive', 'files', 'list',
    '--parent', '$FOLDER_ID', '--order-by', 'createdTime asc',
    '--output-format', 'json'],
    capture_output=True, text=True)
files = json.loads(result.stdout).get('files', [])
to_delete = files[:-30] if len(files) > 30 else []
for f in to_delete:
    subprocess.run(['gdrive', 'files', 'delete', f['id']])
    print(f"Eliminado backup antiguo: {f['name']}")
PYEOF
```

**Cron:**
```bash
0 2 * * * /home/htk/crm/scripts/backup_db.sh >> /home/htk/crm/logs/backup.log 2>&1
```

**Tiempo estimado:** 1–2 horas

---

### 4.3 — Monitoreo Activo con Alertas

**Qué:** Script que corre cada 15 minutos, verifica el estado del CRM, bot y túnel. Si algo falla, notifica a Pedro por WhatsApp.

**Script:**
```bash
#!/bin/bash
# scripts/healthcheck.sh

CRM_URL="http://localhost:5000/api/health"
PEDRO_TEL="+57XXXXXXXXXX"
LOG="/home/htk/crm/logs/healthcheck.log"

check_service() {
    local name=$1
    local cmd=$2
    if eval "$cmd" > /dev/null 2>&1; then
        echo "$(date) ✅ $name OK" >> "$LOG"
    else
        echo "$(date) ❌ $name CAÍDO" >> "$LOG"
        # Envía WhatsApp a Pedro
        python3 -c "
import sys; sys.path.insert(0, '/home/htk/crm')
from app import create_app
from app.bot_service import send_whatsapp
app = create_app()
with app.app_context():
    send_whatsapp('$PEDRO_TEL', '⚠️ HTK CRM — $name CAÍDO. Revisar inmediatamente.')
"
    fi
}

check_service "CRM API"       "curl -sf $CRM_URL"
check_service "Bot WhatsApp"  "systemctl is-active htk-bot"
check_service "Túnel Ngrok"   "curl -sf http://localhost:4040/api/tunnels"
```

**Cron:**
```bash
*/15 * * * * /home/htk/crm/scripts/healthcheck.sh
```

**Mejora futura:** Integrar con UptimeRobot (gratis) para monitoreo externo sin depender de que el mismo servidor esté activo.

**Tiempo estimado:** 2 horas

---

## FASE 5 — Escalabilidad Futura (Semanas 9+)

> 🎯 Solo cuando haya necesidad real. No antes.

---

### 5.1 — Migración a PostgreSQL (opcional)

**Cuándo activar:** >10.000 registros activos O múltiples usuarios concurrentes O consultas que tarden >500ms.

**Hoy:** SQLite con `PRAGMA journal_mode=WAL` maneja cómodamente 50.000+ registros con un solo usuario. No es urgente.

**Plan de migración (cuando llegue):**
1. Refactor `get_db()` → SQLAlchemy (abstrae el motor)
2. Activar en `.env`: `DATABASE_URL=postgresql://...`
3. Exportar datos con `sqlite3 crm.db .dump | psql $DATABASE_URL`
4. Mantener SQLite para entorno de desarrollo local

---

### 5.2 — Sistema de Roles y Permisos

**Cuándo:** Cuando entre un segundo usuario (técnico, contador).

**Roles propuestos:**
| Rol | Acceso |
|-----|--------|
| `admin` | Todo |
| `tecnico` | OTs + Clientes (lectura/escritura), sin Finanzas |
| `contador` | Facturación + Dashboard Financiero (solo lectura) |

**Implementación:** Decorator `@require_role('admin', 'contador')` sobre los endpoints financieros.

---

### 5.3 — API Pública con Autenticación por Token

**Cuándo:** Cuando haya necesidad de integrar con sistema contable externo (Siigo, Alegra, etc.).

**Plan:** API key por cliente, endpoints REST documentados con Swagger/OpenAPI, webhooks para eventos (factura creada, OT entregada).

---

### 5.4 — 2FA para Login

**Cuándo:** Cuando el CRM sea accesible desde internet de forma permanente.

**Plan:** TOTP con `pyotp` + app Google Authenticator. QR en primer login. Recovery codes almacenados hasheados.

---

## 📊 Resumen de Esfuerzo Actualizado

| Fase | Ítems | Horas estimadas | Impacto |
|------|-------|-----------------|---------|
| F1: Testing + Logging + Health | 3 | 8–12h | 🔴 Fundación crítica |
| F2: Financiero | 3 | 9–10h | 🟡 Valor de negocio directo |
| F3: Experiencia cliente | 3 | 10h | 🟡 Diferenciación y profesionalismo |
| F4: Operaciones | 3 | 5–6h | 🟢 Tranquilidad operacional |
| **Total F1–F4** | **12** | **32–38h** | — |
| F5: Escalabilidad | 4 | ∞ | 🔵 Futuro según necesidad |

---

## 🛠️ Herramientas Concretas por Fase

| Herramienta | Tipo | Fase | Para qué |
|-------------|------|------|----------|
| `pytest` + `pytest-flask` + `pytest-cov` | pip | F1 | Test suite + cobertura |
| `logging.RotatingFileHandler` | stdlib | F1 | Logs estructurados con rotación |
| `systemctl is-active` | bash | F1, F4 | Verificar estado de servicios |
| `Chart.js` (CDN) | JS | F2 | Gráfico de barras ingresos |
| `csv.writer` + `utf-8-sig` | stdlib | F2 | Export Excel-compatible |
| `sqlite3 .backup` | bash | F4 | Backup consistente sin bloquear |
| `gdrive v3` CLI | bash | F4 | Upload Drive + rotación |
| `signature_pad@4` (CDN) | JS | F3 | Firma digital táctil |
| `GitHub Actions` | YAML | F4 | CI/CD automático |
| `UptimeRobot` (free tier) | SaaS | F4 | Monitoreo externo |
| `SQLAlchemy` | pip | F5 | Abstracción DB para migrar a PG |
| `pyotp` | pip | F5 | 2FA TOTP |

---

## 📋 Orden de Ejecución Recomendado

```
F1.1 Tests (conftest + test_invoices) 
  ↓
F1.2 Logging estructurado
  ↓
F1.3 Healthcheck endpoint
  ↓
F4.1 CI/CD (GitHub Actions) ← instalar AHORA, aprovecha los tests recién creados
  ↓
F2.3 Dashboard Financiero (mayor impacto visual)
  ↓
F2.1 Recordatorios de facturas
  ↓
F2.2 Export CSV
  ↓
F3.3 Link de Tracking (menor complejidad, mayor satisfacción del cliente)
  ↓
F3.1 Fotos en OT
  ↓
F3.2 Firma Digital
  ↓
F4.2 Backup Drive
  ↓
F4.3 Monitoreo activo
```

**Nota:** F4.1 (CI/CD) se adelanta intencionalmente para que todo lo que sigue en F2–F4 esté cubierto por los tests desde el primer día.

---

## ✅ Definición de "Done" por Ítem

Cada ítem del roadmap se considera terminado cuando:
1. El código está en `main` (via PR revisado)
2. Tiene al menos 1 test automatizado cubriendo el camino feliz
3. Está documentado en el ADR correspondiente si modificó la arquitectura
4. No introduce regresiones (CI pasa en verde)

---

*Generado: 2026-05-31 | HTK CRM Roadmap v5*
