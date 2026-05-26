# PLAN: Clientes + Facturación — Mejoras Estructurales

> Fecha: 2026-05-26 | Tipo: Plan de implementación

---

## Diagnóstico Actual

### Tabla `clients` — Campos existentes
```
✅ id             ✅ telefono       ✅ nombre         ✅ fuente
✅ estado         ✅ segmento       ✅ linea_interes  ✅ lead_id
✅ notas          ✅ contacto_nombre ✅ direccion     ✅ ciudad
✅ tipo_documento ✅ documento      ✅ empresa        ✅ cargo
✅ email          ✅ cumpleanos     ✅ redes_contacto
❌ tipo_persona   (NO EXISTE — hay que crearlo)
```

### Problemas detectados
1. Solo 1 cliente en DB (diomar) con datos incompletos (sin dirección, documento, tipo de persona)
2. El modal de Nueva Factura usa un `<select>` desplegable — no escala con 50+ clientes
3. La factura muestra campos vacíos si el cliente no tiene los datos completos

---

## Plan de Implementación

### Fase 1: Migración de DB — Campos de cliente

**Agregar columna `tipo_persona`:**
```sql
ALTER TABLE clients ADD COLUMN tipo_persona TEXT DEFAULT 'natural';
```

Valores: `natural` | `juridica`

**Agregar columna `nombre_comercial` (para jurídicas):**
```sql
ALTER TABLE clients ADD COLUMN nombre_comercial TEXT DEFAULT '';
```

### Fase 2: Modal de cliente con campos completos

Actualizar el modal de crear/editar cliente en el CRM para incluir:
- `tipo_persona` (select: Natural / Jurídica)
- `nombre` → si es natural: nombres y apellidos; si es jurídica: razón social
- `nombre_comercial` → solo visible si tipo = jurídica
- `tipo_documento` (NIT, CC, CE, Pasaporte)
- `documento` (número)
- `direccion`
- `ciudad`
- `telefono`
- `email`

### Fase 3: Selector de cliente con búsqueda en tiempo real

**Reemplazar el `<select>` actual por un input de búsqueda con dropdown:**

```
┌─────────────────────────────────────────┐
│ 🔍 Escribe para buscar cliente...    ▼ │
├─────────────────────────────────────────┤
│ diomar — +57 302 380 5475              │
│ (sin más clientes aún)                  │
└─────────────────────────────────────────┘
```

**Comportamiento:**
- Input de texto libre con ícono de búsqueda
- Al escribir 2+ caracteres, busca en `/api/clients?search=X`
- Muestra resultados en un dropdown debajo del input
- Click en un resultado → lo selecciona y cierra el dropdown
- Si no hay resultados → muestra "Sin resultados" o botón "Crear cliente"
- Muestra: nombre + documento + teléfono en cada resultado

**Componente HTML/CSS:**
```html
<div class="client-search-wrapper">
  <input type="text" class="form-control" id="factClientSearch" 
         placeholder="🔍 Buscar cliente por nombre, documento o teléfono..."
         autocomplete="off">
  <div class="client-search-dropdown" id="factClientDropdown"></div>
  <input type="hidden" id="factClientId">
</div>
```

**JS:**
```javascript
let clientSearchTimer = null;
document.getElementById('factClientSearch').addEventListener('input', function() {
  clearTimeout(clientSearchTimer);
  const q = this.value.trim();
  if (q.length < 2) { hideClientDropdown(); return; }
  clientSearchTimer = setTimeout(() => searchClients(q), 250);
});

async function searchClients(q) {
  const resp = await fetch(`/api/clients?search=${encodeURIComponent(q)}`);
  const results = await resp.json();
  renderClientDropdown(results);
}
```

### Fase 4: Factura usa datos completos del cliente

**Endpoint `/api/clients?search=X`** — ya existe, verificar que funcione bien.

**Al crear factura:**
- El `client_id` se guarda como antes
- La plantilla de factura YA lee `client.documento`, `client.direccion`, `client.tipo_documento`, `client.telefono` del objeto cliente

**Mejora en la plantilla:**
```html
<!-- Si es persona jurídica, mostrar razón social + nombre comercial -->
{% if client.tipo_persona == 'juridica' %}
  <strong>{{ client.empresa or client.nombre }}</strong>
  {% if client.nombre_comercial %}<br>{{ client.nombre_comercial }}{% endif %}
{% else %}
  <strong>{{ client.nombre }}</strong>
{% endif %}

<!-- Documento según tipo -->
{{ client.tipo_documento or 'CC' }}: {{ client.documento or '—' }}

<!-- Dirección -->
{{ client.direccion or '—' }}{% if client.ciudad %}, {{ client.ciudad }}{% endif %}

<!-- Teléfono -->
{{ client.telefono or '—' }}
```

### Fase 5: Backend — Búsqueda de clientes

**Endpoint existente:** `GET /api/clients?search=X`

Verificar que filtre por: `nombre`, `documento`, `telefono`, `empresa`.

Si no existe el filtro, agregarlo en `api_clients.py`:
```python
search = request.args.get('search', '').strip()
if search:
    clients = conn.execute(
        "SELECT * FROM clients WHERE nombre LIKE ? OR documento LIKE ? OR telefono LIKE ? OR empresa LIKE ?",
        (f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%')
    ).fetchall()
```

---

## Archivos a modificar

| Archivo | Cambio | Estimado |
|---------|--------|----------|
| `app/__init__.py` | Migración: columna `tipo_persona` + `nombre_comercial` | +10 líneas |
| `app/routes/api_clients.py` | Filtro `?search=` si no existe | +5 líneas |
| `templates/pages/clients.html` | Campos `tipo_persona`, `nombre_comercial` en modal | +15 líneas |
| `templates/pages/facturacion.html` | Reemplazar `<select>` por input con dropdown | +20 líneas |
| `templates/pages/factura_template.html` | Usar campos completos de cliente + tipo persona | +10 líneas |
| `templates/pages/factura_template_print.html` | Igual que arriba | +10 líneas |
| `static/js/crm.js` | `searchClients()`, `renderClientDropdown()`, `selectClient()` | +60 líneas |
| `static/css/crm.css` | Estilos `.client-search-wrapper`, `.client-search-dropdown` | +30 líneas |

**Total estimado:** ~160 líneas, 8 archivos

---

## Orden de implementación

| # | Fase | Depende de |
|---|------|------------|
| 1 | Migración DB (`tipo_persona`, `nombre_comercial`) | — |
| 2 | Backend: filtro `?search=` en clients API | Fase 1 |
| 3 | Modal cliente con nuevos campos | Fase 1 |
| 4 | Selector de cliente con búsqueda (input + dropdown) | Fase 2 |
| 5 | Plantillas de factura con datos completos + tipo persona | Fase 1 |
| 6 | Test integral | Fases 1-5 |
