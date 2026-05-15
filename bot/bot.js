// bot.js — WhatsApp Bot HTK INGENIERIA v3
// Máquina de estados: IDLE → MENU → AWAITING_DETAILS → LEAD_COMPLETE
// Sin LLM. Respuestas predefinidas instantáneas.
// Un lead por sesión, enriquecido progresivamente.
//
// v4: Message ID dedup, filtro status/newsletter, persistencia global-off,
//     silencing con expiración (7d pitch / 30min lead), despedida con reset,
//     logging post-respuesta, manejo graceful de puerto API

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const qrcodePng = require("qrcode");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const msgs = require("./messages");
const faq = require("./faq");
// DEPRECATED: const sheets = require("./sheets"); — Ahora todo en CRM
const notify = require("./notify");
const lidResolver = require("./lid-resolver");

// ─── CONSTANTES ──────────────────────────────────────
const ESTADOS = {
  IDLE: "idle",              // Sin conversación activa
  PRESENTACION: "presentacion", // Bot se presenta y pide nombre
  MENU: "menu",              // Menú mostrado, esperando opción
  SUBMENU_EE: "submenu_ee", // Submenú E/E, esperando 1 o 2
  AWAITING_DETAIL: "awaiting_detail", // Esperando datos del cliente
  LEAD_COMPLETE: "lead_complete",     // Lead finalizado, derivado
  CLOSED: "closed",          // Conversación cerrada
  SILENT: "silent",          // Pedro ya atendió, bot no responde
  CONSULTA_OT: "consulta_ot", // Cliente consultando estado de OT
};

// ─── GLOBAL TOGGLE (persistente) ─────────────────────
const globalOffPath = path.join(__dirname, "data", "global_off.json");
let botGlobalOff = false;
try {
  if (fs.existsSync(globalOffPath)) {
    botGlobalOff = JSON.parse(fs.readFileSync(globalOffPath, "utf-8")).off === true;
    if (botGlobalOff) console.log("🛑 Bot global APAGADO (persistido)");
  }
} catch (e) { /* ignorar */ }
function guardarGlobalOff() {
  try { fs.writeFileSync(globalOffPath, JSON.stringify({ off: botGlobalOff, ts: Date.now() }), "utf-8"); }
  catch (e) { console.error("Error guardando global_off:", e.message); }
}

// ─── MESSAGE ID DEDUP ────────────────────────────────
// Evita procesar el mismo mensaje dos veces si whatsapp-web.js
// dispara el evento message repetido (reconnect, race conditions).
const processedIds = new Set();
const DEDUP_MAX = 2000;  // mantener últimas 2000 IDs
function marcarProcesado(msgId) {
  if (!msgId) return;
  processedIds.add(msgId);
  if (processedIds.size > DEDUP_MAX) {
    // Limpiar el 50% más antiguo (aproximado: solo mantener los últimos DEDUP_MAX/2)
    const iter = processedIds.values();
    const toDelete = DEDUP_MAX / 2;
    for (let i = 0; i < toDelete; i++) {
      const next = iter.next();
      if (next.done) break;
      processedIds.delete(next.value);
    }
  }
}
function yaProcesado(msgId) {
  return msgId && processedIds.has(msgId);
}

const leadsPath = path.join(__dirname, "data", "leads.json");
const silencedPath = path.join(__dirname, "data", "silenced.json");
fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
if (!fs.existsSync(leadsPath)) fs.writeFileSync(leadsPath, "[]", "utf-8");
if (!fs.existsSync(silencedPath)) fs.writeFileSync(silencedPath, "[]", "utf-8");

// ─── ACTIVE CHATS v4 — tracking de conversaciones de Pedro ──
// Cuando Pedro escribe a un chat (fromMe), registramos ese chat.
// Cuando llega un mensaje entrante, si Pedro estuvo activo ahí
// en los últimos minutos, el bot NO responde.
//
// CRÍTICO: Usa IDs RAW de WhatsApp (@lid incluido).
// El ID que WhatsApp da como "msg.to" cuando Pedro envía,
// es el MISMO que "msg.from" cuando el lead responde.
// Sin necesidad de resolver formatos.

const activeChats = new Map();  // rawChatId → { lastMsg, untilTs }
const ACTIVE_CHAT_TTL = 30 * 60 * 1000;   // 30 min antes de olvidar el chat
const ACTIVE_COOLDOWN = 5 * 60 * 1000;    // 5 min sin respuesta del lead

function marcarChatActivo(rawChatId) {
  if (!rawChatId || typeof rawChatId !== "string") return;
  if (rawChatId.includes("@g.us")) return;  // Ignorar grupos
  activeChats.set(rawChatId, {
    lastMsg: Date.now(),
    untilTs: Date.now() + ACTIVE_CHAT_TTL,
  });
}

function esChatActivo(rawChatId) {
  if (!rawChatId) return false;
  const entry = activeChats.get(rawChatId);
  if (!entry) return false;
  // Si expiró el TTL total, limpiar
  if (Date.now() > entry.untilTs) {
    activeChats.delete(rawChatId);
    return false;
  }
  // Está activo si Pedro escribió hace menos de ACTIVE_COOLDOWN
  return (Date.now() - entry.lastMsg) < ACTIVE_COOLDOWN;
}

function esChatPedro(rawChatId) {
  if (!rawChatId) return false;
  const entry = activeChats.get(rawChatId);
  if (!entry) return false;
  if (Date.now() > entry.untilTs) {
    activeChats.delete(rawChatId);
    return false;
  }
  return true;  // Pedro estuvo aquí
}

