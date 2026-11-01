"""Controlador UCI offline. Fora da preparação, encaminha a busca ao Stockfish."""
from __future__ import annotations
import argparse
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import subprocess
import sys
import threading
if '--site-packages' in sys.argv:
    sys.path.insert(0,sys.argv[sys.argv.index('--site-packages')+1])
import chess

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'arena'))
from repertoire import Repertoire


class ChildJob:
    """No Windows, fechar o processo controlador encerra também o seu motor."""
    def __init__(self,child):
        self.handle=None
        if os.name!='nt': return
        size=ctypes.c_size_t
        class Basic(ctypes.Structure):
            _fields_=[('processTime',ctypes.c_int64),('jobTime',ctypes.c_int64),('flags',wintypes.DWORD),
                      ('minWorking',size),('maxWorking',size),('active',wintypes.DWORD),
                      ('affinity',size),('priority',wintypes.DWORD),('scheduling',wintypes.DWORD)]
        class Counters(ctypes.Structure):
            _fields_=[(name,ctypes.c_uint64) for name in ['readOps','writeOps','otherOps','readBytes','writeBytes','otherBytes']]
        class Extended(ctypes.Structure):
            _fields_=[('basic',Basic),('io',Counters),('processMemory',size),('jobMemory',size),('peakProcess',size),('peakJob',size)]
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR]
        kernel.CreateJobObjectW.restype=wintypes.HANDLE
        kernel.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
        kernel.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE]
        kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        handle=kernel.CreateJobObjectW(None,None)
        info=Extended();info.basic.flags=0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not handle or not kernel.SetInformationJobObject(handle,9,ctypes.byref(info),ctypes.sizeof(info)) or not kernel.AssignProcessToJobObject(handle,wintypes.HANDLE(int(child._handle))):
            if handle: kernel.CloseHandle(handle)
            child.kill();child.wait(timeout=5)
            raise OSError('Não foi possível proteger o processo filho do controlador UCI.')
        self.handle=handle;self.kernel=kernel

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle);self.handle=None


def parse_position(command):
    tokens=command.split()
    if tokens[1:2]==['startpos']:
        board=chess.Board();tail=tokens[2:]
    elif tokens[1:2]==['fen']:
        board=chess.Board(' '.join(tokens[2:8]));tail=tokens[8:]
    else: raise ValueError('Posição UCI inválida.')
    if tail:
        if tail[0]!='moves': raise ValueError('Histórico UCI inválido.')
        for move in tail[1:]:board.push_uci(move)
    return board


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine',type=Path,required=True)
    parser.add_argument('--engine-arg',action='append',default=[])
    parser.add_argument('--site-packages',type=Path)
    parser.add_argument('--repertoire',type=Path,required=True)
    parser.add_argument('--sha256')
    args=parser.parse_args()
    book=Repertoire(args.repertoire,args.sha256)
    child_env=dict(os.environ)
    if args.site_packages:
        child_env['PYTHONPATH']=str(args.site_packages)+os.pathsep+child_env.get('PYTHONPATH','')
    child=subprocess.Popen([str(args.engine.resolve()),*args.engine_arg],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                           stderr=sys.stderr,text=True,encoding='utf8',bufsize=1,env=child_env)
    job=ChildJob(child)
    output_lock=threading.RLock()
    state_lock=threading.RLock()
    state={'board':None,'enabled':True,'analyse':False,'searching':False,'override':None,'quitting':False}
    def emit(lines):
        with output_lock:
            for line in lines: print(line,flush=True)
    def send(line):
        child.stdin.write(line+'\n');child.stdin.flush()
    def book_reply(entry):
        emit([f'info string PreparedRepertoire {book.sha256}',
              f"info depth {entry['depth']} nodes 0 time 0 pv {entry['move']}",
              f"bestmove {entry['move']}"+(f" ponder {entry['ponder']}" if entry.get('ponder') else '')])
    def read_child():
        for raw in child.stdout:
            line=raw.rstrip('\r\n')
            with state_lock:
                if line=='uciok':
                    emit(['option name Use Prepared Repertoire type check default true',
                          'option name UCI_AnalyseMode type check default false'])
                if line.startswith('bestmove '):
                    state['searching']=False
                    if state['override'] is not None:
                        entry=state['override'];state['override']=None
                        book_reply(entry);continue
                emit([line])
        if not state['quitting']:
            os._exit(child.wait() or 1)
    reader=threading.Thread(target=read_child,daemon=True);reader.start()
    try:
        for raw in sys.stdin:
            command=raw.strip()
            with state_lock:
                if command.startswith('setoption name Use Prepared Repertoire value '):
                    value=command.rsplit(' ',1)[-1]
                    if value not in ['true','false']:raise ValueError('Opção de preparação inválida.')
                    state['enabled']=value=='true';continue
                if command.startswith('setoption name UCI_AnalyseMode value '):
                    state['analyse']=command.rsplit(' ',1)[-1]=='true';continue
                if command.startswith('position '):
                    try: state['board']=parse_position(command)
                    except ValueError: state['board']=None
                if command=='ucinewgame':state['board']=None
                entry=book.lookup(state['board']) if state['enabled'] and not state['analyse'] and state['board'] is not None else None
                tokens=command.split()
                if entry and 'searchmoves' in tokens:
                    allowed=[]
                    for token in tokens[tokens.index('searchmoves')+1:]:
                        try:chess.Move.from_uci(token)
                        except ValueError:break
                        allowed.append(token)
                    if entry['move'] not in allowed:entry=None
                practical_go=command.startswith('go ') and not any(t in tokens for t in ['ponder','perft','nodes','depth','mate','infinite'])
                if practical_go and entry:
                    if state['searching']:
                        state['override']=entry;send('stop')
                    else:book_reply(entry)
                    continue
                if command=='ponderhit' and entry:
                    state['override']=entry;send('stop');continue
                if command=='stop':state['override']=None
                if command.startswith('go '):state['searching']=True
                if command=='quit':state['quitting']=True
                send(command)
                if command=='quit':break
    finally:
        state['quitting']=True
        if child.poll() is None:
            try:send('quit');child.wait(timeout=5)
            except (OSError,subprocess.TimeoutExpired):child.kill();child.wait(timeout=5)
        job.close()
        reader.join(timeout=1)


if __name__=='__main__':main()
