import json
from pathlib import Path
import sys
import tempfile
import unittest
import chess
import chess.engine
import chess.pgn

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from diagnostics import game_diagnostics, match_report


class DiagnosticsTests(unittest.TestCase):
    def test_same_side_evaluations_do_not_mix_two_engine_scales(self):
        game=chess.pgn.Game();game.headers.update(White='A',Black='B',Result='1/2-1/2')
        board=game.board();node=game
        for san,cp in [('e4',300),('e5',-900),('Nf3',280),('Nc6',-900),('Bc4',40)]:
            move=board.parse_san(san);board.push(move);node=node.add_variation(move)
            node.set_eval(chess.engine.PovScore(chess.engine.Cp(cp),chess.WHITE),24)
            node.set_emt(1.2)
        report=game_diagnostics(game,['A','B'],1500)
        self.assertEqual(len(report['sides']['A']['evaluationSwings']),1)
        swing=report['sides']['A']['evaluationSwings'][0]
        self.assertEqual((swing['from']['ply'],swing['to']['ply'],swing['dropCp']),(3,5,240))
        self.assertEqual(report['sides']['B']['evaluationSwings'],[])
        self.assertEqual(report['sides']['B']['peakOwnCp'],900)

    def fixture(self,path,events='',pgn='',summary=None):
        config={'match_id':'fixture','config':{'games':4,'candidate_a':{'name':'A'},
                'candidate_b':{'name':'B'},'time_control':{'base_seconds':1500,'increment_seconds':0}}}
        (path/'config.json').write_text(json.dumps(config))
        (path/'events.jsonl').write_text(events)
        (path/'games.pgn').write_text(pgn)
        if summary is not None:(path/'summary.json').write_text(json.dumps(summary))

    def test_running_and_partial_events_never_become_draws(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp);self.fixture(path,events='{"result":')
            result=match_report(path,running=True)
            self.assertEqual(result['status'],'running')
            self.assertEqual(result['recordedGames'],0)
            self.assertEqual(result['scores']['A']['draws'],0)
            self.assertTrue(result['warnings'])
            self.assertEqual(match_report(path)['status'],'interrupted')
            self.fixture(path,pgn='[White "A"]\n[Black "B"]\n[Result "1/2-1/2"]\n\n1. e4')
            partial=match_report(path,running=True)
            self.assertEqual(partial['games'],[])
            self.assertEqual(partial['scores']['A']['draws'],0)
            (path/'summary.json').write_text('{"unfinished":1}')
            self.assertEqual(match_report(path)['status'],'finished-with-issues')

    def test_extra_queen_does_not_override_stalemate_result(self):
        game=chess.pgn.Game();game.setup(chess.Board('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))
        game.headers.update(White='A',Black='B',Result='1/2-1/2',Termination='stalemate')
        event={'white':'A','black':'B','result':'1/2-1/2','termination':'stalemate'}
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp);self.fixture(path,events=json.dumps(event)+'\n',pgn=str(game)+'\n\n',summary={'unfinished':0})
            before={p.name:p.read_bytes() for p in path.iterdir()}
            result=match_report(path)
            self.assertEqual(result['scores']['A']['wins'],0)
            self.assertEqual(result['scores']['A']['draws'],1)
            self.assertEqual(result['games'][0]['finalMaterial']['A'],9)
            self.assertEqual(result['games'][0]['finalMaterial']['B'],0)
            self.assertEqual(before,{p.name:p.read_bytes() for p in path.iterdir()})


if __name__=='__main__':unittest.main()
