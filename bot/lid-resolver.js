// lid-resolver.js — Resolución @lid → @c.us
// 4 capas automáticas: quotedMsg → LID Store → Time Window → getChatById
// Sin interacción con el usuario.
//
// Dependencias: whatsapp-web.js, fs, path

const fs = require("fs");
const path = require("path");

// ─── PERSISTENCIA ────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
const OUTBOUND_PATH = path.join(DATA_DIR, "outbound_messages.json");
const LID_MAP_PATH = path.join(DATA_DIR, "lid_resolutions.json");
const UNRESOLVED_PATH = path.join(DATA_DIR, "unresolved_queue.json");

// TTL: cuánto tiempo guardamos mensajes outbound para matching (7 días)
const OUTBOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── ESTADO EN MEMORIA ──────────────────────────────
let outboundMessages = [];  // { stanzaId, phone, leadId, timestamp, text }
let lidMap = {};            // { "@lid": "@c.us" }
let unresolvedLids = [];    // Cola de @lid sin resolver aún

// ─── CARGA INICIAL ──────────────────────────────────
function init() {
  // Cargar mensajes outbound
  try {
    if (fs.existsSync(OUTBOUND_PATH)) {
      outboundMessages = JSON.parse(fs.readFileSync(OUTBOUND_PATH, "utf-8"));
      // Limpiar expirados
      const now = Date.now();
      const before = outboundMessages.length;
      outboundMessages = outboundMessages.filter(m => now - (m.timestamp || 0) < OUTBOUND_TTL_MS);
      if (outboundMessages.length !== before) guardarOutbound();
      console.log(`📤 ${outboundMessages.length} mensajes outbound cargados (${before - outboundMessages.length} expirados)`);
    }
  } catch (e) { console.log("📤 Sin outbound_messages previo"); }

  // Cargar mapa LID
  try {
    if (fs.existsSync(LID_MAP_PATH)) {
      lidMap = JSON.parse(fs.readFileSync(LID_MAP_PATH, "utf-8"));
      console.log(`🗺️  ${Object.keys(lidMap).length} mapeos LID cargados`);
    }
  } catch (e) { console.log("🗺️  Sin lid_resolutions previo"); }
}

// ─── PERSISTENCIA ────────────────────────────────────
function guardarOutbound() {
  try {
    fs.writeFileSync(OUTBOUND_PATH, JSON.stringify(outboundMessages), "utf-8");
  } catch (e) { console.error("Error guardando outbound:", e.message); }
}

function guardarLidMap() {
  try {
    fs.writeFileSync(LID_MAP_PATH, JSON.stringify(lidMap, null, 2), "utf-8");
  } catch (e) { console.error("Error guardando LID map:", e.message); }
}

// ─── CAPA 1: REGISTRAR MENSAJE OUTBOUND ────────────
// Llamar después de enviar un mensaje: recordOutbound(stanzaId, phone, leadId)
function recordOutbound(stanzaId, phone, leadId, text) {
  if (!stanzaId) return;
  // Evitar duplicados
  const exists = outboundMessages.some(m => m.stanzaId === stanzaId);
  if (exists) return;

  outboundMessages.push({
    stanzaId,
    phone,
    leadId: leadId || null,
    timestamp: Date.now(),
    text: (text || "").substring(0, 100)
  });

  // Limpiar mensajes viejos cada 50 registros nuevos
  if (outboundMessages.length % 50 === 0) {
    const now = Date.now();
    outboundMessages = outboundMessages.filter(m => now - (m.timestamp || 0) < OUTBOUND_TTL_MS);
  }

  guardarOutbound();
}

// ─── CAPA 1: RESOLVER POR quotedMsg ─────────────────
// Busca el stanzaId citado en el mensaje entrante
function resolveByQuotedMsg(stanzaId) {
  if (!stanzaId) return null;
  const match = outboundMessages.find(m => m.stanzaId === stanzaId);
  if (match) {
    console.log(`🔗 Capa 1: quotedMsg match → ${match.phone} (lead: ${match.leadId || 'N/A'})`);
    return { phone: match.phone, leadId: match.leadId, source: "quotedMsg", confidence: 1.0 };
  }
  return null;
}

