import { test, expect } from 'bun:test';
import { MEMORY_PROFILES, memoryBudget, requireMemory } from './resources.ts';

test('perfil máximo realmente solicita 10 GB de Hash', () => {
  expect(MEMORY_PROFILES.maximum.hashMB).toBe(10240);
  expect(memoryBudget(10240, 13 * 2 ** 30).fits).toBe(true);
});

test('memória instalada não substitui memória disponível', () => {
  expect(() => requireMemory(10240, 4 * 2 ** 30)).toThrow('RAM livres');
  expect(() => requireMemory(256, 4 * 2 ** 30)).not.toThrow();
});
