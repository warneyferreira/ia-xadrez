import { test, expect } from 'bun:test';
import { Candidates } from './candidates.ts';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

test('aliases resolvem versões fixas e baseline tem slot próprio', () => {
  const registry = new Candidates('Stockfish/src/stockfish.exe');
  expect(registry.get('arthur-latest').id).toBe('arthur-v2');
  expect(registry.get('arthur-v2').engine).not.toBe(registry.get('arthur-v1').engine);
  expect(registry.get('arthur-v2').book).toBe(false);
  expect(registry.get('arthur-v3-critical').tournamentCriticalTime).toBe(true);
  expect(registry.get('arthur-v2').tournamentCriticalTime).toBeUndefined();
  expect(registry.get('vanderlei-latest').id).toBe('vanderlei-base');
  expect(registry.get('vanderlei-base').engine).toBe('bin/baseline-effdc3fd3/stockfish.exe');
  expect(() => registry.get('inexistente')).toThrow('desconhecido');
});

test('manifesto rejeita executável substituído mesmo após consulta anterior', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chess-candidate-'));
  const binary = join(dir, 'stockfish.exe');
  const manifest = join(dir, 'build.json');
  const registry = new Candidates(binary);
  const candidate = { ...registry.get('arthur-v2'), engine: binary };
  try {
    writeFileSync(binary, 'original');
    const sha = createHash('sha256').update('original').digest('hex');
    writeFileSync(
      manifest,
      JSON.stringify({ id: candidate.id, sourceCommit: candidate.sourceCommit, binarySha256: sha }),
    );
    expect(registry.identity(candidate).binarySha256).toBe(sha);
    writeFileSync(binary, 'substituido-sem-manifesto');
    expect(() => registry.identity(candidate)).toThrow('diverge do manifesto');
  } finally {
    unlinkSync(binary);
    unlinkSync(manifest);
    rmdirSync(dir);
  }
});
