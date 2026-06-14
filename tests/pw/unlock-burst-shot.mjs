// Capture a multi-frame SEQUENCE of one SKILL-SLOT UNLOCK burst on the clash-royal
// playable, to verify the new particle/ring effect (replacing the old white rect flash).
//
// Drives http://localhost:3011/?type=clash-royal in headless chromium (swiftshader GL)
// at 412x915 dPR 2. Waits for the __clashRoyal bridge, dismisses onboarding, then polls
// affordable() until a slot crosses unaffordable->affordable (the unlock latch fires the
// burst). At that instant it captures ~8 frames every ~85ms into tests/pw/shots/unlock-XX.png.
//
// Run: node tests/pw/unlock-burst-shot.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3011;
const URL = `http://localhost:${PORT}/?type=clash-royal`;
const VP = { width: 412, height: 915 };
const SHOTS = path.join(ROOT, 'tests', 'pw', 'shots');

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser = null;
try {
  mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('[PAGEERROR]', String(e.message || e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') log('[console.error]', m.text().slice(0, 300)); });

  await page.addInitScript(() => {
    window.__al = [];
    window.ALPlayableAnalytics = { trackEvent: (e) => window.__al.push(e) };
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 25_000 });

  const bridgeDeadline = Date.now() + 30_000;
  let haveBridge = false;
  while (Date.now() < bridgeDeadline) {
    haveBridge = await page.evaluate(() => !!window.__clashRoyal);
    if (haveBridge) break;
    await sleep(200);
  }
  log('[unlock] bridge installed:', haveBridge);
  if (!haveBridge) throw new Error('no __clashRoyal bridge');

  await sleep(1800); // let onboarding overlay fade in + first frames paint

  // Dismiss the onboarding overlay + spotlight + coach hand by making the first pick, so the
  // panel is CLEAN (no dim scrim / no finger over slot 0) when we capture the unlock burst.
  // We wait until a slot is affordable, then tap it once.
  {
    const dismDeadline = Date.now() + 12_000;
    while (Date.now() < dismDeadline) {
      const aff = await page.evaluate(() => window.__clashRoyal?.affordable() ?? []);
      if (aff.length > 0) { await page.evaluate((i) => window.__clashRoyal?.tapSlot(i), aff[0]); log('[unlock] dismissed onboarding via tapSlot', aff[0]); break; }
      await sleep(120);
    }
    await sleep(900); // let the overlay finish fading out
  }

  // PREDICTIVE trigger: reacting to affordable() flipping is too slow (the round-trip lag
  // means we'd only catch the burst's tail). Instead we watch `coins` vs the cheapest
  // not-yet-affordable slot's cost and START capturing the instant coins is about to cross
  // (>= cost - EPS), so the dense frame run spans the burst from ~t0.
  const poll = () => page.evaluate(() => {
    const b = window.__clashRoyal;
    if (!b) return null;
    const slots = b.slots.map((s) => (s ? s.skill.cost : null));
    const aff = b.affordable();
    return { coins: b.coins, costs: slots, affordable: aff, state: b.state };
  });

  // Lead time: the FIRST clipped screenshot lands ~250ms after we trigger (swiftshader GPU
  // readback). At ~2-3 coins/s a slot crosses its cost ~0.5-0.75 coins after this point, so
  // we trigger when coins is within LEAD of the cheapest un-affordable cost — the first
  // capture then lands right at/just after the crossing = peak burst.
  let crossed = -1;
  const LEAD = 1.05;
  const deadline = Date.now() + 28_000;
  while (Date.now() < deadline) {
    const cur = await poll();
    if (!cur || cur.state !== 'combat') { await sleep(40); continue; }
    const affSet = new Set(cur.affordable ?? []);
    let best = -1, bestCost = Infinity, bestGap = Infinity;
    for (let i = 0; i < cur.costs.length; i++) {
      const c = cur.costs[i];
      if (c == null || affSet.has(i)) continue;
      const gap = c - cur.coins;
      if (gap >= 0 && gap <= LEAD && c < bestCost) { best = i; bestCost = c; bestGap = gap; }
    }
    if (best >= 0) { crossed = best; log('[unlock] imminent CROSS slot', crossed, 'cost', bestCost, 'gap', bestGap.toFixed(3), 'coins', cur.coins.toFixed(3)); break; }
    await sleep(20);
  }

  if (crossed < 0) log('[unlock] WARNING: no imminent crossing detected; capturing anyway');

  // Capture the burst DENSELY. Full-page screenshots in swiftshader are slow (~150-250ms),
  // which undersamples a ~560ms effect. Clip to just the slot row (small region) so each
  // capture is fast (~30-60ms) and we get fine-grained frames across the whole lifetime.
  // Clip region = the 3-slot row near the bottom (device px / dPR2 logical coords).
  const CLIP = { x: 0, y: 615, width: 412, height: 230 };
  const FRAMES = 8;
  for (let f = 0; f < FRAMES; f++) {
    const n = String(f).padStart(2, '0');
    const t0 = Date.now();
    await page.screenshot({ path: path.join(SHOTS, `unlock-${n}.png`), clip: CLIP });
    log(`[unlock] frame ${n} captured (${Date.now() - t0}ms)`);
  }

  log('[unlock] DONE');
} catch (e) {
  log('[unlock] ERROR', String(e && e.message || e));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
