param([switch]$WithTablebases)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
& npm --prefix ui ci
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências da interface.' }
if (-not (Test-Path 'ui/node_modules/bun/bin/bun.exe')) {
    & node ui/node_modules/bun/install.js
    if ($LASTEXITCODE -ne 0) { throw 'Instalação local do Bun falhou.' }
}
if (-not (Test-Path 'Stockfish/src/stockfish.exe')) { & "$PSScriptRoot\build-engine.ps1" }
if (-not (Test-Path 'bin/baseline-effdc3fd3/stockfish.exe')) { & "$PSScriptRoot\build-baseline.ps1" }
if (-not (Test-Path 'arena/.venv/Scripts/python.exe')) { & py -3 -m venv arena/.venv }
& arena/.venv/Scripts/python.exe -m pip install -r arena/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha nas dependências da arena.' }
if ($WithTablebases) {
    & arena/.venv/Scripts/python.exe scripts/install_syzygy.py
    if ($LASTEXITCODE -ne 0) { throw 'Download incompleto. Rode o instalador novamente para retomar.' }
    & arena/.venv/Scripts/python.exe scripts/verify_syzygy.py
    if ($LASTEXITCODE -ne 0) { throw 'Verificação Syzygy falhou.' }
}
Write-Host 'Preparação concluída. Execute .\scripts\jogar.ps1 para abrir a interface.'
