import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import { grade, whiteScore } from './review.ts';
import { review } from './review.ts';
import { Engine } from './engine.ts';

test('avaliação usa sempre a perspectiva branca', () => {
  expect(whiteScore({ unit: 'cp', value: 150 }, 'b')).toBe(-150);
  expect(whiteScore({ unit: 'mate', value: -3 }, 'b')).toBe(10000);
  expect(grade(250, false)).toBe('Gafe');
  expect(grade(5, false)).toBe('Excelente');
});

test.skipIf(!process.env.TEST_ENGINE)(
  'explicação de mate é factual e progresso corresponde às posições',
  async () => {
    const engine = new Engine(process.env.TEST_ENGINE!);
    try {
      await engine.init({ Threads: 1, Hash: 32 });
      let completed = 0;
      const rows = await review(engine, ['f2f3', 'e7e5', 'g2g4', 'd8h4'], (n) => {
        completed = n;
      });
      expect(completed).toBe(4);
      expect(rows[3]!.explanation).toContain('xeque-mate');
      expect(rows[3]!.whiteCp).toBe(-10000);
    } finally {
      engine.quit();
    }
  },
  10000,
);

test('dama extra não transforma afogamento em vitória', () => {
  const board = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  expect(board.isStalemate()).toBe(true);
  expect(board.isCheckmate()).toBe(false);
  expect(board.isDraw()).toBe(true);
});
