[CmdletBinding()]
param(
  [string]$LanAddress,
  [int]$ApplicationPort = 3000,
  [int]$SupabasePort = 8000,
  [string]$ServerRoot = "D:\prog\ARV-Server",
  [int]$DockerTimeoutSeconds = 180,
  [ValidateRange(30, 1800)]
  [int]$SupabaseTimeoutSeconds = 300,
  [switch]$SkipApplication,
  [switch]$RestartApplication
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$dockerPath = Join-Path $ServerRoot "DockerDesktop\resources\bin\docker.exe"
$dockerDesktopPath = Join-Path $ServerRoot "DockerDesktop\Docker Desktop.exe"
$configureLan = Join-Path $PSScriptRoot "configure-lan-access.ps1"
$startLocal = Join-Path $PSScriptRoot "start-local.ps1"
$serverEntry = Join-Path $repositoryRoot ".output\server\index.mjs"
$logsDirectory = Join-Path $ServerRoot "logs"
$pidFile = Join-Path $ServerRoot "arv-app.pid"

foreach ($requiredFile in @($dockerPath, $dockerDesktopPath, $configureLan)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required file not found: $requiredFile"
  }
}

function Get-OfficeLanAddress {
  $configurations = @(
    Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object {
        $_.IPv4DefaultGateway -and
        $_.NetAdapter.Status -eq "Up" -and
        $_.InterfaceAlias -notmatch "(?i)vpn|tun|tap|wsl|vethernet"
      }
  )

  foreach ($configuration in $configurations) {
    foreach ($address in @($configuration.IPv4Address.IPAddress)) {
      if ($address -match "^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)") {
        return $address
      }
    }
  }
  throw "Could not determine the office IPv4 address. Pass -LanAddress explicitly."
}

function Test-DockerEngine {
  try {
    $result = & $dockerPath info --format "{{.ServerVersion}}" 2>$null
    return $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$result)
  }
  catch {
    return $false
  }
}

function Test-ArvNodeProcess {
  param([Parameter(Mandatory)][int]$ProcessId)

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $process -or $process.Name -ne "node.exe") {
    return $false
  }
  $expectedEntry = [System.IO.Path]::GetFullPath($serverEntry)
  return [string]$process.CommandLine -like "*$expectedEntry*"
}

if (-not $LanAddress) {
  $LanAddress = Get-OfficeLanAddress
}

if (-not (Test-DockerEngine)) {
  Write-Host "Starting Docker Desktop..."
  Start-Process -FilePath $dockerDesktopPath -ArgumentList "--minimized" -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds($DockerTimeoutSeconds)
  do {
    Start-Sleep -Seconds 2
    if (Test-DockerEngine) { break }
  } while ((Get-Date) -lt $deadline)

  if (-not (Test-DockerEngine)) {
    throw "Docker Desktop did not become ready within $DockerTimeoutSeconds seconds."
  }
}

Write-Host "Starting local database and API on $LanAddress..."
& $configureLan `
  -LanAddress $LanAddress `
  -ApplicationPort $ApplicationPort `
  -SupabasePort $SupabasePort `
  -StartupTimeoutSeconds $SupabaseTimeoutSeconds `
  -SupabaseDirectory (Join-Path $ServerRoot "supabase") `
  -DockerPath $dockerPath

if ($SkipApplication) {
  Write-Host "Database and API are ready."
  exit 0
}

foreach ($requiredFile in @($startLocal, $serverEntry)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Application build is missing: $requiredFile. Run npm run build after an update."
  }
}

$siteUrl = "http://${LanAddress}:$ApplicationPort"
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $ApplicationPort -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
  $isArv = Test-ArvNodeProcess -ProcessId $listener.OwningProcess
  if (-not $isArv) {
    throw "Port $ApplicationPort is already used by an unknown process (PID $($listener.OwningProcess))."
  }

  if (-not $RestartApplication -and $listener.LocalAddress -eq $LanAddress) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        [System.IO.File]::WriteAllText($pidFile, [string]$listener.OwningProcess)
        Write-Host "ARV is already running: $siteUrl"
        exit 0
      }
    }
    catch {
      # The known ARV process is unhealthy and will be restarted below.
    }
  }

  Write-Host "Stopping the previous ARV process..."
  Stop-Process -Id $listener.OwningProcess -Force
  Start-Sleep -Seconds 1
}

if (-not (Test-Path -LiteralPath $logsDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $logsDirectory | Out-Null
}
Get-ChildItem -LiteralPath $logsDirectory -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$standardLog = Join-Path $logsDirectory "arv-$stamp.log"
$errorLog = Join-Path $logsDirectory "arv-$stamp.error.log"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startLocal`" -BindAddress `"$LanAddress`" -Port $ApplicationPort"
$launcher = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList $arguments `
  -WorkingDirectory $repositoryRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $standardLog `
  -RedirectStandardError $errorLog `
  -PassThru

$deadline = (Get-Date).AddSeconds(60)
do {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      $listener = Get-NetTCPConnection -State Listen -LocalAddress $LanAddress `
        -LocalPort $ApplicationPort -ErrorAction Stop | Select-Object -First 1
      if (-not (Test-ArvNodeProcess -ProcessId $listener.OwningProcess)) {
        throw "The process listening on $siteUrl is not the expected ARV process."
      }
      [System.IO.File]::WriteAllText($pidFile, [string]$listener.OwningProcess)
      Write-Host "ARV started successfully: $siteUrl"
      Write-Host "Log: $standardLog"
      exit 0
    }
  }
  catch {
    if ($launcher.HasExited) {
      throw "ARV stopped during startup. Check $errorLog"
    }
  }
} while ((Get-Date) -lt $deadline)

if (-not $launcher.HasExited) {
  Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
}
throw "ARV did not respond within 60 seconds. Check $errorLog"
