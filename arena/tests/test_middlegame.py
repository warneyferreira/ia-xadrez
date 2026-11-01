from pathlib import Path
import sys
import unittest
import chess
import chess.engine
import chess.pgn

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from middlegame import collect_game_cases,select_cases,restore,compare_captures


def fixture():
    game=chess.pgn.Game();game.headers.update(White='Arthur',Black='Base')
    board=game.board();node=game
    for san in 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5 g5 Nh5'.split():
        move=board.parse_san(san);board.push(move);node=node.add_variation(move);node.set_emt(3)
    return collect_game_cases(game,'Arthur',1)


class MiddlegameTests(unittest.TestCase):
    def test_cases_preserve_full_history_and_offer_both_move_types(self):
        cases=fixture();self.assertTrue(cases)
        for case in cases:
            board=restore(case)
            self.assertEqual(len(board.move_stack),case['ply'])
            self.assertEqual(board.legal_moves.count(),case['legalChoices'])
            self.assertGreater(case['captureChoices'],0)
            self.assertGreater(case['legalChoices'],case['captureChoices'])
        selected=select_cases(cases+cases,2)
        self.assertEqual(len({c['id'] for c in selected}),len(selected))
        damaged={**cases[0],'moves':cases[0]['moves'][:-1]}
        with self.assertRaises(ValueError):restore(damaged)
        sample=[{**cases[0],'id':str(i),'game':i+1,'playedCapture':i<3,
                 'recordedMoveSeconds':1 if i<3 else 100} for i in range(6)]
        balanced=select_cases(sample,4)
        self.assertEqual(sum(c['playedCapture'] for c in balanced),2)
        self.assertEqual([c['playedCapture'] for c in balanced[:2]],[True,False])

    def analyze(self,case,capture_first,cp_first,cp_other,actual_depth=26):
        board=restore(case);calls=[]
        def fake(engine,position,limit,root_moves=None,game=None):
            self.assertEqual(position.fen(),board.fen());calls.append(root_moves)
            legal=list(position.legal_moves)
            move=next(m for m in legal if position.is_capture(m)==capture_first) if root_moves is None else root_moves[0]
            return {'pv':[move],'depth':actual_depth,'score':chess.engine.PovScore(
                chess.engine.Cp(cp_first if root_moves is None else cp_other),position.turn)}
        result=compare_captures(None,case,26,fake)
        self.assertEqual(len(calls),2)
        self.assertTrue(all(board.is_capture(m)!=capture_first for m in calls[1]))
        return result

    def test_counterfactual_estimates_loss_without_changing_move_policy(self):
        case=fixture()[0]
        report=self.analyze(case,True,100,90)
        self.assertTrue(report['bestCapture']['capture'])
        self.assertFalse(report['bestNonCapture']['capture'])
        self.assertEqual(report['estimatedNonCaptureLossCp'],10)
        # Uma busca restrita pode divergir da normal: não fingir equivalência.
        disagreement=self.analyze(case,False,100,300)
        self.assertTrue(disagreement['searchDisagreement'])
        self.assertEqual(disagreement['estimatedNonCaptureLossCp'],200)

    def test_incomplete_depth_does_not_establish_equivalence(self):
        report=self.analyze(fixture()[0],True,100,100,actual_depth=18)
        self.assertFalse(report['comparable'])
        self.assertIsNone(report['estimatedNonCaptureLossCp'])

    def test_noncapture_can_still_lose_a_piece_in_the_continuation(self):
        case=fixture()[0];board=restore(case);pair=None
        for move in board.legal_moves:
            if board.is_capture(move):continue
            child=board.copy();child.push(move)
            reply=next(child.generate_legal_captures(),None)
            if reply is not None:pair=(move,reply);break
        self.assertIsNotNone(pair)
        def fake(engine,position,limit,root_moves=None,game=None):
            pv=list(pair) if root_moves is None else [root_moves[0]]
            return {'pv':pv,'depth':26,'score':chess.engine.PovScore(chess.engine.Cp(0),position.turn)}
        result=compare_captures(None,case,26,fake)['nativeBest']
        self.assertFalse(result['capture'])
        self.assertEqual(result['linePlies'],2)
        total=lambda counts:sum(sum(side.values()) for side in counts.values())
        self.assertEqual(total(result['piecesAfterLine']),total(result['piecesBefore'])-1)


if __name__=='__main__':unittest.main()
