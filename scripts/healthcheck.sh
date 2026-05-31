#!/bin/bash
# healthcheck.sh — F4.3 Monitoreo activo con alertas WhatsApp a Pedro
set -euo pipefail

CRM_URL="http://localhost:18800/api/health"
PEDRO_TEL="+573208130156"
LOG_DIR="$HOME/.openclaw/workspace/crm/logs"
LOG="$LOG_DIR/healthcheck.log"
BOT_SCRIPT="$HOME/.openclaw/workspace/crm/scripts/recordatorio_facturas.py"

mkdir -p "$LOG_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }

# 1. CRM API
if curl -sf "$CRM_URL" > /dev/null 2>&1; then
    log "✅ CRM OK"
else
    log "❌ CRM CAIDO"
    # Telegram al dueño (via bot)
    python3 -c "
import sys; sys.path.insert(0, '$HOME/.openclaw/workspace/crm')
from app import create_app; from app.services.bot_service import send_whatsapp
app = create_app()
with app.app_context():
    send_whatsapp('$PEDRO_TEL', '🚨 HTK CRM — CRM caido. Revisar inmediatamente.')
" 2>/dev/null
fi

# 2. Bot WhatsApp (puerto 18802)
if ss -tlnp 2>/dev/null | grep -q ':18802'; then
    log "✅ Bot OK"
else
    log "❌ Bot CAIDO"
fi

# 3. Healthcheck endpoint detallado
HEALTH=$(curl -sf "$CRM_URL" 2>/dev/null || echo '{"status":"down"}')
echo "$HEALTH" | python3 -c "
import json,sys
d = json.load(sys.stdin)
for k,v in d.get('checks',{}).items():
    s = v.get('status','?')
    print(f'  {k}: {s}')
" >> "$LOG" 2>/dev/null

log "---"
