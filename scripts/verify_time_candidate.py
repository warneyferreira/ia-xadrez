"""Regressões do candidato de tempo: assinatura fixa, opção real e lances legais."""
from __future__ import annotations
import argparse
import asyncio
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path
import chess
import chess.engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'arena'))
from process_lock import acquire, release, atomic_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', type=Path, required=True)
    parser.add_argument('--baseline', type=Path, default=ROOT / 'bin/arthur-v2/stockfish.exe')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Use pasta de saída nova.')
    acquire(args.output)
    args.output.mkdir(parents=True)
    rows = []
    report = {'engineSha256': hashlib.sha256(args.engine.read_bytes()).hexdigest(),
              'baselineSha256': hashlib.sha256(args.baseline.read_bytes()).hexdigest(),
              'status': 'running', 'bench': {}, 'rows': rows}
    try:
        for name, binary in [('baseline', args.baseline), ('candidate', args.engine)]:
            run = subprocess.run([str(binary.resolve()), 'bench', '64', '1', '13', 'default', 'depth'],
                                 capture_output=True, text=True, timeout=120, check=True)
            output = run.stdout + run.stderr
            (args.output / f'{name}-bench.log').write_text(output, encoding='utf8')
            report['bench'][name] = int(re.search(r'Nodes searched\s*:\s*(\d+)', output)[1])
        if report['bench']['baseline'] != report['bench']['candidate']:
            raise AssertionError('A assinatura de profundidade fixa mudou com a opção desligada.')
        dataset = json.loads((ROOT / 'positions/conversion-v1.json').read_text(encoding='utf8'))
        positions = []
        for case in dataset['positions']:
            if case['kind'] != 'research':
                continue
            board = chess.Board(case.get('initialFen', chess.STARTING_FEN))
            for move in case.get('moves', []):
                board.push_uci(move)
            positions.append((case['id'], board))
        with chess.engine.SimpleEngine.popen_uci(str(args.engine.resolve())) as engine:
            assert engine.options['Tournament Critical Time'].default is False
            engine.configure({'Threads': 1, 'Hash': 128, 'Move Overhead': 20})
            cases = [(name, board, flag, 30, 0) for name, board in positions for flag in [False, True]]
            cases += [
                ('low-clock', positions[0][1], True, 14, 0),
                ('increment', positions[0][1], True, 30, 1),
                ('forced', chess.Board('7k/8/6K1/8/8/8/8/R7 b - - 0 1'), True, 30, 0),
                ('mate', chess.Board('7k/6pp/5KQ1/8/8/8/8/8 w - - 0 1'), True, 30, 0),
            ]
            for name, board, enabled, clock, increment in cases:
                engine.configure({'Tournament Critical Time': enabled})
                started = time.monotonic()
                pending = asyncio.run_coroutine_threadsafe(engine.protocol.play(board,
                    chess.engine.Limit(white_clock=clock, black_clock=clock, white_inc=increment, black_inc=increment),
                    info=chess.engine.INFO_ALL, game=object()), engine.protocol.loop)
                try:
                    reply = pending.result(timeout=clock + 2)
                except TimeoutError:
                    pending.cancel(); engine.close(); raise
                assert reply.move in board.legal_moves
                elapsed = time.monotonic() - started
                active = 'Tournament Critical Time target x1.20' in reply.info.get('string', '')
                assert enabled or not active
                assert elapsed < clock
                if name in ['low-clock', 'increment', 'forced', 'mate']:
                    assert not active
                if name == 'mate':
                    after = board.copy(); after.push(reply.move); assert after.is_checkmate()
                rows.append({'case': name, 'enabled': enabled, 'activated': active,
                             'seconds': elapsed, 'clockSeconds': clock,
                             'move': reply.move.uci(), 'depth': reply.info.get('depth'),
                             'nodes': reply.info.get('nodes')})
                atomic_json(args.output / 'report.json', report)
                print(json.dumps(rows[-1]), flush=True)
        assert any(row['activated'] for row in rows), 'Ativação não observada: não publicar candidato.'
        report['status'] = 'passed'
    except Exception as exc:
        report.update(status='failed', error=str(exc))
        raise
    finally:
        atomic_json(args.output / 'report.json', report)
        release()


if __name__ == '__main__':
    main()
