import { test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { Engine } from './engine.ts';
import { TournamentBrain } from './tournament-brain.ts';
const fixture = fileURLToPath(new URL('../tests/fixtures/ponder-engine.ts', import.meta.url));
test('preparação é identificada sem inventar avaliação ou nós pesquisados', async () => {
  const engine = new Engine([process.execPath, fixture, '--prepared']);
  try {
    await engine.init({});
    const result = await engine.search([], 100);
    expect(result.source).toBe('book');
    expect(result.score).toBeNull();
    expect(result.nodes).toBe(0);
    expect(result.preparationSha256).toBe('a'.repeat(64));
  } finally {
    await engine.shutdown();
  }
});
test('preparação após previsão confirmada limpa métricas da busca descartada', async () => {
  const engine = new Engine([process.execPath, fixture, '--prepared']);
  const brain = new TournamentBrain(engine, { ponder: true, forcedMoves: true });
  try {
    await engine.init({});
    const game = new Chess();
    game.move('e4');
    const clocks = { whiteMillis: 2000, blackMillis: 2000 };
    await brain.anticipate(game, 'e7e5', clocks);
    game.move('e5');
    const result = await brain.respond(game, clocks);
    expect(result.source).toBe('book');
    expect(result.score).toBeNull();
    expect(result.nodes).toBe(0);
    expect(result.ponderHit).toBe(false);
    expect(game.moves({ verbose: true }).some((m) => m.lan === result.bestmove)).toBe(true);
  } finally {
    await brain.stop();
    await engine.shutdown();
  }
});
