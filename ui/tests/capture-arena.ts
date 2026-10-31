/** Snapshot de leitura para a validação visual; não inicia partidas. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ArenaService } from '../src/arena.ts';
import { Candidates } from '../src/candidates.ts';

const root = resolve(import.meta.dir, '../..');
const folder = join(root, 'results/visual');
mkdirSync(folder, { recursive: true });
const arena = new ArenaService(root, new Candidates('unused'));
writeFileSync(join(folder, 'arena-readonly-snapshot.json'), JSON.stringify(await arena.snapshot()));
