# Build server deployment package
param(
    [switch]$SkipFrontend,
    [switch]$SkipFfmpeg
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
        # Insert after the title line
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
# Record current commit for next build
[System.IO.File]::WriteAllText($lastBuildFile, $commit, [System.Text.Encoding]::UTF8)

# Step 2: Package — copy backend tree (exclude runtime-only dirs), frontend dist, root config
Write-Host "[2/2] Packaging..."

$distDir = "$root\dist_server"
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }

# Create directory structure mirroring backend/ (auto-discovered)
$backendDirs = Get-ChildItem -Path "$root\backend" -Directory -Recurse `
    | Where-Object {
        $rel = $_.FullName.Substring($root.Length + 1)
        # Skip runtime-only / build-only directories
        ($rel -notmatch '\\venv\\' -or $rel -notmatch '\\venv$') -and
        ($rel -notmatch '\\__pycache__\\' -or $rel -notmatch '\\__pycache__$') -and
        ($rel -notmatch '\\logs\\' -or $rel -notmatch '\\logs$')
    }
foreach ($d in $backendDirs) {
    $rel = $d.FullName.Substring($root.Length + 1)
    New-Item -ItemType Directory -Path (Join-Path $distDir $rel) -Force | Out-Null
}
# Also ensure frontend dist dir exists
New-Item -ItemType Directory -Path "$distDir\frontend\dist" -Force | Out-Null

# Copy ALL backend files, then remove what should not ship
Copy-Item "$root\backend\*" "$distDir\backend\" -Recurse -Force -ErrorAction SilentlyContinue

# Remove runtime-only content from the staging copy
$toStrip = @(
    "$distDir\backend\venv",
    "$distDir\backend\__pycache__",
    "$distDir\backend\logs",
    "$distDir\backend\*.db",
    "$distDir\backend\*.log",
    "$distDir\backend\.last_build_commit",
    "$distDir\backend\data\*.db"
)
foreach ($pattern in $toStrip) {
    Remove-Item -Path $pattern -Recurse -Force -ErrorAction SilentlyContinue
}

# Clean __pycache__ from all subdirectories
Get-ChildItem -Path "$distDir\backend" -Directory -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Copy built frontend
Copy-Item "$root\frontend\dist\*" "$distDir\frontend\dist\" -Recurse -Force

# Copy root-level deployment files
@('start_prod.bat', 'start_prod.sh', 'INSTALL.txt', 'CHANGELOG.md', 'deploy_backup.sh', 'server_backup_cron.sh') | ForEach-Object {
    $src = Join-Path $root $_
    if (Test-Path $src) { Copy-Item $src $distDir -Force }
}

# ── Verify completeness ──
$verifyScript = Join-Path $root "verify_build.ps1"
if (Test-Path $verifyScript) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -BuildDir $distDir -Label "server"
    if ($LASTEXITCODE -ne 0) { throw "Build verification failed — missing files in artifact" }
}

# Build the server deployment zip
$zipFile = "$root\yishao-agent-server.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }
Compress-Archive -Path "$distDir\*" -DestinationPath $zipFile -Force
Remove-Item $distDir -Recurse -Force

# Also keep a local copy for dev serving
$downloadsDir = "$root\backend\data\downloads"
if (-not (Test-Path $downloadsDir)) { New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null }
Copy-Item $zipFile $downloadsDir -Force

Write-Host ""
Write-Host "========================================"
Write-Host "  Build complete!"
Write-Host "  Output: $zipFile"
Write-Host "  Copied to: backend\data\downloads\"
Write-Host "========================================"
