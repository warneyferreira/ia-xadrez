import { Chess, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import { ChessSounds } from './sounds.ts';

type Color = 'white' | 'black';
type Score = { unit: 'cp' | 'mate'; value: number };
type SearchResult = {
  bestmove: string;
  ponder?: string;
  depth: number;
  score: Score | null;
  source?: string;
};

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  board: byId('board'),
  engineName: byId('engine-name'),
  status: byId('status'),
  evaluation: byId('eval'),
  color: byId<HTMLSelectElement>('color'),
  movetime: byId<HTMLSelectElement>('movetime'),
  newGame: byId<HTMLButtonElement>('new-game'),
  undo: byId<HTMLButtonElement>('undo'),
  flip: byId<HTMLButtonElement>('flip'),
  moves: byId<HTMLOListElement>('moves'),
  promotion: byId<HTMLDialogElement>('promotion'),
};

const chess = new Chess();
let human: Color = 'white';
let thinking = false;
/** Incrementado a cada nova partida/desfazer; respostas de buscas antigas são descartadas. */
let gameId = 0;
let evaluation = '';
let error = '';
const premove = byId<HTMLInputElement>('premove');
const material = byId('material');
const reviewButton = byId<HTMLButtonElement>('review-game');
const prepare = byId<HTMLInputElement>('engine-prepare');
let predicted: string | undefined;
let reviewId = 0;
const sounds = new ChessSounds(byId<HTMLButtonElement>('sound-toggle'));
let trainingPly: number | null = null;
let trainingReview: {
  ply: number;
  san: string;
  whiteCp: number | null;
  lossCp: number | null;
  label: string;
  depth: number;
  explanation?: string;
}[] = [];
let autoReviewedGame = -1;
function trainingReplay(ply: number | null) {
  const history = chess.history({ verbose: true });
  trainingPly = ply === null ? null : Math.max(0, Math.min(history.length, ply));
  const selected = trainingPly ?? history.length;
  const fen = selected ? history[selected - 1]!.after : (history[0]?.before ?? chess.fen());
  cg.set({ fen, viewOnly: trainingPly !== null });
  byId<HTMLInputElement>('train-range').value = String(selected);
  byId('train-ply').textContent = trainingPly === null ? 'Ao vivo' : `${selected}/${history.length}`;
  const judged = trainingReview.find((r) => r.ply === selected);
  byId('train-explanation').textContent =
    judged?.explanation ?? (selected ? history[selected - 1]!.san : 'Posição inicial.');
  if (judged?.whiteCp !== null && judged?.whiteCp !== undefined) updateBar(judged.whiteCp);
  if (trainingPly === null) sync();
}
function moveSound(move: ReturnType<Chess['move']>) {
  sounds.play(
    chess.isGameOver()
      ? 'end'
      : move.promotion
        ? 'promotion'
        : chess.inCheck()
          ? 'check'
          : move.isKingsideCastle() || move.isQueensideCastle()
            ? 'castle'
            : move.captured
              ? 'capture'
              : 'move',
  );
}

