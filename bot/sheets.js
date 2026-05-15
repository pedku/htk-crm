// sheets.js — Google Sheets: API Key (lectura) + Webhook (escritura)
const https = require("https");
const path = require("path");
const fs = require("fs");

const API_KEY = "AIzaSyAG6eKKp4dQcEsv534A132jTVF9SW5ZpEs";
const SPREADSHEET_ID_FILE = path.join(__dirname, "data", "sheet_id.txt");
const WEBHOOK_FILE = path.join(__dirname, "data", "webhook_url.txt");

let spreadsheetId = null;
let webhookUrl = null;

function inicializar() {
  try {
    if (fs.existsSync(SPREADSHEET_ID_FILE)) {
      spreadsheetId = fs.readFileSync(SPREADSHEET_ID_FILE, "utf-8").trim();
    }
  } catch (_) {}

  try {
    if (fs.existsSync(WEBHOOK_FILE)) {
      webhookUrl = fs.readFileSync(WEBHOOK_FILE, "utf-8").trim();
    }
  } catch (_) {}

  if (!spreadsheetId) {
    console.log("📁 Sin Sheet ID. Modo solo local.");
    return false;
  }

  const writeStatus = webhookUrl ? "escritura webhook" : "sin escritura cloud";
  console.log(`☁️ Google Sheets: lectura API Key + ${writeStatus}.`);
  return true;
}

// ─── LEER (API Key) ─────────────────────────────────
function apiGet(range) {
  return new Promise((resolve) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
    https.get(url, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve([]);
        try { resolve(JSON.parse(d).values || []); } catch (_) { resolve([]); }
      });
    }).on("error", () => resolve([]));
  });
}

// ─── LEER PRECIOS ────────────────────────────────────
async function leerPrecios() {
  if (!spreadsheetId) return [];
  const rows = await apiGet("📦 Precios!A:F");
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase().trim());
  return rows.slice(1).filter(r => r[0]).map(r => {
    const item = {};
    headers.forEach((h, i) => item[h] = (r[i] || "").trim());
    return item;
  });
}

// ─── ESCRIBIR LEAD (Webhook) ─────────────────────────
async function agregarLead(lead) {
  // Primero intentar webhook
  if (webhookUrl) {
    try {
      const body = JSON.stringify(lead);
      const result = await webhookPost(webhookUrl, body);
      if (result) {
        console.log("✅ Lead enviado al Sheets.");
        return true;
      }
    } catch (_) {}
  }

  return false;
}

function webhookPost(url, body) {
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 8000,
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(res.statusCode === 200));
    });
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

// ─── BUSCAR PRECIO ──────────────────────────────────
async function buscarPrecio(texto) {
  const precios = await leerPrecios();
  if (!precios.length) return null;
  const t = texto.toLowerCase();
  return precios.filter(p => {
    const full = `${p.producto || ""} ${p.tipo || ""} ${p.categoría || ""}`.toLowerCase();
    return (t.includes("elevador") && full.includes("elevador")) ||
           (t.includes("estabilizador") && full.includes("estabilizador"));
  });
}

module.exports = { inicializar, leerPrecios, agregarLead, buscarPrecio,
  get isReady() { return spreadsheetId !== null; },
  get hasWebhook() { return !!webhookUrl; },
  get spreadsheetId() { return spreadsheetId; },
};