// ─── CAPA 2: RESOLVER POR LID STORE (IndexedDB) ────
// Accede al Store interno de WhatsApp Web vía Puppeteer
// Ejecuta page.evaluate() para extraer el mapa @lid → @c.us
async function resolveByLidStore(page, lidId) {
  if (!page || typeof page.evaluate !== 'function' || !lidId) return null;

  // Primero revisar caché local
  if (lidMap[lidId]) {
    console.log(`🗺️  Capa 2: LID Store caché → ${lidMap[lidId]}`);
    return { phone: lidMap[lidId], source: "lidStore", confidence: 0.95 };
  }

  try {
    // Acceder al store de WhatsApp Web vía Puppeteer
    // whatsapp-web.js expone el store en window.Store
    const result = await page.evaluate((lid) => {
      // Método 1: WAM (protocolo interno de WhatsApp Web)
      if (window.WAM && window.WAM.LidMap) {
        const entry = window.WAM.LidMap[lid];
        if (entry && entry.jid) return entry.jid;
      }

      // Método 2: Store de WA Web (común en versiones recientes)
      if (window.Store && window.Store.LidMap) {
        const entry = window.Store.LidMap[lid];
        if (entry) return entry;
      }

      // Método 3: Buscar en Store.Chat.get()
      // Los chats se pueden obtener por su LID
      if (window.Store && window.Store.Chat && window.Store.Chat.get) {
        const chat = window.Store.Chat.get(lid);
        if (chat && chat.id && chat.id._serialized && chat.id._serialized !== lid) {
          return chat.id._serialized;
        }
      }

      // Método 4: Buscar en contact list
      if (window.Store && window.Store.Contact && window.Store.Contact.get) {
        const contact = window.Store.Contact.get(lid);
        if (contact && contact.id && contact.id._serialized && contact.id._serialized !== lid) {
          return contact.id._serialized;
        }
      }

      // Método 5: WAP (nuevo protocolo)
      if (window.WAP && window.WAP.LidStore) {
        const entry = window.WAP.LidStore.get(lid);
        if (entry && entry.jid) return entry.jid;
      }

      return null;
    }, lidId);

    if (result && result.includes("@c.us")) {
      lidMap[lidId] = result;
      guardarLidMap();
      console.log(`🗺️  Capa 2: LID Store encontrado → ${result}`);
      return { phone: result, source: "lidStore", confidence: 0.95 };
    }
  } catch (e) {
    console.log(`⚠️ Capa 2: error accediendo LID Store: ${e.message}`);
  }

  return null;
}

// ─── CAPA 3: RESOLVER POR TIME WINDOW ──────────────
// Si contactamos a un solo lead recientemente, asumir que la respuesta es de él
function resolveByTimeWindow(lidId, timeWindowMs = 5 * 60 * 1000) {
  const now = Date.now();
  const windowStart = now - timeWindowMs;

  // Buscar mensajes outbound en la ventana de tiempo
  const recentOutbound = outboundMessages.filter(m => m.timestamp >= windowStart);

  if (recentOutbound.length === 1) {
    // Solo un lead contactado en la ventana → alta probabilidad
    console.log(`⏱️  Capa 3: Time window (1 lead) → ${recentOutbound[0].phone}`);
    return {
      phone: recentOutbound[0].phone,
      leadId: recentOutbound[0].leadId,
      source: "timeWindow",
      confidence: 0.7
    };
  }

  if (recentOutbound.length > 1) {
    // Múltiples leads en la ventana → no podemos asegurar
    console.log(`⏱️  Capa 3: ${recentOutbound.length} leads en ventana, no concluyente`);
    return null;
  }

  return null;
}

