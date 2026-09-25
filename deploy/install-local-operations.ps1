[CmdletBinding()]
param(
  [string]$ServerRoot = "D:\prog\ARV-Server",
  [string]$BackupDay = "Sunday",
  [string]$BackupTime = "03:00"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$startScript = Join-Path $PSScriptRoot "start-server.ps1"
$stopScript = Join-Path $PSScriptRoot "stop-server.ps1"
$statusScript = Join-Path $PSScriptRoot "status-server.ps1"
$backupScript = Join-Path $PSScriptRoot "backup-database.ps1"
foreach ($requiredFile in @($startScript, $stopScript, $statusScript, $backupScript)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required file not found: $requiredFile"
  }
}

function Write-CommandFile {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$ScriptPath,
    [switch]$AlwaysPause
  )

  $lines = @(
    "@echo off",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`"",
    "if errorlevel 1 pause"
  )
  if ($AlwaysPause) { $lines += "if not errorlevel 1 pause" }
  [System.IO.File]::WriteAllLines($Path, $lines, [System.Text.Encoding]::ASCII)
}

Write-CommandFile -Path (Join-Path $ServerRoot "Start ARV.cmd") -ScriptPath $startScript
Write-CommandFile -Path (Join-Path $ServerRoot "Stop ARV.cmd") -ScriptPath $stopScript -AlwaysPause
Write-CommandFile -Path (Join-Path $ServerRoot "ARV Status.cmd") -ScriptPath $statusScript -AlwaysPause
Write-CommandFile -Path (Join-Path $ServerRoot "Backup ARV Now.cmd") -ScriptPath $backupScript -AlwaysPause

$userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

$startAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
$startTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
Register-ScheduledTask `
  -TaskName "ARV Local Server" `
  -Description "Start the local ARV site and Supabase after Windows sign-in." `
  -Action $startAction `
  -Trigger $startTrigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

$parsedBackupTime = [datetime]::ParseExact($BackupTime, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)
$backupAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$backupScript`""
$backupTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $BackupDay -At $parsedBackupTime
Register-ScheduledTask `
  -TaskName "ARV Weekly Backup" `
  -Description "Create a verified ARV database backup and retain it for 14 days." `
  -Action $backupAction `
  -Trigger $backupTrigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Write-Host "ARV controls installed in $ServerRoot"
Write-Host "Automatic start: after $userName signs in to Windows"
Write-Host "Weekly backup: $BackupDay at $BackupTime; missed runs start when available"
