# Esquema de Datos — HTK INGENIERIA

## 📁 leads.json
```json
{
  "id": "string (único)",
  "nombre": "string",
  "empresa": "string",
  "contacto": "string (teléfono/email)",
  "fuente": "referido | web | llamada | feria | alianza",
  "linea_interes": "automatizacion | iot | mantenimiento | cargadores",
  "estado": "nuevo | contactado | cotizado | negociacion | ganado | perdido",
  "fecha_creacion": "ISO date",
  "ultimo_contacto": "ISO date",
  "proximo_seguimiento": "ISO date | null",
  "notas": "string",
  "valor_estimado": "number (COP)"
}
```

## 📁 projects.json
```json
{
  "id": "string (único)",
  "nombre": "string",
  "cliente_id": "string",
  "linea_servicio": "automatizacion | iot | mantenimiento | cargadores",
  "descripcion": "string",
  "presupuesto": "number (COP)",
  "costos_acumulados": "number (COP)",
  "estado": "cotizado | en_ejecucion | pausado | completado | facturado",
  "fecha_inicio": "ISO date | null",
  "fecha_estimada_fin": "ISO date | null",
  "fecha_real_fin": "ISO date | null",
  "responsable": "string",
  "hitos": [
    {
      "nombre": "string",
      "fecha_estimada": "ISO date",
      "fecha_real": "ISO date | null",
      "completado": "boolean"
    }
  ],
  "documentos_tecnicos": ["string (rutas/urls)"]
}
```

## 📁 transactions.json
```json
{
  "id": "string (único)",
  "tipo": "ingreso | gasto",
  "categoria": "servicio | material | nomina | transporte | herramienta | subcontrato | otro",
  "monto": "number (COP)",
  "fecha": "ISO date",
  "proyecto_id": "string | null",
  "descripcion": "string",
  "proveedor_cliente": "string",
  "factura_asociada": "string | null",
  "estado_pago": "pendiente | pagado | vencido"
}
```

## 📁 work_orders.json
```json
{
  "id": "string (HTK-001, HTK-002...)",
  "cliente": {
    "nombre": "string",
    "telefono": "string (E.164: +57XXXXXXXXX)"
  },
  "equipo": {
    "tipo": "aire_acondicionado | lavadora | refrigerador | plc | variador | fuente | electrodomestico | cargador | otro",
    "marca": "string",
    "modelo": "string"
  },
  "falla_reportada": "string",
  "diagnostico": "string | null",
  "presupuesto": "number (COP) | null",
  "estado": "recibido | diagnosticando | presupuestado | aprobado | reparando | esperando_repuestos | completado | entregado | cancelado",
  "historial": [
    {
      "fecha": "ISO date",
      "estado": "string",
      "descripcion": "string",
      "notificado": "boolean"
    }
  ],
  "fechas": {
    "recibido": "ISO date | null",
    "diagnostico": "ISO date | null",
    "presupuesto_aprobado": "ISO date | null",
    "completado": "ISO date | null",
    "entregado": "ISO date | null"
  },
  "notas_internas": "string",
  "activo": "boolean"
}
```

## 📁 interactions.json — Auditoría de conversaciones
```json
{
  "id": "string (único)",
  "cliente": {
    "nombre": "string (si se capturó)",
    "telefono": "string (E.164)"
  },
  "tipo": "entrante | saliente",
  "canal": "whatsapp",
  "mensaje_cliente": "string",
  "respuesta_bot": "string",
  "opcion_elegida": "number | null",
  "timestamp": "ISO date",
  "derivado_a": null
}
```

## 📁 clients.json — Ficha unificada de cliente
```json
{
  "id": "string (único)",
  "telefono": "string (E.164)",
  "nombre": "string",
  "fuente": "whatsapp | prospeccion | referido | web | otro",
  "primer_contacto": "ISO date",
  "ultimo_contacto": "ISO date",
  "interacciones_totales": "number",
  "estado": "lead | contacto | cliente | inactivo",
  "segmento": "taller | fabrica | distribuidor | consumidor",
  "linea_interes": "automatizacion | iot | mantenimiento | cargadores | varios",
  "ordenes": ["HTK-001", "HTK-002..."],
  "lead_id": "PRO-XXX | null",
  "notas": "string"
}
```

## 📁 inventory.json
```json
{
  "id": "string (único)",
  "nombre": "string",
  "tipo": "componente | herramienta | repuesto | consumible",
  "cantidad": "number",
  "unidad": "unidad | metro | kg | litro | par",
  "ubicacion": "string",
  "proveedor": "string",
  "precio_unitario": "number (COP)",
  "stock_minimo": "number",
  "ultima_actualizacion": "ISO date"
}
```
