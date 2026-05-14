# Plan Técnico: Resolución de @lid → @c.us en WhatsApp Bot

> **Fecha:** 2026-05-12  
> **Stack:** Node.js + whatsapp-web.js (Puppeteer) | Flask + SQLite (CRM)  
> **Problema:** Usuarios sin el bot en contactos responden desde `@lid` en vez de `@c.us`, rompiendo la trazabilidad CRM.

---

## 1. Entendiendo el problema

### 1.1 ¿Qué es @lid?

WhatsApp implementó **LID (Linked Identifier)** como ID anónimo por usuario. Es un `bigint` único por conversación. Cuando un usuario NO tiene al negocio en sus contactos, WhatsApp oculta su número real y entrega la respuesta desde `@lid`.

```
Flujo actual (roto):
  Bot → "Hola Juan" → 573001234567@c.us  ✅
  Usuario responde "Hola" → 839273645123@lid  ❌ (¿quién es?)
```

### 1.2 Por qué sucede

- **Grupos/Comunidades:** Admin activó "ocultar números" → todos los no-admins aparecen como @lid
- **Chats 1:1 nuevos:** Si el usuario nunca ha guardado al negocio como contacto, WhatsApp enmascara el número en la respuesta (política de privacidad activa desde ~2024)
- **Multi-device:** El protocolo MD usa LIDs internamente para todas las resoluciones

### 1.3 Lo que WhatsApp SÍ sabe internamente

El protocolo nativo de WhatsApp (usado por whatsmeow, WAHA, Baileys) mantiene una **tabla de mapeo bidireccional** en su store interno:

```
Store.LIDs = Map<lid_string, phone_jid>
```

Esto significa que **sí se puede resolver**, pero whatsapp-web.js (por ser browser automation) no expone ese store directamente. Hay que extraerlo.

---

## 2. Estrategia de Solución: 4 Capas

Diseñamos un sistema de resolución en cascada. Si una capa falla, pasa a la siguiente:

```
     ╔══════════════════════════════════════════╗
     ║   Mensaje recibido desde @lid            ║
     ╚════════════╤═════════════════════════════╝
                  │
     ┌────────────▼────────────┐
     │ CAPA 1: quotedMsg       │ ← Más confiable, instantánea
     │ (reply matching)        │
     └────────────┬────────────┘
                  │ falla (no es reply)
     ┌────────────▼────────────┐
     │ CAPA 2: LID Store       │ ← Acceso directo al store de WA Web
     │ (page.evaluate IndexedDB)│
     └────────────┬────────────┘
                  │ falla (no cacheado aún)
     ┌────────────▼────────────┐
     │ CAPA 3: Temporal Window │ ← Correlación por ventana de tiempo
     │ (time-correlation)      │
     └────────────┬────────────┘
                  │ falla
     ┌────────────▼────────────┐
     │ CAPA 4: getChatById     │ ← Forzar resolución desde WA Web
     │ (chat metadata parsing) │
     └────────────┬────────────┘
                  │ falla
     ┌────────────▼────────────┐
     │ CAPA 5: Plan B          │ ← Pedir datos sin preguntar número
     │ (contextual prompt)     │
     └─────────────────────────┘
```

---

## 2.1 CAPA 1 — Reply Matching por quotedMsg (PRIMARIA)

### Mecanismo

Cuando el bot envía un mensaje a `573001234567@c.us`, WhatsApp asigna un `id` único (tipo `stanzaId` o `msgId`). Ese ID se guarda en el CRM.

Cuando el usuario **responde directamente** a ese mensaje, el objeto `Message` en whatsapp-web.js contiene:

```javascript
{
  from: "839273645123@lid",
  body: "Hola, necesito ayuda",
  hasQuotedMsg: true,
  quotedMsg: {
    id: {
      _serialized: "true_573001234567@c.us_BAE5A1F8A2B3C4D5",  // ← nuestro msgId
      fromMe: true,                                              // ← confirma que fue enviado por el bot
    }
  }
}
```

### Flujo en el bot

```
1. Bot envía mensaje a 573001234567@c.us
   ↓
2. WhatsApp retorna el objeto Message con msg.id._serialized
   ↓
3. Bot registra en tabla outbound_messages:
   {
     stanza_id: "true_573001234567@c.us_BAE5A1F8A2B3C4D5",
     lead_id: 42,
     phone: "573001234567",
     sent_at: "2026-05-12T17:00:00Z"
   }
   ↓
4. Usuario responde, llega desde 839273645123@lid con quotedMsg
   ↓
5. Bot busca en outbound_messages por stanza_id del quotedMsg
   → Encuentra lead_id: 42, phone: "573001234567"
   ↓
6. Bot actualiza tabla lid_resolutions:
   { lid: "839273645123@lid", phone: "573001234567@c.us", lead_id: 42 }
   ↓
7. Próximos mensajes de este @lid ya se resuelven por caché (sin necesidad de quotedMsg)
```

