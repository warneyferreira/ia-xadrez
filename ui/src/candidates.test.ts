import { test, expect } from 'bun:test';
import { Candidates } from './candidates.ts';

test('aliases resolvem versões fixas e baseline tem slot próprio', () => {
  const registry = new Candidates('Stockfish/src/stockfish.exe');
  expect(registry.get('arthur-latest').id).toBe('arthur-v1');
  expect(registry.get('vanderlei-latest').id).toBe('vanderlei-base');
  expect(registry.get('vanderlei-base').engine).toBe('bin/baseline-effdc3fd3/stockfish.exe');
  expect(() => registry.get('inexistente')).toThrow('desconhecido');
});
