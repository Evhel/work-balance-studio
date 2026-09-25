[CmdletBinding()]
param(
  [int]$ApplicationPort = 3000,
  [string]$ServerRoot = "D:\prog\ARV-Server",
  [switch]$KeepDatabase
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$serverEntry = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot ".output\server\index.mjs"))
$pidFile = Join-Path $ServerRoot "arv-app.pid"
$dockerPath = Join-Path $ServerRoot "DockerDesktop\resources\bin\docker.exe"
$supabaseDirectory = Join-Path $ServerRoot "supabase"
$supabaseEnv = Join-Path $supabaseDirectory ".env"
$baseCompose = Join-Path $supabaseDirectory "docker-compose.yml"
$localCompose = Join-Path $supabaseDirectory "docker-compose.stage3-local.yml"
$lanCompose = Join-Path $PSScriptRoot "docker-compose.lan.yml"

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $ApplicationPort -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if (-not $process -or $process.Name -ne "node.exe" -or [string]$process.CommandLine -notlike "*$serverEntry*") {
    throw "Refusing to stop unknown process on port $ApplicationPort (PID $($listener.OwningProcess))."
  }
  Stop-Process -Id $listener.OwningProcess -Force
  Write-Host "Application process stopped."
}

if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force
}

if (-not $KeepDatabase -and (Test-Path -LiteralPath $dockerPath -PathType Leaf)) {
  $lanAddress = $null
  foreach ($line in Get-Content -LiteralPath $supabaseEnv) {
    if ($line -match "^SUPABASE_PUBLIC_URL=http://(?<address>[0-9.]+):[0-9]+$") {
      $lanAddress = $Matches.address
      break
    }
  }
  if (-not $lanAddress) {
    throw "Could not read the configured LAN address from $supabaseEnv"
  }

  $previousLanAddress = $env:ARV_LAN_IP
  try {
    $env:ARV_LAN_IP = $lanAddress
    & $dockerPath compose `
      --project-directory $supabaseDirectory `
      -f $baseCompose `
      -f $localCompose `
      -f $lanCompose `
      stop
    if ($LASTEXITCODE -ne 0) {
      throw "Could not stop Supabase containers (exit code $LASTEXITCODE)."
    }
  }
  finally {
    $env:ARV_LAN_IP = $previousLanAddress
  }
  Write-Host "Local database and API stopped safely. Data remains on disk."
}

if ($listeners.Count -eq 0) {
  Write-Host "The ARV application was not running."
}
