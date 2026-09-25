[CmdletBinding()]
param(
  [string]$ServerRoot = "D:\prog\ARV-Server",
  [string]$RepositoryRoot,
  [switch]$RebuildCurrent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RepositoryRoot) {
  $RepositoryRoot = Split-Path -Parent $PSScriptRoot
}
$RepositoryRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
$gitPath = (Get-Command git.exe -ErrorAction Stop).Source
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$backupScript = Join-Path $PSScriptRoot "backup-database.ps1"
$stopScript = Join-Path $PSScriptRoot "stop-server.ps1"
$startScript = Join-Path $PSScriptRoot "start-server.ps1"
$migrationScript = Join-Path $PSScriptRoot "apply-migrations.ps1"
$applicationOutput = Join-Path $RepositoryRoot ".output"
$releasesDirectory = Join-Path $ServerRoot "releases"
$supabaseEnv = Join-Path $ServerRoot "supabase\.env"
$previousOutput = $null
$failedOutput = $null
$outputMoved = $false

foreach ($requiredFile in @($backupScript, $stopScript, $startScript, $migrationScript)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required file not found: $requiredFile"
  }
}

function Invoke-Git {
  param([Parameter(Mandatory)][string[]]$Arguments, [switch]$PassThru)

  $output = & $gitPath -c "safe.directory=$($RepositoryRoot.Replace('\','/'))" `
    -C $RepositoryRoot @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
  }
  if ($PassThru) { return $output }
}

function Restore-PreviousApplication {
  if (-not $outputMoved -or -not $previousOutput -or -not (Test-Path -LiteralPath $previousOutput)) {
    return
  }

  if (Test-Path -LiteralPath $applicationOutput) {
    $failedOutput = Join-Path $releasesDirectory "failed-output-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item -LiteralPath $applicationOutput -Destination $failedOutput
  }
  Move-Item -LiteralPath $previousOutput -Destination $applicationOutput
  $script:outputMoved = $false
  Write-Warning "The previous application build was restored."
}

$branch = (Invoke-Git -Arguments @("branch", "--show-current") -PassThru | Select-Object -First 1).Trim()
if ($branch -ne "main") {
  throw "Updates can only run from the main branch. Current branch: $branch"
}
$changes = @(Invoke-Git -Arguments @("status", "--porcelain") -PassThru)
if ($changes.Count -gt 0) {
  throw "The project contains uncommitted changes. Ask Codex to review them before updating."
}

Write-Host "Checking GitHub/Lovable..."
Invoke-Git -Arguments @("fetch", "origin", "main")
if ($RebuildCurrent) {
  & $gitPath -c "safe.directory=$($RepositoryRoot.Replace('\','/'))" -C $RepositoryRoot `
    merge-base --is-ancestor origin/main HEAD
  if ($LASTEXITCODE -ne 0) {
    throw "The recovery rebuild requires the current main branch to include origin/main."
  }
}
else {
  & $gitPath -c "safe.directory=$($RepositoryRoot.Replace('\','/'))" -C $RepositoryRoot `
    merge-base --is-ancestor HEAD origin/main
  if ($LASTEXITCODE -ne 0) {
    throw "Local and GitHub histories have diverged. Automatic update was cancelled."
  }
}

$updateCount = [int](Invoke-Git -Arguments @("rev-list", "--count", "HEAD..origin/main") -PassThru | Select-Object -First 1)
if ($updateCount -eq 0 -and -not $RebuildCurrent) {
  Write-Host "No updates are available. Nothing was changed."
  exit 0
}

$oldCommit = (Invoke-Git -Arguments @("rev-parse", "HEAD") -PassThru | Select-Object -First 1).Trim()
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not (Test-Path -LiteralPath $releasesDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $releasesDirectory | Out-Null
}

Write-Host "Creating a verified database backup before the update..."
& $backupScript -ServerRoot $ServerRoot

try {
  if ($updateCount -gt 0 -and -not $RebuildCurrent) {
    Write-Host "Applying $updateCount approved commit(s) from GitHub main..."
    Invoke-Git -Arguments @("merge", "--ff-only", "origin/main")
  }
  else {
    Write-Host "Rebuilding the current commit for a recovery test..."
  }

  & $stopScript -ServerRoot $ServerRoot -KeepDatabase

  if (Test-Path -LiteralPath $applicationOutput -PathType Container) {
    $previousOutput = Join-Path $releasesDirectory "output-$($oldCommit.Substring(0, 7))-$stamp"
    Move-Item -LiteralPath $applicationOutput -Destination $previousOutput
    $outputMoved = $true
  }

  Push-Location $RepositoryRoot
  try {
    Write-Host "Installing exact project dependencies..."
    & $npmPath ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }

    Write-Host "Building the updated application..."
    & $npmPath run build
    if ($LASTEXITCODE -ne 0) { throw "Application build failed with exit code $LASTEXITCODE." }
  }
  finally {
    Pop-Location
  }

  Write-Host "Validating database migrations without changing data..."
  & $migrationScript -ValidateOnly
  Write-Host "Applying only pending database migrations..."
  & $migrationScript

  & $startScript -ServerRoot $ServerRoot -RestartApplication
  $siteUrl = $null
  foreach ($line in Get-Content -LiteralPath $supabaseEnv) {
    if ($line -match "^SITE_URL=(?<url>https?://[^\s]+)$") {
      $siteUrl = $Matches.url
      break
    }
  }
  if (-not $siteUrl) { throw "Could not read SITE_URL from $supabaseEnv" }
  $response = Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 10
  if ($response.StatusCode -ne 200) {
    throw "Updated site returned HTTP $($response.StatusCode)."
  }

  $newCommit = (Invoke-Git -Arguments @("rev-parse", "HEAD") -PassThru | Select-Object -First 1).Trim()
  Write-Host "ARV update completed successfully."
  Write-Host "Commit: $($newCommit.Substring(0, 7))"
  Write-Host "Site: $siteUrl"
}
catch {
  $updateError = $_
  try {
    Restore-PreviousApplication
    & $startScript -ServerRoot $ServerRoot -RestartApplication
  }
  catch {
    Write-Warning "Automatic restart of the previous build also failed: $($_.Exception.Message)"
  }
  throw "Update failed. The previous application build was restored when possible. Database backup is safe. Details: $($updateError.Exception.Message)"
}
