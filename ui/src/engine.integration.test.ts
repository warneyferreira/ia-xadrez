import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import { Engine } from './engine.ts';

test.skipIf(!process.env.TEST_ENGINE)(
  'UCI: busca, previsão interrompida e nova partida',
  async () => {
    const engine = new Engine(process.env.TEST_ENGINE!);
    try {
      await engine.init({ Threads: 1, Hash: 64 });
      const first = await engine.search(['e2e4'], 150);
      const board = new Chess();
      board.move('e2e4');
      board.move(first.bestmove);
      expect(board.history().length).toBe(2);
      expect(first.nodes).toBeGreaterThan(0);
      expect(first.nps).toBeGreaterThan(0);
      if (first.ponder) {
        board.move(first.ponder);
        const background = engine.search(
          board.history({ verbose: true }).map((m) => m.lan),
          60000,
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        await engine.newGame();
        await background;
      }
      const next = await engine.search([], 150);
      expect(new Chess().moves({ verbose: true }).some((m) => m.lan === next.bestmove)).toBe(true);
    } finally {
      engine.quit();
    }
  },
  15000,
);