// Limpieza periódica de chats expirados
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of activeChats) {
    if (now > entry.untilTs) activeChats.delete(id);
  }
}, 60000);  // cada minuto

// ─── SILENCED v5 — con expiración ─────────────────
// El silencio tiene una duración configurable.
// Por defecto: 7 días para pitches, 30 min para activeChats.
// El silencedMap guarda: número → { untilTs }
// Persiste en disco para sobrevivir reinicios.
const SILENCE_TTL_PITCH = 2 * 24 * 60 * 60 * 1000;   // 2 días para prospección
const SILENCE_TTL_LEAD = 30 * 60 * 1000;               // 30 min para leads derivados
let silencedMap = new Map();

function normalizarNumero(numero) {
  if (!numero || typeof numero !== "string") return "";
  // Asegurar @c.us si no tiene sufijo
  let n = numero.includes("@") ? numero : `${numero}@c.us`;
  // Quitar +
  n = n.replace(/^\+/, "");
  return n;
}

function silenciarNumero(numero, ttlMs) {
  if (!numero || typeof numero !== "string") return;
  ttlMs = ttlMs || SILENCE_TTL_PITCH;  // default 7 días
  const untilTs = Date.now() + ttlMs;
  const normalizado = normalizarNumero(numero);
  silencedMap.set(normalizado, untilTs);
  // Guardar también raw (por si llega como @lid)
  if (numero !== normalizado && numero.length > 5) {
    silencedMap.set(numero, untilTs);
  }
  guardarSilenced();
}

function silenciarNumeroTemporal(numero, ttlMs) {
  // Igual que silenciarNumero pero con TTL explícito
  silenciarNumero(numero, ttlMs);
}

function estaSilenciado(numero) {
  if (!numero) return false;
  const ahora = Date.now();
  let expirados = [];
  
  // Función helper: revisar una clave y limpiar si expiró
  function revisar(clave) {
    if (!silencedMap.has(clave)) return false;
    const untilTs = silencedMap.get(clave);
    if (typeof untilTs === 'number' && ahora > untilTs) {
      expirados.push(clave);
      return false;  // expiró, no está silenciado
    }
    return true;
  }
  
  const encontrado = revisar(numero) || revisar(normalizarNumero(numero));
  
  // Limpiar expirados de una vez
  for (const e of expirados) {
    silencedMap.delete(e);
  }
  if (expirados.length > 0) guardarSilenced();
  
  return encontrado;
}

function unsilenciarNumero(numero) {
  if (!numero) return false;
  const deleted = silencedMap.delete(numero);
  const deleted2 = silencedMap.delete(normalizarNumero(numero));
  if (deleted || deleted2) guardarSilenced();
  // También limpiar activeChats para este número
  activeChats.delete(numero);
  activeChats.delete(normalizarNumero(numero));
  return deleted || deleted2;
}

function guardarSilenced() {
  try {
    const data = {};
    const validKeys = ["@c.us", "@lid", "@s.whatsapp.net"];
    const ahora = Date.now();
    for (const [key, untilTs] of silencedMap) {
      if (!key || key.length <= 5) continue;
      if (!validKeys.some(s => key.includes(s))) continue;
      if (typeof untilTs === 'number' && ahora > untilTs) continue;  // expirado, no guardar
      data[key] = typeof untilTs === 'number' ? untilTs : Date.now() + SILENCE_TTL_PITCH;
    }
    fs.writeFileSync(silencedPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) { console.error("Error guardando silenced.json:", e.message); }
}

// Cargar silencedMap desde disco
(function cargarSilenced() {
  try {
    if (fs.existsSync(silencedPath)) {
      const raw = fs.readFileSync(silencedPath, "utf-8");
      const saved = JSON.parse(raw);
      const ahora = Date.now();
      let count = 0;
      
      if (Array.isArray(saved)) {
        // Formato antiguo (solo números sin expiry) → migrar con TTL default
        for (const item of saved) {
          if (typeof item === "string" && item.length > 5) {
            silencedMap.set(item, ahora + SILENCE_TTL_LEAD);  // legacy: 30 min
            count++;
          } else if (item && item.num) {
            silencedMap.set(item.num, ahora + SILENCE_TTL_LEAD);
            count++;
          }
        }
      } else if (typeof saved === 'object' && saved !== null) {
        // Formato nuevo: { "numero@lid": untilTs, ... }
        for (const [key, untilTs] of Object.entries(saved)) {
          if (!key || key.length <= 5) continue;
          const ts = typeof untilTs === 'number' ? untilTs : ahora + SILENCE_TTL_PITCH;
          if (ahora > ts) continue;  // ya expiró, no cargar
          silencedMap.set(key, ts);
          count++;
        }
      }
      
      console.log(`🔇 ${count} números silenciados cargados`);
    }
  } catch (e) {
    console.log("🔇 Sin silenced.json previo");
  }
})();

// Limpieza periódica de silencios expirados
setInterval(() => {
  const ahora = Date.now();
  let cambios = false;
  for (const [key, untilTs] of silencedMap) {
    if (typeof untilTs === 'number' && ahora > untilTs) {
      silencedMap.delete(key);
      cambios = true;
    }
  }
  if (cambios) {
    guardarSilenced();
    console.log(`🧹 Silencios expirados limpiados (${silencedMap.size} restantes)`);
  }
}, 60000);  // cada minuto

// ─── INICIALIZAR LID RESOLVER ────────────────────────
lidResolver.init();

// ─── FUNCIONES BASE ───────────────────────────────────
function personalizar(texto, nombre) {
  return texto.replace(/\{nombre\}/g, nombre || "👤");
}

function horaCO() {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit", minute: "2-digit",
    day: "2-digit", month: "2-digit",
  });
}