### Código conceptual (bot WhatsApp)

```javascript
// En el handler de message_create
client.on('message_create', async (msg) => {
  if (msg.fromMe) {
    // Es un mensaje saliente del bot → registrar para futura resolución
    await registerOutboundMessage({
      stanza_id: msg.id._serialized,
      recipient: msg.to,  // "573001234567@c.us"
      lead_id: currentLeadId,
      sent_at: new Date().toISOString()
    });
  }
});

// En el handler de message (entrantes)
client.on('message', async (msg) => {
  const from = msg.from;  // podría ser @lid

  if (from.endsWith('@lid')) {
    let phone = await resolveLid(from, msg);

    if (!phone) {
      // No se pudo resolver → cola de revisión manual
      await queueForManualReview(msg);
      return;
    }

    // phone resuelto → procesar normalmente
    msg._resolvedPhone = phone;
  }

  await processIncomingMessage(msg);
});
```

### Ventajas
- **100% determinista** cuando el usuario responde al mensaje del bot
- **Sin latencia adicional** (la info ya viene en el mensaje entrante)
- **Escalable:** una vez resuelto, se cachea para siempre

### Limitaciones
- Solo funciona si el usuario usa "Responder" (reply) al mensaje del bot
- Si el usuario escribe un mensaje nuevo (no reply), no hay quotedMsg

---

## 2.2 CAPA 2 — Acceso al LID Store interno de WhatsApp Web

### Fundamento técnico

WhatsApp Web (la SPA que corre en el navegador) mantiene en **IndexedDB** y en **memoria (WPP store)** todas las resoluciones LID ↔ Phone que ha encontrado. Similar a como whatsmeow tiene `Store.LIDs`.

El acceso se hace desde Puppeteer con:

```javascript
const phone = await page.evaluate(async (lid) => {
  // Acceder al store interno de WhatsApp Web
  // Opción A: Buscar en window.Store (si está expuesto)
  if (window.Store && window.Store.Lids) {
    return window.Store.Lids.get(lid);
  }

  // Opción B: Buscar en los módulos de WPP
  const modules = window.require ? window.require('__wpp') : null;
  // ...

  // Opción C: Acceder a IndexedDB directamente
  return new Promise((resolve) => {
    const req = indexedDB.open('wawc');
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(['lid-store'], 'readonly');
      const store = tx.objectStore('lid-store');
      const getReq = store.get(lid);
      getReq.onsuccess = () => resolve(getReq.result?.phone);
    };
  });
}, msg.from);
```

### Lo que hay que investigar en el cliente específico

El nombre exacto de la store/objeto varía según la versión de WhatsApp Web. Hay que hacer **ingeniería inversa ligera** en el primer deploy:

```javascript
// Script de discovery (se corre UNA vez en desarrollo)
const discovery = await page.evaluate(() => {
  const results = {};

  // Buscar en window
  for (const key of Object.keys(window)) {
    if (key.toLowerCase().includes('lid') || key.toLowerCase().includes('store')) {
      results[key] = typeof window[key];
    }
  }

  // Listar IndexedDB stores
  // ...

  return results;
});
```

### Referencia: WAHA / whatsmeow

En el protocolo nativo (whatsmeow en Go), la API es:

```go
// Obtener phone number desde LID
pn, err := client.Store.LIDs.Get(lidJID)

// Obtener LID desde phone number
lid, err := client.Store.LIDs.GetByPN(phoneJID)
```

En WAHA (REST API sobre whatsmeow):

```
GET /api/default/lids/839273645123%40lid
→ { "lid": "839273645123@lid", "pn": "573001234567@c.us" }

GET /api/default/lids/pn/573001234567%40c.us
→ { "lid": "839273645123@lid", "pn": "573001234567@c.us" }
```

### Lo que necesita whatsapp-web.js

Un módulo `LidResolver` que use `page.evaluate()` para:

1. **Al iniciar el bot:** ejecutar script de discovery para encontrar dónde está el store de LIDs
2. **On-demand:** resolver `@lid` → `@c.us` consultando ese store
3. **Reverse:** si se conoce el número pero se recibe un @lid nuevo, registrar el mapeo

### Riesgos

- WhatsApp puede cambiar la estructura interna en cualquier update
- Requiere mantenimiento por cada nueva versión de WhatsApp Web
- **Mitigación:** el discovery script se corre al iniciar; si falla, se degrada gracefulmente a Capa 3

---

## 2.3 CAPA 3 — Correlación Temporal (Time Window Matching)

### Mecanismo

