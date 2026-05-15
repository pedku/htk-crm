// notificar-leads.js — Busca leads nuevos y notifica por Telegram
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const leadsPath = path.join(__dirname, "data", "leads.json");
const lastFile = path.join(__dirname, "data", ".last_check");

const BOT_TOKEN = "8580263059:AAE9YR_eIRna1T43DMZDQPt3m3_1vTkxlCs";
const CHAT_ID = "5199965596";

let lastCheck = 0;
try {
  if (fs.existsSync(lastFile)) {
    lastCheck = parseInt(fs.readFileSync(lastFile, "utf-8").trim()) || 0;
  }
} catch (_) {}

// Primera ejecución: solo guardar timestamp sin notificar
if (lastCheck === 0) {
  fs.writeFileSync(lastFile, String(Date.now()), "utf-8");
  console.log("init");
  process.exit(0);
}

try {
  const leads = JSON.parse(fs.readFileSync(leadsPath, "utf-8"));
  const nuevos = leads.filter(l => new Date(l.fecha).getTime() > lastCheck);

  if (nuevos.length === 0) {
    console.log("none");
    process.exit(0);
  }

  fs.writeFileSync(lastFile, String(Date.now()), "utf-8");

  for (const lead of nuevos) {
    const hora = new Date(lead.fecha).toLocaleTimeString("es-CO", {
      hour: "2-digit", minute: "2-digit",
    });
    const fecha = new Date(lead.fecha).toLocaleDateString("es-CO", {
      day: "2-digit", month: "2-digit",
    });
    const nombre = lead.nombre || "Desconocido";
    const detalle = lead.detalle ? `\n💬 ${lead.detalle}` : "";

    const mensaje = `📩 *Nuevo Lead HTK*\n👤 ${nombre}\n📋 ${lead.opcion}${detalle}\n⏱ ${fecha} ${hora}`;

    // Enviar a Telegram
    const encoded = encodeURIComponent(mensaje);
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encoded}&parse_mode=Markdown`;

    try {
      execSync(`curl -s "${url}"`, { timeout: 8000, stdio: "pipe" });
      console.log("sent:", lead.opcion);
    } catch (e) {
      console.error("fail:", e.message);
    }
  }
} catch (e) {
  console.error("error:", e.message);
}
