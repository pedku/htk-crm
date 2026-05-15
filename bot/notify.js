// notify.js — Notificación instantánea a Telegram cuando se finaliza un lead
// Se llama desde bot.js, sin cron, sin polling.
const https = require("https");

const BOT_TOKEN = "8580263059:AAE9YR_eIRna1T43DMZDQPt3m3_1vTkxlCs";
const CHAT_ID = "5199965596";

function notificarLead(lead) {
  const hora = new Date(lead.fecha).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit",
  });
  const fecha = new Date(lead.fecha).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit",
  });
  const nombre = lead.nombre || "Desconocido";
  const detalle = lead.detalle ? `\n💬 ${lead.detalle}` : "";
  const opcion = lead.opcion || "Sin clasificar";

  const texto = `📩 *Nuevo Lead HTK*\n👤 ${nombre}\n📋 ${opcion}${detalle}\n⏱ ${fecha} ${hora}`;

  const data = JSON.stringify({
    chat_id: CHAT_ID,
    text: texto,
    parse_mode: "Markdown",
  });

  const req = https.request(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      timeout: 8000,
    },
    (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          console.log("⚠️ Telegram notify falló:", res.statusCode);
        }
      });
    }
  );
  req.on("error", (e) => console.log("⚠️ Telegram notify error:", e.message));
  req.write(data);
  req.end();
}

function notificarRespuestaSilenciada(numero, nombre, texto) {
  const hora = new Date().toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit",
  });
  const num = (numero || "").replace("@c.us", "");
  const breve = (texto || "").substring(0, 150);

  const msg = `🔇 *Respondió contacto silenciado*\n📱 +${num}\n👤 ${nombre || "Desconocido"}\n⏱ ${hora}\n💬 ${breve}`;

  const data = JSON.stringify({
    chat_id: CHAT_ID,
    text: msg,
    parse_mode: "Markdown",
  });

  const req = https.request(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      timeout: 8000,
    },
    (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        if (res.statusCode !== 200) console.log("⚠️ Telegram notify (silenced) falló:", res.statusCode);
      });
    }
  );
  req.on("error", (e) => console.log("⚠️ Telegram notify (silenced) error:", e.message));
  req.write(data);
  req.end();
}

module.exports = { notificarLead, notificarRespuestaSilenciada };