function updateBar(cp: number): void {
  const percent = 50 + 50 * Math.tanh(cp / 400);
  byId('eval-fill').style.height = `${percent}%`;
  byId('eval-number').textContent = `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
  document.querySelector('[role="meter"]')?.setAttribute('aria-valuenow', String(Math.round(percent)));
}

function clearReview(): void {
  reviewId++;
  trainingReview = [];
  trainingPly = null;
  byId('review-rows').replaceChildren();
  byId('score-line').setAttribute('points', '');
  byId('review-status').textContent = 'Clique em Analisar jogadas para avaliar o histórico atual.';
}

const turnColor = (): Color => (chess.turn() === 'w' ? 'white' : 'black');

const cg = Chessground(els.board, {
  movable: { free: false, showDests: true, events: { after: (orig, dest) => void onHumanMove(orig, dest) } },
  premovable: { enabled: false },
  highlight: { lastMove: true, check: true },
  animation: { enabled: true, duration: 200 },
});

function statusText(): string {
  if (chess.isCheckmate())
    return turnColor() === human ? 'Xeque-mate — a IA venceu.' : 'Xeque-mate — você venceu!';
  if (chess.isStalemate()) return 'Empate por afogamento.';
  if (chess.isThreefoldRepetition()) return 'Empate por repetição.';
  if (chess.isInsufficientMaterial()) return 'Empate por material insuficiente.';
  if (chess.isDrawByFiftyMoves()) return 'Empate pela regra dos 50 lances.';
  if (thinking) return 'IA pensando…';
  return chess.inCheck() ? 'Sua vez — xeque!' : 'Sua vez.';
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
    viewOnly: trainingPly !== null,
    fen: chess.fen(),
    turnColor: turnColor(),
    check: chess.inCheck(),
    lastMove: last ? [last.from, last.to] : undefined,
    movable: {
      color: !chess.isGameOver() && (humanToMove || (thinking && premove.checked)) ? human : undefined,
      dests,
    },
    premovable: { enabled: premove.checked },
  });
  const bottom = cg.state.orientation;
  const top = bottom === 'white' ? 'black' : 'white';
  const playerLabel = (color: Color) =>
    `${human === color ? 'Você' : 'IA'} · ${color === 'white' ? 'brancas' : 'pretas'}`;
  byId('top-player').textContent = playerLabel(top);
  byId('bottom-player').textContent = playerLabel(bottom);
  document.querySelector('.vertical-eval')?.classList.toggle('reversed', bottom === 'black');
  const dots = document.querySelectorAll('.piece-dot');
  dots[0]?.setAttribute('class', `piece-dot ${top === 'white' ? 'white-piece' : 'black-piece'}`);
  dots[1]?.setAttribute('class', `piece-dot ${bottom === 'white' ? 'white-piece' : 'black-piece'}`);

  els.status.textContent = error || statusText();
  els.evaluation.textContent = evaluation || 'Aguardando avaliação da engine.';
  els.undo.disabled = thinking || history.length < (human === 'white' ? 1 : 2);
  reviewButton.disabled = thinking || history.length === 0;
  byId('training-replay').hidden = thinking || history.length === 0;
  byId<HTMLInputElement>('train-range').max = String(history.length);
  if (chess.isGameOver() && autoReviewedGame !== gameId) {
    autoReviewedGame = gameId;
    queueMicrotask(() => reviewButton.click());
  }
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const totals = { w: 0, b: 0 };
  for (const rank of chess.board())
    for (const piece of rank) if (piece) totals[piece.color] += values[piece.type]!;
  const diff = totals.w - totals.b;
  material.textContent = `Material: brancas ${totals.w} · pretas ${totals.b} · ${diff === 0 ? 'equilibrado' : `${diff > 0 ? 'brancas' : 'pretas'} +${Math.abs(diff)}`} (P=1 C/B=3 T=5 D=9)`;

  const items: HTMLLIElement[] = [];
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li');
    li.textContent = history[i + 1] ? `${history[i]!.san}  ${history[i + 1]!.san}` : history[i]!.san;
    items.push(li);
  }
  els.moves.replaceChildren(...items);
  els.moves.scrollTop = els.moves.scrollHeight;
}

/** Avaliação sempre do ponto de vista das brancas; o motor informa do ponto de vista dele. */
function formatEvaluation(score: Score | null, depth: number): string {
  if (!score) return '';
  const value = human === 'black' ? score.value : -score.value;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const text =
    score.unit === 'mate' ? `${sign}M${Math.abs(value)}` : `${sign}${(Math.abs(value) / 100).toFixed(2)}`;
  return `Avaliação (brancas): ${text} · profundidade ${depth}`;
}

async function engineMove(): Promise<void> {
  const id = gameId;
  thinking = true;
  error = '';
  sync();
  try {
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        moves: chess.history({ verbose: true }).map((m) => m.lan),
        movetime: Number(els.movetime.value),
        book: byId<HTMLInputElement>('opening-book').checked,
      }),
    });
    const data = (await res.json()) as SearchResult | { error: string };
    if (id !== gameId) return;
    if ('error' in data) throw new Error(data.error);
    const { bestmove } = data;
    const played = chess.move({
      from: bestmove.slice(0, 2),
      to: bestmove.slice(2, 4),
      promotion: bestmove[4],
    });
    moveSound(played);
    evaluation = formatEvaluation(data.score, data.depth);
    if (data.source === 'book') evaluation = 'Jogada do repertório local preparado.';
    predicted = data.ponder;
    if (prepare.checked && predicted && !chess.isGameOver()) {
      const moves = chess.history({ verbose: true }).map((m) => m.lan);
      const validation = new Chess(chess.fen());
      try {
        validation.move(predicted);
        await fetch('/api/prepare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ moves: [...moves, predicted] }),
        });
        byId('prepare-status').textContent =
          `Calculando após sua possível resposta ${predicted}. A resposta real será validada.`;
      } catch {
        byId('prepare-status').textContent = 'Sem previsão válida nesta posição.';
      }
    }
    if (data.score)
      updateBar(
        (data.score.unit === 'cp' ? data.score.value : Math.sign(data.score.value || 1) * 10000) *
          (human === 'black' ? 1 : -1),
      );
  } catch (err) {
    if (id === gameId) error = `Erro ao consultar a IA: ${(err as Error).message}`;
  } finally {
    if (id === gameId) {
      thinking = false;
      sync();
      if (premove.checked && !chess.isGameOver()) cg.playPremove();
    }
  }
}

function choosePromotion(): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  els.promotion.returnValue = '';
  els.promotion.addEventListener('close', () => resolve(els.promotion.returnValue || 'q'), { once: true });
  els.promotion.showModal();
  return promise;
}

async function onHumanMove(orig: Key, dest: Key): Promise<void> {
  if (trainingPly !== null || thinking || turnColor() !== human || chess.isGameOver()) return;
  clearReview();
  byId('prepare-status').textContent = 'Recebendo a jogada real…';
  const piece = chess.get(orig as Square);
  const promotion =
    piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? await choosePromotion() : undefined;
  const played = chess.move({ from: orig, to: dest, promotion });
  moveSound(played);
  sync();
  if (!chess.isGameOver()) await engineMove();
}

async function newGame(): Promise<void> {
  const id = ++gameId;
  const choice = els.color.value;
  human = choice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : (choice as Color);
  chess.reset();
  thinking = false;
  evaluation = '';
  error = '';
  clearReview();
  updateBar(0);
  cg.cancelPremove();
  predicted = undefined;
  byId('prepare-status').textContent = 'Aguardando primeira previsão da engine.';
  cg.set({ orientation: human, viewOnly: false });
  sync();
  try {
    const res = await fetch('/api/newgame', { method: 'POST' });
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

els.newGame.addEventListener('click', () => void newGame());
els.flip.addEventListener('click', () => {
  cg.toggleOrientation();
  sync();
});
els.undo.addEventListener('click', () => {
  if (thinking) return;
  // Volta até ser a vez do jogador: desfaz a resposta da IA e o lance do jogador.
  do chess.undo();
  while (chess.history().length > 0 && turnColor() !== human);
  evaluation = '';
  error = '';
  clearReview();
  updateBar(0);
  cg.cancelPremove();
  sync();
});

premove.addEventListener('change', () => {
  if (!premove.checked) cg.cancelPremove();
  sync();
});
prepare.addEventListener('change', () => {
  if (!prepare.checked)
    void fetch('/api/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
  byId('prepare-status').textContent = prepare.checked
    ? 'Será ativada após a próxima jogada da IA.'
    : 'Preparação desligada.';
});
byId('export-pgn').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([chess.pgn()], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'partida.pgn';
  a.click();
  URL.revokeObjectURL(url);
});
byId<HTMLInputElement>('import-pgn').addEventListener(
  'change',
  (event) =>
    void (async () => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file || thinking) return;
      try {
        const text = await file.text();
        const validated = new Chess();
        validated.loadPgn(text);
        await fetch('/api/prepare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        });
        gameId++;
        clearReview();
        chess.loadPgn(text);
        evaluation = '';
        error = '';
        updateBar(0);
        sync();
      } catch (err) {
        error = `Não foi possível abrir PGN: ${(err as Error).message}`;
        sync();
      } finally {
        input.value = '';
      }
    })(),
);
reviewButton.addEventListener(
  'click',
  () =>
    void (async () => {
      const id = ++reviewId;
      const moves = chess.history({ verbose: true }).map((m) => m.lan);
      reviewButton.disabled = true;
      byId('review-status').textContent = 'Analisando posições… cerca de 0,3 s por posição.';
      try {
        await fetch('/api/prepare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        });
        const response = await fetch('/api/review', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ moves }),
        });
        const data = (await response.json()) as { error?: string; rows?: typeof trainingReview };
        if (id !== reviewId) return;
        if (!response.ok || !data.rows) throw new Error(data.error ?? 'Falha de análise');
        trainingReview = data.rows;
        byId('review-rows').replaceChildren(
          ...data.rows.map((row) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            const icons: Record<string, string> = {
              Melhor: '★',
              Excelente: '!',
              Boa: '✓',
              Imprecisão: '?!',
              Erro: '?',
              Gafe: '??',
            };
            button.className = 'move-chip';
            button.dataset.grade = row.label;
            button.textContent = `${icons[row.label] ?? '·'} ${row.san} · ${row.label} · ${row.lossCp ?? '?'} cp`;
            button.addEventListener('click', () => trainingReplay(row.ply));
            li.append(button);
            return li;
          }),
        );
        const points = data.rows
          .filter((r) => r.whiteCp !== null)
          .map((r) => `${(r.ply / Math.max(1, moves.length)) * 300},${45 - 42 * Math.tanh(r.whiteCp! / 400)}`)
          .join(' ');
        byId('score-line').setAttribute('points', points);
        byId('review-status').textContent =
          'Análise concluída. Acima da linha: vantagem branca. Classificação aproximada por perda de avaliação.';
      } catch (err) {
        if (id === reviewId) byId('review-status').textContent = (err as Error).message;
      } finally {
        if (id === reviewId) reviewButton.disabled = false;
      }
    })(),
);
byId('train-prev').addEventListener('click', () =>
  trainingReplay((trainingPly ?? chess.history().length) - 1),
);
byId('train-next').addEventListener('click', () =>
  trainingReplay((trainingPly ?? chess.history().length) + 1),
);
byId('train-live').addEventListener('click', () => trainingReplay(null));
byId('train-range').addEventListener('input', (e) =>
  trainingReplay(Number((e.target as HTMLInputElement).value)),
);

try {
  const info = (await (await fetch('/api/info')).json()) as {
    engine: string;
    candidate: string;
    threads: number;
    syzygy: boolean;
  };
  els.engineName.textContent = `${info.candidate} | ${info.engine} · ${info.threads} threads${info.syzygy ? ' · Syzygy local ativo' : ''}`;
} catch {
  els.engineName.textContent = 'Servidor indisponível';
}
await newGame();
