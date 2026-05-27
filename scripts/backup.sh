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
echo "[1/5] Pusheando CRM a GitHub..." | tee -a "$LOG_FILE"
cd ~/.openclaw/workspace/crm
git push origin main 2>&1 | tee -a "$LOG_FILE"
cd ~/.openclaw/workspace
git push origin master 2>&1 | tee -a "$LOG_FILE"

# 2. Exportar DBs a JSON (por si acaso)
echo "[2/5] Exportando DB a JSON..." | tee -a "$LOG_FILE"
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
echo "[3/5] Comprimiendo archivos clave..." | tee -a "$LOG_FILE"
tar czf "$BACKUP_FILE" \
  --exclude='crm/htk_crm.db' \
  --exclude='crm/.codegraph' \
  --exclude='node_modules' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.git' \
  -C "$HOME" \
  .openclaw/workspace \
  .agents/skills \
  .config/openclaw \
  .config/systemd/user/htk-crm.service \
  2>&1 | tee -a "$LOG_FILE"

# 4. Tamaños
echo "[4/5] Resumen:" | tee -a "$LOG_FILE"
echo "  Backup:   $BACKUP_FILE" | tee -a "$LOG_FILE"
echo "  Tamaño:   $(du -h "$BACKUP_FILE" | cut -f1)" | tee -a "$LOG_FILE"
echo "  DB JSON:  $DEST/htk_db_$DATE.json" | tee -a "$LOG_FILE"

# 5. Limpiar backups viejos (>14 días)
echo "[5/5] Limpiando backups antiguos..." | tee -a "$LOG_FILE"
find "$DEST" -name "htk-full-*.tar.gz" -mtime +14 -delete 2>/dev/null || true
find "$DEST" -name "htk_db_*.json" -mtime +14 -delete 2>/dev/null || true

echo "━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "✅ Backup completo" | tee -a "$LOG_FILE"
