# ==============================================================================
# BiasGuard AI - One-Click Development Environment Startup Script
# ==============================================================================
# Automatically starts and monitors both FastAPI backend (port 8000) and
# Vite React frontend (port 5173) with auto-reload, hot module replacement (HMR),
# and continuous process health checks.
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$ErrorActionPreference = "Stop"

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

# Check MongoDB connectivity (warning only, backend runs resiliently)
Write-Host "[-] Checking MongoDB database service (127.0.0.1:27017)..." -NoNewline
$MongoConn = Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -WarningAction SilentlyContinue
if ($MongoConn.TcpTestSucceeded) {
    Write-Host " [OK] (Active)" -ForegroundColor Green
} else {
    Write-Host " [WARN] (Not responding)" -ForegroundColor Yellow
    Write-Host "    Notice: MongoDB is not responding on port 27017. Backend will start in resilient mode." -ForegroundColor Yellow
}

# 4. Check for port conflicts (8000 and 5173)
Write-Host "[-] Checking for port conflicts on 8000 and 5173..." -NoNewline
function Get-PortOwner([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        return [PSCustomObject]@{
            Port = $Port
            PID = $conn.OwningProcess
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

# Clear old logs
"" | Set-Content -Path $BackendOutLog -Encoding utf8
"" | Set-Content -Path $BackendErrLog -Encoding utf8
"" | Set-Content -Path $FrontendOutLog -Encoding utf8
"" | Set-Content -Path $FrontendErrLog -Encoding utf8

# 5. Start Backend on port 8000 (uvicorn app.main:app --reload --reload-dir app)
Write-Host "[-] Starting FastAPI backend on http://127.0.0.1:8000..." -NoNewline
$BackendDir = Join-Path $ProjectRoot "backend"
# Enforce UTF-8 standard streams across Python processes to prevent cp1252 charmap encoding errors on Windows
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$BackendStartArgs = @{
    FilePath = $PythonExe
    ArgumentList = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload", "--reload-dir", "app")
    WorkingDirectory = $BackendDir
    RedirectStandardOutput = $BackendOutLog
    RedirectStandardError = $BackendErrLog
    PassThru = $true
}
$BackendProc = Start-Process @BackendStartArgs

if (-not $BackendProc -or $BackendProc.HasExited) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Failed to launch backend process. Recent logs:" -ForegroundColor Red
    Get-Content $BackendErrLog -Tail 15
    exit 1
}
Write-Host " [STARTED] (PID $($BackendProc.Id))" -ForegroundColor Green

# 6. Start Frontend on port 5173 (npm run dev)
$FrontendDir = Join-Path $ProjectRoot "frontend"
$NodeModulesDir = Join-Path $FrontendDir "node_modules"

# Check that frontend/node_modules exists, run npm install if missing
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
            if ($BackendProc -and -not $BackendProc.HasExited) {
                taskkill.exe /PID $BackendProc.Id /T /F 2>$null | Out-Null
            }
            exit 1
        }
        Write-Host " [OK] Frontend dependencies installed." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "[-] Starting Vite frontend on http://127.0.0.1:5173..." -NoNewline
$NpmPath = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
if (-not $NpmPath) { $NpmPath = "npm" }

$FrontendStartArgs = @{
    FilePath = $NpmPath
    ArgumentList = @("run", "dev")
    WorkingDirectory = $FrontendDir
    RedirectStandardOutput = $FrontendOutLog
    RedirectStandardError = $FrontendErrLog
    PassThru = $true
}
$FrontendProc = Start-Process @FrontendStartArgs

if (-not $FrontendProc -or $FrontendProc.HasExited) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Failed to launch frontend process. Recent logs:" -ForegroundColor Red
    if (Test-Path $FrontendErrLog) { Get-Content $FrontendErrLog -Tail 15 }
    if (Test-Path $FrontendOutLog) { Get-Content $FrontendOutLog -Tail 15 }
    # Terminate backend to prevent orphan
    if ($BackendProc -and -not $BackendProc.HasExited) {
        taskkill.exe /PID $BackendProc.Id /T /F 2>$null | Out-Null
    }
    exit 1
}
Write-Host " [STARTED] (PID $($FrontendProc.Id))" -ForegroundColor Green

