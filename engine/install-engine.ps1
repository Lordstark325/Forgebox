[CmdletBinding()]
param(
    [string] $DistroName = 'ForgeBox',
    [string] $InstallRoot = (Join-Path $env:LOCALAPPDATA 'ForgeBox\engine'),
    [switch] $KeepDownload
)

$ErrorActionPreference = 'Stop'
$ImageName = 'ubuntu-noble-wsl-amd64-wsl.rootfs.tar.gz'
$BaseUrl = 'https://cloud-images.ubuntu.com/wsl/releases/noble/current'
$ImageUrl = "$BaseUrl/$ImageName"
$SumsUrl = "$BaseUrl/SHA256SUMS"
$DownloadDir = Join-Path $env:TEMP 'ForgeBox'
$ImagePath = Join-Path $DownloadDir $ImageName
$DataPath = Join-Path $InstallRoot 'data'

function Write-Step([string] $Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Get-Distros { @((& wsl.exe --list --quiet) -replace "`0", '' | Where-Object { $_ }) }

Write-Step 'Checking WSL2'
& wsl.exe --status | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'WSL2 is not available. Enable WSL and Virtual Machine Platform first.' }
if ((Get-Distros) -contains $DistroName) {
    Write-Host "$DistroName is already installed. Running a health check."
    & (Join-Path $PSScriptRoot 'test-engine.ps1') -DistroName $DistroName
    exit $LASTEXITCODE
}

New-Item -ItemType Directory -Force -Path $DownloadDir, $DataPath | Out-Null
Write-Step 'Downloading the signed Ubuntu 24.04 LTS root filesystem'
Invoke-WebRequest -UseBasicParsing -Uri $ImageUrl -OutFile $ImagePath
$sumsRaw = (Invoke-WebRequest -UseBasicParsing -Uri $SumsUrl).Content
$sums = if ($sumsRaw -is [byte[]]) { [Text.Encoding]::UTF8.GetString($sumsRaw) } else { [string]$sumsRaw }
$checksumPattern = '(?i)([0-9a-f]{64})\s+\*?' + [regex]::Escape($ImageName) + '(?:\s|$)'
$checksumMatch = [regex]::Match($sums, $checksumPattern)
if (-not $checksumMatch.Success) { throw 'The image checksum was not present in Ubuntu SHA256SUMS.' }
$expected = $checksumMatch.Groups[1].Value.ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $ImagePath).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "Root filesystem checksum mismatch. Expected $expected, received $actual." }

Write-Step "Importing the dedicated $DistroName WSL2 distribution"
& wsl.exe --import $DistroName $DataPath $ImagePath --version 2
if ($LASTEXITCODE -ne 0) { throw 'WSL failed to import the ForgeBox distribution.' }

try {
    Write-Step 'Installing Moby, BuildKit, and Compose from Ubuntu repositories'
    & wsl.exe --distribution $DistroName --user root --exec bash -lc 'export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y docker.io docker-buildx docker-compose-v2 ca-certificates && apt-get clean && rm -rf /var/lib/apt/lists/*'
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }

    Write-Step 'Configuring the local engine'
    & wsl.exe --distribution $DistroName --user root --exec bash -lc "mkdir -p /etc/docker; printf '%s\n' '{\"features\":{\"buildkit\":true},\"log-driver\":\"local\"}' > /etc/docker/daemon.json; service docker start"
    if ($LASTEXITCODE -ne 0) { throw 'The container engine did not start.' }

    Write-Step 'Verifying ForgeBox with a real container'
    & wsl.exe --distribution $DistroName --user root --exec docker run --rm hello-world
    if ($LASTEXITCODE -ne 0) { throw 'The hello-world container test failed.' }
} catch {
    Write-Warning "Provisioning failed: $($_.Exception.Message)"
    Write-Warning "The partial '$DistroName' distribution was left in place for inspection. Remove it with: wsl --unregister $DistroName"
    throw
} finally {
    if (-not $KeepDownload) { Remove-Item -LiteralPath $ImagePath -Force -ErrorAction SilentlyContinue }
}

Write-Host "`nForgeBox engine is installed and ready." -ForegroundColor Green
