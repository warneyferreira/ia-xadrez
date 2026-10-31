"""Reanalisa repertório offline; só mantém lances estáveis em duas buscas independentes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import chess
import chess.engine


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", type=Path, required=True)
    parser.add_argument("--input", type=Path, default=Path("openings/arthur-prepared.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=2)
    parser.add_argument("--min-depth", type=int, default=18)
    args = parser.parse_args()
    manifest_path = args.output.with_suffix(".manifest.json")
    if args.output.exists() or manifest_path.exists() or args.seconds <= 0 or args.min_depth < 1:
        parser.error("Use saídas novas e limites positivos.")
    entries = json.loads(args.input.read_text(encoding="utf8"))
    accepted, rejected = {}, []
    engine_path = args.engine.resolve()
    with chess.engine.SimpleEngine.popen_uci(str(engine_path)) as engine:
        engine.configure({"Threads": 1, "Hash": 128})
        for key in entries:
            board = chess.Board(key + " 0 1")
            if not board.is_valid() or board.is_game_over():
                raise ValueError(f"Posição inválida no repertório: {key}")
            searches = []
            for _ in range(2):
                # Tokens distintos forçam ucinewgame/limpeza de Hash pelo python-chess.
                searches.append(engine.analyse(board, chess.engine.Limit(time=args.seconds), game=object()))
            first, second = searches
            stable = (first.get("pv") and second.get("pv") and first["pv"][0] == second["pv"][0]
                      and min(first.get("depth", 0), second.get("depth", 0)) >= args.min_depth)
            if stable:
                accepted[key] = {"move": second["pv"][0].uci(), "depth": second["depth"],
                                 "whiteCp": second["score"].white().score(mate_score=10000)}
            else:
                rejected.append(key)
            print(f"{len(accepted) + len(rejected)}/{len(entries)}: {len(accepted)} estáveis", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(accepted, indent=2) + "\n", encoding="utf8")
    manifest = {"engineSha256": hashlib.sha256(engine_path.read_bytes()).hexdigest(),
                "inputSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
                "outputSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
                "secondsPerSearch": args.seconds, "searchesPerPosition": 2,
                "minimumDepth": args.min_depth, "accepted": len(accepted), "rejected": rejected,
                "status": "RETEST: estabilidade de busca não comprova vantagem em partidas; não promover automaticamente."}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
