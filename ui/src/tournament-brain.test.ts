import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import { fileURLToPath } from 'node:url';
import { Engine } from './engine.ts';
import { TournamentBrain } from './tournament-brain.ts';

const clocks = { whiteMillis: 60000, blackMillis: 60000, reserveMillis: 100 };
async function setup() {
  const engine = new Engine([
    process.execPath,
    fileURLToPath(new URL('../tests/fixtures/ponder-engine.ts', import.meta.url)),
  ]);
  await engine.init({});
  return { engine, brain: new TournamentBrain(engine, { ponder: true, forcedMoves: true }) };
}
test('previsão confirmada usa ponderhit e reaproveita a busca', async () => {
  const { engine, brain } = await setup();
  try {
    const game = new Chess();
    game.move('e4');
    await brain.anticipate(game, 'e7e5', clocks);
    game.move('e5');
    const result = await brain.respond(game, clocks);
    expect(result.ponderHit).toBe(true);
    expect(result.nodes).toBe(900);
    expect(game.moves({ verbose: true }).some((m) => m.lan === result.bestmove)).toBe(true);
    expect(brain.snapshot().hits).toBe(1);
  } finally {
    await brain.stop();
    await engine.shutdown();
  }
});
test('previsão errada é descartada e a posição real é pesquisada', async () => {
  const { engine, brain } = await setup();
  try {
    const game = new Chess();
    game.move('e4');
    await brain.anticipate(game, 'e7e5', clocks);
    game.move('c5');
    const result = await brain.respond(game, clocks);
    expect(result.ponderHit).not.toBe(true);
    expect(result.nodes).toBe(400);
    expect(brain.snapshot().misses).toBe(1);
    expect(game.moves({ verbose: true }).some((m) => m.lan === result.bestmove)).toBe(true);
  } finally {
    await brain.stop();
    await engine.shutdown();
  }
});
test('único lance legal dispensa busca sem inventar avaliação', async () => {
  const { engine, brain } = await setup();
  try {
    const game = new Chess('7k/8/6K1/8/8/8/8/R7 b - - 0 1');
    expect(game.moves()).toHaveLength(1);
    const reply = await brain.respond(game, clocks);
    expect(reply.bestmove).toBe('h8g8');
    expect(reply.source).toBe('forced');
    expect(reply.score).toBeNull();
    expect(reply.nodes).toBe(0);
  } finally {
    await brain.stop();
    await engine.shutdown();
  }
});
test('cancelar antes de ponder iniciar não bloqueia a próxima partida', async () => {
  const { engine, brain } = await setup();
  try {
    const game = new Chess();
    game.move('e4');
    const pending = brain.anticipate(game, 'e7e5', clocks);
    brain.cancel();
    await pending;
    await engine.newGame();
    const next = await engine.search([], 50);
    expect(new Chess().moves({ verbose: true }).some((m) => m.lan === next.bestmove)).toBe(true);
    expect(brain.snapshot().thinking).toBe(false);
  } finally {
    await brain.stop();
    await engine.shutdown();
  }
});