# 7. Record PIDs for stop-dev.ps1
$PidFile = Join-Path $ProjectRoot ".dev-pids.json"
$PidData = @{
    BackendPID = $BackendProc.Id
    FrontendPID = $FrontendProc.Id
    StartedAt = (Get-Date).ToString("o")
    BackendPort = 8000
    FrontendPort = 5173
} | ConvertTo-Json
Set-Content -Path $PidFile -Value $PidData -Encoding utf8

# 8. Wait for Health Check confirmation (Backend and Frontend)
Write-Host "[-] Awaiting backend readiness at http://127.0.0.1:8000/health..." -NoNewline
$Healthy = $false
for ($i = 0; $i -lt 70; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($resp -and ($resp.backend -eq "online" -or $resp.status -in @("healthy", "degraded"))) {
            $Healthy = $true
            break
        }
    } catch {
        # Retry until timeout
    }
}

if (-not $Healthy) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host ""
    Write-Host "[ERROR] Backend did not report ready at http://127.0.0.1:8000/health within 35 seconds." -ForegroundColor Red
    Write-Host "--- Tail of backend.err.log ---" -ForegroundColor Yellow
    if (Test-Path $BackendErrLog) { Get-Content $BackendErrLog -Tail 20 }
    Write-Host "--- Tail of backend.out.log ---" -ForegroundColor Yellow
    if (Test-Path $BackendOutLog) { Get-Content $BackendOutLog -Tail 20 }
    Write-Host "--- Tail of frontend.err.log ---" -ForegroundColor Yellow
    if (Test-Path $FrontendErrLog) { Get-Content $FrontendErrLog -Tail 20 }

    # Cleanly terminate all spawned process trees
    if ($BackendProc -and -not $BackendProc.HasExited) {
        taskkill.exe /PID $BackendProc.Id /T /F 2>$null | Out-Null
    }
    if ($FrontendProc -and -not $FrontendProc.HasExited) {
        taskkill.exe /PID $FrontendProc.Id /T /F 2>$null | Out-Null
    }
    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    exit 1
}
Write-Host " [READY]" -ForegroundColor Green

# Poll frontend http://127.0.0.1:5173 up to 20 seconds
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
    Write-Host ""
    Write-Host "[ERROR] Frontend did not become ready at http://127.0.0.1:5173 within 20 seconds." -ForegroundColor Red
    Write-Host "--- Tail of frontend.err.log ---" -ForegroundColor Yellow
    if (Test-Path $FrontendErrLog) { Get-Content $FrontendErrLog -Tail 20 }
    Write-Host "--- Tail of frontend.out.log ---" -ForegroundColor Yellow
    if (Test-Path $FrontendOutLog) { Get-Content $FrontendOutLog -Tail 20 }
    Write-Host "--- Tail of backend.err.log ---" -ForegroundColor Yellow
    if (Test-Path $BackendErrLog) { Get-Content $BackendErrLog -Tail 20 }
    
    # Cleanly terminate all spawned process trees
    if ($BackendProc -and -not $BackendProc.HasExited) {
        taskkill.exe /PID $BackendProc.Id /T /F 2>$null | Out-Null
    }
    if ($FrontendProc -and -not $FrontendProc.HasExited) {
        taskkill.exe /PID $FrontendProc.Id /T /F 2>$null | Out-Null
    }
    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    exit 1
}
Write-Host " [READY]" -ForegroundColor Green

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "            BIASGUARD AI IS NOW LIVE AND ACCESSIBLE                  " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  * Frontend Web Interface : http://127.0.0.1:5173/" -ForegroundColor Cyan
Write-Host "  * Backend REST API       : http://127.0.0.1:8000/" -ForegroundColor Cyan
Write-Host "  * Interactive Swagger    : http://127.0.0.1:8000/docs" -ForegroundColor Cyan
Write-Host "  * Server Health Check    : http://127.0.0.1:8000/health" -ForegroundColor Cyan
Write-Host "  * Configuration Status   : http://127.0.0.1:8000/api/settings/status" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "Features Active:" -ForegroundColor DarkGray
Write-Host "  * Hot Module Replacement [HMR] enabled for React changes without restart" -ForegroundColor DarkGray
Write-Host "  * Uvicorn auto-reload active on backend/app (audio uploads isolated)" -ForegroundColor DarkGray
Write-Host "  * Vite proxy active (/api -> http://127.0.0.1:8000)" -ForegroundColor DarkGray
Write-Host "  * Strict ports enforced (5173 & 8000 preserved)" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C or run .\stop-dev.ps1 to cleanly stop all development servers." -ForegroundColor DarkGray
Write-Host ""

