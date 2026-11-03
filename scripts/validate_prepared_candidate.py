"""Conclui uma preparação, cadastra versão experimental e executa piloto sem GPT."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'arena'))
from repertoire import Repertoire
from process_lock import active_run,atomic_json
from research_queue import reserve_queue,run_owned
from diagnostics import match_report


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_preparation(folder, reference, root, planned, depth=26, maximum_loss=5):
    progress=json.loads((folder/'progress.json').read_text(encoding='utf8'))
    data=json.loads((folder/'repertoire.json').read_text(encoding='utf8'))
    rows=json.loads((folder/'observations.json').read_text(encoding='utf8'))['rows']
    if progress['completed']!=planned or progress['planned']!=planned or len(rows)!=planned:
        raise ValueError('A preparação não concluiu todas as posições planejadas.')
    if data['metadata']['engineSha256']!=digest(root/reference['engine']):
        raise ValueError('Motor da preparação difere do candidato de referência.')
    inherited=Repertoire(root/reference['preparedRepertoire'],reference['preparedSha256'])
    if data['metadata'].get('inheritedRepertoireSha256')!=inherited.sha256:
        raise ValueError('Origem da extensão divergente.')
    book=Repertoire(folder/'repertoire.json')
    if len(book.entries)<=len(inherited.entries):raise ValueError('Nenhuma resposta nova foi validada.')
    accepted={' '.join(row['history']):row for row in rows if row['accepted']}
    for history,entry in book.entries.items():
        gap=entry.get('gapCp')
        if entry['depth']<depth or not isinstance(gap,(int,float)) or not -10000<=gap<=maximum_loss:
            raise ValueError('Entrada não satisfaz a qualidade de publicação.')
        if history in inherited.entries:
            if entry!=inherited.entries[history]:raise ValueError('Uma resposta congelada foi alterada.')
        else:
            row=accepted.get(history,{})
            if (row.get('selected')!=entry['move'] or row.get('gapCp')!=gap or
                min(row.get('checkDepth',0),row.get('forcedDepth',0))<depth or
                row.get('checkBound',True) or row.get('forcedBound',True)):
                raise ValueError('Resposta nova sem confirmações completas.')
    return book


def publish(root, reference_id, candidate_id, label, folder, planned):
    if not re.fullmatch('[a-z0-9-]+',candidate_id):raise ValueError('ID inválido.')
    path=root/'candidates/registry.json';original=path.read_bytes();registry=json.loads(original)
    reference=next(c for c in registry['candidates'] if c['id']==reference_id)
    if any(c['id']==candidate_id for c in registry['candidates']):raise ValueError('Candidato já existe; não sobrescrever.')
    book=checked_preparation(folder,reference,root,planned)
    target=root/'openings'/f'{candidate_id}.json'
    if target.exists():raise ValueError('Livro de destino já existe; não sobrescrever.')
    candidate={**reference,'id':candidate_id,'label':label,
        'preparedRepertoire':target.relative_to(root).as_posix(),'preparedSha256':book.sha256,
        'notes':f'Experimental: {len(book.entries)} respostas conectadas, verificadas em profundidade 26. '
                'Mesmo motor NNUE19 da v5. Piloto em validação; ganho de força não comprovado.'}
    with target.open('xb') as out:out.write((folder/'repertoire.json').read_bytes())
    if path.read_bytes()!=original:raise RuntimeError('Cadastro mudou durante a publicação; preserve a edição concorrente.')
    registry['candidates'].insert(0,candidate)
    temporary=path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    temporary.replace(path)
    return candidate,reference


def command(root,candidate):
    return [sys._base_executable if os.name=='nt' else sys.executable,'-X','utf8','-u',
        str(root/'scripts/prepared_engine.py'),
        *(['--site-packages',str(Path(sys.prefix)/'Lib/site-packages')] if os.name=='nt' else []),
        '--engine',str(root/candidate['engine']),'--repertoire',str(root/candidate['preparedRepertoire']),
        '--sha256',candidate['preparedSha256']]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('preparation',type=Path)
    parser.add_argument('--id',required=True)
    parser.add_argument('--name',required=True)
    parser.add_argument('--reference',default='arthur-v6-prepared')
    parser.add_argument('--planned',type=int,default=24)
    args=parser.parse_args();folder=args.preparation.resolve()
    if not folder.is_relative_to(ROOT/'results/research'):parser.error('Use a pasta de pesquisa deste projeto.')
    queue_lock=reserve_queue()
    state={'pid':os.getpid(),'stage':'waiting','candidate':args.id}
    def update(stage,message,**extra):
        state.update(stage=stage,message=message,updatedAt=dt.datetime.now(dt.timezone.utc).isoformat(),**extra)
        atomic_json(folder/'pipeline.json',state)
        atomic_json(ROOT/'results/arena/research-queue.json',state)
        print(json.dumps(state,ensure_ascii=False),flush=True)
    try:
        update('waiting','Preparando respostas offline; depois haverá um piloto automático de oito partidas.')
        for _ in range(1440):  # até duas horas, sem manter um modelo GPT executando
            active=active_run()
            if (folder/'repertoire.json').exists() and not active:break
            if not active:raise RuntimeError('Preparação parou sem produzir o livro final.')
            if Path(active.get('output_dir','')).resolve()!=folder:
                raise RuntimeError('Outra atividade ocupou a máquina; piloto adiado.')
            time.sleep(5)
        else:raise TimeoutError('Prazo de duas horas para a preparação encerrado; nenhum processo foi interrompido.')
        candidate,reference=publish(ROOT,args.reference,args.id,args.name,folder,args.planned)
        target=ROOT/'results/arena'/f"{args.id}-pilot-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S')}"
        options={'Threads':2,'Hash':256,'Move Overhead':20,'Ponder':False}
        identities=[]
        for c in (candidate,reference):
            identities.append({**c,'binarySha256':digest(ROOT/c['engine']),
                               'preparationSha256':c['preparedSha256']})
        config={'match_id':target.name,'candidate_a':{'name':candidate['label'],'command':command(ROOT,candidate),'options':options,'prepared_repertoire':True},
            'candidate_b':{'name':reference['label'],'command':command(ROOT,reference),'options':options,'prepared_repertoire':True},
            'games':8,'time_control':{'base_seconds':30,'increment_seconds':0},
            'draw_policy':'played','openings':{'pgn':None,'seed':20261101},'max_plies':2000,
            'output_dir':str(target),'identities':identities}
        config_path=folder/'pilot-config.json'
        config_path.write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
        update('pilot','Candidato experimental cadastrado. Comparando v7 e v6 em oito partidas rápidas; não é prova de Elo.',match=str(target),entries=len(Repertoire(ROOT/candidate['preparedRepertoire']).entries))
        with (folder/'pilot.log').open('w',encoding='utf8') as log:
            run_owned([sys.executable,'-X','utf8','-u',str(ROOT/'arena/run_match.py'),str(config_path)],log,900,{**os.environ,'PYTHONUTF8':'1'})
        report=match_report(target)
        atomic_json(folder/'pilot-report.json',report)
        if report['status']!='finished' or report['failures'] or report['unfinishedGames'] or report['recordedGames']!=8:
            raise RuntimeError('Piloto terminou com problemas; consulte o relatório antes de usar o candidato.')
        update('done','Preparação e oito partidas concluídas. Relatório salvo; nenhuma promoção automática de versão.',scores=report['scores'],report=str(folder/'pilot-report.json'))
    except Exception as exc:
        update('failed',str(exc));return 1
    return 0


if __name__=='__main__':raise SystemExit(main())
