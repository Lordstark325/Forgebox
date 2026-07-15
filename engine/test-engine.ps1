[CmdletBinding()]
param([string] $DistroName = 'ForgeBox')
$ErrorActionPreference = 'Continue'
$failed = $false

function Check([string] $Name, [scriptblock] $Test) {
    & $Test | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "PASS  $Name" -ForegroundColor Green }
    else { Write-Host "FAIL  $Name" -ForegroundColor Red; $script:failed = $true }
}

$distros = (& wsl.exe --list --quiet) -replace "`0", ''
if ($distros -notcontains $DistroName) { Write-Host "FAIL  $DistroName distribution is not installed" -ForegroundColor Red; exit 1 }
Write-Host "PASS  $DistroName distribution exists" -ForegroundColor Green
Check 'Docker daemon starts' { & wsl.exe -d $DistroName -u root --exec sh -c 'docker info >/dev/null 2>&1 || service docker start' }
Check 'Docker API responds' { & wsl.exe -d $DistroName -u root --exec docker version }
Check 'BuildKit/buildx is available' { & wsl.exe -d $DistroName -u root --exec docker buildx version }
Check 'Compose v2 is available' { & wsl.exe -d $DistroName -u root --exec docker compose version }
Check 'Container execution works' { & wsl.exe -d $DistroName -u root --exec docker run --rm hello-world }
exit $(if ($failed) { 1 } else { 0 })
