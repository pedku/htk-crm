---
name: communication-best-practices
description: Buenas prácticas para envío de correos electrónicos (vía gog/Gmail API) y mensajes WhatsApp (vía bot API). Cubre formato correcto de mensajes, uso de body-file vs inline, adjuntos, personalización de pitches, y registro de interacciones. Use when sending emails, WhatsApp messages, or any outreach communication to leads or clients.
---

# Buenas Prácticas — Envío de Correos y WhatsApp

## 1. 📧 Envío de Emails (gog Gmail API)

### Regla de oro: SIEMPRE usar `--body-file`
NUNCA pasar el cuerpo del email inline con `--body`. Los saltos de línea `\n` en shell se renderizan como texto literal.

**✅ Correcto:**
```bash
gog --access-token="$TOKEN" gmail send \
  --to="cliente@email.com" \
  --subject="Asunto profesional" \
  --body-file="/ruta/al/archivo.txt" \
  --from="info@htk-ingenieria.com" \
  --no-input
```

**❌ Incorrecto:**
```bash
gog --access-token="$TOKEN" gmail send \
  --to="cliente@email.com" \
  --subject="Asunto" \
  --body="Texto con \n que quedan literales" \
  --from="info@htk-ingenieria.com"
```

### Crear archivo de cuerpo (body file)
Siempre escribir el contenido en un archivo temporal o permanente usando un heredoc:

```bash
cat > /tmp/email_body.txt << 'EOF'
Buenos días,

Texto del mensaje con formato limpio.
Párrafos separados por línea en blanco.

Saludos,
Pedro Castro
HTK INGENIERÍA
EOF
```

### Estructura estándar de un email de prospección

```
1. Saludo cordial → "Buenos días,"
2. Presentación → "Soy Pedro Castro, de HTK INGENIERÍA..."
3. Contexto → "Les escribo porque..."
4. Propuesta de valor → "Nosotros podemos ayudarles con..."
5. Call to action → "¿Le gustaría conversar?"
6. Despedida → "Quedo atento, Pedro Castro..."
7. Firma completa → nombre, cargo, teléfono, email, ubicación
```

### Adjuntar archivos
Usar `--attach` (repetible para múltiples archivos):
```bash
  --attach="/ruta/portafolio.pdf"
```

### Enviar a múltiples destinatarios
```bash
  --to="email1@dominio.com,email2@dominio.com"
```

### Obtener token de autenticación
```bash
source /home/peku/.local/bin/gog-auth.sh && TOKEN=$(get_token)
```
El token expira en ~1 hora. Renovarlo para cada batch de envíos.

---

## 2. 💬 Envío de WhatsApp (Bot API)

### API endpoint
```
POST http://localhost:18802/send
Content-Type: application/json

{
  "to": "573XXXXXXXXX",
  "message": "Texto del mensaje..."
}
```

### Reglas del número
- Formato: código país + número sin espacios ni signos
- Colombia: `57300XXXXXXX` (57 + 300XXXXXXX)
- NO incluir `+`, espacios, ni guiones
- El bot normaliza automáticamente agregando `@c.us`

### Estructura del mensaje JSON
Usar `curl` con `-d` y el JSON en comillas simples para preservar saltos de línea literales (`\n`):

```bash
curl -s -X POST http://localhost:18802/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "57300XXXXXXX",
    "message": "Buenos días, ¿cómo está?\n\nSoy Pedro Castro, de HTK INGENIERÍA en Barranquilla.\n\n[Texto del pitch...]\n\nQuedo atento."
  }'
```

**⚠️ Importante:** Los `\n` DENTRO de comillas simples en JSON SÍ funcionan como saltos de línea. Es diferente a pasarlos como argumento de shell.

### Verificar que el bot está operativo
Antes de enviar, confirmar que el bot muestra en logs:
```
✅ Bot HTK conectado y listo.
📨 API de envío en http://localhost:18802/send
```
Si no, reiniciar: matar proceso anterior, liberar puerto 18802, iniciar de nuevo.

### Respuesta de la API
```json
{"ok":true,"to":"57300XXXXXXX@c.us"}
```

---

## 3. 📝 Registro de interacciones en CRM

Después de cada envío, actualizar el lead:

```python
import sqlite3, json
db = sqlite3.connect('/home/peku/.openclaw/workspace/crm/htk_crm.db')

# Actualizar estado y próximo seguimiento
db.execute("""
    UPDATE leads 
    SET estado='contactado', 
        proximo_seguimiento='YYYY-MM-DDTHH:MM:SS'
    WHERE id=?
""", (lead_id,))

# Insertar interacción
db.execute("""
    INSERT INTO interactions 
    (id, lead_id, lead_nombre, tipo, direccion, resumen, detalle, fecha, proximo_paso, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (interaction_id, lead_id, nombre, canal, 'enviado', resumen, detalle, now, proximo_paso, 'enviado'))
```

---

## 4. ✅ Checklist de pre-envío

Antes de enviar cualquier comunicación:

- [ ] **Destinatario correcto** — verificar email/tel en CRM
- [ ] **Formato del cuerpo** — ¿es un archivo externo o JSON con `\n`?
- [ ] **Personalización** — ¿usa el nombre del lead o es genérico?
- [ ] **Pitch correcto** — ¿corresponde al segmento del lead?
- [ ] **Horario laboral** — Lun-Vie 8-18, Sáb 8-13
- [ ] **Adjuntos** — si aplica, ¿están incluidos?
- [ ] **Firma** — ¿tiene nombre, cargo, teléfono, email?
- [ ] **Call to action claro** — ¿sabe el lead qué hacer después de leer?

---

## 5. 🔄 Flujo completo: envío + registro

```
1. Extraer datos del lead del CRM (SQLite o JSON)
2. Seleccionar plantilla de pitches.json según segmento
3. Personalizar mensaje con nombre del lead
4. Elegir canal: email (gog) o WhatsApp (bot API)
5. Crear body-file para email o JSON para WhatsApp
6. Enviar
7. Verificar éxito (message_id / ok:true)
8. Registrar interacción en CRM (estado → contactado)
9. Programar próximo seguimiento (2-7 días)
```

---

## 6. ⚠️ Errores comunes y solución

| Error | Causa | Solución |
|-------|-------|----------|
| `\n` literal en email | `--body` con `\n` en shell | Usar `--body-file` |
| `Cannot read properties of undefined` en WhatsApp | Bot no inicializado | Verificar logs, reiniciar bot |
| `Puerto 18802 ya en uso` | Proceso zombie anterior | `fuser -k 18802/tcp` |
| `The browser is already running` | Chrome zombie de sesión anterior | Matar procesos Chrome de `session-htk-bot` |
| Token expirado | Token > 1 hora | Renovar con `source gog-auth.sh && TOKEN=$(get_token)` |
