// auth.js — Token de Google Sheets via gcloud (sin service account)
const { execSync } = require("child_process");

const GCLOUD = "/home/peku/.local/google-cloud-sdk/bin/gcloud";

function getAccessToken() {
  try {
    return execSync(`${GCLOUD} auth print-access-token`, {
      encoding: "utf-8", timeout: 5000,
    }).trim();
  } catch (e) {
    console.error("❌ gcloud token error:", e.message);
    return null;
  }
}

function inicializar() {
  const token = getAccessToken();
  if (token) {
    console.log("☁️ Google Sheets conectado (gcloud).");
    return token;
  }
  console.log("📁 Google Sheets: modo solo lectura (sin gcloud).");
  return null;
}

module.exports = { inicializar, getAccessToken };
