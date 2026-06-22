@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ==========================================
echo   一勺笔录 Agent — 构建安装包
echo ==========================================
echo.

set ROOT=%~dp0..
set DIST=%ROOT%\dist

:: Clean and create dist
if exist "%DIST%" rmdir /s /q "%DIST%"
mkdir "%DIST%"

:: Check for NSIS
where makensis >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] NSIS (makensis) 未安装，跳过 .exe 安装包生成
    echo.
    echo 下载 NSIS: https://nsis.sourceforge.io/Download
    goto :build_zip
)

echo [1/2] 构建 NSIS 安装包...
makensis /V2 "%ROOT%\installer\installer.nsi"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] NSIS 构建失败
) else (
    echo [OK] NSIS 安装包已生成到 dist\
)

:build_zip
echo.
echo [2/2] 构建便携版 ZIP 包...

set ZIPNAME=yishao-agent-portable-v1.0.0.zip
set STAGING=%TEMP%\yishao-agent-staging

if exist "%STAGING%" rmdir /s /q "%STAGING%"
mkdir "%STAGING%\yishao-agent"

:: Copy files (exclude dev artifacts)
robocopy "%ROOT%" "%STAGING%\yishao-agent" /E /NP /NFL /NDL ^
    /XF "*.db" "*.db-wal" "*.db-shm" ".env" ^
    /XD "__pycache__" "node_modules" ".git" "dist" "installer" ".superpowers" ".vscode" ".idea"

:: Create empty data dirs
mkdir "%STAGING%\yishao-agent\backend\data" 2>nul
mkdir "%STAGING%\yishao-agent\backend\data\audio" 2>nul
mkdir "%STAGING%\yishao-agent\backend\data\exports" 2>nul
mkdir "%STAGING%\yishao-agent\backend\data\backups" 2>nul
mkdir "%STAGING%\yishao-agent\backend\data\prompts" 2>nul
mkdir "%STAGING%\yishao-agent\backend\data\templates" 2>nul
mkdir "%STAGING%\yishao-agent\backend\data\projects" 2>nul

:: Create zip
pushd "%STAGING%"
powershell -Command "Compress-Archive -Path 'yishao-agent' -DestinationPath '%DIST%\%ZIPNAME%' -Force"
popd

rmdir /s /q "%STAGING%"

echo [OK] 便携版 ZIP 包已生成到 dist\%ZIPNAME%

echo.
echo ==========================================
echo   构建完成
echo   输出目录: %DIST%
echo ==========================================
dir "%DIST%" /b
echo.

pause
