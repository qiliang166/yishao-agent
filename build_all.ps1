# Build ALL deployment artifacts in one pass.
# Usage:
#   .\build_all.ps1              Full build (frontend + server + desktop)
#   .\build_all.ps1 -SkipFrontend  Skip frontend rebuild (use existing dist)
param(
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "========================================"
Write-Host "  BUILD ALL — Yishao Agent"
Write-Host "========================================"
Write-Host ""

$serverArgs = if ($SkipFrontend) { "-SkipFrontend" } else { "" }
$desktopArgs = if ($SkipFrontend) { "-SkipFrontend" } else { "" }

# ── Server ──
Write-Host ">>> Building SERVER artifact..."
$serverScript = Join-Path $root "build_server.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $serverScript -SkipFrontend:$SkipFrontend
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host ">>> [FAIL] Server build failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ">>> [OK] Server build complete"
Write-Host ""

# ── Desktop ──
Write-Host ">>> Building DESKTOP artifact..."
$desktopScript = Join-Path $root "build_desktop.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $desktopScript -SkipFrontend:$SkipFrontend
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host ">>> [FAIL] Desktop build failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ">>> [OK] Desktop build complete"
Write-Host ""

# ── Summary ──
$serverZip = Join-Path $root "yishao-agent-server.zip"
$desktopExe = Get-ChildItem (Join-Path $root "dist") -Filter "*.exe" -ErrorAction SilentlyContinue `
    | Where-Object { $_.Name -ne "YishaoAgent-KeyGen.exe" } `
    | Sort-Object LastWriteTime -Desc `
    | Select-Object -First 1

Write-Host "========================================"
Write-Host "  ALL BUILDS PASSED"
Write-Host "  Server : $serverZip"
if ($desktopExe) {
    Write-Host "  Desktop: $($desktopExe.FullName)"
}
Write-Host "========================================"
