import { Chess } from 'chess.js';
import { Engine, type ClockSearch, type PonderSearch, type SearchInfo, type SearchResult } from './engine.ts';

export type BrainOptions = { ponder: boolean; forcedMoves: boolean; immediateMates?: boolean };
type Forecast = { moves: string; expected: string; handle: PonderSearch };

/** Controlador de torneio: toda previsão é conferida contra o histórico real. */
export class TournamentBrain {
  private forecast: Forecast | null = null;
  private generation = 0;
  private stats = {
    attempts: 0,
    hits: 0,
    misses: 0,
    forcedReplies: 0,
    immediateMates: 0,
    ponderMillis: 0,
    discardedPonderMillis: 0,
  };
  private live: SearchInfo | null = null;
  private lastError: string | null = null;
  private hitReporter: { handle: PonderSearch; callback?: (info: SearchInfo) => void } | null = null;

  constructor(
    readonly engine: Engine,
    readonly options: BrainOptions,
  ) {}

  snapshot() {
    return {
      ...this.stats,
      enabled: this.options.ponder,
      expected: this.forecast?.expected ?? null,
      thinking: this.forecast !== null,
      depth: this.live?.depth ?? null,
      error: this.lastError,
    };
  }

  cancel() {
    this.generation++;
    this.forecast?.handle.cancel();
    this.forecast = null;
    this.live = null;
    this.hitReporter = null;
    this.engine.stop();
  }

  async stop() {
    const pending = this.forecast?.handle.result;
    this.cancel();
    const generation = this.generation;
    if (pending) {
      const reply = await pending.catch(() => undefined);
      if (generation === this.generation) {
        this.stats.ponderMillis += reply?.ponderMillis ?? 0;
        this.stats.discardedPonderMillis += reply?.ponderMillis ?? 0;
      }
    }
  }

  async reset() {
    await this.stop();
    this.stats = {
      attempts: 0,
      hits: 0,
      misses: 0,
      forcedReplies: 0,
      immediateMates: 0,
      ponderMillis: 0,
      discardedPonderMillis: 0,
    };
    this.lastError = null;
  }

  async anticipate(game: Chess, predicted: string | undefined, clocks: ClockSearch) {
    const old = this.forecast?.handle.result;
    this.cancel();
    const generation = this.generation;
    if (old) {
      const reply = await old.catch(() => undefined);
      if (generation === this.generation) {
        this.stats.ponderMillis += reply?.ponderMillis ?? 0;
        this.stats.discardedPonderMillis += reply?.ponderMillis ?? 0;
      }
    }
    if (generation !== this.generation) return;
    if (!this.options.ponder || !predicted || game.isGameOver()) return;
    const validation = new Chess(game.fen());
    try {
      validation.move(predicted);
    } catch {
      return;
    }
    if (validation.isGameOver()) return;
    const actual = game.history({ verbose: true }).map((m) => m.lan);
    const moves = [...actual, predicted];
    const handle = this.engine.startPonder(moves, clocks, (info) => {
      if (this.forecast?.handle === handle) this.live = info;
      else if (this.hitReporter?.handle === handle) this.hitReporter.callback?.(info);
    });
    const forecast: Forecast = { moves: moves.join(' '), expected: predicted, handle };
    this.lastError = null;
    this.forecast = forecast;
    this.stats.attempts++;
    void handle.result.catch((err) => {
      if (generation === this.generation) this.lastError = (err as Error).message;
    });
    try {
      await handle.ready;
    } catch (err) {
      if (generation === this.generation) {
        this.forecast = null;
        this.lastError = (err as Error).message;
      }
    }
  }

  async respond(
    game: Chess,
    clocks: ClockSearch,
    onInfo?: (info: SearchInfo) => void,
  ): Promise<SearchResult> {
    if (game.isGameOver()) throw new Error('A partida já terminou.');
    const generation = ++this.generation;
    const positionFen = game.fen();
    const moves = game.history({ verbose: true }).map((m) => m.lan);
    const legal = game.moves({ verbose: true });
    // SAN is computed from legal moves on this exact board, not an engine
    // forecast. '#' proves checkmate after this move, including promotions.
    const mate = this.options.immediateMates !== false ? legal.find((m) => m.san.endsWith('#')) : undefined;
    if (mate || (this.options.forcedMoves && legal.length === 1)) {
      const stopping = this.stop();
      const afterStop = this.generation;
      const expectedFen = game.fen();
      await stopping;
      if (afterStop !== this.generation || game.fen() !== expectedFen)
        throw new Error('Busca cancelada: a posição mudou.');
      if (mate) {
        this.stats.immediateMates++;
        return {
          bestmove: mate.lan,
          depth: 0,
          score: { unit: 'mate', value: 1 },
          nodes: 0,
          pv: [mate.lan],
          source: 'proven-mate',
        };
      }
      this.stats.forcedReplies++;
      return { bestmove: legal[0]!.lan, depth: 0, score: null, nodes: 0, source: 'forced' };
    }
    const own = game.turn() === 'w' ? clocks.whiteMillis : clocks.blackMillis;
    // O tempo nativo continua decidindo; o teto externo limita excessos na urgência.
    const limits = {
      ...clocks,
      ...(own < 15000
        ? { maxSearchMillis: Math.min(400, Math.max(1, (own - (clocks.reserveMillis ?? 100)) / 12)) }
        : {}),
    };
    const forecast = this.forecast;
    if (forecast) {
      await forecast.handle.ready.catch(() => undefined);
      if (generation !== this.generation) throw new Error('Busca cancelada.');
    }
    if (forecast && forecast.moves === moves.join(' ') && forecast.handle.hit(limits)) {
      this.hitReporter = { handle: forecast.handle, callback: onInfo };
      this.forecast = null;
      this.live = null;
      this.stats.hits++;
      const reply = await forecast.handle.result;
      if (generation !== this.generation || game.fen() !== positionFen)
        throw new Error('Busca cancelada: a posição mudou.');
      this.stats.ponderMillis += reply.ponderMillis ?? 0;
      if (reply.source === 'book') this.stats.discardedPonderMillis += reply.ponderMillis ?? 0;
      return { ...reply, source: reply.source === 'book' ? 'book' : 'ponder-hit' };
    }
    if (forecast) this.stats.misses++;
    const stopping = this.stop();
    const afterStop = this.generation;
    await stopping;
    if (afterStop !== this.generation) throw new Error('Busca cancelada.');
    const reply = await this.engine.searchWithClocks(moves, limits, onInfo);
    if (afterStop !== this.generation || game.fen() !== positionFen)
      throw new Error('Busca cancelada: a posição mudou.');
    return { ...reply, source: reply.source === 'book' ? 'book' : 'search' };
  }
}
