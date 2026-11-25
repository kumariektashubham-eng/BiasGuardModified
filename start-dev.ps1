# ==============================================================================
# BiasGuard AI - One-Click Development Environment Startup Script
# ==============================================================================
# Starts and monitors:
#   1. MongoDB connectivity check
#   2. FastAPI backend (port 8000)
#   3. Vite React frontend (port 5173)
#   4. Cloudflare Quick Tunnel (cloudflared -> http://localhost:5173)
# Captures the live https://*.trycloudflare.com URL, writes PUBLIC_BASE_URL into
# backend/.env, restarts the backend so CORS & invite links use it, and waits
# until {PUBLIC_BASE_URL}/api/health returns 200 before reporting ready.
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$ErrorActionPreference = "Stop"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

# 1. Automatically locate project root directory
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) {
    $ProjectRoot = (Get-Location).Path
}
Set-Location $ProjectRoot

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "           BiasGuard AI Development Environment Launcher             " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Project root : $ProjectRoot" -ForegroundColor DarkGray

# 2. Check Node.js and npm
Write-Host "[-] Checking Node.js and npm environment..." -NoNewline
$NodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
$NpmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $NodeCmd -or -not $NpmCmd) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Node.js and npm are required to run the frontend." -ForegroundColor Red
    Write-Host "Please install Node.js (v18+) from https://nodejs.org and verify 'node' and 'npm' are on your PATH." -ForegroundColor Yellow
    exit 1
}
$NodeVer = & node -v
$NpmVer = & npm -v
Write-Host " [OK] (Node $NodeVer, npm $NpmVer)" -ForegroundColor Green

# 3. Check Python virtual environment
Write-Host "[-] Checking Python virtual environment..." -NoNewline
$PythonExe = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Python virtual environment not found at:" -ForegroundColor Red
    Write-Host "  $PythonExe" -ForegroundColor Yellow
    Write-Host "Please initialize the backend environment by running:" -ForegroundColor Yellow
    Write-Host "  cd backend; python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}
$PyVer = & $PythonExe --version
Write-Host " [OK] ($PyVer)" -ForegroundColor Green

# 4. Check cloudflared installation
Write-Host "[-] Checking cloudflared installation..." -NoNewline
$CloudflaredExe = $null
$CfCmd = Get-Command "cloudflared" -ErrorAction SilentlyContinue
if ($CfCmd) {
    $CloudflaredExe = $CfCmd.Source
} else {
    $CfCandidates = @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe",
        (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\cloudflared.exe")
    )
    foreach ($cand in $CfCandidates) {
        if ($cand -and (Test-Path $cand)) {
            $CloudflaredExe = $cand
            break
        }
    }
}
if (-not $CloudflaredExe) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] cloudflared is not installed or could not be found." -ForegroundColor Red
    Write-Host "Install it via winget:" -ForegroundColor Yellow
    Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor White
    exit 1
}
$CfVer = (& $CloudflaredExe --version 2>&1 | Select-Object -First 1)
Write-Host " [OK] ($CfVer)" -ForegroundColor Green

# 5. Check MongoDB connectivity (warning only, backend may use MongoDB Atlas)
Write-Host "[-] Checking MongoDB database service (127.0.0.1:27017)..." -NoNewline
$MongoConn = Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -WarningAction SilentlyContinue
if ($MongoConn.TcpTestSucceeded) {
    Write-Host " [OK] (Local MongoDB Active)" -ForegroundColor Green
} else {
    Write-Host " [INFO] (Local 27017 inactive; Atlas/configured URI will be used)" -ForegroundColor Yellow
}

# 6. Check for port conflicts (8000 and 5173)
Write-Host "[-] Checking for port conflicts on 8000 and 5173..." -NoNewline
function Get-PortOwner([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        return [PSCustomObject]@{
            Port        = $Port
            PID         = $conn.OwningProcess
            ProcessName = if ($p) { $p.ProcessName } else { "Unknown" }
        }
    }
    return $null
}

$Port8000 = Get-PortOwner 8000
$Port5173 = Get-PortOwner 5173

