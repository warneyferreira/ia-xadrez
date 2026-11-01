import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import { Engine } from './engine.ts';

test.skipIf(!process.env.TEST_ENGINE)(
  'Stockfish real aceita go ponder e ponderhit com lance legal',
  async () => {
    const engine = new Engine(process.env.TEST_ENGINE!);
    try {
      const critical = process.env.TEST_CRITICAL_TIME === '1';
      await engine.init({
        Threads: 1,
        Hash: 16,
        Ponder: 'true',
        ...(critical ? { 'Tournament Critical Time': 'true' } : {}),
      });
      const history: string[] = critical
        ? (await Bun.file(new URL('../../positions/conversion-v1.json', import.meta.url)).json()).positions[0]
            .moves
        : [];
      const first = await engine.search(history, 150);
      expect(first.ponder).toBeDefined();
      const game = new Chess();
      for (const move of history) game.move(move);
      game.move(first.bestmove);
      const moves = [...history, first.bestmove, first.ponder!];
      const initialClock = critical ? 30000 : 2000;
      const background = engine.startPonder(moves, { whiteMillis: initialClock, blackMillis: initialClock });
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
