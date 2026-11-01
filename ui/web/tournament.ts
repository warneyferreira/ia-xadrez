import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import { ChessSounds } from './sounds.ts';

type State = {
  arenaBusy?: boolean;
  phase: string;
  engineColor: 'white' | 'black' | null;
  turn: string;
  fen: string;
  moves: string[];
  san: string[];
  whiteMillis: number;
  blackMillis: number;
  elapsedMillis: number;
  initialMillis: number;
  timePolicy: { overheadMillis: number; operationMillis?: number; observedMoves: number };
  search: { depth: number; nps?: number; nodes?: number } | null;
  controller: {
    enabled: boolean;
    thinking: boolean;
    expected: string | null;
    depth: number | null;
    hits: number;
    attempts: number;
    forcedReplies: number;
  };
  engineConfiguration: { name: string; threads: number; hashMB: number; tournamentCriticalTime?: boolean };
  running: string | null;
  pending: {
    bestmove: string;
    depth: number;
    score: { unit: string; value: number } | null;
    nps?: number;
    source?: string;
    ponderMillis?: number;
  } | null;
  error: string | null;
  outcome: string | null;
  pgn: string;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const sounds = new ChessSounds(el<HTMLButtonElement>('sound-toggle'));
const board = Chessground(el('physical-board'), {
  viewOnly: true,
  animation: { enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 160 },
});
let state: State | null = null;
let actionPending = false,
  refreshing = false,
  revision = 0;
let localError = '';
const clock = (ms: number) =>
  `${Math.floor(Math.max(0, ms) / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((Math.max(0, ms) / 1000) % 60)
    .toString()
    .padStart(2, '0')}`;
const instructions: Record<string, string> = {
  idle: '1. Prepare a cor e o tempo da nossa IA.',
  ready: 'Partida preparada. Inicie junto com o relógio físico.',
  'engine-thinking': 'Calculando a nossa resposta. Aguarde.',
  'awaiting-engine-confirmation': 'Mova a peça indicada, pressione o relógio físico e confirme na tela.',
  'awaiting-opponent': 'É a vez do adversário. Registre o lance quando ele jogar.',
  finished: 'Sessão encerrada. Salve o PGN antes de preparar outra rodada.',
  error: 'Falha operacional. Confira o tabuleiro e siga a orientação do árbitro.',
};

function sync(next: State) {
  const previous = state;
  state = next;
  if (!previous && next.phase !== 'idle') {
    el<HTMLSelectElement>('engine-color').value = next.engineColor ?? 'white';
    const time = el<HTMLSelectElement>('initial-time');
    if (![...time.options].some((o) => o.value === String(next.initialMillis)))
      time.add(new Option(`${next.initialMillis / 60000} minutos · ensaio`, String(next.initialMillis)));
    time.value = String(next.initialMillis);
    el<HTMLInputElement>('ponder-enabled').checked = next.controller.enabled;
  }
  el('white-clock').textContent = clock(
    Math.ceil((next.phase === 'idle' ? next.initialMillis : next.whiteMillis) / 1000) * 1000,
  );
  el('black-clock').textContent = clock(
    Math.ceil((next.phase === 'idle' ? next.initialMillis : next.blackMillis) / 1000) * 1000,
  );
  el('total-clock').textContent = clock(next.elapsedMillis);
  el('physical-time-control').textContent =
    `${Math.floor(next.initialMillis / 60000)}+0 · ${next.initialMillis === 1500000 ? 'OFICIAL' : 'ENSAIO'}`;
  el('time-policy').textContent =
    `Margem de operação: ${((next.timePolicy.operationMillis ?? next.timePolicy.overheadMillis) / 1000).toFixed(1)} s por lance · ${next.timePolicy.observedMoves ? 'ajustada às suas confirmações' : 'estimativa inicial'}. A busca reserva tempo para mover a peça e pressionar o relógio.`;
  el('engine-configuration').textContent =
    `${next.engineConfiguration.name} · ${next.engineConfiguration.threads} threads · Hash ${next.engineConfiguration.hashMB} MB${next.engineConfiguration.tournamentCriticalTime ? ' · tempo crítico experimental ativo' : ''}. Lance único legal tem resposta imediata.`;
  el('ponder-status').textContent = next.controller.thinking
    ? `Pensando durante a vez adversária · previsão ${next.controller.expected} · profundidade ${next.controller.depth ?? '…'}. Aguardando o lance real.`
    : next.controller.enabled
      ? `Ponder ativo · ${next.controller.hits} previsões confirmadas / ${next.controller.attempts} tentativas. Respostas forçadas imediatas: ${next.controller.forcedReplies}.`
      : 'Ponder desligado. Respostas forçadas imediatas continuam disponíveis.';
  const instruction = next.outcome ?? instructions[next.phase] ?? next.phase;
  if (el('phase').textContent !== instruction) el('phase').textContent = instruction;
  el('running-side').textContent = next.running
    ? `Relógio espelhado em andamento: ${next.running === 'white' ? 'brancas' : 'pretas'}`
    : 'Relógios parados';
  const error = next.error ?? localError;
  el('error').hidden = !error;
  el('error').textContent = error;
  el('fen').textContent = `FEN: ${next.fen}`;
  let san = '';
  if (next.pending) {
    try {
      san = new Chess(next.fen).move(next.pending.bestmove).san;
    } catch {
      san = next.pending.bestmove;
    }
  }
  el('engine-move').textContent = next.pending
    ? `${next.pending.bestmove.slice(0, 2)} → ${next.pending.bestmove.slice(2, 4)}${next.pending.bestmove[4] ? ` = ${next.pending.bestmove[4].toUpperCase()}` : ''}`
    : '—';
  el('engine-detail').textContent = next.pending
    ? next.pending.source === 'book'
      ? `${san} · resposta preparada offline; sem nova busca. Confira a jogada no tabuleiro.`
      : next.pending.source === 'forced'
        ? `${san} · único lance legal; sem gastar tempo em nova busca.`
        : `${san} · profundidade ${next.pending.depth}${next.pending.nps ? ` · ${next.pending.nps.toLocaleString('pt-BR')} nós/s` : ''}${next.pending.source === 'ponder-hit' ? ` · cálculo antecipado reaproveitado (${((next.pending.ponderMillis ?? 0) / 1000).toFixed(1)} s)` : ''}`
    : next.search && next.phase === 'engine-thinking'
      ? `Calculando agora · profundidade ${next.search.depth} · ${(next.search.nodes ?? 0).toLocaleString('pt-BR')} nós`
      : 'Aguardando a vez da nossa IA.';
  board.set({
    fen: next.fen,
    orientation: next.engineColor ?? 'white',
    check: new Chess(next.fen).inCheck(),
    drawable: {
      autoShapes: next.pending
        ? [
            {
              orig: next.pending.bestmove.slice(0, 2) as Key,
              dest: next.pending.bestmove.slice(2, 4) as Key,
              brush: 'green',
            },
          ]
        : [],
    },
  });
  if (previous && next.moves.length > previous.moves.length) {
    const history = new Chess();
    let move;
    for (const uci of next.moves) move = history.move(uci);
    if (move)
      sounds.play(
        next.outcome
          ? 'end'
          : history.inCheck()
            ? 'check'
            : move.isKingsideCastle() || move.isQueensideCastle()
              ? 'castle'
              : move.promotion
                ? 'promotion'
                : move.captured
                  ? 'capture'
                  : 'move',
      );
  } else if (previous?.phase === 'engine-thinking' && next.phase === 'awaiting-engine-confirmation')
    sounds.play('move');
  if (!previous || next.moves.length !== previous.moves.length)
    el('moves').replaceChildren(
      ...next.san.map((san, i) => {
        const li = document.createElement('li');
        li.textContent = `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${san} (${next.moves[i]})`;
        return li;
      }),
    );
  el<HTMLButtonElement>('new-game').disabled =
    actionPending || !!next.arenaBusy || !['idle', 'ready', 'finished'].includes(next.phase);
  el('arena-reservation').textContent = next.arenaBusy
    ? 'A bateria de testes está usando o processador. Aguarde terminar para preparar uma partida física.'
    : '';
  el<HTMLInputElement>('ponder-enabled').disabled =
    actionPending || !['idle', 'ready', 'finished'].includes(next.phase);
  const draftChanged =
    next.phase === 'ready' &&
    (el<HTMLSelectElement>('engine-color').value !== next.engineColor ||
      Number(el<HTMLSelectElement>('initial-time').value) !== next.initialMillis ||
      el<HTMLInputElement>('ponder-enabled').checked !== next.controller.enabled);
  el<HTMLButtonElement>('start-game').disabled =
    actionPending || !!next.arenaBusy || next.phase !== 'ready' || draftChanged;
  if (draftChanged)
    el('phase').textContent = 'A preparação mudou. Clique em Preparar nova partida antes de iniciar.';
  el<HTMLInputElement>('opponent-move').disabled = actionPending || next.phase !== 'awaiting-opponent';
  el<HTMLButtonElement>('send-opponent').disabled = actionPending || next.phase !== 'awaiting-opponent';
  el<HTMLButtonElement>('confirm-engine').disabled =
    actionPending || next.phase !== 'awaiting-engine-confirmation';
  el<HTMLButtonElement>('reconcile').disabled = actionPending || next.phase === 'engine-thinking';
  if (previous?.phase !== next.phase && !['idle', 'ready'].includes(next.phase))
    el<HTMLDetailsElement>('setup-details').open = false;
  if (previous?.phase !== 'awaiting-opponent' && next.phase === 'awaiting-opponent')
    el<HTMLInputElement>('opponent-move').focus();
}

async function call(path: string, body?: object) {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as State;
}
async function command(path: string, body = {}) {
  if (actionPending) return;
  actionPending = true;
  revision++;
  localError = '';
  if (state) sync(state);
  try {
    const next = await call(path, body);
    actionPending = false;
    sync(next);
    return true;
  } catch (err) {
    localError = (err as Error).message;
    return false;
  } finally {
    actionPending = false;
    if (state) sync(state);
  }
}
el('new-game').addEventListener(
  'click',
  () =>
    void command('/api/tournament/newgame', {
      engineColor: el<HTMLSelectElement>('engine-color').value,
      initialMillis: Number(el<HTMLSelectElement>('initial-time').value),
      ponder: el<HTMLInputElement>('ponder-enabled').checked,
    }),
);
el('start-game').addEventListener('click', () => void command('/api/tournament/start'));
for (const id of ['engine-color', 'initial-time', 'ponder-enabled'])
  el(id).addEventListener('change', () => {
    if (state) sync(state);
  });
el('confirm-engine').addEventListener('click', () => void command('/api/tournament/confirm-engine-move'));
el('opponent-form').addEventListener('submit', (e) => {
  e.preventDefault();
  void (async () => {
    const ok = await command('/api/tournament/opponent-move', {
      uci: el<HTMLInputElement>('opponent-move').value.trim(),
    });
    if (ok) el<HTMLInputElement>('opponent-move').value = '';
  })();
});
el('end-session').addEventListener('click', () => {
  if (confirm('Encerrar esta sessão? O histórico ficará no log. Isso não informa um resultado ao árbitro.'))
    void command('/api/tournament/end');
});
el('reconcile').addEventListener('click', () => {
  const parse = (id: string) => {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(el<HTMLInputElement>(id).value.trim());
    if (!match) throw new Error('Use mm:ss, por exemplo 12:35.');
    return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  };
  try {
    void command('/api/tournament/reconcile', {
      whiteMillis: parse('correct-white'),
      blackMillis: parse('correct-black'),
    });
  } catch (err) {
    localError = (err as Error).message;
    if (state) sync(state);
  }
});
el('save-physical').addEventListener('click', () => {
  if (!state) return;
  const url = URL.createObjectURL(new Blob([state.pgn], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rodada-fisica.pgn';
  a.click();
  URL.revokeObjectURL(url);
});
async function refresh() {
  if (refreshing || actionPending) return;
  refreshing = true;
  const version = revision;
  try {
    const next = await call('/api/tournament/status');
    if (version === revision && !actionPending) sync(next);
  } catch (err) {
    el('error').hidden = false;
    el('error').textContent = `Sem comunicação: ${(err as Error).message}. Confira o relógio físico.`;
  } finally {
    refreshing = false;
  }
}
await refresh();
setInterval(() => void refresh(), 300);
