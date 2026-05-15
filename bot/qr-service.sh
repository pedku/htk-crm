#!/bin/bash
# Genera QR y lo sube a catbox, refrescando cada 30s
DIR="/home/peku/.openclaw/whatsapp-bot"
cd "$DIR"

# Limpiar sesión anterior
rm -rf session-data/session-htk-bot

node -e "
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'htk-bot',
    dataPath: path.join(__dirname, 'session-data'),
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  },
});

let qrCount = 0;

client.on('qr', async (qr) => {
  qrCount++;
  const filePath = path.join(__dirname, 'qr-code.png');
  try {
    await qrcode.toFile(filePath, qr, { type: 'png', width: 400, margin: 2 });
    
    // Subir a catbox
    const url = execSync(
      'curl -s -F \"reqtype=fileupload\" -F \"fileToUpload=@${filePath}\" https://catbox.moe/user/api.php',
      { encoding: 'utf-8' }
    ).trim();
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 QR #' + qrCount + ' — ABRE Y ESCANEA:');
    console.log(url);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  } catch (e) {
    console.error('Error:', e.message);
  }
});

client.on('ready', () => {
  console.log('✅ Bot autenticado. Ya está conectado.');
  process.exit(0);
});

client.on('authenticated', () => {
  console.log('✅ Escaneo exitoso! Sesión guardada.');
  process.exit(0);
});

client.initialize();
" 2>&1
