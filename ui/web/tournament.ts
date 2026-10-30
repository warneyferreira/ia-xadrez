import "./style.css";

type Color = "white" | "black";
type Phase = "idle" | "ready" | "engine-thinking" | "awaiting-engine-confirmation" | "awaiting-opponent" | "finished" | "error";
type Score = { unit: "cp" | "mate"; value: number };
type Pending = { bestmove: string; depth: number; score: Score | null } | null;
type TournamentState = {
  phase: Phase;
  engineColor: Color | null;
  turn: Color;
  fen: string;
  moves: string[];
  whiteMillis: number;
  blackMillis: number;
  running: Color | null;
  pending: Pending;
  gameOver: boolean;
  error: string | null;
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  color: byId<HTMLSelectElement>("engine-color"),
  initialTime: byId<HTMLSelectElement>("initial-time"),
  newGame: byId<HTMLButtonElement>("new-game"),
  startGame: byId<HTMLButtonElement>("start-game"),
  opponentForm: byId<HTMLFormElement>("opponent-form"),
  opponentMove: byId<HTMLInputElement>("opponent-move"),
  sendOpponent: byId<HTMLButtonElement>("send-opponent"),
  engineMove: byId<HTMLParagraphElement>("engine-move"),
  engineDetail: byId<HTMLParagraphElement>("engine-detail"),
  confirmEngine: byId<HTMLButtonElement>("confirm-engine"),
  whiteClock: byId<HTMLElement>("white-clock"),
  blackClock: byId<HTMLElement>("black-clock"),
  phase: byId<HTMLParagraphElement>("phase"),
  error: byId<HTMLParagraphElement>("error"),
  fen: byId<HTMLParagraphElement>("fen"),
  moves: byId<HTMLOListElement>("moves"),
  runningSide: byId<HTMLElement>("running-side"),
};

let state: TournamentState | null = null;
let requestInFlight = false;

function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

function describePhase(next: TournamentState): string {
  if (next.phase === "ready") return "Partida preparada. Inicie junto com o relógio físico.";
  if (next.phase === "engine-thinking") return "Engine calculando. Aguarde a nossa jogada.";
  if (next.phase === "awaiting-engine-confirmation") return "Faça a jogada da engine no tabuleiro, pressione o relógio físico e confirme aqui.";
  if (next.phase === "awaiting-opponent") return "Aguardando a jogada do adversário.";
  if (next.phase === "finished") return "Partida encerrada.";
  if (next.phase === "error") return "ERRO OPERACIONAL: não prossiga antes de conferir posição e relógio.";
  return "Aguardando nova partida.";
}

function engineMoveText(pending: Pending): string {
  if (!pending) return "—";
  return `${pending.bestmove.slice(0, 2)} → ${pending.bestmove.slice(2, 4)}${pending.bestmove[4] ? ` = ${pending.bestmove[4].toUpperCase()}` : ""}`;
}

function sync(next: TournamentState): void {
  state = next;
  els.whiteClock.textContent = formatClock(next.whiteMillis);
  els.blackClock.textContent = formatClock(next.blackMillis);
  els.phase.textContent = describePhase(next);
  els.fen.textContent = next.fen;
  els.engineMove.textContent = next.phase === "awaiting-engine-confirmation" ? engineMoveText(next.pending) : "—";
  els.engineDetail.textContent = next.pending ? `Profundidade ${next.pending.depth}${next.pending.score ? ` · avaliação ${next.pending.score.unit} ${next.pending.score.value}` : ""}` : "A posição e os relógios serão enviados ao Stockfish.";
  els.error.hidden = !next.error;
  els.error.textContent = next.error ?? "";
  els.runningSide.textContent = next.running === "white" ? "Relógio: brancas" : next.running === "black" ? "Relógio: pretas" : "Parado";
  els.moves.replaceChildren(...next.moves.map((move) => {
    const item = document.createElement("li");
    item.textContent = move;
    return item;
  }));

  els.newGame.disabled = next.phase === "engine-thinking" || next.phase === "awaiting-engine-confirmation";
  els.startGame.disabled = next.phase !== "ready";
  els.opponentMove.disabled = next.phase !== "awaiting-opponent";
  els.sendOpponent.disabled = next.phase !== "awaiting-opponent";
  els.confirmEngine.disabled = next.phase !== "awaiting-engine-confirmation";
  if (next.phase === "awaiting-opponent") els.opponentMove.focus();
}

async function api(path: string, body?: object): Promise<TournamentState> {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = (await response.json()) as TournamentState | { error: string; state?: TournamentState };
  if (!response.ok) {
    if ("state" in data && data.state) sync(data.state);
    throw new Error("error" in data ? (data.error ?? `HTTP ${response.status}`) : `HTTP ${response.status}`);
  }
  return data as TournamentState;
}

async function refresh(): Promise<void> {
  if (requestInFlight) return;
  requestInFlight = true;
  try {
    sync(await api("/api/tournament/status"));
  } catch (error) {
    els.error.hidden = false;
    els.error.textContent = `Falha de comunicação: ${(error as Error).message}`;
  } finally {
    requestInFlight = false;
  }
}

els.newGame.addEventListener("click", () => void (async () => {
  try {
    sync(await api("/api/tournament/newgame", { engineColor: els.color.value, initialMillis: Number(els.initialTime.value) }));
  } catch (error) {
    els.error.hidden = false;
    els.error.textContent = (error as Error).message;
  }
})());

els.startGame.addEventListener("click", () => void (async () => {
  try { sync(await api("/api/tournament/start", {})); } catch (error) { els.error.hidden = false; els.error.textContent = (error as Error).message; }
})());

els.opponentForm.addEventListener("submit", (event) => void (async () => {
  event.preventDefault();
  const uci = els.opponentMove.value.trim().toLowerCase();
  try {
    sync(await api("/api/tournament/opponent-move", { uci }));
    els.opponentMove.value = "";
  } catch (error) {
    els.error.hidden = false;
    els.error.textContent = (error as Error).message;
  }
})());

els.confirmEngine.addEventListener("click", () => void (async () => {
  try { sync(await api("/api/tournament/confirm-engine-move", {})); } catch (error) { els.error.hidden = false; els.error.textContent = (error as Error).message; }
})());

await refresh();
setInterval(() => void refresh(), 250);
