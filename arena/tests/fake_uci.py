#!/usr/bin/env python3
"""Engine UCI determinística mínima usada apenas para testar a arena."""

from __future__ import annotations

import sys
import os

import chess


def position_from_command(command: str) -> chess.Board:
    tokens = command.split()
    if tokens[1:2] != ["startpos"]:
        raise ValueError("fake engine aceita apenas position startpos")
    board = chess.Board()
    if "moves" in tokens:
        for uci in tokens[tokens.index("moves") + 1 :]:
            board.push_uci(uci)
    return board


def main() -> int:
    board = chess.Board()
    pending = False
    if '--pid-file' in sys.argv:
        from pathlib import Path
        Path(sys.argv[sys.argv.index('--pid-file')+1]).write_text(str(os.getpid()))
    for raw in sys.stdin:
        command = raw.strip()
        if command == "uci":
            print("id name Arena Fake UCI", flush=True)
            print("id author Chess Challenge", flush=True)
            print("option name Threads type spin default 1 min 1 max 128", flush=True)
            print("option name Hash type spin default 16 min 1 max 65536", flush=True)
            print("option name Ponder type check default false", flush=True)
            print("uciok", flush=True)
        elif command == "isready":
            print("readyok", flush=True)
        elif command.startswith("position "):
            board = position_from_command(command)
        elif command.startswith("go "):
            if "--stall" in sys.argv:
                continue
            if 'ponder' in command.split():
                pending=True
                continue
            legal = list(board.legal_moves)
            print(f"bestmove {legal[0].uci() if legal else '0000'}", flush=True)
        elif command in ['ponderhit','stop'] and pending:
            pending=False
            legal=list(board.legal_moves)
            print(f"bestmove {legal[0].uci() if legal else '0000'}",flush=True)
        elif command == "quit":
            return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
