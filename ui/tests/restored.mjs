import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
const base = process.env.CHESS_TEST_URL ?? 'http://127.0.0.1:18766';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const files = ['latest-finished.json', 'latest-session.json']
    .map((name) => fileURLToPath(new URL(`../../logs/${name}`, import.meta.url)))
    .filter(existsSync)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const saved = JSON.parse(readFileSync(files[0], 'utf8'));
  await page.goto(`${base}/duel`);
  const report = await (await page.request.get(`${base}/api/duel/report`)).json();
  assert.equal(report.id, saved.id);
  assert.equal(report.phase, saved.phase);
  assert.equal(report.rows.length, saved.rows.length);
  assert.equal(
    report.analysisEngine,
    saved.analysisEngine ?? null,
    'restaurar análise preserva motor original',
  );
  if (saved.phase === 'finished')
    await page.waitForFunction(() => !document.querySelector('#result-banner').hidden);
  if (saved.analysisStatus === 'done')
    await page.waitForFunction(
      () => document.querySelector('#analysis-progress').textContent.includes('Análise concluída'),
      null,
      { timeout: 15000 },
    );
  await page.locator('#replay-prev').click();
  assert.match(await page.locator('#replay-label').textContent(), /Lance/);
  await page.screenshot({
    path: fileURLToPath(new URL('../../results/visual/resultado-reprise-desktop.png', import.meta.url)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
      .map((e) => e.id || e.tagName),
  }));
  assert(layout.scroll <= layout.width, JSON.stringify(layout));
  await page.screenshot({
    path: fileURLToPath(new URL('../../results/visual/resultado-reprise-mobile.png', import.meta.url)),
    fullPage: true,
  });
  console.log('PASS: sessão salva restaurada; identidade, reprise e layout móvel verificados.');
} finally {
  await browser.close();
}
