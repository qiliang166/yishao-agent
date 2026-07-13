#!/bin/bash
set -e

echo "========================================"
echo "  YishaoAgent — Production"
echo "========================================"
echo

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── Find best Python 3 (prefer 3.11+, fall back to 3.10/3.9) ──
PYTHON=""
for py in python3.11 python3.12 python3.10 python3.9 python3; do
    if command -v "$py" >/dev/null 2>&1; then
        PYTHON="$py"
        break
    fi
done
if [ -z "$PYTHON" ]; then
    echo "[ERROR] Python 3 not found. Requires Python 3.9+"
    exit 1
fi

echo "Python: $($PYTHON --version)"
echo

# ── Ensure ffmpeg ──
if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "[0/3] Installing ffmpeg..."
    FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    curl -L --connect-timeout 30 --max-time 300 "$FFMPEG_URL" -o /tmp/ffmpeg.tar.xz 2>/dev/null
    if [ -f /tmp/ffmpeg.tar.xz ] && [ -s /tmp/ffmpeg.tar.xz ]; then
        cd /tmp && tar xf ffmpeg.tar.xz
        cp ffmpeg-*-static/ffmpeg ffmpeg-*-static/ffprobe /usr/local/bin/ 2>/dev/null
        rm -f /tmp/ffmpeg.tar.xz
        rm -rf /tmp/ffmpeg-*-static
        echo "  ffmpeg installed."
    else
        echo "  [WARN] ffmpeg download failed — voice recognition won't work."
        echo "  Install manually: yum install -y ffmpeg"
    fi
    cd "$ROOT"
else
    echo "ffmpeg: $(ffmpeg -version 2>&1 | head -1)"
fi
echo

# ── Setup venv at project root ──
if [ ! -d "venv" ]; then
    echo "[1/2] Creating venv & installing dependencies..."
    $PYTHON -m venv venv
    venv/bin/pip install --upgrade pip -q
    venv/bin/pip install -r backend/requirements.txt
    echo "  Done."
else
    echo "[1/2] Using existing venv."
fi

# ── Start server ──
PORT="${1:-8766}"
echo "[2/2] Starting server on 0.0.0.0:$PORT..."
echo "  Open http://<server-ip>:$PORT in your browser"
echo

cd backend
../venv/bin/python app.py "$PORT"