Si el bot envió mensajes a pocos leads en una ventana de tiempo reciente, y llega una respuesta de un @lid desconocido **poco después** de un envío específico, se correlaciona por proximidad temporal.

```
Regla de matching:
  Si el bot envió un mensaje a UN SOLO lead en los últimos N minutos,
  y llega una respuesta de un @lid desconocido en ese mismo lapso,
  → Asumir que la respuesta viene de ese lead.
```

### Algoritmo

```javascript
async function resolveByTimeWindow(lidId, receivedAt) {
  const WINDOW_MINUTES = 5;        // ventana de correlación
  const MAX_CANDIDATES = 3;        // si hay más de N leads en la ventana, no se puede correlacionar

  // Buscar mensajes salientes en la ventana
  const candidates = await db.query(`
    SELECT DISTINCT lead_id, phone, sent_at
    FROM outbound_messages
    WHERE sent_at >= datetime(?, '-' || ? || ' minutes')
    ORDER BY sent_at DESC
  `, [receivedAt, WINDOW_MINUTES]);

  if (candidates.length === 0) {
    return null; // nadie recibió mensajes en esa ventana
  }

  if (candidates.length === 1) {
    // Solo un lead fue contactado → alta probabilidad de que sea él
    return candidates[0];
  }

  // Múltiples candidatos → buscar el más cercano temporalmente
  const msgTime = new Date(receivedAt).getTime();
  let best = candidates[0];
  let bestDiff = Infinity;

  for (const c of candidates) {
    const diff = Math.abs(msgTime - new Date(c.sent_at).getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }

  // Solo aceptar si el mejor candidato está significativamente más cerca
  // que el segundo mejor
  // ... (lógica de confidence score)

  if (confidence > 0.7) {
    return best;
  }
  return null; // ambiguo → no resolver
}
```

### Confidence Score

```javascript
function computeConfidence(candidates, bestMatch, receivedAt) {
  let score = 0;

  // Factor 1: Unicidad (solo un lead en la ventana = alta confianza)
  if (candidates.length === 1) score += 0.6;

  // Factor 2: Proximidad temporal (< 30 segundos entre envío y respuesta)
  const timeDelta = Math.abs(new Date(receivedAt) - new Date(bestMatch.sent_at));
  if (timeDelta < 30_000) score += 0.3;
  else if (timeDelta < 120_000) score += 0.15;

  // Factor 3: Diferencia con el segundo mejor candidato
  if (candidates.length > 1) {
    const secondBest = candidates[1];
    const delta1 = Math.abs(new Date(receivedAt) - new Date(bestMatch.sent_at));
    const delta2 = Math.abs(new Date(receivedAt) - new Date(secondBest.sent_at));
    if (delta2 > delta1 * 3) score += 0.1;
  }

  return Math.min(score, 1.0);
}
```

### Ventajas
- Funciona sin reply del usuario
- No depende de estructuras internas de WhatsApp

### Desventajas
- **No determinista** → puede asignar mal si hay muchos leads contactados simultáneamente
- **Ventana frágil** → si el usuario tarda en responder, se pierde la correlación
- Solo debe usarse como fallback, nunca como estrategia primaria

---

## 2.4 CAPA 4 — getChatById Metadata (Resolución por contacto)

### Mecanismo

whatsapp-web.js expone `client.getChatById(chatId)` que funciona con IDs `@lid`. Al consultar un chat por su @lid, WhatsApp Web internamente resuelve el contacto y puede devolver:

```javascript
const chat = await client.getChatById("839273645123@lid");
// chat.name puede ser:
//   "+57 300 123 4567" (número formateado como string)
//   "Juan Pérez" (nombre de contacto si está en la agenda)
//   "839273645123@lid" (si no puede resolverlo)

// Extraer número del nombre
const phoneMatch = chat.name.match(/\+?\d[\d\s]+/);
if (phoneMatch) {
  // Limpiar y normalizar
  const phone = phoneMatch[0].replace(/[\s\+]/g, '');
  // → "573001234567"
}
```

### Cuándo funciona
- Cuando el usuario tiene el número en su perfil público o WhatsApp lo ha resuelto previamente
- No siempre — WhatsApp puede devolver solo el @lid

### Implementación

```javascript
async function resolveByChatMetadata(lidId) {
  try {
    const chat = await client.getChatById(lidId);
    const phone = extractPhoneFromChat(chat);
    if (phone) {
      return phone;
    }
  } catch (e) {
    // getChatById puede fallar para @lid nuevos
    console.warn(`No se pudo resolver ${lidId} vía getChatById:`, e.message);
  }
  return null;
}

function extractPhoneFromChat(chat) {
  // Intentar extraer número del nombre
  const patterns = [
    /(\+?\d{1,3}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{4})/,  // internacional
    /(\d{10,12})/,                                       // solo dígitos
  ];

  for (const pattern of patterns) {
    const match = chat.name?.match(pattern);
    if (match) return match[1].replace(/[\s\-\+]/g, '');
  }

  return null;
}
```

