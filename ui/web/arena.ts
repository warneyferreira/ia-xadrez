import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type Run = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  planned: number;
  completed: number;
  game: number;
  legacy: boolean;
  incomplete: number;
  failures: number;
  developmentOverlap: boolean;
  current: {
    fen: string;
    turn: string;
    whiteRemaining: number;
    blackRemaining: number;
    thinkingSince: string;
    plies: number;
  } | null;
  candidates: {
    name: string;
    win: number;
    draw: number;
    loss: number;
    options: { Threads: number; Hash: number };
  }[];
  timeControl: { base_seconds: number; increment_seconds: number };
  note: string;
  paired: { evidenceOfSuperiority: boolean; score95: number[] | null } | null;
};
let selected = '',
  pending = false,
  actionError = '',
  latest: { busy: boolean; activeId: string | null; runs: Run[]; queue: any } | null = null;
const board = Chessground(el('arena-board'), { viewOnly: true, animation: { enabled: false } });
const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, '0')}`;
const states: Record<string, string> = {
  running: 'EM ANDAMENTO',
  finished: 'CONCLUÍDA',
  'finished-with-issues': 'ENCERRADA COM OCORRÊNCIAS',
  interrupted: 'INTERROMPIDA / SEM PROCESSO ATIVO',
};
function put(id: string, text: string) {
  if (el(id).textContent !== text) el(id).textContent = text;
}
function estimate() {
  const count = Number(el<HTMLSelectElement>('batch-games').value),
    official = el<HTMLSelectElement>('batch-time').value === 'official';
  el('batch-estimate').textContent = official
    ? `Até ${Math.floor((count * 50) / 60)} h ${(count * 50) % 60} min de relógio, mais preparação. Oito partidas são uma checagem inicial, não prova de superioridade.`
    : 'Teste rápido para procurar falhas e regressões. O resultado não substitui uma validação em 25+0.';
}
function render() {
  if (!latest) return;
  const picker = el<HTMLSelectElement>('run-picker');
  if (!selected || !latest.runs.some((r) => r.id === selected))
    selected =
      latest.activeId && latest.runs.some((r) => r.id === latest!.activeId)
        ? latest.activeId
        : (latest.runs[0]?.id ?? '');
  const signature = latest.runs.map((r) => `${r.id}:${r.status}`).join('|');
  if (picker.dataset.signature !== signature) {
    picker.replaceChildren(
      ...latest.runs.map(
        (r) =>
          new Option(
            `${states[r.status] ?? r.status} · ${r.candidates[0]?.name} × ${r.candidates[1]?.name} · ${new Date(r.startedAt).toLocaleString('pt-BR')}`,
            r.id,
          ),
      ),
    );
    picker.dataset.signature = signature;
  }
  picker.value = selected;
  const run = latest.runs.find((r) => r.id === selected);
  el('arena-empty').hidden = !!run;
  el('run-content').hidden = !run;
  put('arena-status', run ? (states[run.status] ?? run.status) : 'PRONTA');
  el<HTMLButtonElement>('batch-start').disabled = latest.busy || pending;
  el('reservation').textContent = latest.busy
    ? 'O processador está reservado para a bateria em andamento. Acompanhar esta página não reinicia os jogos.'
    : 'Ao iniciar, novos duelos e análises ficam bloqueados para preservar as condições do teste.';
  if (!run) return;
  el('completed').textContent = `${run.completed} / ${run.planned}`;
  el('elapsed').textContent =
    run.status === 'interrupted'
      ? '—'
      : clock(
          ((run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt)) / 1000,
        );
  el('arena-clock').textContent = `${run.timeControl.base_seconds / 60}+${run.timeControl.increment_seconds}`;
  const progress = el<HTMLProgressElement>('batch-progress');
  progress.max = run.planned;
  progress.value = run.completed;
  put(
    'current-game',
    run.status === 'running'
      ? `Jogo ${run.game} de ${run.planned} · ${run.current?.turn === 'white' ? 'brancas calculando' : run.current?.turn === 'black' ? 'pretas calculando' : 'partida em andamento'}`
      : run.status === 'finished'
        ? `Bateria concluída. ${run.completed} partidas registradas; resumo disponível.`
        : states[run.status]!,
  );
  el('progress-explanation').textContent =
    run.legacy && run.status === 'running'
      ? 'Esta bateria começou antes da telemetria por lance. O placar será atualizado ao fim de cada partida; em 25+0 um jogo pode durar até 50 minutos.'
      : run.status === 'running'
        ? 'Relógios e posição refletem o último registro da arena. Os resultados são contabilizados somente quando a partida termina.'
        : '';
  el('arena-position').hidden = !run.current;
  if (run.current) {
    board.set({ fen: run.current.fen, turnColor: run.current.turn === 'white' ? 'white' : 'black' });
    const delta = Math.max(0, (Date.now() - Date.parse(run.current.thinkingSince)) / 1000);
    el('arena-white-clock').textContent = clock(
      run.current.whiteRemaining - (run.current.turn === 'white' ? delta : 0),
    );
    el('arena-black-clock').textContent = clock(
      run.current.blackRemaining - (run.current.turn === 'black' ? delta : 0),
    );
    el('arena-plies').textContent = String(run.current.plies);
  }
  el('score-body').replaceChildren(
    ...run.candidates.map((c) => {
      const row = document.createElement('tr'),
        label = document.createElement('td'),
        name = document.createElement('strong'),
        options = document.createElement('small');
      name.textContent = c.name;
      options.textContent = `${c.options.Threads} threads · Hash ${c.options.Hash} MB`;
      label.append(name, options);
      row.append(label);
      for (const value of [c.win, c.draw, c.loss, c.win * 3 + c.draw]) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }),
  );
  el('evidence').textContent =
    run.note +
    (run.paired?.score95
      ? ` Intervalo conservador do escore: ${(100 * run.paired.score95[0]!).toFixed(1)}% a ${(100 * run.paired.score95[1]!).toFixed(1)}%.`
      : '');
  el('run-issues').textContent =
    `${run.failures} falhas/quedas de tempo · ${run.incomplete} partidas incompletas.${run.developmentOverlap ? ' Houve desenvolvimento em paralelo nesta série; medições de desempenho precisam de confirmação em máquina dedicada.' : ''}`;
  el<HTMLButtonElement>('download-summary').disabled = !run.finishedAt;
  el<HTMLButtonElement>('download-pgn').disabled = !run.completed;
  el('research-status').textContent = latest.queue
    ? `Próxima validação: ${latest.queue.message ?? latest.queue.stage}. Nenhum candidato é promovido automaticamente.`
    : '';
}
async function refresh() {
  try {
    const response = await fetch('/api/arena/status');
    if (!response.ok) throw new Error('Falha ao consultar a arena.');
    latest = await response.json();
    if (!pending) el('arena-error').textContent = actionError;
    render();
  } catch (err) {
    el('arena-error').textContent =
      `${(err as Error).message} Tentando reconectar; os arquivos já gravados ficam preservados.`;
  } finally {
    setTimeout(() => void refresh(), 2000);
  }
}
el('run-picker').addEventListener('change', () => {
  selected = el<HTMLSelectElement>('run-picker').value;
  render();
});
for (const id of ['batch-games', 'batch-time']) el(id).addEventListener('change', estimate);
for (const [id, file] of [
  ['download-summary', 'summary.json'],
  ['download-pgn', 'games.pgn'],
  ['download-config', 'config.json'],
])
  el(id!).addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = `/api/arena/download?id=${encodeURIComponent(selected)}&file=${file}`;
    a.click();
  });
el('batch-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending) return;
  pending = true;
  actionError = '';
  el('arena-error').textContent = '';
  render();
  try {
    const response = await fetch('/api/arena/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateA: el<HTMLSelectElement>('batch-a').value,
        candidateB: el<HTMLSelectElement>('batch-b').value,
        games: Number(el<HTMLSelectElement>('batch-games').value),
        threads: Number(el<HTMLSelectElement>('batch-threads').value),
        hashMB: Number(el<HTMLSelectElement>('batch-hash').value),
        timeControl: el<HTMLSelectElement>('batch-time').value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Não foi possível iniciar.');
    selected = data.id;
    el('arena-status').textContent = 'PREPARANDO';
  } catch (err) {
    actionError = (err as Error).message;
    el('arena-error').textContent = actionError;
  } finally {
    pending = false;
    render();
  }
});
try {
  const data = await (await fetch('/api/candidates')).json();
  for (const [id, value] of [
    ['batch-a', 'arthur-latest'],
    ['batch-b', 'vanderlei-latest'],
  ]) {
    const input = el<HTMLSelectElement>(id!);
    input.replaceChildren(
      ...Object.entries(data.aliases as Record<string, string>).map(
        ([alias, target]) => new Option(`${alias} → ${target}`, alias),
      ),
      ...data.candidates.map((c: { id: string; label: string }) => new Option(c.label, c.id)),
    );
    input.value = value!;
  }
} catch {
  el('arena-error').textContent = 'Não foi possível carregar os candidatos.';
}
estimate();
void refresh();
setInterval(render, 1000);
