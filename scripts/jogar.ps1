param([switch]$NoOpen, [string]$Candidate = 'arthur-latest', [int]$Port = 18766)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$registry = Get-Content -LiteralPath "$projectRoot\candidates\registry.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$alias = $registry.aliases.PSObject.Properties[$Candidate]
$selectedId = if ($alias) { [string]$alias.Value } else { $Candidate }
$primary = $registry.candidates | Where-Object { $_.id -eq $selectedId } | Select-Object -First 1
if (-not $primary) { throw "Candidato desconhecido: $Candidate" }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Escolha uma porta entre 1024 e 65535.' }
$enginePath = if ($primary.engine -eq '$DEFAULT') { Join-Path $projectRoot 'Stockfish\src\stockfish.exe' } else { Join-Path $projectRoot $primary.engine }
if (-not (Test-Path -LiteralPath $enginePath)) { throw 'Binário do candidato ausente. Execute scripts/setup.ps1 ou compile a versão indicada em candidates/registry.json.' }
$address = "http://127.0.0.1:$Port"
$existing = $null
try { $existing = Invoke-RestMethod -Uri "$address/api/info" -TimeoutSec 2 -ErrorAction Stop } catch { }
if ($existing) {
    $catalog = $null
    try { $catalog = Invoke-RestMethod -Uri "$address/api/candidates" -TimeoutSec 2 -ErrorAction Stop } catch { }
    $expectedIds = ($registry.candidates.id | Sort-Object) -join ','
    $actualIds = ($catalog.candidates.id | Sort-Object) -join ','
    if ($existing.candidate -eq $primary.label -and $existing.PSObject.Properties['preparedRepertoire'] -and $expectedIds -eq $actualIds) {
        Write-Host "A interface atual já está aberta: $address/duel"
        if (-not $NoOpen) { Start-Process -FilePath "$address/duel" -WindowStyle Hidden }
        return
    }
    throw "A porta $Port está atendendo outra versão da interface. Encerre a janela antiga antes de reiniciar, ou escolha outra porta com -Port. Nenhuma partida foi interrompida."
}
$extraOptions = @()
$syzygyPath = Join-Path $env:LOCALAPPDATA 'ChessChallenge\syzygy\3-4-5'
if (Test-Path -LiteralPath (Join-Path $syzygyPath 'manifest.json')) { $extraOptions = @('--syzygy', $syzygyPath) }
if (-not $primary.book) { $extraOptions += '--no-training-book' }
if ($primary.tournamentCriticalTime) { $extraOptions += '--tournament-critical-time' }
if ($primary.preparedRepertoire) { $extraOptions += @('--prepared-repertoire', (Join-Path $projectRoot $primary.preparedRepertoire), '--prepared-sha256', $primary.preparedSha256) }
if ($NoOpen) { $extraOptions += '--no-open' }
& "$projectRoot\ui\node_modules\bun\bin\bun.exe" "$projectRoot\ui\src\server.ts" --engine $enginePath --threads $primary.threads --hash-mb $primary.hashMB --candidate-name $primary.label --port $Port --book "$projectRoot\openings\arthur-prepared.json" @extraOptions
