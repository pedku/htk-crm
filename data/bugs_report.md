# Bug Report — HTK CRM
> Fecha: 2026-05-26

---

## 🔴 Críticos (rompen funcionalidad)

1. **`static/js/crm.js:1751, 1767, 2183`** — `renderLeads()` llamada pero **no definida**.  
   En `changeLeadStage()` y `deleteItem()` se invoca `renderLeads()` directamente, pero esa función no existe. La función correcta es `renderLeadsDT()`.  
   **Impacto:** Cambiar etapa de lead y eliminar leads rompe con ReferenceError. El dato local se modifica pero la tabla nunca se re-renderiza.

2. **`static/js/crm.js:2186`** — `renderClients()` llamada pero **no definida**.  
   En `deleteItem()` se invoca `renderClients()` que no existe. Debería ser `renderClientsDT()`.  
   **Impacto:** Eliminar un cliente lanza ReferenceError y deja la tabla sin refrescar.

3. **`static/js/crm.js:2189`** — `renderWorkOrders()` llamada pero **no definida**.  
   En `deleteItem()` se invoca `renderWorkOrders()` que no existe. Debería ser `renderWOsDT()`.  
   **Impacto:** Eliminar una OT lanza ReferenceError y deja la tabla obsoleta.

4. **`static/js/crm.js:4877, 4905, 4916, 4927, 4951, 4952`** — `toastMsg()` llamada en la sección de facturación pero **no definida**.  
   La función real se llama `showToast()`. `toastMsg()` no existe en ningún lugar del archivo.  
   **Impacto:** Todas las notificaciones toast en facturación fallan con ReferenceError. Crear, emitir, pagar o anular facturas no muestra feedback.

5. **Templates HTML → JS: funciones de filtro inexistentes**  
   - `templates/pages/clients.html:11` — `onkeyup="renderClients()"` → no existe  
   - `templates/pages/work_orders.html:11,12` — `onkeyup="renderWorkOrders()"` y `onchange="renderWorkOrders()"` → no existen  
   - `templates/pages/leads.html:11,12,22,30` — `onkeyup="renderLeads()"` y `onchange="renderLeads()"` → no existen  
   **Impacto:** Los buscadores (`#clientSearch`, `#woSearch`, `#leadSearch`) y filtros (`#woStatusFilter`, `#leadEstadoFilter`, etc.) en las tablas **no hacen nada** al escribir/seleccionar. Los DataTables ya manejan búsqueda interna, pero los filtros personalizados (estado, servicio, segmento) nunca se activan.

6. **`app/routes/api_wo.py` — Falta endpoint `PUT` para editar pagos**  
   El JS en `editPayment()` (línea ~1378) hace `fetch('/api/work_orders/' + woId + '/payments/' + paymentId, {method:'PUT'})` pero solo existe `DELETE` para payments individuales.  
   **Impacto:** Editar un abono registrado falla silenciosamente (404 o method not allowed).

7. **`app/routes/api_leads.py:230-266` — Código muerto (dead code) inalcanzable**  
   Después del endpoint `api_leads_from_bot()`, quedó un bloque huérfano de código que incluye `if request.method == 'GET':` y un `POST` duplicado de creación de leads. Está fuera de cualquier función y nunca se ejecuta. Tiene imports/scope correcto pero no está dentro de ningún `def` ni decorador.  
   **Impacto:** Confunde al desarrollador. Riesgo bajo de side-effects si se mueve por error.

8. **`app/routes/api_misc.py` — 6 endpoints sin `@login_required`**  
   Los siguientes endpoints no tienen protección de autenticación:  
   - `api_sales()` — `GET/POST /api/sales` (línea 281)  
   - `api_sale()` — `PATCH/DELETE /api/sales/<sid>` (línea 304)  
   - `api_prices()` — `GET/POST /api/prices` (línea 331)  
   - `api_price()` — `PATCH/DELETE /api/prices/<pid>` (línea 353)  
   - `api_tasks()` — `GET/POST /api/tasks` (línea 377)  
   - `api_task()` — `PATCH/DELETE /api/tasks/<tid>` (línea 399)  
   **Impacto:** Cualquier persona con acceso a la red puede leer/escribir datos de ventas, precios y tareas.

---

## 🟡 Advertencias (posibles problemas)

1. **`app/routes/views.py:98-99` — Doble return en `page_client()`**  
   ```python
   return render_template('client_detail.html', client=client, wo_ids=wo_ids)
   return render_template('test_fact.html')
   ```  
   La segunda línea es código muerto (nunca se ejecuta). También se importa `test_fact.html` que podría no ser deseado.

