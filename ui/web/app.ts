import { Chess, type Square } from "chess.js";
import { Chessground } from "chessground";
import type { Key } from "chessground/types";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "./style.css";

type Color = "white" | "black";
type Score = { unit: "cp" | "mate"; value: number };
type SearchResult = { bestmove: string; depth: number; score: Score | null };

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  board: byId("board"),
  engineName: byId("engine-name"),
  status: byId("status"),
  evaluation: byId("eval"),
  color: byId<HTMLSelectElement>("color"),
  movetime: byId<HTMLSelectElement>("movetime"),
  newGame: byId<HTMLButtonElement>("new-game"),
  undo: byId<HTMLButtonElement>("undo"),
  flip: byId<HTMLButtonElement>("flip"),
  moves: byId<HTMLOListElement>("moves"),
  promotion: byId<HTMLDialogElement>("promotion"),
};

const chess = new Chess();
let human: Color = "white";
let thinking = false;
/** Incrementado a cada nova partida/desfazer; respostas de buscas antigas são descartadas. */
let gameId = 0;
let evaluation = "";
let error = "";

const turnColor = (): Color => (chess.turn() === "w" ? "white" : "black");

const cg = Chessground(els.board, {
  movable: { free: false, showDests: true, events: { after: (orig, dest) => void onHumanMove(orig, dest) } },
  premovable: { enabled: false },
  highlight: { lastMove: true, check: true },
  animation: { enabled: true, duration: 200 },
});

function statusText(): string {
  if (chess.isCheckmate()) return turnColor() === human ? "Xeque-mate — a IA venceu." : "Xeque-mate — você venceu!";
  if (chess.isStalemate()) return "Empate por afogamento.";
  if (chess.isThreefoldRepetition()) return "Empate por repetição.";
  if (chess.isInsufficientMaterial()) return "Empate por material insuficiente.";
  if (chess.isDrawByFiftyMoves()) return "Empate pela regra dos 50 lances.";
  if (thinking) return "IA pensando…";
  return chess.inCheck() ? "Sua vez — xeque!" : "Sua vez.";
}

/** Redesenha tabuleiro e painel a partir de `chess` e do estado da partida. */
function sync(): void {
  const history = chess.history({ verbose: true });
  const last = history.at(-1);
  const humanToMove = !thinking && !chess.isGameOver() && turnColor() === human;
  const dests = new Map<Key, Key[]>();
  if (humanToMove) {
    for (const m of chess.moves({ verbose: true })) dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
  }
  cg.set({
    fen: chess.fen(),
    turnColor: turnColor(),
    check: chess.inCheck(),
    lastMove: last ? [last.from, last.to] : undefined,
    movable: { color: humanToMove ? human : undefined, dests },
  });

  els.status.textContent = error || statusText();
  els.evaluation.textContent = evaluation;
  els.undo.disabled = thinking || history.length < (human === "white" ? 1 : 2);

  const items: HTMLLIElement[] = [];
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement("li");
    li.textContent = history[i + 1] ? `${history[i]!.san}  ${history[i + 1]!.san}` : history[i]!.san;
    items.push(li);
  }
  els.moves.replaceChildren(...items);
  els.moves.scrollTop = els.moves.scrollHeight;
}

/** Avaliação sempre do ponto de vista das brancas; o motor informa do ponto de vista dele. */
function formatEvaluation(score: Score | null, depth: number): string {
  if (!score) return "";
  const value = human === "black" ? score.value : -score.value;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const text = score.unit === "mate" ? `${sign}M${Math.abs(value)}` : `${sign}${(Math.abs(value) / 100).toFixed(2)}`;
  return `Avaliação (brancas): ${text} · profundidade ${depth}`;
}

async function engineMove(): Promise<void> {
  const id = gameId;
  thinking = true;
  error = "";
  sync();
  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        moves: chess.history({ verbose: true }).map((m) => m.lan),
        movetime: Number(els.movetime.value),
      }),
    });
    const data = (await res.json()) as SearchResult | { error: string };
    if (id !== gameId) return;
    if ("error" in data) throw new Error(data.error);
    const { bestmove } = data;
    chess.move({ from: bestmove.slice(0, 2), to: bestmove.slice(2, 4), promotion: bestmove[4] });
    evaluation = formatEvaluation(data.score, data.depth);
  } catch (err) {
    if (id === gameId) error = `Erro ao consultar a IA: ${(err as Error).message}`;
  } finally {
    if (id === gameId) {
      thinking = false;
      sync();
    }
  }
}

function choosePromotion(): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  els.promotion.returnValue = "";
  els.promotion.addEventListener("close", () => resolve(els.promotion.returnValue || "q"), { once: true });
  els.promotion.showModal();
  return promise;
}

async function onHumanMove(orig: Key, dest: Key): Promise<void> {
  const piece = chess.get(orig as Square);
  const promotion = piece?.type === "p" && (dest[1] === "8" || dest[1] === "1") ? await choosePromotion() : undefined;
  chess.move({ from: orig, to: dest, promotion });
  sync();
  if (!chess.isGameOver()) await engineMove();
}

async function newGame(): Promise<void> {
  const id = ++gameId;
  const choice = els.color.value;
  human = choice === "random" ? (Math.random() < 0.5 ? "white" : "black") : (choice as Color);
  chess.reset();
  thinking = false;
  evaluation = "";
  error = "";
  cg.set({ orientation: human });
  sync();
  try {
    const res = await fetch("/api/newgame", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (id === gameId) {
      error = `Erro ao iniciar partida: ${(err as Error).message}`;
      sync();
    }
    return;
  }
  if (id === gameId && turnColor() !== human) await engineMove();
}

els.newGame.addEventListener("click", () => void newGame());
els.flip.addEventListener("click", () => cg.toggleOrientation());
els.undo.addEventListener("click", () => {
  if (thinking) return;
  // Volta até ser a vez do jogador: desfaz a resposta da IA e o lance do jogador.
  do chess.undo();
  while (chess.history().length > 0 && turnColor() !== human);
  evaluation = "";
  error = "";
  sync();
});

try {
  const info = (await (await fetch("/api/info")).json()) as { engine: string; threads: number };
  els.engineName.textContent = `${info.engine} · ${info.threads} threads`;
} catch {
  els.engineName.textContent = "Servidor indisponível";
}
await newGame();
