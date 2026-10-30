import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Chess } from "chess.js";
import index from "../web/index.html";
import tournament from "../web/tournament.html";
import { Engine, type SearchResult } from "./engine.ts";

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MOVETIME_MIN = 100;
const MOVETIME_MAX = 60_000;
const MAX_PLIES = 1000;
const TOURNAMENT_INITIAL_MIN = 60_000;
const TOURNAMENT_INITIAL_MAX = 2_000_000;
type Color = "white" | "black";
type Phase = "idle" | "ready" | "engine-thinking" | "awaiting-engine-confirmation" | "awaiting-opponent" | "finished" | "error";

/** Mostra o erro e espera Enter, para a janela do console não fechar antes de ser lida. */
async function fatal(message: string): Promise<never> {
  console.error(`\nERRO: ${message}\n`);
  if (process.stdin.isTTY) {
    console.error("Pressione Enter para sair.");
    for await (const _ of console) break;
  }
  process.exit(1);
}

function isWsl(): boolean {
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  let cmd: string[];
  let cwd: string | undefined;
  if (process.platform === "win32") cmd = ["cmd", "/c", "start", "", url];
  else if (process.platform === "darwin") cmd = ["open", url];
  else if (isWsl()) {
    cmd = ["cmd.exe", "/c", "start", "", url];
    cwd = "/mnt/c";
  } else cmd = ["xdg-open", url];
  try {
    Bun.spawn(cmd, { cwd, stdout: "ignore", stderr: "ignore" });
  } catch {
    // Sem navegador disponível: o endereço já foi impresso no console.
  }
}

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    engine: { type: "string" },
    port: { type: "string", default: "0" },
    "no-open": { type: "boolean", default: false },
    "tournament-log": { type: "string" },
  },
});

const enginePath = resolve(
  args.engine ?? join(dirname(process.execPath), process.platform === "win32" ? "stockfish.exe" : "stockfish"),
);
if (!existsSync(enginePath)) {
  await fatal(`motor não encontrado em ${enginePath}\nColoque o executável do Stockfish ao lado deste programa ou use --engine <caminho>.`);
}

const threads = availableParallelism();
const engine = new Engine(enginePath);
try {
  // A UI de treino usa buscas curtas; o modo torneio recebe relógios por UCI.
  await engine.init({ Threads: threads, Hash: 256, "Move Overhead": 500 });
} catch (err) {
  await fatal(`falha ao iniciar o motor ${enginePath}: ${(err as Error).message}`);
}

const timestamp = new Date().toISOString().replaceAll(":", "-");
const tournamentLogPath = resolve(args["tournament-log"] ?? join(process.cwd(), "logs", `tournament-${timestamp}.jsonl`));

function appendTournamentLog(event: string, data: Record<string, unknown> = {}): void {
  try {
    mkdirSync(dirname(tournamentLogPath), { recursive: true });
    appendFileSync(tournamentLogPath, `${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`, "utf8");
  } catch (err) {
    console.error(`Não foi possível gravar log de torneio: ${(err as Error).message}`);
  }
}

const colorForTurn = (turn: "w" | "b"): Color => (turn === "w" ? "white" : "black");
const opposite = (color: Color): Color => (color === "white" ? "black" : "white");

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
};

let tournamentState: TournamentState = {
  session: 0,
  game: new Chess(),
  engineColor: null,
  phase: "idle",
  whiteMillis: 0,
  blackMillis: 0,
  running: null,
  runningSince: null,
  pending: null,
  error: null,
};
let tournamentQueue: Promise<unknown> = Promise.resolve();

function serializeTournament<T>(task: () => Promise<T> | T): Promise<T> {
  const result = tournamentQueue.then(task, task);
  tournamentQueue = result.catch(() => undefined);
  return result;
}

function projectedClock(color: Color): number {
  const stored = color === "white" ? tournamentState.whiteMillis : tournamentState.blackMillis;
  if (tournamentState.running !== color || tournamentState.runningSince === null) return stored;
  return Math.max(0, Math.floor(stored - (performance.now() - tournamentState.runningSince)));
}

