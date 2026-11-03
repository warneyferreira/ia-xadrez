import { test, expect } from 'bun:test';
import { Chess } from 'chess.js';
import type { Engine, SearchResult } from './engine.ts';
import { TournamentBrain } from './tournament-brain.ts';

function fixture() {
  let searches = 0,
    cancels = 0;
  const pending = Promise.withResolvers<SearchResult>();
  const engine = {
    stop() {},
    async searchWithClocks() {
      searches++;
      return { bestmove: 'b8c6', depth: 1, score: null };
    },
    startPonder() {
      return {
        ready: Promise.resolve(),
        result: pending.promise,
        cancel() {
          cancels++;
        },
        hit() {
          throw new Error('Não reaproveitar previsão após mate exato.');
        },
      };
    },
  } as unknown as Engine;
  const brain = new TournamentBrain(engine, { ponder: true, forcedMoves: true });
  return {
    brain,
    pending,
    get searches() {
      return searches;
    },
    get cancels() {
      return cancels;
    },
  };
}
const clocks = { whiteMillis: 100, blackMillis: 100, reserveMillis: 20 };

test('mate em um pelas duas cores é legal, não altera o tabuleiro e não inicia busca', async () => {
  const black = new Chess();
  for (const san of ['f3', 'e5', 'g4']) black.move(san);
  const positions = [
    new Chess('7k/6pp/5KQ1/8/8/8/8/8 w - - 0 1'),
    black,
    new Chess('7k/5KP1/8/8/8/8/8/8 w - - 0 1'),
  ];
  for (const game of positions) {
    const f = fixture(),
      before = game.fen(),
      history = game.history();
    const reply = await f.brain.respond(game, clocks);
    expect(reply.source).toBe('proven-mate');
    expect(reply.score).toEqual({ unit: 'mate', value: 1 });
    expect(reply.nodes).toBe(0);
    expect(f.searches).toBe(0);
    expect(game.fen()).toBe(before);
    expect(game.history()).toEqual(history);
    game.move(reply.bestmove);
    expect(game.isCheckmate()).toBe(true);
    expect(f.brain.snapshot().immediateMates).toBe(1);
    await f.brain.reset();
    expect(f.brain.snapshot().immediateMates).toBe(0);
  }
});

test('xeque sem mate mantém busca e posição já encerrada é recusada', async () => {
  const f = fixture(),
    game = new Chess();
  for (const move of ['f3', 'e5', 'e4']) game.move(move);
  expect(game.moves()).toContain('Qh4+');
  expect(game.moves().some((san) => san.endsWith('#'))).toBe(false);
  const reply = await f.brain.respond(game, clocks);
  expect(reply.source).toBe('search');
  expect(f.searches).toBe(1);
  await expect(f.brain.respond(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), clocks)).rejects.toThrow(
    'já terminou',
  );
});

test('mate descarta ponder e cancelamento durante a parada impede resposta antiga', async () => {
  for (const cancel of [false, true]) {
    const f = fixture(),
      game = new Chess();
    game.move('f3');
    game.move('e5');
    await f.brain.anticipate(game, 'g2g4', clocks);
    game.move('g4');
    const reply = f.brain.respond(game, clocks);
    expect(f.cancels).toBe(1);
    if (cancel) f.brain.cancel();
    f.pending.resolve({ bestmove: 'b8c6', depth: 3, score: null, ponderMillis: 250 });
    if (cancel) await expect(reply).rejects.toThrow('cancelada');
    else expect((await reply).source).toBe('proven-mate');
    expect(f.searches).toBe(0);
    expect(f.brain.snapshot().hits).toBe(0);
    expect(f.brain.snapshot().discardedPonderMillis).toBe(cancel ? 0 : 250);
  }
});

test('resposta forçada também é descartada se a sessão for cancelada', async () => {
  const f = fixture(),
    game = new Chess('7k/8/6K1/8/8/8/8/R7 b - - 0 1');
  const reply = f.brain.respond(game, clocks);
  f.brain.cancel();
  await expect(reply).rejects.toThrow('cancelada');
  expect(f.brain.snapshot().forcedReplies).toBe(0);
});

test('busca normal não entrega lance atrasado depois de cancelar ou mudar tabuleiro', async () => {
  for (const mutation of ['cancel', 'move']) {
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<SearchResult>();
    const engine = {
      stop() {},
      searchWithClocks() {
        started.resolve();
        return pending.promise;
      },
    } as unknown as Engine;
    const brain = new TournamentBrain(engine, { ponder: false, forcedMoves: true });
    const game = new Chess();
    const reply = brain.respond(game, clocks);
    await started.promise;
    if (mutation === 'cancel') brain.cancel();
    else game.move('d4');
    pending.resolve({ bestmove: 'e2e4', depth: 1, score: null });
    await expect(reply).rejects.toThrow('cancelada');
  }
});
