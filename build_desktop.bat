@echo off
chcp 65001 >nul
set "ROOT=%~dp0"

echo ========================================
echo   构建桌面版 — YishaoAgent.exe
echo ========================================
echo.

REM -- Step 0: Check PyInstaller --
where pyinstaller >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   正在安装 PyInstaller...
    pip install pyinstaller
    if %ERRORLEVEL% NEQ 0 (
        echo   [ERROR] PyInstaller 安装失败，请手动安装：pip install pyinstaller
        pause
        exit /b 1
    )
)

REM -- Step 1: Build frontend --
echo [1/3] 构建前端...
cd /d "%ROOT%frontend"
if not exist "node_modules\" (
    echo   安装前端依赖...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo   [ERROR] 前端依赖安装失败
        pause
        exit /b 1
    )
)
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] 前端构建失败
    pause
    exit /b 1
)
echo   前端构建完成

REM -- Step 2: PyInstaller packaging --
echo.
echo [2/3] 打包桌面应用（可能需要几分钟）...
cd /d "%ROOT%"
pyinstaller build.spec
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] 打包失败
    pause
    exit /b 1
)

REM -- Step 3: Copy to downloads --
echo.
echo [3/3] 复制到下载目录...
if not exist "%ROOT%backend\data\downloads\" mkdir "%ROOT%backend\data\downloads"
copy /y "%ROOT%dist\YishaoAgent.exe" "%ROOT%backend\data\downloads\YishaoAgent.exe" >nul

echo.
echo ========================================
echo   构建完成！
echo   输出: %ROOT%dist\YishaoAgent.exe
echo   已复制到: backend\data\downloads\YishaoAgent.exe
echo ========================================
echo.
pause
