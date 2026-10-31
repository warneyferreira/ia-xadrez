import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const root = 'http://127.0.0.1:18766';
const start = await fetch(`${root}/api/duel/start`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    whiteName: 'Arthur v1',
    blackName: 'Vanderlei · base',
    arthurWhite: true,
    movetime: 250,
    memoryProfile: 'balanced',
    useBook: true,
    timeMode: 'fixed',
  }),
});
assert(start.ok, await start.text());
let state,
  last = -1;
const deadline = Date.now() + 240000;
while (Date.now() < deadline) {
  state = await (await fetch(`${root}/api/duel/status`)).json();
  if (Math.floor(state.rows.length / 20) !== last) {
    last = Math.floor(state.rows.length / 20);
    console.log(`Duelo real: ${state.rows.length} meios-lances, ${state.phase}`);
  }
  if (state.phase === 'finished' || state.phase === 'error') break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(state.phase, 'finished', JSON.stringify({ phase: state.phase, error: state.error }));
console.log(state.outcome);
let job;
const reviewDeadline = Date.now() + 180000;
while (Date.now() < reviewDeadline) {
  job = await (await fetch(`${root}/api/duel/review/status`)).json();
  if (job.status === 'done' || job.status === 'error') break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(job.status, 'done', job.error);
assert.equal(job.total, state.rows.length);
const report = await (await fetch(`${root}/api/duel/report`)).json();
assert.equal(report.analysisStatus, 'done');
assert.equal(report.analysis.length, state.rows.length);
await mkdir(new URL('../../results/reports/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../../results/reports/partida-completa.report.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(`PASS: partida concluída, análise automática de ${job.total} jogadas e relatório completo.`);
