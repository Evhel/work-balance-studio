[CmdletBinding()]
param([string]$ServerRoot = "D:\prog\ARV-Server")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$supabaseEnv = Join-Path $ServerRoot "supabase\.env"
$dockerPath = Join-Path $ServerRoot "DockerDesktop\resources\bin\docker.exe"
$backupDirectory = Join-Path $ServerRoot "backups"
$settings = @{}
foreach ($line in Get-Content -LiteralPath $supabaseEnv) {
  if ($line -match "^(?<name>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$") {
    $settings[$Matches.name] = $Matches.value.Trim()
  }
}

$siteUrl = $settings["SITE_URL"]
$siteStatus = "stopped"
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 5
  if ($response.StatusCode -eq 200) { $siteStatus = "running (HTTP 200)" }
}
catch {}

Write-Host "Site: $siteStatus"
Write-Host "Address: $siteUrl"

if (Test-Path -LiteralPath $dockerPath -PathType Leaf) {
  $containers = @(& $dockerPath ps --filter "name=supabase-" --format "{{.Names}}: {{.Status}}" 2>$null)
  if ($LASTEXITCODE -eq 0 -and $containers.Count -gt 0) {
    Write-Host "Supabase containers:"
    $containers | ForEach-Object { Write-Host "- $_" }
  }
  else {
    Write-Host "Supabase containers: stopped or Docker is not ready"
  }
}

$latestBackup = Get-ChildItem -LiteralPath $backupDirectory -Filter "arv-*.dump" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($latestBackup) {
  Write-Host "Latest backup: $($latestBackup.FullName) ($($latestBackup.LastWriteTime))"
}
else {
  Write-Host "Latest backup: none"
}

if ($siteStatus -eq "stopped") { exit 1 }
