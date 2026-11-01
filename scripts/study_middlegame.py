"""Seleciona decisões reais de meio-jogo e prepara uma comparação offline de trocas."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import chess.engine
import chess.pgn

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'arena'))
from diagnostics import match_report
from middlegame import collect_game_cases, select_cases, restore, compare_captures
from process_lock import acquire,release
from prepare_opponent import fresh_analysis


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='mode',required=True)
    collect=commands.add_parser('collect')
    collect.add_argument('match',type=Path)
    collect.add_argument('--output',type=Path,required=True)
    collect.add_argument('--maximum',type=int,default=8)
    study=commands.add_parser('analyze')
    study.add_argument('dataset',type=Path)
    study.add_argument('--engine',type=Path,default=ROOT/'bin/arthur-v5-nnue19/stockfish.exe')
    study.add_argument('--output',type=Path,required=True)
    study.add_argument('--depth',type=int,default=26)
    study.add_argument('--maximum',type=int,default=4)
    study.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    if not 1<=args.maximum<=20:parser.error('Use de 1 a 20 casos.')
    if args.output.exists():parser.error('Use uma saída nova para preservar os resultados.')
    if args.mode=='collect':
        folder=args.match.resolve();report=match_report(folder)
        if report['warnings']:parser.error('Leitura inconsistente dos registros; tente novamente após a gravação.')
        metadata=json.loads((folder/'config.json').read_text(encoding='utf-8-sig'))
        raw=(folder/'games.pgn').read_bytes()
        if hashlib.sha256(raw).hexdigest()!=report['sourceSha256'].get('games.pgn'):
            parser.error('PGN mudou durante a leitura; tente novamente.')
        candidate=metadata['config']['candidate_a']['name'];cases=[]
        stream=io.StringIO(raw.decode('utf-8-sig'))
        for index in range(len(report['games'])):
            game=chess.pgn.read_game(stream)
            cases.extend(collect_game_cases(game,candidate,index+1))
        data={'schema':'chess-middlegame-cases-v1','matchId':report['matchId'],
              'candidate':candidate,'sourcePgnSha256':hashlib.sha256(raw).hexdigest(),
              'sourceCompletedGames':len(report['games']),
              'purpose':'Pesquisa exploratória; não é holdout independente nem preferência automática por manter peças.',
              'cases':select_cases(cases,args.maximum)}
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with args.output.open('x',encoding='utf8',newline='\n') as f:json.dump(data,f,ensure_ascii=False,indent=2)
        print(json.dumps({'output':str(args.output),'cases':len(data['cases'])},ensure_ascii=False));return
    if not 18<=args.depth<=36:parser.error('Use profundidade entre 18 e 36.')
    raw=args.dataset.read_bytes();dataset=json.loads(raw)
    if dataset.get('schema')!='chess-middlegame-cases-v1':parser.error('Dataset incompatível.')
    cases=dataset['cases'][:args.maximum]
    if not cases:parser.error('Não há casos; aguarde uma partida completa com posições elegíveis.')
    for case in cases:restore(case)
    if args.dry_run:
        print(json.dumps({'cases':len(cases),'depth':args.depth,'engineStarted':False}));return
    acquire(args.output)
    try:
        args.output.mkdir(parents=True)
        rows=[]
        with chess.engine.SimpleEngine.popen_uci(str(args.engine.resolve())) as engine:
            engine.configure({'Threads':1,'Hash':128})
            for case in cases:
                row=compare_captures(engine,case,args.depth,fresh_analysis);rows.append(row)
                (args.output/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
                print(json.dumps(row,ensure_ascii=False),flush=True)
        report={'datasetSha256':hashlib.sha256(raw).hexdigest(),
                'engineSha256':hashlib.sha256(args.engine.read_bytes()).hexdigest(),
                'threads':1,'hashMB':128,'depth':args.depth,'rows':rows,
                'note':'Resultados de pesquisa não alteram o motor nem comprovam ganho de força.'}
        (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    finally:release()


if __name__=='__main__':main()
