import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Chess } from 'chess.js';
import index from '../web/index.html';
import tournament from '../web/tournament.html';
import duelPage from '../web/duel.html';
import { Duel } from './duel.ts';
import { Engine, type SearchResult } from './engine.ts';
import { review, type ReviewRow } from './review.ts';
import { performanceReport } from './report.ts';

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MOVETIME_MIN = 100;
const MOVETIME_MAX = 60_000;
const MAX_PLIES = 1000;
const TOURNAMENT_INITIAL_MIN = 60_000;
const TOURNAMENT_INITIAL_MAX = 2_000_000;
type Color = 'white' | 'black';
type Phase =
  | 'idle'
  | 'ready'
  | 'engine-thinking'
  | 'awaiting-engine-confirmation'
  | 'awaiting-opponent'
  | 'finished'
  | 'error';

/** Mostra o erro e espera Enter, para a janela do console não fechar antes de ser lida. */
async function fatal(message: string): Promise<never> {
  console.error(`\nERRO: ${message}\n`);
  if (process.stdin.isTTY) {
    console.error('Pressione Enter para sair.');
    for await (const _ of console) break;
  }
  process.exit(1);
}

function isWsl(): boolean {
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  let cmd: string[];
  let cwd: string | undefined;
  if (process.platform === 'win32') cmd = ['cmd', '/c', 'start', '', url];
  else if (process.platform === 'darwin') cmd = ['open', url];
  else if (isWsl()) {
    cmd = ['cmd.exe', '/c', 'start', '', url];
    cwd = '/mnt/c';
  } else cmd = ['xdg-open', url];
  try {
    Bun.spawn(cmd, { cwd, stdout: 'ignore', stderr: 'ignore' });
  } catch {
    // Sem navegador disponível: o endereço já foi impresso no console.
  }
}

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    engine: { type: 'string' },
    port: { type: 'string', default: '0' },
    'no-open': { type: 'boolean', default: false },
    'tournament-log': { type: 'string' },
    'candidate-name': { type: 'string', default: 'Arthur v1 · preparação especulativa' },
    syzygy: { type: 'string' },
    book: { type: 'string' },
  },
});

const enginePath = resolve(
  args.engine ??
    join(dirname(process.execPath), process.platform === 'win32' ? 'stockfish.exe' : 'stockfish'),
);
if (!existsSync(enginePath)) {
  await fatal(
    `motor não encontrado em ${enginePath}\nColoque o executável do Stockfish ao lado deste programa ou use --engine <caminho>.`,
  );
}

const threads = availableParallelism();
const preparedBook: Record<string, { move: string; depth: number }> = args.book
  ? JSON.parse(readFileSync(resolve(args.book), 'utf8'))
  : {};
const duel = new Duel(enginePath, preparedBook, args.syzygy ? resolve(args.syzygy) : undefined, () => {
  void startDuelReview().catch((err) => console.error('Revisão automática:', (err as Error).message));
});
const engine = new Engine(enginePath);
let reviewer: Engine | null = null;
async function getReviewer() {
  if (reviewer) return reviewer;
  const analyzer = new Engine(enginePath);
  reviewer = analyzer;
  try {
    await analyzer.init({
      Threads: 1,
      Hash: 128,
      ...(args.syzygy ? { SyzygyPath: resolve(args.syzygy), Syzygy50MoveRule: 'true' } : {}),
    });
    return analyzer;
  } catch (err) {
    analyzer.quit();
    reviewer = null;
    throw err;
  }
}
async function releaseReviewer() {
  const analyzer = reviewer;
  reviewer = null;
  if (analyzer) {
    try {
      await analyzer.shutdown();
    } catch (err) {
      console.error('Encerramento da análise:', (err as Error).message);
    }
  }
}
let reviewing = false;
let reviewJob: {
  key: string;
  status: 'idle' | 'running' | 'done' | 'error';
  completed: number;
  total: number;
  rows: ReviewRow[];
  error: string | null;
} = { key: '', status: 'idle', completed: 0, total: 0, rows: [], error: null };
if (existsSync('logs/latest-finished.json')) {
  try {
    const saved = JSON.parse(readFileSync('logs/latest-finished.json', 'utf8'));
    if (
      saved.id === duel.snapshot().id &&
      saved.analysisStatus === 'done' &&
      saved.analysis?.length === saved.rows.length
    )
      reviewJob = {
        key: `${saved.id}:${saved.rows.length}`,
        status: 'done',
        completed: saved.rows.length,
        total: saved.rows.length,
        rows: saved.analysis,
        error: null,
      };
  } catch {
    /* A partida original fica preservada; a análise pode ser refeita. */
  }
}

