"""Fila local sem GPT; aguarda a bateria atual e executa validações sequenciais limitadas."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import time
import signal
import atexit
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'arena'))
from process_lock import active_run,acquire,release,atomic_json


def reserve_queue():
    path=ROOT/'results/arena/research-worker.lock'
    path.parent.mkdir(parents=True,exist_ok=True)
    handle=path.open('a+b')
    if handle.seek(0,2)==0:handle.write(b'0');handle.flush()
    handle.seek(0)
    try:
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:
        handle.close()
        raise RuntimeError('Já existe uma fila de pesquisa local. Não iniciar duas filas.')
    atexit.register(handle.close)
    return handle


def run_owned(command, log, timeout, env):
    child=subprocess.Popen(command,cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,
                           start_new_session=os.name!='nt',creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name=='nt' else 0)
    try:
        code=child.wait(timeout=timeout)
        if code:raise subprocess.CalledProcessError(code,command)
    except BaseException:
        # Só a árvore criada por esta fila; a bateria principal nunca é filha dela.
        if child.poll() is None:
            if os.name=='nt':subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True,timeout=15)
            else:os.killpg(child.pid,signal.SIGKILL)
            child.wait(timeout=15)
        raise


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--after',type=Path,required=True)
    parser.add_argument('--engine',type=Path,default=ROOT/'bin/arthur-v2/stockfish.exe')
    args=parser.parse_args()
    queue_lock=reserve_queue()
    after=args.after.resolve()
    if not after.is_relative_to(ROOT/'results/arena'):parser.error('Dependência fora da arena do projeto.')
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S')
    output=ROOT/'results/research'/stamp
    output.mkdir(parents=True)
    status_path=ROOT/'results/arena/research-queue.json'
    revision=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    state={'pid':os.getpid(),'createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),'after':after.name,'output':str(output),'stage':'waiting','sourceRevision':revision}
    def update(stage,message):
        state.update(stage=stage,message=message,updatedAt=dt.datetime.now(dt.timezone.utc).isoformat());atomic_json(status_path,state);atomic_json(output/'status.json',state)
    frozen=hashlib.sha256(args.engine.read_bytes()).hexdigest()
    state['engineSha256']=frozen
    update('waiting','Aguardando a bateria atual terminar; nenhum cálculo adicional está rodando.')
    for _ in range(12*60*3):
        if (after/'summary.json').exists() and not active_run():break
        if not active_run() and not (after/'summary.json').exists():
            update('blocked','A bateria anterior parou sem resumo. Validação adiada para investigar a interrupção.');return 2
        time.sleep(20)
    else:
        update('blocked','Prazo de espera de 12 horas encerrado.');return 2
    if hashlib.sha256(args.engine.read_bytes()).hexdigest()!=frozen:
        update('blocked','O binário mudou desde o agendamento. Preserve a referência antes de retestar.');return 2
    try:
        acquire(output)
        update('protocol','Verificando Ponder e busca com o motor real, após a bateria principal.')
        env={**os.environ,'TEST_ENGINE':str(args.engine.resolve()),'PYTHONUTF8':'1'}
        bun=ROOT/'ui/node_modules/bun/bin/bun.exe'
        with (output/'protocol.log').open('w',encoding='utf8') as log:
            run_owned([str(bun),'test','ui/src/engine.integration.test.ts','ui/src/ponder-native.test.ts'],log,90,env)
        update('positions','Analisando seis posições de conversão/tática em 0,25 s, 3 s e 10 s. Não é treinamento da rede.')
        with (output/'positions.log').open('w',encoding='utf8') as log:
            run_owned([sys.executable,str(ROOT/'scripts/research_positions.py'),'--engine',str(args.engine),'--output',str(output/'positions')],log,600,env)
    except Exception as exc:
        update('failed','Validação interrompida: '+str(exc));return 1
    finally:release()
    # Uma variável: 4 vs 2 threads, mesma rede, binário, Hash e aberturas.
    target=ROOT/'results/arena'/f'threads-pilot-{stamp}'
    config={'match_id':target.name,'candidate_a':{'name':'Arthur v2 - 4 threads (experimento)','command':[str(args.engine.resolve())],'options':{'Threads':4,'Hash':256,'Move Overhead':20,'Ponder':False}},
            'candidate_b':{'name':'Arthur v2 - 2 threads (referencia)','command':[str(args.engine.resolve())],'options':{'Threads':2,'Hash':256,'Move Overhead':20,'Ponder':False}},
            'games':12,'time_control':{'base_seconds':60,'increment_seconds':0.1},'openings':{'pgn':str(ROOT/'openings/validation-holdout.pgn'),'seed':20261031},'max_plies':600,'output_dir':str(target)}
    path=output/'threads-config.json';path.write_text(json.dumps(config,indent=2),encoding='utf8')
    update('threads','Piloto: 12 partidas com 4 vs 2 threads, mesmo Hash. Resultado exploratório; nenhuma promoção automática.')
    try:
        with (output/'threads.log').open('w',encoding='utf8') as log:
            run_owned([sys.executable,'-u',str(ROOT/'arena/run_match.py'),str(path)],log,2700,{**os.environ,'PYTHONUTF8':'1'})
    except Exception as exc:
        update('failed','Piloto não concluiu: '+str(exc));return 1
    update('done','Validações concluídas. Relatórios salvos para revisão; nenhuma versão foi promovida automaticamente.')
    return 0


if __name__=='__main__':raise SystemExit(main())
