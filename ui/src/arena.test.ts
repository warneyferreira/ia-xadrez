import { test, expect } from 'bun:test';
import { summarizeRun, displayName, ArenaService } from './arena.ts';
import { Candidates } from './candidates.ts';
import { tmpdir } from 'node:os';

const metadata = {
  started_at: '2026-10-31T00:00:00Z',
  config: {
    games: 8,
    candidate_a: { name: 'Arthur', options: { Threads: 2, Hash: 256 } },
    candidate_b: { name: 'Base', options: { Threads: 2, Hash: 256 } },
    time_control: { base_seconds: 1500, increment_seconds: 0 },
  },
};
test('bateria antiga em andamento não aparece concluída nem inventa posição', () => {
  const run = summarizeRun('test', metadata, [], null, null, true);
  expect(run.status).toBe('running');
  expect(run.completed).toBe(0);
  expect(run.current).toBeNull();
  expect(run.legacy).toBe(true);
  expect(run.game).toBe(1);
});
test('partida incompleta não vira empate e encerramento com falha é identificado', () => {
  const events = [
    { result: '*', white: 'Arthur' },
    { result: '0-1', white: 'Base', crash: { candidate: 'Base' } },
  ];
  const run = summarizeRun('test', metadata, events, { unfinished: 1 }, null, false);
  expect(run.status).toBe('finished-with-issues');
  expect(run.incomplete).toBe(1);
  expect(run.failures).toBe(1);
  expect(run.candidates[0]?.draw).toBe(0);
  expect(run.candidates[0]?.win).toBe(1);
});
test('fim de processo sem resumo é interrupção e não sucesso', () => {
  expect(summarizeRun('test', metadata, [], null, null, false).status).toBe('interrupted');
});
test('nomes antigos do PowerShell são corrigidos só na exibição', () => {
  expect(displayName('Arthur v2 Â· PGO')).toBe('Arthur v2 · PGO');
  expect(displayName('Ângelo')).toBe('Ângelo');
  expect(displayName('棋手')).toBe('棋手');
});
test('download da arena rejeita caminhos fora dos arquivos autorizados', () => {
  const arena = new ArenaService(tmpdir(), new Candidates('unused'));
  expect(arena.download('../logs', 'config.json').status).toBe(400);
  expect(arena.download('test', '../../secret').status).toBe(400);
});
