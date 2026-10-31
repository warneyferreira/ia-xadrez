"""Diagnóstico local de decisões: compara tempos, sem alterar nem treinar a rede."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import math
import time
from pathlib import Path
import chess
import chess.engine
import chess.syzygy

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine',type=Path,required=True)
    parser.add_argument('--dataset',type=Path,default=ROOT/'positions/conversion-v1.json')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--seconds',type=float,nargs='+',default=[0.25,3,10])
    args=parser.parse_args()
    if args.output.exists() or any(not math.isfinite(t) or t<=0 or t>120 for t in args.seconds):parser.error('Use saída nova e tempos finitos entre 0 e 120 s.')
    args.output.mkdir(parents=True)
    dataset=json.loads(args.dataset.read_text(encoding='utf8'))
    tables=Path(os.environ.get('LOCALAPPDATA',ROOT/'tablebases-config/data'))/'ChessChallenge/syzygy/3-4-5'
    tb=chess.syzygy.open_tablebase(str(tables)) if tables.exists() else None
    rows=[]
    try:
        with chess.engine.SimpleEngine.popen_uci(str(args.engine.resolve())) as engine:
            engine.configure({'Threads':1,'Hash':128,**({'SyzygyPath':str(tables),'Syzygy50MoveRule':True} if tb else {})})
            for case in dataset['positions']:
                board=chess.Board(case.get('initialFen',chess.STARTING_FEN))
                for move in case.get('moves',[]):board.push_uci(move)
                if not board.is_valid():raise ValueError('Posição inválida: '+case['id'])
                for seconds in args.seconds:
                    started=time.monotonic()
                    info=engine.analyse(board,chess.engine.Limit(time=seconds),game=object())
                    move=info['pv'][0]
                    child=board.copy();child.push(move)
                    exact=None
                    if case['kind']=='mate':exact=child.is_checkmate()
                    elif case['kind']=='forced':exact=move in board.legal_moves and board.legal_moves.count()==1
                    elif case['kind']=='tablebase' and tb:
                        root=tb.probe_wdl(board);next_wdl=-tb.probe_wdl(child)
                        exact=next_wdl>=root
                    rows.append({'id':case['id'],'kind':case['kind'],'seconds':seconds,'actualSeconds':time.monotonic()-started,
                                 'move':move.uci(),'san':board.san(move),'depth':info.get('depth'),'nodes':info.get('nodes'),
                                 'whiteCp':info['score'].white().score(mate_score=10000),'exactOutcomePreserved':exact,
                                 'researchReferenceMatched':move.uci()==case.get('researchReference') if case['kind']=='research' else None})
                    (args.output/'samples.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
                    print(json.dumps(rows[-1]),flush=True)
    finally:
        if tb:tb.close()
    report={'engineSha256':hashlib.sha256(args.engine.read_bytes()).hexdigest(),'datasetSha256':hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
            'threads':1,'hashMB':128,'rows':rows,'note':'Referências de pesquisa são hipóteses; acertar Kf2 não prova vitória nem ganho de Elo. Casos exatos são avaliados separadamente.'}
    (args.output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')


if __name__=='__main__':main()
