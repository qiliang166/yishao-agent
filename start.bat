@echo off
chcp 65001 >nul
echo ========================================
echo   一勺笔录 Agent
echo ========================================
echo.

REM Stop existing processes
taskkill /f /im node.exe 2>nul
taskkill /f /im python.exe 2>nul
timeout /t 2 /nobreak >nul

echo [1/2] Starting backend on port 8765...
start "Yishao-Backend" cmd /c "cd /d d:\YISHAOAGENT\backend && python app.py"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend on port 5173...
start "Yishao-Frontend" cmd /c "cd /d d:\YISHAOAGENT\frontend && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo ========================================
echo   打开浏览器访问: http://localhost:5173
echo ========================================
echo.
start http://localhost:5173
pause