---

## 2.5 CAPA 5 — Plan B: Obtener datos sin preguntar el número

Si ninguna de las 4 capas anteriores funciona (primera interacción, usuario envía mensaje nuevo sin reply, no hay datos en el store, múltiples leads contactados en la ventana):

### Estrategia: Pedir contexto, no el número

En vez de preguntar "¿cuál es tu número?" (que rompe la automatización), el bot pide **datos que ya están en el CRM** y que el usuario conoce:

```
Bot: "¡Gracias por contactarnos! ¿Cuál es el equipo o servicio por el que nos escribes?"

Usuario: "El cargador de mi Twizy"

Bot: "Perfecto, déjame buscar tu caso. ¿Me confirmas tu razón social o NIT
      para ubicar tu servicio?"
```

El bot cruza la respuesta del usuario con la base de datos del CRM:

```javascript
async function identifyByContext(lidId, userResponse) {
  // Buscar en CRM por palabras clave mencionadas
  const matches = await db.query(`
    SELECT l.* FROM leads l
    JOIN conversations c ON c.lead_id = l.id
    WHERE (l.equipo LIKE ? OR l.falla LIKE ? OR c.summary LIKE ?)
      AND l.status = 'activo'
    LIMIT 5
  `, [`%${userResponse}%`, `%${userResponse}%`, `%${userResponse}%`]);

  if (matches.length === 1) {
    return matches[0]; // match único
  }

  if (matches.length > 1) {
    // Pedir un dato más específico
    return await askFollowUp(lidId, matches);
  }

  return null; // sin matches → lead nuevo
}
```

### Ventajas
- No rompe la automatización
- El usuario no siente que le "piden el número"
- Sirve también para crear leads nuevos con datos contextuales

---

## 3. Arquitectura del Sistema

### 3.1 Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────┐
│                    BOT WHATSAPP (Node.js)                     │
│                                                               │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐  │
│  │ Message      │  │ LidResolver    │  │ CRMBridge       │  │
│  │ Handler      │──│ (4-capas)      │──│ (HTTP Client)   │  │
│  └──────┬───────┘  └───────┬────────┘  └────────┬────────┘  │
│         │                  │                      │           │
│  ┌──────▼──────────────────▼──────────────────────▼────────┐ │
│  │              Local SQLite Cache (bot-side)              │ │
│  │  - outbound_messages (stanza_id, lead_id, phone, time)  │ │
│  │  - lid_resolutions  (lid, phone, lead_id, resolved_at)  │ │
│  │  - unresolved_queue (lid, message_text, timestamp)      │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────┘
                                │ HTTP REST
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                     CRM (Flask + SQLite)                      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ /api/lid/    │  │ /api/leads/  │  │ /api/conversations│  │
│  │   resolve    │  │   search     │  │   /link           │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                               │
│  Tablas CRM:                                                  │
│  - leads (id, phone, name, empresa, equipo, falla, ...)      │
│  - conversations (id, lead_id, direction, body, stanza_id)   │
│  - lid_mappings (lid, phone, lead_id, source, confidence)    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de datos completo

