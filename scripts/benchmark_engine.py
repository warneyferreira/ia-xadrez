"""Benchmark local ABBA: compara velocidade, nunca declara Elo."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import platform
import re
import statistics
import subprocess
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--threads", type=int, nargs="+", default=[1, 2, 4, 6, 8])
    parser.add_argument("--depth", type=int, default=13)
    parser.add_argument("--rounds", type=int, default=4)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or args.rounds < 2 or args.depth < 1 or any(t < 1 or t > 128 for t in args.threads):
        parser.error("Saída deve ser nova; use >=2 rodadas e threads válidas.")
    binaries = {"baseline": args.baseline.resolve(), "candidate": args.candidate.resolve()}
    args.output.mkdir(parents=True)
    samples = []
    for label, binary in binaries.items():
        print(f"Aquecendo {label}...", flush=True)
        subprocess.run([str(binary), "bench", "64", "1", str(args.depth), "default", "depth"], capture_output=True, timeout=300, check=True)
    for threads in args.threads:
        for round_ in range(args.rounds):
            for label in (["baseline", "candidate"] if round_ % 2 == 0 else ["candidate", "baseline"]):
                started = time.monotonic()
                run = subprocess.run([str(binaries[label]), "bench", "64", str(threads), str(args.depth), "default", "depth"],
                                     capture_output=True, text=True, timeout=300, check=True)
                output = run.stdout + run.stderr
                (args.output / f"{threads}t-{round_}-{label}.log").write_text(output, encoding="utf8")
                def value(pattern: str) -> int:
                    found = re.search(pattern, output)
                    if not found:
                        raise RuntimeError("Resumo do benchmark ausente; consulte os logs.")
                    return int(found[1])
                sample = {"engine": label, "threads": threads, "round": round_, "nodes": value(r"Nodes searched\s*:\s*(\d+)"),
                          "nps": value(r"Nodes/second\s*:\s*(\d+)"), "millis": value(r"Total time \(ms\)\s*:\s*(\d+)"),
                          "wallSeconds": round(time.monotonic() - started, 3)}
                samples.append(sample)
                print(json.dumps(sample), flush=True)
                # Salva progresso; uma interrupção não apaga medições já feitas.
                (args.output / "samples.json").write_text(json.dumps(samples, indent=2), encoding="utf8")
    summary = []
    for threads in args.threads:
        grouped = {label: [s for s in samples if s["threads"] == threads and s["engine"] == label] for label in binaries}
        medians = {label: statistics.median(s["nps"] for s in rows) for label, rows in grouped.items()}
        summary.append({"threads": threads, "medianNps": medians,
                        "candidateSpeedupPercent": round(100 * (medians["candidate"] / medians["baseline"] - 1), 2),
                        "oneThreadNodesIdentical": len({s["nodes"] for rows in grouped.values() for s in rows}) == 1 if threads == 1 else None})
    report = {"createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "platform": platform.platform(),
              "depth": args.depth, "rounds": args.rounds,
              "binaries": {k: {"path": str(v), "sha256": hashlib.sha256(v.read_bytes()).hexdigest()} for k, v in binaries.items()},
              "summary": summary, "samples": samples,
              "note": "Velocidade de busca na máquina atual, não ganho de Elo. NPS entre quantidades de threads não compara trabalho útil nem força."}
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
