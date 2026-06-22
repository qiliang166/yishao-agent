#!/bin/bash
echo "========================================"
echo "  一勺食谱课件Agent"
echo "========================================"
echo

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "[1/2] Starting backend on port 8765..."
cd "$ROOT/backend"

# Install Python dependencies if needed
if [ ! -d "venv" ]; then
    echo "Installing Python dependencies..."
    pip install -r requirements.txt -q
fi

python app.py &
BACKEND_PID=$!

sleep 3

echo "[2/2] Starting frontend on port 5173..."
cd "$ROOT/frontend"

# Install Node dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!

sleep 4

echo
echo "========================================"
echo "  打开浏览器访问: http://localhost:5173"
echo "========================================"
echo

# Open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:5173
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:5173
fi

# Wait for user to press Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