function duelReport() {
  const state = duel.snapshot();
  const key = `${state.id}:${state.rows.length}`;
  return performanceReport(
    {
      ...state,
      analysisStatus: reviewJob.key === key ? reviewJob.status : 'not-requested',
      analysisEngine: reviewer?.name ?? engine.name,
      analysisMillisPerPosition: 300,
    },
    reviewJob.key === key ? reviewJob.rows : [],
  );
}

async function startDuelReview() {
  const state = duel.snapshot();
  const key = `${state.id}:${state.rows.length}`;
  if (
    duel.active ||
    !['paused', 'finished'].includes(state.phase) ||
    !['idle', 'finished'].includes(tournamentState.phase)
  )
    throw new Error('A análise roda após o duelo ou enquanto ele estiver pausado.');
  if (reviewJob.key === key && ['running', 'done'].includes(reviewJob.status)) return reviewJob;
  if (reviewing) throw new Error('Já existe uma análise em andamento.');
  reviewing = true;
  engine.stop();
  reviewJob = { key, status: 'running', completed: 0, total: state.rows.length, rows: [], error: null };
  void (async () => {
    try {
      const analyzer = await getReviewer();
      await analyzer.newGame();
      const rows = await review(
        analyzer,
        state.rows.map((r) => r.uci),
        (done) => {
          reviewJob.completed = done;
        },
      );
      reviewJob.rows = rows.map((r, i) =>
        state.rows[i]?.source === 'Repertório'
          ? {
              ...r,
              label: 'Livro',
              explanation: `Escolhida do repertório local preparado antes da partida. ${r.explanation}`,
            }
          : r,
      );
      reviewJob.status = 'done';
      mkdirSync('logs', { recursive: true });
      const report = JSON.stringify(duelReport(), null, 2);
      writeFileSync(`logs/duel-${state.id}.report.json`, report);
      if (state.phase === 'finished') writeFileSync('logs/latest-finished.json', report);
    } catch (err) {
      reviewJob.status = 'error';
      reviewJob.error = (err as Error).message;
    } finally {
      await releaseReviewer();
      reviewing = false;
    }
  })();
  return reviewJob;
}
try {
  // A UI de treino usa buscas curtas; o modo torneio recebe relógios por UCI.
  await engine.init({ Threads: Math.min(threads, 4), Hash: 256, 'Move Overhead': 500 });
  if (args.syzygy) {
    const tableOptions = { SyzygyPath: resolve(args.syzygy), Syzygy50MoveRule: 'true' };
    await engine.init(tableOptions);
  }
} catch (err) {
  engine.quit();
  await releaseReviewer();
  await fatal(`falha ao iniciar o motor ${enginePath}: ${(err as Error).message}`);
}

const timestamp = new Date().toISOString().replaceAll(':', '-');
const tournamentLogPath = resolve(
  args['tournament-log'] ?? join(process.cwd(), 'logs', `tournament-${timestamp}.jsonl`),
);

function appendTournamentLog(event: string, data: Record<string, unknown> = {}): void {
  try {
    mkdirSync(dirname(tournamentLogPath), { recursive: true });
    appendFileSync(
      tournamentLogPath,
      `${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`,
      'utf8',
    );
  } catch (err) {
    console.error(`Não foi possível gravar log de torneio: ${(err as Error).message}`);
  }
}

const colorForTurn = (turn: 'w' | 'b'): Color => (turn === 'w' ? 'white' : 'black');
const opposite = (color: Color): Color => (color === 'white' ? 'black' : 'white');

type TournamentState = {
  session: number;
  game: Chess;
  engineColor: Color | null;
  phase: Phase;
  whiteMillis: number;
  blackMillis: number;
  running: Color | null;
  runningSince: number | null;
  pending: SearchResult | null;
  error: string | null;
  initialMillis: number;
  startedAt: number | null;
  elapsedAtEnd: number | null;
};

