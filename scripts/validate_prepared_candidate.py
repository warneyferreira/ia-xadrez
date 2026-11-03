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


def completed_dependency(folder):
    report=match_report(folder)
    if (report['status']!='finished' or report['failures'] or report['unfinishedGames'] or
        report['warnings'] or report['recordedGames']!=report['plannedGames']):
        raise ValueError('A bateria anterior não terminou integralmente sem falhas; pesquisa adiada.')
    return report


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
    parser.add_argument('--deepen-after',type=Path,help='aguarda esta bateria terminar e prepara uma extensão profunda antes do piloto')
    args=parser.parse_args();folder=args.preparation.resolve()
    if not folder.is_relative_to(ROOT/'results/research'):parser.error('Use a pasta de pesquisa deste projeto.')
    if not 1<=args.planned<=200:parser.error('Planeje de 1 a 200 posições.')
    after=args.deepen_after.resolve() if args.deepen_after else None
    if after and (not after.is_relative_to(ROOT/'results/arena') or not (after/'config.json').is_file() or folder.exists()):
        parser.error('Use bateria existente deste projeto e pasta de preparação nova.')
    registry=json.loads((ROOT/'candidates/registry.json').read_bytes())
    if (not re.fullmatch('[a-z0-9-]+',args.id) or
        any(c['id']==args.id for c in registry['candidates']) or
        (ROOT/'openings'/f'{args.id}.json').exists()):parser.error('Use ID novo e válido; não sobrescrever candidato/livro.')
    reference=next((c for c in registry['candidates'] if c['id']==args.reference),None)
    if not reference or not reference.get('preparedRepertoire'):parser.error('Referência precisa ser um candidato com repertório verificado.')
    frozen_paths=[ROOT/reference['engine'],ROOT/reference['preparedRepertoire'],
                  ROOT/'scripts/prepare_opponent.py',ROOT/'arena/repertoire.py',
                  ROOT/'bin/baseline-effdc3fd3/stockfish.exe',ROOT/'scripts/prepared_engine.py']
    frozen={str(path):digest(path) for path in frozen_paths}
    queue_lock=reserve_queue()
    state={'pid':os.getpid(),'stage':'waiting','candidate':args.id}
    def update(stage,message,**extra):
        state.update(stage=stage,message=message,updatedAt=dt.datetime.now(dt.timezone.utc).isoformat(),**extra)
        atomic_json(folder/'pipeline.json',state)
        atomic_json(folder.parent/(folder.name+'.pipeline.json'),state)
        atomic_json(ROOT/'results/arena/research-queue.json',state)
        print(json.dumps(state,ensure_ascii=False),flush=True)
    try:
        if after:
            update('waiting','Aguardando os duelos 25+0. A pesquisa profunda só começará depois; nenhuma engine adicional está rodando.',after=after.name)
            for _ in range(1440):
                active=active_run()
                if (after/'summary.json').exists() and not active:break
                if not active:raise RuntimeError('A bateria anterior parou sem resumo; pesquisa adiada.')
                if Path(active.get('output_dir','')).resolve()!=after:
                    raise RuntimeError('Outra atividade está ocupando a máquina; pesquisa adiada.')
                time.sleep(10)
            else:raise TimeoutError('Espera de quatro horas encerrada; os duelos não foram interrompidos.')
            dependency=completed_dependency(after)
            if any(digest(Path(path))!=sha for path,sha in frozen.items()):
                raise RuntimeError('Motor, livro ou preparador mudou durante a espera. Reagende com referências conferidas.')
            current=json.loads((ROOT/'candidates/registry.json').read_bytes())
            if next(c for c in current['candidates'] if c['id']==args.reference)!=reference:
                raise RuntimeError('O candidato de referência mudou durante a espera; pesquisa adiada.')
            update('preparing','Estudando continuações mais longas e equilibrando brancas e respostas de pretas. Sem GPT.',sourceSha256=frozen,dependencySha256=dependency['sourceSha256'])
            preparation=[sys.executable,'-X','utf8','-u',str(ROOT/'scripts/prepare_opponent.py'),
                '--engine',str(ROOT/reference['engine']),'--extend-repertoire',str(ROOT/reference['preparedRepertoire']),
                '--opponent',str(ROOT/'bin/baseline-effdc3fd3/stockfish.exe'),'--output',str(folder),
                '--positions',str(args.planned),'--teacher-seconds','3','--reply-seconds','5','15',
                '--verify-seconds','2','--verify-depth','26','--max-loss-cp','5',
                '--branch-replies','2','--branch-seconds','3','--exploration','depth-balanced','--max-ply','22',
                '--seed-pgn',str(after/'games.pgn'),'--seed-min-ply','6','--seed-max-ply','22']
            with (folder.parent/(folder.name+'.prepare.log')).open('x',encoding='utf8') as log:
                run_owned(preparation,log,7200,{**os.environ,'PYTHONUTF8':'1'})
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
        update('pilot',f"Comparando {candidate['label']} e {reference['label']} em oito partidas rápidas; não é prova de Elo.",match=str(target),entries=len(Repertoire(ROOT/candidate['preparedRepertoire']).entries))
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
