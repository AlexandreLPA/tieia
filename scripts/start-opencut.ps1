# Starts OpenCut and opens the editor window.
#
# - Docker runs the AI services, the database and Redis (heavy Python/GPU
#   dependencies that don't install well on Windows).
# - The editor (Next.js) runs straight on Windows. By default it serves the
#   production build, and rebuilds it (about 30 s) only when the editor's code
#   changed since the last build. With -Dev it runs `next dev`, where code
#   changes show up instantly; that's for development sessions.
#
# The editor stays on port 3100: projects are saved in the browser per
# address, so another port would show an empty project list.

param([switch]$Dev)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repo 'apps\web'
$port = 3100
$url = "http://localhost:$port"
$stateDir = Join-Path $env:LOCALAPPDATA 'OpenCut-AI'
$stateFile = Join-Path $stateDir 'launcher.json'
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
if (-not (Test-Path $bun)) { $bun = 'bun' }

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

function Read-State {
    if (-not (Test-Path $stateFile)) { return $null }
    try { return Get-Content $stateFile -Raw | ConvertFrom-Json } catch { return $null }
}

function Write-State($state) {
    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    $state | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8
}

# Fingerprint of the editor's code: the commit plus uncommitted edits.
# Files the build itself rewrites are left out, or every build would look stale.
function Get-CodeStamp {
    $paths = @('apps/web', 'packages', ':(exclude)apps/web/next-env.d.ts', ':(exclude)*.tsbuildinfo')
    $parts = @()
    $parts += git -C $repo rev-parse HEAD
    $parts += git -C $repo diff HEAD -- $paths
    foreach ($file in (git -C $repo ls-files --others --exclude-standard -- $paths)) {
        $full = Join-Path $repo $file
        if (Test-Path $full) { $parts += $file + ':' + (Get-FileHash $full -Algorithm SHA256).Hash }
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))) -replace '-', ''
}

function Test-OurServer($state) {
    if (-not $state -or -not $state.pid) { return $false }
    return [bool](Get-Process -Id $state.pid -ErrorAction SilentlyContinue)
}

function Stop-Editor($state) {
    taskkill /PID $state.pid /T /F *> $null
    for ($i = 0; $i -lt 20 -and (Test-Url $url); $i++) { Start-Sleep -Seconds 1 }
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

# 3. The editor
$mode = if ($Dev) { 'dev' } else { 'prod' }
$stamp = Get-CodeStamp
$state = Read-State
$running = Test-Url $url

# A server this launcher started earlier gets replaced when it's the wrong
# mode or serves an older build. Anything else on the port is left alone.
if ($running -and (Test-OurServer $state)) {
    if ($state.mode -ne $mode -or ($mode -eq 'prod' -and $state.stamp -ne $stamp)) {
        Write-Host 'Reiniciando o editor...'
        Stop-Editor $state
        $running = $false
    }
}

if (-not $running) {
    $buildStamp = $null
    if ($state) { $buildStamp = $state.buildStamp }
    $hasBuild = Test-Path (Join-Path $webDir '.next\BUILD_ID')

    if ($mode -eq 'prod' -and ($buildStamp -ne $stamp -or -not $hasBuild)) {
        $buildCommand = "`$host.UI.RawUI.WindowTitle = 'OpenCut - preparando'; " +
            "Write-Host 'Preparando o OpenCut com as últimas mudanças (cerca de 30 s)...'; " +
            "`$env:OPENCUT_LOCAL_BUILD = '1'; " +
            "`$env:NEXT_PUBLIC_SITE_URL = '$url'; " +
            "`$env:NEXT_TELEMETRY_DISABLED = '1'; " +
            "Set-Location '$webDir'; " +
            "& '$bun' x next build; " +
            "if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'A preparação falhou. O OpenCut vai abrir no modo de desenvolvimento.'; Start-Sleep -Seconds 8 }; " +
            "exit `$LASTEXITCODE"
        $build = Start-Process powershell -ArgumentList '-NoProfile', '-Command', $buildCommand -PassThru -Wait
        if ($build.ExitCode -eq 0) {
            $buildStamp = $stamp
        } else {
            $mode = 'dev'
        }
    }

    if ($mode -eq 'prod') {
        $serve = "`$env:OPENCUT_LOCAL_BUILD = '1'; & '$bun' x next start --port $port"
    } else {
        $serve = "`$env:NEXT_PUBLIC_SITE_URL = '$url'; " +
            "`$env:OPENCUT_HIDE_DEV_INDICATORS = '1'; " +
            "& '$bun' x next dev --turbopack --port $port"
    }
    # Its own minimized window: closing that window stops the editor
    $command = "`$host.UI.RawUI.WindowTitle = 'OpenCut - editor (não feche)'; Set-Location '$webDir'; $serve"
    $server = Start-Process powershell -ArgumentList '-NoProfile', '-NoExit', '-Command', $command -WindowStyle Minimized -PassThru
    Write-State ([pscustomobject]@{ pid = $server.Id; mode = $mode; stamp = $stamp; buildStamp = $buildStamp })

    Write-Host 'Ligando o editor...'
    for ($i = 0; $i -lt 180 -and -not (Test-Url $url); $i++) { Start-Sleep -Seconds 1 }
}

# 4. Editor window (Edge in app mode, like the original shortcut)
$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (Test-Path $edge) {
    Start-Process $edge "--app=$url"
} else {
    Start-Process $url
}
