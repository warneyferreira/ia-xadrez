import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { availableParallelism } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Candidates } from './candidates.ts';
import { requireMemory } from './resources.ts';

function json(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}
export function displayName(value: string): string {
  if (!/[ÃÂ]/.test(value) || [...value].some((c) => c.charCodeAt(0) > 255)) return value;
  try {
    return new TextDecoder('utf8', { fatal: true }).decode(Uint8Array.from(value, (c) => c.charCodeAt(0)));
  } catch {
    return value;
  }
}
export function summarizeRun(
  id: string,
  metadata: any,
  events: any[],
  summary: any,
  progress: any,
  alive: boolean,
) {
  const config = metadata.config;
  const names = [config.candidate_a.name, config.candidate_b.name] as string[];
  const scores = Object.fromEntries(names.map((name) => [name, { win: 0, draw: 0, loss: 0 }]));
  for (const e of events) {
    if (e.result === '*') continue;
    for (const name of names) {
      const white = e.white === name;
      const result = e.result === '1/2-1/2' ? 'draw' : (e.result === '1-0') === white ? 'win' : 'loss';
      scores[name]![result]++;
    }
  }
  const incomplete = events.filter((e) => e.result === '*').length;
  const failures = events.filter((e) => e.crash || e.termination === 'time forfeit').length;
  const status = summary
    ? summary.unfinished || failures
      ? 'finished-with-issues'
      : 'finished'
    : alive
      ? 'running'
      : 'interrupted';
  const drawPolicy = metadata.draw_policy ?? summary?.draw_policy ?? config.draw_policy ?? 'claimable';
  return {
    id,
    status,
    startedAt: metadata.started_at,
    finishedAt: summary?.finished_at ?? null,
    planned: config.games,
    completed: events.length,
    game: Math.min(config.games, events.length + 1),
    current: summary ? null : progress?.phase === 'thinking' ? progress : null,
    opening: progress?.opening ?? null,
    legacy: !progress,
    incomplete,
    failures,
    drawPolicy,
    candidates: names.map((name, i) => ({
      name: displayName(name),
      options: config[i === 0 ? 'candidate_a' : 'candidate_b'].options,
      ...scores[name],
    })),
    timeControl: config.time_control,
    paired: summary?.paired ?? null,
    maxClockHours:
      config.time_control.increment_seconds === 0
        ? (config.games * 2 * config.time_control.base_seconds) / 3600
        : null,
    note:
      (summary?.paired?.evidenceOfSuperiority
        ? 'Há evidência inicial de superioridade nos critérios desta bateria; valide em novas aberturas.'
        : 'Esta bateria mede resultados. Ela não treina a rede nem comprova superioridade com poucos jogos.') +
      (drawPolicy === 'claimable'
        ? ' Série antiga: a arena reclamava empate assim que um lance futuro permitia a reclamação.'
        : ' Empates por repetição são registrados após a posição repetir no tabuleiro.'),
  };
}

export class ArenaService {
  readonly directory: string;
  readonly python: string;
  private cache: { at: number; value: any } | null = null;
  private launching = false;
  private liveness = new Map<number, { at: number; alive: boolean }>();
  constructor(
    readonly root: string,
    readonly candidates: Candidates,
  ) {
    this.root = resolve(root);
    this.directory = join(this.root, 'results/arena');
    this.python = join(
      this.root,
      process.platform === 'win32' ? 'arena/.venv/Scripts/python.exe' : 'arena/.venv/bin/python',
    );
  }

  private async alive(pid: number) {
    if (!Number.isInteger(pid) || pid < 1) return false;
    const cached = this.liveness.get(pid);
    if (cached && Date.now() - cached.at < 6000) return cached.alive;
    const child = Bun.spawn(
      [
        this.python,
        '-c',
        'from arena.process_lock import pid_alive; import sys; print(int(pid_alive(int(sys.argv[1]))))',
        String(pid),
      ],
      { cwd: this.root, stdout: 'pipe', stderr: 'ignore', windowsHide: true },
    );
    const alive = (await new Response(child.stdout).text()).trim() === '1' && (await child.exited) === 0;
    this.liveness.set(pid, { at: Date.now(), alive });
    return alive;
  }

