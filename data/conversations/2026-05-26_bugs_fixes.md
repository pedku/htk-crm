# Conversación — 2026-05-26 19:42 a 20:09

## Resumen
Continuación de la sesión de facturación. Se arreglaron bugs críticos encontrados por un agente auditor.

### Hitos
1. **Abonos no cargaban** — función `loadPaymentsList` nunca se había agregado al JS
2. **Navegación entre modales** — botón "← Volver" en Cambiar Estado y Registrar Abono
3. **OT abre modal** — click en ID de OT abre modal, no página aparte
4. **Selector cliente en OT** — input con búsqueda como facturación, aparece tanto al crear como al editar
5. **Bug Hunter** — sub-agente auditor encontró 8 bugs críticos, todos arreglados:
   - `toastMsg` → `showToast` (toasts de facturación no funcionaban)
   - `renderLeads/Client/WO()` → `renderXxxDT()` (eliminar items fallaba)
   - HTML onclick a funciones fantasma → eliminados
   - Dead code en api_leads.py → limpiado
   - 6 endpoints sin @login_required → protegidos
   - `escHtml` duplicada → eliminada duplicado
6. **"Crear cliente"** en dropdown de búsqueda cuando no hay resultados
7. **Editar OT** ahora muestra el buscador de cliente con pre-relleno

### Commits
```
b83a5e1 Fix abonos functions
b90313c OT back button + modal navigation
d6b180e Bug fixes: 8 critical bugs from audit
78cf59a Fix: client search appears when editing OT
```
