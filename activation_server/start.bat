@echo off
chcp 65001 >nul
title Yishao Agent Activation Server

cd /d "%~dp0"

echo === Yishao Agent Activation Server ===
echo Port: %ACTIVATION_PORT%
if "%ACTIVATION_PORT%"=="" echo Port: 18777
echo Admin Token: %ACTIVATION_ADMIN_TOKEN%
if "%ACTIVATION_ADMIN_TOKEN%"=="" echo Admin Token: yishao-admin-2026
echo ======================================
echo.

python activation_server.py
pause
