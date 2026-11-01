# Starts TiêIA and opens the editor window.
#
# - Docker runs the AI services, the database and Redis (heavy Python/GPU
#   dependencies that don't install well on Windows).
# - The editor (Next.js) runs straight on Windows. By default it serves the
#   production build, and rebuilds it (about 30 s) only when the editor's code
#   changed since the last build. With -Dev it runs `next dev`, where code
#   changes show up instantly; that's for development sessions.
#
# The editor stays on port 3100: projects are saved in the browser per
# address, so another port would show an empty project list. It runs hidden
# in the background (log in %LOCALAPPDATA%\OpenCut-AI\editor.log) and only
# answers this PC. -Stop shuts the editor and the Docker services down.

param([switch]$Dev, [switch]$Stop, [switch]$NoBrowser)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repo 'apps\web'
$port = 3100
$url = "http://localhost:$port"
$stateDir = Join-Path $env:LOCALAPPDATA 'OpenCut-AI'
$stateFile = Join-Path $stateDir 'launcher.json'
$logFile = Join-Path $stateDir 'editor.log'
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

function Test-NvidiaGpu {
    if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) { return $false }
    nvidia-smi -L *> $null
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

# Fingerprint of what the editor build is made of: the committed contents of
# the editor, its packages and dependencies (not the whole commit, so docs or
# AI-service changes don't trigger a rebuild), plus uncommitted edits there.
# Files the build itself rewrites are left out, or every build would look stale.
function Get-CodeStamp {
    $paths = @('apps/web', 'packages', 'package.json', 'bun.lock', ':(exclude)apps/web/next-env.d.ts', ':(exclude)*.tsbuildinfo')
    $parts = @()
    $parts += git -C $repo rev-parse HEAD:apps/web HEAD:packages HEAD:package.json HEAD:bun.lock
    $parts += git -C $repo diff HEAD -- $paths
    foreach ($file in (git -C $repo ls-files --others --exclude-standard -- $paths)) {
        $full = Join-Path $repo $file
        if (Test-Path $full) { $parts += $file + ':' + (Get-FileHash $full -Algorithm SHA256).Hash }
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))) -replace '-', ''
}

# Fingerprint of the dependency lists; when it changes, `bun install` runs first
function Get-DepsStamp {
    $files = @('bun.lock', 'package.json', 'apps\web\package.json')
    $files += Get-ChildItem (Join-Path $repo 'packages') -Directory | ForEach-Object { "packages\$($_.Name)\package.json" }
    $parts = foreach ($file in $files) {
        $full = Join-Path $repo $file
        if (Test-Path $full) { $file + ':' + (Get-FileHash $full -Algorithm SHA256).Hash }
    }
    return ($parts -join '|')
}

function Test-OurServer($state) {
    if (-not $state -or -not $state.pid) { return $false }
    return [bool](Get-Process -Id $state.pid -ErrorAction SilentlyContinue)
}

function Stop-Editor($state) {
    taskkill /PID $state.pid /T /F *> $null
    for ($i = 0; $i -lt 20 -and (Test-Url $url); $i++) { Start-Sleep -Seconds 1 }
}

