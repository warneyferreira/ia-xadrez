import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
});
const output = fileURLToPath(new URL('../../results/visual/', import.meta.url));
await mkdir(output, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
await page.addInitScript(() => {
  globalThis.__soundNotes = 0;
  const original = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...args) {
    globalThis.__soundNotes++;
    return original.apply(this, args);
  };
});
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.request.post('http://127.0.0.1:18766/api/duel/pause');
  for (let i = 0; i < 100; i++) {
    const state = await (await page.request.get('http://127.0.0.1:18766/api/duel/status')).json();
    if (!state.busy) break;
    await page.waitForTimeout(50);
  }
  await page.goto('http://127.0.0.1:18766/');
  await page.waitForFunction(() => document.querySelector('#engine-name').textContent.includes('Arthur'));
  const bar = await page.locator('.vertical-eval').boundingBox();
  assert(bar.height > bar.width * 5, 'barra deve ser vertical');
  await page.screenshot({ path: `${output}/treino-desktop.png`, fullPage: true });
  await page.goto('http://127.0.0.1:18766/duel');
  await page.locator('#sound-toggle').click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  await page.locator('#white-input').fill('Arthur · teste visual');
  await page.locator('#black-input').fill('Vanderlei · referência');
  await page.locator('#duel-time').selectOption('250');
  await page.locator('#start').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#duel-moves li').length >= 6 &&
      document.querySelector('#white-name').textContent.includes('teste visual') &&
      document.querySelector('#live').textContent.includes('AO VIVO'),
    {
      timeout: 20000,
    },
  );
  assert(await page.evaluate(() => globalThis.__soundNotes > 0), 'sons gerados após ativação voluntária');
  await page.locator('#pause').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#live').textContent === 'PAUSADO' &&
      !document.querySelector('#resume').disabled,
  );
  const count = await page.locator('#duel-moves li').count();
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#duel-moves li').count(), count, 'pausa deve congelar posição');
  assert.match(await page.locator('#white-name').textContent(), /Arthur/);
  assert.match(await page.locator('#black-name').textContent(), /Vanderlei/);
  await page.screenshot({ path: `${output}/duelo-desktop.png`, fullPage: true });
  await page.locator('#resume').click();
  await page.waitForFunction((n) => document.querySelectorAll('#duel-moves li').length > n, count);
  await page.locator('#pause').click();
  await page.waitForFunction(() => !document.querySelector('#resume').disabled);
  const memory = await (await page.request.get('http://127.0.0.1:18766/api/duel/status')).json();
  if (memory.memory.availableBytes < 11.125 * 2 ** 30) {
    const savedCount = await page.locator('#duel-moves li').count();
    await page.locator('#memory-profile').selectOption('maximum');
    await page.locator('#start').click();
    await page.waitForFunction(() =>
      document.querySelector('#duel-error').textContent.includes('RAM livres'),
    );
    assert.equal(
      await page.locator('#duel-moves li').count(),
      savedCount,
      'falha de memória preserva partida anterior',
    );
    await page.locator('#memory-profile').selectOption('balanced');
  }
  await page.locator('#arthur-side').selectOption('black');
  await page.locator('#start').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#duel-moves li').length >= 2 &&
      document.querySelector('#black-name').textContent.includes('Arthur'),
  );
  assert.match(await page.locator('#black-name').textContent(), /Arthur/);
  assert.match(await page.locator('#white-name').textContent(), /Vanderlei/);
  assert.match(await page.locator('#black-profile').textContent(), /Arthur.*Hash/);
  await page.locator('#pause').click();
  await page.waitForFunction(() => !document.querySelector('#resume').disabled);
  await page.locator('#analyse-duel').click();
  await page.waitForFunction(
    () => document.querySelector('#analysis-progress').textContent.includes('Análise concluída'),
    null,
    { timeout: 30000 },
  );
  await page.locator('#replay-first').click();
  assert.match(await page.locator('#move-explanation').textContent(), /Posição inicial/);
  await page.locator('#replay-next').click();
  assert.match(await page.locator('#move-explanation').textContent(), /Move|Escolhida/);
  const report = await (await page.request.get('http://127.0.0.1:18766/api/duel/report')).json();
  assert(report.analysis.length >= 2 && report.identities[0].binarySha256.length === 64);
  assert(report.rows.some((r) => r.elapsedMillis >= 0));
  await page.locator('#replay-live').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/duelo-mobile.png`, fullPage: true });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth)
      .map((e) => ({ tag: e.tagName, class: e.className, right: e.getBoundingClientRect().right })),
  );
  console.log('overflow:', overflow);
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'sem rolagem horizontal no celular',
  );
  await page.goto('http://127.0.0.1:18766/');
  await page.screenshot({ path: `${output}/treino-mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const pgn = '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
  await page
    .locator('#import-pgn')
    .setInputFiles({ name: 'teste.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(pgn) });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Xeque-mate'));
  await page.waitForFunction(() => document.querySelectorAll('#review-rows button').length === 4, null, {
    timeout: 20000,
  });
  await page.locator('#train-prev').click();
  assert.match(await page.locator('#train-ply').textContent(), /3\/4/);
  await page.goto('http://127.0.0.1:18766/tournament');
  await page.waitForFunction(() => document.querySelector('#white-clock').textContent === '25:00');
  await page.locator('#engine-color').selectOption('black');
  await page.locator('#new-game').click();
  await page.waitForFunction(() => !document.querySelector('#start-game').disabled);
  await page.locator('#start-game').click();
  await page.waitForFunction(() => !document.querySelector('#opponent-move').disabled);
  await page.locator('#opponent-move').fill('banana');
  await page.locator('#send-opponent').click();
  await page.waitForFunction(() => document.querySelector('#error').textContent.includes('ilegal'));
  await page.locator('#opponent-move').fill('e4');
  await page.locator('#send-opponent').click();
  await page.waitForFunction(() => document.querySelector('#moves').textContent.includes('e4'));
  await page.screenshot({ path: `${output}/torneio-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${output}/torneio-desktop.png`, fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#end-session').click();
  await page.waitForFunction(() => document.querySelector('#phase').textContent.includes('encerrada'));
  await page.request.post('http://127.0.0.1:18766/api/tournament/newgame', {
    data: { engineColor: 'white', initialMillis: 60000 },
  });
  await page.request.post('http://127.0.0.1:18766/api/tournament/start');
  await page.waitForFunction(() => !document.querySelector('#confirm-engine').disabled, null, {
    timeout: 20000,
  });
  await page.locator('#confirm-engine').click();
  await page.waitForFunction(() => !document.querySelector('#opponent-move').disabled);
  const duplicate = await page.request.post('http://127.0.0.1:18766/api/tournament/confirm-engine-move');
  assert.equal(duplicate.status(), 400, 'confirmação duplicada rejeitada');
  await page.locator('#opponent-move').fill('e7e5');
  await page.locator('#send-opponent').click();
  await page.waitForFunction(() => document.querySelectorAll('#moves li').length === 2);
  await page.request.post('http://127.0.0.1:18766/api/tournament/end');
  assert.deepEqual(errors, [], 'sem erros de JavaScript');
  console.log(
    'PASS: barra vertical, nomes, duelo real, pausa/retomada, análise, reprise, relatório, PGN importado, SAN e torneio físico.',
  );
} finally {
  await browser.close();
}
