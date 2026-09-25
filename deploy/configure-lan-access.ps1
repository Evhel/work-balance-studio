[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$LanAddress,
  [int]$ApplicationPort = 3000,
  [int]$SupabasePort = 8000,
  [ValidateRange(30, 1800)]
  [int]$StartupTimeoutSeconds = 300,
  [string]$SupabaseDirectory = "D:\prog\ARV-Server\supabase",
  [string]$DockerPath = "D:\prog\ARV-Server\DockerDesktop\resources\bin\docker.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$parsedAddress = $null
if (
  -not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$parsedAddress) -or
  $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
  [System.Net.IPAddress]::IsLoopback($parsedAddress) -or
  $LanAddress -eq "0.0.0.0"
) {
  throw "LanAddress must be a specific non-loopback IPv4 address: $LanAddress"
}

foreach ($port in @($ApplicationPort, $SupabasePort)) {
  if ($port -lt 1 -or $port -gt 65535) {
    throw "Port must be between 1 and 65535: $port"
  }
}

$supabaseEnv = Join-Path $SupabaseDirectory ".env"
$baseCompose = Join-Path $SupabaseDirectory "docker-compose.yml"
$localCompose = Join-Path $SupabaseDirectory "docker-compose.stage3-local.yml"
$lanCompose = Join-Path $PSScriptRoot "docker-compose.lan.yml"
$configureApplication = Join-Path $PSScriptRoot "configure-local-env.ps1"

foreach ($requiredFile in @(
  $supabaseEnv,
  $baseCompose,
  $localCompose,
  $lanCompose,
  $configureApplication,
  $DockerPath
)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required file not found: $requiredFile"
  }
}

function Set-EnvironmentValue {
  param(
    [Parameter(Mandatory)][AllowEmptyString()][string[]]$Lines,
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Value
  )

  if ($Value -match "[`r`n]") {
    throw "Environment value must not contain line breaks: $Name"
  }

  $result = [System.Collections.Generic.List[string]]::new()
  $replaced = $false
  foreach ($line in $Lines) {
    if ($line -match "^$([regex]::Escape($Name))=") {
      if (-not $replaced) {
        $result.Add("$Name=$Value")
        $replaced = $true
      }
      continue
    }
    $result.Add($line)
  }
  if (-not $replaced) {
    $result.Add("$Name=$Value")
  }
  return $result.ToArray()
}

$siteOrigin = "http://${LanAddress}:$ApplicationPort"
$supabaseOrigin = "http://${LanAddress}:$SupabasePort"
$redirectOrigins = @(
  "http://localhost:$ApplicationPort",
  "http://127.0.0.1:$ApplicationPort",
  $siteOrigin
) -join ","

$environmentLines = @(Get-Content -LiteralPath $supabaseEnv)
$environmentLines = Set-EnvironmentValue -Lines $environmentLines -Name "SUPABASE_PUBLIC_URL" -Value $supabaseOrigin
$environmentLines = Set-EnvironmentValue -Lines $environmentLines -Name "API_EXTERNAL_URL" -Value "$supabaseOrigin/auth/v1"
$environmentLines = Set-EnvironmentValue -Lines $environmentLines -Name "SITE_URL" -Value $siteOrigin
$environmentLines = Set-EnvironmentValue -Lines $environmentLines -Name "ADDITIONAL_REDIRECT_URLS" -Value $redirectOrigins

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($supabaseEnv, $environmentLines, $utf8WithoutBom)

& $configureApplication -SupabaseUrl $supabaseOrigin -SupabaseEnv $supabaseEnv -Port $ApplicationPort

$previousLanAddress = $env:ARV_LAN_IP
try {
  $env:ARV_LAN_IP = $LanAddress

  # Start PostgreSQL first. After Docker Desktop itself has just started,
  # crash recovery can take longer than Compose's health-check retry window.
  # Waiting here prevents the rest of the stack from failing on a temporary
  # `supabase-db is unhealthy` status.
  Write-Host "Starting the local database..."
  & $DockerPath compose `
    --project-directory $SupabaseDirectory `
    -f $baseCompose `
    -f $localCompose `
    -f $lanCompose `
    up -d db
  if ($LASTEXITCODE -ne 0) {
    throw "Local database startup failed with exit code $LASTEXITCODE."
  }

  $databaseDeadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  $lastDatabaseState = $null
  do {
    $databaseState = [string](& $DockerPath inspect `
      --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" `
      supabase-db 2>$null)
    $inspectExitCode = $LASTEXITCODE

    if ($inspectExitCode -eq 0 -and $databaseState.Trim() -eq "healthy") {
      Write-Host "Local database is ready."
      break
    }

    if ($databaseState -ne $lastDatabaseState -and -not [string]::IsNullOrWhiteSpace($databaseState)) {
      Write-Host "Waiting for the local database (status: $($databaseState.Trim()))..."
      $lastDatabaseState = $databaseState
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $databaseDeadline)

  if ($inspectExitCode -ne 0 -or $databaseState.Trim() -ne "healthy") {
    throw "Local database did not become healthy within $StartupTimeoutSeconds seconds. No data was deleted."
  }

  Write-Host "Starting the remaining Supabase services..."
  & $DockerPath compose `
    --project-directory $SupabaseDirectory `
    -f $baseCompose `
    -f $localCompose `
    -f $lanCompose `
    up -d
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase LAN configuration failed with exit code $LASTEXITCODE."
  }
}
finally {
  $env:ARV_LAN_IP = $previousLanAddress
}

Write-Host "LAN configuration applied."
Write-Host "Site: $siteOrigin"
Write-Host "Supabase API: $supabaseOrigin"
Write-Host "PostgreSQL ports remain bound to 127.0.0.1."
