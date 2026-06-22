@echo off
chcp 65001 >nul
set "ROOT=%~dp0"

echo ========================================
echo   一勺笔录(SOP)智能体
echo ========================================
echo.

REM ── Check prerequisites ──
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 未找到 Python，请安装 Python 3.11+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 未找到 Node.js，请安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo Python:  & python --version
echo Node.js: & node --version
echo.

REM ── Backend ──
echo [1/2] 启动后端 (port 8765)...
cd /d "%ROOT%backend"

if not exist "venv\" (
    echo   创建虚拟环境...
    python -m venv venv
    echo   安装 Python 依赖（离线模式）...
    call "%ROOT%backend\install_deps.bat"
    if %ERRORLEVEL% NEQ 0 (
        echo   [ERROR] 依赖安装失败
        pause
        exit /b 1
    )
    echo   后端依赖安装完成
)

start "Yishao-Backend" venv\Scripts\python app.py

REM ── Frontend ──
echo [2/2] 启动前端 (port 5173)...
cd /d "%ROOT%frontend"

if not exist "node_modules\" (
    echo   安装前端依赖...
    call npm install
    echo   前端依赖安装完成
)

start "Yishao-Frontend" npm run dev

echo.
echo ========================================
echo   等待服务启动中...
echo   后端: http://localhost:8765
echo   前端: http://localhost:5173
echo ========================================
echo.

REM Wait a bit then open browser
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo 如果浏览器未打开，请手动访问 http://localhost:5173
echo 按任意键关闭此窗口（不会停止服务）
pause >nul
