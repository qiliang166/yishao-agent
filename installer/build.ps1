# YishaoAgent — NSIS Installer Build Script
# Called by build_desktop.ps1 after PyInstaller produces the portable exe.
# Can also be run standalone if dist\ already contains the PyInstaller output.

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ROOT = Split-Path -Parent $PSScriptRoot
$DIST = Join-Path $ROOT "dist"
$VERSION = "1.0.0"

Write-Host "  [installer/build.ps1] Building NSIS installer v$VERSION"

# Find the PyInstaller-built exe (not KeyGen)
$builtExe = Get-ChildItem "$DIST\*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*KeyGen*" -and $_.Name -notlike "*Setup*" -and $_.Name -notlike "*Portable*" } |
    Sort-Object LastWriteTime -Desc | Select-Object -First 1

if (-not $builtExe) {
    Write-Host "  [ERROR] No PyInstaller exe found in dist\. Run build_desktop.ps1 first."
    exit 1
}

# Stage the exe with a fixed name for NSIS to find
$stagingExe = Join-Path $DIST "YishaoAgent.exe"
Copy-Item $builtExe.FullName $stagingExe -Force
Write-Host "  Staged: $($builtExe.Name) -> YishaoAgent.exe"

# Check for LICENSE.txt (needed by NSIS MUI_PAGE_LICENSE)
$licenseFile = Join-Path $ROOT "LICENSE.txt"
if (-not (Test-Path $licenseFile)) {
    Write-Host "  [WARNING] LICENSE.txt not found, creating placeholder..."
    @"
END USER LICENSE AGREEMENT

Copyright (c) $(Get-Date -Format yyyy) YishaoAgent. All rights reserved.

This software is provided "as is", without warranty of any kind.
"@ | Out-File -FilePath $licenseFile -Encoding UTF8
}

# Check for makensis
$nsis = Get-Command makensis -ErrorAction SilentlyContinue
if (-not $nsis) {
    Write-Host "  [WARNING] makensis not found. Skipping NSIS installer."
    Write-Host "  Download NSIS: https://nsis.sourceforge.io/Download"
    Remove-Item $stagingExe -Force -ErrorAction SilentlyContinue
    exit 0
}

# Build the installer
$installerScript = Join-Path $PSScriptRoot "installer.nsi"
$nsisArgs = @("/V2", "/DVERSION=$VERSION", $installerScript)
$result = & makensis @nsisArgs

# Clean up staging
Remove-Item $stagingExe -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    $output = Get-ChildItem "$DIST\*Setup*.exe" | Sort-Object LastWriteTime -Desc | Select-Object -First 1
    if ($output) {
        $sizeMB = [math]::Round($output.Length / 1MB, 1)
        Write-Host "  [OK] $($output.Name) ($sizeMB MB)"
    }
} else {
    Write-Host "  [ERROR] makensis failed (exit code: $LASTEXITCODE)"
    exit $LASTEXITCODE
}
