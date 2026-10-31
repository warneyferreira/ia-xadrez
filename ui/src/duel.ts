import { Chess } from 'chess.js';
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { Engine, type Score } from './engine.ts';
import { MEMORY_PROFILES, memoryBudget, requireMemory, type MemoryProfile } from './resources.ts';
import { Candidates } from './candidates.ts';
import { writeFileSync } from 'node:fs';
import { performanceReport } from './report.ts';
import { cpus, platform, release, totalmem } from 'node:os';

type Config = {
  whiteName: string;
  blackName: string;
  arthurWhite: boolean;
  movetime: number;
  useBook: boolean;
  memoryProfile: MemoryProfile;
  arthurCandidate: string;
  opponentCandidate: string;
  timeMode: 'fixed' | '25+0';
};
type Row = {
  san: string;
  uci: string;
  whiteCp: number | null;
  depth: number;
  source: string;
  tbhits: number;
  fen: string;
  elapsedMillis: number;
  nodes?: number;
  nps?: number;
  hashfull?: number;
  engineMillis?: number;
  capture: boolean;
  check: boolean;
  castle: boolean;
  promotion: boolean;
};
type Book = Record<string, { move: string; depth: number }>;

export function ending(game: Chess): string | null {
  if (game.isCheckmate()) return game.turn() === 'w' ? '0-1 · Xeque-mate' : '1-0 · Xeque-mate';
  if (game.isStalemate()) return '½-½ · Afogamento';
  if (game.isThreefoldRepetition()) return '½-½ · Repetição tripla';
  if (game.isInsufficientMaterial()) return '½-½ · Material insuficiente';
  if (game.isDrawByFiftyMoves()) return '½-½ · Regra dos 50 lances';
  return null;
}

/** Um único duelo no servidor. Somente esse controlador decide/aplica os lances. */
export class Duel {
  private game = new Chess();
  private engines: Engine[] = [];
  private phase: 'idle' | 'starting' | 'running' | 'paused' | 'finished' | 'error' = 'idle';
  private busy = false;
  private rows: Row[] = [];
  private error: string | null = null;
  private config: Config = {
    whiteName: 'Arthur v1',
    blackName: 'Vanderlei · base',
    arthurWhite: true,
    movetime: 1000,
    useBook: true,
    memoryProfile: 'balanced',
    arthurCandidate: 'arthur-latest',
    opponentCandidate: 'vanderlei-latest',
    timeMode: 'fixed',
  };
  private log = '';
  private id = '';
  private startedAt = 0;
  private endedAt = 0;
  private pauseAt = 0;
  private pausedMillis = 0;
  private turnStarted = 0;
  private forfeit: string | null = null;
  private spent = { white: 0, black: 0 };
  private identities: unknown[] = [];
  private hardware = {
    cpu: cpus()[0]?.model ?? 'desconhecida',
    logicalProcessors: cpus().length,
    platform: platform(),
    osRelease: release(),
    totalRAMBytes: totalmem(),
  };
  readonly registry: Candidates;

  constructor(
    private path: string,
    private book: Book,
    private syzygy?: string,
    private onFinished?: () => void,
  ) {
    this.registry = new Candidates(path);
    if (existsSync('logs/latest-finished.json')) {
      try {
        const saved = JSON.parse(readFileSync('logs/latest-finished.json', 'utf8'));
        const game = new Chess();
        game.loadPgn(saved.pgn);
        if (
          saved.phase !== 'finished' ||
          !Array.isArray(saved.rows) ||
          game.history().length !== saved.rows.length
        )
          throw new Error('Histórico salvo inconsistente.');
        this.registry.get(saved.arthurCandidate);
        this.registry.get(saved.opponentCandidate);
        this.game = game;
        this.rows = saved.rows;
        this.phase = 'finished';
        this.id = saved.id;
        this.config = {
          whiteName: saved.whiteName,
          blackName: saved.blackName,
          arthurWhite: saved.arthurWhite,
          movetime: saved.movetime,
          useBook: saved.useBook,
          memoryProfile: saved.memoryProfile,
          arthurCandidate: saved.arthurCandidate,
          opponentCandidate: saved.opponentCandidate,
          timeMode: saved.timeMode,
        };
        this.startedAt = saved.startedAt;
        this.endedAt = saved.endedAt;
        this.forfeit = saved.outcome;
        this.pausedMillis = Math.max(0, this.endedAt - this.startedAt - saved.elapsedMillis);
        this.spent = { white: saved.whiteSearchMillis, black: saved.blackSearchMillis };
        this.identities = saved.identities;
      } catch (err) {
        console.error('Última partida não foi restaurada:', (err as Error).message);
      }
    }
  }

