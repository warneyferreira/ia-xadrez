"""Preparação offline contra uma referência congelada; não há aprendizado na partida."""
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
from repertoire import Repertoire


def score(info, color):
    return info['score'].pov(color).score(mate_score=10000)


def terminal_score(board, color):
    result=board.outcome()
    if result is None:return None
    return 0 if result.winner is None else 10000 if result.winner==color else -10000


def fresh_analysis(engine, board, limit, *, multipv=None, root_moves=None, game=None):
    # AnalysisResult.info acumula dicionários: um limite antigo pode sobreviver
    # à próxima linha exata. Cada PV abaixo é a última linha completa, sem merge.
    latest={}; completed={}; frame={}; frame_depth=None; complete_frame=None
    with engine.analysis(board,limit,multipv=multipv,root_moves=root_moves,game=game) as stream:
        for info in stream:
            if info.get('pv') and 'score' in info:
                latest[info.get('multipv',1)]=info
                if not info.get('lowerbound') and not info.get('upperbound'):
                    completed[info.get('multipv',1)]=info
                if multipv is not None:
                    rank=info.get('multipv',1)
                    if rank==1:
                        frame={};frame_depth=info.get('depth')
                    if info.get('depth')==frame_depth and not info.get('lowerbound') and not info.get('upperbound'):
                        frame[rank]=info
                    if (set(frame)==set(range(1,multipv+1)) and
                            len({row['pv'][0] for row in frame.values()})==multipv):
                        complete_frame=[frame[k] for k in range(1,multipv+1)]
        stream.wait()
    if not latest: raise RuntimeError('Análise terminou sem PV e avaliação.')
    if multipv is not None:
        if complete_frame is None: raise RuntimeError('MultiPV sem iteração completa, exata e sem lances duplicados.')
        return complete_frame
    return completed.get(1,latest[1])


def seed_histories(path, minimum=8, maximum=12):
    histories={}
    with path.open(encoding='utf8') as handle:
        while game:=chess.pgn.read_game(handle):
            if game.errors or game.board().fen()!=chess.STARTING_FEN:
                raise ValueError('PGN de preparação inválido ou fora da posição inicial.')
            prefix=[]
            for move in game.mainline_moves():
                prefix.append(move.uci())
                if minimum<=len(prefix)<=maximum: histories.setdefault(tuple(prefix),prefix.copy())
                if len(prefix)>=maximum:break
    return sorted(histories.values(),key=len)


