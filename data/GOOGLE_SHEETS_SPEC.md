# 📊 Google Sheets — CRM HTK INGENIERIA
## Especificación profesional del sistema de gestión

---

## 🏗️ Estructura general

**Archivo:** `HTK CRM — [Año]`
**URL:** sheets.new → nombrar: `HTK CRM 2026`
**Propietario:** Pedro Castro
**Permisos:** Solo lectura para el service account del bot

### Pestañas (tabs):

| # | Pestaña | Función |
|---|---|---|
| 1 | `📊 Dashboard` | KPIs generales, métricas en tiempo real |
| 2 | `📦 Precios` | Catálogo de productos con precios dinámicos |
| 3 | `👥 Leads` | Captura de leads desde WhatsApp |
| 4 | `👤 Clientes` | Base de datos de clientes |
| 5 | `💰 Ventas` | Pipeline de cotizaciones y ventas cerradas |
| 6 | `📞 Seguimiento` | Tareas de seguimiento y recordatorios |
| 7 | `📈 Métricas` | Análisis mensual, trimestral y anual |

---

## 📋 PESTAÑA 1: Dashboard

> Resumen ejecutivo. Se actualiza solo con fórmulas. NO se edita manualmente.

| Celda | Contenido | Fórmula / Nota |
|---|---|---|
| A1 | **HTK INGENIERIA — Dashboard** | Título |
| A3 | Leads nuevos (hoy) | `=COUNTIF(Leads!A:A, TODAY())` |
| A4 | Leads nuevos (semana) | `=COUNTIFS(Leads!A:A, ">="&TODAY()-7, Leads!A:A, "<="&TODAY())` |
| A5 | Leads nuevos (mes) | `=COUNTIFS(Leads!A:A, ">="&EOMONTH(TODAY(),-1)+1, Leads!A:A, "<="&TODAY())` |
| A7 | Leads por atender | `=COUNTIF(Leads!F:F, "NO")` |
| A8 | Ventas este mes | `=SUMIFS(Ventas!E:E, Ventas!A:A, ">="&EOMONTH(TODAY(),-1)+1)` |
| A9 | Tasa de conversión | `=SI(Leads totales>0, Ventas cerradas/Leads totales*100, 0)` |
| A11 | Producto más cotizado | `=MODE.SNGL(FILTER(Leads!D:D, Leads!D:D<>""))` |
| A12 | Último lead registrado | `=MAX(Leads!A:A)` |
| B3:B12 | (valores numéricos) | Formato: número / moneda / % |

**Formato condicional:**
- Leads por atender > 10 → fondo rojo suave
- Tasa de conversión < 20% → texto naranja

---

## 📋 PESTAÑA 2: Precios

> Catálogo de productos. EDITABLE por Pedro. El bot lee esta hoja.

| Col | Encabezado | Tipo | Ejemplo | Notas |
|---|---|---|---|---|
| A | **ID** | Texto | ELE-001 | Código único del producto |
| B | **Categoría** | Lista | Elevador / Estabilizador / Servicio | Validación de datos |
| C | **Tipo** | Texto | Monofásico / Trifásico / Residencial | |
| D | **Producto** | Texto | Elevador de voltaje manual 5kVA | Nombre comercial |
| E | **Capacidad** | Texto | 5 kVA | |
| F | **Precio base** | Moneda | $450.000 | En COP |
| G | **Precio venta** | Moneda | $550.000 | `=F*1.22` (margen editable) |
| H | **Plazo fabricación** | Texto | 3 días | |
| I | **Incluye instalación** | Checkbox | ☐ / ☑ | |
| J | **Garantía** | Texto | 1 año | |
| K | **Notas** | Texto | Incluye transporte B/quilla | |
| L | **Disponible** | Checkbox | ☑ | Si no, el bot no lo muestra |
| M | **Actualizado** | Fecha | =NOW() | Fecha de última modificación |

**Extra:** Fila 1 congelada. Alternar colores por categoría.
**Validación:** Col B = lista desplegable (Elevador / Estabilizador / Reparación / Otro)

---

## 📋 PESTAÑA 3: Leads

> Captura automática desde WhatsApp. SOLO escritura por el bot, lectura por Pedro.

| Col | Encabezado | Tipo | Origen | Notas |
|---|---|---|---|---|
| A | **Fecha** | Fecha-hora | Automático | Formato: DD/MM/AAAA HH:MM |
| B | **Teléfono** | Texto | Automático | +57 300 000 0000 |
| C | **Nombre** | Texto | Automático | Desde perfil WhatsApp |
| D | **Canal** | Texto | Automático | "WhatsApp" |
| E | **Opción** | Texto | Automático | Reparación / Elevador / Estabilizador / FAQ / etc |
| F | **Detalle** | Texto | Automático | Lo que escribió el cliente |
| G | **Atendido** | Checkbox | Manual | ☐ = pendiente, ☑ = contactado |
| H | **Contactado fecha** | Fecha | Manual | Cuándo lo llamaste |
| I | **Resultado** | Lista | Manual | Interesado / No contesta / No interesado / Cotizado / Vendido |
| J | **Valor estimado** | Moneda | Manual | Posible valor de la venta |
| K | **Notas** | Texto | Manual | Notas internas |
| L | **Convertido a cliente** | Checkbox | Manual | ☑ → pasa automático a pestaña Clientes |
| M | **ID Lead** | Fórmula | Automático | `=ROW()-1` |