if ($Port8000 -or $Port5173) {
    Write-Host " [CONFLICT]" -ForegroundColor Red
    Write-Host ""
    Write-Host "[ERROR] Required ports are already occupied by another process:" -ForegroundColor Red
    if ($Port8000) {
        Write-Host "  * Port 8000 (Backend) is in use by PID $($Port8000.PID) ($($Port8000.ProcessName))" -ForegroundColor Yellow
    }
    if ($Port5173) {
        Write-Host "  * Port 5173 (Frontend) is in use by PID $($Port5173.PID) ($($Port5173.ProcessName))" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Suggestions:" -ForegroundColor Cyan
    Write-Host "  1. Run .\stop-dev.ps1 to stop previously launched BiasGuard servers." -ForegroundColor White
    Write-Host "  2. Or manually terminate the conflicting process(es) before starting." -ForegroundColor White
    exit 1
}
Write-Host " [OK] (Ports available)" -ForegroundColor Green

# Prepare logs directory
$LogsDir = Join-Path $ProjectRoot ".dev-logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}
$BackendOutLog = Join-Path $LogsDir "backend.out.log"
$BackendErrLog = Join-Path $LogsDir "backend.err.log"
$FrontendOutLog = Join-Path $LogsDir "frontend.out.log"
$FrontendErrLog = Join-Path $LogsDir "frontend.err.log"
$TunnelOutLog = Join-Path $LogsDir "cloudflared.out.log"
$TunnelErrLog = Join-Path $LogsDir "cloudflared.err.log"

"" | Set-Content -Path $BackendOutLog -Encoding utf8
"" | Set-Content -Path $BackendErrLog -Encoding utf8
"" | Set-Content -Path $FrontendOutLog -Encoding utf8
"" | Set-Content -Path $FrontendErrLog -Encoding utf8
"" | Set-Content -Path $TunnelOutLog -Encoding utf8
"" | Set-Content -Path $TunnelErrLog -Encoding utf8

$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$BackendEnvFile = Join-Path $BackendDir ".env"
$PidFile = Join-Path $ProjectRoot ".dev-pids.json"

$BackendProc = $null
$FrontendProc = $null
$TunnelProc = $null

function Stop-AllDevProcesses {
    if ($TunnelProc -and -not $TunnelProc.HasExited) {
        taskkill.exe /PID $TunnelProc.Id /T /F 2>$null | Out-Null
    }
    if ($BackendProc -and -not $BackendProc.HasExited) {
        taskkill.exe /PID $BackendProc.Id /T /F 2>$null | Out-Null
    }
    if ($FrontendProc -and -not $FrontendProc.HasExited) {
        taskkill.exe /PID $FrontendProc.Id /T /F 2>$null | Out-Null
    }
    $rem8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($rem8000) { taskkill.exe /PID $rem8000.OwningProcess /T /F 2>$null | Out-Null }
    $rem5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($rem5173) { taskkill.exe /PID $rem5173.OwningProcess /T /F 2>$null | Out-Null }
    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Start-BackendServer {
    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    $args = @{
        FilePath               = $PythonExe
        ArgumentList           = @("-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload", "--reload-dir", "app")
        WorkingDirectory       = $BackendDir
        NoNewWindow            = $true
        RedirectStandardOutput = $BackendOutLog
        RedirectStandardError  = $BackendErrLog
        PassThru               = $true
    }
    return Start-Process @args
}

function Wait-LocalBackendReady([int]$MaxAttempts = 70) {
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        if ($BackendProc -and $BackendProc.HasExited) {
            return $false
        }
        Start-Sleep -Milliseconds 500
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($resp -and ($resp.backend -eq "online" -or $resp.status -in @("healthy", "degraded"))) {
                return $true
            }
        } catch {
            # Retry until timeout
        }
    }
    return $false
}

function Save-PidFile([string]$PublicUrl = "") {
    $PidData = @{
        BackendPID     = if ($BackendProc) { $BackendProc.Id } else { $null }
        FrontendPID    = if ($FrontendProc) { $FrontendProc.Id } else { $null }
        CloudflaredPID = if ($TunnelProc) { $TunnelProc.Id } else { $null }
        WatchdogPID    = $PID
        PublicBaseUrl  = $PublicUrl
        StartedAt      = (Get-Date).ToString("o")
        BackendPort    = 8000
        FrontendPort   = 5173
    } | ConvertTo-Json
    Set-Content -Path $PidFile -Value $PidData -Encoding utf8
}

