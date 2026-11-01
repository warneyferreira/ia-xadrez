"""Livro offline com histórico exato, validação legal e impressão digital."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import chess


class Repertoire:
    def __init__(self, path: Path, expected_sha: str | None = None):
        raw=path.read_bytes()
        self.sha256=hashlib.sha256(raw).hexdigest()
        if expected_sha and self.sha256!=expected_sha:
            raise ValueError('A preparação offline não corresponde ao SHA-256 cadastrado.')
        data=json.loads(raw)
        if data.get('schema')!=1 or not isinstance(data.get('entries'),dict) or not 1<=data.get('maxPly',0)<=32:
            raise ValueError('Formato de preparação offline inválido.')
        self.max_ply=data['maxPly']
        self.entries=data['entries']
        for history,entry in self.entries.items():
            board=chess.Board()
            moves=history.split()
            if len(moves)>self.max_ply: raise ValueError('Histórico fora do limite de abertura.')
            for move in moves: board.push_uci(move)
            if board.is_game_over() or board.is_repetition(2) or board.fen()!=entry['fen']:
                raise ValueError('Posição de preparação inconsistente.')
            if not isinstance(entry.get('depth'),int) or entry['depth']<18:
                raise ValueError('Preparação sem profundidade mínima registrada.')
            board.push_uci(entry['move'])
            if entry.get('ponder'): board.push_uci(entry['ponder'])

    def lookup(self,board:chess.Board):
        if len(board.move_stack)>self.max_ply or board.root().fen()!=chess.STARTING_FEN or board.is_game_over() or board.is_repetition(2):
            return None
        entry=self.entries.get(' '.join(m.uci() for m in board.move_stack))
        if entry and entry['fen']==board.fen() and chess.Move.from_uci(entry['move']) in board.legal_moves:
            return entry
        return None
