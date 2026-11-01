import sys
from pathlib import Path
import unittest
import chess
import chess.engine
import chess.pgn

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from run_match import annotate_search


class AnnotationTests(unittest.TestCase):
    def test_score_keeps_white_perspective_and_rejects_stale_or_bounded_data(self):
        move=chess.Move.from_uci('e2e4')
        info={'pv':[move],'score':chess.engine.PovScore(chess.engine.Cp(-20),chess.BLACK),'depth':24}
        node=chess.pgn.Game().add_variation(move)
        annotate_search(node,move,info)
        self.assertEqual(node.eval().white().score(),20)
        self.assertEqual(node.eval_depth(),24)
        for changes in ({'upperbound':True},{'lowerbound':True},
                        {'string':'PreparedRepertoire '+'a'*64},{'pv':[chess.Move.from_uci('d2d4')]}):
            untouched=chess.pgn.Game().add_variation(move)
            annotate_search(untouched,move,{**info,**changes})
            self.assertIsNone(untouched.eval())


if __name__=='__main__':unittest.main()
