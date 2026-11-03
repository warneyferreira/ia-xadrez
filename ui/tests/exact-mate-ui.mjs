// Fixture isolada: nenhum POST ao servidor real e nenhuma engine é iniciada.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const bundles = fileURLToPath(new URL('../../results/visual/exact-mate/', import.meta.url));
const original = await (await fetch('http://127.0.0.1:18766/api/tournament/status')).json();
const state = {
  ...original,
  arenaBusy: false,
  phase: 'awaiting-engine-confirmation',
  engineColor: 'white',
  fen: '7k/6pp/5KQ1/8/8/8/8/8 w - - 0 1',
  moves: [],
  san: [],
  whiteMillis: 5000,
  blackMillis: 5000,
  running: 'white',
  search: null,
  outcome: null,
  error: null,
  pending: { bestmove: 'g6g7', depth: 0, score: { unit: 'mate', value: 1 }, source: 'proven-mate' },
  controller: { ...original.controller, immediateMates: 1 },
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
});
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.host, 'exact-mate.test');
    assert.equal(route.request().method(), 'GET');
    if (url.pathname === '/api/tournament/status') return route.fulfill({ json: state });
    const name = url.pathname === '/tournament' ? 'tournament.html' : url.pathname.slice(1);
    assert(!name.includes('/') && !name.includes('..'));
    return route.fulfill({ path: join(bundles, name) });
  });
  for (const [name, width, height] of [
    ['desktop', 1280, 900],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://exact-mate.test/tournament');
    await page.waitForFunction(() =>
      document.querySelector('#engine-detail').textContent.includes('mate em uma jogada'),
    );
    assert.match(await page.locator('#engine-detail').textContent(), /a partida ainda não foi encerrada/);
    assert.match(await page.locator('#phase').textContent(), /Mova a peça/);
    assert(await page.locator('#confirm-engine').isEnabled());
    await page.locator('#confirm-engine').focus();
    assert(await page.locator('#confirm-engine').evaluate((e) => e === document.activeElement));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(bundles, `${name}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  const after = await (await fetch('http://127.0.0.1:18766/api/tournament/status')).json();
  assert.equal(after.phase, original.phase);
  assert.equal(after.fen, original.fen);
  console.log('PASS: mate exato e confirmação física em desktop/celular; sessão real preservada.');
} finally {
  await browser.close();
}
