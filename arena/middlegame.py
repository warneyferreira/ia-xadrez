"""Casos de meio-jogo e comparação offline de capturas, sem preferência automática."""
import hashlib
from itertools import zip_longest
import time
import chess
import chess.engine

PHASE_WEIGHTS = {chess.KNIGHT: 1, chess.BISHOP: 1, chess.ROOK: 2, chess.QUEEN: 4}


def restore(case):
    board = chess.Board(case['initialFen'])
    for move in case['moves']:
        board.push_uci(move)
    if not board.is_valid() or board.is_game_over() or board.fen() != case['fen']:
        raise ValueError('Caso de pesquisa inválido ou histórico divergente.')
    return board


def collect_game_cases(game, candidate, game_number, minimum_ply=20, maximum_ply=80):
    board = game.board()
    cases = []
    for node in game.mainline():
        ply = len(board.move_stack)
        player = game.headers['White' if board.turn else 'Black']
        phase = sum(len(board.pieces(piece, color))*weight
                    for piece, weight in PHASE_WEIGHTS.items() for color in chess.COLORS)
        if (player == candidate and minimum_ply <= ply <= maximum_ply and phase >= 8
                and len(board.piece_map()) >= 10):
            legal = list(board.legal_moves)
            captures = [m for m in legal if board.is_capture(m)]
            if captures and len(captures) < len(legal):
                history = [m.uci() for m in board.move_stack]
                key = board.root().fen()+' '+' '.join(history)
                spent = node.emt()
                cases.append({'id': hashlib.sha256(key.encode()).hexdigest()[:16],
                    'game': game_number, 'candidate': candidate, 'ply': ply,
                    'initialFen': board.root().fen(), 'moves': history, 'fen': board.fen(),
                    'playedMove': node.move.uci(), 'playedSan': board.san(node.move),
                    'playedCapture': board.is_capture(node.move),
                    'legalChoices': len(legal), 'captureChoices': len(captures),
                    'materialPhaseHeuristic': phase, 'recordedMoveSeconds': spent,
                    'recordedRemainingSeconds': node.clock()})
        board.push(node.move)
    return cases


def select_cases(cases, maximum=8):
    chosen, seen = [], set()
    priority=sorted(cases,key=lambda c:(c['recordedMoveSeconds'] or 0,c['legalChoices']),reverse=True)
    def add(case):
        if len(chosen)>=maximum:return False
        if case['id'] in seen or any(c['game']==case['game'] and abs(c['ply']-case['ply'])<4 for c in chosen):
            return False
        chosen.append(case);seen.add(case['id'])
        return True
    # Inclui trocas realmente feitas; só escolher lances lentos excluiria capturas rápidas.
    for captured in (True,False):
        count=0
        for case in priority:
            if case['playedCapture']==captured and add(case):count+=1
            if count>=max(1,maximum//2):break
    for case in priority:add(case)
    captured=[c for c in chosen if c['playedCapture']]
    noncaptured=[c for c in chosen if not c['playedCapture']]
    return [c for pair in zip_longest(captured,noncaptured) for c in pair if c is not None]


def compare_captures(engine, case, depth, analyze):
    board = restore(case)
    legal = list(board.legal_moves)
    groups = {True: [m for m in legal if board.is_capture(m)],
              False: [m for m in legal if not board.is_capture(m)]}
    if not all(groups.values()):
        raise ValueError('O caso precisa ter captura e lance sem captura legais.')
    def search(root_moves=None):
        started=time.monotonic()
        info = analyze(engine,board,chess.engine.Limit(depth=depth),root_moves=root_moves,game=object())
        if info.get('lowerbound') or info.get('upperbound') or not info.get('pv'):
            raise ValueError('Busca sem avaliação exata registrada.')
        move=info['pv'][0]
        if move not in (root_moves if root_moves is not None else legal):
            raise ValueError('PV não corresponde ao grupo pesquisado.')
        score=info['score'].pov(board.turn)
        complete=info.get('depth',0)>=depth or score.is_mate()
        continuation=board.copy();line=[]
        for future in info['pv'][:8]:
            if future not in continuation.legal_moves:raise ValueError('Continuação ilegal na PV.')
            line.append(continuation.san(future));continuation.push(future)
        def pieces(position):
            return {chess.COLOR_NAMES[color]: {chess.piece_symbol(piece).upper():len(position.pieces(piece,color))
                    for piece in (*PHASE_WEIGHTS,chess.PAWN)} for color in chess.COLORS}
        return {'move':move.uci(),'san':board.san(move),'depth':info.get('depth'),
                'cp':score.score(),'mate':score.mate(),'complete':complete,
                'wallSeconds':round(time.monotonic()-started,3),
                'lineSan':line,'linePlies':len(line),'piecesBefore':pieces(board),
                'piecesAfterLine':pieces(continuation),
                'nodes':info.get('nodes'),'capture':board.is_capture(move)}
    native=search()
    other=search(groups[not native['capture']])
    capture,noncapture=(native,other) if native['capture'] else (other,native)
    comparable=all(r['complete'] and r['mate'] is None for r in (native,other))
    loss=max(capture['cp'],noncapture['cp'])-noncapture['cp'] if comparable else None
    return {'id':case['id'],'nativeBest':native,'bestCapture':capture,'bestNonCapture':noncapture,
            'requestedDepth':depth,'comparable':comparable,'estimatedNonCaptureLossCp':loss,
            'searchDisagreement':other['cp']>native['cp'] if comparable else None,
            'interpretation':'Busca limitada; sem captura no primeiro lance não significa preservar peças na continuação. Nenhum lance é aplicado ao candidato.'}
