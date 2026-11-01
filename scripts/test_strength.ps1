param(
    [int]$Games = 20,
    [double]$BaseSeconds = 1500,
    [double]$IncrementSeconds = 0,
    [int]$Threads = 2,
    [int]$HashMB = 256,
    [string]$CandidateA = 'arthur-latest',
    [string]$CandidateB = 'vanderlei-base',
    [string]$Openings = 'openings/validation-holdout.pgn'
)
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if ($Games -lt 2 -or $Games % 2 -ne 0 -or $BaseSeconds -le 0 -or $IncrementSeconds -lt 0 -or $Threads -lt 1 -or $HashMB -lt 16) { throw 'Use quantidade par de jogos e recursos/tempos positivos.' }
$registry = Get-Content -LiteralPath 'candidates/registry.json' -Raw -Encoding UTF8 | ConvertFrom-Json
$uiActive = $false
try {
    $duelState = Invoke-RestMethod 'http://127.0.0.1:18766/api/duel/status' -TimeoutSec 2
    $physicalState = Invoke-RestMethod 'http://127.0.0.1:18766/api/tournament/status' -TimeoutSec 2
    $uiActive = $duelState.busy -or $duelState.phase -in @('running','starting') -or $physicalState.phase -notin @('idle','ready','finished')
} catch { }
if ($uiActive) { throw 'Pause o duelo e encerre a partida física antes da bateria, para não disputar processamento.' }
function Resolve-Candidate([string]$id) {
    $alias = $registry.aliases.PSObject.Properties[$id]
    if ($alias) { $id = [string]$alias.Value }
    $candidate = $registry.candidates | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if (-not $candidate -or -not (Test-Path -LiteralPath $candidate.engine)) { throw "Candidato ausente: $id. Execute scripts/setup.ps1 antes." }
    $nativeOptions = @{ Threads = $Threads; Hash = $HashMB; 'Move Overhead' = 20; Ponder = $false }
    if ($candidate.tournamentCriticalTime) { $nativeOptions['Tournament Critical Time'] = $true }
    return @{ name = $candidate.label; command = @((Resolve-Path -LiteralPath $candidate.engine).Path); options = $nativeOptions }
}
$left = Resolve-Candidate $CandidateA
$right = Resolve-Candidate $CandidateB
if ($left.name -eq $right.name) { throw 'Escolha duas versões distintas.' }
$availableMB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024
if ($availableMB -lt (2 * $HashMB + 1024)) { throw 'RAM livre insuficiente para dois motores e a margem operacional. Feche aplicativos sem uso ou reduza HashMB.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$configFile = Join-Path $projectRoot "results/arena/config-$stamp.json"
$output = Join-Path $projectRoot "results/arena/match-$stamp"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $configFile) | Out-Null
$config = @{
    match_id = "controlled-$stamp"; candidate_a = $left; candidate_b = $right; games = $Games
    time_control = @{ base_seconds = $BaseSeconds; increment_seconds = $IncrementSeconds }
    openings = @{ pgn = (Resolve-Path -LiteralPath $Openings).Path; seed = 20261031 }
    max_plies = 2000; output_dir = $output; draw_policy = 'played'
}
$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configFile -Encoding utf8
Write-Host "Teste de motores: mesmo Threads/Hash, sem repertório e sem Syzygy para ambos. Resultado em $output"
Write-Host "Tempo de relógio máximo sem incremento: $([math]::Round($Games * 2 * $BaseSeconds / 3600, 1)) horas. Execute com a máquina na tomada e sem outros cálculos pesados."
& arena/.venv/Scripts/python.exe -u arena/run_match.py $configFile
if ($LASTEXITCODE -ne 0) { throw 'A arena falhou. As evidências já gravadas foram preservadas.' }
