$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$slot = Join-Path $projectRoot 'bin\baseline-effdc3fd3'
if (Test-Path -LiteralPath "$slot\stockfish.exe") { Write-Host 'Baseline já existe; não será substituído.'; return }
$source = Join-Path $projectRoot 'bin\baseline-source-effdc3fd3'
New-Item -ItemType Directory -Force -Path $slot,$source | Out-Null
& git archive --format=tar --output bin/baseline-source.tar '6867444:Stockfish'
if ($LASTEXITCODE -ne 0) { throw 'Commit histórico não disponível. Faça git fetch origin antes do build.' }
& tar -xf bin/baseline-source.tar -C $source
if ($LASTEXITCODE -ne 0) { throw 'Extração do baseline falhou.' }
$linuxPath = (& wsl -d Ubuntu-24.04 -- wslpath -a $source).Trim()
& wsl -d Ubuntu-24.04 -- bash -c 'cd "$1" && make -j4 build ARCH=x86-64-avx2 COMP=mingw TARGET_KERNEL=Windows' chess-baseline "$linuxPath/src"
if ($LASTEXITCODE -ne 0) { throw 'Build do baseline falhou. Instale make e g++-mingw-w64-x86-64-posix no Ubuntu.' }
Copy-Item -LiteralPath "$source\src\stockfish.exe" -Destination "$slot\stockfish.exe"
Get-FileHash -LiteralPath "$slot\stockfish.exe"
