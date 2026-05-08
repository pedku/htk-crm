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

En una línea aparte. El gateway lo enviará como attachment nativo.

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
