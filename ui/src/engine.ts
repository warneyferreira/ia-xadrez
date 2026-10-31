import type { Subprocess } from 'bun';

export type Score = { unit: 'cp' | 'mate'; value: number };

/** Resultado de uma busca. `score` é do ponto de vista do lado que move (a engine). */
export type SearchResult = {
  bestmove: string;
  ponder?: string;
  depth: number;
  score: Score | null;
  tbhits?: number;
  nodes?: number;
  nps?: number;
  hashfull?: number;
  engineMillis?: number;
  pv?: string[];
};
export type ClockSearch = { whiteMillis: number; blackMillis: number; incrementMillis?: number };

type Listener = (line: string | null) => void;

/** Processo UCI único. Comandos são serializados; uma nova busca/partida interrompe a anterior. */
export class Engine {
  private readonly proc: Subprocess<'pipe', 'pipe', 'inherit'>;
  private readonly listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private searching = false;
  private dead = false;
  name = 'UCI engine';

  constructor(path: string) {
    this.proc = Bun.spawn([path], { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    let buf = '';
    for await (const chunk of this.proc.stdout) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        for (const listener of [...this.listeners]) listener(line);
      }
    }
    this.dead = true;
    for (const listener of [...this.listeners]) listener(null);
  }

  private send(cmd: string): void {
    if (this.dead) throw new Error('O motor foi encerrado.');
    this.proc.stdin.write(cmd + '\n');
    this.proc.stdin.flush();
  }

  /** Resolve com a primeira linha que satisfaz `match`; `onLine` vê todas as linhas até lá. */
  private waitFor(match: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    if (this.dead) {
      reject(new Error('O motor foi encerrado.'));
      return promise;
    }
    const listener: Listener = (line) => {
      if (line === null) {
        this.listeners.delete(listener);
        reject(new Error('O motor foi encerrado.'));
        return;
      }
      onLine?.(line);
      if (match(line)) {
        this.listeners.delete(listener);
        resolve(line);
      }
    };
    this.listeners.add(listener);
    return promise;
  }

  /** Executa `task` depois de tudo que já está na fila. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async isReady(): Promise<void> {
    const ready = this.waitFor((l) => l === 'readyok');
    this.send('isready');
    await ready;
  }

  init(options: Record<string, string | number>): Promise<void> {
    return this.serialize(async () => {
      const uciok = this.waitFor(
        (l) => l === 'uciok',
        (l) => {
          if (l.startsWith('id name ')) this.name = l.slice('id name '.length);
        },
      );
      this.send('uci');
      await uciok;
      for (const [name, value] of Object.entries(options)) this.send(`setoption name ${name} value ${value}`);
      await this.isReady();
    });
  }

  /** Interrompe a busca em andamento; o `bestmove` dela é descartado por quem a pediu. */
  private interrupt(): void {
    if (this.searching) this.send('stop');
  }

  stop(): void {
    this.interrupt();
  }

  newGame(): Promise<void> {
    this.interrupt();
    return this.serialize(async () => {
      this.send('ucinewgame');
      await this.isReady();
    });
  }

  /** Busca a partir da posição inicial após `moves` (notação UCI), por `movetime` ms. */
  search(moves: readonly string[], movetime: number): Promise<SearchResult> {
    return this.searchCommand(moves, `go movetime ${movetime}`);
  }

  private searchCommand(moves: readonly string[], command: string): Promise<SearchResult> {
    this.interrupt();
    return this.serialize(async () => {
      let depth = 0;
      let score: Score | null = null;
      let tbhits = 0;
      const telemetry: {
        nodes?: number;
        nps?: number;
        hashfull?: number;
        engineMillis?: number;
        pv?: string[];
      } = {};
      const done = this.waitFor(
        (l) => l.startsWith('bestmove '),
        (l) => {
          if (!l.startsWith('info ') || !l.includes(' pv ')) return;
          const d = /\bdepth (\d+)/.exec(l);
          const s = /\bscore (cp|mate) (-?\d+)/.exec(l);
          if (d) depth = Number(d[1]);
          const tb = /\btbhits (\d+)/.exec(l);
          if (tb) tbhits = Number(tb[1]);
          for (const key of ['nodes', 'nps', 'hashfull', 'time'] as const) {
            const match = new RegExp(`\\b${key} (\\d+)`).exec(l);
            if (match) telemetry[key === 'time' ? 'engineMillis' : key] = Number(match[1]);
          }
          telemetry.pv = l.split(' pv ')[1]?.trim().split(/\s+/);
          if (s) score = { unit: s[1] as Score['unit'], value: Number(s[2]) };
        },
      );
      this.send(moves.length ? `position startpos moves ${moves.join(' ')}` : 'position startpos');
      this.send(command);
      this.searching = true;
      try {
        const line = await done;
        const parts = line.split(' ');
        return {
          bestmove: parts[1]!,
          ponder: parts[2] === 'ponder' ? parts[3] : undefined,
          depth,
          score,
          tbhits,
          ...telemetry,
        };
      } finally {
        this.searching = false;
      }
    });
  }

  /** Busca usando os relógios reais da partida, no formato UCI `go wtime/btime`. */
  searchWithClocks(moves: readonly string[], clocks: ClockSearch): Promise<SearchResult> {
    const white = Math.max(0, Math.floor(clocks.whiteMillis));
    const black = Math.max(0, Math.floor(clocks.blackMillis));
    const increment = Math.max(0, Math.floor(clocks.incrementMillis ?? 0));
    return this.searchCommand(moves, `go wtime ${white} btime ${black} winc ${increment} binc ${increment}`);
  }

  quit(): void {
    if (this.dead) return;
    this.send('quit');
    this.proc.stdin.end();
  }

  async shutdown(): Promise<void> {
    this.quit();
    await this.proc.exited;
  }
}
