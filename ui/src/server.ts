import { existsSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import index from "../web/index.html";
import { Engine } from "./engine.ts";

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MOVETIME_MIN = 100;
const MOVETIME_MAX = 60_000;
const MAX_PLIES = 1000;

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
    cwd = "/mnt/c"; // cmd.exe reclama de diretório atual em caminho UNC do WSL
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
  // Hash 256 MB cobre buscas de até ~10 s por lance com folga; ver docs/uci-settings.md.
  await engine.init({ Threads: threads, Hash: 256 });
} catch (err) {
  await fatal(`falha ao iniciar o motor ${enginePath}: ${(err as Error).message}`);
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(args.port),
  development: false,
  routes: {
    "/": index,
    "/api/info": {
      GET: () => Response.json({ engine: engine.name, threads }),
    },
    "/api/newgame": {
      POST: async () => {
        await engine.newGame();
        return Response.json({ ok: true });
      },
    },
    "/api/move": {
      POST: async (req) => {
        const body = (await req.json().catch(() => null)) as { moves?: unknown; movetime?: unknown } | null;
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
  },
  fetch: () => new Response("Não encontrado", { status: 404 }),
});

const url = server.url.href;
console.log(`IA Xadrez — ${engine.name} (${threads} threads)`);
console.log(`Abra no navegador: ${url}`);
console.log("Feche esta janela (ou Ctrl+C) para sair.");
if (!args["no-open"]) openBrowser(url);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    engine.quit();
    process.exit(0);
  });
}