if ($Stop) {
    $state = Read-State
    if (Test-OurServer $state) {
        Write-Host 'Desligando o editor...'
        Stop-Editor $state
    }
    if (Test-Docker) {
        Write-Host 'Desligando os serviços de IA...'
        Push-Location $repo
        docker compose stop
        Pop-Location
    }
    exit 0
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
if (Test-NvidiaGpu) {
    # Chatterbox gets the GPU from docker-compose.gpu.yml (on the CPU a sentence
    # takes minutes). Only Chatterbox: that file also sets turboquant and
    # translate to CUDA, which this launcher leaves as they are. Starting the
    # others without it keeps Chatterbox from being recreated twice per launch.
    $others = docker compose config --services | Where-Object { $_ -ne 'chatterbox-service' }
    docker compose up -d @others
    docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --no-deps chatterbox-service
} else {
    docker compose up -d
}
# The Docker copy of the editor (profile docker-web) would answer on the same
# port with an old build. Docker restarts it on its own after an unclean
# shutdown, so it is switched off here; nothing happens when it is already off.
docker compose --profile docker-web stop web *> $null
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
    $depsStamp = $null
    if ($state) { $buildStamp = $state.buildStamp; $depsStamp = $state.depsStamp }

    # New or changed dependencies: install them before building or serving
    $currentDeps = Get-DepsStamp
    if ($depsStamp -ne $currentDeps -or -not (Test-Path (Join-Path $repo 'node_modules'))) {
        $installCommand = "`$host.UI.RawUI.WindowTitle = 'TiêIA - instalando'; " +
            "Write-Host 'Instalando as dependências novas da TiêIA...'; " +
            "Set-Location '$repo'; " +
            "& '$bun' install --frozen-lockfile; " +
            "if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'A instalação falhou.'; Start-Sleep -Seconds 8 }; " +
            "exit `$LASTEXITCODE"
        $install = Start-Process powershell -ArgumentList '-NoProfile', '-Command', $installCommand -PassThru -Wait
        if ($install.ExitCode -eq 0) { $depsStamp = $currentDeps }
    }
    $hasBuild = Test-Path (Join-Path $webDir '.next\BUILD_ID')

    if ($mode -eq 'prod' -and ($buildStamp -ne $stamp -or -not $hasBuild)) {
        $buildCommand = "`$host.UI.RawUI.WindowTitle = 'TiêIA - preparando'; " +
            "Write-Host 'Preparando a TiêIA com as últimas mudanças (cerca de 30 s)...'; " +
            "`$env:OPENCUT_LOCAL_BUILD = '1'; " +
            "`$env:NEXT_PUBLIC_SITE_URL = '$url'; " +
            "`$env:NEXT_TELEMETRY_DISABLED = '1'; " +
            "Set-Location '$webDir'; " +
            "& '$bun' x next build; " +
            "if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'A preparação falhou. A TiêIA vai abrir no modo de desenvolvimento.'; Start-Sleep -Seconds 8 }; " +
            "exit `$LASTEXITCODE"
        $build = Start-Process powershell -ArgumentList '-NoProfile', '-Command', $buildCommand -PassThru -Wait
        if ($build.ExitCode -eq 0) {
            $buildStamp = $stamp
        } else {
            $mode = 'dev'
        }
    }

    # 127.0.0.1: the editor answers this PC only, not the network
    if ($mode -eq 'prod') {
        $serve = "`$env:OPENCUT_LOCAL_BUILD = '1'; & '$bun' x next start --hostname 127.0.0.1 --port $port"
    } else {
        $serve = "`$env:NEXT_PUBLIC_SITE_URL = '$url'; " +
            "`$env:OPENCUT_HIDE_DEV_INDICATORS = '1'; " +
            "& '$bun' x next dev --turbopack --hostname 127.0.0.1 --port $port"
    }
    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    # Hidden: nothing to close by accident. The "Fechar TiêIA" shortcut (-Stop) ends it
    $command = "Set-Location '$webDir'; $serve *> '$logFile'"
    $server = Start-Process powershell -ArgumentList '-NoProfile', '-Command', $command -WindowStyle Hidden -PassThru
    Write-State ([pscustomobject]@{ pid = $server.Id; mode = $mode; stamp = $stamp; buildStamp = $buildStamp; depsStamp = $depsStamp })

    Write-Host 'Ligando o editor...'
    for ($i = 0; $i -lt 180 -and -not (Test-Url $url); $i++) { Start-Sleep -Seconds 1 }
}

# 4. Editor window (Edge in app mode, like the original shortcut)
if ($NoBrowser) { exit 0 }
$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (Test-Path $edge) {
    Start-Process $edge "--app=$url"
} else {
    Start-Process $url
}
