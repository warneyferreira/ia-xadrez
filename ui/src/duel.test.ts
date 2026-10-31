import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import { ending } from './duel.ts';

test('duelo distingue mate, afogamento e partida em andamento', () => {
  expect(ending(new Chess())).toBeNull();
  expect(ending(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toContain('Afogamento');
  const board = new Chess();
  for (const move of ['f3', 'e5', 'g4', 'Qh4#']) board.move(move);
  expect(ending(board)).toBe('0-1 · Xeque-mate');
});

test('duelo registra repetição em vez de decidir por material', () => {
  const board = new Chess();
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) board.move(move);
  expect(ending(board)).toContain('Repetição tripla');
});
