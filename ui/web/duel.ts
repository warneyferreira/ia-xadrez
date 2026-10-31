import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import { ChessSounds } from './sounds.ts';

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
  capture: boolean;
  check: boolean;
  castle: boolean;
  promotion: boolean;
};
type State = {
  phase: string;
  arenaBusy?: boolean;
  busy: boolean;
  fen: string;
  turn: string;
  rows: Row[];
  whiteName: string;
  blackName: string;
  whiteProfile: string;
  blackProfile: string;
  error: string | null;
  outcome: string | null;
  pgn: string;
  note: string;
  points: { white: number; black: number } | null;
  memory: { availableBytes: number };
  movetime: number;
  memoryProfile: string;
  arthurWhite: boolean;
  useBook: boolean;
  id: string;
  elapsedMillis: number;
  whiteSearchMillis: number;
  blackSearchMillis: number;
  whiteRemaining: number;
  blackRemaining: number;
  timeMode: string;
  arthurCandidate: string;
  opponentCandidate: string;
  liveSearch: {
    depth: number;
    nodes?: number;
    nps?: number;
    tbhits?: number;
    hashfull?: number;
    score: { unit: 'cp' | 'mate'; value: number } | null;
  } | null;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const board = Chessground(el('board'), {
  viewOnly: true,
  coordinates: true,
  animation: { enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 160 },
});
let current: State | null = null;
let count = -1;
let pending = false;
let localError = '';
const sounds = new ChessSounds(el<HTMLButtonElement>('sound-toggle'));
type Judged = {
  ply: number;
  label: string;
  explanation: string;
  lossCp: number | null;
  whiteCp: number | null;
};
let judgments: Judged[] = [];
let replayPly: number | null = null;
let analysisKey = '';
let reviewPolling = false;
let seenId = '';
let catalog: {
  aliases: Record<string, string>;
  candidates: { id: string; label: string; owner: string; book: boolean }[];
} = { aliases: {}, candidates: [] };
function selectedCandidate(selectId: string) {
  const id = el<HTMLSelectElement>(selectId).value;
  return catalog.candidates.find((c) => c.id === (catalog.aliases[id] ?? id));
}
function bookAvailability(locked = false) {
  const candidate = selectedCandidate('primary-candidate');
  const input = el<HTMLInputElement>('duel-book');
  input.disabled = locked || !candidate?.book;
  if (!candidate?.book) input.checked = false;
  el('book-availability').textContent = candidate?.book
    ? 'Repertório preliminar. Desative para comparar apenas os motores.'
    : 'Este candidato joga sem repertório: as aberturas preparadas ainda precisam passar pela validação em partidas.';
}
function timeControls(locked = false) {
  const competition = el<HTMLSelectElement>('time-mode').value === '25+0';
  el('move-time-setting').hidden = competition;
  el<HTMLSelectElement>('duel-time').disabled = locked || competition;
  el('time-mode-help').textContent = competition
    ? '25 minutos para todas as jogadas de cada lado. A IA administra o relógio; o primeiro lance pode levar dezenas de segundos. O limite fixo por lance não se aplica.'
    : 'Tempo fixo por lance, útil para observar partidas rápidas. Um teste com 0,25 s não representa o ritmo do campeonato.';
}
function paintLive(state: State) {
  if (replayPly !== null || state.phase !== 'running') return;
  const live = state.liveSearch;
  el('depth').textContent = live ? `Busca ao vivo · prof. ${live.depth}` : 'Motor iniciando a busca…';
  if (!live) return;
  el('tablebase').textContent =
    `Nesta busca · ${(live.nodes ?? 0).toLocaleString('pt-BR')} nós · ${(live.nps ?? 0).toLocaleString('pt-BR')} nós/s · Syzygy ${live.tbhits ?? 0} · Hash ${live.hashfull === undefined ? '—' : (live.hashfull / 10).toFixed(1) + '%'}`;
  if (live.score) {
    const score = live.score.unit === 'cp' ? live.score.value : Math.sign(live.score.value || 1) * 10000;
    const cp = score * (state.turn === 'w' ? 1 : -1);
    el('evaluation').textContent =
      `Brancas ${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)} · estimativa da busca em andamento`;
    el('eval-fill').style.height = `${50 + 50 * Math.tanh(cp / 400)}%`;
    el('eval-number').textContent = `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
  }
}
const icons: Record<string, string> = {
  Livro: '▤',
  Melhor: '★',
  Excelente: '!',
  Boa: '✓',
  Imprecisão: '?!',
  Erro: '?',
  Gafe: '??',
};
const clock = (ms: number) =>
  `${Math.floor(Math.max(0, ms) / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((Math.max(0, ms) / 1000) % 60)
    .toString()
    .padStart(2, '0')}`;

function soundFor(row: Row) {
  sounds.play(
    row.promotion
      ? 'promotion'
      : row.check
        ? 'check'
        : row.castle
          ? 'castle'
          : row.capture
            ? 'capture'
            : 'move',
  );
}
function selectPly(ply: number | null) {
  if (!current) return;
  replayPly = ply === null ? null : Math.max(0, Math.min(current.rows.length, ply));
  const selected = replayPly ?? current.rows.length;
  const row = current.rows[selected - 1];
  const fen = selected ? row!.fen : new Chess().fen();
  board.set({
    fen,
    turnColor: new Chess(fen).turn() === 'w' ? 'white' : 'black',
    check: new Chess(fen).inCheck(),
    lastMove: row ? [row.uci.slice(0, 2) as 'a1', row.uci.slice(2, 4) as 'a1'] : undefined,
  });
  el<HTMLInputElement>('replay-range').value = String(selected);
  el('replay-label').textContent =
    replayPly === null ? 'Ao vivo' : `Lance ${selected}/${current.rows.length}`;
  const judged = judgments.find((r) => r.ply === selected);
  el('move-explanation').textContent = judged
    ? `${icons[judged.label] ?? '·'} ${judged.label} · ${judged.explanation}`
    : row
      ? `${row.san} · ${row.source}. ${row.source === 'Repertório' ? 'Jogada escolhida da preparação local.' : 'Solicite a análise posterior para comparação com alternativas.'}`
      : 'Posição inicial da partida.';
  const cp = judged?.whiteCp ?? row?.whiteCp;
  el('eval-fill').style.height = `${cp == null ? 50 : 50 + 50 * Math.tanh(cp / 400)}%`;
  el('eval-number').textContent = cp == null ? '—' : `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
  el('evaluation').textContent =
    cp == null
      ? 'Sem avaliação para a posição selecionada.'
      : `Brancas ${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)} · ${judged ? 'análise posterior' : 'estimativa durante a busca'}`;
  el('depth').textContent = row ? `${row.source} · prof. ${row.depth}` : 'Posição inicial';
  el('tablebase').textContent =
    `Syzygy nesta busca: ${row?.tbhits ?? 0} · nós: ${(row?.nodes ?? 0).toLocaleString('pt-BR')} · NPS: ${(row?.nps ?? 0).toLocaleString('pt-BR')} · Hash ocupado: ${row?.hashfull === undefined ? '—' : (row.hashfull / 10).toFixed(1) + '%'}`;
  const totals = { w: 0, b: 0 },
    values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  for (const rank of new Chess(fen).board())
    for (const piece of rank) if (piece) totals[piece.color] += values[piece.type];
  el('material').textContent =
    `Material · brancas ${totals.w} / pretas ${totals.b} · diferença ${totals.w - totals.b > 0 ? '+' : ''}${totals.w - totals.b} para brancas`;
  if (row && replayPly !== null) soundFor(row);
}

async function analyse() {
  if (!current || reviewPolling) return;
  reviewPolling = true;
  el<HTMLButtonElement>('analyse-duel').disabled = true;
  try {
    const response = await fetch('/api/duel/review/start', { method: 'POST' });
    let job = await response.json();
    if (!response.ok) throw new Error(job.error ?? 'Não foi possível analisar.');
    const key = job.key;
    while (job.status === 'running') {
      el('analysis-progress').textContent =
        `Analisando ${job.completed}/${job.total} posições · processo separado da partida.`;
      await new Promise((resolve) => setTimeout(resolve, 500));
      job = await (await fetch('/api/duel/review/status')).json();
      if (job.key !== key) return;
    }
    if (job.status === 'error') throw new Error(job.error);
    judgments = job.rows;
    el('analysis-progress').textContent =
      `Análise concluída: ${judgments.length} jogadas. Explicações factuais e estimativas de uma busca limitada.`;
    count = -1;
    if (current) render(current);
    selectPly(replayPly);
  } catch (err) {
    el('analysis-progress').textContent = (err as Error).message;
  } finally {
    reviewPolling = false;
    el<HTMLButtonElement>('analyse-duel').disabled = false;
    if (current) render(current);
  }
}

function render(state: State) {
  const first = current === null;
  const previousPhase = current?.phase;
  const previousCount = current?.rows.length ?? 0;
  if (seenId !== state.id) {
    seenId = state.id;
    judgments = [];
    replayPly = null;
    count = -1;
    analysisKey = '';
  }
  current = state;
  if (first) {
    el<HTMLInputElement>('white-input').value = state.whiteName;
    el<HTMLInputElement>('black-input').value = state.blackName;
    el<HTMLSelectElement>('duel-time').value = String(state.movetime);
    el<HTMLSelectElement>('memory-profile').value = state.memoryProfile;
    el<HTMLSelectElement>('arthur-side').value = state.arthurWhite ? 'white' : 'black';
    el<HTMLInputElement>('duel-book').checked = state.useBook;
    el<HTMLSelectElement>('time-mode').value = state.timeMode;
    el<HTMLSelectElement>('primary-candidate').value = state.arthurCandidate;
    el<HTMLSelectElement>('opponent-candidate').value = state.opponentCandidate;
  }
  el('white-name').textContent = `${state.whiteName} · brancas`;
  el('black-name').textContent = `${state.blackName} · pretas`;
  el('white-profile').textContent = state.whiteProfile;
  el('black-profile').textContent = state.blackProfile;
  el('duel-note').textContent = state.note;
  const selected = el<HTMLSelectElement>('memory-profile').value;
  const requestedGB = ({ balanced: 0.25, strong: 2, maximum: 10 } as Record<string, number>)[selected]!;
  el('memory-budget').textContent =
    `RAM livre agora: ${(state.memory.availableBytes / 2 ** 30).toFixed(1)} GB · Hash solicitado: ${requestedGB} GB + reserva de 1,1 GB.`;
  el('live').textContent =
    (
      {
        running: '● AO VIVO',
        starting: 'PREPARANDO',
        paused: 'PAUSADO',
        finished: 'ENCERRADO',
        error: 'FALHA',
      } as Record<string, string>
    )[state.phase] ?? 'PRONTO';
  el('duel-status').textContent =
    state.outcome ??
    (state.phase === 'running'
      ? `${state.turn === 'w' ? state.whiteName : state.blackName} está calculando…`
      : state.phase === 'paused'
        ? 'Duelo pausado. Você pode continuar da mesma posição.'
        : state.phase === 'starting'
          ? 'Preparando as engines…'
          : state.phase === 'error'
            ? 'Duelo interrompido. Confira o erro antes de recomeçar.'
            : 'Configure os nomes e inicie o duelo.');
  el('duel-error').textContent = state.error ?? localError;
  el('elapsed').textContent = clock(state.elapsedMillis);
  el('white-time').textContent = clock(
    state.timeMode === '25+0' ? state.whiteRemaining : state.whiteSearchMillis,
  );
  el('black-time').textContent = clock(
    state.timeMode === '25+0' ? state.blackRemaining : state.blackSearchMillis,
  );
  el('time-caption').textContent =
    state.timeMode === '25+0'
      ? 'Relógios restantes · controle 25+0.'
      : 'Tempo de cálculo acumulado por lado · duração ativa exclui pausas.';
  el('result-banner').hidden = state.phase !== 'finished';
  if (state.outcome) {
    el('winner').textContent = state.outcome.startsWith('1-0')
      ? `${state.whiteName} venceu`
      : state.outcome.startsWith('0-1')
        ? `${state.blackName} venceu`
        : 'Partida empatada';
    el('result-reason').textContent = state.outcome;
    el('result-points').textContent = state.points
      ? `${state.whiteName}: ${state.points.white} pontos · ${state.blackName}: ${state.points.black} pontos`
      : '';
    if (previousPhase === 'running') sounds.play('end');
  }
  el('replay-panel').hidden = !['paused', 'finished'].includes(state.phase);
  el<HTMLInputElement>('replay-range').max = String(state.rows.length);
  el<HTMLButtonElement>('analyse-duel').disabled = reviewPolling || state.busy || !!state.arenaBusy;
  if (state.phase === 'running') replayPly = null;
  if (state.phase === 'finished' && analysisKey !== `${state.id}:${state.rows.length}`) {
    analysisKey = `${state.id}:${state.rows.length}`;
    void analyse();
  }
  el('competition-score').textContent = state.points
    ? `Pontos desta partida: ${state.whiteName} ${state.points.white} · ${state.blackName} ${state.points.black}`
    : 'Pontuação do regulamento: vitória 3 · empate 1 · derrota 0.';
  const active = state.phase === 'running' || state.phase === 'starting' || state.busy;
  el<HTMLButtonElement>('start').disabled = active || pending || reviewPolling || !!state.arenaBusy;
  el('arena-reservation').textContent = state.arenaBusy
    ? 'Uma bateria está rodando. Novos duelos e análises aguardam para preservar o teste; acompanhe em Arena de testes.'
    : '';
  el<HTMLButtonElement>('pause').disabled = state.phase !== 'running';
  el<HTMLButtonElement>('resume').disabled =
    state.phase !== 'paused' || state.busy || pending || reviewPolling || !!state.arenaBusy;
  for (const id of [
    'white-input',
    'black-input',
    'arthur-side',
    'duel-time',
    'duel-book',
    'memory-profile',
    'time-mode',
    'primary-candidate',
    'opponent-candidate',
  ])
    (el(id) as HTMLInputElement).disabled = active || reviewPolling;
  bookAvailability(active || reviewPolling);
  timeControls(active || reviewPolling);
  el<HTMLButtonElement>('save').disabled = state.rows.length === 0;
  if (count === state.rows.length) {
    paintLive(state);
    return;
  }
  count = state.rows.length;
  const last = state.rows.at(-1);
  if (last && state.rows.length > previousCount && previousCount > 0 && replayPly === null) soundFor(last);
  selectPly(replayPly);
  const cp = [...state.rows].reverse().find((r) => r.whiteCp !== null)?.whiteCp;
  const percent = cp === undefined || cp === null ? 50 : 50 + 50 * Math.tanh(cp / 400);
  el('eval-fill').style.height = `${percent}%`;
  document.querySelector('[role=meter]')?.setAttribute('aria-valuenow', String(Math.round(percent)));
  el('eval-number').textContent =
    cp === undefined || cp === null ? '—' : `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
  el('evaluation').textContent =
    cp === undefined || cp === null
      ? 'Aguardando avaliação de busca.'
      : `Brancas ${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)} · estimativa da busca mais recente`;
  el('depth').textContent = last ? `${last.source} · prof. ${last.depth}` : 'Aguardando busca';
  el('tablebase').textContent = `Consultas Syzygy na última busca: ${last?.tbhits ?? 0}`;
  const totals = { w: 0, b: 0 };
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  for (const rank of new Chess(state.fen).board())
    for (const piece of rank) if (piece) totals[piece.color] += values[piece.type];
  el('material').textContent =
    `Material · brancas ${totals.w} / pretas ${totals.b} · diferença ${totals.w - totals.b > 0 ? '+' : ''}${totals.w - totals.b} para brancas`;
  el('score-line').setAttribute(
    'points',
    state.rows
      .flatMap((r, i) =>
        r.whiteCp === null
          ? []
          : [`${(i / Math.max(1, count - 1)) * 300},${45 - 42 * Math.tanh(r.whiteCp / 400)}`],
      )
      .join(' '),
  );
  const list = el('duel-moves');
  const follow = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.replaceChildren(
    ...state.rows.map((r, i) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      const judged = judgments.find((j) => j.ply === i + 1);
      const label = judged?.label ?? (r.source === 'Repertório' ? 'Livro' : 'Aguardando análise');
      button.textContent = `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${r.san} ${icons[label] ?? '·'}`;
      button.className = 'move-chip';
      button.dataset.grade = label;
      button.title = `${label} · ${Math.round(r.elapsedMillis)} ms · ${r.nodes ?? '—'} nós`;
      button.disabled = !['paused', 'finished'].includes(state.phase);
      button.addEventListener('click', () => selectPly(i + 1));
      li.append(button);
      return li;
    }),
  );
  el('performance-summary').textContent =
    `${state.rows.length} meios-lances · ${state.rows.reduce((s, r) => s + (r.nodes ?? 0), 0).toLocaleString('pt-BR')} nós · ${state.rows.reduce((s, r) => s + r.tbhits, 0)} consultas Syzygy somadas.`;
  if (follow) list.scrollTop = list.scrollHeight;
  selectPly(replayPly);
  paintLive(state);
}

async function api(path: string, body?: object) {
  const res = await fetch(
    path,
    body === undefined
      ? undefined
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as State;
}
async function command(path: string, body = {}) {
  if (pending) return;
  pending = true;
  el<HTMLButtonElement>('start').disabled = true;
  localError = '';
  if (path === '/api/duel/start') {
    el('live').textContent = 'PREPARANDO';
    el('duel-status').textContent = 'Preparando as engines e conferindo os recursos do novo duelo…';
    el('result-banner').hidden = true;
  }
  try {
    render(await api(path, body));
  } catch (err) {
    localError = (err as Error).message;
    el('duel-error').textContent = localError;
  } finally {
    pending = false;
    if (current) render(current);
    if (current)
      el<HTMLButtonElement>('start').disabled =
        current.busy || ['running', 'starting'].includes(current.phase) || !!current.arenaBusy;
  }
}
el('duel-form').addEventListener('submit', (e) => {
  e.preventDefault();
  count = -1;
  void command('/api/duel/start', {
    whiteName: el<HTMLInputElement>('white-input').value,
    blackName: el<HTMLInputElement>('black-input').value,
    arthurWhite: el<HTMLSelectElement>('arthur-side').value === 'white',
    movetime: Number(el<HTMLSelectElement>('duel-time').value),
    useBook: el<HTMLInputElement>('duel-book').checked,
    memoryProfile: el<HTMLSelectElement>('memory-profile').value,
    timeMode: el<HTMLSelectElement>('time-mode').value,
    arthurCandidate: el<HTMLSelectElement>('primary-candidate').value,
    opponentCandidate: el<HTMLSelectElement>('opponent-candidate').value,
  });
});
el('pause').addEventListener('click', () => void command('/api/duel/pause'));
el('time-mode').addEventListener('change', () => timeControls());
el('arthur-side').addEventListener('change', () => {
  const white = el<HTMLInputElement>('white-input');
  const black = el<HTMLInputElement>('black-input');
  [white.value, black.value] = [black.value, white.value];
});
el('resume').addEventListener('click', () => void command('/api/duel/resume'));
el('save').addEventListener('click', () => {
  if (!current) return;
  const url = URL.createObjectURL(new Blob([current.pgn], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'duelo.pgn';
  a.click();
  URL.revokeObjectURL(url);
});
el('replay-first').addEventListener('click', () => selectPly(0));
el('replay-prev').addEventListener('click', () => selectPly((replayPly ?? current?.rows.length ?? 0) - 1));
el('replay-next').addEventListener('click', () => selectPly((replayPly ?? current?.rows.length ?? 0) + 1));
el('replay-last').addEventListener('click', () => selectPly(current?.rows.length ?? 0));
el('replay-live').addEventListener('click', () => selectPly(null));
el('replay-range').addEventListener('input', (e) => selectPly(Number((e.target as HTMLInputElement).value)));
el('analyse-duel').addEventListener('click', () => void analyse());
el('save-report').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = '/api/duel/report';
  link.download = 'relatorio.json';
  link.click();
});
async function loadCandidates() {
  const data = (await (await fetch('/api/candidates')).json()) as typeof catalog;
  catalog = data;
  for (const [id, owner] of [
    ['primary-candidate', 'arthur'],
    ['opponent-candidate', 'vanderlei'],
  ]) {
    const select = el<HTMLSelectElement>(id!);
    select.replaceChildren(
      ...Object.keys(data.aliases).map((alias) => new Option(`${alias} → ${data.aliases[alias]}`, alias)),
      ...data.candidates.map((c) => new Option(`${c.label} [${c.id}]`, c.id)),
    );
    select.value = `${owner}-latest`;
  }
}
for (const [selectId, primary] of [
  ['primary-candidate', true],
  ['opponent-candidate', false],
] as const) {
  el(selectId).addEventListener('change', () => {
    const candidate = selectedCandidate(selectId);
    const primaryWhite = el<HTMLSelectElement>('arthur-side').value === 'white';
    if (candidate)
      el<HTMLInputElement>(primary === primaryWhite ? 'white-input' : 'black-input').value = candidate.label;
    bookAvailability();
  });
}
async function poll() {
  try {
    if (!pending) render(await api('/api/duel/status'));
  } catch {
    el('duel-error').textContent =
      'Conexão interrompida. Tentando reconectar; a partida continua no servidor.';
  } finally {
    setTimeout(() => void poll(), document.hidden ? 1500 : 300);
  }
}
void loadCandidates()
  .catch((err) => {
    localError = `Falha ao carregar candidatos: ${(err as Error).message}`;
  })
  .finally(() => void poll());
