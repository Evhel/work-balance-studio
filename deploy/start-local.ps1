[CmdletBinding()]
param(
  [string]$BindAddress = "127.0.0.1",
  [int]$Port = 3000,
  [string]$SupabaseEnv = "D:\prog\ARV-Server\supabase\.env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$applicationEnv = Join-Path $repositoryRoot ".env"
$serverEntry = Join-Path $repositoryRoot ".output\server\index.mjs"

foreach ($requiredFile in @($applicationEnv, $SupabaseEnv, $serverEntry)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required file not found: $requiredFile"
  }
}

function Read-EnvironmentFile {
  param([Parameter(Mandatory)][string]$Path)

  $settings = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^(?<name>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$") {
      $settings[$Matches.name] = $Matches.value.Trim()
    }
  }
  return $settings
}

$applicationSettings = Read-EnvironmentFile -Path $applicationEnv
$supabaseSettings = Read-EnvironmentFile -Path $SupabaseEnv

$requiredApplicationSettings = @(
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY"
)
$missingApplicationSettings = @(
  $requiredApplicationSettings |
    Where-Object { -not $applicationSettings.ContainsKey($_) -or -not $applicationSettings[$_] }
)
if ($missingApplicationSettings.Count -gt 0) {
  throw "Missing application setting(s): $($missingApplicationSettings -join ', ')"
}
if (-not $supabaseSettings.ContainsKey("SERVICE_ROLE_KEY") -or -not $supabaseSettings["SERVICE_ROLE_KEY"]) {
  throw "SERVICE_ROLE_KEY is missing from $SupabaseEnv"
}

foreach ($name in $requiredApplicationSettings) {
  [Environment]::SetEnvironmentVariable($name, $applicationSettings[$name], "Process")
}
[Environment]::SetEnvironmentVariable(
  "SUPABASE_SERVICE_ROLE_KEY",
  $supabaseSettings["SERVICE_ROLE_KEY"],
  "Process"
)
[Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Process")
[Environment]::SetEnvironmentVariable("HOST", $BindAddress, "Process")
[Environment]::SetEnvironmentVariable("PORT", $Port.ToString(), "Process")

Write-Host "Starting ARV at http://${BindAddress}:$Port"
Write-Host "Press Ctrl+C to stop the application."

Push-Location $repositoryRoot
try {
  & node $serverEntry
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