```
╔═══════════════════════════════════════════════════════════════╗
║                  FLUJO: ENVÍO DE MENSAJE                       ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  1. CRM Flask envía comando al bot:                           ║
║     POST /bot/send { lead_id: 42, phone: "573001234567",      ║
║                       template: "seguimiento_equipo" }         ║
║                                                               ║
║  2. Bot envía vía whatsapp-web.js:                            ║
║     client.sendMessage("573001234567@c.us", body)             ║
║                                                               ║
║  3. Bot captura el msg.id._serialized del mensaje enviado:    ║
║     "true_573001234567@c.us_BAE5A1F8A2B3C4D5"                ║
║                                                               ║
║  4. Bot registra en outbound_messages local:                  ║
║     INSERT INTO outbound_messages                              ║
║       (stanza_id, lead_id, phone, conversation_id, sent_at)   ║
║     VALUES ('true_57...BAE5', 42, '573001234567', 108, now)   ║
║                                                               ║
║  5. Bot notifica al CRM:                                      ║
║     POST /api/conversations/link                              ║
║     { conversation_id: 108, stanza_id: "true_57...BAE5" }     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════╗
║               FLUJO: RECEPCIÓN DE RESPUESTA                    ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  1. Llega mensaje desde "839273645123@lid":                   ║
║     { from: "839273645123@lid", body: "Listo, gracias",       ║
║       hasQuotedMsg: true,                                      ║
║       quotedMsg: { id._serialized: "true_57...BAE5" } }       ║
║                                                               ║
║  2. LidResolver detecta @lid → ejecuta resolución:            ║
║                                                               ║
║     CAPA 1 (quotedMsg): ✅ ÉXITO                               ║
║       → Busca stanza_id en outbound_messages                   ║
║       → Encuentra: lead_id=42, phone="573001234567"           ║
║       → Guarda en lid_resolutions:                             ║
║         { lid: "839273645123@lid",                             ║
║           phone: "573001234567@c.us", lead_id: 42 }           ║
║                                                               ║
║  3. Mensaje se procesa con phone resuelto:                    ║
║     processMessage({ from: "839273645123@lid",                 ║
║                      _resolvedPhone: "573001234567",           ║
║                      _leadId: 42, body: "Listo, gracias" })    ║
║                                                               ║
║  4. Bot actualiza CRM:                                        ║
║     POST /api/conversations/42/messages                       ║
║     { direction: "inbound", body: "Listo, gracias",            ║
║       stanza_id: "incoming_msg_id" }                           ║
║                                                               ║
║  5. Próximo mensaje del mismo @lid → resuelto instantáneamente║
║     desde cache local (lid_resolutions)                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## 4. Estructura de Base de Datos

### 4.1 Tablas en el bot (SQLite local)

```sql
-- Mensajes salientes del bot (para matching por quotedMsg)
CREATE TABLE outbound_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stanza_id TEXT UNIQUE NOT NULL,        -- "true_57300...@c.us_BAE5A1F8..."
    lead_id INTEGER NOT NULL,              -- FK al CRM
    phone TEXT NOT NULL,                   -- "573001234567"
    conversation_id INTEGER,
    body_preview TEXT,                     -- primeras 100 chars del mensaje
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
);

CREATE INDEX idx_outbound_stanza ON outbound_messages(stanza_id);
CREATE INDEX idx_outbound_lead ON outbound_messages(lead_id, sent_at);
CREATE INDEX idx_outbound_expires ON outbound_messages(expires_at);

-- Resoluciones @lid → @c.us cacheadas
CREATE TABLE lid_resolutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lid TEXT UNIQUE NOT NULL,              -- "839273645123@lid"
    phone TEXT NOT NULL,                   -- "573001234567@c.us"
    lead_id INTEGER,
    resolution_method TEXT NOT NULL,       -- 'quoted_msg' | 'lid_store' | 'time_window' | 'chat_metadata' | 'manual'
    confidence REAL DEFAULT 1.0,           -- 0.0 a 1.0
    resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_lid_lookup ON lid_resolutions(lid);
CREATE INDEX idx_lid_phone ON lid_resolutions(phone);

-- Cola de mensajes no resueltos (para revisión manual)
CREATE TABLE unresolved_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lid TEXT NOT NULL,
    message_body TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    retry_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',         -- 'pending' | 'retrying' | 'manual_review' | 'resolved'
    resolution_notes TEXT
);

-- Configuración del lid resolver
CREATE TABLE resolver_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Valores por defecto
INSERT INTO resolver_config (key, value) VALUES
    ('time_window_minutes', '5'),
    ('max_window_candidates', '3'),
    ('confidence_threshold', '0.7'),
    ('outbound_retention_days', '30');
```

### 4.2 Modificaciones al CRM (Flask + SQLite)

```sql
-- NUEVA: Mapeo centralizado @lid → lead
CREATE TABLE lid_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lid TEXT UNIQUE NOT NULL,              -- "839273645123@lid"
    lead_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    source TEXT NOT NULL,                  -- 'bot_auto' | 'manual' | 'import'
    resolution_method TEXT,
    confidence REAL DEFAULT 1.0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX idx_lid_mappings_lid ON lid_mappings(lid);
CREATE INDEX idx_lid_mappings_lead ON lid_mappings(lead_id);

-- MODIFICADA: Agregar stanza_id para trazabilidad de mensajes salientes
ALTER TABLE conversations ADD COLUMN outbound_stanza_id TEXT;
CREATE INDEX idx_conv_stanza ON conversations(outbound_stanza_id);

-- MODIFICADA: Agregar dirección y metadata de mensaje
ALTER TABLE messages ADD COLUMN whatsapp_msg_id TEXT;
ALTER TABLE messages ADD COLUMN raw_from TEXT;  -- el ID tal cual llegó (@lid o @c.us)
```

### 4.3 Endpoints CRM (nuevos)

```
GET  /api/lid/resolve?lid=839273645123@lid
  → { "found": true, "lid": "839273645123@lid",
      "phone": "573001234567@c.us", "lead_id": 42,
      "lead_name": "Juan Pérez", "confidence": 1.0 }

POST /api/lid/register
  Body: { "lid": "839273645123@lid", "lead_id": 42,
          "phone": "573001234567", "method": "quoted_msg",
          "confidence": 1.0 }
  → { "status": "ok", "id": 1 }