function Set-BackendPublicBaseUrl([string]$Url) {
    $cleanUrl = $Url.Trim().TrimEnd("/")
    if (Test-Path $BackendEnvFile) {
        $lines = Get-Content -Path $BackendEnvFile -Encoding UTF8
        $updated = @()
        $foundPublic = $false
        foreach ($line in $lines) {
            if ($line -match '^\s*#?\s*PUBLIC_BASE_URL\s*=') {
                if (-not $foundPublic) {
                    $updated += "PUBLIC_BASE_URL=$cleanUrl"
                    $foundPublic = $true
                }
            } else {
                $updated += $line
            }
        }
        if (-not $foundPublic) {
            $updated += "PUBLIC_BASE_URL=$cleanUrl"
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($BackendEnvFile, $updated, $utf8NoBom)
    }
    $env:PUBLIC_BASE_URL = $cleanUrl
}

# 7. Start Backend on port 8000
Write-Host "[-] Starting FastAPI backend on http://127.0.0.1:8000..." -NoNewline
$BackendProc = Start-BackendServer
if (-not $BackendProc -or $BackendProc.HasExited) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Failed to launch backend process. Recent logs:" -ForegroundColor Red
    if (Test-Path $BackendErrLog) { Get-Content $BackendErrLog -Tail 15 }
    exit 1
}
Write-Host " [STARTED] (PID $($BackendProc.Id))" -ForegroundColor Green
Save-PidFile

Write-Host "[-] Awaiting local backend readiness at http://127.0.0.1:8000/health..." -NoNewline
if (-not (Wait-LocalBackendReady)) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Backend did not report ready within 35 seconds." -ForegroundColor Red
    if (Test-Path $BackendErrLog) { Get-Content $BackendErrLog -Tail 20 }
    if (Test-Path $BackendOutLog) { Get-Content $BackendOutLog -Tail 20 }
    Stop-AllDevProcesses
    exit 1
}
Write-Host " [READY]" -ForegroundColor Green

# 8. Start Frontend on port 5173
$NodeModulesDir = Join-Path $FrontendDir "node_modules"
if (-not (Test-Path $NodeModulesDir)) {
    Write-Host ""
    Write-Host "[-] frontend/node_modules not found. Running npm install..." -ForegroundColor Yellow
    $NpmInstallPath = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
    if (-not $NpmInstallPath) { $NpmInstallPath = "npm" }

    Push-Location $FrontendDir
    try {
        & $NpmInstallPath install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] 'npm install' failed with exit code $LASTEXITCODE." -ForegroundColor Red
            Stop-AllDevProcesses
            exit 1
        }
        Write-Host " [OK] Frontend dependencies installed." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "[-] Starting Vite frontend on http://localhost:5173..." -NoNewline
$NpmPath = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
if (-not $NpmPath) { $NpmPath = "npm" }

$FrontendStartArgs = @{
    FilePath               = $NpmPath
    ArgumentList           = @("run", "dev")
    WorkingDirectory       = $FrontendDir
    NoNewWindow            = $true
    RedirectStandardOutput = $FrontendOutLog
    RedirectStandardError  = $FrontendErrLog
    PassThru               = $true
}
$FrontendProc = Start-Process @FrontendStartArgs
if (-not $FrontendProc -or $FrontendProc.HasExited) {
    Write-Host " [FAILED]" -ForegroundColor Red
    if (Test-Path $FrontendErrLog) { Get-Content $FrontendErrLog -Tail 15 }
    if (Test-Path $FrontendOutLog) { Get-Content $FrontendOutLog -Tail 15 }
    Stop-AllDevProcesses
    exit 1
}
Write-Host " [STARTED] (PID $($FrontendProc.Id))" -ForegroundColor Green
Save-PidFile

Write-Host "[-] Awaiting frontend readiness at http://127.0.0.1:5173..." -NoNewline
$FrontendReady = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $feResp = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($feResp -and $feResp.StatusCode -eq 200) {
            $FrontendReady = $true
            break
        }
    } catch {
        # Retry until timeout
    }
}