// ─── CAPA 4: RESOLVER POR getChatById ─────────────
// Consultar metadata del chat y extraer información
async function resolveByGetChatById(client, lidId) {
  if (!client || !lidId) return null;

  try {
    const chat = await client.getChatById(lidId);
    if (!chat) return null;

    // Intentar obtener el contacto asociado
    if (chat.contact && chat.contact.id && chat.contact.id._serialized) {
      const serialized = chat.contact.id._serialized;
      if (serialized.includes("@c.us") && serialized !== lidId) {
        console.log(`💬 Capa 4: getChatById → ${serialized}`);
        lidMap[lidId] = serialized;
        guardarLidMap();
        return { phone: serialized, source: "getChatById", confidence: 0.6 };
      }
    }

    // Si el chat tiene nombre, podría estar relacionado a un lead
    if (chat.name && chat.name.includes("@c.us")) {
      console.log(`💬 Capa 4: nombre contiene número: ${chat.name}`);
      return null; // No confiable, mejor dejarlo para otra capa
    }
  } catch (e) {
    console.log(`⚠️ Capa 4: error getChatById: ${e.message}`);
  }

  return null;
}

// ─── ORQUESTADOR PRINCIPAL ───────────────────────────
// Prueba las 4 capas en orden y retorna la primera que resuelve
async function resolve(lidId, msg, client, page) {
  if (!lidId || (!lidId.includes("@lid") && !lidId.includes("@s.whatsapp.net"))) {
    // Si ya es @c.us, retornar directamente
    if (lidId.includes("@c.us")) return { phone: lidId, source: "direct", confidence: 1.0 };
    return null;
  }

  console.log(`🔍 Resolviendo LID: ${lidId}`);

  // Capa 1: quotedMsg
  if (msg && msg.hasQuotedMsg) {
    try {
      const quoted = await msg.getQuotedMessage();
      if (quoted && quoted.id && quoted.id._serialized) {
        const result = resolveByQuotedMsg(quoted.id._serialized);
        if (result) return result;
      }
    } catch (e) {
      console.log(`⚠️ Capa 1: error getQuotedMessage: ${e.message}`);
    }
  }

  // Capa 2: LID Store (requiere page de Puppeteer)
  if (page) {
    const result = await resolveByLidStore(page, lidId);
    if (result) return result;
  }

  // Capa 3: Time Window
  const timeResult = resolveByTimeWindow(lidId);
  if (timeResult) return timeResult;

  // Capa 4: getChatById
  if (client) {
    const chatResult = await resolveByGetChatById(client, lidId);
    if (chatResult) return chatResult;
  }

  // No se pudo resolver → agregar a cola de no resueltos
  agregarNoResuelto(lidId, msg);
  console.log(`❌ No se pudo resolver LID: ${lidId}`);
  return null;
}

// ─── COLA DE NO RESUELTOS ────────────────────────────
function agregarNoResuelto(lidId, msg) {
  if (!lidId) return;
  const exists = unresolvedLids.some(u => u.lid === lidId);
  if (exists) return;

  unresolvedLids.push({
    lid: lidId,
    firstSeen: Date.now(),
    text: (msg?.body || "").substring(0, 100),
    intentos: 0
  });

  // Guardar cada 5 nuevos
  if (unresolvedLids.length % 5 === 0) guardarNoResueltos();
}

function guardarNoResueltos() {
  try {
    fs.writeFileSync(UNRESOLVED_PATH, JSON.stringify(unresolvedLids.slice(-100), null, 2), "utf-8");
  } catch (e) { /* ignorar */ }
}

// ─── BUSCAR LEAD POR TEXTO EN CRM (respaldo) ────────
// No pregunta al usuario, solo busca en DB local
async function buscarLeadPorTexto(text, leadId) {
  // Esta función es opcional — busca en el CRM por coincidencia de texto
  // para casos donde el @lid no se resuelve pero el usuario menciona
  // algo que ya está registrado (nombre, equipo, etc.)
  // Por ahora retorna null (no implementado)
  return null;
}

// ─── EXPORTAR ────────────────────────────────────────
module.exports = {
  init,
  recordOutbound,
  resolve,
  resolveByQuotedMsg,
  resolveByLidStore,
  resolveByTimeWindow,
  resolveByGetChatById,
  getLidMap: () => lidMap,
  getOutboundCount: () => outboundMessages.length,
  getUnresolvedCount: () => unresolvedLids.length,
};