function estaEnHorario() {
  const ahora = new Date();
  const dia = ahora.getDay();
  const hora = ahora.getHours();
  if (dia === 0) return false;
  if (dia === 6) return hora >= config.horario.sabado.inicio && hora < config.horario.sabado.fin;
  return hora >= config.horario.semana.inicio && hora < config.horario.semana.fin;
}

// ─── LEADS (agregación por sesión) ────────────────────
// Un lead por sesión, se enriquece progresivamente
// Solo se guarda definitivamente cuando está COMPLETO
function guardarLeads() {
  try {
    const all = [];
    for (const s of sessions.values()) {
      if (s.leadFinalizado && s.lead) all.push(s.lead);
    }
    const exists = JSON.parse(fs.readFileSync(leadsPath, "utf-8"));
    // Append nuevos (evitar duplicados por hora exacta)
    for (const l of all) {
      if (!exists.some(e => e.fecha === l.fecha)) exists.push(l);
    }
    if (exists.length > 500) exists.splice(0, exists.length - 500);
    fs.writeFileSync(leadsPath, JSON.stringify(exists, null, 2), "utf-8");
  } catch (e) { console.error("Error guardando leads:", e.message); }
}

// ─── Sincronizar con CRM Flask ────────────
function sincronizarCRM(lead) {
  const http = require("http");
  const data = JSON.stringify({
    fecha: lead.fecha,
    numero: lead.numero || "",
    nombre: lead.nombre || "",
    canal: lead.canal || "WhatsApp",
    opcion: lead.opcion || "",
    detalle: lead.detalle || "",
  });

  const req = http.request({
    hostname: "localhost",
    port: 18800,
    path: "/api/leads",
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    timeout: 3000,
  }, (res) => {
    let body = "";
    res.on("data", c => body += c);
    res.on("end", () => {
      if (res.statusCode === 201) console.log("✅ CRM: lead sincronizado");
      else console.log("⚠️ CRM: respuesta " + res.statusCode);
    });
  });
  req.on("error", () => {});  // CRM caído? No importa, ya está en JSON
  req.write(data);
  req.end();
}

function finalizarLead(session) {
  if (!session.lead) return null;
  session.lead.fecha = new Date().toISOString();
  session.lead.atendido = false;
  session.leadFinalizado = true;
  const lead = { ...session.lead };
  guardarLeads();

  // DEPRECATED: Google Sheets → Ahora todo en CRM SQLite
  // sheets.agregarLead(lead).catch(() => {});

  // Notificar al instante (sin cron, sin polling)
  notify.notificarLead(lead);

  // Sincronizar con CRM Flask (SQLite)
  sincronizarCRM(lead);

  return lead;
}

// ─── FAQ ─────────────────────────────────────────────
function detectarFAQ(texto) {
  const t = texto.toLowerCase().trim();
  let best = null, bestPrio = 0;
  for (const entry of faq.entries) {
    for (const kw of entry.keywords) {
      if (t.includes(kw.toLowerCase()) && entry.priority > bestPrio) {
        bestPrio = entry.priority;
        best = entry.response;
        break;
      }
    }
  }
  return best;
}

// ─── DETECCIÓN DE OPCIÓN ────────────────────────────
function detectarOpcion(texto, estado) {
  const t = texto.toLowerCase().trim();

  // Comandos GLOBALES (funcionan en cualquier estado)
  if (t.includes("urgente")) return "urgente";
  if (/^(menu|menú|inicio|empezar|volver|atrás|start|comenzar|reiniciar)$/i.test(t)) return "reset";
  if (/^(gracias|ok|okey|bye|chao|adios|listo|thanks|thank you|dale|si|sí|de acuerdo|ok ok|okey dokey)$/i.test(t)) return "despedida";

  // Si está esperando datos del cliente → NO revisar keywords ni números de menú
  if (estado === ESTADOS.AWAITING_DETAIL) {
    return "detalle"; // Todo lo que escriba es un detalle
  }

  // Submenú E/E
  if (estado === ESTADOS.SUBMENU_EE) {
    if (/^[12]$/.test(t)) return `sub_${t}`;
    // Si no es 1 o 2, igual tratar como detalle si viene de E/E
    return "detalle";
  }

  // Menú principal: números 1-7
  if (/^[1-7]$/.test(t)) {
    const num = parseInt(t);
    if (num === 7 && !config.consultaOTActiva) return null;
    return num;
  }

  // Palabras clave (solo cuando NO está en modo detalle)
  for (const [keyword, opcion] of Object.entries(config.keywords)) {
    if (t.includes(keyword)) return opcion;
  }

  // FAQ
  const faqRespuesta = detectarFAQ(texto);
  if (faqRespuesta) return { tipo: "faq", texto: faqRespuesta };

  // Nada reconocible
  return null;
}

