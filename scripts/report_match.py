"""Gera um relatório compacto dos arquivos da arena, sem disputar CPU com engines."""
from pathlib import Path
import argparse
import datetime as dt
import json
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'arena'))
from diagnostics import match_report
from process_lock import active_run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('match', type=Path)
    parser.add_argument('--wait',action='store_true',help='aguarda terminar, sem iniciar buscas de xadrez')
    args = parser.parse_args()
    folder = args.match.resolve()
    deadline = time.monotonic()+4*60*60
    while args.wait and not (folder/'summary.json').exists() and time.monotonic()<deadline:
        active = active_run()
        if not active or not active.get('output_dir') or Path(active['output_dir']).resolve()!=folder:
            break
        time.sleep(15)
    active = active_run()
    running = bool(active and active.get('output_dir') and Path(active['output_dir']).resolve() == folder)
    report = match_report(folder, running)
    target = ROOT / 'results/analysis' / f"{folder.name}-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.report.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('x', encoding='utf8', newline='\n') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'report': str(target), 'status': report['status'],
                      'recordedGames': report['recordedGames'], 'scores': report['scores']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
