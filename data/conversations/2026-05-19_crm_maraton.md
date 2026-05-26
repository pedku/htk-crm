# Conversación — 2026-05-19 (09:12–20:17 COT) — Maratón CRM

## Resumen
Sesión intensiva de 11 horas resolviendo múltiples bugs y features del CRM HTK.

## Hitos Completados

### 1. PR #1: modular-frontend → main ✅
- Creado y mergeado via GitHub API (OAuth device flow)
- Commit `6b423ab`: 36 archivos, +10,929 líneas

### 2. Ramas ✅
- `modular-frontend` renombrada a `dev`
- `dev` local y remoto creados
- `main` actualizado con todo el código modular

### 3. Servicios ✅
- `htk-crm.service`: producción en `run.py` puerto 18800
- `htk-crm-dev.service`: dev en `run_dev.py` puerto 18801
- `htk-crm-web.service`: detectado y DESHABILITADO (servía CRM viejo en 18800)

### 4. Bug crítico: Pestañas de Configuración ✅
- **Causa raíz**: `<div>` sin cerrar en `config.html` (9 opens, 8 closes)
- `config-tab-bot` anidado como HIJO de `config-tab-general` en vez de hermano
- Al ocultar General (display:none), todos los subtabs desaparecían
- **Fix**: `</div>` faltante en `config.html` + `</div>` extra en `base.html`
- Debug: diagnóstico de ancestros con `getComputedStyle` + `getBoundingClientRect`

### 5. Dropdown de Fases OT ✅
- Modal permite saltar a cualquier fase con `force:true`

### 6. Gestión del Bot desde CRM ✅
- Sección Conexión renovada: Start/Stop/Restart/Escanear QR
- Visor de logs en tiempo real
- `/api/bot/qr`, `/api/bot/start`, `/api/bot/stop`, `/api/bot/qr-status`
- QR auth integrado: bot.js guarda QR como PNG al generarlo

### 7. Commits en dev
```
905d97e fix: QR auth v2 — bot genera QR internamente, frontend simplificado
9b022c8 feat: QR auth independiente desde CRM + qr-auth.js con auto-deteccion
aefd4b9 fix: div balance en config.html + gestion bot desde CRM + force status dropdown
```

## Pendientes
- QR auth: el bot se conecta pero el frontend no detecta (polling bug)
- Bot WhatsApp: sesión guardada pero no reutilizada al reiniciar