  get active() {
    return this.phase === 'running' || this.phase === 'starting' || this.busy;
  }
  snapshot() {
    const outcome = this.forfeit ?? ending(this.game);
    const points = !outcome
      ? null
      : outcome.startsWith('1-0')
        ? { white: 3, black: 0 }
        : outcome.startsWith('0-1')
          ? { white: 0, black: 3 }
          : { white: 1, black: 1 };
    const primary = this.registry.get(this.config.arthurCandidate),
      opponent = this.registry.get(this.config.opponentCandidate);
    const arthur = `${primary.label}: Hash ${MEMORY_PROFILES[this.config.memoryProfile].hashMB} MB · ${primary.threads} threads${this.syzygy && primary.syzygy ? ' · Syzygy 3–5' : ''}${this.config.useBook && primary.book ? ' · repertório local' : ''}`;
    const other = `${opponent.label}: Hash ${opponent.hashMB} MB · ${opponent.threads} threads`;
    const whiteMillis = this.spent.white,
      blackMillis = this.spent.black;
    const inProgressMillis =
      this.phase === 'running' && this.turnStarted ? performance.now() - this.turnStarted : 0;
    return {
      id: this.id,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      identities: this.identities,
      hardware: this.hardware,
      phase: this.phase,
      busy: this.busy,
      fen: this.game.fen(),
      turn: this.game.turn(),
      rows: this.rows,
      elapsedMillis: this.startedAt
        ? Math.max(
            0,
            (this.endedAt || Date.now()) -
              this.startedAt -
              this.pausedMillis -
              (this.pauseAt ? Date.now() - this.pauseAt : 0),
          )
        : 0,
      wallMillis: this.startedAt ? (this.endedAt || Date.now()) - this.startedAt : 0,
      whiteSearchMillis: whiteMillis,
      blackSearchMillis: blackMillis,
      whiteRemaining: Math.max(0, 1500000 - whiteMillis - (this.game.turn() === 'w' ? inProgressMillis : 0)),
      blackRemaining: Math.max(0, 1500000 - blackMillis - (this.game.turn() === 'b' ? inProgressMillis : 0)),
      ...this.config,
      outcome,
      points,
      error: this.error,
      pgn: this.game.pgn(),
      memory: memoryBudget(MEMORY_PROFILES[this.config.memoryProfile].hashMB, undefined, opponent.hashMB),
      whiteProfile: this.config.arthurWhite ? arthur : other,
      blackProfile: this.config.arthurWhite ? other : arthur,
      note: `Duelo atual: ${this.config.timeMode === '25+0' ? '25 minutos por lado, sem incremento' : `${this.config.movetime / 1000} s por lance (exibição)`} · Ponder desligado. Configurações do formulário valem para o próximo duelo.`,
    };
  }

