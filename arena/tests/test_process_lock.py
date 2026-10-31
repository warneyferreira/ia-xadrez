import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import process_lock as lock


class LockTests(unittest.TestCase):
    def test_pid_probe_is_read_only_and_identifies_current_process(self):
        self.assertTrue(lock.pid_alive(os.getpid()))
        self.assertFalse(lock.pid_alive(0))

    def test_second_process_cannot_acquire_and_crash_releases_kernel_lock(self):
        with tempfile.TemporaryDirectory(prefix='chess-lock-') as tmp:
            old_root,old_active=lock.ROOT,lock.ACTIVE
            lock.ROOT=Path(tmp).resolve()
            lock.ACTIVE=lock.ROOT/'results/arena/active.json'
            child=None
            try:
                module=str(Path(__file__).resolve().parents[1])
                code='import sys,time; from pathlib import Path; sys.path.insert(0,sys.argv[1]); import process_lock as m; m.ROOT=Path(sys.argv[2]); m.ACTIVE=m.ROOT/"results/arena/active.json"; m.acquire(m.ROOT/"results/arena/run"); print("ready",flush=True); time.sleep(10)'
                child=subprocess.Popen([sys.executable,'-c',code,module,tmp],stdout=subprocess.PIPE,text=True)
                self.assertEqual(child.stdout.readline().strip(),'ready')
                with self.assertRaises(RuntimeError):lock.acquire(lock.ROOT/'results/arena/other')
                child.kill();child.wait(timeout=3)
                lock.acquire(lock.ROOT/'results/arena/recovered')
                self.assertEqual(json.loads(lock.ACTIVE.read_text())['pid'],os.getpid())
            finally:
                if child and child.poll() is None:child.kill();child.wait(timeout=3)
                if child and child.stdout:child.stdout.close()
                lock.release()
                lock.ROOT,lock.ACTIVE=old_root,old_active


if __name__=='__main__':unittest.main()
