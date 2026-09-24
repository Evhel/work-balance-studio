[CmdletBinding()]
param(
  [string]$Container = "supabase-db",
  [string]$Database = "postgres",
  [string]$DatabaseUser = "postgres",
  [string]$DockerPath,
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-DockerPath {
  if ($DockerPath) {
    if (-not (Test-Path -LiteralPath $DockerPath -PathType Leaf)) {
      throw "Docker executable not found: $DockerPath"
    }
    return (Resolve-Path -LiteralPath $DockerPath).Path
  }

  $command = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    "D:\prog\ARV-Server\DockerDesktop\resources\bin\docker.exe",
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  throw "Docker CLI not found. Start Docker Desktop or pass -DockerPath."
}

$script:DockerExe = Resolve-DockerPath

function Invoke-Docker {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,
    [switch]$PassThru
  )

  # Windows PowerShell 5.1 converts any native stderr line (including harmless
  # PostgreSQL NOTICE messages) into an ErrorRecord when ErrorActionPreference
  # is Stop. Judge native commands by their exit code instead.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & $script:DockerExe @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    $details = $output -join [Environment]::NewLine
    throw "Docker command failed: docker $($Arguments -join ' ')`n$details"
  }

  if ($PassThru) {
    return $output
  }
}

function Invoke-Psql {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,
    [switch]$PassThru
  )

  $dockerArguments = @(
    "exec", $Container,
    "psql", "-U", $DatabaseUser, "-d", $Database,
    "-v", "ON_ERROR_STOP=1"
  ) + $Arguments

  return Invoke-Docker -Arguments $dockerArguments -PassThru:$PassThru
}

function Get-MigrationHash {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  # Git may check the same text out as LF or CRLF on different systems. Hash
  # canonical UTF-8/LF content so an unchanged migration stays unchanged.
  $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
  $text = $utf8.GetString([System.IO.File]::ReadAllBytes($Path))
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
    $text = $text.Substring(1)
  }
  $normalized = $text.Replace("`r`n", "`n").Replace("`r", "`n")

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha256.ComputeHash($utf8.GetBytes($normalized))
  }
  finally {
    $sha256.Dispose()
  }

  return (($hashBytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

$runningOutput = Invoke-Docker -Arguments @(
  "inspect", "--format", "{{.State.Running}}", $Container
) -PassThru
$running = ($runningOutput -join "`n").Trim()
if ($running -ne "true") {
  throw "Container '$Container' is not running."
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$migrationDirectory = Join-Path $repositoryRoot "supabase\migrations"
$migrationFiles = Get-ChildItem -LiteralPath $migrationDirectory -Filter "*.sql" -File |
  Sort-Object Name

if (-not $migrationFiles) {
  throw "No SQL migrations found in $migrationDirectory"
}

$migrations = foreach ($file in $migrationFiles) {
  if ($file.BaseName -notmatch "^(?<version>[0-9]{14})_(?<name>[A-Za-z0-9_-]+)$") {
    throw "Invalid migration filename: $($file.Name)"
  }

  [pscustomobject]@{
    Version = $Matches.version
    Name = $Matches.name
    Path = $file.FullName
    Hash = Get-MigrationHash -Path $file.FullName
    RemotePath = "/tmp/arv-migration-$($Matches.version).sql"
  }
}

$tableCheck = Invoke-Psql -Arguments @(
  "-tAc", "SELECT to_regclass('arv_migrations.applied_migrations') IS NOT NULL;"
) -PassThru
$historyExists = (($tableCheck -join "`n").Trim() -eq "t")
$applied = @{}

if ($historyExists) {
  $historyRows = Invoke-Psql -Arguments @(
    "-tAc", "SELECT version || '|' || sha256 FROM arv_migrations.applied_migrations ORDER BY version;"
  ) -PassThru

  foreach ($row in $historyRows) {
    if ($row -match "^(?<version>[0-9]{14})\|(?<hash>[0-9a-f]{64})$") {
      $applied[$Matches.version] = $Matches.hash
    }
  }
}

$pending = @()
foreach ($migration in $migrations) {
  if ($applied.ContainsKey($migration.Version)) {
    if ($applied[$migration.Version] -ne $migration.Hash) {
      throw "Applied migration $($migration.Version) was modified. Restore the committed SQL file."
    }
    Write-Host "Already applied: $($migration.Version)_$($migration.Name)"
  }
  else {
    $pending += $migration
  }
}

if ($pending.Count -eq 0) {
  Write-Host "No pending migrations."
  exit 0
}

$copiedPaths = @()
try {
  foreach ($migration in $pending) {
    Invoke-Docker -Arguments @(
      "cp", $migration.Path, "${Container}:$($migration.RemotePath)"
    )
    $copiedPaths += $migration.RemotePath
  }

  $validationArguments = @("-c", "BEGIN;")
  foreach ($migration in $pending) {
    $validationArguments += @("-f", $migration.RemotePath)
  }
  $validationArguments += @("-c", "ROLLBACK;")

  Invoke-Psql -Arguments $validationArguments
  Write-Host "Validation passed for $($pending.Count) migration(s)."

  if ($ValidateOnly) {
    Write-Host "Validation only: database changes were rolled back."
    exit 0
  }

  $bootstrapSql = @"
CREATE SCHEMA IF NOT EXISTS arv_migrations;
REVOKE ALL ON SCHEMA arv_migrations FROM PUBLIC;
CREATE TABLE IF NOT EXISTS arv_migrations.applied_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE arv_migrations.applied_migrations FROM PUBLIC;
"@
  Invoke-Psql -Arguments @("-c", $bootstrapSql)

  foreach ($migration in $pending) {
    $insertSql = "INSERT INTO arv_migrations.applied_migrations (version, name, sha256) VALUES ('$($migration.Version)', '$($migration.Name)', '$($migration.Hash)');"
    Invoke-Psql -Arguments @(
      "--single-transaction",
      "-f", $migration.RemotePath,
      "-c", $insertSql
    )
    Write-Host "Applied: $($migration.Version)_$($migration.Name)"
  }
}
finally {
  if ($copiedPaths.Count -gt 0) {
    & $script:DockerExe exec $Container rm -f @copiedPaths 2>&1 | Out-Null
  }
}

Write-Host "All migrations applied successfully."
