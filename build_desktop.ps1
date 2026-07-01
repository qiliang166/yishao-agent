# Build desktop application package
param(
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "========================================"
Write-Host "  Desktop Build"
Write-Host "========================================"
Write-Host ""

# Step 0: Check PyInstaller
Write-Host "[0/4] Checking PyInstaller..."
$pyinstaller = Get-Command pyinstaller -ErrorAction SilentlyContinue
if (-not $pyinstaller) {
    Write-Host "  Installing PyInstaller..."
    $pip = "$root\backend\venv\Scripts\pip.exe"
    if (Test-Path $pip) {
        & $pip install pyinstaller
    } else {
        pip install pyinstaller
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] PyInstaller install failed. Try: pip install pyinstaller"
        pause
        exit 1
    }
}
Write-Host "  Done"

# Step 1: Build frontend
if (-not $SkipFrontend) {
    Write-Host "[1/4] Building frontend..."
    Set-Location "$root\frontend"
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    Write-Host "  Done"
}
Set-Location $root

# Step 2: Prepare dynamic build config (app name + icon from DB)
Write-Host "[2/4] Reading app settings & generating icon..."
$python = "$root\backend\venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }
& $python "$root\prepare_build.py"
if ($LASTEXITCODE -ne 0) { throw "prepare_build.py failed" }
Write-Host "  Done"

# Step 3: PyInstaller
Write-Host "[3/4] Packaging desktop app (this may take a few minutes)..."
pyinstaller build_temp.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

# Clean up temp spec
Remove-Item "$root\build_temp.spec" -Force -ErrorAction SilentlyContinue

# Step 4: Copy to downloads
Write-Host "[4/4] Copying to downloads..."
$downloadsDir = "$root\backend\data\downloads"
if (-not (Test-Path $downloadsDir)) { New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null }

# Find the built exe
$python2 = "$root\backend\venv\Scripts\python.exe"
if (-not (Test-Path $python2)) { $python2 = "python" }
$appName = & $python2 -c "import sqlite3;conn=sqlite3.connect('$root\backend\data\yishao.db');row=conn.execute(\"SELECT value FROM settings WHERE key='brand_name'\").fetchone();print(row[0] if row and row[0] else 'YishaoAgent')"
$exePath = "$root\dist\$appName.exe"
if (Test-Path $exePath) {
    Copy-Item $exePath $downloadsDir -Force -ErrorAction SilentlyContinue
    Write-Host "  Copied $appName.exe to downloads"
} else {
    # fallback to YishaoAgent.exe
    $fallback = "$root\dist\YishaoAgent.exe"
    if (Test-Path $fallback) {
        Copy-Item $fallback $downloadsDir -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Build complete!"
Write-Host "  Output: $root\dist\"
Write-Host "========================================"
pause
