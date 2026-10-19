# Starts OpenCut in hybrid mode and opens the editor window.
#
# - Docker runs the AI services, the database and Redis (heavy Python/GPU
#   dependencies that don't install well on Windows).
# - The editor (Next.js) runs straight on Windows, so code changes show up
#   instantly instead of rebuilding a Docker image.
#
# The editor stays on port 3100: projects are saved in the browser per
# address, so another port would show an empty project list.

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$port = 3100
$url = "http://localhost:$port"

function Test-Url([string]$target) {
    try {
        $null = Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec 5
        return $true
    } catch {
        return $false
    }
}

function Test-Docker {
    docker info *> $null
    return $LASTEXITCODE -eq 0
}

# 1. Docker Desktop
if (-not (Test-Docker)) {
    Write-Host 'Abrindo o Docker Desktop...'
    $dockerExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dockerExe) { Start-Process $dockerExe }
    for ($i = 0; $i -lt 90 -and -not (Test-Docker); $i++) { Start-Sleep -Seconds 2 }
}

# 2. AI services, database and Redis (the "web" container has its own profile and stays off)
Write-Host 'Ligando os serviços de IA no Docker...'
Push-Location $repo
docker compose up -d
Pop-Location

# 3. The editor, in its own minimized window (closing that window stops the editor)
if (-not (Test-Url $url)) {
    Write-Host 'Ligando o editor...'
    $bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
    if (-not (Test-Path $bun)) { $bun = 'bun' }
    $webDir = Join-Path $repo 'apps\web'
    $command = "`$host.UI.RawUI.WindowTitle = 'OpenCut - editor (não feche)'; " +
        "`$env:NEXT_PUBLIC_SITE_URL = '$url'; " +
        "`$env:OPENCUT_HIDE_DEV_INDICATORS = '1'; " +
        "Set-Location '$webDir'; " +
        "& '$bun' x next dev --turbopack --port $port"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $command -WindowStyle Minimized
    for ($i = 0; $i -lt 180 -and -not (Test-Url $url); $i++) { Start-Sleep -Seconds 1 }
}

# 4. Editor window (same as the old shortcut: Edge in app mode)
$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (Test-Path $edge) {
    Start-Process $edge "--app=$url"
} else {
    Start-Process $url
}
