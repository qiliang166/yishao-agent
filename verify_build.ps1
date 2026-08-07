# Verify build artifact completeness
# Checks that all files meant to ship are present in the build output.
# Usage: verify_build.ps1 -BuildDir <path>
# Must stay in sync with build_server.ps1 whitelist.

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

# ── Backend Python files (all tracked .py excluding venv/__pycache__) ──
Write-Host "  Checking backend Python files..."
$backendPy = git -C $root ls-files backend/ `
    | Where-Object { $_ -match '\.py$' } `
    | Where-Object { $_ -notmatch '(\\|/)venv(\\|/)' -and $_ -notmatch '(\\|/)__pycache__(\\|/)' }
foreach ($f in $backendPy) {
    $target = Join-Path $BuildDir $f
    if (-not (Test-Path $target)) {
        $missing += $f
    }
}

# ── Static resource directories (whitelist) ──
$whitelistDirs = @(
    'backend/resources',
    'backend/data/styles',
    'backend/data/templates',
    'backend/data/logos',
    'backend/data/audio',
    'backend/data/assets'
)
foreach ($dir in $whitelistDirs) {
    Write-Host "  Checking $dir ..."
    $srcDir = Join-Path $root $dir
    if (Test-Path $srcDir) {
        $files = Get-ChildItem -Path $srcDir -Recurse -File | ForEach-Object {
            $_.FullName.Substring($root.Length + 1)
        }
        foreach ($f in $files) {
            $target = Join-Path $BuildDir $f
            if (-not (Test-Path $target)) {
                $missing += $f
            }
        }
    }
}

# ── Root-level config files ──
Write-Host "  Checking root config files..."
$rootFiles = @(
    'requirements.txt', 'start_prod.bat', 'start_prod.sh',
    'INSTALL.txt', 'CHANGELOG.md', 'deploy_backup.sh', 'server_backup_cron.sh'
)
foreach ($f in $rootFiles) {
    if (Test-Path (Join-Path $root $f)) {
        $target = Join-Path $BuildDir $f
        if (-not (Test-Path $target)) {
            $missing += $f
        }
    }
}

# ── Frontend dist ──
Write-Host "  Checking frontend dist..."
$frontendDist = Join-Path $root "frontend\dist"
if (Test-Path $frontendDist) {
    $distFiles = Get-ChildItem -Path $frontendDist -Recurse -File | ForEach-Object {
        $_.FullName.Substring($root.Length + 1)
    }
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
    $showLimit = [Math]::Min(50, $missing.Count)
    for ($i = 0; $i -lt $showLimit; $i++) {
        Write-Host "    - $($missing[$i])" -ForegroundColor Red
    }
    if ($missing.Count -gt 50) {
        Write-Host "    ... and $($missing.Count - 50) more" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  Action: check if build_server.ps1 whitelist and verify_build.ps1 are in sync." -ForegroundColor Yellow
    exit 1
}

$totalChecked = $backendPy.Count + $rootFiles.Count + $distFiles.Count
Write-Host "  [OK] All $totalChecked source files accounted for" -ForegroundColor Green
Write-Host "  [OK] Static resource dirs: $($whitelistDirs -join ', ')" -ForegroundColor Green
Write-Host "  [OK] Frontend dist: $($distFiles.Count) files" -ForegroundColor Green
Write-Host ""
exit 0
