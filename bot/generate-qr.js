// generate-qr.js — Genera QR como imagen PNG para escanear
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const path = require("path");
const fs = require("fs");

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
  console.log("✅ QR recibido.");
  
  // Mostrar el setup code para generar QR online
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔗 ABRE ESTE LINK EN TU NAVEGADOR:");
  console.log("");
  const encoded = encodeURIComponent(qr);
  console.log(`https://chart.googleapis.com/chart?cht=qr&chs=400x400&chl=${encoded}`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📱 Escanea el QR con WhatsApp → Dispositivos vinculados");
  
  // Guardar también como archivo
  try {
    const filePath = path.join(__dirname, "qr-code.png");
    await qrcode.toFile(filePath, qr, {
      type: "png",
      width: 400,
      margin: 2,
    });
  } catch (_) {}
  
  setTimeout(() => {
    console.log("👋 QR expiró. Ejecuta de nuevo si no alcanzaste.");
    process.exit(0);
  }, 25000); // 25 segundos antes de cerrar
});

client.on("ready", () => {
  console.log("✅ Bot ya autenticado. No necesita QR.");
  process.exit(0);
});

console.log("🚀 Generando QR como imagen...");
client.initialize();
