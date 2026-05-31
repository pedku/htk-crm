# HTK CRM — Roadmap de Mejoras v4

> Rama: `main` | Fecha: 2026-05-31 | ⚡ deepseek-v4-pro

---

## Evaluación de Madurez Actual

| Área | Madurez | Comentario |
|------|---------|-----------|
| Leads & CRM | ⭐⭐⭐⭐ | Kanban, scoring, pitches, enriquecimiento |
| Clientes | ⭐⭐⭐⭐ | Ficha completa, historial, timeline |
| Órdenes de Trabajo | ⭐⭐⭐⭐ | Tipos dinámicos, finanzas, notificaciones |
| Facturación | ⭐⭐⭐⭐ | IVA, PDF, Drive, WhatsApp |
| Inventario | ⭐⭐⭐ | Básico, falta stock tracking |
| Dashboard | ⭐⭐⭐ | KPIs funcionales, falta financiero |
| Automatización | ⭐⭐⭐ | Scripts autónomos, sin orquestación |
| Testing | ⭐ | Cero tests automatizados |
| DevOps | ⭐⭐ | systemd + cron, sin CI/CD |
| Seguridad | ⭐⭐ | Login básico, sin roles, sin 2FA |

**Puntaje: 28/50 — Sistema funcional y robusto en el core, con deuda técnica en calidad y operaciones.**

---

## Principios de Ingeniería para esta Etapa

1. **No romper lo que funciona.** Cada mejora se hace en `dev` y se mergea a `main` validada.
2. **Tests ANTES de refactorizar.** Si algo no tiene tests, no se toca. Si se toca, se testea.
3. **Documentar decisiones.** Cada cambio de arquitectura → ADR en `docs/adr/`.
4. **Migraciones forward-only.** Nunca modificar la DB hacia atrás. Solo agregar columnas/tablas.
5. **Observabilidad.** Logging estructurado antes que nuevos features complejos.

---

## FASE 1 — Fundación de Calidad (Semanas 1-2)

> 🎯 Objetivo: Base sólida antes de agregar features. Cero regresiones.

### 1.1 — Test Suite Básica

**Qué:** Tests de integración para los endpoints críticos. No unit tests excesivos.

**Por qué ahora y no antes:** El sistema ya es usado en producción. Cada cambio futuro debe poder validarse sin romper lo que funciona.

**Implementación:**
```
tests/
├── conftest.py              # Fixtures: app test, DB temporal, cliente de prueba
├── test_api_leads.py        # CRUD leads, filtros, kanban
├── test_api_invoices.py     # Crear factura, IVA incluido/discriminado, pagar, PDF
├── test_api_wo.py           # CRUD OT, finanzas, estados
└── test_api_clients.py      # CRUD clientes
```

**Herramientas:**
- `pytest` + `pytest-flask` (test client de Flask)
- DB SQLite en memoria para tests (`:memory:`)
- Fixture `client` autenticado para llamadas API

**Ejemplo de test:**
```python
# tests/test_api_invoices.py
def test_create_invoice_with_iva_incluido(client):
    """Item con IVA incluido: total NO debe duplicar IVA"""
    resp = client.post('/api/facturas', json={
        'client_id': 'CLI-001',
        'items': [{'descripcion': 'Servicio', 'cantidad': 1,
                   'precio_unitario': 119000, 'iva_porcentaje': 19,
                   'iva_incluido': 1}]
    })
    data = resp.get_json()
    assert data['total_general'] == 119000  # No 141610
    assert data['iva_total'] == 19000       # IVA extraído correctamente
```

**Tiempo estimado:** 4-6 horas

### 1.2 — Logging Estructurado

**Qué:** Reemplazar `print()` con `logging` estructurado en `api_invoices.py`, `api_wo.py`, `api_leads.py`.

**Por qué:** Hoy los errores en producción son invisibles. Con logging podemos:
- Ver cuándo falla la generación de PDF
- Trazar el flujo de pago completo
- Detectar cuellos de botella

