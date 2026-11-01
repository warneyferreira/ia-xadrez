// UI compilada em navegador isolado. Não inicia motores nem modifica a bateria real.
// Primeiro usa snapshot real somente de leitura; depois exercita fixtures explícitas.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const output = fileURLToPath(new URL('../../results/visual/', import.meta.url));
const bundles = join(output, 'controller-v1');
const base = process.env.CHESS_TEST_URL ?? 'http://127.0.0.1:18766';
const live = JSON.parse(readFileSync(join(output, 'arena-readonly-snapshot.json'), 'utf8'));
const registry = JSON.parse(readFileSync(new URL('../../candidates/registry.json', import.meta.url), 'utf8'));
let fixtureRegistry = registry;
const duel = await (await fetch(`${base}/api/duel/status`)).json();
const review = await (await fetch(`${base}/api/duel/review/status`)).json();
const physical = await (await fetch(`${base}/api/tournament/status`)).json();
const info = await (await fetch(`${base}/api/info`)).json();
let fixtureDuel = { ...duel, arenaBusy: true };
let arenaState = live;
let physicalState = {
  ...physical,
  arenaBusy: true,
  search: null,
  controller: {
    enabled: false,
    thinking: false,
    expected: null,
    depth: null,
    hits: 0,
    attempts: 0,
    forcedReplies: 0,
  },
  engineConfiguration: { name: info.candidate, threads: info.threads, hashMB: info.hash },
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Seletor real, sem iniciar jogo nem substituir o duelo salvo.
  await page.goto(`${base}/duel`);
  await page.waitForFunction(() => document.querySelector('#primary-candidate').value.length > 0);
  await page.locator('#primary-candidate').selectOption('arthur-v4-prepared');
  assert(await page.locator('#duel-book').isChecked());
  assert(await page.locator('#duel-book').isEnabled());
  assert.match(await page.locator('#book-availability').textContent(), /offline específica/);
  await page.locator('#primary-candidate').selectOption('arthur-v5-nnue19');
  assert(await page.locator('#duel-book').isDisabled());
  assert(!(await page.locator('#duel-book').isChecked()));
  await page.screenshot({ path: join(output, 'candidates-live-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, 'candidates-live-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1050 });
  const unchanged = await (await fetch(`${base}/api/duel/status`)).json();
  assert.equal(unchanged.id, duel.id);
  assert.equal(unchanged.rows.length, duel.rows.length);
  assert.equal(unchanged.phase, duel.phase);
  await page.route('http://controller.test/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const states = {
      '/api/arena/status': arenaState,
      '/api/candidates': fixtureRegistry,
      '/api/duel/status': fixtureDuel,
      '/api/duel/review/start': review,
      '/api/duel/review/status': review,
      '/api/tournament/status': physicalState,
      '/api/info': info,
    };
    if (pathname in states) return route.fulfill({ json: states[pathname] });
    if (pathname.startsWith('/api/'))
      return route.fulfill({ status: 409, json: { error: 'Bateria reservada (fixture de teste).' } });
    const name =
      { '/arena': 'arena.html', '/duel': 'duel.html', '/tournament': 'tournament.html' }[pathname] ??
      pathname.slice(1);
    assert(!name.includes('/') && !name.includes('..'));
    return route.fulfill({ path: join(bundles, name) });
  });
  const mobile = async (name) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8)
        .map((e) => ({ tag: e.tagName, id: e.id, class: e.className })),
    }));
    await page.screenshot({ path: join(output, `${name}-mobile.png`), fullPage: true });
    assert(layout.scroll <= layout.width, `${name}: ${JSON.stringify(layout)}`);
    await page.setViewportSize({ width: 1440, height: 1050 });
  };

  await page.goto('http://controller.test/arena');
  await page.waitForFunction(() => document.querySelector('#run-picker').value.length > 0);
  const run = live.runs.find((r) => r.id === live.activeId) ?? live.runs[0];
  assert(run);
  assert.equal(await page.locator('#completed').textContent(), `${run.completed} / ${run.planned}`);
  assert.equal(await page.locator('#batch-start').isDisabled(), live.busy);
  if (run.legacy && run.status === 'running') {
    assert.match(await page.locator('#progress-explanation').textContent(), /antes da telemetria/);
    assert(await page.locator('#arena-position').isHidden());
  }
  await page.locator('#run-picker').focus();
  assert(await page.locator('#run-picker').evaluate((e) => e === document.activeElement));
  await page.screenshot({ path: join(output, 'arena-readonly-desktop.png'), fullPage: true });
  await mobile('arena-readonly');

  arenaState = structuredClone(live);
  arenaState.runs = [
    {
      ...run,
      id: 'fixture-progress',
      planned: 8,
      startedAt: new Date(Date.now() - 200000).toISOString(),
      status: 'running',
      finishedAt: null,
      completed: 2,
      game: 3,
      legacy: false,
      current: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'white',
        whiteRemaining: 1200,
        blackRemaining: 1300,
        thinkingSince: new Date().toISOString(),
        plies: 0,
      },
      candidates: run.candidates.map((c, i) => ({
        ...c,
        name: `${c.name} · candidato com nome longo para conferência ${i}`,
        win: i ? 0 : 1,
        draw: 1,
        loss: i ? 1 : 0,
      })),
    },
  ];
  arenaState.activeId = 'fixture-progress';
  await page.reload();
  await page.locator('#arena-position').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#arena-board piece:not(.ghost)').count(), 32);
  assert.equal(await page.locator('#arena-black-clock').textContent(), '21:40');
  await page.screenshot({ path: join(output, 'arena-progress-fixture-desktop.png'), fullPage: true });
  await mobile('arena-progress-fixture');

  arenaState = { ...arenaState, busy: false, activeId: null };
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#batch-start').disabled);
  await page.locator('#batch-start').click();
  await page.waitForFunction(() => document.querySelector('#arena-error').textContent.includes('fixture'));
  await page.waitForTimeout(2200);
  assert.match(await page.locator('#arena-error').textContent(), /fixture/);
  assert.equal(await page.locator('#batch-games').inputValue(), '8');

  fixtureDuel = { ...duel, arenaBusy: false };
  await page.goto('http://controller.test/duel');
  await page.waitForFunction(() => document.querySelector('#white-name').textContent.length > 0);
  await page.locator('#primary-candidate').selectOption('arthur-v5-nnue19');
  await page.locator('#white-input').fill('Nome personalizado preservado');
  fixtureRegistry = {
    ...registry,
    candidates: [
      ...registry.candidates,
      {
        ...registry.candidates[0],
        id: 'fixture-publicado',
        label: 'Candidato publicado durante teste',
      },
    ],
  };
  await page.waitForFunction(
    () =>
      [...document.querySelector('#primary-candidate').options].some(
        (option) => option.value === 'fixture-publicado',
      ),
    null,
    { timeout: 15000 },
  );
  assert.equal(await page.locator('#primary-candidate').inputValue(), 'arthur-v5-nnue19');
  assert.equal(await page.locator('#white-input').inputValue(), 'Nome personalizado preservado');
  fixtureDuel = { ...duel, arenaBusy: true };
  await page.waitForFunction(() => document.querySelector('#start').disabled);
  await page.locator('#time-mode').selectOption('25+0');
  assert(await page.locator('#move-time-setting').isHidden());
  assert.match(await page.locator('#time-mode-help').textContent(), /primeiro lance/);
  assert(await page.locator('#start').isDisabled());
  await page.locator('#replay-prev').click();
  assert.match(await page.locator('#replay-label').textContent(), /Lance/);
  await page.screenshot({ path: join(output, 'duel-controller-desktop.png'), fullPage: true });
  await mobile('duel-controller');

  await page.goto('http://controller.test/tournament');
  await page.waitForFunction(() =>
    document.querySelector('#engine-configuration').textContent.includes('threads'),
  );
  assert(await page.locator('#new-game').isDisabled());
  assert.match(await page.locator('#arena-reservation').textContent(), /bateria/i);
  physicalState = {
    ...physicalState,
    phase: 'ready',
    engineColor: 'white',
    arenaBusy: false,
    whiteMillis: physical.initialMillis,
    blackMillis: physical.initialMillis,
  };
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#start-game').disabled);
  await page.locator('#ponder-enabled').check();
  assert(await page.locator('#start-game').isDisabled(), 'rascunho alterado precisa de nova preparação');
  assert.match(await page.locator('#phase').textContent(), /preparação mudou/);
  await page.screenshot({ path: join(output, 'physical-controller-fixture-desktop.png'), fullPage: true });
  await mobile('physical-controller-fixture');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: candidatos v4/v5 na UI real sem alterar duelo; UI compilada desktop/mobile, teclado, progresso, fixtures, erro persistente, reprise, 25+0 e preparação física. Nenhum motor iniciado.',
  );
} finally {
  await browser.close();
}
