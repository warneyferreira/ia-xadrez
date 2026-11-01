"""Build Windows isolado via WSL/MinGW; PGO executado nativamente no Windows."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import urllib.request
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
    parser.add_argument("--resume", action="store_true", help="retoma slot externo incompleto com o mesmo SHA")
    parser.add_argument("--repository", choices=["https://github.com/official-stockfish/Stockfish.git"],
                        help="fonte oficial externa, sempre em commit SHA completo e slot isolado")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]+", args.id):
        parser.error("ID inválido.")
    slot = ROOT / "bin" / args.id
    if slot.exists() and not args.resume:
        parser.error(f"Slot já existe; use outro ID: {slot}")
    if args.resume and (not args.repository or (slot / 'build.json').exists()):
        parser.error('Retomada exige fonte externa e slot ainda não publicado.')
    if args.repository and not re.fullmatch(r'[a-f0-9]{40}',args.revision):
        parser.error('Fonte externa exige SHA completo, sem branch flutuante.')
    if not args.repository:
        revision = subprocess.check_output(["git", "rev-parse", "--verify", f"{args.revision}^{{commit}}"], cwd=ROOT, text=True).strip()
        tree = subprocess.check_output(["git", "rev-parse", f"{revision}:Stockfish"], cwd=ROOT, text=True).strip()
    flags = subprocess.check_output(["wsl", "-d", "Ubuntu-24.04", "--", "lscpu"], text=True)
    if args.arch == "auto":
        args.arch = "x86-64-avxvnni" if "avx_vnni" in flags else "x86-64-avx2"
    if "avx2" not in flags or (args.arch == "x86-64-avxvnni" and "avx_vnni" not in flags):
        parser.error("CPU incompatível com esta arquitetura. Nenhum binário foi criado.")
    slot.mkdir(parents=True, exist_ok=args.resume)
    source = slot / "source"
    source.mkdir(exist_ok=args.resume)
    if args.repository:
        if not args.resume:
            subprocess.run(['git','init','--quiet',str(source)],check=True)
            subprocess.run(['git','-C',str(source),'fetch','--quiet','--depth=1',args.repository,args.revision],check=True)
            subprocess.run(['git','-C',str(source),'-c','core.autocrlf=false','-c','core.eol=lf','checkout','--quiet','--detach','FETCH_HEAD'],check=True)
        revision=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
        if revision!=args.revision: raise RuntimeError('Fonte externa não corresponde ao SHA solicitado.')
        if subprocess.check_output(['git','-C',str(source),'diff','HEAD','--'],text=True).strip():
            raise RuntimeError('Fontes externas alteradas; use um slot limpo.')
        tree=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD^{tree}'],text=True).strip()
    else:
        archive = slot / "source.tar"
        subprocess.run(["git", "archive", "--format=tar", f"--output={archive}", f"{revision}:Stockfish"], cwd=ROOT, check=True)
        subprocess.run(["tar", "-xf", str(archive), "-C", str(source)], check=True)
    src = source / "src"
    networks = {}
    names=set(re.findall(r'"(nn-[a-f0-9]{12}\.nnue)"',(src/'evaluate.h').read_text(encoding='utf8')))
    if not names: raise RuntimeError('Nenhuma rede padrão declarada nos fontes.')
    for name in names:
        network=ROOT/'Stockfish/src'/name
        target=src/name
        if target.exists() and sha(target).startswith(name[3:15]):
            pass
        elif network.exists(): shutil.copy2(network,target)
        else:
            print(f'{args.id}: baixando rede oficial {name}',flush=True)
            failures=[]
            for url in ('https://tests.stockfishchess.org/api/nn/'+name,
                        'https://media.githubusercontent.com/media/official-stockfish/networks/master/'+name):
                try:
                    with urllib.request.urlopen(url,timeout=120) as response, target.open('wb') as output:
                        shutil.copyfileobj(response,output,1024*1024)
                    if not sha(target).startswith(name[3:15]): raise RuntimeError('SHA da rede incorreto')
                    break
                except (OSError, RuntimeError) as exc:
                    failures.append(f'{url}: {exc}')
            else:
                raise RuntimeError('Download oficial falhou: '+'; '.join(failures))
        digest=sha(target)
        if not digest.startswith(name[3:15]): raise RuntimeError('Hash da rede não corresponde ao nome oficial.')
        networks[name]=digest
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
                "repository": args.repository or "project-local",
                "architecture": args.arch, "pgo": args.pgo, "profileFiles": len(profiles),
                "compiler": compiler, "networks": networks, "binarySha256": sha(binary)}
    (slot / "build.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == "__main__":
    main()