if (-not $FrontendReady) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Frontend did not become ready at http://127.0.0.1:5173 within 20 seconds." -ForegroundColor Red
    if (Test-Path $FrontendErrLog) { Get-Content $FrontendErrLog -Tail 20 }
    if (Test-Path $FrontendOutLog) { Get-Content $FrontendOutLog -Tail 20 }
    Stop-AllDevProcesses
    exit 1
}
Write-Host " [READY]" -ForegroundColor Green

function Stop-OldCloudflaredProcesses {
    try {
        $cfProcs = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
        foreach ($cf in $cfProcs) {
            taskkill.exe /PID $cf.ProcessId /T /F 2>$null | Out-Null
        }
    } catch {}
}

function Start-CloudflareTunnel {
    Stop-OldCloudflaredProcesses
    Start-Sleep -Milliseconds 300
    "" | Set-Content -Path $TunnelOutLog -Encoding utf8
    "" | Set-Content -Path $TunnelErrLog -Encoding utf8
    $TunnelStartArgs = @{
        FilePath               = $CloudflaredExe
        ArgumentList           = @("tunnel", "--url", "http://localhost:5173", "--no-autoupdate")
        WorkingDirectory       = $ProjectRoot
        NoNewWindow            = $true
        RedirectStandardOutput = $TunnelOutLog
        RedirectStandardError  = $TunnelErrLog
        PassThru               = $true
    }
    return Start-Process @TunnelStartArgs
}

function Wait-TunnelPublicUrl([System.Diagnostics.Process]$Proc, [int]$MaxAttempts = 60) {
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        Start-Sleep -Milliseconds 500
        if ($Proc -and $Proc.HasExited) {
            break
        }
        $combinedLog = ""
        if (Test-Path $TunnelErrLog) { $combinedLog += (Get-Content $TunnelErrLog -Raw -ErrorAction SilentlyContinue) + "`n" }
        if (Test-Path $TunnelOutLog) { $combinedLog += (Get-Content $TunnelOutLog -Raw -ErrorAction SilentlyContinue) }
        $matches = [regex]::Matches($combinedLog, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
        foreach ($m in $matches) {
            if ($m.Value -notmatch 'api\.trycloudflare\.com') {
                return $m.Value.TrimEnd("/")
            }
        }
    }
    return $null
}

function Test-PublicTunnelHealth([string]$Url) {
    if (-not $Url) { return $false }
    try {
        $pubResp = Invoke-WebRequest -Uri "$Url/api/health" -Method Get -TimeoutSec 8 -UseBasicParsing -ErrorAction Stop
        return ($null -ne $pubResp -and $pubResp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Wait-PublicTunnelHealth([string]$Url, [System.Diagnostics.Process]$Proc, [int]$MaxAttempts = 40) {
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        Start-Sleep -Seconds 1
        if ($Proc -and $Proc.HasExited) { break }
        if (Test-PublicTunnelHealth $Url) {
            return $true
        }
    }
    return $false
}

function Test-TunnelLogFatalError {
    if (-not (Test-Path $TunnelErrLog)) { return $false }
    $tail = (Get-Content $TunnelErrLog -Tail 15 -ErrorAction SilentlyContinue) -join "`n"
    return ($tail -match 'Unauthorized:\s*Tunnel not found' -or $tail -match 'tunnel not found')
}

# 9. Start Cloudflare Tunnel -> http://localhost:5173
Write-Host "[-] Stopping any old cloudflared processes and starting Cloudflare Tunnel (--no-autoupdate)..." -NoNewline
$TunnelProc = Start-CloudflareTunnel
if (-not $TunnelProc -or $TunnelProc.HasExited) {
    Write-Host " [FAILED]" -ForegroundColor Red
    if (Test-Path $TunnelErrLog) { Get-Content $TunnelErrLog -Tail 20 }
    Stop-AllDevProcesses
    exit 1
}
Write-Host " [STARTED] (PID $($TunnelProc.Id))" -ForegroundColor Green
Save-PidFile

# 10. Parse live https://*.trycloudflare.com URL from tunnel output (up to 30 seconds)
Write-Host "[-] Capturing live trycloudflare.com URL from tunnel output..." -NoNewline
$PublicBaseUrl = Wait-TunnelPublicUrl $TunnelProc 60

if (-not $PublicBaseUrl) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Could not capture trycloudflare.com URL within 30 seconds." -ForegroundColor Red
    if (Test-Path $TunnelErrLog) { Get-Content $TunnelErrLog -Tail 25 }
    if (Test-Path $TunnelOutLog) { Get-Content $TunnelOutLog -Tail 15 }
    Stop-AllDevProcesses
    exit 1
}
Write-Host " [CAPTURED]" -ForegroundColor Green
Write-Host "    Live Tunnel URL: $PublicBaseUrl" -ForegroundColor Cyan

# Overwrite old saved URL everywhere immediately (backend/.env, env var, .dev-pids.json)
Set-BackendPublicBaseUrl $PublicBaseUrl
Save-PidFile $PublicBaseUrl

# 11. Save PUBLIC_BASE_URL in backend/.env and restart backend so CORS & invite links use it
Write-Host "[-] Saving PUBLIC_BASE_URL to backend/.env and restarting backend..." -NoNewline
Set-BackendPublicBaseUrl $PublicBaseUrl

if ($BackendProc -and -not $BackendProc.HasExited) {
    taskkill.exe /PID $BackendProc.Id /T /F 2>$null | Out-Null
}
# Wait up to 5 seconds for port 8000 to be released
for ($w = 0; $w -lt 20; $w++) {
    $still8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    if (-not $still8000) { break }
    Start-Sleep -Milliseconds 250
}

"" | Set-Content -Path $BackendOutLog -Encoding utf8
"" | Set-Content -Path $BackendErrLog -Encoding utf8
$BackendProc = Start-BackendServer
if (-not $BackendProc -or $BackendProc.HasExited -or -not (Wait-LocalBackendReady)) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Backend failed to restart with updated PUBLIC_BASE_URL." -ForegroundColor Red
    if (Test-Path $BackendErrLog) { Get-Content $BackendErrLog -Tail 20 }
    Stop-AllDevProcesses
    exit 1
}
Save-PidFile $PublicBaseUrl
Write-Host " [RELOADED] (PID $($BackendProc.Id))" -ForegroundColor Green

