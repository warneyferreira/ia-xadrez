"""Diagnóstico dos registros existentes; nunca inicia uma engine nem altera a partida."""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import statistics

import chess
import chess.pgn


def game_diagnostics(game: chess.pgn.Game, names: list[str], base_seconds: float):
    board = game.board()
    sides = {name: {'moves': 0, 'evaluatedMoves': 0, 'forcedReplies': 0,
                    'seconds': [], 'slowestMoves': [], 'evaluationSwings': [],
                    'peakOwnCp': None, 'lastOwnCp': None} for name in names}
    for ply, node in enumerate(game.mainline(), 1):
        color = board.turn
        name = game.headers['White' if color else 'Black']
        if name not in sides:
            raise ValueError('PGN contém candidato diferente da configuração.')
        side = sides[name]
        san = board.san(node.move)
        forced = board.legal_moves.count() == 1
        board.push(node.move)
        side['moves'] += 1
        side['forcedReplies'] += forced
        if node.clock() is not None:
            side['lastClockSeconds'] = node.clock()
        spent = node.emt()
        if spent is not None:
            side['seconds'].append(spent)
            side['slowestMoves'].append({'ply': ply, 'san': san, 'seconds': spent,
                'percentInitialClock': round(100 * spent / base_seconds, 2),
                'remainingSeconds': node.clock(), 'fenAfter': board.fen()})
        evaluation = node.eval()
        # Compara apenas buscas do mesmo lado. Não mistura a escala dos dois motores.
        if evaluation is not None:
            side['evaluatedMoves'] += 1
        if evaluation is not None and not evaluation.pov(color).is_mate():
            cp = evaluation.pov(color).score()
            previous = side['lastOwnCp']
            if previous is not None and previous['cp'] - cp >= 150:
                side['evaluationSwings'].append({'from': previous,
                    'to': {'ply': ply, 'san': san, 'cp': cp, 'depth': node.eval_depth()},
                    'dropCp': previous['cp'] - cp, 'fenAfter': board.fen()})
            side['lastOwnCp'] = {'ply': ply, 'san': san, 'cp': cp, 'depth': node.eval_depth()}
            side['peakOwnCp'] = cp if side['peakOwnCp'] is None else max(side['peakOwnCp'], cp)
        elif evaluation is not None:
            side['lastMateForecast'] = {'ply': ply, 'san': san, 'moves': evaluation.pov(color).mate()}
            side['lastOwnCp'] = None
    for side in sides.values():
        times = side.pop('seconds')
        side['recordedMoveSeconds'] = round(sum(times), 3) if times else None
        side['medianMoveSeconds'] = statistics.median(times) if times else None
        side['slowestMoves'] = sorted(side['slowestMoves'], key=lambda r: r['seconds'], reverse=True)[:3]
        side['evaluationSwings'] = sorted(side['evaluationSwings'], key=lambda r: r['dropCp'], reverse=True)[:5]
    material = {name: sum(len(board.pieces(piece, color)) * value for piece, value in
                         ((chess.PAWN, 1), (chess.KNIGHT, 3), (chess.BISHOP, 3), (chess.ROOK, 5), (chess.QUEEN, 9)))
                for name, color in ((game.headers['White'], chess.WHITE), (game.headers['Black'], chess.BLACK))}
    return {'white': game.headers['White'], 'black': game.headers['Black'],
            'result': game.headers['Result'], 'termination': game.headers.get('Termination'),
            'opening': game.headers.get('Opening'), 'plies': len(board.move_stack),
            'evaluationSource': game.headers.get('EvaluationSource', 'não informado'),
            'finalFen': board.fen(), 'finalMaterial': material,
            'threefoldOnBoard': board.is_repetition(3), 'sides': sides}


