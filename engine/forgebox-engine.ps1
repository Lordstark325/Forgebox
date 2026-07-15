$ErrorActionPreference = 'Stop'
$Distro = if ($env:FORGEBOX_DISTRO) { $env:FORGEBOX_DISTRO } else { 'ForgeBox' }
$EngineArgs = @($args)

if ($EngineArgs.Count -gt 0 -and $EngineArgs[0] -eq '--') {
    $EngineArgs = if ($EngineArgs.Count -gt 1) { @($EngineArgs[1..($EngineArgs.Count - 1)]) } else { @() }
}

$distros = (& wsl.exe --list --quiet) -replace "`0", ''
if ($LASTEXITCODE -ne 0 -or $distros -notcontains $Distro) {
    [Console]::Error.WriteLine("ForgeBox engine is not installed. Run .\engine\install-engine.ps1 first.")
    exit 125
}

& wsl.exe --distribution $Distro --user root --exec sh -c 'docker info >/dev/null 2>&1 || service docker start >/dev/null 2>&1'
if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine('ForgeBox could not start its container engine.')
    exit 125
}

& wsl.exe --distribution $Distro --user root --exec docker @EngineArgs
exit $LASTEXITCODE