let tournamentState: TournamentState = {
  session: 0,
  game: new Chess(),
  engineColor: null,
  phase: 'idle',
  whiteMillis: 0,
  blackMillis: 0,
  running: null,
  runningSince: null,
  pending: null,
  error: null,
  initialMillis: 1500000,
  startedAt: null,
  elapsedAtEnd: null,
};
let tournamentQueue: Promise<unknown> = Promise.resolve();

function serializeTournament<T>(task: () => Promise<T> | T): Promise<T> {
  const result = tournamentQueue.then(task, task);
  tournamentQueue = result.catch(() => undefined);
  return result;
}

function projectedClock(color: Color): number {
  const stored = color === 'white' ? tournamentState.whiteMillis : tournamentState.blackMillis;
  if (tournamentState.running !== color || tournamentState.runningSince === null) return stored;
  return Math.max(0, Math.floor(stored - (performance.now() - tournamentState.runningSince)));
}

function startClock(color: Color): void {
  if (tournamentState.running !== null) throw new Error('Já existe um relógio em execução.');
  tournamentState.running = color;
  tournamentState.runningSince = performance.now();
}

function stopClock(): void {
  const color = tournamentState.running;
  if (color === null) return;
  const left = projectedClock(color);
  if (color === 'white') tournamentState.whiteMillis = left;
  else tournamentState.blackMillis = left;
  tournamentState.running = null;
  tournamentState.runningSince = null;
}

function movesUci(): string[] {
  return tournamentState.game.history({ verbose: true }).map((move) => move.lan);
}

