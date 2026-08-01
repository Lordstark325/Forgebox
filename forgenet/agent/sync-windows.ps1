param(
    [string] $InstallRoot = (Join-Path $env:ProgramData 'ForgeNet'),
    [string] $Endpoint = '',
    [int] $ListenPort = 51820,
    [switch] $InstallTunnelService
)
$ErrorActionPreference = 'Stop'
$credentialFile = Join-Path $InstallRoot 'credentials.json'
if (-not (Test-Path $credentialFile)) { throw 'ForgeNet credentials were not found. Enroll this device first.' }
$credentials = Get-Content -Raw $credentialFile | ConvertFrom-Json
$headers = @{ Authorization="Bearer $($credentials.secret)"; 'X-ForgeNet-Device'=$credentials.deviceId }
$body = @{ endpoint=$(if($Endpoint){$Endpoint}else{$null}) } | ConvertTo-Json
$network = Invoke-RestMethod "$($credentials.server)/v1/devices/heartbeat" -Method Post -Headers $headers -ContentType 'application/json' -Body $body

$lines = @('[Interface]', "PrivateKey = $($credentials.privateKey)", "Address = $($network.device.ip)/32", "ListenPort = $ListenPort", '')
foreach ($peer in $network.peers) {
    if (-not $peer.endpoint) { continue }
    $lines += '[Peer]'
    $lines += "PublicKey = $($peer.publicKey)"
    $lines += "AllowedIPs = $($peer.ip)/32"
    $lines += "Endpoint = $($peer.endpoint)"
    $lines += 'PersistentKeepalive = 25'
    $lines += ''
}
$configFile = Join-Path $InstallRoot 'ForgeNet.conf'
$lines | Set-Content -LiteralPath $configFile -Encoding ASCII
Write-Host "Wrote $configFile with $($network.peers.Count) discovered peer(s)." -ForegroundColor Green

if ($InstallTunnelService) {
    $wireguard = Get-Command wireguard.exe -ErrorAction SilentlyContinue
    if (-not $wireguard) { throw 'wireguard.exe was not found.' }
    & $wireguard.Source /installtunnelservice $configFile
    if ($LASTEXITCODE -ne 0) { throw 'WireGuard tunnel service installation failed.' }
    Write-Host 'ForgeNet tunnel service installed.' -ForegroundColor Green
}