**Implementación:**
```python
# app/logging_config.py
import logging, sys
from logging.handlers import RotatingFileHandler

def setup_logging(app):
    handler = RotatingFileHandler('crm.log', maxBytes=5*1024*1024, backupCount=3)
    handler.setFormatter(logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
    ))
    handler.setLevel(logging.INFO)
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
```

**Tiempo estimado:** 2 horas

### 1.3 — Healthcheck Endpoint

**Qué:** `GET /api/health` que verifique DB, Drive, bot WhatsApp.

**Respuesta:**
```json
{
  "status": "ok",
  "db": "connected",
  "drive": "authenticated",
  "whatsapp_bot": "running",
  "uptime": "3h 42m"
}
```

**Tiempo estimado:** 1 hora

---

## FASE 2 — Robustez Financiera (Semanas 3-4)

### 2.1 — Recordatorios de Facturas por Vencer

**Qué:** Cron diario (8am) que detecta facturas emitidas próximas a vencer (3 días) o vencidas, y envía recordatorio por WhatsApp.

**Flujo:**
```
Cron 8am → SELECT facturas WHERE vence en ≤3 días o vencida sin pagar
  → Para cada una:
    → Envía WhatsApp: "⚡ HTK — Tu factura FAC-XXXX por $X vence el DD/MM"
```

**Implementación:**
- Script Python autónomo: `scripts/recordatorio_facturas.py`
- Cron job: `0 8 * * 1-6 python3 scripts/recordatorio_facturas.py`
- Usa `bot_service.py` para enviar WhatsApp

**Tiempo estimado:** 2 horas

### 2.2 — Exportación Excel de Facturas

**Qué:** Botón "Exportar" en pestaña Facturación → descarga CSV/Excel con filtros aplicados.

**Implementación:**
- `GET /api/facturas/export?estado=emitida&desde=2026-01-01&hasta=2026-05-31`
- Response: CSV con headers `N° Factura, Cliente, Fecha, Vence, Subtotal, IVA, Total, Estado`
- Librería: `csv` built-in de Python (sin dependencia externa)

**Tiempo estimado:** 2 horas

### 2.3 — Dashboard Financiero

**Qué:** Widgets en Dashboard:
- Ingresos del mes actual vs mes anterior (% cambio)
- Facturas por cobrar (total $ pendiente)
- Top 5 clientes por facturación
- Gráfico de barras: ingresos últimos 6 meses

**Implementación:**
- Endpoint `GET /api/finanzas/stats`
- Frontend: Chart.js (CDN, ya tenemos acceso) → gráfico de barras
- Widgets numéricos con tarjetas stat-card existentes

**Tiempo estimado:** 4 horas

---

## FASE 3 — Experiencia de Cliente (Semanas 5-6)

### 3.1 — Fotos en Órdenes de Trabajo

**Qué:** Subir fotos del equipo antes/después de la reparación.

**Implementación:**
- Columna `fotos` JSON en `work_orders`: `["/uploads/OT-042_antes.jpg", ...]`
- Endpoint `POST /api/work_orders/<id>/fotos` (multipart upload)
- Input `<input type="file" multiple>` en el modal de OT
- Previsualización en el perfil de OT

**Tiempo estimado:** 4 horas

### 3.2 — Firma Digital en OT (Entrega)

**Qué:** Al entregar un equipo reparado, el cliente firma en el celular/touch.

**Implementación:**
- Librería: `signature_pad` (JS, 8KB, sin dependencias)
- Canvas en modal de OT → firma → guarda como PNG base64
- Columna `firma_entrega` TEXT en `work_orders`
- Se renderiza en el PDF de la OT

**Tiempo estimado:** 3 horas

### 3.3 — Link de Tracking para Cliente

**Qué:** URL pública tipo `crm.htk-ingenieria.com/status/OT-042` donde el cliente ve el estado de su equipo.

**Implementación:**
- Ruta pública `/status/<wo_id>` (sin auth, solo lectura)
- Template simple con: estado actual, timeline de estados, tiempo estimado
- El bot la comparte automáticamente cuando el cliente pregunta por su equipo