def inherited_entries(path, engine_sha, minimum_depth, maximum_loss):
    raw=path.read_bytes();data=json.loads(raw)
    if data.get('metadata',{}).get('engineSha256')!=engine_sha:
        raise ValueError('A extensão exige a mesma rede e o mesmo executável do livro anterior.')
    book=Repertoire(path,hashlib.sha256(raw).hexdigest())
    for entry in book.entries.values():
        gap=entry.get('gapCp')
        if (entry['depth']<minimum_depth or not isinstance(gap,(int,float)) or
                not math.isfinite(gap) or gap>maximum_loss):
            raise ValueError('Livro anterior não atende à qualidade pedida; revalide antes de estender.')
    return book.entries,book.sha256


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', type=Path, default=ROOT/'bin/arthur-v2/stockfish.exe')
    parser.add_argument('--opponent', type=Path, default=ROOT/'bin/baseline-effdc3fd3/stockfish.exe')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--positions', type=int, default=24)
    parser.add_argument('--teacher-seconds', type=float, default=3)
    parser.add_argument('--reply-seconds', type=float, nargs='+', default=[0.25, 1])
    parser.add_argument('--verify-seconds', type=float, default=3)
    parser.add_argument('--verify-depth', type=int, default=24)
    parser.add_argument('--max-loss-cp', type=int, default=20)
    parser.add_argument('--seed-pgn',type=Path,help='partidas locais para incluir históricos de abertura realmente observados')
    parser.add_argument('--seed-min-ply',type=int,default=8)
    parser.add_argument('--seed-max-ply',type=int,default=12)
    parser.add_argument('--extend-repertoire',type=Path,help='preserva respostas verificadas do mesmo motor e estuda novas continuações')
    args = parser.parse_args()
    times=[args.teacher_seconds,args.verify_seconds,*args.reply_seconds]
    if args.output.exists() or not 1<=args.positions<=200 or any(not math.isfinite(t) or not 0<t<=60 for t in times):
        parser.error('Use saída nova, 1–200 posições e tempos de 0 a 60 s.')
    if not 1<=args.seed_min_ply<=args.seed_max_ply<=22:
        parser.error('Intervalo das sementes deve estar entre 1 e 22 meios-lances.')
    entries, observations = {}, []
    inherited_sha=None
    if args.extend_repertoire:
        entries,inherited_sha=inherited_entries(args.extend_repertoire,hashlib.sha256(args.engine.read_bytes()).hexdigest(),args.verify_depth,args.max_loss_cp)
    inherited_count=len(entries)
    # Posições iniciais próprias: o livro responde somente ao histórico realmente preparado.
    frontier=[[], ['e2e4'], ['d2d4'], ['c2c4'], ['g1f3']]
    if args.seed_pgn:
        frontier=seed_histories(args.seed_pgn,args.seed_min_ply,args.seed_max_ply)+frontier
    acquire(args.output)
    args.output.mkdir(parents=True)
    seen=set(entries)
    try:
        with chess.engine.SimpleEngine.popen_uci(str(args.engine.resolve())) as teacher, chess.engine.SimpleEngine.popen_uci(str(args.opponent.resolve())) as opponent:
            teacher.configure({'Threads':2,'Hash':256})
            opponent.configure({'Threads':2,'Hash':256})
            while frontier and len(observations)<args.positions:
                if args.extend_repertoire: frontier.sort(key=len)
                moves=frontier.pop(0)
                key=' '.join(moves)
                if key in seen or len(moves)>22: continue
                seen.add(key)
                board=chess.Board()
                for uci in moves: board.push_uci(uci)
                if board.is_game_over() or board.is_repetition(2): continue
                color=board.turn
                infos=fresh_analysis(teacher,board,chess.engine.Limit(time=args.teacher_seconds),multipv=min(3,board.legal_moves.count()),game=object())
                best=max(score(info,color) for info in infos)
                choices=[]
                for info in infos:
                    value=score(info,color)
                    if best-value>args.max_loss_cp or info.get('lowerbound') or info.get('upperbound'): continue
                    own=info['pv'][0]
                    child=board.copy();child.push(own)
                    if child.is_repetition(2): continue
                    replies=[]
                    for seconds in args.reply_seconds:
                        if child.is_game_over(): break
                        reply=fresh_analysis(opponent,child,chess.engine.Limit(time=seconds),game=object())['pv'][0]
                        after=child.copy();after.push(reply)
                        value_after=terminal_score(after,color)
                        if value_after is None:
                            reference=fresh_analysis(teacher,after,chess.engine.Limit(time=args.verify_seconds),game=object())
                            value_after=score(reference,color)
                        replies.append({'seconds':seconds,'move':reply.uci(),'value':value_after})
                    robust=min([r['value'] for r in replies],default=value)
                    choices.append({'move':own.uci(),'value':value,'robust':robust,'depth':info.get('depth',0),'replies':replies})
                if not choices: continue
                # Prefere benefício que persiste nos dois orçamentos. Empate no critério conserva a primeira PV.
                selected=max(choices,key=lambda c:(c['robust'],c['value']))
                # Confirma a qualidade da escolha contra uma busca independente sem MultiPV.
                check=fresh_analysis(teacher,board,chess.engine.Limit(depth=args.verify_depth),game=object())
                forced=fresh_analysis(teacher,board,chess.engine.Limit(depth=args.verify_depth),root_moves=[chess.Move.from_uci(selected['move'])],game=object())
                gap=score(check,color)-score(forced,color)
                accepted=(gap<=args.max_loss_cp and min(check.get('depth',0),forced.get('depth',0))>=18
                          and not check.get('lowerbound') and not check.get('upperbound')
                          and not forced.get('lowerbound') and not forced.get('upperbound'))
                row={'history':moves,'bestCp':best,'choices':choices,'selected':selected['move'],'gapCp':gap,'accepted':accepted,
                     'checkDepth':check.get('depth'),'forcedDepth':forced.get('depth'),
                     'checkBound':bool(check.get('lowerbound') or check.get('upperbound')),
                     'forcedBound':bool(forced.get('lowerbound') or forced.get('upperbound'))}
                observations.append(row)
                if accepted:
                    replies=selected['replies']
                    entries[key]={'move':selected['move'],'ponder':replies[-1]['move'] if replies else None,
                                  'depth':min(check['depth'],forced['depth']), 'fen':board.fen(),
                                  'whiteCp':forced['score'].white().score(mate_score=10000),'gapCp':gap}
                    # Crescimento controlado por profundidade; no máximo duas respostas por posição.
                    for reply in dict.fromkeys(r['move'] for r in replies):
                        frontier.append([*moves,selected['move'],reply])
                atomic_json(args.output/'progress.json',{'completed':len(observations),'planned':args.positions,'accepted':len(entries),'inherited':inherited_count,'acceptedNew':len(entries)-inherited_count,'queued':len(frontier)})
                atomic_json(args.output/'observations.json',{'rows':observations})
                print(json.dumps({'position':len(observations),'ply':len(moves),'move':selected['move'],'gapCp':gap,'accepted':accepted,'bookEntries':len(entries)}),flush=True)
            data={'schema':1,'maxPly':max(24,max((len(h.split()) for h in entries),default=0)),'entries':entries,'metadata':{
                'createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),
                'engineSha256':hashlib.sha256(args.engine.read_bytes()).hexdigest(),
                'opponentSha256':hashlib.sha256(args.opponent.read_bytes()).hexdigest(),
                'teacherSeconds':args.teacher_seconds,'replySeconds':args.reply_seconds,
                'verifySeconds':args.verify_seconds,'maxLossCp':args.max_loss_cp,
                'verifyDepth':args.verify_depth,
                'multiPVPolicy':'completed-exact-same-depth-distinct-v2',
                'seedPgnSha256':hashlib.sha256(args.seed_pgn.read_bytes()).hexdigest() if args.seed_pgn else None,
                'seedPlyRange':[args.seed_min_ply,args.seed_max_ply],
                'inheritedRepertoireSha256':inherited_sha,'inheritedEntries':inherited_count,
                'status':'EXPERIMENTAL: preparação específica; buscas limitadas e amostra não provam vantagem em 25+0.'}}
            atomic_json(args.output/'repertoire.json',data)
    finally: release()


if __name__=='__main__': main()
