#!/usr/bin/env python3
"""Arena sequencial e reproduzível para duas engines UCI.

Uso: python arena/run_match.py arena/configs/a-vs-b.json [--dry-run]
Comandos de engine são listas, nunca strings de shell.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import math
import os
import datetime as dt
import json
import platform
import random
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chess
import chess.engine
import chess.pgn
from match_statistics import paired_summary
from process_lock import acquire, release, atomic_json
from adjudication import outcome as adjudicate, POLICIES


@dataclass(frozen=True)
class Candidate:
    name: str
    command: tuple[str, ...]
    options: dict[str, Any]


@dataclass(frozen=True)
class Opening:
    initial_fen: str
    moves: tuple[chess.Move, ...]
    label: str


class MatchError(RuntimeError):
    pass


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise MatchError(f"Configuração não encontrada: {path}") from exc
    except json.JSONDecodeError as exc:
        raise MatchError(f"JSON inválido em {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise MatchError("A configuração precisa ser um objeto JSON.")
    return data


def candidate_from_config(raw: Any, field: str) -> Candidate:
    if not isinstance(raw, dict):
        raise MatchError(f"{field} precisa ser um objeto.")
    name, command, options = raw.get("name"), raw.get("command"), raw.get("options", {})
    if not isinstance(name, str) or not name.strip():
        raise MatchError(f"{field}.name precisa ser texto não vazio.")
    if not isinstance(command, list) or not command or not all(isinstance(item, str) and item for item in command):
        raise MatchError(f"{field}.command precisa ser uma lista não vazia de strings.")
    if not isinstance(options, dict):
        raise MatchError(f"{field}.options precisa ser um objeto.")
    return Candidate(name=name, command=tuple(command), options=options)


def engine_options(candidate: Candidate) -> dict[str, Any]:
    """Remove opções que python-chess gerencia e rejeita ponder em testes."""
    ponder = candidate.options.get("Ponder", False)
    if ponder is not False:
        raise MatchError(f"{candidate.name}: a arena exige Ponder=false.")
    return {name: value for name, value in candidate.options.items() if name != "Ponder"}


def git_revision() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def load_openings(config: dict[str, Any], config_dir: Path) -> list[Opening]:
    raw = config.get("openings", {})
    if not isinstance(raw, dict):
        raise MatchError("openings precisa ser um objeto.")
    pgn_value = raw.get("pgn")
    if pgn_value is None:
        return [Opening(chess.STARTING_FEN, (), "startpos")]
    if not isinstance(pgn_value, str) or not pgn_value:
        raise MatchError("openings.pgn deve ser null ou um caminho de PGN.")
    pgn_path = (config_dir / pgn_value).resolve()
    try:
        handle = pgn_path.open("r", encoding="utf-8")
    except OSError as exc:
        raise MatchError(f"Não foi possível abrir openings.pgn: {pgn_path}") from exc
    openings: list[Opening] = []
    with handle:
        index = 0
        while game := chess.pgn.read_game(handle):
            index += 1
            if game.errors:
                raise MatchError(f"PGN inválido no jogo {index}: {game.errors[0]}")
            board = game.board()
            initial_fen = board.fen()
            moves = tuple(game.mainline_moves())
            for move in moves:
                if move not in board.legal_moves:
                    raise MatchError(f"Opening inválida no jogo {index} de {pgn_path}: {move.uci()}")
                board.push(move)
            label = game.headers.get("Event") or f"opening-{index}"
            openings.append(Opening(initial_fen, moves, label))
    if not openings:
        raise MatchError(f"Nenhuma partida foi encontrada em {pgn_path}.")
    return openings


def result_for_side(result: str, side: chess.Color) -> str:
    if result == "1/2-1/2":
        return "draw"
    if (result == "1-0") == (side == chess.WHITE):
        return "win"
    return "loss"


def annotate_search(node, move, info):
    """Anota somente avaliação da própria busca, vinculada ao lance retornado."""
    if (info.get('string','').startswith('PreparedRepertoire ') or
            info.get('lowerbound') or info.get('upperbound')):
        return
    pv=info.get('pv',[])
    if info.get('score') is not None and pv and pv[0]==move:
        node.set_eval(info['score'],info.get('depth'))


def run_game(
    white: Candidate,
    black: Candidate,
    opening: Opening,
    base_seconds: float,
    increment_seconds: float,
    max_plies: int,
    on_progress=None,
    draw_policy: str = "played",
) -> tuple[chess.pgn.Game, dict[str, Any]]:
    if draw_policy not in POLICIES:
        raise MatchError("draw_policy deve ser played ou claimable.")
    board = chess.Board(opening.initial_fen)
    game = chess.pgn.Game()
    if opening.initial_fen != chess.STARTING_FEN:
        game.setup(chess.Board(opening.initial_fen))
    node = game
    for move in opening.moves:
        if move not in board.legal_moves:
            raise MatchError(f"Opening {opening.label!r} contém lance ilegal: {move.uci()}")
        node = node.add_variation(move)
        board.push(move)

    remaining = {chess.WHITE: base_seconds, chess.BLACK: base_seconds}
    elapsed = {chess.WHITE: 0.0, chess.BLACK: 0.0}
    book_hits = {chess.WHITE: 0, chess.BLACK: 0}
    engines: dict[chess.Color, chess.engine.SimpleEngine] = {}
    crash: dict[str, Any] | None = None
    termination, result = "max plies", "*"
    starting: tuple[chess.Color, Candidate] | None = None
    try:
        for color, candidate in ((chess.WHITE, white), (chess.BLACK, black)):
            starting = (color, candidate)
            engine = chess.engine.SimpleEngine.popen_uci(list(candidate.command), timeout=15)
            engines[color] = engine
            engine.configure(engine_options(candidate))
            starting = None
        while len(board.move_stack) < max_plies:
            outcome = adjudicate(board, draw_policy)
            if outcome is not None:
                result = outcome.result()
                termination = outcome.termination.name.lower().replace("_", " ")
                break
            color = board.turn
            started = time.monotonic()
            if on_progress:
                on_progress({"phase": "thinking", "fen": board.fen(), "plies": len(board.move_stack),
                             "turn": "white" if color else "black", "thinkingSince": dt.datetime.now(dt.timezone.utc).isoformat(),
                             "whiteRemaining": remaining[chess.WHITE], "blackRemaining": remaining[chess.BLACK]})
            limit = chess.engine.Limit(
                white_clock=remaining[chess.WHITE], black_clock=remaining[chess.BLACK],
                white_inc=increment_seconds, black_inc=increment_seconds,
            )
            try:
                # SimpleEngine.play não aplica timeout quando Limit só contém relógios.
                # Future.result limita a espera mesmo se o motor ignorar stop.
                engine = engines[color]
                pending = asyncio.run_coroutine_threadsafe(
                    engine.protocol.play(board, limit, info=chess.engine.INFO_BASIC | chess.engine.INFO_SCORE | chess.engine.INFO_PV), engine.protocol.loop)
                try:
                    reply = pending.result(timeout=max(0, remaining[color]) + 1)
                except TimeoutError:
                    pending.cancel()
                    engine.close()
                    raise
            except (chess.engine.EngineError, chess.engine.EngineTerminatedError, TimeoutError) as exc:
                crash = {"candidate": white.name if color == chess.WHITE else black.name, "error": str(exc)}
                result = "0-1" if color == chess.WHITE else "1-0"
                termination = "engine failure"
                break
            spent = time.monotonic() - started
            if reply.info.get('string','').startswith('PreparedRepertoire '): book_hits[color] += 1
            elapsed[color] += spent
            remaining[color] -= spent
            if remaining[color] < 0:
                result = "0-1" if color == chess.WHITE else "1-0"
                termination = "time forfeit"
                break
            if reply.move is None or reply.move not in board.legal_moves:
                crash = {"candidate": white.name if color == chess.WHITE else black.name,
                         "error": f"Engine returned illegal move {reply.move}"}
                result = "0-1" if color == chess.WHITE else "1-0"
                termination = "illegal engine move"
                break
            node = node.add_variation(reply.move)
            node.set_clock(remaining[color] + increment_seconds)
            node.set_emt(spent)
            annotate_search(node,reply.move,reply.info)
            board.push(reply.move)
            remaining[color] += increment_seconds
        else:
            outcome = adjudicate(board, draw_policy)
            if outcome is not None:
                result = outcome.result()
                termination = outcome.termination.name.lower().replace("_", " ")
    except (OSError, chess.engine.EngineError, chess.engine.EngineTerminatedError, TimeoutError) as exc:
        if starting is None:
            raise
        color, candidate = starting
        crash = {"candidate": candidate.name, "error": str(exc)}
        result = "0-1" if color == chess.WHITE else "1-0"
        termination = "engine startup failure"
    finally:
        for engine in engines.values():
            try:
                engine.quit()
            except (chess.engine.EngineError, chess.engine.EngineTerminatedError, TimeoutError):
                pass

    game.headers.update({"White": white.name, "Black": black.name, "Result": result,
                         "Event": "Chess Challenge Arena", "Opening": opening.label,
                         "Termination": termination, "DrawPolicy": draw_policy,
                         "EvaluationSource": "native search; exact PV only; no extra analysis"})
    return game, {
        "white": white.name, "black": black.name, "opening": opening.label,
        "opening_key": hashlib.sha256((opening.initial_fen + " " + " ".join(m.uci() for m in opening.moves)).encode()).hexdigest(),
        "result": result, "termination": termination, "plies": len(board.move_stack),
        "white_seconds": round(elapsed[chess.WHITE], 3),
        "black_seconds": round(elapsed[chess.BLACK], 3), "crash": crash,
        "draw_policy": draw_policy,
        "book_hits": {"white": book_hits[chess.WHITE], "black": book_hits[chess.BLACK]},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Executa um match sequencial entre duas engines UCI.")
    parser.add_argument("config", type=Path, help="caminho do JSON de configuração")
    parser.add_argument("--dry-run", action="store_true", help="valida e mostra o pareamento sem iniciar engines")
    args = parser.parse_args()
    try:
        config_path = args.config.resolve()
        config = read_json(config_path)
        match_id = config.get("match_id")
        if not isinstance(match_id, str) or not match_id.strip():
            raise MatchError("match_id precisa ser texto não vazio.")
        candidate_a = candidate_from_config(config.get("candidate_a"), "candidate_a")
        candidate_b = candidate_from_config(config.get("candidate_b"), "candidate_b")
        if candidate_a.name == candidate_b.name:
            raise MatchError("Candidatos precisam ter nomes diferentes.")
        engine_options(candidate_a)
        engine_options(candidate_b)
        games = config.get("games")
        if not isinstance(games, int) or games < 2 or games % 2:
            raise MatchError("games precisa ser inteiro par e >= 2.")
        draw_policy = config.get("draw_policy", "played")
        if draw_policy not in POLICIES:
            raise MatchError("draw_policy deve ser played ou claimable.")
        tc = config.get("time_control")
        if not isinstance(tc, dict):
            raise MatchError("time_control precisa ser um objeto.")
        base_seconds, increment_seconds = float(tc.get("base_seconds", 0)), float(tc.get("increment_seconds", 0))
        if not all(math.isfinite(t) for t in (base_seconds, increment_seconds)) or base_seconds <= 0 or increment_seconds < 0:
            raise MatchError("time_control requer base_seconds > 0 e increment_seconds >= 0.")
        max_plies = config.get("max_plies", 512)
        if not isinstance(max_plies, int) or max_plies < 2:
            raise MatchError("max_plies precisa ser inteiro >= 2.")
        output_value = config.get("output_dir")
        if not isinstance(output_value, str) or not output_value:
            raise MatchError("output_dir precisa ser texto não vazio.")
        openings_config = config.get("openings", {})
        seed = openings_config.get("seed", 0) if isinstance(openings_config, dict) else 0
        if not isinstance(seed, int):
            raise MatchError("openings.seed precisa ser inteiro.")
        openings = load_openings(config, config_path.parent)
    except (MatchError, ValueError) as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 2

    shuffled = list(openings)
    random.Random(seed).shuffle(shuffled)
    schedule = [shuffled[(index // 2) % len(shuffled)] for index in range(games)]
    print(f"Match: {match_id}\nA: {candidate_a.name} | B: {candidate_b.name}")
    print(f"Jogos: {games}; TC: {base_seconds}+{increment_seconds}; openings: {len(openings)}; seed: {seed}; draw_policy: {draw_policy}")
    for index, opening in enumerate(schedule, start=1):
        white, black = (candidate_a, candidate_b) if index % 2 else (candidate_b, candidate_a)
        print(f"{index:>4}: White={white.name}; Black={black.name}; opening={opening.label}")
    if args.dry_run:
        return 0

    output_dir = Path(output_value).resolve()
    if output_dir.exists():
        print(f"ERRO: output_dir já existe; escolha outro para não sobrescrever evidência: {output_dir}", file=sys.stderr)
        return 2
    try:
        acquire(output_dir)
    except RuntimeError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 2
    output_dir.mkdir(parents=True)
    fingerprints = {}
    for candidate in (candidate_a, candidate_b):
        executable = Path(candidate.command[0]).resolve()
        fingerprints[candidate.name] = {"command": candidate.command, "options": candidate.options,
                                       "binarySha256": hashlib.sha256(executable.read_bytes()).hexdigest() if executable.is_file() else None}
    metadata = {"started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "match_id": match_id,
                "engines": fingerprints,
                "git_revision": git_revision(), "python": sys.version, "platform": platform.platform(),
                "draw_policy": draw_policy, "config": config}
    (output_dir / "config.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    scores = {candidate_a.name: {"win": 0, "draw": 0, "loss": 0}, candidate_b.name: {"win": 0, "draw": 0, "loss": 0}}
    crashes = {candidate_a.name: 0, candidate_b.name: 0}
    unfinished = 0
    reports = []
    progress = {"pid": os.getpid(), "phase": "preparing", "game": 1, "games": games, "completed": 0,
                "startedAt": metadata["started_at"], "output_dir": str(output_dir)}
    atomic_json(output_dir / "progress.json", progress)
    with (output_dir / "games.pgn").open("w", encoding="utf-8") as pgn_file, (output_dir / "events.jsonl").open("w", encoding="utf-8") as event_file:
        for index, opening in enumerate(schedule, start=1):
            white, black = (candidate_a, candidate_b) if index % 2 else (candidate_b, candidate_a)
            print(f"Iniciando jogo {index}/{games}: {white.name} (brancas) vs {black.name} (pretas)")
            progress.update({"game": index, "white": white.name, "black": black.name, "opening": opening.label})
            def on_progress(update):
                progress.update(update)
                atomic_json(output_dir / "progress.json", progress)
            game, report = run_game(white, black, opening, base_seconds, increment_seconds, max_plies, on_progress, draw_policy)
            report["game"] = index
            reports.append(report)
            progress.update({"completed": index, "phase": "between-games", "thinkingSince": None})
            atomic_json(output_dir / "progress.json", progress)
            pgn_file.write(f"{game}\n\n")
            event_file.write(json.dumps(report, ensure_ascii=False) + "\n")
            pgn_file.flush()
            event_file.flush()
            print(f"  {report['result']} ({report['termination']}); {report['plies']} meios-lances", flush=True)
            if report['result'] == '*':
                unfinished += 1
            else:
                for candidate, color in ((white, chess.WHITE), (black, chess.BLACK)):
                    scores[candidate.name][result_for_side(report["result"], color)] += 1
            if report["crash"]:
                crashes[report["crash"]["candidate"]] += 1
    summary = {"finished_at": dt.datetime.now(dt.timezone.utc).isoformat(), "match_id": match_id,
               "paired": paired_summary(reports, candidate_a.name),
               "scores": scores, "crashes": crashes, "games": games, "unfinished": unfinished, "draw_policy": draw_policy,
               "note": "Relate W/D/L e crashes; não declare Elo sem amostra e análise estatística adequadas."}
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    progress.update({"phase": "finished", "finishedAt": summary["finished_at"]})
    atomic_json(output_dir / "progress.json", progress)
    release()
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
