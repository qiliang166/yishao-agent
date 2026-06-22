#!/bin/bash
set -e

echo "========================================"
echo "  一勺笔录(SOP)智能体"
echo "========================================"
echo

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Check prerequisites ──
command -v python3 >/dev/null 2>&1 && PYTHON=python3 || PYTHON=python
command -v "$PYTHON" >/dev/null 2>&1 || { echo "[ERROR] 未找到 Python，请安装 Python 3.11+"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "[ERROR] 未找到 Node.js，请安装 Node.js 18+"; exit 1; }

echo "Python:  $($PYTHON --version)"
echo "Node.js: $(node --version)"
echo

# ── Backend ──
echo "[1/2] 启动后端 (port 8765)..."
cd "$ROOT/backend"

if [ ! -d "venv" ]; then
    echo "  创建虚拟环境..."
    $PYTHON -m venv venv
    echo "  安装 Python 依赖..."
    venv/bin/pip install -r requirements.txt -q || venv/bin/pip install -r requirements.txt
    echo "  后端依赖安装完成"
fi

venv/bin/python app.py &
BACKEND_PID=$!

# ── Frontend ──
echo "[2/2] 启动前端 (port 5173)..."
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo "  安装前端依赖..."
    npm install
    echo "  前端依赖安装完成"
fi

npm run dev &
FRONTEND_PID=$!

sleep 4

echo
echo "========================================"
echo "  后端: http://localhost:8765"
echo "  前端: http://localhost:5173"
echo "========================================"
echo

# Open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:5173
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:5173
else
    echo "请手动打开浏览器访问 http://localhost:5173"
fi

echo
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
