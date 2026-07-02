#!/bin/bash
# Yishao Agent — Activation Server startup script (Linux)
# Usage:
#   chmod +x start.sh
#   ./start.sh
#   # Or with custom config:
#   # ACTIVATION_PORT=18777 ACTIVATION_ADMIN_TOKEN=your-secret ./start.sh

cd "$(dirname "$0")"

# Install dependencies if needed
pip install -r requirements.txt -q 2>/dev/null

echo "=== Yishao Agent Activation Server ==="
echo "Port: ${ACTIVATION_PORT:-18777}"
echo "======================================"
echo ""

python activation_server.py
