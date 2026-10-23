#!/usr/bin/env bash
# Gera bin/ na raiz do repositório com a interface e o motor:
#   bin/ia-xadrez.exe + bin/stockfish.exe   (Windows x86-64)
#   bin/ia-xadrez     + bin/stockfish       (Linux x86-64)
# O motor é o build "universal" do Stockfish: escolhe AVX2/AVX-VNNI/AVX-512... em tempo de
# execução, então roda em qualquer CPU x86-64.
#
# Uso: ui/build.sh        # motor + interface (o motor leva alguns minutos)
#      ui/build.sh ui     # só a interface
# Requer (Debian/WSL): g++, make, curl, x86_64-w64-mingw32-g++, node/npm.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/bin"
JOBS="${JOBS:-$(nproc)}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$BIN"

# Compila numa cópia para não misturar objetos com o build nativo em Stockfish/src.
build_engine() {
  local out=$1
  shift
  local dir="$WORK/${out%.exe}-$RANDOM"
  cp -a "$ROOT/Stockfish/." "$dir/"
  make -C "$dir/src" -s clean
  make -C "$dir/src" -j"$JOBS" ARCH=x86-64-universal "$@" build
  cp "$dir/src/$out" "$BIN/$out"
}

if [[ "${1:-}" != "ui" ]]; then
  build_engine stockfish
  # TARGET_KERNEL: o Makefile deduz o sistema-alvo pelo `uname` do host; sem isso o link
  # final do binário universal usa flags de Linux e falha com o MinGW.
  build_engine stockfish.exe COMP=mingw TARGET_KERNEL=Windows OBJCOPY=x86_64-w64-mingw32-objcopy
fi

cd "$ROOT/ui"
npm ci --no-audit --no-fund
npx bun build --compile --minify --target=bun-linux-x64 src/server.ts --outfile "$BIN/ia-xadrez"
npx bun build --compile --minify --target=bun-windows-x64 src/server.ts --outfile "$BIN/ia-xadrez.exe"

echo
ls -lh "$BIN"