  async start(raw: Record<string, unknown>) {
    if (this.active) throw new Error('Pause o duelo e aguarde o cálculo terminar antes de iniciar outro.');
    const name = (value: unknown, fallback: string) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, 48) : fallback;
    const movetime = raw.movetime;
    if (typeof movetime !== 'number' || !Number.isInteger(movetime) || movetime < 250 || movetime > 5000)
      throw new Error('Escolha de 250 a 5000 ms por lance.');
    const memoryProfile = raw.memoryProfile ?? 'balanced';
    if (typeof memoryProfile !== 'string' || !Object.hasOwn(MEMORY_PROFILES, memoryProfile))
      throw new Error('Perfil de memória inválido.');
    const selectedMemory = memoryProfile as MemoryProfile;
    const primary = this.registry.get(
      typeof raw.arthurCandidate === 'string' ? raw.arthurCandidate : 'arthur-latest',
    );
    const opponent = this.registry.get(
      typeof raw.opponentCandidate === 'string' ? raw.opponentCandidate : 'vanderlei-latest',
    );
    const primaryPath = this.registry.path(primary),
      opponentPath = this.registry.path(opponent);
    const reclaimable =
      this.engines.length === 2
        ? (MEMORY_PROFILES[this.config.memoryProfile].hashMB +
            this.registry.get(this.config.opponentCandidate).hashMB) *
          1024 *
          1024
        : 0;
    requireMemory(
      MEMORY_PROFILES[selectedMemory].hashMB,
      memoryBudget(0).availableBytes + reclaimable,
      opponent.hashMB,
    );
    const previousEngines = this.engines;
    this.engines = [];
    this.phase = 'starting';
    this.busy = true;
    try {
      await Promise.all(previousEngines.map((engine) => engine.shutdown()));
    } catch (err) {
      this.busy = false;
      this.phase = 'error';
      this.error = (err as Error).message;
      throw err;
    }
    this.phase = 'starting';
    this.busy = true;
    this.rows = [];
    this.game = new Chess();
    this.error = null;
    this.config = {
      whiteName: name(raw.whiteName, 'Arthur v1'),
      blackName: name(raw.blackName, 'Vanderlei · base'),
      arthurWhite: raw.arthurWhite !== false,
      movetime,
      useBook: raw.useBook === true,
      memoryProfile: selectedMemory,
      arthurCandidate: primary.id,
      opponentCandidate: opponent.id,
      timeMode: raw.timeMode === '25+0' ? '25+0' : 'fixed',
    };
    this.id = String(Date.now());
    this.startedAt = 0;
    this.endedAt = 0;
    this.pauseAt = 0;
    this.pausedMillis = 0;
    this.forfeit = null;
    this.spent = { white: 0, black: 0 };
    this.identities = [primary, opponent].map((c, i) => ({
      ...this.registry.identity(c),
      color: (i === 0) === this.config.arthurWhite ? 'white' : 'black',
      effectiveOptions: {
        Threads: c.threads,
        Hash: i === 0 ? MEMORY_PROFILES[selectedMemory].hashMB : c.hashMB,
        Ponder: false,
        SyzygyPath: c.syzygy && this.syzygy ? this.syzygy : null,
        book: i === 0 && c.book && this.config.useBook,
      },
    }));
    this.game.header(
      'White',
      this.config.whiteName,
      'Black',
      this.config.blackName,
      'Event',
      'Duelo local Chess Challenge',
    );
    mkdirSync('logs', { recursive: true });
    this.log = `logs/duel-${this.id}.jsonl`;
    try {
      for (let side = 0; side < 2; side++) {
        const arthur = (side === 0) === this.config.arthurWhite;
        const candidate = arthur ? primary : opponent;
        const engine = new Engine(arthur ? primaryPath : opponentPath);
        this.engines.push(engine);
        await engine.init({
          Threads: candidate.threads,
          Hash: arthur ? MEMORY_PROFILES[selectedMemory].hashMB : candidate.hashMB,
          'Move Overhead': 20,
          ...(candidate.syzygy && this.syzygy ? { SyzygyPath: this.syzygy, Syzygy50MoveRule: 'true' } : {}),
        });
      }
      appendFileSync(
        this.log,
        JSON.stringify({ event: 'start', ...this.config, syzygy: this.syzygy ?? null }) + '\n',
      );
      this.phase = 'running';
      this.startedAt = Date.now();
    } catch (err) {
      this.phase = 'error';
      this.error = (err as Error).message;
      this.endedAt = Date.now();
      this.close();
    } finally {
      this.busy = false;
    }
    if (this.phase === 'running') void this.loop();
    return this.snapshot();
  }

  pause() {
    if (this.phase === 'running') {
      this.phase = 'paused';
      this.pauseAt = Date.now();
      for (const engine of this.engines) engine.stop();
    }
    return this.snapshot();
  }
  resume() {
    if (this.phase !== 'paused' || this.busy) throw new Error('Aguarde o cálculo encerrar para continuar.');
    this.pausedMillis += this.pauseAt ? Date.now() - this.pauseAt : 0;
    this.pauseAt = 0;
    this.phase = 'running';
    void this.loop();
    return this.snapshot();
  }
  close() {
    for (const engine of this.engines) engine.quit();
    this.engines = [];
  }

  private finish(result: string) {
    this.endedAt = Date.now();
    this.turnStarted = 0;
    this.phase = 'finished';
    this.game.header(
      'Result',
      result.startsWith('1-0') ? '1-0' : result.startsWith('0-1') ? '0-1' : '1/2-1/2',
    );
    writeFileSync(this.log.replace('.jsonl', '.pgn'), this.game.pgn());
    appendFileSync(
      this.log,
      JSON.stringify({ event: 'finished', outcome: result, elapsedMillis: this.snapshot().elapsedMillis }) +
        '\n',
    );
    const initialReport = JSON.stringify(
      performanceReport({ ...this.snapshot(), analysisStatus: 'pending' }, []),
      null,
      2,
    );
    writeFileSync(this.log.replace('.jsonl', '.report.json'), initialReport);
    writeFileSync('logs/latest-finished.json', initialReport);
    this.close();
    if (this.onFinished) setTimeout(this.onFinished, 0);
  }

  private async loop() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.phase === 'running') {
        const result = ending(this.game);
        if (result) {
          this.finish(result);
          break;
        }
        const white = this.game.turn() === 'w';
        const arthur = white === this.config.arthurWhite;
        const moves = this.game.history({ verbose: true }).map((m) => m.lan);
        const candidate = this.registry.get(
          arthur ? this.config.arthurCandidate : this.config.opponentCandidate,
        );
        const entry =
          candidate.book && arthur && this.config.useBook
            ? this.book[this.game.fen().split(' ').slice(0, 4).join(' ')]
            : undefined;
        const whiteUsed = this.spent.white,
          blackUsed = this.spent.black;
        this.turnStarted = performance.now();
        const reply = entry
          ? { bestmove: entry.move, depth: entry.depth, score: null as Score | null, tbhits: 0 }
          : this.config.timeMode === '25+0'
            ? await this.engines[white ? 0 : 1]!.searchWithClocks(moves, {
                whiteMillis: 1500000 - whiteUsed,
                blackMillis: 1500000 - blackUsed,
              })
            : await this.engines[white ? 0 : 1]!.search(moves, this.config.movetime);
        const elapsedMillis = performance.now() - this.turnStarted;
        this.turnStarted = 0;
        this.spent[white ? 'white' : 'black'] += elapsedMillis;
        if (this.phase !== 'running') break;
        if (this.config.timeMode === '25+0' && elapsedMillis + (white ? whiteUsed : blackUsed) >= 1500000) {
          this.forfeit = white ? '0-1 · Tempo esgotado das brancas' : '1-0 · Tempo esgotado das pretas';
          this.finish(this.forfeit);
          break;
        }
        const move = this.game.move(reply.bestmove);
        const value = reply.score
          ? (reply.score.unit === 'cp' ? reply.score.value : Math.sign(reply.score.value || 1) * 10000) *
            (white ? 1 : -1)
          : null;
        const row: Row = {
          san: move.san,
          uci: move.lan,
          whiteCp: value,
          depth: reply.depth,
          source: entry ? 'Repertório' : 'Busca',
          tbhits: reply.tbhits ?? 0,
          fen: this.game.fen(),
          elapsedMillis,
          ...('nodes' in reply
            ? {
                nodes: reply.nodes,
                nps: reply.nps,
                hashfull: reply.hashfull,
                engineMillis: reply.engineMillis,
              }
            : {}),
          capture: Boolean(move.captured),
          check: this.game.inCheck(),
          castle: move.isKingsideCastle() || move.isQueensideCastle(),
          promotion: Boolean(move.promotion),
        };
        this.rows.push(row);
        appendFileSync(
          this.log,
          JSON.stringify({ at: new Date().toISOString(), ply: this.rows.length, ...row }) + '\n',
        );
        await Bun.sleep(180);
      }
    } catch (err) {
      this.phase = 'error';
      this.error = (err as Error).message;
      this.close();
    } finally {
      this.busy = false;
    }
  }
}
