[CmdletBinding()]
param(
  [string]$ServerRoot = "D:\prog\ARV-Server",
  [string]$BackupDirectory,
  [int]$RetentionDays = 14
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($RetentionDays -lt 1) {
  throw "RetentionDays must be at least 1."
}
if (-not $BackupDirectory) {
  $BackupDirectory = Join-Path $ServerRoot "backups"
}

$dockerPath = Join-Path $ServerRoot "DockerDesktop\resources\bin\docker.exe"
$startServer = Join-Path $PSScriptRoot "start-server.ps1"
foreach ($requiredFile in @($dockerPath, $startServer)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required file not found: $requiredFile"
  }
}
if (-not (Test-Path -LiteralPath $BackupDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $BackupDirectory | Out-Null
}

& $startServer -ServerRoot $ServerRoot -SkipApplication

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "arv-$stamp.dump"
$finalPath = Join-Path $BackupDirectory $fileName
$partialPath = "$finalPath.partial"
$checksumPath = "$finalPath.sha256"
$containerPath = "/tmp/$fileName"

if (Test-Path -LiteralPath $partialPath) {
  Remove-Item -LiteralPath $partialPath -Force
}

try {
  & $dockerPath exec supabase-db pg_dump `
    -U postgres `
    -d postgres `
    --format=custom `
    --compress=6 `
    --no-owner `
    --no-privileges `
    --file=$containerPath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE."
  }

  & $dockerPath exec supabase-db pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "The new database archive could not be read by pg_restore."
  }

  & $dockerPath cp "supabase-db:$containerPath" $partialPath
  if ($LASTEXITCODE -ne 0) {
    throw "Could not copy the database archive from the container."
  }

  Move-Item -LiteralPath $partialPath -Destination $finalPath
  $hash = (Get-FileHash -LiteralPath $finalPath -Algorithm SHA256).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText($checksumPath, "$hash  $fileName`r`n")
}
finally {
  & $dockerPath exec supabase-db rm -f $containerPath 2>$null | Out-Null
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
$deleted = 0
Get-ChildItem -LiteralPath $BackupDirectory -Filter "arv-*.dump" -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    $oldBackup = $_.FullName
    $oldChecksum = "$oldBackup.sha256"
    Remove-Item -LiteralPath $oldBackup -Force
    if (Test-Path -LiteralPath $oldChecksum -PathType Leaf) {
      Remove-Item -LiteralPath $oldChecksum -Force
    }
    $deleted++
  }

$sizeMb = [Math]::Round((Get-Item -LiteralPath $finalPath).Length / 1MB, 2)
Write-Host "Backup created and verified: $finalPath ($sizeMb MB)"
Write-Host "Retention: $RetentionDays days; old backups removed: $deleted"
