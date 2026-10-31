$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$linuxPath = (& wsl -d Ubuntu-24.04 -- wslpath -a $projectRoot).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Ubuntu-24.04/WSL indisponível. Consulte docs/USAGE.md.' }
& wsl -d Ubuntu-24.04 -- bash -c 'cd "$1" && make -j4 build ARCH=x86-64-avx2 COMP=mingw TARGET_KERNEL=Windows' chess-build "$linuxPath/Stockfish/src"
if ($LASTEXITCODE -ne 0) { throw 'Build falhou. No Ubuntu instale make e g++-mingw-w64-x86-64-posix e tente novamente.' }
Get-FileHash -LiteralPath (Join-Path $projectRoot 'Stockfish\src\stockfish.exe') -Algorithm SHA256