def match_report(folder: Path, running: bool = False):
    folder = folder.resolve()
    captured = {name: (folder / name).read_bytes() for name in
                ('config.json', 'events.jsonl', 'games.pgn', 'summary.json', 'progress.json') if (folder / name).exists()}
    metadata = json.loads(captured['config.json'].decode('utf-8-sig'))
    config = metadata['config']
    names = [config['candidate_a']['name'], config['candidate_b']['name']]
    summary = json.loads(captured['summary.json'].decode('utf-8-sig')) if 'summary.json' in captured else None
    progress = json.loads(captured['progress.json'].decode('utf-8-sig')) if 'progress.json' in captured else None
    warnings, events, games = [], [], []
    for line in captured.get('events.jsonl', b'').decode('utf-8-sig').splitlines():
        try:
            events.append(json.loads(line))
        except ValueError:
            warnings.append('Evento ainda incompleto na leitura; não foi contado.')
    stream = io.StringIO(captured.get('games.pgn', b'').decode('utf-8-sig'))
    pgn_index = 0
    while game := chess.pgn.read_game(stream):
        index = pgn_index
        pgn_index += 1
        if game.errors or game.headers.get('Result') not in ('1-0', '0-1', '1/2-1/2'):
            warnings.append('PGN incompleto ou inválido ignorado; não virou empate.')
            continue
        event = events[index] if index < len(events) else None
        if not event or any(game.headers.get(header) != event.get(field) for header, field in
                            (('White', 'white'), ('Black', 'black'), ('Result', 'result'))):
            warnings.append(f'PGN {index+1} sem evento completo compatível; diagnóstico adiado.')
            continue
        games.append(game_diagnostics(game, names, config['time_control']['base_seconds']))
    scores = {name: {'wins': 0, 'draws': 0, 'losses': 0, 'competitionPoints': 0, 'preparedMoves': 0} for name in names}
    unfinished = failures = 0
    for event in events:
        result = event['result']
        if result == '*':
            unfinished += 1
            continue
        if result not in ('1-0', '0-1', '1/2-1/2'):
            raise ValueError('Resultado desconhecido no registro da arena.')
        failures += bool(event.get('crash') or event.get('termination') == 'time forfeit')
        for name, color in ((event['white'], 'white'), (event['black'], 'black')):
            score = scores[name]
            category = 'draws' if result == '1/2-1/2' else 'wins' if (result == '1-0') == (color == 'white') else 'losses'
            score[category] += 1
            score['competitionPoints'] += {'wins': 3, 'draws': 1, 'losses': 0}[category]
            score['preparedMoves'] += event.get('book_hits', {}).get(color, 0)
    if len(games) != len(events):
        warnings.append('PGNs e eventos não têm a mesma quantidade nesta leitura; o placar usa somente eventos completos.')
    if summary and summary.get('games') is not None and summary['games'] != len(events):
        warnings.append('O resumo e os eventos não têm a mesma quantidade nesta leitura; confirme os arquivos antes de concluir.')
    if summary:
        unfinished = max(unfinished, summary.get('unfinished', 0))
        failures = max(failures, sum(summary.get('crashes', {}).values()))
    for name, score in scores.items():
        score['movesWithPGN'] = sum(g['sides'][name]['moves'] for g in games)
        score['evaluatedMoves'] = sum(g['sides'][name]['evaluatedMoves'] for g in games)
        score['preparedCoveragePercent'] = round(100 * score['preparedMoves'] / score['movesWithPGN'], 2) if score['movesWithPGN'] else None
    status = ('finished-with-issues' if unfinished or failures or warnings else 'finished') if summary else 'running' if running else 'interrupted'
    overlap = (folder / 'development-overlap.json').exists()
    return {'schema': 'chess-arena-diagnostics-v1', 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'matchId': metadata.get('match_id', folder.name), 'status': status,
            'plannedGames': config['games'], 'recordedGames': len(events), 'unfinishedGames': unfinished,
            'currentGame': {**progress, 'clockMeaning': 'saldos antes da busca atual; consultar thinkingSince'} if running and not summary and progress else None,
            'failures': failures, 'timeControl': config['time_control'], 'scores': scores,
            'identities': config.get('identities'), 'developmentOverlap': overlap,
            'drawPolicy': metadata.get('draw_policy', config.get('draw_policy', 'claimable')),
            'games': games, 'warnings': warnings,
            'sourceSha256': {name: hashlib.sha256(raw).hexdigest() for name, raw in captured.items()},
            'interpretation': [
                'Ler o relatório não treina a rede nem executa buscas adicionais.',
                'Queda de avaliação entre buscas próprias é uma prioridade de revisão, não prova de erro: a resposta adversária também mudou a posição.',
                'Avaliações são estimativas das buscas registradas; ausência de avaliação não significa lance ruim. Material final não decide o vencedor.',
                'Livro e escalas de motores diferentes não são tratados como uma mesma série de avaliações. Este relatório não estima Elo.'
            ]}
