"""Instala Syzygy 3-4-5 offline a partir do mirror HTTPS do Lichess."""
import concurrent.futures
import hashlib
import json
import re
import time
import os
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = Path(os.environ['LOCALAPPDATA']) / 'ChessChallenge' / 'syzygy' / '3-4-5'
BASE = 'https://tablebase.lichess.ovh/tables/standard/'


def install(item):
    url, name = item
    target = TARGET / name
    magic = bytes.fromhex('71e8235d' if name.endswith('rtbw') else 'd7660ca5')
    def valid(path):
        if not path.exists() or path.stat().st_size % 64 != 16:
            return False
        with path.open('rb') as f:
            return f.read(4) == magic
    if not valid(target):
        partial = target.with_suffix(target.suffix + '.part')
        for attempt in range(6):
            try:
                with urllib.request.urlopen(url, timeout=120) as response, partial.open('wb') as stream:
                    expected = int(response.headers['Content-Length'])
                    while chunk := response.read(1024 * 1024):
                        stream.write(chunk)
                if partial.stat().st_size != expected:
                    raise RuntimeError(f'Transferência incompleta: {name}')
                break
            except (OSError, RuntimeError):
                if attempt == 5:
                    raise
                time.sleep(attempt + 1)
        if not valid(partial):
            raise RuntimeError(f'Arquivo inválido: {name}')
        for attempt in range(10):
            try:
                partial.replace(target)
                break
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(1)
    with target.open('rb') as f:
        digest = hashlib.file_digest(f, 'sha256').hexdigest()
    return {'name': name, 'size': target.stat().st_size, 'sha256': digest, 'source': url}


def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    previous = ROOT / 'tablebases-config' / 'data' / '3-4-5'
    for file in previous.glob('*.rtb*'):
        if file.suffix in ('.rtbw', '.rtbz') and not (TARGET / file.name).exists():
            shutil.copy2(file, TARGET / file.name)
    items = []
    for kind, extension in [('wdl', 'rtbw'), ('dtz', 'rtbz')]:
        url = BASE + f'3-4-5-{kind}/'
        with urllib.request.urlopen(url, timeout=30) as response:
            html = response.read().decode()
        names = sorted(set(re.findall(r'href="([KQRBNP]+v[KQRBNP]+\.' + extension + r')"', html)))
        if len(names) != 145:
            raise RuntimeError(f'Lista incompleta de {kind}: {len(names)} arquivos')
        items.extend((url + name, name) for name in sorted(names, key=lambda n: (len(n.split('.')[0]), n)))
    manifest = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for row in pool.map(install, items):
            manifest.append(row)
            if len(manifest) % 10 == 0:
                print(f'Syzygy: {len(manifest)}/{len(items)} arquivos', flush=True)
    (TARGET / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
    print(f'Instalado: {len(manifest)} arquivos em {TARGET}', flush=True)


if __name__ == '__main__':
    main()
