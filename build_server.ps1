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

# Step 2: Package
Write-Host "[2/2] Packaging..."
$distDir = "$root\dist_server"
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }

$dirs = @(
    "$distDir\backend",
    "$distDir\backend\batch",
    "$distDir\backend\data\audio",
    "$distDir\backend\data\exports",
    "$distDir\backend\data\logos",
    "$distDir\backend\data\downloads",
    "$distDir\backend\data\styles",
    "$distDir\backend\data\templates",
    "$distDir\backend\resources",
    "$distDir\backend\routers",
    "$distDir\backend\services",
    "$distDir\frontend\dist"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Path $d -Force | Out-Null }

# Copy backend .py and .txt files
Copy-Item "$root\backend\*.py", "$root\backend\*.txt" "$distDir\backend\" -ErrorAction SilentlyContinue

# Copy routers
Copy-Item "$root\backend\routers\*.py" "$distDir\backend\routers\" -ErrorAction SilentlyContinue

# Copy services
Copy-Item "$root\backend\services\*.py" "$distDir\backend\services\" -ErrorAction SilentlyContinue

# Copy batch
Copy-Item "$root\backend\batch\*.py" "$distDir\backend\batch\" -ErrorAction SilentlyContinue

# Copy ffmpeg static binary for Linux
Copy-Item "$root\backend\ffmpeg" "$distDir\backend\ffmpeg" -Force -ErrorAction SilentlyContinue

# Copy resources (prompts, scenarios, templates, vi)
Copy-Item "$root\backend\resources\*" "$distDir\backend\resources\" -Recurse -Force -ErrorAction SilentlyContinue

# Copy data files
Copy-Item "$root\backend\data\styles\*" "$distDir\backend\data\styles\" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$root\backend\data\templates\*" "$distDir\backend\data\templates\" -Recurse -Force -ErrorAction SilentlyContinue

# Copy built frontend
Copy-Item "$root\frontend\dist\*" "$distDir\frontend\dist\" -Recurse -Force

# Copy production start scripts, install guide, changelog, and safe deploy
Copy-Item "$root\start_prod.bat" "$distDir\" -ErrorAction SilentlyContinue
Copy-Item "$root\start_prod.sh" "$distDir\" -ErrorAction SilentlyContinue
Copy-Item "$root\INSTALL.txt" "$distDir\" -ErrorAction SilentlyContinue
Copy-Item "$root\CHANGELOG.md" "$distDir\" -ErrorAction SilentlyContinue
Copy-Item "$root\deploy_backup.sh" "$distDir\" -ErrorAction SilentlyContinue
Copy-Item "$root\server_backup_cron.sh" "$distDir\" -ErrorAction SilentlyContinue

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
