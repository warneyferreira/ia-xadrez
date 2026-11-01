import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import chess
import chess.engine

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'arena'))
sys.path.insert(0,str(ROOT/'scripts'))
from repertoire import Repertoire
from process_lock import pid_alive
from prepare_opponent import fresh_analysis


def entry(moves,move,ponder=None):
    board=chess.Board()
    for uci in moves:board.push_uci(uci)
    return {'fen':board.fen(),'move':move,'ponder':ponder,'depth':24}


class RepertoireTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='chess-prepared-')
        self.path=Path(self.temp.name)/'book.json'
        data={'schema':1,'maxPly':24,'entries':{'':entry([],'e2e4','e7e5'),'e2e4 e7e5':entry(['e2e4','e7e5'],'g1f3')}}
        self.path.write_text(json.dumps(data),encoding='utf8')
    def tearDown(self):self.temp.cleanup()
    def command(self,*extra):
        command=[sys._base_executable if os.name=='nt' else sys.executable,'-u',str(ROOT/'scripts/prepared_engine.py')]
        if os.name=='nt':command+=['--site-packages',str(Path(sys.prefix)/'Lib/site-packages')]
        return [*command,'--engine',sys._base_executable if os.name=='nt' else sys.executable,'--engine-arg='+str(Path(__file__).with_name('fake_uci.py')),
                *['--engine-arg='+arg for arg in extra],'--repertoire',str(self.path)]

    def test_exact_history_and_checksum_are_required(self):
        book=Repertoire(self.path,hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(book.lookup(chess.Board())['move'],'e2e4')
        board=chess.Board();board.push_uci('d2d4')
        self.assertIsNone(book.lookup(board))
        self.assertIsNone(book.lookup(chess.Board('7k/8/6K1/8/8/8/8/R7 b - - 0 1')))
        with self.assertRaises(ValueError):Repertoire(self.path,'0'*64)
        data=json.loads(self.path.read_text());data['entries']['']['move']='a1a8'
        self.path.write_text(json.dumps(data))
        with self.assertRaises(ValueError):Repertoire(self.path)

    def test_book_can_be_disabled_and_missing_lines_use_native_engine(self):
        with chess.engine.SimpleEngine.popen_uci(self.command()) as engine:
            reply=engine.play(chess.Board(),chess.engine.Limit(time=.1),info=chess.engine.INFO_ALL)
            self.assertEqual(reply.move.uci(),'e2e4')
            self.assertTrue(reply.info['string'].startswith('PreparedRepertoire '))
            self.assertEqual(reply.info['nodes'],0)
            self.assertNotIn('score',reply.info)
            analysis=engine.analyse(chess.Board(),chess.engine.Limit(time=.1))
            self.assertFalse(analysis.get('string','').startswith('PreparedRepertoire '))
            engine.configure({'Use Prepared Repertoire':False})
            ordinary=engine.play(chess.Board(),chess.engine.Limit(time=.1),info=chess.engine.INFO_ALL)
            self.assertNotEqual(ordinary.move.uci(),'e2e4')
            self.assertFalse(ordinary.info.get('string','').startswith('PreparedRepertoire '))
            board=chess.Board();board.push_uci('d2d4')
            engine.configure({'Use Prepared Repertoire':True})
            self.assertIn(engine.play(board,chess.engine.Limit(time=.1)).move,board.legal_moves)

    def test_ponder_hit_replaces_search_only_after_actual_predicted_move(self):
        with chess.engine.SimpleEngine.popen_uci(self.command()) as engine:
            board=chess.Board();game=object()
            first=engine.play(board,chess.engine.Limit(white_clock=2,black_clock=2),ponder=True,game=game)
            board.push(first.move);board.push(first.ponder)
            second=engine.play(board,chess.engine.Limit(white_clock=2,black_clock=2),ponder=True,game=game,info=chess.engine.INFO_ALL)
            self.assertEqual(second.move.uci(),'g1f3')
            self.assertTrue(second.info['string'].startswith('PreparedRepertoire '))

    @unittest.skipUnless(os.name=='nt','Windows Job Object')
    def test_killing_controller_also_kills_its_native_child(self):
        pidfile=Path(self.temp.name)/'pid.txt'
        wrapper=subprocess.Popen(self.command('--pid-file',str(pidfile),'--stall'),stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
        try:
            wrapper.stdin.write('uci\n');wrapper.stdin.flush()
            while wrapper.stdout.readline().strip()!='uciok':
                if wrapper.poll() is not None:self.fail('Wrapper saiu antes do handshake.')
            child=int(pidfile.read_text())
            self.assertTrue(pid_alive(child))
            wrapper.kill();wrapper.wait(timeout=3)
            for _ in range(40):
                if not pid_alive(child):break
                time.sleep(.05)
            self.assertFalse(pid_alive(child),'Motor filho não deve ficar órfão.')
        finally:
            if wrapper.poll() is None:wrapper.kill();wrapper.wait(timeout=3)
            wrapper.stdin.close();wrapper.stdout.close()

    def test_completed_pv_does_not_inherit_old_bounds(self):
        class Stream:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def wait(self):pass
            def __iter__(self):return iter([
                {'score':chess.engine.PovScore(chess.engine.Cp(30),chess.WHITE),'pv':[chess.Move.from_uci('e2e4')],'lowerbound':True,'depth':18},
                {'score':chess.engine.PovScore(chess.engine.Cp(20),chess.WHITE),'pv':[chess.Move.from_uci('e2e4')],'depth':20},
                {'score':chess.engine.PovScore(chess.engine.Cp(15),chess.WHITE),'pv':[chess.Move.from_uci('e2e4')],'upperbound':True,'depth':21}])
        class Engine:
            def analysis(self,*args,**kwargs):return Stream()
        result=fresh_analysis(Engine(),chess.Board(),chess.engine.Limit(time=1))
        self.assertEqual(result['depth'],20)
        self.assertNotIn('lowerbound',result)
        self.assertNotIn('upperbound',result)


if __name__=='__main__':unittest.main()