# 9. Continuous Process Monitoring Loop
$BackendFailures = 0
$FrontendFailures = 0

try {
    while ($true) {
        Start-Sleep -Seconds 3

        # Check backend (either PID is running or port 8000 is listening)
        $Port8000Conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
        $BackendIsAlive = ($BackendProc -and -not $BackendProc.HasExited) -and ($Port8000Conn -ne $null)
        if (-not $BackendIsAlive) {
            $BackendFailures++
            if ($BackendFailures -ge 2) {
                Write-Host ""
                Write-Host "[CRITICAL] Backend process on port 8000 has stopped!" -ForegroundColor Red
                Write-Host "--- Tail of backend.err.log ---" -ForegroundColor Yellow
                if (Test-Path $BackendErrLog) { Get-Content $BackendErrLog -Tail 20 }
                if (Test-Path $BackendOutLog) { Get-Content $BackendOutLog -Tail 10 }
                break
            }
        } else {
            $BackendFailures = 0
        }

        # Check frontend (process running AND port 5173 listening)
        $Port5173Conn = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
        $FrontendIsAlive = ($FrontendProc -and -not $FrontendProc.HasExited) -and ($Port5173Conn -ne $null)
        if (-not $FrontendIsAlive) {
            $FrontendFailures++
            if ($FrontendFailures -ge 2) {
                Write-Host ""
                Write-Host "[CRITICAL] Frontend process on port 5173 has stopped!" -ForegroundColor Red
                Write-Host "--- Tail of frontend.err.log ---" -ForegroundColor Yellow
                if (Test-Path $FrontendErrLog) { Get-Content $FrontendErrLog -Tail 20 }
                if (Test-Path $FrontendOutLog) { Get-Content $FrontendOutLog -Tail 10 }
                break
            }
        } else {
            $FrontendFailures = 0
        }
    }
} finally {
    Write-Host ""
    Write-Host "[-] Shutting down development processes (terminating entire process trees)..." -ForegroundColor Yellow
    if ($BackendProc -and -not $BackendProc.HasExited) {
        taskkill.exe /PID $BackendProc.Id /T /F 2>$null | Out-Null
        Write-Host "  ✓ Backend process tree stopped." -ForegroundColor DarkGray
    }
    if ($FrontendProc -and -not $FrontendProc.HasExited) {
        taskkill.exe /PID $FrontendProc.Id /T /F 2>$null | Out-Null
        Write-Host "  ✓ Frontend process tree stopped." -ForegroundColor DarkGray
    }
    # Double check and clean up any processes holding 8000 or 5173
    $rem8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($rem8000) { taskkill.exe /PID $rem8000.OwningProcess /T /F 2>$null | Out-Null }
    $rem5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($rem5173) { taskkill.exe /PID $rem5173.OwningProcess /T /F 2>$null | Out-Null }
    
    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] All BiasGuard development servers shut down cleanly." -ForegroundColor Green
}
