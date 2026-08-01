param(
    [string] $Server = 'http://127.0.0.1:8787',
    [int] $Minutes = 30,
    [int] $Uses = 1,
    [string] $AdminTokenFile = (Join-Path $PSScriptRoot '..\data\admin-token.txt')
)
$ErrorActionPreference = 'Stop'
$adminToken = [IO.File]::ReadAllText((Resolve-Path $AdminTokenFile)).Trim()
$headers = @{ Authorization = "Bearer $adminToken" }
$body = @{ ttlMinutes = $Minutes; uses = $Uses } | ConvertTo-Json
$result = Invoke-RestMethod "$Server/v1/enrollment-tokens" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
Write-Host 'Enrollment token (shown once):' -ForegroundColor Cyan
$result.token
Write-Host "Expires: $($result.expiresAt) | Uses: $($result.uses)"
