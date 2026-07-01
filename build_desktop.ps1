# Build desktop application package (YishaoAgent.exe)
param(
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "========================================"
Write-Host "  YishaoAgent.exe (Desktop)"
Write-Host "========================================"
Write-Host ""

# Step 0: Check PyInstaller
Write-Host "[0/3] Checking PyInstaller..."
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
    Write-Host "[1/3] Building frontend..."
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

# Step 2: PyInstaller
Write-Host "[2/3] Packaging desktop app (this may take a few minutes)..."
pyinstaller build.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

# Step 3: Copy to downloads
Write-Host "[3/3] Copying to downloads..."
$downloadsDir = "$root\backend\data\downloads"
if (-not (Test-Path $downloadsDir)) { New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null }
Copy-Item "$root\dist\YishaoAgent.exe" $downloadsDir -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================"
Write-Host "  Build complete!"
Write-Host "  Output: $root\dist\YishaoAgent.exe"
Write-Host "  Copied to: backend\data\downloads\"
Write-Host "========================================"
pause
