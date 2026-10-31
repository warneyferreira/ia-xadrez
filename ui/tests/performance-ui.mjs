import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
});
const base = 'http://127.0.0.1:18766';
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  let info;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await page.request.get(`${base}/api/info`, { timeout: 1000 });
      if (response.ok()) {
        info = await response.json();
        break;
      }
    } catch {
      /* Primeiro build da interface pode ainda estar preparando o servidor. */
    }
    await page.waitForTimeout(250);
  }
  assert(info, 'servidor deve ficar pronto em até 15 s');
  assert.match(info.candidate, /Arthur v2/);
  assert.equal(info.book, false);
  await page.request.post(`${base}/api/tournament/end`);
  await page.request.post(`${base}/api/duel/pause`);
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#engine-name').textContent.includes('Arthur v2'));
  assert(await page.locator('#opening-book').isDisabled());
  await page.goto(`${base}/duel`);
  await page.waitForFunction(
    () =>
      document.querySelector('#primary-candidate')?.value &&
      document.querySelector('#white-profile').textContent.length > 0,
  );
  await page.locator('#arthur-side').selectOption('white');
  await page.locator('#primary-candidate').selectOption('arthur-v2');
  assert.match(await page.locator('#white-input').inputValue(), /Arthur v2/);
  assert(await page.locator('#duel-book').isDisabled());
  assert.equal(await page.locator('#duel-book').isChecked(), false);
  await page.locator('#duel-time').selectOption('250');
  await page.locator('#start').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#duel-moves li').length >= 4 &&
      document.querySelector('#white-name').textContent.includes('Arthur v2'),
    null,
    { timeout: 30000 },
  );
  await page.locator('#pause').click();
  await page.waitForFunction(() => !document.querySelector('#resume').disabled);
  const duel = await (await page.request.get(`${base}/api/duel/status`)).json();
  const identity = duel.identities.find((c) => c.id === 'arthur-v2');
  assert.equal(identity.buildManifest.pgo, true);
  assert.equal(identity.binarySha256, identity.buildManifest.binarySha256);
  assert.equal(identity.effectiveOptions.book, false);
  const created = await page.request.post(`${base}/api/tournament/newgame`, {
    data: { engineColor: 'black', initialMillis: 60000 },
  });
  assert.equal(created.status(), 200);
  await page.request.post(`${base}/api/tournament/start`);
  await page.goto(`${base}/tournament`);
  await page.waitForFunction(() => !document.querySelector('#opponent-move').disabled);
  assert.match(await page.locator('#time-policy').textContent(), /2.0 s/);
  assert.match(await page.locator('#physical-time-control').textContent(), /1\+0 · ENSAIO/);
  await page.locator('#opponent-move').fill('e4');
  await page.locator('#send-opponent').click();
  await page.waitForFunction(() => !document.querySelector('#confirm-engine').disabled, null, {
    timeout: 20000,
  });
  await page.waitForTimeout(1600);
  await page.locator('#confirm-engine').click();
  await page.waitForFunction(() =>
    document.querySelector('#time-policy').textContent.includes('ajustada às suas confirmações'),
  );
  const physical = await (await page.request.get(`${base}/api/tournament/status`)).json();
  assert.equal(physical.timePolicy.observedMoves, 1);
  assert(physical.timePolicy.overheadMillis >= 1500 && physical.timePolicy.overheadMillis <= 8000);
  assert.equal(physical.moves.length, 2);
  await page.screenshot({
    path: fileURLToPath(new URL('../../results/visual/performance-desktop.png', import.meta.url)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, {
    timeout: 5000,
  });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: fileURLToPath(new URL('../../results/visual/performance-mobile.png', import.meta.url)),
    fullPage: true,
  });
  await page.request.post(`${base}/api/tournament/end`);
  // Encerramento logo após iniciar não pode disparar nova busca/erro tardio.
  await page.request.post(`${base}/api/tournament/newgame`, {
    data: { engineColor: 'white', initialMillis: 60000 },
  });
  await page.request.post(`${base}/api/tournament/start`);
  await page.request.post(`${base}/api/tournament/end`);
  await page.waitForTimeout(500);
  assert.equal((await (await page.request.get(`${base}/api/tournament/status`)).json()).phase, 'finished');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Arthur v2 real, identidade/manifesto, repertório explícito, margem física adaptativa, encerramento e layout desktop/móvel.',
  );
} finally {
  await browser.close();
}