function startClock(color: Color): void {
  if (tournamentState.running !== null) throw new Error("Já existe um relógio em execução.");
  tournamentState.running = color;
  tournamentState.runningSince = performance.now();
}

function stopClock(): void {
  const color = tournamentState.running;
  if (color === null) return;
  const left = projectedClock(color);
  if (color === "white") tournamentState.whiteMillis = left;
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
    whiteMillis: projectedClock("white"),
    blackMillis: projectedClock("black"),
    running: tournamentState.running,
    pending: tournamentState.pending,
    gameOver: tournamentState.game.isGameOver(),
    error: tournamentState.error,
    logPath: tournamentLogPath,
  };
}

function finishIfGameOver(): boolean {
  if (!tournamentState.game.isGameOver()) return false;
  stopClock();
  tournamentState.phase = "finished";
  appendTournamentLog("game-finished", { ...tournamentSnapshot() });
  return true;
}

async function calculateEngineMove(session: number): Promise<void> {
  const current = tournamentState;
  if (current.session !== session || current.phase !== "engine-thinking" || current.engineColor === null) return;
  const clocks = { whiteMillis: projectedClock("white"), blackMillis: projectedClock("black") };
  const moves = movesUci();
  try {
    const result = await engine.searchWithClocks(moves, clocks);
    await serializeTournament(() => {
      if (tournamentState.session !== session || tournamentState.phase !== "engine-thinking") return;
      if (!UCI_MOVE.test(result.bestmove)) throw new Error(`Motor retornou bestmove inválido: ${result.bestmove}`);
      tournamentState.pending = result;
      tournamentState.phase = "awaiting-engine-confirmation";
      appendTournamentLog("engine-move-ready", { ...tournamentSnapshot(), bestmove: result.bestmove });
    });
  } catch (err) {
    await serializeTournament(() => {
      if (tournamentState.session !== session) return;
      stopClock();
      tournamentState.phase = "error";
      tournamentState.error = `Falha da engine: ${(err as Error).message}`;
      appendTournamentLog("engine-failure", { ...tournamentSnapshot() });
    });
  }
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message, state: tournamentSnapshot() }, { status });
}

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  const value = await req.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(args.port),
  development: false,
  routes: {
    "/": index,
    "/tournament": tournament,
    "/api/info": { GET: () => Response.json({ engine: engine.name, threads }) },
    "/api/newgame": {
      POST: async () => {
        await engine.newGame();
        return Response.json({ ok: true });
      },
    },
    "/api/move": {
      POST: async (req) => {
        const body = await parseBody(req);
        const moves = body?.moves;
        const movetime = body?.movetime;
        if (!Array.isArray(moves) || moves.length > MAX_PLIES || !moves.every((m) => typeof m === "string" && UCI_MOVE.test(m))) {
          return Response.json({ error: "moves deve ser uma lista de lances UCI" }, { status: 400 });
        }
        if (typeof movetime !== "number" || !Number.isInteger(movetime) || movetime < MOVETIME_MIN || movetime > MOVETIME_MAX) {
          return Response.json({ error: `movetime deve ser inteiro entre ${MOVETIME_MIN} e ${MOVETIME_MAX}` }, { status: 400 });
        }
        try {
          return Response.json(await engine.search(moves as string[], movetime));
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 500 });
        }
      },
    },
    "/api/tournament/status": { GET: () => Response.json(tournamentSnapshot()) },
    "/api/tournament/newgame": {
      POST: async (req) => {
        const body = await parseBody(req);
        const engineColor = body?.engineColor;
        const initialMillis = body?.initialMillis;
        if (engineColor !== "white" && engineColor !== "black") return jsonError("engineColor deve ser white ou black.");
        if (typeof initialMillis !== "number" || !Number.isInteger(initialMillis) || initialMillis < TOURNAMENT_INITIAL_MIN || initialMillis > TOURNAMENT_INITIAL_MAX) {
          return jsonError(`initialMillis deve estar entre ${TOURNAMENT_INITIAL_MIN} e ${TOURNAMENT_INITIAL_MAX}.`);
        }
        await serializeTournament(async () => {
          tournamentState.session += 1;
          tournamentState = {
            session: tournamentState.session,
            game: new Chess(),
            engineColor,
            phase: "ready",
            whiteMillis: initialMillis,
            blackMillis: initialMillis,
            running: null,
            runningSince: null,
            pending: null,
            error: null,
          };
          await engine.newGame();
          appendTournamentLog("new-game-ready", { ...tournamentSnapshot() });
        });
        return Response.json(tournamentSnapshot());
      },
    },
    "/api/tournament/start": {
      POST: async () => {
        let session: number | null = null;
        const response = await serializeTournament(() => {
          if (tournamentState.phase !== "ready" || tournamentState.engineColor === null) return jsonError("Prepare uma nova partida antes de iniciar.");
          const turn = colorForTurn(tournamentState.game.turn());
          startClock(turn);
          session = tournamentState.session;
          tournamentState.phase = turn === tournamentState.engineColor ? "engine-thinking" : "awaiting-opponent";
          appendTournamentLog("clock-started", { ...tournamentSnapshot() });
          return Response.json(tournamentSnapshot());
        });
        if (session !== null && tournamentState.phase === "engine-thinking") void calculateEngineMove(session);
        return response;
      },
    },
    "/api/tournament/opponent-move": {
      POST: async (req) => {
        const body = await parseBody(req);
        const uci = body?.uci;
        if (typeof uci !== "string" || !UCI_MOVE.test(uci)) return jsonError("uci deve ter formato e2e4 ou e7e8q.");
        let session: number | null = null;
        const response = await serializeTournament(() => {
          if (tournamentState.engineColor === null || tournamentState.phase !== "awaiting-opponent") return jsonError("Não é o momento de inserir lance adversário.");
          const opponent = opposite(tournamentState.engineColor);
          if (colorForTurn(tournamentState.game.turn()) !== opponent || tournamentState.running !== opponent) return jsonError("Estado de relógio/turno inconsistente; inicie nova partida.", 409);
          const validation = new Chess(tournamentState.game.fen());
          try {
            applyUci(validation, uci);
          } catch {
            return jsonError("Lance ilegal para a posição atual. Corrija-o antes de continuar.");
          }
          stopClock();
          applyUci(tournamentState.game, uci);
          appendTournamentLog("opponent-move", { ...tournamentSnapshot(), uci });
          if (finishIfGameOver()) return Response.json(tournamentSnapshot());
          startClock(tournamentState.engineColor);
          tournamentState.phase = "engine-thinking";
          session = tournamentState.session;
          return Response.json(tournamentSnapshot());
        });
        if (session !== null) void calculateEngineMove(session);
        return response;
      },
    },
    "/api/tournament/confirm-engine-move": {
      POST: async () => {
        return serializeTournament(() => {
          if (tournamentState.engineColor === null || tournamentState.phase !== "awaiting-engine-confirmation" || tournamentState.pending === null) {
            return jsonError("Não existe jogada da engine aguardando confirmação.");
          }
          const move = tournamentState.pending.bestmove;
          try {
            applyUci(tournamentState.game, move);
          } catch {
            stopClock();
            tournamentState.phase = "error";
            tournamentState.error = `A engine retornou lance ilegal: ${move}`;
            appendTournamentLog("illegal-engine-move", { ...tournamentSnapshot(), move });
            return jsonError(tournamentState.error, 500);
          }
          stopClock();
          tournamentState.pending = null;
          appendTournamentLog("engine-move-confirmed", { ...tournamentSnapshot(), uci: move });
          if (finishIfGameOver()) return Response.json(tournamentSnapshot());
          startClock(opposite(tournamentState.engineColor));
          tournamentState.phase = "awaiting-opponent";
          return Response.json(tournamentSnapshot());
        });
      },
    },
  },
  fetch: () => new Response("Não encontrado", { status: 404 }),
});

const url = server.url.href;
console.log(`IA Xadrez — ${engine.name} (${threads} threads)`);
console.log(`Treino: ${url}`);
console.log(`Torneio: ${url}tournament`);
console.log(`Log de torneio: ${tournamentLogPath}`);
console.log("Feche esta janela (ou Ctrl+C) para sair.");
if (!args["no-open"]) openBrowser(url);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    engine.quit();
    process.exit(0);
  });
}