2. **`static/js/crm.js` — `escHtml()` y `escapeHtml()` son funciones idénticas**  
   Definidas en ~línea 330 y ~línea 420. Hacen exactamente lo mismo (sanitizar HTML). La duplicación genera confusión sobre cuál usar.

3. **`static/js/crm.js:1751-1773` — `changeLeadStage()` tiene race condition**  
   Primero actualiza `l.estado` localmente, luego llama `renderLeads()` (que falla, ver crítico #1). Si la API falla, intenta revertir con `renderLeads()` de nuevo (también falla). Secuencia correcta: API primero → local después.

4. **`static/js/crm.js:1372` — `editPayment()` usa `fetch` sin manejo de errores con `.then/.catch`**  
   También usa `prompt()` que es bloqueante y mala UX. Al no existir el endpoint PUT (ver crítico #6), falla silenciosamente.

5. **`static/js/crm.js:1390` — `deletePayment()` confirma con `confirm()` y hace `fetch` sin verificar respuesta**  
   Si la API falla, el item se elimina del DOM (vía `loadPaymentsList()` que se recarga después del `then`), pero si hay error de red la UI queda inconsistente.

6. **`templates/pages/work_orders.html` — Filtro de estados hardcodeado**  
   El `<select id="woStatusFilter">` solo lista los estados del tipo `reparacion`. Los estados de `fabricacion` e `instalacion` (cotizando, bobinado, ensamble, agendado, etc.) no aparecen como opciones de filtro.

7. **`static/js/crm.js:saveFactura()` — `fetch(API + url, ...)`** usa `API` absoluto en vez de path relativo  
   En otras funciones se usa `fetch('/api/...')` (relativo). En la sección de facturación se usa `fetch(API + '/api/...')` que funcionará igual mientras `API = window.location.origin`, pero es inconsistente y duplica el origen.

8. **Posible Null Ref en `showPaymentModal()` y otras funciones**  
   `modalInstance.show()` se llama sin verificar que `modalInstance` no sea null (aunque se inicializa en `setModal()`). Si `setModal()` no se llamó antes, lanza `Cannot read properties of null`.

---

## 🔵 Mejoras (código defensivo)

1. **`static/js/crm.js:savePayment()` — `document.getElementById('payMonto')?.value`**  
   Usa optional chaining (`?.`) para acceder al valor, pero no verifica que el elemento exista. Si el modal se cerró, `monto` será `undefined` y la validación `if (!monto || parseFloat(monto) <= 0)` convertirá `undefined` a `NaN`, mostrando un toast genérico sin claridad.

2. **`app/routes/api_bot.py:19` — `api_bot_config` permite GET sin auth desde localhost**  
   Diseñado así a propósito para que el bot lea su config, pero la verificación `is_local` no contempla proxies inversos (el header `X-Forwarded-For` no se revisa).

3. **`app/routes/api_leads.py:163` — `api_leads_from_bot` permite POST sin auth desde cualquier IP si usa `CF-Connecting-IP`**  
   Condición: `if remote not in ('127.0.0.1', 'localhost', '::1'): if request.headers.get('CF-Connecting-IP'): return 403`. Si viene de Cloudflare, bloquea. Pero si viene directo desde internet sin CF, pasa (porque `remote` no es localhost). Intencionalmente restringido pero frágil.

4. **`static/js/crm.js:2112` — `resp.json().catch(()=>({}))`**  
   Buen manejo defensivo (evita crash si el body no es JSON), pero se usa en un solo lugar. El resto del código asume que `resp.json()` nunca falla.

5. **Sugerencia: unificar `escHtml`/`escapeHtml`** — Mantener solo una función y eliminar la otra para reducir confusión.

6. **Sugerencia: wrapper `apiFetch` global** — Reemplazar los `fetch` directos (especialmente en facturación) con un helper que maneje errores de red, sesión expirada, y parsing de JSON automáticamente.

---

## 📊 Estadísticas

| Métrica | Valor |
|---------|-------|
| Total funciones JS | 196 (94 async) |
| Total endpoints Python | 91 |
| Llamadas `fetch` totales | ~105 |
| Llamadas `fetch` sin `.catch()` | ~100 (la mayoría usan `fetchJSON` que sí tiene try/catch) |
| Funciones JS llamadas pero no definidas | 4 (`renderLeads`, `renderClients`, `renderWorkOrders`, `toastMsg`) |
| Endpoints sin `@login_required` que lo necesitan | 6 |
| Bloques de código muerto (dead code) | 2 (api_leads.py, views.py) |
| HTML → JS mismatches de IDs/funciones | 6 referencias a funciones inexistentes |
| Endpoints definidos sin ruta en backend | 1 (`PUT /api/work_orders/<id>/payments/<int>`) |
| `<div>` sin cerrar en templates | 0 (todos los templates tienen tags balanceados) |
