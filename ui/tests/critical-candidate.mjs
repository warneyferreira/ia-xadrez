// Verificação real e somente de leitura do servidor; não inicia duelos.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const base = process.env.CHESS_TEST_URL ?? 'http://127.0.0.1:18766';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const before = await (await page.request.get(`${base}/api/duel/status`)).json();
  const info = await (await page.request.get(`${base}/api/info`)).json();
  assert.match(info.candidate, /Arthur v2/);
  assert.equal(info.tournamentCriticalTime, false);
  await page.goto(`${base}/arena`);
  await page.waitForFunction(() => document.querySelector('#run-picker').value.length > 0);
  await page.locator('#run-picker').selectOption('critical-time-v1-pilot');
  assert.match(await page.locator('#evidence').textContent(), /após a posição repetir/);
  assert.equal(await page.locator('#completed').textContent(), '4 / 4');
  await page.locator('#run-picker').selectOption('match-20261031-031514-070');
  assert.match(await page.locator('#evidence').textContent(), /Série antiga/);
  await page.goto(`${base}/duel`);
  await page.waitForFunction(() => document.querySelector('#primary-candidate').options.length > 1);
  if ((await page.locator('#arthur-side').inputValue()) !== 'white')
    await page.locator('#arthur-side').selectOption('white');
  await page.locator('#primary-candidate').selectOption('arthur-v3-critical');
  assert.match(await page.locator('#primary-candidate option:checked').textContent(), /experimental/);
  assert.match(await page.locator('#white-input').inputValue(), /Arthur v3/);
  assert.match(await page.locator('#black-input').inputValue(), /Vanderlei/);
  assert(await page.locator('#duel-book').isDisabled());
  await page.locator('#time-mode').selectOption('25+0');
  assert(await page.locator('#move-time-setting').isHidden());
  assert(await page.locator('#duel-time').isDisabled());
  await page.locator('#primary-candidate').focus();
  assert(await page.locator('#primary-candidate').evaluate((e) => e === document.activeElement));
  await page.screenshot({
    path: fileURLToPath(new URL('../../results/visual/critical-candidate-desktop.png', import.meta.url)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert(layout.scroll <= layout.width, JSON.stringify(layout));
  await page.screenshot({
    path: fileURLToPath(new URL('../../results/visual/critical-candidate-mobile.png', import.meta.url)),
    fullPage: true,
  });
  const after = await (await page.request.get(`${base}/api/duel/status`)).json();
  assert.equal(after.id, before.id);
  assert.equal(after.rows.length, before.rows.length);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: servidor real, candidato experimental selecionável, padrão v2, política antiga/nova identificada, histórico preservado, desktop/mobile.',
  );
} finally {
  await browser.close();
}