# 12. Verify public tunnel end-to-end: wait until {PUBLIC_BASE_URL}/api/health returns 200
Write-Host "[-] Verifying public endpoint $PublicBaseUrl/api/health..." -NoNewline
$PublicHealthy = Wait-PublicTunnelHealth $PublicBaseUrl $TunnelProc

if (-not $PublicHealthy) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] $PublicBaseUrl/api/health did not return HTTP 200 within 40 seconds." -ForegroundColor Red
    if (Test-Path $TunnelErrLog) { Get-Content $TunnelErrLog -Tail 20 }
    Stop-AllDevProcesses
    exit 1
}
Write-Host " [200 OK]" -ForegroundColor Green

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "            BIASGUARD AI IS NOW LIVE AND ACCESSIBLE                  " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  * PUBLIC TUNNEL URL      : $PublicBaseUrl" -ForegroundColor Yellow
Write-Host "  * Public Health Check    : $PublicBaseUrl/api/health (200 OK)" -ForegroundColor Cyan
Write-Host "  * Local Frontend         : http://localhost:5173/" -ForegroundColor Cyan
Write-Host "  * Local Backend API      : http://127.0.0.1:8000/" -ForegroundColor Cyan
Write-Host "  * Interactive Swagger    : http://127.0.0.1:8000/docs" -ForegroundColor Cyan
Write-Host "  * Configuration Status   : $PublicBaseUrl/api/settings/status" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "Features Active:" -ForegroundColor DarkGray
Write-Host "  * Single public HTTPS origin via Cloudflare Tunnel -> Vite (5173)" -ForegroundColor DarkGray
Write-Host "  * Vite proxy active (/api & /ws -> http://localhost:8000, ws: true)" -ForegroundColor DarkGray
Write-Host "  * PUBLIC_BASE_URL synced in backend/.env for all invite emails" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C or run .\stop-dev.ps1 to cleanly stop all servers & tunnel." -ForegroundColor DarkGray
Write-Host ""

# 13. Continuous Process & Tunnel Watchdog Loop (probing tunnel every 20 seconds)
$BackendFailures = 0
$FrontendFailures = 0
$TunnelFailures = 0
$PublicHealthFailures = 0
$HealthTickCounter = 0

