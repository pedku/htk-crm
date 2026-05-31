#!/bin/bash
# backup_db.sh — F4.2 Backup automático de la DB a Google Drive
set -euo pipefail

DB_PATH="$HOME/.openclaw/workspace/crm/htk_crm.db"
BACKUP_DIR="/tmp/htk_crm_backups"
FECHA=$(date +%Y-%m-%d_%H%M)
FILENAME="crm_backup_${FECHA}.tar.gz"
DRIVE_FOLDER_ID="1iCIFtVBh4feypxGe-s3bM3VMA72Jat0r"  # Carpeta Facturas en Drive
LOG="$HOME/.openclaw/workspace/crm/logs/backup.log"

mkdir -p "$BACKUP_DIR" "$(dirname "$LOG")"

# 1. Backup consistente SQLite
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/crm_${FECHA}.db"

# 2. Comprimir
tar -czf "$BACKUP_DIR/$FILENAME" -C "$BACKUP_DIR" "crm_${FECHA}.db"
rm "$BACKUP_DIR/crm_${FECHA}.db"

# 3. Subir a Google Drive con gog
export GOG_KEYRING_BACKEND=file
export GOG_KEYRING_PASSWORD=htk_gog_keyring_2026
export GOG_ACCOUNT=info@htk-ingenieria.com

gog drive upload "$BACKUP_DIR/$FILENAME" \
  --parent "$DRIVE_FOLDER_ID" \
  --name "backup_${FECHA}.tar.gz" \
  --no-input --json 2>> "$LOG" && \
  echo "$(date) ✅ Backup subido: $FILENAME" >> "$LOG"

# 4. Limpiar locales >7 días
find "$BACKUP_DIR" -name "crm_backup_*.tar.gz" -mtime +7 -delete 2>/dev/null

echo "✅ Backup: $FILENAME"
