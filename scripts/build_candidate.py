"""Build Windows isolado via WSL/MinGW; PGO executado nativamente no Windows."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", required=True)
    parser.add_argument("--arch", choices=["auto", "x86-64-avx2", "x86-64-avxvnni"], default="auto")
    parser.add_argument("--revision", default="HEAD", help="commit dos fontes, congelado no manifesto")
    parser.add_argument("--pgo", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]+", args.id):
        parser.error("ID inválido.")
    slot = ROOT / "bin" / args.id
    if slot.exists():
        parser.error(f"Slot já existe; use outro ID: {slot}")
    revision = subprocess.check_output(["git", "rev-parse", "--verify", f"{args.revision}^{{commit}}"], cwd=ROOT, text=True).strip()
    tree = subprocess.check_output(["git", "rev-parse", f"{revision}:Stockfish"], cwd=ROOT, text=True).strip()
    flags = subprocess.check_output(["wsl", "-d", "Ubuntu-24.04", "--", "lscpu"], text=True)
    if args.arch == "auto":
        args.arch = "x86-64-avxvnni" if "avx_vnni" in flags else "x86-64-avx2"
    if "avx2" not in flags or (args.arch == "x86-64-avxvnni" and "avx_vnni" not in flags):
        parser.error("CPU incompatível com esta arquitetura. Nenhum binário foi criado.")
    slot.mkdir(parents=True)
    source = slot / "source"
    source.mkdir()
    archive = slot / "source.tar"
    subprocess.run(["git", "archive", "--format=tar", f"--output={archive}", f"{revision}:Stockfish"], cwd=ROOT, check=True)
    subprocess.run(["tar", "-xf", str(archive), "-C", str(source)], check=True)
    src = source / "src"
    networks = {}
    for network in (ROOT / "Stockfish" / "src").glob("*.nnue"):
        shutil.copy2(network, src / network.name)
        networks[network.name] = sha(network)
    linux = subprocess.check_output(["wsl", "-d", "Ubuntu-24.04", "--", "wslpath", "-a", str(src)], text=True).strip()
    common = ["make", "-j4", f"ARCH={args.arch}", "COMP=mingw", "TARGET_KERNEL=Windows"]

    def make(target: str) -> None:
        print(f"{args.id}: {target}", flush=True)
        with (slot / f"{target}.log").open("w", encoding="utf8") as log:
            subprocess.run(["wsl", "-d", "Ubuntu-24.04", "--cd", linux, "--", *common, target], stdout=log, stderr=subprocess.STDOUT, check=True)

    if args.pgo:
        # make profile-build no WSL tentaria executar o .exe com cwd ambíguo.
        # Mantemos o mesmo diretório para gerar e consumir os perfis GCC.
        make("gcc-profile-make")
        with (slot / "pgo-training.log").open("w", encoding="utf8") as log:
            subprocess.run([str(src / "stockfish.exe"), "bench"], cwd=src, stdout=log, stderr=subprocess.STDOUT, timeout=300, check=True)
        profiles = list((src / "profdir").rglob("*.gcda"))
        if not profiles:
            raise RuntimeError("PGO não gerou perfis; candidato não publicado.")
        make("objclean")
        make("gcc-profile-use")
        log = (slot / "gcc-profile-use.log").read_text(encoding="utf8")
        if "profile count data file not found" in log or "coverage-mismatch" in log:
            raise RuntimeError("PGO não consumiu os perfis corretamente; consulte o log.")
    else:
        profiles = []
        make("build")
    binary = slot / "stockfish.exe"
    shutil.copy2(src / "stockfish.exe", binary)
    compiler = subprocess.check_output(["wsl", "-d", "Ubuntu-24.04", "--", "x86_64-w64-mingw32-c++-posix", "--version"], text=True).splitlines()[0]
    manifest = {"id": args.id, "sourceCommit": revision, "stockfishTree": tree,
                "architecture": args.arch, "pgo": args.pgo, "profileFiles": len(profiles),
                "compiler": compiler, "networks": networks, "binarySha256": sha(binary)}
    (slot / "build.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == "__main__":
    main()