try {
    while ($true) {
        Start-Sleep -Seconds 5
        $HealthTickCounter++

        # Check backend
        $Port8000Conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
        $BackendIsAlive = ($BackendProc -and -not $BackendProc.HasExited) -and ($null -ne $Port8000Conn)
        if (-not $BackendIsAlive) {
            $BackendFailures++
            if ($BackendFailures -ge 2) {
                Write-Host ""
                Write-Host "[CRITICAL] Backend process on port 8000 has stopped!" -ForegroundColor Red
                if (Test-Path $BackendErrLog) { Get-Content $BackendErrLog -Tail 20 }
                if (Test-Path $BackendOutLog) { Get-Content $BackendOutLog -Tail 10 }
                break
            }
        } else {
            $BackendFailures = 0
        }

        # Check frontend
        $Port5173Conn = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
        $FrontendIsAlive = ($FrontendProc -and -not $FrontendProc.HasExited) -and ($null -ne $Port5173Conn)
        if (-not $FrontendIsAlive) {
            $FrontendFailures++
            if ($FrontendFailures -ge 2) {
                Write-Host ""
                Write-Host "[CRITICAL] Frontend process on port 5173 has stopped!" -ForegroundColor Red
                if (Test-Path $FrontendErrLog) { Get-Content $FrontendErrLog -Tail 20 }
                if (Test-Path $FrontendOutLog) { Get-Content $FrontendOutLog -Tail 10 }
                break
            }
        } else {
            $FrontendFailures = 0
        }

        # Check cloudflared process + fatal tunnel-not-found errors + 20-second GET /api/health watchdog
        $TunnelExited = (-not $TunnelProc -or $TunnelProc.HasExited)
        $TunnelFatalLog = Test-TunnelLogFatalError
        $ShouldRecoverTunnel = $false

        if ($TunnelExited -or $TunnelFatalLog) {
            $TunnelFailures++
            if ($TunnelFatalLog -or $TunnelFailures -ge 2) {
                $ShouldRecoverTunnel = $true
            }
        } else {
            $TunnelFailures = 0
            if ($HealthTickCounter % 4 -eq 0) {
                if (Test-PublicTunnelHealth $PublicBaseUrl) {
                    $PublicHealthFailures = 0
                } else {
                    $PublicHealthFailures++
                    Write-Host "[WARN] Watchdog health probe failed ($PublicHealthFailures/2) for $PublicBaseUrl" -ForegroundColor Yellow
                    if ($PublicHealthFailures -ge 2) {
                        $ShouldRecoverTunnel = $true
                    }
                }
            }
        }

        if ($ShouldRecoverTunnel) {
            Write-Host ""
            Write-Host "[WARN] Cloudflare Tunnel ($PublicBaseUrl) is down or unresponsive. Restarting cloudflared..." -ForegroundColor Yellow
            if ($TunnelProc -and -not $TunnelProc.HasExited) {
                taskkill.exe /PID $TunnelProc.Id /T /F 2>$null | Out-Null
            }
            $TunnelProc = Start-CloudflareTunnel
            $NewUrl = if ($TunnelProc -and -not $TunnelProc.HasExited) { Wait-TunnelPublicUrl $TunnelProc 60 } else { $null }
            if ($NewUrl -and (Wait-PublicTunnelHealth $NewUrl $TunnelProc 40)) {
                $PublicBaseUrl = $NewUrl
                Set-BackendPublicBaseUrl $PublicBaseUrl
                Save-PidFile $PublicBaseUrl
                $TunnelFailures = 0
                $PublicHealthFailures = 0
                Write-Host "[RECOVERED] New Live Tunnel URL: $PublicBaseUrl" -ForegroundColor Green
                Write-Host "            PUBLIC_BASE_URL synced in backend/.env and .dev-pids.json." -ForegroundColor Cyan
            } else {
                Write-Host "[ERROR] Failed to auto-recover Cloudflare Tunnel." -ForegroundColor Red
                if (Test-Path $TunnelErrLog) { Get-Content $TunnelErrLog -Tail 20 }
                break
            }
        }
    }
} finally {
    Write-Host ""
    Write-Host "[-] Shutting down BiasGuard AI servers and Cloudflare Tunnel..." -ForegroundColor Yellow
    Stop-AllDevProcesses
    Write-Host "[OK] All BiasGuard development servers and tunnel shut down cleanly." -ForegroundColor Green
}
