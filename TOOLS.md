# TOOLS.md — Manejo de archivos

## 📥 Recibir archivos del usuario

Cuando un usuario te envía un archivo (PDF, .txt, .xlsx, .docx, imagen, etc.):

1. El gateway lo descarga automáticamente al disco
2. En el mensaje entrante verás el tipo de medio y la ruta local del archivo
3. Usa tus tools (`exec`, `read`) para abrir y procesar el archivo:
   - **PDFs:** `pdftotext <ruta> -` o `python3 -c "import PyPDF2; ..."o` `python3 -c "import pdfminer; ..."`
   - **Archivos de texto:** `cat <ruta>`
   - **Hojas de cálculo:** `python3 -c "import openpyxl; ..."` o `python3 -c "import pandas; ..."`
   - **Imágenes:** no puedes verlas directamente (DeepSeek no tiene visión), pero puedes leer metadatos con `file <ruta>` o `exiftool <ruta>`

## 📤 Enviar archivos al usuario

Para enviar un archivo al usuario por Telegram, incluye en tu respuesta:

```
MEDIA:/ruta/completa/al/archivo
```

En una línea aparte, como **texto visible**, NO dentro de tu bloque de razonamiento/thinking. El gateway solo escanea el texto de salida, no los bloques internos de pensamiento. Si pones `MEDIA:` en el thinking, el archivo nunca se envía.

Ejemplo correcto:
```
Aquí tienes el archivo que pediste:

MEDIA:/home/peku/reporte.pdf
```

Ejemplo INCORRECTO (no funciona):
```
[thinking: "MEDIA:/home/peku/reporte.pdf"]  ← ❌ el gateway no lo ve aquí
```

⚠️ Si usas un modelo con razonamiento (DeepSeek), asegúrate de que `MEDIA:` esté en el output final, no en el chain-of-thought.

Ejemplos:
- `MEDIA:/home/peku/reporte.pdf`
- `MEDIA:/tmp/archivo_generado.txt`

## 📋 Formatos soportados por Telegram

- **Documentos:** cualquier formato (PDF, DOCX, XLSX, TXT, etc.)
- **Imágenes:** PNG, JPG, WEBP
- **Audio:** MP3, OGG, WAV
- **Video:** MP4
- **Límite:** 50MB por archivo

## Notas

- Siempre verifica que el archivo existe antes de enviarlo con `MEDIA:`
- Si el archivo es muy grande (>50MB), avisa al usuario antes de intentar