**Tiempo estimado:** 3 horas

---

## FASE 4 — Operaciones (Semanas 7-8)

### 4.1 — CI/CD con GitHub Actions

**Qué:** Pipeline que corre tests en cada push a `dev` y `main`.

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.14' }
      - run: pip install -r requirements.txt
      - run: pytest tests/ -v
```

**Tiempo estimado:** 2 horas

### 4.2 — Backup a Google Drive (automático)

**Qué:** El backup diario de la DB se sube automáticamente a Google Drive > Backups.

**Implementación:**
- Modificar `scripts/backup_db.sh`:
  ```bash
  gog drive upload backup.tar.gz \
    --parent <BACKUPS_FOLDER_ID> \
    --no-input
  ```
- Rotación: mantener últimos 30 días en Drive

**Tiempo estimado:** 1 hora

### 4.3 — Monitoreo Básico

**Qué:** Script que verifica que CRM, bot y túnel estén vivos. Si algo falla, notifica a Pedro.

**Implementación:**
- `scripts/healthcheck.sh` — curl a endpoints, verificar respuestas
- Cron cada 15 min
- Si falla → WhatsApp a Pedro: "⚠️ CRM caído"

**Tiempo estimado:** 2 horas

---

## FASE 5 — Escalabilidad Futura (Semanas 9+)

### 5.1 — Migración PostgreSQL (opcional)

**Cuándo:** Cuando SQLite se vuelva cuello de botella (>10,000 registros o múltiples usuarios concurrentes).

**Plan:**
1. Refactor `get_db()` → SQLAlchemy ORM (abstrae motor SQLite/Postgres)
2. Migrar datos con `flask db upgrade`
3. Mantener SQLite para desarrollo local

**No prioritario ahora.** SQLite con WAL mode maneja fácilmente 50,000+ registros con un solo usuario.

### 5.2 — API Pública / Webhooks

**Qué:** Exponer endpoints para integraciones externas (contabilidad, ERP).

**Cuándo:** Cuando haya necesidad real de integración con sistemas externos.

### 5.3 — Roles y Permisos

**Qué:** Diferentes niveles de acceso (admin, técnico, contador).

**Cuándo:** Cuando entre otra persona al equipo.

---

## 📊 Resumen de Esfuerzo

| Fase | Horas | Impacto |
|------|-------|---------|
| F1: Testing + Logging + Health | 7-9h | 🔴 Fundación crítica |
| F2: Financiero | 8h | 🟡 Valor negocio directo |
| F3: Experiencia cliente | 10h | 🟡 Diferenciación |
| F4: Operaciones | 5h | 🟢 Tranquilidad |
| **Total F1-F4** | **30-32h** | — |
| F5: Escalabilidad | ∞ | 🟢 Futuro |

---

## 🛠️ Skills Recomendadas para Implementar

| Skill | Fase | Para qué |
|-------|------|----------|
| **tdd** | F1 | Escribir test suite con red-green-refactor |
| **diagnose** | F1 | Debugging del sistema de logging |
| **improve-codebase-architecture** | F1 | Revisar acoplamiento antes de refactorizar |
| **to-issues** | Todas | Convertir cada ítem en issues de GitHub |
| **caveman** | F2-F3 | Iteraciones rápidas en features simples |
| **prototype** | F3 | Prototipar la UI de firma digital y tracking |

---

## 📋 Orden de Ejecución Recomendado

```
F1.1 Tests → F1.2 Logging → F1.3 Healthcheck
  ↓
F2.3 Dashboard Financiero → F2.1 Recordatorios → F2.2 Export
  ↓
F3.3 Link Tracking → F3.1 Fotos OT → F3.2 Firma Digital
  ↓
F4.2 Backup Drive → F4.1 CI/CD → F4.3 Monitoreo
```

**¿Empezamos con F1.1 (tests)?** Es la base que habilita todo lo demás sin miedo a romper.
