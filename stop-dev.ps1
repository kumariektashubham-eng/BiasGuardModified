# ==============================================================================
# BiasGuard AI - Development Environment Teardown Script
# ==============================================================================
# Gracefully stops only the development processes started for BiasGuard AI:
# FastAPI backend (port 8000), Vite frontend (port 5173), and cloudflared tunnel.
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
        if ($data.WatchdogPID -and $data.WatchdogPID -ne $PID) {
            Write-Host "[-] Stopping start-dev watchdog loop (PID $($data.WatchdogPID))..." -NoNewline
            taskkill.exe /PID $data.WatchdogPID /T /F 2>$null | Out-Null
            Write-Host " [STOPPED]" -ForegroundColor Green
            $StoppedAny = $true
        }
        if ($data.CloudflaredPID) {
            Write-Host "[-] Stopping Cloudflare Tunnel (PID $($data.CloudflaredPID))..." -NoNewline
            taskkill.exe /PID $data.CloudflaredPID /T /F 2>$null | Out-Null
            Write-Host " [STOPPED]" -ForegroundColor Green
            $StoppedAny = $true
        }
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

# 2. Safety check: Stop any lingering start-dev.ps1 watchdog or cloudflared tunnel
try {
    $psWatchdogs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue
    foreach ($pw in $psWatchdogs) {
        if ($pw.ProcessId -ne $PID -and $pw.CommandLine -match 'start-dev\.ps1') {
            Write-Host "[-] Stopping lingering start-dev.ps1 watchdog (PID $($pw.ProcessId))..." -NoNewline
            taskkill.exe /PID $pw.ProcessId /T /F 2>$null | Out-Null
            Write-Host " [STOPPED]" -ForegroundColor Green
        }
    }
    $cfProcs = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
    foreach ($cf in $cfProcs) {
        if ($cf.CommandLine -match 'localhost:5173|127\.0\.0\.1:5173') {
            Write-Host "[-] Stopping lingering cloudflared tunnel (PID $($cf.ProcessId))..." -NoNewline
            taskkill.exe /PID $cf.ProcessId /T /F 2>$null | Out-Null
            Write-Host " [STOPPED]" -ForegroundColor Green
        }
    }
} catch {}

# Clear stale PUBLIC_BASE_URL from backend/.env on clean stop
$BackendEnvFile = Join-Path $ProjectRoot "backend\.env"
if (Test-Path $BackendEnvFile) {
    try {
        $lines = Get-Content -Path $BackendEnvFile -Encoding UTF8
        $updated = @()
        foreach ($line in $lines) {
            if ($line -match '^\s*PUBLIC_BASE_URL\s*=') {
                $updated += "PUBLIC_BASE_URL="
            } else {
                $updated += $line
            }
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($BackendEnvFile, $updated, $utf8NoBom)
    } catch {}
}

# 3. Safety check: Check if ports 8000 or 5173 are still held by dev processes (kill tree)
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

# 4. Verify ports are now free
Start-Sleep -Milliseconds 500
$rem8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
$rem5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue

Write-Host ""
if (-not $rem8000 -and -not $rem5173) {
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Ports 8000 & 5173 are free and cloudflared is stopped." -ForegroundColor Green
    Write-Host " BiasGuard AI development servers are stopped." -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host "======================================================================" -ForegroundColor Yellow
    if ($rem8000) { Write-Host " [NOTICE] Port 8000 still in use by PID $($rem8000.OwningProcess)" -ForegroundColor Yellow }
    if ($rem5173) { Write-Host " [NOTICE] Port 5173 still in use by PID $($rem5173.OwningProcess)" -ForegroundColor Yellow }
    Write-Host "======================================================================" -ForegroundColor Yellow
}
Write-Host ""
