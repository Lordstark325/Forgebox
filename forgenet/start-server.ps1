$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$tokenFile = Join-Path $PSScriptRoot 'data\admin-token.txt'
if (-not (Test-Path $tokenFile)) {
    New-Item -ItemType Directory -Force (Split-Path $tokenFile) | Out-Null
    $bytes = New-Object byte[] 48
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    [IO.File]::WriteAllText($tokenFile, [Convert]::ToBase64String($bytes))
    Write-Host "Created admin token at $tokenFile" -ForegroundColor Yellow
}
$env:FORGENET_ADMIN_TOKEN = [IO.File]::ReadAllText($tokenFile).Trim()
& node src/server.js
