$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 20 or newer is required.' }
Set-Location $PSScriptRoot
Start-Process "http://127.0.0.1:4782"
& $node.Source src/server.js
