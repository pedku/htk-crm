# BUG REPORT — CRM HTK v3 (dev)

## 🔴 Critical (3)

| # | File | Issue | Impact | Fix |
|---|---|---|---|---|
| C1 | `index.html` L5074 | `checkBotStatus()` no maneja 401/auth | Si sesión expira, muestra "Bot offline" aunque esté online | Manejar `resp.status === 401`, también `connected: false` vs `status: on` |
| C2 | `api_bot.py` | No existe `POST /api/bot/restart` | Imposible reiniciar el bot desde el CRM | Crear endpoint con systemd user service |
| C3 | `index.html` config tab | `loadBotConfig` usa `/api/bot/config?verbose=1` pero el endpoint pide auth para PUT; la carga GET funciona solo si el bot ya tiene config seeds | Config tab siempre vacío sin datos iniciales | Asegurar seeds en init_db, mejorar manejo de errores |

## 🟡 Medium (5)

| # | File | Issue | Impact | Fix |
|---|---|---|---|---|
| M1 | `index.html` dashboard | `loadDashboard()` no tiene `.catch()` — si `/api/stats` falla, el dashboard queda en blanco sin mensaje | Usuario ve loading infinito | Agregar try/catch + mensaje "Error al cargar" |
| M2 | `index.html` L1911 | `loadKanban()` no tiene `.catch()` | Kanban en blanco si falla la API | try/catch + empty state |
| M3 | `index.html` client tab | `renderClients()` muestra tabla vacía sin mensaje cuando hay 0 clientes | Parece bug cuando es solo falta de datos | Mostrar "No hay clientes aún" |
| M4 | `api_clients.py` L81 | `api_client(client_id)` devuelve 404 sin mensaje útil | Difícil debuggear | Devolver `{error: "Cliente no encontrado"}` |
| M5 | `index.html` wo tab | `loadWorkOrders()` no tiene `.catch()` — mismo problema que dashboard | Tabla en blanco sin feedback | try/catch + empty state |

## 🟢 Low (3)

| # | File | Issue | Impact | Fix |
|---|---|---|---|---|
| L1 | `index.html` | Muchas funciones duplican `escapeHtml` con ligeras diferencias | JS innecesariamente largo | Consolidar en una función |
| L2 | `api_misc.py` | `/api/pitches` usa `PITCHES_PATH` hardcodeado | Si cambia ubicación, se rompe | Usar path relativo al proyecto |
| L3 | `index.html` | Toast notifications no tienen timeout configurable | Toasts se quedan fijos | Agregar duración configurable |
