# Conversación 2026-05-27 — S3: PDF, WhatsApp, Drive & Skills

## Temas tratados

### Envío de facturas por WhatsApp
- Bug: enviaba HTML como "PDF" (solo HTML view)
- Bug: bot se caía porque pdf-gen.js (puppeteer) usaba el mismo Chrome que el bot
- Fix: reemplazado puppeteer por **WeasyPrint** (Python, sin navegador, 2s)
- Nuevo flujo: HTML→PDF (2s) → Bot WhatsApp → Drive > Facturas

### Google Drive
- Carpeta "Facturas" encontrada en Drive (ID: 1iCIFtVBh4feypxGe-s3bM3VMA72Jat0r)
- PDF se sube automáticamente después de generar
- Token OAuth configurado con refresh automático

### Auto-notificación al pagar
- Al marcar factura como "pagada", se envía PDF automático en background
- Mensaje: "⚡ HTK INGENIERIA — Factura FAC-XXXX ✅ PAGADA"

### Fixes al bot
- Inactividad: 5→10min aviso, 10→15min cierre
- Notificaciones automáticas ya no activan monitoreo de inactividad
- Se mataba al lanzar Chrome → ahora WeasyPrint no necesita Chrome

### Skills instaladas
- data-enricher, action-suggester, daily-report, biz-reporter, ai-lead-generator-skill
- gog (Google Workspace CLI) - Gmail, Calendar, Drive conectados

### Repositorio personal
- `pedku/htk-agent-config` (privado) creado y pusheado
- MEMORY.md sanitizada (sin datos de clientes ni credenciales)

## Archivos modificados
- `crm/app/routes/api_invoices.py` - PDF gen, auto-envío, puerto 18800
- `htk-whatsapp-bot/bot.js` - send-document endpoint, timing inactividad, fix monitoreo
- `htk-whatsapp-bot/pdf-gen.py` (nuevo) - WeasyPrint PDF generator
- `htk-whatsapp-bot/pdf-gen.js` (legacy) - reemplazado por .py

## Pendiente
- Revocar token GitHub
- Places API para enriquecer leads
- Probar daily-report y action-suggester
