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
  notes: string;
  build?: { architecture: 'auto' | 'x86-64-avx2' | 'x86-64-avxvnni'; pgo: boolean };
};
export class Candidates {
  private data: { aliases: Record<string, string>; candidates: Candidate[] };
  private hashes = new Map<string, { stamp: string; sha: string }>();
  private root: string;
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
        buildManifest.id !== c.id ||
        typeof buildManifest.sourceCommit !== 'string' ||
        !buildManifest.sourceCommit.toLowerCase().startsWith(c.sourceCommit.toLowerCase()))
    )
      throw new Error(`Binário diverge do manifesto: ${c.id}. Reinstale o candidato.`);
    return { ...c, binarySha256: sha, buildManifest };
  }
}
