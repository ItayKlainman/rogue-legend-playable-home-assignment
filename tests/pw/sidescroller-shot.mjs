// Screenshot + runtime-error capture for the Idle Tower Defense (sidescroller) playable.
//
// Headless chromium @ 412x915 dPR2 against the dev server at localhost:3000/?type=sidescroller.
// Walks the ~50s run, periodically tapping the screen center to pick level-up cards, and
// captures PNGs into tests/pw/shots/ss-*.png for human review. Logs page/console errors so
// we can catch a broken Fire_Wizard skin or any runtime crash.
//
// Reuses a running dev server if present. Run: node tests/pw/sidescroller-shot.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL = 'http://localhost:3000/?type=sidescroller';
const VP = { width: 412, height: 915 };
const SHOTS = path.join(ROOT, 'tests', 'pw', 'shots');
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const START = Date.now();
let browser = null;

try {
  mkdirSync(SHOTS, { recursive: true });

  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { const m = '[PAGEERROR] ' + String(e.stack || e.message || e).slice(0, 600); errors.push(m); log(m); });
  page.on('console', (m) => {
    if (m.type() === 'error') { const t = '[console.error] ' + m.text().slice(0, 300); errors.push(t); log(t); }
    else if (m.text().includes('[ss]')) { log(((Date.now() - START) / 1000).toFixed(1) + 's', m.text()); }
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 25_000 });
  await sleep(2500); // let bg + spine load and first frames paint
  await page.screenshot({ path: path.join(SHOTS, 'ss-01-open.png') });
  log('[shot] ss-01-open');

  // Walk the run. Every ~2.5s grab a frame; tap the 3 vertical card slots to clear any
  // level-up overlay that's up (a no-op tap on empty space is harmless during combat).
  const cardTapsY = [VP.height * 0.5, VP.height * 0.62, VP.height * 0.74];
  const marks = [
    { t: 7000, name: 'ss-02-lvl1' },
    { t: 18000, name: 'ss-03-lvl2' },
    { t: 30000, name: 'ss-04-lvl3' },
    { t: 40000, name: 'ss-05-lvl4' },
    { t: 47000, name: 'ss-06-boss' },
    { t: 56000, name: 'ss-07-cta' },
  ];
  const start = Date.now();
  let mi = 0;
  let grabbedOverlay = false;
  while (mi < marks.length) {
    await sleep(500);
    // capture the level-up overlay ONCE before tapping it away. The first level-up
    // fires ~9s and is input-gated (the overlay stays up until we tap), so a timed
    // grab is reliable without a runtime hook.
    if (!grabbedOverlay && Date.now() - start >= 8500) {
      await sleep(700); // let banner punch + cards + coach hand settle in
      await page.screenshot({ path: path.join(SHOTS, 'ss-levelup.png') });
      log('[shot] ss-levelup captured');
      grabbedOverlay = true;
    }
    // tap through any level-up cards
    for (const y of cardTapsY) { await page.mouse.click(VP.width / 2, y).catch(() => {}); await sleep(120); }
    if (Date.now() - start >= marks[mi].t) {
      await page.screenshot({ path: path.join(SHOTS, marks[mi].name + '.png') });
      log('[shot]', marks[mi].name, 'at', ((Date.now() - start) / 1000).toFixed(1) + 's');
      mi++;
    }
  }

  log('[shot] done — PNGs in', SHOTS);
  log(errors.length ? `[RESULT] ${errors.length} runtime error(s) captured` : '[RESULT] no runtime errors');
} catch (err) {
  log('driver exception:', err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
