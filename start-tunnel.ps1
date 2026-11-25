<#
.SYNOPSIS
    Starts a Cloudflare quick-tunnel for BiasGuard AI and syncs the public URL.
.DESCRIPTION
    Launches cloudflared tunnel pointing to Vite (port 5173), extracts the active
    trycloudflare.com URL, and updates PUBLIC_BASE_URL in backend/.env.
#>

[CmdletBinding()]
param(
    [int]$LocalPort = 5173
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         BiasGuard AI - Cloudflare Tunnel Starter           " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Locate cloudflared binary
$Cloudflared = Get-Command "cloudflared" -ErrorAction SilentlyContinue
if (-not $Cloudflared) {
    # Check common installation locations
    $CommonPaths = @(
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_*\cloudflared.exe",
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "$env:ProgramData\chocolatey\bin\cloudflared.exe",
        "$PSScriptRoot\cloudflared.exe"
    )
    foreach ($Path in $CommonPaths) {
        $Resolved = Resolve-Path $Path -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($Resolved -and (Test-Path $Resolved.Path)) {
            $Cloudflared = $Resolved.Path
            break
        }
    }
} else {
    $Cloudflared = $Cloudflared.Source
}

if (-not $Cloudflared) {
    Write-Host "[ERROR] 'cloudflared' command-line tool was not found on your system." -ForegroundColor Red
    Write-Host ""
    Write-Host "To install cloudflared on Windows, run one of the following:" -ForegroundColor Yellow
    Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor White
    Write-Host "  choco install cloudflared" -ForegroundColor White
    Write-Host "Or download the binary directly from:" -ForegroundColor White
    Write-Host "  https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "[OK] Located cloudflared at: $Cloudflared" -ForegroundColor Green
Write-Host "[...] Starting quick tunnel pointing to http://localhost:$LocalPort ..." -ForegroundColor Yellow

$LogFile = Join-Path $PSScriptRoot ".tunnel-log.txt"
if (Test-Path $LogFile) { Remove-Item $LogFile -Force -ErrorAction SilentlyContinue }

# Start cloudflared process in background
$Process = Start-Process -FilePath $Cloudflared `
    -ArgumentList "tunnel", "--url", "http://localhost:$LocalPort" `
    -RedirectStandardError $LogFile `
    -PassThru -NoNewWindow

Write-Host "[...] Waiting for Cloudflare tunnel URL to be assigned (PID: $($Process.Id))..." -ForegroundColor Cyan

$TunnelUrl = $null
$MaxAttempts = 30
for ($i = 0; $i -lt $MaxAttempts; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $LogFile) {
        $Content = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
        if ($Content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $TunnelUrl = $Matches[0]
            break
        }
    }
    if ($Process.HasExited) {
        Write-Host "[ERROR] cloudflared process exited unexpectedly." -ForegroundColor Red
        if (Test-Path $LogFile) {
            Get-Content $LogFile | Select-Object -Last 10 | Write-Host -ForegroundColor DarkGray
        }
        exit 1
    }
}

if (-not $TunnelUrl) {
    Write-Host "[ERROR] Timed out waiting for trycloudflare.com URL." -ForegroundColor Red
    if (Test-Path $LogFile) {
        Get-Content $LogFile | Select-Object -Last 10 | Write-Host -ForegroundColor DarkGray
    }
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  TUNNEL ACTIVE: $TunnelUrl" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

# Update PUBLIC_BASE_URL in backend/.env
$EnvFile = Join-Path $PSScriptRoot "backend\.env"
if (Test-Path $EnvFile) {
    $EnvContent = Get-Content $EnvFile -Raw
    if ($EnvContent -match '(?m)^PUBLIC_BASE_URL=.*$') {
        $Updated = $EnvContent -replace '(?m)^PUBLIC_BASE_URL=.*$', "PUBLIC_BASE_URL=$TunnelUrl"
    } elseif ($EnvContent -match '(?m)^#\s*PUBLIC_BASE_URL=.*$') {
        $Updated = $EnvContent -replace '(?m)^#\s*PUBLIC_BASE_URL=.*$', "PUBLIC_BASE_URL=$TunnelUrl"
    } else {
        $Updated = $EnvContent.TrimEnd() + "`r`nPUBLIC_BASE_URL=$TunnelUrl`r`n"
    }
    [System.IO.File]::WriteAllText($EnvFile, $Updated, [System.Text.Encoding]::UTF8)
    Write-Host "[OK] Updated PUBLIC_BASE_URL in backend\.env" -ForegroundColor Green
}

Write-Host ""
Write-Host "HOW TO USE THIS TUNNEL:" -ForegroundColor Cyan
Write-Host "1. Open $TunnelUrl in your browser (as Interviewer)." -ForegroundColor White
Write-Host "2. Every invitation email or copied link will automatically use this URL." -ForegroundColor White
Write-Host "3. Candidates opening the link on their mobile phones will connect directly." -ForegroundColor White
Write-Host ""
Write-Host "Keep this PowerShell window open to maintain the tunnel active." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the tunnel when finished." -ForegroundColor DarkGray

try {
    $Process.WaitForExit()
} finally {
    if (-not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
}
