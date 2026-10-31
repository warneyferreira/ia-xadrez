import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('restauração conserva pausa e relógios; checkpoint inválido recupera o anterior', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'chess-restore-'));
  try {
    mkdirSync(join(folder, 'logs'));
    mkdirSync(join(folder, 'candidates'));
    const candidates = ['arthur', 'base'].map((id) => ({ id, label: id, threads: 1, hashMB: 16 }));
    writeFileSync(join(folder, 'candidates/registry.json'), JSON.stringify({ aliases: {}, candidates }));
    const paused = {
      id: '1793420000001',
      phase: 'paused',
      pgn: '1. e4 e5 *',
      rows: [{ uci: 'e2e4' }, { uci: 'e7e5' }],
      arthurCandidate: 'arthur',
      opponentCandidate: 'base',
      whiteName: 'Arthur',
      blackName: 'Base',
      arthurWhite: true,
      memoryProfile: 'balanced',
      movetime: 250,
      useBook: false,
      timeMode: '25+0',
      startedAt: Date.now() - 300000,
      endedAt: 0,
      elapsedMillis: 4000,
      whiteSearchMillis: 1000,
      blackSearchMillis: 2000,
      identities: [],
      outcome: null,
    };
    const prior = { ...paused, id: '1793420000000', phase: 'finished', endedAt: Date.now() - 20000 };
    writeFileSync(join(folder, 'logs/latest-finished.json'), JSON.stringify(prior));
    utimesSync(join(folder, 'logs/latest-finished.json'), new Date(0), new Date(0));
    writeFileSync(join(folder, 'logs/latest-session.json'), JSON.stringify(paused));
    const code = `import { Duel } from ${JSON.stringify(new URL('./duel.ts', import.meta.url).href)};
      const duel = new Duel('unused', {}); console.log(JSON.stringify(duel.snapshot()));`;
    const read = async () => {
      const child = Bun.spawn([process.execPath, '--eval', code], {
        cwd: folder,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = await new Response(child.stdout).text();
      expect(await child.exited).toBe(0);
      return JSON.parse(output);
    };
    const restored = await read();
    expect(restored.phase).toBe('paused');
    expect(restored.id).toBe(paused.id);
    expect(restored.rows.length).toBe(2);
    expect(restored.elapsedMillis).toBe(4000);
    expect(restored.whiteRemaining).toBe(1499000);
    expect(restored.blackRemaining).toBe(1498000);
    expect(restored.busy).toBe(false);
    writeFileSync(join(folder, 'logs/latest-session.json'), '{broken');
    expect((await read()).id).toBe(prior.id);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