  async snapshot(force = false) {
    if (!force && this.cache && Date.now() - this.cache.at < 2000) return this.cache.value;
    const active = json(join(this.directory, 'active.json'));
    let activeId: string | null = null;
    if (typeof active?.output_dir === 'string' && Number.isInteger(active.pid) && active.pid > 0) {
      const path = resolve(active.output_dir);
      if (!existsSync(join(path, 'summary.json')) && (await this.alive(active.pid)))
        activeId = path.startsWith(this.directory + (process.platform === 'win32' ? '\\' : '/'))
          ? path.slice(this.directory.length + 1)
          : 'research';
    } else if (existsSync(join(this.directory, 'active.json'))) activeId = 'unknown';
    const dirs = existsSync(this.directory)
      ? readdirSync(this.directory, { withFileTypes: true })
          .filter((e) => e.isDirectory() && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(e.name))
          .map((e) => ({ id: e.name, mtime: statSync(join(this.directory, e.name)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 30)
      : [];
    const runs = [];
    for (const { id } of dirs) {
      const folder = join(this.directory, id),
        metadata = json(join(folder, 'config.json'));
      if (!metadata?.config?.candidate_a || !metadata.config.candidate_b) continue;
      let events: any[] = [];
      try {
        events = readFileSync(join(folder, 'events.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .flatMap((line) => {
            try {
              return [JSON.parse(line)];
            } catch {
              return [];
            }
          });
      } catch {}
      const summary = json(join(folder, 'summary.json')),
        progress = json(join(folder, 'progress.json'));
      const run = summarizeRun(id, metadata, events, summary, progress, activeId === id);
      runs.push({ ...run, developmentOverlap: existsSync(join(folder, 'development-overlap.json')) });
    }
    let queue = json(join(this.directory, 'research-queue.json'));
    if (queue && !['done', 'failed', 'blocked'].includes(queue.stage) && !(await this.alive(queue.pid)))
      queue = {
        ...queue,
        stage: 'interrupted',
        message: 'A fila local parou antes de concluir. Os relatórios já gravados foram preservados.',
      };
    const value = { activeId, busy: activeId !== null || this.launching, runs, queue };
    this.cache = { at: Date.now(), value };
    return value;
  }

  async requireIdle() {
    if ((await this.snapshot()).busy)
      throw new Error(
        'A bateria está usando o processador. Aguarde terminar; acompanhar o progresso não interrompe as partidas.',
      );
  }

  async start(raw: Record<string, unknown>) {
    if (this.launching) throw new Error('Uma bateria já está sendo preparada.');
    this.launching = true;
    try {
      const snapshot = await this.snapshot(true);
      if (snapshot.activeId) throw new Error('Já existe uma bateria rodando.');
      const a = this.candidates.get(String(raw.candidateA ?? 'arthur-latest'));
      const b = this.candidates.get(String(raw.candidateB ?? 'vanderlei-base'));
      if (a.id === b.id) throw new Error('Escolha dois candidatos diferentes.');
      const games = Number(raw.games ?? 8),
        threads = Number(raw.threads ?? 2),
        hash = Number(raw.hashMB ?? 256);
      if (
        !Number.isInteger(games) ||
        games < 2 ||
        games > 200 ||
        games % 2 ||
        !Number.isInteger(threads) ||
        threads < 1 ||
        threads > availableParallelism() ||
        !Number.isInteger(hash) ||
        hash < 16 ||
        hash > 10240
      )
        throw new Error('Use quantidade par de 2 a 200 partidas e recursos disponíveis na máquina.');
      requireMemory(hash, undefined, hash);
      const identities = [this.candidates.identity(a), this.candidates.identity(b)];
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const id = `match-${stamp}-${randomUUID().slice(0, 6)}`;
      mkdirSync(this.directory, { recursive: true });
      const configPath = join(this.directory, `${id}.config.json`);
      const spec = {
        match_id: id,
        candidate_a: {
          name: a.label,
          command: [this.candidates.path(a)],
          options: {
            Threads: threads,
            Hash: hash,
            'Move Overhead': 20,
            Ponder: false,
            ...(a.tournamentCriticalTime ? { 'Tournament Critical Time': true } : {}),
          },
        },
        candidate_b: {
          name: b.label,
          command: [this.candidates.path(b)],
          options: {
            Threads: threads,
            Hash: hash,
            'Move Overhead': 20,
            Ponder: false,
            ...(b.tournamentCriticalTime ? { 'Tournament Critical Time': true } : {}),
          },
        },
        games,
        draw_policy: 'played',
        time_control:
          raw.timeControl === 'quick'
            ? { base_seconds: 60, increment_seconds: 0.1 }
            : { base_seconds: 1500, increment_seconds: 0 },
        openings: { pgn: join(this.root, 'openings/validation-holdout.pgn'), seed: 20261031 },
        max_plies: 2000,
        output_dir: join(this.directory, id),
        identities,
      };
      writeFileSync(configPath, JSON.stringify(spec, null, 2));
      const child = Bun.spawn([this.python, '-u', join(this.root, 'arena/run_match.py'), configPath], {
        cwd: this.root,
        stdin: 'ignore',
        stdout: Bun.file(join(this.directory, `${id}.stdout.log`)),
        stderr: Bun.file(join(this.directory, `${id}.stderr.log`)),
        windowsHide: true,
        detached: true,
        env: { ...process.env, PYTHONUTF8: '1' },
      });
      child.unref();
      for (let i = 0; i < 30; i++) {
        if (existsSync(join(spec.output_dir, 'config.json'))) break;
        if (child.exitCode !== null)
          throw new Error('A arena não iniciou. Confira o log de preparação na pasta de resultados.');
        await Bun.sleep(100);
      }
      this.cache = null;
      return { id };
    } finally {
      this.launching = false;
    }
  }

  download(id: string, file: string) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id) ||
      !['summary.json', 'games.pgn', 'config.json', 'events.jsonl'].includes(file)
    )
      return new Response('Arquivo inválido', { status: 400 });
    const path = join(this.directory, id, file);
    if (!existsSync(path)) return new Response('Arquivo ainda não disponível', { status: 404 });
    return new Response(Bun.file(path), {
      headers: { 'Content-Disposition': `attachment; filename="${id}-${file}"` },
    });
  }
}