function applyUci(game: Chess, uci: string): void {
  game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

function tournamentSnapshot(): Record<string, unknown> {
  return {
    session: tournamentState.session,
    phase: tournamentState.phase,
    engineColor: tournamentState.engineColor,
    turn: colorForTurn(tournamentState.game.turn()),
    fen: tournamentState.game.fen(),
    moves: movesUci(),
    whiteMillis: projectedClock('white'),
    blackMillis: projectedClock('black'),
    running: tournamentState.running,
    pending: tournamentState.pending,
    gameOver: tournamentState.game.isGameOver(),
    outcome: tournamentState.game.isCheckmate()
      ? tournamentState.game.turn() === 'w'
        ? 'Pretas venceram por xeque-mate'
        : 'Brancas venceram por xeque-mate'
      : tournamentState.game.isStalemate()
        ? 'Empate por afogamento'
        : tournamentState.game.isThreefoldRepetition()
          ? 'Empate por repetição'
          : tournamentState.game.isDrawByFiftyMoves()
            ? 'Empate pela regra dos 50 lances'
            : tournamentState.game.isInsufficientMaterial()
              ? 'Empate por material insuficiente'
              : null,
    error: tournamentState.error,
    logPath: tournamentLogPath,
    initialMillis: tournamentState.initialMillis,
    elapsedMillis:
      tournamentState.elapsedAtEnd ??
      (tournamentState.startedAt === null ? 0 : Date.now() - tournamentState.startedAt),
    san: tournamentState.game.history(),
    pgn: tournamentState.game.pgn(),
  };
}

function finishIfGameOver(): boolean {
  if (!tournamentState.game.isGameOver()) return false;
  stopClock();
  tournamentState.phase = 'finished';
  tournamentState.elapsedAtEnd =
    tournamentState.startedAt === null ? 0 : Date.now() - tournamentState.startedAt;
  appendTournamentLog('game-finished', { ...tournamentSnapshot() });
  return true;
}

async function calculateEngineMove(session: number): Promise<void> {
  const current = tournamentState;
  if (current.session !== session || current.phase !== 'engine-thinking' || current.engineColor === null)
    return;
  const clocks = { whiteMillis: projectedClock('white'), blackMillis: projectedClock('black') };
  const moves = movesUci();
  try {
    const result = await engine.searchWithClocks(moves, clocks);
    await serializeTournament(() => {
      if (tournamentState.session !== session || tournamentState.phase !== 'engine-thinking') return;
      if (!UCI_MOVE.test(result.bestmove))
        throw new Error(`Motor retornou bestmove inválido: ${result.bestmove}`);
      tournamentState.pending = result;
      tournamentState.phase = 'awaiting-engine-confirmation';
      appendTournamentLog('engine-move-ready', { ...tournamentSnapshot(), bestmove: result.bestmove });
    });
  } catch (err) {
    await serializeTournament(() => {
      if (tournamentState.session !== session) return;
      stopClock();
      tournamentState.phase = 'error';
      tournamentState.error = `Falha da engine: ${(err as Error).message}`;
      appendTournamentLog('engine-failure', { ...tournamentSnapshot() });
    });
  }
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message, state: tournamentSnapshot() }, { status });
}

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  const value = await req.json().catch(() => null);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(args.port),
  development: false,
  idleTimeout: 255,
  routes: {
    '/': index,
    '/tournament': tournament,
    '/duel': duelPage,
    '/api/duel/status': { GET: () => Response.json(duel.snapshot()) },
    '/api/candidates': { GET: () => Response.json(duel.registry.list()) },
    '/api/duel/report': {
      GET: () =>
        Response.json(duelReport(), {
          headers: {
            'Content-Disposition': `attachment; filename="duel-${duel.snapshot().id || 'idle'}.report.json"`,
          },
        }),
    },
    '/api/duel/review/status': { GET: () => Response.json(reviewJob) },
    '/api/duel/review/start': {
      POST: async () => {
        try {
          return Response.json(await startDuelReview());
        } catch (err) {
          return jsonError((err as Error).message, 409);
        }
      },
    },
    '/api/duel/start': {
      POST: async (req) => {
        if (!['idle', 'finished'].includes(tournamentState.phase) || reviewing)
          return jsonError('Encerre torneio/análise antes de iniciar o duelo.', 409);
        engine.stop();
        try {
          return Response.json(await duel.start((await parseBody(req)) ?? {}));
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 409 });
        }
      },
    },
    '/api/duel/pause': { POST: () => Response.json(duel.pause()) },
    '/api/duel/resume': {
      POST: () => {
        if (!['idle', 'finished'].includes(tournamentState.phase) || reviewing)
          return jsonError('Encerre torneio/análise antes de continuar o duelo.', 409);
        try {
          return Response.json(duel.resume());
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 409 });
        }
      },
    },
    '/api/info': {
      GET: () =>
        Response.json({
          engine: engine.name,
          candidate: args['candidate-name'],
          threads: Math.min(threads, 4),
          hash: 256,
          syzygy: Boolean(args.syzygy),
        }),
    },
    '/api/prepare': {
      POST: async (req) => {
        if (duel.active) return jsonError('Preparação desativada enquanto o duelo estiver calculando.', 409);
        if (!['idle', 'finished'].includes(tournamentState.phase))
          return jsonError('Preparação de treino indisponível durante torneio.', 409);
        const body = await parseBody(req);
        if (body?.enabled === false) {
          engine.stop();
          return Response.json({ ok: true });
        }
        const moves = body?.moves;
        if (
          !Array.isArray(moves) ||
          moves.length > MAX_PLIES ||
          !moves.every((m) => typeof m === 'string' && UCI_MOVE.test(m))
        )
          return jsonError('Histórico inválido.');
        try {
          const board = new Chess();
          for (const m of moves) board.move(m);
          if (board.isGameOver()) return jsonError('Partida encerrada.');
        } catch {
          return jsonError('Sequência ilegal.');
        }
        void engine.search(moves as string[], 60000).catch((err) => console.error('Preparação:', err));
        return Response.json({ ok: true });
      },
    },
    '/api/review': {
      POST: async (req) => {
        if (duel.active) return jsonError('Pause o duelo para analisar.', 409);
        if (reviewing) return Response.json({ error: 'Análise já em andamento. Aguarde.' }, { status: 409 });
        if (!['idle', 'ready', 'finished'].includes(tournamentState.phase))
          return Response.json({ error: 'Análise desativada durante partida de torneio.' }, { status: 409 });
        const body = await parseBody(req);
        if (
          !Array.isArray(body?.moves) ||
          body.moves.length > 300 ||
          !body.moves.every((m) => typeof m === 'string' && UCI_MOVE.test(m))
        )
          return Response.json(
            { error: 'Histórico inválido ou maior que 300 meios-lances.' },
            { status: 400 },
          );
        reviewing = true;
        try {
          return Response.json({ rows: await review(await getReviewer(), body.moves as string[]) });
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 400 });
        } finally {
          await releaseReviewer();
          reviewing = false;
        }
      },
    },
    '/api/newgame': {
      POST: async () => {
        if (duel.active) return jsonError('Pause o duelo antes de treinar.', 409);
        if (!['idle', 'finished'].includes(tournamentState.phase))
          return jsonError('Encerre a sessão de torneio antes de abrir treino.', 409);
        await engine.newGame();
        return Response.json({ ok: true });
      },
    },
    '/api/move': {
      POST: async (req) => {
        if (duel.active) return jsonError('Pause o duelo antes de treinar.', 409);
        if (!['idle', 'finished'].includes(tournamentState.phase))
          return jsonError('Treino bloqueado durante a sessão de torneio.', 409);
        const body = await parseBody(req);
        const moves = body?.moves;
        const movetime = body?.movetime;
        if (
          !Array.isArray(moves) ||
          moves.length > MAX_PLIES ||
          !moves.every((m) => typeof m === 'string' && UCI_MOVE.test(m))
        ) {
          return Response.json({ error: 'moves deve ser uma lista de lances UCI' }, { status: 400 });
        }
        if (
          typeof movetime !== 'number' ||
          !Number.isInteger(movetime) ||
          movetime < MOVETIME_MIN ||
          movetime > MOVETIME_MAX
        ) {
          return Response.json(
            { error: `movetime deve ser inteiro entre ${MOVETIME_MIN} e ${MOVETIME_MAX}` },
            { status: 400 },
          );
        }
        try {
          if (body?.book === true) {
            const board = new Chess();
            for (const move of moves as string[]) board.move(move);
            const entry = preparedBook[board.fen().split(' ').slice(0, 4).join(' ')];
            if (entry) {
              board.move(entry.move);
              engine.stop();
              return Response.json({ bestmove: entry.move, depth: entry.depth, score: null, source: 'book' });
            }
          }
          return Response.json(await engine.search(moves as string[], movetime));
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 500 });
        }
      },
    },
    '/api/tournament/status': { GET: () => Response.json(tournamentSnapshot()) },
    '/api/tournament/newgame': {
      POST: async (req) => {
        if (duel.active) return jsonError('Pause o duelo antes de iniciar o torneio.', 409);
        const body = await parseBody(req);
        const engineColor = body?.engineColor;
        const initialMillis = body?.initialMillis;
        if (engineColor !== 'white' && engineColor !== 'black')
          return jsonError('engineColor deve ser white ou black.');
        if (
          typeof initialMillis !== 'number' ||
          !Number.isInteger(initialMillis) ||
          initialMillis < TOURNAMENT_INITIAL_MIN ||
          initialMillis > TOURNAMENT_INITIAL_MAX
        ) {
          return jsonError(
            `initialMillis deve estar entre ${TOURNAMENT_INITIAL_MIN} e ${TOURNAMENT_INITIAL_MAX}.`,
          );
        }
        await serializeTournament(async () => {
          tournamentState.session += 1;
          tournamentState = {
            session: tournamentState.session,
            game: new Chess(),
            engineColor,
            phase: 'ready',
            whiteMillis: initialMillis,
            blackMillis: initialMillis,
            running: null,
            runningSince: null,
            pending: null,
            error: null,
            initialMillis,
            startedAt: null,
            elapsedAtEnd: null,
          };
          await engine.newGame();
          appendTournamentLog('new-game-ready', { ...tournamentSnapshot() });
        });
        return Response.json(tournamentSnapshot());
      },
    },
    '/api/tournament/start': {
      POST: async () => {
        if (reviewing) return jsonError('Aguarde a análise terminar antes de iniciar o relógio.', 409);
        let session: number | null = null;
        const response = await serializeTournament(() => {
          if (tournamentState.phase !== 'ready' || tournamentState.engineColor === null)
            return jsonError('Prepare uma nova partida antes de iniciar.');
          const turn = colorForTurn(tournamentState.game.turn());
          startClock(turn);
          tournamentState.startedAt = Date.now();
          session = tournamentState.session;
          tournamentState.phase =
            turn === tournamentState.engineColor ? 'engine-thinking' : 'awaiting-opponent';
          appendTournamentLog('clock-started', { ...tournamentSnapshot() });
          return Response.json(tournamentSnapshot());
        });
        if (session !== null && tournamentState.phase === 'engine-thinking')
          void calculateEngineMove(session);
        return response;
      },
    },
    '/api/tournament/opponent-move': {
      POST: async (req) => {
        const body = await parseBody(req);
        const uci = body?.uci;
        if (typeof uci !== 'string' || uci.length < 2 || uci.length > 20)
          return jsonError('Digite um lance como e2e4, e4, Nf3 ou O-O.');
        let session: number | null = null;
        const response = await serializeTournament(() => {
          if (tournamentState.engineColor === null || tournamentState.phase !== 'awaiting-opponent')
            return jsonError('Não é o momento de inserir lance adversário.');
          const opponent = opposite(tournamentState.engineColor);
          if (colorForTurn(tournamentState.game.turn()) !== opponent || tournamentState.running !== opponent)
            return jsonError('Estado de relógio/turno inconsistente; inicie nova partida.', 409);
          const validation = new Chess(tournamentState.game.fen());
          let canonical: string;
          try {
            canonical = validation.move(uci).lan;
          } catch {
            return jsonError('Lance ilegal para a posição atual. Corrija-o antes de continuar.');
          }
          stopClock();
          applyUci(tournamentState.game, canonical);
          appendTournamentLog('opponent-move', { ...tournamentSnapshot(), uci });
          if (finishIfGameOver()) return Response.json(tournamentSnapshot());
          startClock(tournamentState.engineColor);
          tournamentState.phase = 'engine-thinking';
          session = tournamentState.session;
          return Response.json(tournamentSnapshot());
        });
        if (session !== null) void calculateEngineMove(session);
        return response;
      },
    },
    '/api/tournament/confirm-engine-move': {
      POST: async () => {
        return serializeTournament(() => {
          if (
            tournamentState.engineColor === null ||
            tournamentState.phase !== 'awaiting-engine-confirmation' ||
            tournamentState.pending === null
          ) {
            return jsonError('Não existe jogada da engine aguardando confirmação.');
          }
          const move = tournamentState.pending.bestmove;
          try {
            applyUci(tournamentState.game, move);
          } catch {
            stopClock();
            tournamentState.phase = 'error';
            tournamentState.error = `A engine retornou lance ilegal: ${move}`;
            appendTournamentLog('illegal-engine-move', { ...tournamentSnapshot(), move });
            return jsonError(tournamentState.error, 500);
          }
          stopClock();
          tournamentState.pending = null;
          appendTournamentLog('engine-move-confirmed', { ...tournamentSnapshot(), uci: move });
          if (finishIfGameOver()) return Response.json(tournamentSnapshot());
          startClock(opposite(tournamentState.engineColor));
          tournamentState.phase = 'awaiting-opponent';
          return Response.json(tournamentSnapshot());
        });
      },
    },
    '/api/tournament/end': {
      POST: () =>
        serializeTournament(() => {
          engine.stop();
          stopClock();
          tournamentState.phase = 'finished';
          tournamentState.elapsedAtEnd =
            tournamentState.startedAt === null ? 0 : Date.now() - tournamentState.startedAt;
          appendTournamentLog('operator-ended-session', { ...tournamentSnapshot() });
          return Response.json(tournamentSnapshot());
        }),
    },
    '/api/tournament/reconcile': {
      POST: async (req) => {
        const body = await parseBody(req);
        if (
          typeof body?.whiteMillis !== 'number' ||
          typeof body.blackMillis !== 'number' ||
          ![body.whiteMillis, body.blackMillis].every((n) => Number.isFinite(n) && n >= 0 && n <= 2000000)
        )
          return jsonError('Tempos inválidos.');
        return serializeTournament(() => {
          const running = tournamentState.running;
          if (tournamentState.phase === 'engine-thinking')
            return jsonError('Aguarde a resposta da engine antes de corrigir os relógios.', 409);
          stopClock();
          tournamentState.whiteMillis = body.whiteMillis as number;
          tournamentState.blackMillis = body.blackMillis as number;
          if (running) startClock(running);
          appendTournamentLog('clocks-reconciled', { ...tournamentSnapshot() });
          return Response.json(tournamentSnapshot());
        });
      },
    },
  },
  fetch: () => new Response('Não encontrado', { status: 404 }),
});

const url = server.url.href;
console.log(`IA Xadrez — ${engine.name} (${threads} threads)`);
console.log(`Treino: ${url}`);
console.log(`Torneio: ${url}tournament`);
console.log(`Log de torneio: ${tournamentLogPath}`);
console.log('Feche esta janela (ou Ctrl+C) para sair.');
if (!args['no-open']) openBrowser(url);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    engine.quit();
    reviewer?.quit();
    duel.close();
    process.exit(0);
  });
}
