[CmdletBinding()]
param(
  [string]$SupabaseUrl = "http://127.0.0.1:8000",
  [string]$SupabaseEnv = "D:\prog\ARV-Server\supabase\.env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

function Invoke-Api {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)][hashtable]$Headers,
    [object]$Body,
    [int[]]$ExpectedStatus = @(200)
  )

  $request = @{
    UseBasicParsing = $true
    Method = $Method
    Uri = $Uri
    Headers = $Headers
  }
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    $request.SkipHttpErrorCheck = $true
  }
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    $request.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    $request.ContentType = "application/json; charset=utf-8"
  }

  try {
    $response = Invoke-WebRequest @request
    $status = [int]$response.StatusCode
    $content = [string]$response.Content
  }
  catch {
    if (-not $_.Exception.Response) { throw }
    $response = $_.Exception.Response
    $status = [int]$response.StatusCode
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
  }

  if ($ExpectedStatus -notcontains $status) {
    throw "Unexpected HTTP $status for $Method $Uri. Response: $content"
  }
  return [pscustomobject]@{ Status = $status; Content = $content }
}

function Convert-ResponseJson {
  param([Parameter(Mandatory)][string]$Content)
  if (-not $Content.Trim()) { return $null }
  return $Content | ConvertFrom-Json
}

function Assert-True {
  param([Parameter(Mandatory)][bool]$Condition, [Parameter(Mandatory)][string]$Message)
  if (-not $Condition) { throw $Message }
}

function New-TestUser {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Position,
    [Parameter(Mandatory)][string]$Password,
    [Parameter(Mandatory)][hashtable]$ServiceHeaders,
    [Parameter(Mandatory)][string]$AnonKey,
    [Parameter(Mandatory)][string]$Suffix
  )

  $email = "shared-$Name-$Suffix@arv.local"
  $created = Invoke-Api -Method POST -Uri "$SupabaseUrl/auth/v1/admin/users" `
    -Headers $ServiceHeaders -ExpectedStatus @(200, 201) -Body @{
      email = $email
      password = $Password
      email_confirm = $true
    }
  $createdJson = Convert-ResponseJson $created.Content
  $userId = if ($createdJson.id) { $createdJson.id } else { $createdJson.user.id }

  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/profiles" -Headers $ServiceHeaders `
    -ExpectedStatus @(200, 201) -Body @{
      id = $userId
      username = "shared-$Name-$Suffix"
      last_name = "Shared$Name"
      first_name = "Test"
      position = $Position
    } | Out-Null

  $login = Invoke-Api -Method POST -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = $AnonKey } -Body @{ email = $email; password = $Password }
  $token = (Convert-ResponseJson $login.Content).access_token
  return [pscustomobject]@{
    Id = $userId
    Headers = @{
      apikey = $AnonKey
      Authorization = "Bearer $token"
      Prefer = "return=representation"
    }
  }
}

if (-not (Test-Path -LiteralPath $SupabaseEnv -PathType Leaf)) {
  throw "Supabase environment file not found: $SupabaseEnv"
}

$settings = Read-EnvironmentFile -Path $SupabaseEnv
$anonKey = $settings["ANON_KEY"]
$serviceKey = $settings["SERVICE_ROLE_KEY"]
if (-not $anonKey -or -not $serviceKey) {
  throw "ANON_KEY or SERVICE_ROLE_KEY is missing from $SupabaseEnv"
}

$serviceHeaders = @{
  apikey = $serviceKey
  Authorization = "Bearer $serviceKey"
  Prefer = "return=representation"
}
$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 12)
$password = "Arv-$([Guid]::NewGuid().ToString('N'))-Aa1!"
$employeePosition = '"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a"' | ConvertFrom-Json
$officePosition = '"\u041e\u0444\u0438\u0441-\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440"' | ConvertFrom-Json
$moderatorPosition = '"\u041c\u043e\u0434\u0435\u0440\u0430\u0442\u043e\u0440"' | ConvertFrom-Json
$users = @()
$projectKey = "shared-project-$suffix"
$effortKey = $null
$medicalKey = $null
$rawMedicalKey = $null
$filterKey = "shared-filter-$suffix"

