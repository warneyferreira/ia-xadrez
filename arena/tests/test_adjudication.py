import sys
import unittest
from pathlib import Path
import chess

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adjudication import outcome
from run_match import Candidate, Opening, run_game


class DrawPolicyTests(unittest.TestCase):
    def repetition_pending(self):
        board = chess.Board()
        for move in ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1']:
            board.push_san(move)
        return board

    def test_future_repetition_does_not_stop_engine_choice(self):
        board = self.repetition_pending()
        self.assertTrue(board.can_claim_threefold_repetition())
        self.assertFalse(board.is_repetition(3))
        self.assertIsNone(outcome(board))
        self.assertEqual(outcome(board, 'claimable').termination, chess.Termination.THREEFOLD_REPETITION)
        board.push_san('d5')
        self.assertIsNone(outcome(board))

    def test_played_third_repetition_is_still_a_draw(self):
        board = self.repetition_pending()
        board.push_san('Ng8')
        self.assertEqual(outcome(board).termination, chess.Termination.THREEFOLD_REPETITION)

    def test_fifty_moves_waits_for_actual_hundredth_ply(self):
        board = chess.Board('7k/8/6K1/8/8/8/8/R7 w - - 99 1')
        self.assertTrue(board.can_claim_fifty_moves())
        self.assertIsNone(outcome(board))
        board.push_san('Ra2')
        self.assertEqual(outcome(board).termination, chess.Termination.FIFTY_MOVES)

    def test_mate_has_priority_over_fifty_move_counter(self):
        board = chess.Board('7k/8/5KQ1/8/8/8/8/8 w - - 99 1')
        board.push_san('Qg7#')
        self.assertEqual(outcome(board).termination, chess.Termination.CHECKMATE)

    def test_arena_allows_real_move_before_adjudicating(self):
        board = self.repetition_pending()
        command = (sys.executable, str(Path(__file__).with_name('fake_uci.py')))
        candidate = Candidate('fake', command, {})
        opening = Opening(chess.STARTING_FEN, tuple(board.move_stack), 'pending repetition')
        game, result = run_game(candidate, candidate, opening, 2, 0, 8)
        self.assertEqual(game.end().ply(), 8)
        legacy, old_result = run_game(candidate, candidate, opening, 2, 0, 8, draw_policy='claimable')
        self.assertEqual(legacy.end().ply(), 7)
        self.assertEqual(old_result['result'], '1/2-1/2')


if __name__ == '__main__':
    unittest.main()
