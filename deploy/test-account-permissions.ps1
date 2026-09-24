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
    $json = $Body | ConvertTo-Json -Depth 8 -Compress
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
$employeeEmail = "permission-employee-$suffix@arv.local"
$officeEmail = "permission-office-$suffix@arv.local"
$moderatorEmail = "permission-moderator-$suffix@arv.local"
$employeeId = $null
$officeId = $null
$moderatorId = $null
$employeePosition = '"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a"' | ConvertFrom-Json
$officePosition = '"\u041e\u0444\u0438\u0441-\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440"' | ConvertFrom-Json
$moderatorPosition = '"\u041c\u043e\u0434\u0435\u0440\u0430\u0442\u043e\u0440"' | ConvertFrom-Json
$headPosition = '"\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u043e\u0442\u0434\u0435\u043b\u0430"' | ConvertFrom-Json

try {
  $employeeCreate = Invoke-Api -Method POST -Uri "$SupabaseUrl/auth/v1/admin/users" `
    -Headers $serviceHeaders -ExpectedStatus @(200, 201) -Body @{
      email = $employeeEmail
      password = $password
      email_confirm = $true
    }
  $employeeCreated = Convert-ResponseJson $employeeCreate.Content
  $employeeId = if ($employeeCreated.id) { $employeeCreated.id } else { $employeeCreated.user.id }

  $officeCreate = Invoke-Api -Method POST -Uri "$SupabaseUrl/auth/v1/admin/users" `
    -Headers $serviceHeaders -ExpectedStatus @(200, 201) -Body @{
      email = $officeEmail
      password = $password
      email_confirm = $true
    }
  $officeCreated = Convert-ResponseJson $officeCreate.Content
  $officeId = if ($officeCreated.id) { $officeCreated.id } else { $officeCreated.user.id }

  $moderatorCreate = Invoke-Api -Method POST -Uri "$SupabaseUrl/auth/v1/admin/users" `
    -Headers $serviceHeaders -ExpectedStatus @(200, 201) -Body @{
      email = $moderatorEmail
      password = $password
      email_confirm = $true
    }
  $moderatorCreated = Convert-ResponseJson $moderatorCreate.Content
  $moderatorId = if ($moderatorCreated.id) { $moderatorCreated.id } else { $moderatorCreated.user.id }

  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/profiles" -Headers $serviceHeaders `
    -ExpectedStatus @(200, 201) -Body @{
      id = $employeeId
      username = "permission-employee-$suffix"
      last_name = "PermissionEmployee"
      first_name = "Test"
      position = $employeePosition
    } | Out-Null
  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/profiles" -Headers $serviceHeaders `
    -ExpectedStatus @(200, 201) -Body @{
      id = $officeId
      username = "permission-office-$suffix"
      last_name = "PermissionOffice"
      first_name = "Test"
      position = $officePosition
    } | Out-Null
  Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/profiles" -Headers $serviceHeaders `
    -ExpectedStatus @(200, 201) -Body @{
      id = $moderatorId
      username = "permission-moderator-$suffix"
      last_name = "PermissionModerator"
      first_name = "Test"
      position = $moderatorPosition
    } | Out-Null

  $employeeLogin = Invoke-Api -Method POST `
    -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $anonKey } `
    -Body @{ email = $employeeEmail; password = $password }
  $employeeToken = (Convert-ResponseJson $employeeLogin.Content).access_token
  $officeLogin = Invoke-Api -Method POST `
    -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $anonKey } `
    -Body @{ email = $officeEmail; password = $password }
  $officeToken = (Convert-ResponseJson $officeLogin.Content).access_token
  $moderatorLogin = Invoke-Api -Method POST `
    -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $anonKey } `
    -Body @{ email = $moderatorEmail; password = $password }
  $moderatorToken = (Convert-ResponseJson $moderatorLogin.Content).access_token

  $employeeHeaders = @{
    apikey = $anonKey
    Authorization = "Bearer $employeeToken"
    Prefer = "return=representation"
  }
  $officeHeaders = @{
    apikey = $anonKey
    Authorization = "Bearer $officeToken"
    Prefer = "return=representation"
  }
  $moderatorHeaders = @{
    apikey = $anonKey
    Authorization = "Bearer $moderatorToken"
    Prefer = "return=representation"
  }

  $employeeRead = Invoke-Api -Method GET -Uri "$SupabaseUrl/rest/v1/profiles?select=id" `
    -Headers $employeeHeaders
  $employeeRows = @(Convert-ResponseJson -Content $employeeRead.Content)
  $employeeRowCount = if ($employeeRows.Count -eq 1 -and $employeeRows[0] -is [array]) {
    $employeeRows[0].Count
  } else {
    $employeeRows.Count
  }
  Write-Host "employee_directory_rows=$employeeRowCount"
  Assert-True ($employeeRowCount -ge 2) `
    "Authenticated employee could not read the employee directory."

  $employeeUpdate = Invoke-Api -Method PATCH `
    -Uri "$SupabaseUrl/rest/v1/profiles?id=eq.$employeeId" -Headers $employeeHeaders `
    -Body @{ last_name = "UnauthorizedChange" }
  $profileAfterEmployeeAttempt = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/profiles?select=last_name&id=eq.$employeeId" `
    -Headers $serviceHeaders
  $profileAfterEmployeeRow = ($profileAfterEmployeeAttempt.Content | ConvertFrom-Json)[0]
  Assert-True ($profileAfterEmployeeRow.last_name -eq "PermissionEmployee") `
    "Employee unexpectedly updated their own profile."

  $employeeDelete = Invoke-Api -Method DELETE `
    -Uri "$SupabaseUrl/rest/v1/profiles?id=eq.$employeeId" -Headers $employeeHeaders `
    -ExpectedStatus @(401, 403)
  Assert-True ($employeeDelete.Status -in @(401, 403)) `
    "Employee unexpectedly deleted a profile."

  $roleInsert = Invoke-Api -Method POST -Uri "$SupabaseUrl/rest/v1/user_roles" `
    -Headers $employeeHeaders -ExpectedStatus @(401, 403) `
    -Body @{ user_id = $employeeId; role = "moderator" }
  Assert-True ($roleInsert.Status -in @(401, 403)) `
    "Employee unexpectedly inserted a role."

  $officeUpdate = Invoke-Api -Method PATCH `
    -Uri "$SupabaseUrl/rest/v1/profiles?id=eq.$employeeId" -Headers $officeHeaders `
    -Body @{ last_name = "AuthorizedOfficeChange" }
  $profileAfterOfficeUpdate = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/profiles?select=last_name&id=eq.$employeeId" `
    -Headers $serviceHeaders
  $profileAfterOfficeRow = ($profileAfterOfficeUpdate.Content | ConvertFrom-Json)[0]
  Assert-True ($profileAfterOfficeRow.last_name -eq "AuthorizedOfficeChange") `
    "Office manager could not update an employee profile."

  Invoke-Api -Method PATCH `
    -Uri "$SupabaseUrl/rest/v1/profiles?id=eq.$employeeId" -Headers $moderatorHeaders `
    -Body @{ first_name = "AuthorizedModeratorChange" } | Out-Null
  $profileAfterModeratorUpdate = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/profiles?select=first_name&id=eq.$employeeId" `
    -Headers $serviceHeaders
  $profileAfterModeratorRow = ($profileAfterModeratorUpdate.Content | ConvertFrom-Json)[0]
  Assert-True ($profileAfterModeratorRow.first_name -eq "AuthorizedModeratorChange") `
    "Moderator could not update an employee profile."

  Invoke-Api -Method PATCH -Uri "$SupabaseUrl/rest/v1/profiles?id=eq.$employeeId" `
    -Headers $serviceHeaders -Body @{ position = $headPosition } | Out-Null
  $headRole = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/user_roles?select=role&user_id=eq.$employeeId" `
    -Headers $serviceHeaders
  $headRoleRows = @(Convert-ResponseJson -Content $headRole.Content)
  Assert-True ($headRoleRows.Count -eq 1 -and $headRoleRows[0].role -eq "head") `
    "Position-to-role synchronization failed for department head."

  Invoke-Api -Method PATCH -Uri "$SupabaseUrl/rest/v1/profiles?id=eq.$employeeId" `
    -Headers $serviceHeaders -Body @{ position = $employeePosition } | Out-Null
  $employeeRole = Invoke-Api -Method GET `
    -Uri "$SupabaseUrl/rest/v1/user_roles?select=role&user_id=eq.$employeeId" `
    -Headers $serviceHeaders
  $employeeRoleRows = @(Convert-ResponseJson -Content $employeeRole.Content)
  Assert-True ($employeeRoleRows.Count -eq 1 -and $employeeRoleRows[0].role -eq "employee") `
    "Position-to-role synchronization failed for employee."

  Write-Host "Account permission matrix: PASS"
  Write-Host "- employee directory read: allowed"
  Write-Host "- employee self-update/delete/role escalation: denied"
  Write-Host "- office-manager profile update: allowed"
  Write-Host "- moderator profile update: allowed"
  Write-Host "- position-to-role synchronization: passed"
}
finally {
  foreach ($userId in @($employeeId, $officeId, $moderatorId)) {
    if (-not $userId) { continue }
    try {
      Invoke-Api -Method DELETE -Uri "$SupabaseUrl/auth/v1/admin/users/$userId" `
        -Headers $serviceHeaders -ExpectedStatus @(200, 204) | Out-Null
    }
    catch {
      Write-Warning "Could not remove temporary permission-test user $userId"
    }
  }
}
