#!/bin/bash
# Safe deployment script - backs up database BEFORE any destructive action
set -e

BACKUP_DIR="/opt/yishao-agent/backend/data/backups"
DB_PATH="/opt/yishao-agent/backend/data/yishao.db"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== Safe Deploy ==="

# Step 1: Backup database BEFORE anything else
echo "[1/3] Backing up database..."
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_DIR/yishao-predeploy-${TIMESTAMP}.db"
    echo "  Backup saved: yishao-predeploy-${TIMESTAMP}.db"
    # Keep only last 10 backups
    ls -t "$BACKUP_DIR"/yishao-predeploy-*.db 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
else
    echo "  No existing database to backup"
fi

# Step 2: Extract new code (preserve data directory)
echo "[2/3] Updating code..."
cd /opt/yishao-agent

# Save data directory BEFORE removing backend
if [ -d "backend/data" ]; then
    cp -r backend/data "/tmp/yishao_data_backup_${TIMESTAMP}"
    echo "  Data directory preserved"
fi

# Remove old code
rm -rf backend frontend/dist

# Extract new package
tar -xzf /root/yishao-agent-server.tar.gz
echo "  Package extracted"

# Restore data directory
if [ -d "/tmp/yishao_data_backup_${TIMESTAMP}" ]; then
    rm -rf backend/data
    cp -r "/tmp/yishao_data_backup_${TIMESTAMP}" backend/data
    rm -rf "/tmp/yishao_data_backup_${TIMESTAMP}"
    echo "  Data directory restored"
fi

# Step 3: Restart service
echo "[3/3] Restarting service..."
systemctl restart yishao-agent
sleep 3
curl -s http://localhost:8766/api/version

echo ""
echo "=== Deploy complete ==="
