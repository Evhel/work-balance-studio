[CmdletBinding()]
param(
  [string]$BackupPath,
  [string]$ServerRoot = "D:\prog\ARV-Server",
  [switch]$FullRestoreTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$backupDirectory = [System.IO.Path]::GetFullPath((Join-Path $ServerRoot "backups"))
if (-not $BackupPath) {
  $latest = Get-ChildItem -LiteralPath $backupDirectory -Filter "arv-*.dump" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw "No ARV backups were found in $backupDirectory"
  }
  $BackupPath = $latest.FullName
}

$BackupPath = [System.IO.Path]::GetFullPath($BackupPath)
$allowedPrefix = $backupDirectory.TrimEnd("\") + "\"
if (-not $BackupPath.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup must be inside $backupDirectory"
}
if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf) -or [System.IO.Path]::GetExtension($BackupPath) -ne ".dump") {
  throw "Backup file not found or invalid: $BackupPath"
}

$startServer = Join-Path $PSScriptRoot "start-server.ps1"
$dockerPath = Join-Path $ServerRoot "DockerDesktop\resources\bin\docker.exe"
& $startServer -ServerRoot $ServerRoot -SkipApplication

$checksumPath = "$BackupPath.sha256"
if (Test-Path -LiteralPath $checksumPath -PathType Leaf) {
  $expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split "\s+")[0]
  $actualHash = (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedHash.ToLowerInvariant() -ne $actualHash) {
    throw "Backup checksum does not match: $BackupPath"
  }
  Write-Host "Checksum: PASS"
}

$token = [guid]::NewGuid().ToString("N")
$containerPath = "/tmp/arv-verify-$token.dump"
$testDatabase = "arv_restore_$($token.Substring(0, 12))"

try {
  & $dockerPath cp $BackupPath "supabase-db:$containerPath"
  if ($LASTEXITCODE -ne 0) { throw "Could not copy backup into the database container." }

  & $dockerPath exec supabase-db pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pg_restore could not read the archive." }
  Write-Host "Archive structure: PASS"

  if ($FullRestoreTest) {
    & $dockerPath exec supabase-db createdb -U supabase_admin -T template0 $testDatabase
    if ($LASTEXITCODE -ne 0) { throw "Could not create temporary restore database." }

    & $dockerPath exec supabase-db pg_restore `
      --exit-on-error `
      --no-owner `
      --no-privileges `
      -U supabase_admin `
      -d $testDatabase `
      $containerPath
    if ($LASTEXITCODE -ne 0) { throw "Full restore test failed." }

    & $dockerPath exec supabase-db psql -U supabase_admin -d $testDatabase -Atc `
      "select 'auth_users='||(select count(*) from auth.users)||',app_records='||(select count(*) from public.app_records);"
    if ($LASTEXITCODE -ne 0) { throw "Could not query the restored test database." }
    Write-Host "Full isolated restore: PASS"
  }
}
finally {
  if ($FullRestoreTest) {
    & $dockerPath exec supabase-db dropdb --if-exists --force -U supabase_admin $testDatabase 2>$null | Out-Null
  }
  & $dockerPath exec supabase-db rm -f $containerPath 2>$null | Out-Null
}

Write-Host "Backup verification completed without changing the live database."
