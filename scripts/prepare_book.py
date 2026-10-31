"""Gera repertório pequeno com análise local; executar antes da competição."""
import json
from pathlib import Path
import chess
import chess.engine

engine_path = Path('Stockfish/src/stockfish.exe').resolve()
book = {}
with chess.engine.SimpleEngine.popen_uci(str(engine_path)) as engine:
    engine.configure({'Threads': 1, 'Hash': 64})
    for prefix in ([], ['e2e4'], ['d2d4'], ['c2c4'], ['g1f3']):
        board = chess.Board()
        for move in prefix:
            board.push_uci(move)
        for _ in range(8):
            info = engine.analyse(board, chess.engine.Limit(time=0.5))
            move = info['pv'][0]
            key = ' '.join(board.fen().split()[:4])
            book[key] = {'move': move.uci(), 'depth': info.get('depth', 0),
                         'whiteCp': info['score'].white().score(mate_score=10000)}
            board.push(move)
Path('openings/arthur-prepared.json').write_text(json.dumps(book, indent=2), encoding='utf-8')
print(f'{len(book)} posições preparadas; repertório preliminar, sem ganho de Elo demonstrado.')
