"""Confere cobertura/arquivos e demonstra uma consulta offline com a engine."""
import hashlib
import json
import os
from pathlib import Path
import chess
import chess.engine
import chess.syzygy

root = Path(__file__).resolve().parents[1]
folder = Path(os.environ['LOCALAPPDATA']) / 'ChessChallenge' / 'syzygy' / '3-4-5'
manifest = json.loads((folder / 'manifest.json').read_text())
assert len(manifest) == 290
for row in manifest:
    file = folder / row['name']
    assert file.stat().st_size == row['size'], row['name']
    with file.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['name']
board = chess.Board('7k/8/8/8/8/8/6K1/5Q2 w - - 0 1')
with chess.syzygy.open_tablebase(str(folder)) as tb:
    wdl, dtz = tb.probe_wdl(board), tb.probe_dtz(board)
    assert wdl == 2 and dtz > 0
with chess.engine.SimpleEngine.popen_uci(str(root / 'Stockfish/src/stockfish.exe')) as engine:
    engine.configure({'Threads': 1, 'Hash': 32, 'SyzygyPath': str(folder), 'Syzygy50MoveRule': True})
    info = engine.analyse(board, chess.engine.Limit(depth=12))
    assert info.get('tbhits', 0) > 0, info
    report = {'files': len(manifest), 'path': str(folder), 'WDL': wdl, 'DTZ': dtz,
              'tbhits': info['tbhits'], 'pv': [m.uci() for m in info['pv']]}
    (root / 'tablebases-config/verification.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps(report, indent=2))
