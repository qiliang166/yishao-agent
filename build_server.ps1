# Build server deployment package
param(
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "========================================"
Write-Host "  yishao-agent-server.zip"
Write-Host "========================================"
Write-Host ""

# Step 1: Build frontend
if (-not $SkipFrontend) {
    Write-Host "[1/2] Building frontend..."
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

# Step 2: Package
Write-Host "[2/2] Packaging..."
$distDir = "$root\dist_server"
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }

$dirs = @(
    "$distDir\backend",
    "$distDir\backend\data\audio",
    "$distDir\backend\data\exports",
    "$distDir\backend\data\logos",
    "$distDir\backend\data\downloads",
    "$distDir\backend\services",
    "$distDir\frontend\dist"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Path $d -Force | Out-Null }

Copy-Item "$root\backend\*.py", "$root\backend\*.txt" "$distDir\backend\" -ErrorAction SilentlyContinue
Copy-Item "$root\backend\services\*.py" "$distDir\backend\services\" -ErrorAction SilentlyContinue
Copy-Item "$root\frontend\dist\*" "$distDir\frontend\dist\" -Recurse -Force
Copy-Item "$root\start_prod.bat" "$distDir\" -ErrorAction SilentlyContinue

$zipFile = "$root\yishao-agent-server.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }
Compress-Archive -Path "$distDir\*" -DestinationPath $zipFile -Force
Remove-Item $distDir -Recurse -Force

# Copy to downloads
$downloadsDir = "$root\backend\data\downloads"
if (-not (Test-Path $downloadsDir)) { New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null }
Copy-Item $zipFile $downloadsDir -Force

Write-Host ""
Write-Host "========================================"
Write-Host "  Build complete!"
Write-Host "  Output: $zipFile"
Write-Host "  Copied to: backend\data\downloads\"
Write-Host "========================================"
