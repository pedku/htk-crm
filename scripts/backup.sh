#!/usr/bin/env bash
# backup.sh — Backup completo HTK INGENIERIA
# Uso: ./backup.sh [directorio_destino]
# Por defecto guarda en ~/htk-backups/

set -euo pipefail

DEST="${1:-$HOME/htk-backups}"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$DEST"

BACKUP_FILE="$DEST/htk-full-$DATE.tar.gz"
LOG_FILE="$DEST/htk-full-$DATE.log"

echo "⚡ HTK BACKUP — $DATE" | tee "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"

# 1. Git push del CRM
echo "[1/6] Pusheando CRM a GitHub..." | tee -a "$LOG_FILE"
cd ~/.openclaw/workspace/crm
git push origin main 2>&1 | tee -a "$LOG_FILE"
cd ~/.openclaw/workspace
git push origin master 2>&1 | tee -a "$LOG_FILE"

# 2. Exportar DBs a JSON (por si acaso)
echo "[2/6] Exportando DB a JSON..." | tee -a "$LOG_FILE"
python3 -c "
import sqlite3, json
db = sqlite3.connect('crm/htk_crm.db')
tables = [r[0] for r in db.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]
backup = {}
for t in tables:
    rows = db.execute(f'SELECT * FROM {t}').fetchall()
    cols = [d[1] for d in db.execute(f'PRAGMA table_info({t})').fetchall()]
    backup[t] = [dict(zip(cols, r)) for r in rows]
with open('$DEST/htk_db_$DATE.json', 'w') as f:
    json.dump(backup, f, indent=2, default=str)
print(f'  → {len(tables)} tablas exportadas')
" 2>&1 | tee -a "$LOG_FILE"

# 3. Comprimir todo
echo "[3/6] Comprimiendo archivos clave..." | tee -a "$LOG_FILE"
tar czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='crm/bot/node_modules' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.git' \
  --exclude='media' \
  --exclude='npm' \
  --exclude='crm/htk_crm.db' \
  --exclude='crm/.codegraph' \
  --exclude='*.tar.gz' \
  --exclude='agentmemory.log' \
  --exclude='subagents' \
  -C "$HOME" \
  .openclaw/workspace \
  .openclaw/identity \
  .openclaw/credentials \
  .openclaw/skills \
  .openclaw/plugin-skills \
  .openclaw/agents \
  .openclaw/memory \
  .openclaw/cron \
  .openclaw/telegram \
  .openclaw/openclaw.json \
  .config/systemd/user/htk-crm.service \
  2>&1 | tee -a "$LOG_FILE"

# 4. Tamaños
echo "[4/6] Resumen:" | tee -a "$LOG_FILE"
echo "  Backup:   $BACKUP_FILE" | tee -a "$LOG_FILE"
echo "  Tamaño:   $(du -h "$BACKUP_FILE" | cut -f1)" | tee -a "$LOG_FILE"
echo "  DB JSON:  $DEST/htk_db_$DATE.json" | tee -a "$LOG_FILE"

# 5. Subir a Google Drive
echo "[5/6] Subiendo a Google Drive..." | tee -a "$LOG_FILE"
DB_JSON="$DEST/htk_db_$DATE.json"
if command -v gog &>/dev/null; then
  GOG_ENV="GOG_KEYRING_BACKEND=file GOG_KEYRING_PASSWORD=htk_gog_keyring_2026"
  DRIVE_ACCOUNT="--account info@htk-ingenieria.com"
  echo "  → Subiendo tarball..." | tee -a "$LOG_FILE"
  eval $GOG_ENV gog drive $DRIVE_ACCOUNT upload "$BACKUP_FILE" --force --plain 2>&1 | tee -a "$LOG_FILE"
  echo "  → Subiendo DB JSON..." | tee -a "$LOG_FILE"
  eval $GOG_ENV gog drive $DRIVE_ACCOUNT upload "$DB_JSON" --force --plain 2>&1 | tee -a "$LOG_FILE"
  echo "  ✅ Subida completada" | tee -a "$LOG_FILE"
else
  echo "  ⚠️ gog no encontrado, saltando subida a Drive" | tee -a "$LOG_FILE"
fi

# 6. Limpiar backups viejos (>14 días)
echo "[6/6] Limpiando backups antiguos..." | tee -a "$LOG_FILE"
find "$DEST" -name "htk-full-*.tar.gz" -mtime +14 -delete 2>/dev/null || true
find "$DEST" -name "htk_db_*.json" -mtime +14 -delete 2>/dev/null || true

echo "━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "✅ Backup completo (local + nube)" | tee -a "$LOG_FILE"
