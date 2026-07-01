@echo off
chcp 65001 >nul
set "ROOT=%~dp0"

echo ========================================
echo   构建服务器版 — yishao-agent-server.zip
echo ========================================
echo.

REM -- Step 1: Build frontend --
echo [1/2] 构建前端...
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

REM -- Step 2: Package --
echo.
echo [2/2] 打包...
cd /d "%ROOT%"

set "DIST_DIR=%ROOT%dist_server"
set "ZIP_FILE=%ROOT%yishao-agent-server.zip"

if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%DIST_DIR%"
mkdir "%DIST_DIR%\backend"
mkdir "%DIST_DIR%\backend\data"
mkdir "%DIST_DIR%\backend\data\audio"
mkdir "%DIST_DIR%\backend\data\exports"
mkdir "%DIST_DIR%\backend\data\logos"
mkdir "%DIST_DIR%\backend\data\downloads"
mkdir "%DIST_DIR%\backend\services"
mkdir "%DIST_DIR%\frontend\dist"

REM Copy backend .py and .txt files
for %%f in ("%ROOT%backend\*.py" "%ROOT%backend\*.txt") do copy /y "%%f" "%DIST_DIR%\backend\" >nul 2>&1

REM Copy backend services
if exist "%ROOT%backend\services\*.py" (
    copy /y "%ROOT%backend\services\*.py" "%DIST_DIR%\backend\services\" >nul 2>&1
)

REM Copy built frontend
xcopy /E /I /Q "%ROOT%frontend\dist\*" "%DIST_DIR%\frontend\dist\"

REM Copy production start script
copy /y "%ROOT%start_prod.bat" "%DIST_DIR%\" >nul

REM Create zip using PowerShell
if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%"
powershell -NoProfile -Command "Compress-Archive -Path '%DIST_DIR%\*' -DestinationPath '%ZIP_FILE%' -Force"
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] 打包失败
    rmdir /s /q "%DIST_DIR%"
    pause
    exit /b 1
)

rmdir /s /q "%DIST_DIR%"

REM -- Copy to downloads --
if not exist "%ROOT%backend\data\downloads\" mkdir "%ROOT%backend\data\downloads"
copy /y "%ZIP_FILE%" "%ROOT%backend\data\downloads\" >nul

echo.
echo ========================================
echo   构建完成！
echo   输出: %ZIP_FILE%
echo   已复制到: backend\data\downloads\
echo ========================================
echo.
pause
