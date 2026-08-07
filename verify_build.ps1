# Verify build artifact completeness
# Compares git-tracked source files against what's in the build output.
# Usage: verify_build.ps1 -BuildDir <path>

param(
    [Parameter(Mandatory=$true)]
    [string]$BuildDir,
    [string]$Label = "build"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$missing = @()

Write-Host ""
Write-Host "=== Build Verification: $Label ==="

# ── Backend Python files ──
Write-Host "  Checking backend Python files..."
$backendPy = git -C $root ls-files backend/ | Where-Object { $_ -match '\.py$' }
foreach ($f in $backendPy) {
    $target = Join-Path $BuildDir $f
    if (-not (Test-Path $target)) {
        $missing += $f
    }
}

# ── Backend resources ──
Write-Host "  Checking backend resources..."
$backendResources = git -C $root ls-files backend/resources/
foreach ($f in $backendResources) {
    $target = Join-Path $BuildDir $f
    if (-not (Test-Path $target)) {
        $missing += $f
    }
}

# ── Backend data (static assets only, not runtime data) ──
Write-Host "  Checking backend static data..."
$staticData = git -C $root ls-files backend/data/styles/ backend/data/templates/ backend/data/logos/ backend/data/audio/
foreach ($f in $staticData) {
    $target = Join-Path $BuildDir $f
    if (-not (Test-Path $target)) {
        $missing += $f
    }
}

# ── Root-level config files ──
Write-Host "  Checking root config files..."
$rootFiles = git -C $root ls-files | Where-Object { $_ -match '^(requirements\.txt|start_prod\.(bat|sh)|INSTALL\.txt|CHANGELOG\.md|deploy_backup\.sh|server_backup_cron\.sh)$' }
foreach ($f in $rootFiles) {
    $target = Join-Path $BuildDir $f
    if (-not (Test-Path $target)) {
        $missing += $f
    }
}

# ── Frontend dist ──
Write-Host "  Checking frontend dist..."
$frontendDist = Join-Path $root "frontend\dist"
if (Test-Path $frontendDist) {
    $distFiles = Get-ChildItem -Path $frontendDist -Recurse -File | ForEach-Object { $_.FullName.Substring($root.Length + 1) }
    foreach ($f in $distFiles) {
        $target = Join-Path $BuildDir $f
        if (-not (Test-Path $target)) {
            $missing += $f
        }
    }
}

# ── Result ──
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "  [FAIL] $($missing.Count) files missing from $Label :" -ForegroundColor Red
    foreach ($m in $missing) {
        Write-Host "    - $m" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  Action: add the missing files to the build script, then rebuild." -ForegroundColor Yellow
    exit 1
}

Write-Host "  [OK] All $($backendPy.Count + $backendResources.Count + $staticData.Count + $rootFiles.Count) source files accounted for" -ForegroundColor Green
Write-Host "  [OK] Frontend dist: $($distFiles.Count) files" -ForegroundColor Green
Write-Host ""
exit 0