**Formato condicional:**
- Atendido = NO y Fecha > 2 días → fondo amarillo
- Atendido = NO y Fecha > 7 días → fondo rojo

---

## 📋 PESTAÑA 4: Clientes

> Base de datos maestra de clientes. Se alimenta desde Leads.

| Col | Encabezado | Tipo | Notas |
|---|---|---|---|
| A | **ID Cliente** | Fórmula | CLI-001, CLI-002... |
| B | **Nombre** | Texto | |
| C | **Teléfono** | Texto | |
| D | **Email** | Texto | Opcional |
| E | **Dirección** | Texto | |
| F | **Ciudad** | Texto | |
| G | **Primer contacto** | Fecha | |
| H | **Último contacto** | Fecha | |
| I | **Total compras** | Moneda | Suma desde Ventas |
| J | **# Compras** | Número | Contar desde Ventas |
| K | **Clasificación** | Lista | Regular / Frecuente / VIP |
| L | **Notas** | Texto | |

---

## 📋 PESTAÑA 5: Ventas

> Pipeline de cotizaciones y ventas cerradas.

| Col | Encabezado | Tipo | Notas |
|---|---|---|---|
| A | **ID Venta** | Fórmula | VTA-001 |
| B | **Fecha cotización** | Fecha | |
| C | **ID Lead** | Texto | Enlace al lead original |
| D | **Cliente** | Texto | |
| E | **Producto** | Texto | |
| F | **Capacidad** | Texto | |
| G | **Valor cotizado** | Moneda | |
| H | **Valor vendido** | Moneda | |
| I | **Estado** | Lista | Cotizado / Aprobado / En fabricación / Entregado / Cancelado |
| J | **Depósito (50%)** | Moneda | |
| K | **Saldo (50%)** | Moneda | |
| L | **Fecha inicio fab.** | Fecha | |
| L | **Fecha entrega** | Fecha | |
| M | **Notas** | Texto | |

**Formato condicional:**
- Estado = Cotizado → naranja
- Estado = Aprobado → azul
- Estado = Entregado → verde
- Estado = Cancelado → rojo tachado

---

## 📋 PESTAÑA 6: Seguimiento

> Tareas de seguimiento tipo kanban.

| Col | Encabezado | Tipo | Notas |
|---|---|---|---|
| A | **Fecha creación** | Fecha | |
| B | **Vence** | Fecha | |
| C | **Cliente/Lead** | Texto | |
| D | **Tarea** | Texto | Llamar / Enviar cotización / Recordatorio / Post-venta |
| E | **Estado** | Lista | Pendiente / En proceso / Completada / Cancelada |
| F | **Prioridad** | Lista | Alta / Media / Baja |
| G | **Notas** | Texto | |
| H | **Completada** | Checkbox | |

---

## 📋 PESTAÑA 7: Métricas

> Análisis mensual. Se completa mensualmente o con fórmulas.

| Sección | Contenido | Fórmula / Nota |
|---|---|---|
| **Resumen mensual** | Mes / Leads / Cotizaciones / Ventas / Ingresos | `=SUMAPRODUCTO(...)` |
| **Por producto** | Producto / Veces cotizado / Veces vendido / Ingreso total | |
| **Por canal** | WhatsApp / Referido / Web / Otro | |
| **Tasa de conversión** | Leads → Cotización → Venta | % mensual y acumulado |
| **Tiempo promedio** | Días desde lead hasta venta cerrada | |
| **Top 5 productos** | Ranking de productos más vendidos | `=SORT(...)` |
| **Gráficos** | Ventas por mes (torta/barras) | Insertar gráfico |

**Ejemplo tabla resumen mensual:**

| Mes | Leads | Cotizados | Vendidos | Ingresos | Conversión |
|---|---|---|---|---|---|
| Enero | 15 | 8 | 3 | $2.500.000 | 20% |
| Febrero | 22 | 12 | 5 | $4.200.000 | 23% |
| ... | | | | | |

---

## ⚙️ Automatizaciones recomendadas (Google Apps Script)

Las siguientes automatizaciones se pueden agregar con un script simple:

1. **Al marcar "Convertido a cliente" en Leads** → crear automáticamente el registro en Clientes
2. **Al cerrar una venta** → actualizar Total compras del cliente
3. **Alerta semanal** → enviar correo a Pedro si hay leads sin atender >5 días
4. **Backup automático** → duplicar la hoja cada fin de semana

---

## 🔐 Seguridad y acceso

- **Service Account (bot):** Solo lectura en Precios. Solo escritura en Leads.
- **Pedro:** Control total.
- **Ingenieros (opcional):** Solo lectura en Leads, Seguimiento y Dashboard.

---

## ✅ Resumen para crear la hoja

1. Crear archivo nuevo en [sheets.new](https://sheets.new)
2. Nombrarlo: `HTK CRM 2026`
3. Crear 7 pestañas con los nombres exactos:
   - `📊 Dashboard`
   - `📦 Precios`
   - `👥 Leads`
   - `👤 Clientes`
   - `💰 Ventas`
   - `📞 Seguimiento`
   - `📈 Métricas`
4. Configurar headers en cada pestaña según lo descrito
5. Aplicar formatos condicionales
6. Compartir con el service account (cuando se cree)
7. Copiar el Sheet ID de la URL y guardarlo

---

*Documento generado para HTK INGENIERIA — Mayo 2026*
