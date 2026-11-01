"""Políticas explícitas de encerramento para partidas UCI de laboratório."""
import chess

POLICIES = ("played", "claimable")


def outcome(board: chess.Board, policy: str = "played") -> chess.Outcome | None:
    if policy not in POLICIES:
        raise ValueError(f"Política de empate desconhecida: {policy}")
    automatic = board.outcome(claim_draw=False)
    if automatic is not None:
        return automatic
    if policy == "claimable":
        # Compatibilidade para reproduzir séries antigas: a GUI reclama assim
        # que existe um lance futuro que permitiria reclamar empate.
        return board.outcome(claim_draw=True)
    # Convenção da arena: reclama após a condição existir no tabuleiro,
    # deixando o motor escolher antes disso. Não substitui o árbitro físico.
    if board.is_fifty_moves():
        return chess.Outcome(chess.Termination.FIFTY_MOVES, None)
    if board.is_repetition(3):
        return chess.Outcome(chess.Termination.THREEFOLD_REPETITION, None)
    return None
