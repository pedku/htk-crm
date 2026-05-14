# Plan de Corrección — Conversión Leads → Clientes

> Fecha: 2026-05-13  
> Problema: Al convertir lead a cliente, los datos no se transfieren correctamente

---

## 🔍 Diagnóstico

### Bug 1: Campo equivocado en conversión
```
Backend usa:   lead['contacto'] → client.telefono  ❌
Debe usar:    lead['telefono']  → client.telefono  ✅
```
El campo `contacto` del lead ahora es un nombre/apodo, no número. El número real está en `telefono`.

**Ejemplo real:** Powerfit Training Club
- lead.contacto = "Dueño/Admin" → client.telefono = "Dueño/Admin" ❌
- lead.telefono = "573502829582" → client.telefono debería ser ese ✅

### Bug 2: Estado incorrecto
```python
client.estado = 'lead'  ❌  # El cliente nuevo debería ser 'cliente'
```

### Bug 3: Falta copiar contacto_nombre
El lead tiene `contacto_nombre` pero no se copia al cliente.

### Bug 4: Eliminaciones independientes
Si borras un lead que fue convertido a cliente, el cliente queda huérfano (lead_id apunta a nada). Viceversa.

---

## 🛠️ Acciones Propuestas

### Fase 1: Arreglar la conversión (inmediato)

**Backend `crm_app.py` — endpoint `/api/leads/<lead_id>/convert`:**
```python
# Cambiar de:
lead['contacto']  →  # teléfono
# A:
lead['telefono']   # ✅

# Cambiar estado:
'lead'  →  'cliente'  # ✅

# Agregar:
lead['contacto_nombre']  →  client.contacto_nombre  # nuevo ✅
```

### Fase 2: Sincronización bidireccional

Cuando se edita un campo en lead que también existe en client (nombre, teléfono, email, segmento), propagar el cambio al cliente vinculado (y viceversa).

**Propuesta de implementación:**
- En PUT `/api/leads/<id>`: si `lead.estado == 'cliente'` y hay un cliente vinculado por `lead_id`, actualizar campos correspondientes
- En PUT `/api/clients/<id>`: similar en sentido inverso si tiene `lead_id`

### Fase 3: Eliminaciones en cascada

**Opción A (recomendada):** Al eliminar un lead convertido a cliente:
- Mostrar advertencia: "Este lead fue convertido a CLI-XXX. ¿Eliminar también el cliente?"
- Si acepta → DELETE en cascada (cliente + links)

**Opción B (automática):** Agregar FOREIGN KEY con ON DELETE CASCADE/SET NULL entre clients.lead_id → leads.id

**Propuesta concreta:** Combinar ambas — FK suave (SET NULL) para mantener integridad + advertencia UI.

### Fase 4: UI — Indicador visual

En la tabla de leads, cuando un lead tiene estado "cliente", mostrar un badge con link al cliente:
```
Powerfit Training Club  [gimnasios]  [✓ Cliente CLI-001]
```

Y en la tabla de clientes, mostrar de qué lead provino:
```
CLI-001 | Powerfit Training Club | [de PRO-051]
```

---

## 📋 Priorización

| Fase | Tarea | Impacto | Esfuerzo |
|------|-------|---------|----------|
| 1 | Fix conversión (3 bugs) | 🔴 Alto | 🟢 5 min |
| 2 | Sincronización bidireccional | 🟡 Medio | 🟡 30 min |
| 3 | Eliminaciones en cascada | 🟡 Medio | 🟡 20 min |
| 4 | Indicadores visuales UI | 🟢 Bajo | 🟢 15 min |

---

## ✅ ¿Procedemos?

1. **Fase 1** — Arreglo inmediato de la conversión
2. **Fase 1 + 2** — Conversión + sincronización
3. **Todo** — Completo

¿Cuál prefieres?
