#!/bin/bash
# Backup automático de la BD del CRM HTK
# Uso: ./backup_db.sh                    # backup manual
# Uso: ./backup_db.sh --cron             # backup silencioso (para cron)
# Uso: ./backup_db.sh --list             # listar backups disponibles
# Uso: ./backup_db.sh --restore <archivo> # restaurar desde backup

DB_DIR="/home/peku/htk-crm"
DB="$DB_DIR/htk_crm.db"
BACKUP_DIR="$DB_DIR/backups"
RETENTION=14  # días a conservar

mkdir -p "$BACKUP_DIR"

if [ "$1" == "--list" ]; then
    echo "📋 Backups disponibles:"
    ls -1t "$BACKUP_DIR"/htk_crm.db.*.backup 2>/dev/null | head -20
    exit 0
fi

if [ "$1" == "--restore" ]; then
    if [ -z "$2" ]; then
        echo "❌ Uso: $0 --restore <archivo backup>"
        exit 1
    fi
    if [ ! -f "$2" ]; then
        echo "❌ Archivo no encontrado: $2"
        exit 1
    fi
    cp "$2" "$DB"
    echo "✅ Restaurado: $2 → $DB"
    echo "🔄 Reinicia el CRM con: systemctl --user restart htk-crm"
    exit 0
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/htk_crm.db.$TIMESTAMP.backup"

# Backup con WAL checkpoint primero para consistencia
sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null
cp "$DB" "$BACKUP_FILE"
gzip -f "$BACKUP_FILE" 2>/dev/null || true
BACKUP_FILE="${BACKUP_FILE}.gz"

# Limpiar backups viejos
find "$BACKUP_DIR" -name "htk_crm.db.*.backup*" -mtime +$RETENTION -delete 2>/dev/null

if [ "$1" != "--cron" ]; then
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/htk_crm.db.*.backup* 2>/dev/null | wc -l)
    echo "✅ Backup creado: $BACKUP_FILE ($BACKUP_COUNT backups totales)"
fi
