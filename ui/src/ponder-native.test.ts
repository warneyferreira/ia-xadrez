import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import { Engine } from './engine.ts';

test.skipIf(!process.env.TEST_ENGINE)(
  'Stockfish real aceita go ponder e ponderhit com lance legal',
  async () => {
    const engine = new Engine(process.env.TEST_ENGINE!);
    try {
      await engine.init({ Threads: 1, Hash: 16, Ponder: 'true' });
      const first = await engine.search([], 150);
      expect(first.ponder).toBeDefined();
      const game = new Chess();
      game.move(first.bestmove);
      const moves = [first.bestmove, first.ponder!];
      const background = engine.startPonder(moves, { whiteMillis: 2000, blackMillis: 2000 });
      await background.ready;
      await new Promise((resolve) => setTimeout(resolve, 120));
      game.move(first.ponder!);
      expect(background.hit({ whiteMillis: 2000, blackMillis: 1800, reserveMillis: 100 })).toBe(true);
      const result = await background.result;
      expect(result.ponderHit).toBe(true);
      expect(result.ponderMillis).toBeGreaterThanOrEqual(100);
      expect(game.moves({ verbose: true }).some((m) => m.lan === result.bestmove)).toBe(true);
      await engine.newGame();
    } finally {
      await engine.shutdown();
    }
  },
  15000,
);
