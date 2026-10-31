import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import { Engine } from './engine.ts';

test('motor travado é encerrado, sem deixar busca pendurada', async () => {
  const engine = new Engine([
    process.execPath,
    '--eval',
    `
    for await (const raw of console) {
      if (raw === 'uci') console.log('uciok');
      if (raw === 'isready') console.log('readyok');
    }
  `,
  ]);
  try {
    await engine.init({});
    await expect(engine.search([], 20)).rejects.toThrow('não respondeu no prazo');
    await expect(engine.search([], 20)).rejects.toThrow('motor foi encerrado');
  } finally {
    await engine.shutdown();
  }
}, 5000);

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
      // Reserva maior que o relógio força stop quase imediato, mantendo lance legal.
      const started = performance.now();
      const urgent = await engine.searchWithClocks([], {
        whiteMillis: 1000,
        blackMillis: 1000,
        reserveMillis: 2000,
      });
      expect(performance.now() - started).toBeLessThan(1500);
      expect(new Chess().moves({ verbose: true }).some((m) => m.lan === urgent.bestmove)).toBe(true);
    } finally {
      engine.quit();
    }
  },
  15000,
);
