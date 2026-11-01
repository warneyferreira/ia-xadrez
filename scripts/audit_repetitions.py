"""Audita encerramentos antigos sem alterar PGNs e pesquisa a escolha real do motor."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import math
import sys
from pathlib import Path
import chess
import chess.engine
import chess.pgn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'arena'))
from process_lock import acquire, release, atomic_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pgn', type=Path, required=True)
    parser.add_argument('--engine', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seconds', type=float, default=3)
    args = parser.parse_args()
    if args.output.exists() or not math.isfinite(args.seconds) or not 0 < args.seconds <= 120:
        parser.error('Use pasta de saída nova e tempo entre 0 e 120 s.')
    acquire(args.output)
    args.output.mkdir(parents=True)
    rows = []
    try:
        with args.pgn.open(encoding='utf8') as stream, chess.engine.SimpleEngine.popen_uci(str(args.engine.resolve())) as engine:
            engine.configure({'Threads': 2, 'Hash': 256})
            while (game := chess.pgn.read_game(stream)) is not None:
                if game.errors:
                    raise ValueError('PGN contém erros: ' + str(game.errors))
                board = game.end().board()
                row = {'game': len(rows) + 1, 'termination': game.headers.get('Termination'),
                       'plies': board.ply(), 'currentThreefold': board.is_repetition(3),
                       'claimableThreefold': board.can_claim_threefold_repetition(),
                       'automaticOutcome': str(board.outcome(claim_draw=False)), 'choices': []}
                if row['claimableThreefold'] and not row['currentThreefold'] and not board.is_game_over():
                    infos = engine.analyse(board, chess.engine.Limit(time=args.seconds), multipv=2, game=object())
                    for info in infos:
                        move = info['pv'][0]
                        child = board.copy(); child.push(move)
                        row['choices'].append({'move': move.uci(), 'san': board.san(move),
                            'whiteCp': info['score'].white().score(mate_score=10000), 'depth': info.get('depth'),
                            'lowerbound': info.get('lowerbound', False), 'upperbound': info.get('upperbound', False),
                            'producesThirdRepetition': child.is_repetition(3),
                            'pv': [m.uci() for m in info['pv']]})
                rows.append(row)
                atomic_json(args.output / 'progress.json', {'completed': len(rows), 'rows': rows})
                print(json.dumps(row, ensure_ascii=True), flush=True)
    finally:
        release()
    report = {'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'pgnSha256': hashlib.sha256(args.pgn.read_bytes()).hexdigest(),
              'engineSha256': hashlib.sha256(args.engine.read_bytes()).hexdigest(),
              'secondsPerPosition': args.seconds, 'threads': 2, 'hashMB': 256, 'rows': rows,
              'note': 'A reclamação antecipada era permitida, mas imposta pela arena. As avaliações limitadas não provam vitória perdida. Histórico original preservado.'}
    atomic_json(args.output / 'report.json', report)


if __name__ == '__main__':
    main()
