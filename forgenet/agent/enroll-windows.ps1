param(
    [Parameter(Mandatory)] [string] $Server,
    [Parameter(Mandatory)] [string] $Token,
    [string] $Name = $env:COMPUTERNAME,
    [string] $Endpoint = '',
    [string] $InstallRoot = (Join-Path $env:ProgramData 'ForgeNet')
)
$ErrorActionPreference = 'Stop'
$wg = Get-Command wg.exe -ErrorAction SilentlyContinue
if (-not $wg) { throw 'wg.exe was not found. Install the official WireGuard for Windows client first.' }

New-Item -ItemType Directory -Force $InstallRoot | Out-Null
$privateKey = (& $wg.Source genkey).Trim()
$publicKey = ($privateKey | & $wg.Source pubkey).Trim()
$body = @{ token=$Token; name=$Name; publicKey=$publicKey; endpoint=$(if($Endpoint){$Endpoint}else{$null}) } | ConvertTo-Json
$result = Invoke-RestMethod "$($Server.TrimEnd('/'))/v1/devices/enroll" -Method Post -ContentType 'application/json' -Body $body

$credentials = @{ server=$Server.TrimEnd('/'); deviceId=$result.device.id; secret=$result.secret; privateKey=$privateKey; ip=$result.device.ip; name=$result.device.name }
$credentials | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot 'credentials.json') -Encoding UTF8
Write-Host "Enrolled $($result.device.name) as $($result.device.ip)." -ForegroundColor Green
Write-Host "Credentials saved to $InstallRoot. Run sync-windows.ps1 to generate the tunnel configuration."