try {
  $moderator = New-TestUser -Name "moderator" -Position $moderatorPosition -Password $password `
    -ServiceHeaders $serviceHeaders -AnonKey $anonKey -Suffix $suffix
  $users += $moderator
  $office = New-TestUser -Name "office" -Position $officePosition -Password $password `
    -ServiceHeaders $serviceHeaders -AnonKey $anonKey -Suffix $suffix
  $users += $office
  $employeeA = New-TestUser -Name "employee-a" -Position $employeePosition -Password $password `
    -ServiceHeaders $serviceHeaders -AnonKey $anonKey -Suffix $suffix
  $users += $employeeA
  $employeeB = New-TestUser -Name "employee-b" -Position $employeePosition -Password $password `
    -ServiceHeaders $serviceHeaders -AnonKey $anonKey -Suffix $suffix
  $users += $employeeB
  $effortKey = "$($employeeA.Id)|2099-01|shared-row-$suffix"
  $medicalKey = "$($employeeA.Id)|2099-02-01"
  $rawMedicalKey = "$($employeeB.Id)|2099-02-01"

  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/app_records" `
    -Headers $moderator.Headers -ExpectedStatus @(200, 201) -Body @{
      record_kind = "project"
      record_key = $projectKey
      payload = @{ value = @{ id = $projectKey; name = "Shared project" }; order = 0 }
    } | Out-Null

  $employeeProjectRead = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=record_key,payload&record_kind=eq.project&record_key=eq.$projectKey" `
    -Headers $employeeA.Headers
  $projectRows = @(Convert-ResponseJson $employeeProjectRead.Content)
  Assert-True ($projectRows.Count -eq 1 -and $projectRows[0].record_key -eq $projectKey) `
    "A project created in one session was not visible in another session."

  $unauthorizedProject = Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/app_records" `
    -Headers $employeeA.Headers -ExpectedStatus @(401, 403) -Body @{
      record_kind = "project"
      record_key = "unauthorized-$suffix"
      payload = @{ value = @{ id = "unauthorized-$suffix"; name = "Denied" }; order = 1 }
    }
  Assert-True ($unauthorizedProject.Status -in @(401, 403)) `
    "An employee unexpectedly created a project."

  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/app_records" `
    -Headers $employeeA.Headers -ExpectedStatus @(200, 201) -Body @{
      record_kind = "effort_row"
      record_key = $effortKey
      owner_id = $employeeA.Id
      payload = @{ value = @{ id = "shared-row-$suffix"; projectId = $projectKey; workType = "Test"; hours = @{ "1" = 8 } }; order = 0 }
    } | Out-Null

  $effortRead = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=record_key,payload&record_kind=eq.effort_row&record_key=eq.$effortKey" `
    -Headers $employeeB.Headers
  $effortRows = @(Convert-ResponseJson $effortRead.Content)
  Assert-True ($effortRows.Count -eq 1) `
    "Effort created by one employee was not visible to another employee."

  Invoke-Api -Method PATCH `
    -Uri "$SupabaseUrl/rest/v1/app_records?record_kind=eq.effort_row&record_key=eq.$effortKey" `
    -Headers $employeeB.Headers -Body @{ payload = @{ value = @{ id = "tampered" }; order = 0 } } | Out-Null
  $effortAfterAttempt = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=payload&record_kind=eq.effort_row&record_key=eq.$effortKey" `
    -Headers $serviceHeaders
  $effortAfterRows = @(Convert-ResponseJson $effortAfterAttempt.Content)
  Assert-True ($effortAfterRows[0].payload.value.id -eq "shared-row-$suffix") `
    "An employee unexpectedly changed another employee's effort."

  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/app_records" `
    -Headers $employeeA.Headers -ExpectedStatus @(200, 201) -Body @{
      record_kind = "filter_set"
      record_key = $filterKey
      owner_id = $employeeA.Id
      payload = @{ value = @{ id = $filterKey; name = "Private filter" }; order = 0 }
    } | Out-Null
  $privateFilterRead = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=record_key&record_kind=eq.filter_set&record_key=eq.$filterKey" `
    -Headers $employeeB.Headers
  $privateFilterRows = @(Convert-ResponseJson $privateFilterRead.Content)
  Assert-True ($privateFilterRows.Count -eq 0) `
    "A private dashboard filter was visible to another employee."

  Invoke-Api -Method PATCH `
    -Uri "$SupabaseUrl/rest/v1/app_records?record_kind=eq.project&record_key=eq.$projectKey" `
    -Headers $moderator.Headers -Body @{
      payload = @{ value = @{ id = $projectKey; name = "Shared project updated" }; order = 0 }
    } | Out-Null
  $updatedRead = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=payload&record_kind=eq.project&record_key=eq.$projectKey" `
    -Headers $employeeB.Headers
  $updatedRows = @(Convert-ResponseJson $updatedRead.Content)
  Assert-True ($updatedRows[0].payload.value.name -eq "Shared project updated") `
    "A project update was not visible to another session."

  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/app_records" `
    -Headers $office.Headers -ExpectedStatus @(200, 201) -Body @(
      @{
        record_kind = "timesheet"
        record_key = $medicalKey
        payload = '"\u041d"' | ConvertFrom-Json
      },
      @{
        record_kind = "medical_absence"
        record_key = $medicalKey
        payload = $true
      }
    ) | Out-Null

  $employeeMedicalRead = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=record_kind,payload&record_key=eq.$medicalKey" `
    -Headers $employeeA.Headers
  $employeeMedicalRows = @(Convert-ResponseJson $employeeMedicalRead.Content)
  Assert-True ($employeeMedicalRows.Count -eq 1 -and $employeeMedicalRows[0].record_kind -eq "timesheet") `
    "An employee could see the protected medical marker."
  Assert-True ($employeeMedicalRows[0].payload -eq ('"\u041d"' | ConvertFrom-Json)) `
    "The public medical value was not masked as N."

  $moderatorMedicalRead = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=record_kind&record_kind=eq.medical_absence&record_key=eq.$medicalKey" `
    -Headers $moderator.Headers
  Assert-True (@(Convert-ResponseJson $moderatorMedicalRead.Content).Count -eq 0) `
    "A moderator could see the protected medical marker."

  $officeMedicalRead = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/app_records?select=record_kind&record_kind=eq.medical_absence&record_key=eq.$medicalKey" `
    -Headers $office.Headers
  Assert-True (@(Convert-ResponseJson $officeMedicalRead.Content).Count -eq 1) `
    "The office manager could not see the protected medical marker."

  $rawMedicalInsert = Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/app_records" `
    -Headers $moderator.Headers -ExpectedStatus @(400, 409) -Body @{
      record_kind = "timesheet"
      record_key = $rawMedicalKey
      payload = '"\u0411"' | ConvertFrom-Json
    }
  Assert-True ($rawMedicalInsert.Status -in @(400, 409)) `
    "The database unexpectedly accepted a raw medical code in public data."

  Write-Host "Shared data isolation and synchronization: PASS"
  Write-Host "- project create/update is shared between sessions"
  Write-Host "- ordinary employee cannot create projects"
  Write-Host "- employee effort is shared but protected from another employee's edits"
  Write-Host "- personal dashboard filters remain private"
  Write-Host "- medical absence is B only for office manager and masked as N for everyone else"
  Write-Host "- raw B values are rejected from public timesheet rows"
}
finally {
  foreach ($record in @(
    @{ kind = "project"; key = $projectKey },
    @{ kind = "effort_row"; key = $effortKey },
    @{ kind = "filter_set"; key = $filterKey },
    @{ kind = "timesheet"; key = $medicalKey },
    @{ kind = "medical_absence"; key = $medicalKey },
    @{ kind = "timesheet"; key = $rawMedicalKey },
    @{ kind = "project"; key = "unauthorized-$suffix" }
  )) {
    if (-not $record.key) { continue }
    try {
      Invoke-Api -Method DELETE `
        -Uri "$SupabaseUrl/rest/v1/app_records?record_kind=eq.$($record.kind)&record_key=eq.$($record.key)" `
        -Headers $serviceHeaders -ExpectedStatus @(200, 204) | Out-Null
    }
    catch {
      Write-Warning "Could not remove temporary shared-data record $($record.kind)/$($record.key)"
    }
  }
  foreach ($user in $users) {
    try {
      Invoke-Api -Method DELETE -Uri "$SupabaseUrl/auth/v1/admin/users/$($user.Id)" `
        -Headers $serviceHeaders -ExpectedStatus @(200, 204) | Out-Null
    }
    catch {
      Write-Warning "Could not remove temporary shared-data test user $($user.Id)"
    }
  }
}
