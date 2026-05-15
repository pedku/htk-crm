// qr-onetime.js — Genera QR como imagen, sube a catbox, espera escaneo
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const { execSync } = require("child_process");
const path = require("path");

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "htk-bot",
    dataPath: path.join(__dirname, "session-data"),
  }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  },
});

client.on("qr", async (qr) => {
  const filePath = path.join(__dirname, "qr-code.png");
  try {
    await qrcode.toFile(filePath, qr, { type: "png", width: 400, margin: 2 });
    const url = execSync(
      `curl -s -F "reqtype=fileupload" -F "fileToUpload=@${filePath}" https://catbox.moe/user/api.php`,
      { encoding: "utf-8" }
    ).trim();
    console.log("\n📱 QR GENERADO — ESCANEA CON WHATSAPP:");
    console.log(url);
    console.log("\n");
  } catch (e) {
    console.error("Error subiendo QR:", e.message);
  }
});

client.on("authenticated", () => {
  console.log("✅ Escaneo exitoso! Sesión guardada.");
});

client.on("ready", () => {
  console.log("✅ Bot conectado y listo.");
  process.exit(0);
});

// Timeout: keep alive 120s for scanning
setTimeout(() => {
  console.log("⏰ Tiempo agotado. Vuelve a ejecutar.");
  process.exit(1);
}, 120000);

console.log("🚀 Generando QR...");
client.initialize();
