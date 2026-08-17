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
    # Only diff when the previous commit still exists (history may have been rewritten by filter-repo).
    # git cat-file exits non-zero + writes stderr when the object is missing; under
    # $ErrorActionPreference="Stop" that aborts the build, so run it relaxed and check $LASTEXITCODE.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    git cat-file -e "${lastCommit}^{commit}" 2>$null
    $lastCommitExists = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prevEAP
    if (-not $lastCommitExists) {
        Write-Host "  CHANGELOG: previous commit $($lastCommit.Substring(0,7)) no longer in history (rewritten), skipping"
    } else {
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

# Ensure destination dirs exist
New-Item -ItemType Directory -Path "$distDir\backend" -Force | Out-Null
New-Item -ItemType Directory -Path "$distDir\frontend\dist" -Force | Out-Null

# ── Whitelist: only copy what ships to customers ──
# 1) All .py source files (auto-discovered, excluding venv/__pycache__)
Get-ChildItem -Path "$root\backend" -Recurse -File -Filter "*.py" `
    | Where-Object {
        $rel = $_.FullName.Substring($root.Length + 1)
        ($rel -notmatch '\\(venv|__pycache__)\\') -and
        ($rel -notmatch '\\(venv|__pycache__)$')
    } | ForEach-Object {
        $rel = $_.FullName.Substring($root.Length + 1)
        $dest = Join-Path $distDir $rel
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $_.FullName $dest -Force
    }

# 2) Static resource directories (factory-default content only)
@('backend\resources', 'backend\data\styles', 'backend\data\templates', 'backend\data\logos', 'backend\data\audio', 'backend\data\assets') | ForEach-Object {
    $src = Join-Path $root $_
    if (Test-Path $src) {
        $dest = Join-Path $distDir $_
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
        Copy-Item "$src\*" "$dest\" -Recurse -Force
    }
}

# 3) Critical runtime files at backend/ root
@('backend\requirements.txt', 'backend\default_download_urls.json', 'backend\.env.example') | ForEach-Object {
    $src = Join-Path $root $_
    if (Test-Path $src) {
        $dest = Join-Path $distDir $_
        Copy-Item $src $dest -Force
    }
}

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
