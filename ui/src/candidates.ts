import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export type Candidate = {
  id: string;
  label: string;
  owner: string;
  engine: string;
  sourceCommit: string;
  threads: number;
  hashMB: number;
  book: boolean;
  syzygy: boolean;
  tournamentCriticalTime?: boolean;
  engineId?: string;
  preparedRepertoire?: string;
  preparedSha256?: string;
  notes: string;
  build?: { architecture: 'auto' | 'x86-64-avx2' | 'x86-64-avxvnni'; pgo: boolean };
};
export class Candidates {
  private data: { aliases: Record<string, string>; candidates: Candidate[] };
  private hashes = new Map<string, { stamp: string; sha: string }>();
  private root: string;
  private preparedPython: string | null = null;
  constructor(private defaultEngine: string) {
    const registry = existsSync('candidates/registry.json')
      ? resolve('candidates/registry.json')
      : resolve('../candidates/registry.json');
    this.root = dirname(dirname(registry));
    this.data = JSON.parse(readFileSync(registry, 'utf8'));
    const ids = new Set<string>();
    for (const c of this.data.candidates) {
      if (c.tournamentCriticalTime !== undefined && typeof c.tournamentCriticalTime !== 'boolean')
        throw new Error(`Política de tempo inválida: ${c.id}`);
      if (!/^[a-z0-9-]+$/.test(c.id) || ids.has(c.id))
        throw new Error('IDs de candidatos inválidos ou duplicados.');
      if (
        !Number.isInteger(c.threads) ||
        c.threads < 1 ||
        c.threads > 128 ||
        !Number.isInteger(c.hashMB) ||
        c.hashMB < 16 ||
        c.hashMB > 10240
      )
        throw new Error(`Recursos inválidos: ${c.id}`);
      ids.add(c.id);
    }
    for (const id of Object.values(this.data.aliases))
      if (!ids.has(id)) throw new Error(`Alias aponta para candidato ausente: ${id}`);
    for (const c of this.data.candidates) {
      if (c.engineId) {
        const base = this.data.candidates.find((b) => b.id === c.engineId);
        if (!base || base.engine !== c.engine || base.sourceCommit !== c.sourceCommit)
          throw new Error(`Motor compartilhado inconsistente: ${c.id}`);
      }
      if (
        c.preparedRepertoire &&
        (!/^openings\/[a-z0-9-]+\.json$/.test(c.preparedRepertoire) ||
          !/^[a-f0-9]{64}$/.test(c.preparedSha256 ?? ''))
      )
        throw new Error(`Preparação inválida: ${c.id}`);
    }
  }
  list() {
    return this.data;
  }
  get(id: string) {
    const c = this.data.candidates.find((c) => c.id === (this.data.aliases[id] ?? id));
    if (!c) throw new Error(`Candidato desconhecido: ${id}`);
    return c;
  }
  path(c: Candidate) {
    const path = c.engine === '$DEFAULT' ? this.defaultEngine : resolve(this.root, c.engine);
    if (!existsSync(path)) throw new Error(`Compile/instale o binário do candidato ${c.id}: ${path}`);
    return path;
  }
  identity(c: Candidate) {
    const path = this.path(c);
    const stat = statSync(path);
    const stamp = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (this.hashes.get(path)?.stamp !== stamp)
      this.hashes.set(path, { stamp, sha: createHash('sha256').update(readFileSync(path)).digest('hex') });
    const sha = this.hashes.get(path)!.sha;
    const manifest = resolve(dirname(path), 'build.json');
    const buildManifest = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : null;
    if (
      buildManifest &&
      (buildManifest.binarySha256 !== sha ||
        buildManifest.id !== (c.engineId ?? c.id) ||
        typeof buildManifest.sourceCommit !== 'string' ||
        !buildManifest.sourceCommit.toLowerCase().startsWith(c.sourceCommit.toLowerCase()))
    )
      throw new Error(`Binário diverge do manifesto: ${c.id}. Reinstale o candidato.`);
    let preparationSha256: string | null = null,
      controllerSha256: string | null = null;
    if (c.preparedRepertoire) {
      preparationSha256 = createHash('sha256')
        .update(readFileSync(resolve(this.root, c.preparedRepertoire)))
        .digest('hex');
      if (preparationSha256 !== c.preparedSha256) throw new Error(`Preparação foi alterada: ${c.id}`);
      controllerSha256 = createHash('sha256')
        .update(readFileSync(resolve(this.root, 'scripts/prepared_engine.py'), 'utf8').replace(/\r\n/g, '\n'))
        .update('\n')
        .update(readFileSync(resolve(this.root, 'arena/repertoire.py'), 'utf8').replace(/\r\n/g, '\n'))
        .digest('hex');
    }
    return { ...c, binarySha256: sha, buildManifest, preparationSha256, controllerSha256 };
  }
  command(c: Candidate): string[] {
    if (!c.preparedRepertoire) return [this.path(c)];
    this.identity(c);
    return this.wrapPrepared(this.path(c), resolve(this.root, c.preparedRepertoire), c.preparedSha256!);
  }
  wrapPrepared(engine: string, repertoire: string, sha: string): string[] {
    if (
      !/^[a-f0-9]{64}$/.test(sha) ||
      createHash('sha256').update(readFileSync(repertoire)).digest('hex') !== sha
    )
      throw new Error('Preparação offline inválida ou alterada.');
    const venv = resolve(
      this.root,
      process.platform === 'win32' ? 'arena/.venv/Scripts/python.exe' : 'arena/.venv/bin/python',
    );
    if (!this.preparedPython) {
      if (process.platform === 'win32') {
        const probe = Bun.spawnSync([venv, '-X', 'utf8', '-c', 'import sys;print(sys._base_executable)']);
        if (probe.exitCode !== 0) throw new Error('Prepare o ambiente Python com scripts/setup.ps1.');
        this.preparedPython = new TextDecoder().decode(probe.stdout).trim();
        if (!existsSync(this.preparedPython)) throw new Error('Interpretador Python indisponível.');
      } else this.preparedPython = venv;
    }
    return [
      this.preparedPython,
      '-X',
      'utf8',
      '-u',
      resolve(this.root, 'scripts/prepared_engine.py'),
      ...(process.platform === 'win32'
        ? ['--site-packages', resolve(this.root, 'arena/.venv/Lib/site-packages')]
        : []),
      '--engine',
      engine,
      '--repertoire',
      repertoire,
      '--sha256',
      sha,
    ];
  }
}
