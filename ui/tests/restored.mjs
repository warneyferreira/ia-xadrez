import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:18766/duel');
  const saved = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../logs/latest-finished.json', import.meta.url)), 'utf8'),
  );
  const report = await (await page.request.get('http://127.0.0.1:18766/api/duel/report')).json();
  assert.equal(
    report.analysisEngine,
    saved.analysisEngine ?? null,
    'restaurar análise preserva motor original',
  );
  await page.waitForFunction(() => !document.querySelector('#result-banner').hidden);
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
  console.log('PASS: partida concluída e análise restauradas; reprise e layout móvel verificados.');
} finally {
  await browser.close();
}
