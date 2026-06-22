@echo off
chcp 65001 >nul
set "ROOT=%~dp0"

echo ========================================
echo   一勺笔录(SOP)智能体
echo ========================================
echo.

REM Stop existing processes
taskkill /f /im node.exe 2>nul
taskkill /f /im python.exe 2>nul
timeout /t 2 /nobreak >nul

echo [1/2] Starting backend on port 8765...
cd /d "%ROOT%backend"
if not exist "venv\" (
    echo Installing Python dependencies...
    pip install -r requirements.txt -q
)
start "Yishao-Backend" cmd /c "cd /d "%ROOT%backend" && python app.py"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend on port 5173...
cd /d "%ROOT%frontend"
if not exist "node_modules\" (
    echo Installing frontend dependencies...
    call npm install
)
start "Yishao-Frontend" cmd /c "cd /d "%ROOT%frontend" && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo ========================================
echo   打开浏览器访问: http://localhost:5173
echo ========================================
echo.
start http://localhost:5173
pause