GET  /api/leads/search-by-context?q=cargador+twizy
  → { "results": [{ "id": 42, "name": "Juan Pérez",
       "equipo": "Cargador Schneider EVlink", ... }] }

POST /api/conversations/link
  Body: { "conversation_id": 108,
          "stanza_id": "true_573001234567@c.us_BAE5A1F8" }
  → { "status": "ok" }
```

---

## 5. Manejo de Edge Cases

### 5.1 Usuario NO responde al mensaje directo

**Escenario:** Bot envía mensaje a Juan. Juan no responde con reply, sino que abre el chat y escribe un mensaje nuevo.

**Resolución:**
1. Capa 1 falla (no hay quotedMsg)
2. Capa 2 intenta resolver por IndexedDB → si WhatsApp ya cacheó la relación, funciona
3. Capa 3 (time window) → si Juan fue el único contactado en los últimos 5 min, se asigna
4. Capa 4 (getChatById) → intenta extraer número del nombre
5. Si todo falla → Capa 5 (contextual prompt)

### 5.2 Múltiples leads contactados simultáneamente

**Escenario:** Bot envía mensaje a 10 leads en un batch. 3 responden casi al mismo tiempo desde @lid.

**Resolución:**
- Capa 1 (quotedMsg) → resuelve cada uno individualmente (el stanza_id es único por mensaje)
- Capa 3 (time window) → **se desactiva** porque hay más de `max_window_candidates` (3)
- Si un lead no usa reply → Capa 2, Capa 4, Capa 5

### 5.3 Usuario cambia de @lid (mismo lead, diferente @lid)

**Escenario:** WhatsApp rota el LID de un usuario (posible en ciertas condiciones).

**Resolución:**
- La tabla `lid_resolutions` mantiene múltiples @lid → mismo phone
- Si llega un @lid nuevo de un número ya conocido, se agrega sin conflicto
- La tabla `lid_mappings` en CRM tiene UNIQUE(lid) pero permite múltiples LIDs por lead

### 5.4 Mensaje entrante de un lead NUEVO (primera interacción)

**Escenario:** Un prospecto escribe por primera vez al negocio. No está en el CRM.

**Resolución:**
- Capa 1-4 intentan resolver sin éxito
- Capa 5 se activa automáticamente con el mensaje contextual
- El bot crea un lead temporal con el @lid como identificador:
  ```javascript
  lead = { phone: null, lid: "839273645123@lid", status: "new_unidentified" }
  ```
- Cuando el usuario proporciona datos (equipo, nombre, etc.), se completa el lead
- Si el usuario eventualmente da su número (en conversación natural), se actualiza

### 5.5 Race condition: respuesta llega antes de que se registre el stanza_id

**Escenario:** El bot envía un mensaje, pero antes de que el `message_create` handler termine de registrar el stanza_id, llega la respuesta del usuario.

**Resolución:**
- Usar un **buffer de reintento**: si Capa 1 falla por stanza_id no encontrado, esperar 2 segundos y reintentar la búsqueda (el registro pudo haberse completado en ese lapso)
- Máximo 3 reintentos con backoff exponencial (2s, 4s, 8s)

### 5.6 WhatsApp entrega el mensaje pero el stanza_id cambia

**Escenario raro:** WhatsApp reformatea el mensaje y el id no coincide.

**Resolución:**
- Guardar también un `message_fingerprint` (hash de contenido + timestamp + destinatario) como alternativa de matching
- Si stanza_id falla, buscar por fingerprint

---

## 6. Estrategia de Matching por quotedMsg (Detalle)

### 6.1 Estructura del stanza_id en whatsapp-web.js

```javascript
// Mensaje enviado por el bot
{
  id: {
    fromMe: true,
    remote: "573001234567@c.us",    // destinatario
    id: "BAE5A1F8A2B3C4D5",        // ID único de WhatsApp
    _serialized: "true_573001234567@c.us_BAE5A1F8A2B3C4D5"
  }
}

