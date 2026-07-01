@echo off
chcp 65001 >nul
set "ROOT=%~dp0"

echo ========================================
echo   智绘食谱教案系统 — 生产模式
echo ========================================
echo.

REM -- Check Python --
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 未找到 Python，请安装 Python 3.11+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Python: & python --version
echo.

REM -- Backend (serves frontend too in production) --
echo 启动服务...
cd /d "%ROOT%backend"

if not exist "venv\" (
    echo   创建虚拟环境...
    python -m venv venv
    echo   安装 Python 依赖...
    venv\Scripts\python -m pip install -r requirements.txt
    if %ERRORLEVEL% NEQ 0 (
        echo   [ERROR] 依赖安装失败
        pause
        exit /b 1
    )
    echo   依赖安装完成
)

echo   后端地址: http://localhost:8766
echo.
echo   按 Ctrl+C 停止服务
echo ========================================

start http://localhost:8766
venv\Scripts\python app.py
pause
