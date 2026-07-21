#!/bin/bash
# Daily database backup - run via cron: 0 3 * * * /opt/yishao-agent/server_backup_cron.sh
DB_PATH="/opt/yishao-agent/backend/data/yishao.db"
BACKUP_DIR="/opt/yishao-agent/backend/data/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_DIR/yishao-daily-${TIMESTAMP}.db"
    # Remove backups older than KEEP_DAYS
    find "$BACKUP_DIR" -name "yishao-daily-*.db" -mtime +${KEEP_DAYS} -delete 2>/dev/null || true
    echo "[$(date)] Backup complete: yishao-daily-${TIMESTAMP}.db"
else
    echo "[$(date)] WARNING: No database found at $DB_PATH"
fi