// Mensaje recibido con reply
{
  hasQuotedMsg: true,
  quotedMsg: {
    id: {
      fromMe: true,  // ← CLAVE: confirma que el mensaje citado es del bot
      remote: "573001234567@c.us",
      _serialized: "true_573001234567@c.us_BAE5A1F8A2B3C4D5"
    }
  }
}
```

### 6.2 Algoritmo de matching

```javascript
async function resolveByQuotedMsg(msg) {
  if (!msg.hasQuotedMsg) return null;

  const quotedId = msg.quotedMsg?.id?._serialized;
  if (!quotedId) return null;

  // Verificar que el mensaje citado fue enviado por el bot
  if (!msg.quotedMsg.id.fromMe) return null;

  // Buscar en BD local
  const cached = await localDb.get(`
    SELECT lid, phone, lead_id FROM lid_resolutions
    WHERE lid = ?
  `, [msg.from]);

  if (cached) return cached;

  // Buscar por stanza_id
  const outbound = await localDb.get(`
    SELECT lead_id, phone FROM outbound_messages
    WHERE stanza_id = ?
  `, [quotedId]);

  if (!outbound) {
    // Reintentar después de un delay (race condition)
    await sleep(2000);
    const retry = await localDb.get(`
      SELECT lead_id, phone FROM outbound_messages
      WHERE stanza_id = ?
    `, [quotedId]);
    if (!retry) return null;
    return retry;
  }

  // Guardar resolución para futuros mensajes
  await localDb.run(`
    INSERT OR REPLACE INTO lid_resolutions (lid, phone, lead_id, resolution_method, confidence)
    VALUES (?, ?, ?, 'quoted_msg', 1.0)
  `, [msg.from, outbound.phone, outbound.lead_id]);

  // Sincronizar con CRM
  await crmClient.post('/api/lid/register', {
    lid: msg.from,
    lead_id: outbound.lead_id,
    phone: outbound.phone,
    method: 'quoted_msg',
    confidence: 1.0
  });

  return outbound;
}
```

---

## 7. Plan de Implementación (Roadmap)

### Fase 0 — Auditoría técnica (1 día)
- [ ] Verificar versión exacta de whatsapp-web.js y WhatsApp Web
- [ ] Ejecutar script de discovery del LID Store interno
- [ ] Probar `getChatById` con @lid reales
- [ ] Documentar qué métodos de resolución están disponibles

### Fase 1 — Capa 1: Reply Matching (2-3 días)
- [ ] Crear tabla `outbound_messages` en SQLite local del bot
- [ ] Handler `message_create` para registrar mensajes salientes
- [ ] Extender `message` handler con resolución por quotedMsg
- [ ] Endpoint `/api/lid/register` en CRM Flask
- [ ] Endpoint `/api/conversations/link` en CRM Flask
- [ ] Pruebas con leads reales

### Fase 2 — Capa 2: LID Store (3-4 días)
- [ ] Script de discovery de IndexedDB de WhatsApp Web
- [ ] Módulo `LidStoreAccessor` con page.evaluate()
- [ ] Integración al resolver pipeline
- [ ] Pruebas y ajustes por versión de WA Web

### Fase 3 — Capa 3 y 4: Fallbacks (2 días)
- [ ] Time window matching con confidence score
- [ ] Chat metadata extraction
- [ ] Pipeline de resolución con degradación graceful
- [ ] Dashboard de unresolved queue

### Fase 4 — Capa 5: Contextual Prompt (1-2 días)
- [ ] Motor de búsqueda contextual en CRM
- [ ] Flujo de preguntas adaptativas
- [ ] Creación de leads temporales (@lid-only)

### Fase 5 — Monitoreo y ajuste (continuo)
- [ ] Métricas: % resuelto por capa, tiempo promedio de resolución
- [ ] Alerta si >5% de mensajes caen a revisión manual
- [ ] Limpieza periódica de `outbound_messages` expirados

---

## 8. Código: LidResolver (Módulo Principal)

```javascript
// lid-resolver.js
class LidResolver {
  constructor(localDb, crmClient, wwebClient) {
    this.db = localDb;
    this.crm = crmClient;
    this.client = wwebClient;
    this.resolutionChain = [
      this.resolveByQuotedMsg.bind(this),
      this.resolveByLidStore.bind(this),
      this.resolveByTimeWindow.bind(this),
      this.resolveByChatMetadata.bind(this),
    ];
  }

  async resolve(lidId, message) {
    // 1. Buscar en caché local primero
    const cached = await this.db.get(
      'SELECT * FROM lid_resolutions WHERE lid = ?', [lidId]
    );
    if (cached) {
      await this.db.run(
        'UPDATE lid_resolutions SET last_seen_at = datetime("now") WHERE lid = ?',
        [lidId]
      );
      return { phone: cached.phone, lead_id: cached.lead_id, method: 'cache' };
    }

    // 2. Ejecutar cadena de resolución
    for (const resolver of this.resolutionChain) {
      try {
        const result = await resolver(lidId, message);
        if (result) {
          await this.cacheResolution(lidId, result);
          await this.syncToCRM(lidId, result);
          return result;
        }
      } catch (err) {
        console.warn(`Resolver falló: ${err.message}`);
        continue; // siguiente capa
      }
    }

    // 3. Sin resolución → cola de revisión
    await this.queueUnresolved(lidId, message);
    return null;
  }

