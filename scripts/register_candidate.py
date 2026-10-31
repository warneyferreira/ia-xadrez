"""Registra uma versão imutável e atualiza opcionalmente o alias do dono."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--id', required=True)
parser.add_argument('--owner', choices=['arthur', 'vanderlei'], required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--engine', required=True)
parser.add_argument('--source-commit', required=True)
parser.add_argument('--from-id', default='vanderlei-base')
parser.add_argument('--latest', action='store_true')
args = parser.parse_args()
path = Path(__file__).resolve().parents[1] / 'candidates/registry.json'
data = json.loads(path.read_text(encoding='utf8'))
if not re.fullmatch('[a-z0-9-]+', args.id): parser.error('ID deve conter letras minúsculas, números e hífen.')
if not re.fullmatch('[0-9a-fA-F]{7,40}', args.source_commit): parser.error('Informe um hash Git real de 7 a 40 caracteres hexadecimais.')
if any(c['id'] == args.id for c in data['candidates']): parser.error('Versão já existe. Use um novo ID.')
parent = next((c for c in data['candidates'] if c['id'] == args.from_id), None)
if not parent: parser.error('Candidato de origem não encontrado.')
candidate = {**parent, 'id': args.id, 'label': args.name, 'owner': args.owner.title(),
             'engine': args.engine, 'sourceCommit': args.source_commit, 'notes': 'Candidato novo: medir na arena antes de promover à release.'}
data['candidates'].append(candidate)
if args.latest: data['aliases'][args.owner + '-latest'] = args.id
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'Registrado {args.id}. Reinicie o servidor para carregar o registro. Commit/push são passos separados.')
