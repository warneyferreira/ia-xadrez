import { test, expect } from 'bun:test';
import { Candidates } from './candidates.ts';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, readFileSync } from 'node:fs';
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
  const nnue19 = registry.get('arthur-v5-nnue19');
  expect(nnue19.build?.repository).toBe('https://github.com/official-stockfish/Stockfish.git');
  expect(nnue19.sourceCommit).toBe('ff7cee4244ec96ea488c402669e3674c0574dce6');
  expect(nnue19.preparedRepertoire).toBeUndefined();
  const prepared19 = registry.get('arthur-v6-prepared');
  expect(prepared19.engineId).toBe(nnue19.id);
  expect(prepared19.engine).toBe(nnue19.engine);
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('../../' + prepared19.preparedRepertoire, import.meta.url)))
      .digest('hex'),
  ).toBe(prepared19.preparedSha256!);
  const prepared = registry.get('arthur-v4-prepared');
  expect(prepared.engineId).toBe('arthur-v2');
  expect(prepared.book).toBe(true);
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('../../' + prepared.preparedRepertoire, import.meta.url)))
      .digest('hex'),
  ).toBe(prepared.preparedSha256!);
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
    const external = {
      ...candidate,
      build: {
        architecture: 'auto' as const,
        pgo: true,
        repository: 'https://github.com/official-stockfish/Stockfish.git' as const,
      },
    };
    expect(() => registry.identity(external)).toThrow('diverge do manifesto');
    writeFileSync(
      manifest,
      JSON.stringify({
        id: candidate.id,
        sourceCommit: candidate.sourceCommit,
        binarySha256: sha,
        repository: external.build.repository,
      }),
    );
    expect(registry.identity(external).binarySha256).toBe(sha);
    unlinkSync(manifest);
    expect(() => registry.identity(external)).toThrow('Manifesto de origem ausente');
    writeFileSync(
      manifest,
      JSON.stringify({ id: candidate.id, sourceCommit: candidate.sourceCommit, binarySha256: sha }),
    );
    writeFileSync(binary, 'substituido-sem-manifesto');
    expect(() => registry.identity(candidate)).toThrow('diverge do manifesto');
  } finally {
    unlinkSync(binary);
    unlinkSync(manifest);
    rmdirSync(dir);
  }
});

test('novos candidatos aparecem sem reiniciar e cadastro inválido não é aceito', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chess-catalog-'));
  const path = join(dir, 'registry.json');
  const initial = new Candidates('unused').list();
  try {
    writeFileSync(path, JSON.stringify(initial));
    const live = new Candidates('unused', path);
    expect(() => live.get('novo-candidato')).toThrow('desconhecido');
    const next = {
      ...initial,
      candidates: [
        ...initial.candidates,
        {
          ...initial.candidates[0]!,
          id: 'novo-candidato',
          label: 'Candidato de teste publicado',
        },
      ],
    };
    writeFileSync(path, JSON.stringify(next));
    expect(live.get('novo-candidato').label).toBe('Candidato de teste publicado');
    expect(live.get('arthur-v2').id).toBe('arthur-v2');
    writeFileSync(path, JSON.stringify({ ...next, candidates: [...next.candidates, next.candidates[0]] }));
    expect(() => live.list()).toThrow('IDs de candidatos inválidos');
    writeFileSync(path, JSON.stringify(initial));
    expect(live.list().candidates.length).toBe(initial.candidates.length);
  } finally {
    unlinkSync(path);
    rmdirSync(dir);
  }
});