// ─── RESPUESTAS POR ESTADO ──────────────────────────
function responder(session, estado, opcion, texto, nombre) {
  const n = nombre || "👤";
  const p = (msg) => personalizar(msg, n);

  switch (estado) {

    // ─── IDLE: presentación y pedir nombre ────
    case ESTADOS.IDLE: {
      const enHorario = estaEnHorario();
      if (!enHorario) {
        session.estado = ESTADOS.SILENT;
        return p(msgs.fuera_horario);
      }
      session.lead = {
        numero: session.numero,
        nombre: "",
        canal: "WhatsApp",
        opcion: "Nuevo contacto",
        detalle: texto,
      };
      session.estado = ESTADOS.PRESENTACION;
      return p(msgs.presentacion);
    }

    // ─── PRESENTACION: capturar nombre ─────────
    case ESTADOS.PRESENTACION: {
      // Guardar lo que dijo como posible nombre
      const nombreIngresado = texto.trim().substring(0, 60) || "👤";
      session.lead.nombre = nombreIngresado;
      session.nombre = nombreIngresado;

      session.estado = ESTADOS.MENU;
      // Forzar personalización con el nombre capturado
      return personalizar(msgs.bienvenida, nombreIngresado);
    }

    // ─── MENU: opción recibida ────────────────────
    case ESTADOS.MENU: {
      if (typeof opcion === "number") {
        session.lead.opcion = ["", "Reparación de equipos", "Elevadores y Estabilizadores",
          "Automatización", "Cargadores", "IoT", "Otra consulta"][opcion] || "Opción " + opcion;

        // Opción 2 → submenú E/E
        if (opcion === 2) {
          session.estado = ESTADOS.SUBMENU_EE;
          return p(msgs.submenu_elev_estab);
        }

        // Opción 7 → consulta de OT
        if (opcion === 7) {
          if (!config.consultaOTActiva) {
            return 'Esta opción no está disponible en este momento.';
          }
          session.estado = ESTADOS.CONSULTA_OT;
          return '📋 *Consulta de Orden de Trabajo*\n\nPor favor, escribe el código de tu orden.\nEjemplo: HTK-042\n\nEscribe *MENU* para volver.';
        }

        // Para las demás opciones: mostrar info + pedir datos
        const msgMap = { 1: msgs.reparacion_equipos, 3: msgs.automatizacion,
          4: msgs.cargadores, 5: msgs.iot, 6: msgs.otra_consulta };
        const respuesta = msgMap[opcion] || msgs.default;
        session.estado = ESTADOS.AWAITING_DETAIL;
        return p(respuesta);
      }

      // Si es FAQ en estado MENU
      if (opcion && opcion.tipo === "faq") {
        return p(opcion.texto);
      }

      // Si es keyword que matchea
      if (typeof opcion === "number") {
        return responder(session, ESTADOS.MENU, opcion, texto, n);
      }

      // No se reconoció
      session.autoCount = (session.autoCount || 0) + 1;
      if (session.autoCount >= config.maxAutoMensajes) {
        const lead = finalizarLead(session);
        session.estado = ESTADOS.SILENT;
        return p(msgs.derivar_ingeniero);
      }
      return p(msgs.reintento);
    }

    // ─── SUBMENU E/E: sub-opción recibida ─────────
    case ESTADOS.SUBMENU_EE: {
      if (opcion === "sub_1") {
        session.lead.opcion = "Elevadores de voltaje";
        session.lead.detalle = texto;
        session.estado = ESTADOS.AWAITING_DETAIL;
        return p(msgs.elevadores);
      }
      if (opcion === "sub_2") {
        session.lead.opcion = "Estabilizadores";
        session.lead.detalle = texto;
        session.estado = ESTADOS.AWAITING_DETAIL;
        return p(msgs.estabilizadores);
      }
      // Si no es sub-opción válida, tratar como detalle
      session.lead.opcion = "Elevadores y Estabilizadores";
      session.lead.detalle = texto;
      session.estado = ESTADOS.AWAITING_DETAIL;
      // Mostrar info general de E/E y pedir detalles
      return p(msgs.submenu_elev_estab + "\n\n" + "¿Qué tipo de equipo necesitas, " + n + "? Cuéntanos tu caso y un ingeniero te asesorará.");
    }

    // ─── AWAITING DETAIL: cliente dando info ──────
    case ESTADOS.AWAITING_DETAIL: {
      // Acumular detalle (no reemplazar)
      const prev = session.lead.detalle || "";
      session.lead.detalle = prev ? prev + " | " + texto : texto;

      // Finalizar lead
      finalizarLead(session);
      session.estado = ESTADOS.SILENT;

      return p(msgs.derivar_ingeniero);
    }

    // ─── SILENT: Pedro atendió, bot no responde ──
    case ESTADOS.SILENT:
    case ESTADOS.CLOSED: {
      // Si el número fue desilenciado manualmente, resetear a IDLE
      if (!estaSilenciado(session.numero)) {
        console.log(`🔄 Reset a IDLE desde SILENT (desilenciado): ${session.numero}`);
        session.estado = ESTADOS.IDLE;
        session.lead = null;
        session.leadFinalizado = false;
        session.nombre = "";
        session.notificado = false;
        // Reprocesar con estado IDLE
        return responder(session, ESTADOS.IDLE, opcion, texto, nombre || "👤");
      }
      // Modo silencioso — bot no interfiere en la conversación
      return null;
    }

    default:
      return p(msgs.default);
  }
}

// ─── SESIONES ─────────────────────────────────────────
const sessions = new Map();

function getSession(numero) {
  let s = sessions.get(numero);
  if (!s) {
    s = {
      numero,
      estado: ESTADOS.IDLE,
      lead: null,
      leadFinalizado: false,
      autoCount: 0,
      lastMsg: 0,
      nombre: "",
    };
    sessions.set(numero, s);
  }
  return s;
}

// ─── CLIENTE WHATSAPP ────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "htk-bot", dataPath: path.join(__dirname, "session-data") }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  },
});

client.on("qr", async (qr) => {
  console.log("\n🔐 QR generado. Escanea con WhatsApp.");
  qrcode.generate(qr, { small: true });
  console.log("\n");
  try {
    const filePath = path.join(__dirname, "qr-code.png");
    await qrcodePng.toFile(filePath, qr, { type: "png", width: 400, margin: 2 });
    const url = execSync(
      `curl -s -F "reqtype=fileupload" -F "fileToUpload=@${filePath}" https://catbox.moe/user/api.php`,
      { encoding: "utf-8" }
    ).trim();
    console.log("📱 QR también disponible en: " + url);
  } catch (e) {/* silent */}
});

