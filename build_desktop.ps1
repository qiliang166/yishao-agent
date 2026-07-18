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
    npx vite build --config vite.mobile.config.ts
    if ($LASTEXITCODE -ne 0) { throw "Mobile frontend build failed" }
    Write-Host "  Done"
}
Set-Location $root

# Step 1.5: Write build version stamp (BOM-free UTF-8)
$commit = git rev-parse HEAD 2>$null
$buildTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$stampContent = "commit=$commit`ntime=$buildTime"
[System.IO.File]::WriteAllText("$root\backend\build_version.txt", $stampContent, [System.Text.Encoding]::UTF8)
Write-Host "  Build stamp: commit=$commit, time=$buildTime"

# Step 1.6: Auto-update CHANGELOG from git commits since last build
$lastBuildFile = "$root\backend\.last_build_commit"
$lastCommit = ""
if (Test-Path $lastBuildFile) {
    $lastCommit = (Get-Content $lastBuildFile -Raw).Trim()
}
if ($lastCommit -and $commit) {
    # git emits UTF-8; default console codepage (GBK) would mangle Chinese commit subjects
    $prevEnc = [Console]::OutputEncoding
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $newLog = git log "${lastCommit}..${commit}" --format="- %s" 2>$null
    [Console]::OutputEncoding = $prevEnc
    if ($newLog) {
        $dateHeader = (Get-Date).ToString("yyyy-MM-dd")
        $entry = "`n## $dateHeader`n`n" + ($newLog -join "`n") + "`n"
        $existing = if (Test-Path "$root\CHANGELOG.md") { [System.IO.File]::ReadAllText("$root\CHANGELOG.md", [System.Text.Encoding]::UTF8) } else { "# Changelog`n" }
        $lines = $existing -split "`n"
        $newContent = $lines[0] + "`n" + $entry + ($lines[1..$lines.Length] -join "`n")
        [System.IO.File]::WriteAllText("$root\CHANGELOG.md", $newContent.TrimEnd() + "`n", [System.Text.Encoding]::UTF8)
        Write-Host "  CHANGELOG: appended commits since $($lastCommit.Substring(0,7))"
    } else {
        Write-Host "  CHANGELOG: no new commits since last build"
    }
} elseif (-not $lastCommit) {
    Write-Host "  CHANGELOG: first build for this repo, no previous stamp"
}
[System.IO.File]::WriteAllText($lastBuildFile, $commit, [System.Text.Encoding]::UTF8)

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

$builtExe = Get-ChildItem "$root\dist\*.exe" | Where-Object { $_.Name -ne 'YishaoAgent-KeyGen.exe' } | Sort-Object LastWriteTime -Desc | Select-Object -First 1
if ($builtExe) {
    $destName = "YishaoAgent-Setup.exe"
    Copy-Item $builtExe.FullName "$downloadsDir\$destName" -Force -ErrorAction SilentlyContinue
    Write-Host "  Copied to downloads as $destName"
}

# Also copy CHANGELOG alongside the installer
if (Test-Path "$root\CHANGELOG.md") {
    Copy-Item "$root\CHANGELOG.md" "$root\dist\CHANGELOG.md" -Force
    Write-Host "  CHANGELOG.md copied to dist"
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Build complete!"
Write-Host "  Output: $root\dist\"
Write-Host "========================================"
pause
