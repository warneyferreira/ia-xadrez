param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$registry = Get-Content -LiteralPath "$projectRoot\candidates\registry.json" -Raw | ConvertFrom-Json
$primary = $registry.candidates | Where-Object { $_.id -eq $registry.aliases.'arthur-latest' } | Select-Object -First 1
$enginePath = if ($primary.engine -eq '$DEFAULT') { Join-Path $projectRoot 'Stockfish\src\stockfish.exe' } else { Join-Path $projectRoot $primary.engine }
if (-not (Test-Path -LiteralPath $enginePath)) { throw 'Binário do candidato ausente. Execute scripts/setup.ps1 ou compile a versão indicada em candidates/registry.json.' }
$extraOptions = @()
$syzygyPath = Join-Path $env:LOCALAPPDATA 'ChessChallenge\syzygy\3-4-5'
if (Test-Path -LiteralPath (Join-Path $syzygyPath 'manifest.json')) { $extraOptions = @('--syzygy', $syzygyPath) }
if (-not $primary.book) { $extraOptions += '--no-training-book' }
if ($NoOpen) { $extraOptions += '--no-open' }
& "$projectRoot\ui\node_modules\bun\bin\bun.exe" "$projectRoot\ui\src\server.ts" --engine $enginePath --threads $primary.threads --hash-mb $primary.hashMB --candidate-name $primary.label --port 18766 --book "$projectRoot\openings\arthur-prepared.json" @extraOptions