client.on("ready", () => {
  console.log("✅ Bot HTK conectado y listo.");
  console.log(`📱 Número: ${config.botNumber}`);
  console.log(`⏰ Horario: Lun-Vie ${config.horario.semana.inicio}-${config.horario.semana.fin}, Sáb ${config.horario.sabado.inicio}-${config.horario.sabado.fin}`);
  // DEPRECATED: sheets.inicializar(); — CRM SQLite gestiona todo
  console.log("💾 CRM: SQLite local (http://localhost:18800)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

client.on("authenticated", () => console.log("🔐 Sesión autenticada."));

// ─── MANEJADOR DE MENSAJES ──────────────────────────
client.on("message", async (msg) => {
  try {
    const from = msg.from;
    const texto = msg.body.trim();

    // ─── LOG RAW (DEBUG) ────────────────────────
    console.log(`📩 RAW: from=${from} body="${(msg.body||'').substring(0,80)}" type=${msg.type} fromMe=${msg.fromMe} hasMedia=${!!msg.hasMedia} id=${msg.id?.id?.substring(0,12) || '?'}`);
    
    // ─── IGNORAR NO-INDIVIDUOS ──────────────────
    // Grupos, estados (stories), newsletters
    if (from.includes("@g.us") || from === "status@broadcast" || from.includes("@newsletter")) return;

    // ─── IGNORAR VACÍOS ─────────────────────────
    // WhatsApp status updates llegan como mensajes vacíos
    if (!texto && !msg.caption) return;

    // ─── DEDUP: mismo mensaje ya procesado? ──────
    const msgId = msg.id?.id || msg.id?._serialized || "";
    if (yaProcesado(msgId)) {
      console.log(`⏭️  Dup skip: ${from} msg=${msgId.substring(0,12)}`);
      return;
    }
    marcarProcesado(msgId);

    // ─── MENSAJES DEL PROPIETARIO (Pedro) ────────
    if (msg.fromMe || from === config.botNumber.replace(/^\+/, "") + "@c.us") {
      // Los comandos se manejan desde el CRM (no desde WhatsApp)
      // para evitar dejar rastro en chats de leads.
      // Ver CRM → lead → botón "Silenciar"
      
      // AUTO-SILENCE: cada msg de Pedro → marcar chat activo
      if (msg.to && !msg.to.includes("@g.us")) {
        marcarChatActivo(msg.to);
        silenciarNumero(msg.to);
        console.log(`🔇 Pedro activo en ${msg.to} → bot silenciado automático`);
      }
      return;
    }

    // ─── BOT GLOBALMENTE APAGADO? ──
    if (botGlobalOff) {
      // No loguear cada mensaje, solo el primero cada 10s
      return;
    }

    // ─── CHAT ACTIVO? Pedro está conversando aquí ──
    if (esChatActivo(from)) {
      const s = getSession(from);
      s.lastMsg = Date.now();
      console.log(`🟢 Chat activo (Pedro), ignorando: ${from}`);
      return;
    }

    // ─── SILENCED? El bot no debe responder ──
    if (estaSilenciado(from)) {
      const s = getSession(from);
      s.lastMsg = Date.now();
      console.log(`🔇 Silenciado escribe: ${from} → ignorado`);
      return;
    }

    // ─── RESOLVER @LID → @C.US ─────────────────────
    let resolvedFrom = from;
    if (from.includes("@lid") || from.includes("@s.whatsapp.net")) {
      const resolved = await lidResolver.resolve(from, msg, client, client.pupPage);
      if (resolved && resolved.phone) {
        resolvedFrom = resolved.phone;
        console.log(`🔗 LID ${from} resuelto → ${resolvedFrom} (${resolved.source}, confianza: ${resolved.confidence})`);
        
        // Re-verificar silencio con el número real
        if (estaSilenciado(resolvedFrom)) {
          const s = getSession(from);
          s.lastMsg = Date.now();
          console.log(`🔇 Silenciado (resuelto) escribe: ${resolvedFrom} → ignorado`);
          return;
        }
        
        // Migrar sesión si existe
        const fromSession = sessions.get(from);
        const resolvedSession = sessions.get(resolvedFrom);
        if (fromSession && !resolvedSession) {
          sessions.set(resolvedFrom, fromSession);
          sessions.delete(from);
        }
      } else {
        console.log(`⚠️ LID ${from} no pudo resolverse — procesando como @lid`);
      }
    }
    from = resolvedFrom;

    console.log(`📩 Mensaje de ${from}: "${texto.substring(0, 80)}"`);

    const session = getSession(from);
    session.numero = from;

    const nombre = session.nombre || "👤";

    // Timeout: 30 min sin actividad → reset (excepto sesiones outbound/silent)
    const ahora = Date.now();
    if (session.lastMsg && (ahora - session.lastMsg) > config.resetTimeoutMs) {
      if (!session.atendidoPorPedro && session.estado !== ESTADOS.SILENT) {
        session.estado = ESTADOS.IDLE;
        session.lead = null;
        session.leadFinalizado = false;
        session.autoCount = 0;
      } else {
        // Sesión outbound/silent: mantener estado, solo actualizar timestamp
        session.lastMsg = ahora;
      }
    }
    session.lastMsg = ahora;

    const enHorario = estaEnHorario();

    // Detectar comando/opción según el estado actual
    const opcion = detectarOpcion(texto, session.estado);

    // ─── COMANDOS GLOBALES ──────────────────────

    // URGENTE desde cualquier estado
    if (opcion === "urgente") {
      session.lead = session.lead || { numero: from, nombre, canal: "WhatsApp" };
      session.lead.opcion = "URGENTE";
      session.lead.detalle = texto;
      finalizarLead(session);
      session.estado = ESTADOS.SILENT;
      await msg.reply(personalizar(msgs.urgente_recibido, nombre));
      await new Promise(r => setTimeout(r, 1000));
      await msg.reply(personalizar(msgs.derivar_ingeniero, nombre));
      return;
    }

    // RESET desde cualquier estado
    if (opcion === "reset") {
      session.estado = ESTADOS.IDLE;
      session.lead = null;
      session.leadFinalizado = false;
      session.autoCount = 0;
      session.nombre = "";
      if (!enHorario) {
        await msg.reply(personalizar(msgs.fuera_horario, nombre));
        return;
      }
      await msg.reply(personalizar(msgs.presentacion, "👤"));
      session.lead = { numero: from, nombre: "", canal: "WhatsApp", opcion: "Nuevo contacto", detalle: texto };
      session.estado = ESTADOS.PRESENTACION;
      return;
    }

    // DESPEDIDA desde cualquier estado
    if (opcion === "despedida") {
      const despedidaTexto = personalizar(msgs.despedida, nombre) + "\n\nSi necesitas algo más, solo escribe *Hola* y estaré aquí para ayudarte. 🙌";
      await msg.reply(despedidaTexto);
      // No silenciar, reiniciar para que pueda volver a escribir "Hola"
      session.estado = ESTADOS.IDLE;
      session.lead = null;
      session.leadFinalizado = false;
      session.autoCount = 0;
      session.nombre = "";
      return;
    }

    // ─── FUERA DE HORARIO ───────────────────────
    if (!enHorario && session.estado !== ESTADOS.IDLE) {
      await msg.reply(personalizar(msgs.fuera_horario, nombre));
      return;
    }

    // ─── CONSULTA OT ──────────────────────────
    if (session.estado === ESTADOS.CONSULTA_OT) {
      const textoConsulta = texto.toUpperCase().trim();
      
      if (textoConsulta === 'MENU' || textoConsulta === 'SALIR' || opcion === 'reset') {
        session.estado = ESTADOS.MENU;
        await msg.reply(personalizar(msgs.bienvenida, nombre));
        return;
      }
      
      const respuestaOT = await consultarOT(textoConsulta, config.crmApiUrl);
      session.estado = ESTADOS.MENU;
      await msg.reply(respuestaOT + '\n\n' + personalizar(msgs.bienvenida, nombre));
      return;
    }

    // ─── PROCESAR SEGÚN ESTADO ─────────────────
    const respuesta = responder(session, session.estado, opcion, texto, nombre);
    if (respuesta) {
      try {
        await msg.reply(respuesta);
        console.log(`✅ Respondido a ${from}: ${respuesta.substring(0, 60)}...`);
      } catch (replyErr) {
        console.error(`❌ Error al responder a ${from}:`, replyErr.message);
      }
    } else {
      console.log(`⚠️ Sin respuesta para ${from} (opcion=${opcion}, estado=${session.estado})`);
    }

  } catch (error) {
    console.error("❌ Error:", error.message, error.stack?.substring(0, 200));
  }
});

// ─── CONSULTA DE ORDEN DE TRABAJO ──────────────────
async function consultarOT(codigo, crmApiUrl) {
  try {
    const base = crmApiUrl || 'http://localhost:18800';
    const url = `${base}/api/work_orders/${encodeURIComponent(codigo)}`;
    const resp = await fetch(url);
    
    if (!resp.ok) {
      if (resp.status === 404) {
        return `❌ No encontré ninguna orden con el código *${codigo}*.\n\nVerifica el código e intenta de nuevo.\nEjemplo: HTK-042`;
      }
      return `❌ Error al consultar (${resp.status}). Intenta más tarde o comunícate al 📞 +57 315 6032940.`;
    }
    
    const ot = await resp.json();
    
    // Determinar icono del tipo
    const iconoTipo = ot.tipo === 'fabricacion' ? '🏭' : ot.tipo === 'instalacion' ? '🚗' : '🔧';
    const tipoLabel = (ot.tipo || '').charAt(0).toUpperCase() + (ot.tipo || '').slice(1);
    
    let msg = `📋 *${ot.id}* — ${iconoTipo} ${tipoLabel.toUpperCase()}\n\n`;
    
    // Equipo
    const equipo = [ot.equipo?.tipo, ot.equipo?.marca, ot.equipo?.modelo].filter(Boolean).join(' ');
    if (equipo) msg += `🔧 Equipo: ${equipo}\n`;
    
    // Cliente
    if (ot.cliente?.nombre) msg += `👤 Cliente: ${ot.cliente.nombre}\n`;
    
    // Estado actual
    msg += `📍 Estado: *${(ot.estado || 'sin estado').toUpperCase()}*\n`;
    
    // Fechas
    if (ot.fechas?.recibido) msg += `📅 Recibido: ${formatFecha(ot.fechas.recibido)}\n`;
    
    // Campos extra de fabricación
    if (ot.tipo === 'fabricacion' && ot.campos_extra) {
      try {
        const extra = typeof ot.campos_extra === 'string' ? JSON.parse(ot.campos_extra) : ot.campos_extra;
        if (extra.operario) msg += `👷 Operario: ${extra.operario}\n`;
        if (extra.fecha_estimada) msg += `📅 Entrega est.: ${formatFecha(extra.fecha_estimada)}\n`;
        if (extra.tipo_producto) msg += `🏷️ Producto: ${extra.tipo_producto}\n`;
        if (extra.capacidad) msg += `⚡ Capacidad: ${extra.capacidad}\n`;
      } catch(e) {}
    }
    
    // Campos extra de instalación
    if (ot.tipo === 'instalacion' && ot.campos_extra) {
      try {
        const extra = typeof ot.campos_extra === 'string' ? JSON.parse(ot.campos_extra) : ot.campos_extra;
        if (extra.fecha_agendada) msg += `📅 Agendado: ${formatFecha(extra.fecha_agendada)}\n`;
        if (extra.tecnico_asignado) msg += `👷 Técnico: ${extra.tecnico_asignado}\n`;
      } catch(e) {}
    }
    
    // Timeline (últimos 5 eventos)
    if (ot.historial && ot.historial.length > 0) {
      msg += `\n📜 *Historial:*\n`;
      const ultimos = ot.historial.slice(-5);
      for (const h of ultimos) {
        const icono = estadoIcono(h.estado);
        msg += `${icono} ${formatFecha(h.fecha)} — ${h.descripcion}\n`;
      }
    }
    
    // Pagos
    if (ot.presupuesto != null && ot.presupuesto > 0) {
      const totalAbonado = ot.total_abonado || 0;
      const pendiente = ot.saldo_pendiente != null ? ot.saldo_pendiente : (ot.presupuesto - totalAbonado);
      
      msg += `\n💰 Presupuesto: $${formatearPesos(ot.presupuesto)}`;
      if (totalAbonado > 0) {
        msg += `\n💵 Abonado: $${formatearPesos(totalAbonado)}`;
        if (pendiente > 0) {
          msg += `\n⚠️ Pendiente: $${formatearPesos(pendiente)}`;
        } else {
          msg += `\n✅ *TOTALMENTE PAGADO*`;
        }
      }
    }
    
    // Diagnóstico (solo reparación)
    if (ot.tipo === 'reparacion' && ot.diagnostico) {
      msg += `\n\n🔍 Diagnóstico: ${ot.diagnostico}`;
    }
    
    return msg;
  } catch(e) {
    console.log('Error consultando OT:', e.message);
    return '❌ Error al consultar. Intenta más tarde o comunícate al 📞 +57 315 6032940.';
  }
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '';
  try {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr.split('T')[0];
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch(e) { return fechaStr; }
}

function formatearPesos(valor) {
  return Number(valor).toLocaleString('es-CO');
}

function estadoIcono(estado) {
  const iconos = {
    'recibido': '📥', 'diagnosticando': '🔍', 'presupuestado': '📋', 'aprobado': '✅',
    'reparando': '🔧', 'esperando_repuestos': '⏳', 'completado': '✅', 'entregado': '📦',
    'cancelado': '❌', 'cotizando': '📋', 'diseno_aprobado': '✅', 'materiales': '📦',
    'bobinado': '🔧', 'ensamble': '🔩', 'pruebas': '⚡', 'control_calidad': '✅',
    'finalizado': '🏁', 'agendado': '📅', 'en_sitio': '👷', 'instalando': '🔌', 'facturado': '📄'
  };
  return iconos[estado] || '📌';
}

// ─── CARGA DE CONFIG DESDE CRM ─────────────────────
let configCrmLoaded = false;

async function loadConfigFromCRM() {
  try {
    const resp = await fetch('http://localhost:18800/api/bot/config');
    if (!resp.ok) {
      console.log('⚠️ No se pudo cargar config del CRM, usando defaults locales');
      return;
    }
    const crmConfig = await resp.json();
    
    // Toggle de consulta OT
    if ('consulta_ot_activa' in crmConfig) {
      config.consultaOTActiva = crmConfig.consulta_ot_activa === 'true' || crmConfig.consulta_ot_activa === true;
      console.log(`📋 Consulta OT: ${config.consultaOTActiva ? 'ACTIVA' : 'inactiva'}`);
    }
    
    // URL del CRM
    if (crmConfig.crm_api_url) {
      config.crmApiUrl = crmConfig.crm_api_url;
      console.log(`🔗 CRM URL: ${config.crmApiUrl}`);
    }
    
    // Horarios
    const hInicio = parseInt(crmConfig.horario_semana_inicio);
    const hFin = parseInt(crmConfig.horario_semana_fin);
    const hSabInicio = parseInt(crmConfig.horario_sabado_inicio);
    const hSabFin = parseInt(crmConfig.horario_sabado_fin);
    if (!isNaN(hInicio)) config.horario.semana.inicio = hInicio;
    if (!isNaN(hFin)) config.horario.semana.fin = hFin;
    if (!isNaN(hSabInicio)) config.horario.sabado.inicio = hSabInicio;
    if (!isNaN(hSabFin)) config.horario.sabado.fin = hSabFin;
    
    // Reset timeout
    if (crmConfig.reset_timeout_ms) {
      config.resetTimeoutMs = parseInt(crmConfig.reset_timeout_ms) || config.resetTimeoutMs;
    }
    
    // Max auto mensajes
    if (crmConfig.max_auto_mensajes) {
      config.maxAutoMensajes = parseInt(crmConfig.max_auto_mensajes) || config.maxAutoMensajes;
    }
    
    // ─── Inyectar opción 7 en el menú si consulta OT activa ───
    if (config.consultaOTActiva) {
      if (!msgs.bienvenida.includes('7️⃣')) {
        msgs.bienvenida = msgs.bienvenida.replace(
          'Responde con el *número* de la opción que necesites.',
          '7️⃣ 📋 *Consultar estado de mi orden*\n→ Ingresa el código de tu orden\n\nResponde con el *número* de la opción que necesites.'
        );
        console.log('📋 Opción 7 (Consulta OT) inyectada en menú de bienvenida');
      }
    }
    
    configCrmLoaded = true;
    console.log('✅ Config cargada desde CRM');
  } catch(e) {
    console.log('⚠️ Error cargando config del CRM:', e.message);
  }
}

// ─── API HTTP PARA ENVÍO DE MENSAJES ───────────────
const http = require("http");
const API_PORT = 18802;

const apiServer = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  
  // CORS para llamadas locales
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  
  if (req.method !== "POST") {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: "Solo POST" }));
  }

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      
      if (req.url === "/send") {
        const { to, message } = data;
        if (!to || !message) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: "Faltan 'to' o 'message'" }));
        }
        const fullNumber = normalizarNumero(to);
        let sentMsg;
        try {
          // Intentar typing first (puede fallar si no hay LID)
          const chat = await client.getChatById(fullNumber);
          await chat.sendStateTyping().catch(() => {});
        } catch (e) {
          // No LID — enviar directo igual
          console.log(`⚠️ Sin chat previo con ${fullNumber}, enviando directo...`);
        }
        await new Promise(r => setTimeout(r, 1000));
        try {
          sentMsg = await client.sendMessage(fullNumber, message);
        } catch (sendErr) {
          const errMsg = sendErr.message || String(sendErr);
          console.log(`❌ Error enviando a ${fullNumber}: ${errMsg.substring(0,120)}`);
          res.writeHead(400);
          return res.end(JSON.stringify({ ok: false, error: errMsg.substring(0,200), to: fullNumber }));
        }
        const realChatId = sentMsg?.to || fullNumber;
        
        // Registrar mensaje outbound para resolución @lid
        const sentId = sentMsg?.id?._serialized || sentMsg?.id?.id || "";
        if (sentId) {
          lidResolver.recordOutbound(sentId, fullNumber, data.lead_id || null, message);
          // Si el ID real difiere del original (p.ej. @lid), registrar ambos
          if (realChatId !== fullNumber) {
            lidResolver.recordOutbound(sentId + "_real", realChatId, data.lead_id || null, message);
          }
        }
        
        silenciarNumero(fullNumber);
        if (realChatId !== fullNumber && realChatId !== to) {
          silenciarNumero(realChatId);
          console.log(`🔇 También silenciado ID real: ${realChatId}`);
        }
        marcarChatActivo(realChatId);
        const outboundSession = getSession(realChatId);
        outboundSession.estado = ESTADOS.SILENT;
        outboundSession.lastMsg = Date.now();
        outboundSession.lead = outboundSession.lead || { numero: realChatId, nombre: "Prospección outbound", canal: "WhatsApp", opcion: "Prospección", detalle: "Mensaje de prospección enviado por API" };
        outboundSession.leadFinalizado = true;
        outboundSession.atendidoPorPedro = true;
        console.log(`✅ Mensaje enviado a ${realChatId} 🔇 silenciado`);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, to: fullNumber }));
      }
      
      if (req.url === "/silence") {
        const { numero } = data;
        if (!numero) { res.writeHead(400); return res.end(JSON.stringify({ error: "Falta 'numero'" })); }
        silenciarNumero(normalizarNumero(numero));
        console.log(`🔇 Silenciado vía API: ${numero}`);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true }));
      }
      
      if (req.url === "/unsilence") {
        const { numero } = data;
        if (!numero) { res.writeHead(400); return res.end(JSON.stringify({ error: "Falta 'numero'" })); }
        unsilenciarNumero(normalizarNumero(numero));
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true }));
      }
      
      if (req.url === "/global-off") {
        botGlobalOff = true;
        guardarGlobalOff();
        console.log(`🛑 Bot global APAGADO vía API`);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, status: "off" }));
      }
      
      if (req.url === "/global-on") {
        botGlobalOff = false;
        guardarGlobalOff();
        console.log(`🟢 Bot global ENCENDIDO vía API`);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, status: "on" }));
      }
      
      if (req.url === "/status") {
        res.writeHead(200);
        return res.end(JSON.stringify({
          ok: true,
          status: botGlobalOff ? "off" : "on",
          connected: client ? true : false,
          silenced: silencedMap.size,
          uptime: process.uptime(),
          consultaOTActiva: config.consultaOTActiva || false,
          crmApiUrl: config.crmApiUrl || ''
        }));
      }
      
      if (req.url === "/reload-config") {
        loadConfigFromCRM().then(() => {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, message: 'Config recargada desde CRM', consultaOTActiva: config.consultaOTActiva }));
        }).catch(err => {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
        return;
      }
      
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Ruta no encontrada" }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

apiServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`⚠️ Puerto ${API_PORT} ya en uso — API HTTP no disponible (probablemente restauración de proceso)`);
  } else {
    console.error(`❌ Error API server:`, err.message);
  }
});

apiServer.listen(API_PORT, () => {
  console.log(`📨 API de envío en http://localhost:${API_PORT}/send`);
});

// ─── INICIAR ─────────────────────────────────────────
console.log("🚀 Iniciando Bot HTK v4...");

// Cargar config del CRM al arrancar (horarios, toggles, menú dinámico)
loadConfigFromCRM().then(() => {
  console.log("📋 Config CRM inicial cargada");
}).catch(e => {
  console.log("⚠️ No se pudo cargar config CRM inicial:", e.message);
});

client.initialize();
