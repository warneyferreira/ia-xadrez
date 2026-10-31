import { readFileSync, existsSync } from 'node:fs';
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
  notes: string;
};
export class Candidates {
  private data: { aliases: Record<string, string>; candidates: Candidate[] };
  private hashes = new Map<string, string>();
  private root: string;
  constructor(private defaultEngine: string) {
    const registry = existsSync('candidates/registry.json')
      ? resolve('candidates/registry.json')
      : resolve('../candidates/registry.json');
    this.root = dirname(dirname(registry));
    this.data = JSON.parse(readFileSync(registry, 'utf8'));
    const ids = new Set<string>();
    for (const c of this.data.candidates) {
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
    if (!this.hashes.has(path))
      this.hashes.set(path, createHash('sha256').update(readFileSync(path)).digest('hex'));
    return { ...c, binarySha256: this.hashes.get(path) };
  }
}
