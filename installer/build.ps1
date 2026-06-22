# 一勺笔录(SOP)智能体 — Build Script (PowerShell)
# Creates distribution packages: NSIS installer + portable ZIP

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ROOT = Split-Path -Parent $PSScriptRoot
$DIST = Join-Path $ROOT "dist"
$VERSION = "1.0.0"
$APP_NAME = "yishao-agent"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  一勺笔录(SOP)智能体 — 构建安装包 v$VERSION" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Clean and recreate dist
if (Test-Path $DIST) { Remove-Item -Recurse -Force $DIST }
New-Item -ItemType Directory -Force -Path $DIST | Out-Null

# ── NSIS Installer ──
$nsis = Get-Command makensis -ErrorAction SilentlyContinue
if ($nsis) {
    Write-Host "[1/2] 构建 NSIS 安装包..." -ForegroundColor Yellow
    $installerScript = Join-Path $ROOT "installer\installer.nsi"
    & makensis /V2 $installerScript
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] NSIS 安装包已生成到 dist\" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] NSIS 构建失败 (exit code: $LASTEXITCODE)" -ForegroundColor Red
    }
} else {
    Write-Host "[SKIP] NSIS (makensis) 未安装，跳过 .exe 安装包生成" -ForegroundColor DarkYellow
    Write-Host "  下载 NSIS: https://nsis.sourceforge.io/Download" -ForegroundColor DarkYellow
}

# ── Portable ZIP ──
Write-Host ""
Write-Host "[2/2] 构建便携版 ZIP 包..." -ForegroundColor Yellow

$STAGING = Join-Path $env:TEMP "yishao-agent-staging"
if (Test-Path $STAGING) { Remove-Item -Recurse -Force $STAGING }
$STAGING_APP = Join-Path $STAGING $APP_NAME
New-Item -ItemType Directory -Force -Path $STAGING_APP | Out-Null

# Copy all files (exclude dev artifacts)
$excludeDirs = @("__pycache__", "node_modules", ".git", "dist", "installer", ".superpowers", ".vscode", ".idea")
$excludeFiles = @("*.db", "*.db-wal", "*.db-shm", ".env")

Get-ChildItem -Path $ROOT -Force | ForEach-Object {
    $item = $_
    $name = $item.Name

    # Skip excluded directories
    if ($item.PSIsContainer -and $excludeDirs -contains $name) { return }
    # Skip excluded file patterns
    foreach ($pattern in $excludeFiles) {
        if ($name -like $pattern) { return }
    }

    $dest = Join-Path $STAGING_APP $name
    if ($item.PSIsContainer) {
        Copy-Item -Path $item.FullName -Destination $dest -Recurse -Force
    } else {
        Copy-Item -Path $item.FullName -Destination $dest -Force
    }
}

# Create empty data directories
$dataDirs = @(
    "backend\data",
    "backend\data\audio",
    "backend\data\exports",
    "backend\data\backups",
    "backend\data\prompts",
    "backend\data\templates",
    "backend\data\projects"
)
foreach ($dir in $dataDirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $STAGING_APP $dir) | Out-Null
}

# Create ZIP
$zipName = "$APP_NAME-portable-v$VERSION.zip"
$zipPath = Join-Path $DIST $zipName
Compress-Archive -Path $STAGING_APP -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $STAGING

Write-Host "  [OK] 便携版 ZIP 包已生成到 dist\$zipName" -ForegroundColor Green

# ── Summary ──
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  构建完成" -ForegroundColor Cyan
Write-Host "  输出目录: $DIST" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Get-ChildItem $DIST | ForEach-Object {
    $sizeKB = [math]::Round($_.Length / 1024, 1)
    Write-Host "  $($_.Name) ($sizeKB KB)" -ForegroundColor White
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