  async cacheResolution(lidId, result) {
    await this.db.run(`
      INSERT OR REPLACE INTO lid_resolutions
        (lid, phone, lead_id, resolution_method, confidence, resolved_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [lidId, result.phone, result.lead_id, result.method, result.confidence || 1.0]);
  }

  async syncToCRM(lidId, result) {
    try {
      await this.crm.post('/api/lid/register', {
        lid: lidId,
        lead_id: result.lead_id,
        phone: result.phone.replace('@c.us', ''),
        method: result.method,
        confidence: result.confidence || 1.0
      });
    } catch (err) {
      console.error('Error sincronizando LID con CRM:', err.message);
    }
  }

  // ... (métodos resolveByXxx implementados arriba)
}
```

---

## 9. Integración con el bot existente

### Hook en el message handler actual

```javascript
// Antes (código actual)
client.on('message', async (msg) => {
  const phone = msg.from.replace('@c.us', '');
  const lead = await crm.findLeadByPhone(phone);
  if (!lead) { /* tratar como nuevo */ }
  // ...
});

// Después (con LidResolver)
client.on('message', async (msg) => {
  let phone = msg.from;
  let lead = null;

  if (msg.from.endsWith('@lid')) {
    const resolved = await lidResolver.resolve(msg.from, msg);
    if (resolved) {
      phone = resolved.phone;
      if (resolved.lead_id) {
        lead = await crm.getLead(resolved.lead_id);
      }
    } else {
      // Sin resolver → iniciar flujo de identificación contextual
      await lidResolver.handleUnresolved(msg);
      return;
    }
  }

  // Si llegó como @c.us, flujo normal
  if (!lead && phone.endsWith('@c.us')) {
    const cleanPhone = phone.replace('@c.us', '');
    lead = await crm.findLeadByPhone(cleanPhone);
  }

  if (!lead) {
    lead = await crm.createLead({ phone: phone.replace('@c.us', ''), source: 'whatsapp' });
  }

  await processMessage(msg, lead);
});
```

---

## 10. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| WhatsApp cambia estructura interna del LID Store | Alta | Medio | Discovery script al iniciar; fallback automático a otras capas |
| Usuarios no usan reply → Capa 1 no funciona | Media | Bajo | Capas 2-5 cubren este caso |
| Time window matching asigna mal un lead | Media | Alto | Solo se activa si hay ≤3 candidatos; confidence score; flag de revisión |
| Rate limiting de WhatsApp por muchas consultas getChatById | Baja | Medio | Cachear resultados; no llamar getChatById repetidamente para el mismo @lid |
| Puppeteer/page crash durante page.evaluate() | Baja | Alto | Try/catch con degradación graceful a siguiente capa |
| @lid persiste entre sesiones de WhatsApp Web | Media | Bajo | Cache persistente en SQLite sobrevive reinicios del bot |

---

## 11. Alternativas consideradas y descartadas

### 11.1 Migrar a WhatsApp Business API (Cloud API)
- ✅ Resuelve el problema nativamente
- ❌ Costo por mensaje (~$0.005-$0.08 USD/msg)
- ❌ Requiere migración completa del bot
- ❌ No justificado para el volumen actual de HTK

### 11.2 Migrar a whatsmeow/WAHA (protocolo nativo)
- ✅ Acceso directo a Store.LIDs
- ❌ Requiere reescribir todo el bot (whatsapp-web.js → Go/Python)
- ❌ Curva de aprendizaje + tiempo de migración
- ⚠️ Podría considerarse a largo plazo si el volumen crece

### 11.3 Pedir al usuario que agregue el número a contactos
- ✅ Técnicamente más simple
- ❌ Rompe la automatización
- ❌ Mala experiencia de usuario
- ❌ No todos los usuarios lo harán

---

## 12. Resumen Ejecutivo

| Capa | Método | Confiabilidad | Latencia | Requiere reply |
|------|--------|---------------|----------|----------------|
| 1 | quotedMsg matching | 100% | 0ms | ✅ Sí |
| 2 | IndexedDB LID Store | 80-95% | 50-200ms | ❌ No |
| 3 | Time window | 60-80% | 5-50ms | ❌ No |
| 4 | getChatById | 30-60% | 100-500ms | ❌ No |
| 5 | Contextual prompt | 50-70% | 1-3 mensajes | ❌ No |

**Con las 4 capas automáticas, se estima resolver >95% de los mensajes @lid sin intervención humana y sin preguntar el número.**

---

## Próximos pasos

1. **Validar versión de WhatsApp Web** que está usando el bot actual
2. **Ejecutar discovery script** para mapear la estructura interna del LID Store
3. **Implementar Fase 1** (Capa 1: quotedMsg) — es la de mayor retorno inmediato
4. **Medir cobertura** después de Fase 1 para decidir urgencia de Fases 2-5
