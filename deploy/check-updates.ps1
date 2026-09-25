[CmdletBinding()]
param([string]$RepositoryRoot)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RepositoryRoot) {
  $RepositoryRoot = Split-Path -Parent $PSScriptRoot
}
$gitPath = (Get-Command git.exe -ErrorAction Stop).Source
$RepositoryRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)

function Invoke-Git {
  param([Parameter(Mandatory)][string[]]$Arguments, [switch]$PassThru)

  $output = & $gitPath -c "safe.directory=$($RepositoryRoot.Replace('\','/'))" `
    -C $RepositoryRoot @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
  }
  if ($PassThru) { return $output }
}

$branch = (Invoke-Git -Arguments @("branch", "--show-current") -PassThru | Select-Object -First 1).Trim()
if ($branch -ne "main") {
  throw "Updates can only be checked from the main branch. Current branch: $branch"
}

$changes = @(Invoke-Git -Arguments @("status", "--porcelain") -PassThru)
if ($changes.Count -gt 0) {
  throw "The project contains uncommitted changes. Ask Codex to review them before updating."
}

Write-Host "Checking GitHub/Lovable..."
Invoke-Git -Arguments @("fetch", "origin", "main")

& $gitPath -c "safe.directory=$($RepositoryRoot.Replace('\','/'))" -C $RepositoryRoot `
  merge-base --is-ancestor HEAD origin/main
if ($LASTEXITCODE -ne 0) {
  throw "Local and GitHub histories have diverged. Do not update automatically; ask Codex to review them."
}

$count = [int](Invoke-Git -Arguments @("rev-list", "--count", "HEAD..origin/main") -PassThru | Select-Object -First 1)
if ($count -eq 0) {
  Write-Host "No updates are available. ARV already matches GitHub main."
  exit 0
}

Write-Host "Updates available: $count commit(s)"
Invoke-Git -Arguments @("log", "--oneline", "--decorate", "HEAD..origin/main") -PassThru |
  ForEach-Object { Write-Host "- $_" }
Write-Host "Changed files:"
Invoke-Git -Arguments @("diff", "--stat", "HEAD..origin/main") -PassThru |
  ForEach-Object { Write-Host $_ }
Write-Host "Review the list. When ready, run Update ARV.cmd."
