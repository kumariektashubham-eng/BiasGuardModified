# ==============================================================================
# BiasGuard AI - Development Environment Teardown Script
# ==============================================================================
# Gracefully stops only the development processes started for BiasGuard AI.
# Releases ports 8000 and 5173 safely without terminating unrelated system processes.
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) {
    $ProjectRoot = (Get-Location).Path
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "          Stopping BiasGuard AI Development Servers                   " -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow

$PidFile = Join-Path $ProjectRoot ".dev-pids.json"
$StoppedAny = $false

# 1. Stop by recorded PIDs (killing entire process tree)
if (Test-Path $PidFile) {
    try {
        $data = Get-Content $PidFile -Raw | ConvertFrom-Json
        if ($data.BackendPID) {
            Write-Host "[-] Stopping backend process tree (PID $($data.BackendPID))..." -NoNewline
            taskkill.exe /PID $data.BackendPID /T /F 2>$null | Out-Null
            Write-Host " [STOPPED]" -ForegroundColor Green
            $StoppedAny = $true
        }
        if ($data.FrontendPID) {
            Write-Host "[-] Stopping frontend process tree (PID $($data.FrontendPID))..." -NoNewline
            taskkill.exe /PID $data.FrontendPID /T /F 2>$null | Out-Null
            Write-Host " [STOPPED]" -ForegroundColor Green
            $StoppedAny = $true
        }
    } catch {
        Write-Host "[WARN] Could not parse $PidFile" -ForegroundColor DarkGray
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# 2. Safety check: Check if ports 8000 or 5173 are still held by dev processes (kill tree)
function Stop-PortProcess([int]$Port, [string]$Label, [string]$Pattern) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -match $Pattern) {
            Write-Host "[-] Stopping $Label on port $Port (PID $($proc.Id), $($proc.ProcessName))..." -NoNewline
            taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null
            Write-Host " [STOPPED]" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[WARN] Port $Port is in use by unrelated process $($proc.ProcessName) (PID $($proc.Id)). Left untouched." -ForegroundColor Yellow
        }
    }
    return $false
}

$bStopped = Stop-PortProcess 8000 "FastAPI backend" "python|uvicorn"
$fStopped = Stop-PortProcess 5173 "Vite frontend" "node|cmd|powershell"

# 3. Verify ports are now free
Start-Sleep -Milliseconds 500
$rem8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
$rem5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue

Write-Host ""
if (-not $rem8000 -and -not $rem5173) {
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Ports 8000 and 5173 are completely free." -ForegroundColor Green
    Write-Host " BiasGuard AI development servers are stopped." -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host "======================================================================" -ForegroundColor Yellow
    if ($rem8000) { Write-Host " [NOTICE] Port 8000 still in use by PID $($rem8000.OwningProcess)" -ForegroundColor Yellow }
    if ($rem5173) { Write-Host " [NOTICE] Port 5173 still in use by PID $($rem5173.OwningProcess)" -ForegroundColor Yellow }
    Write-Host "======================================================================" -ForegroundColor Yellow
}
Write-Host ""
