// M22 — verify the heal VFX: green "+" particles emit AROUND the hero's body (a soft
// radial/orbital spread hugging the torso, NOT spilling out the top of the frame) plus
// a light-green healing MIST aura that blooms and fades. Fires the heal cosmetic via
// the __DEV__ fireVfx('heal', 1) hook and samples dense frames so the bloom + fade are
// all caught. Saves tests/pw/shots/m22-heal-*.png. Drives the live :3000 dev server.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 3000);
const URL = `http://localhost:${PORT}/?type=clash-royal`;
const VP = { width: 412, height: 915 };
const SHOTS = path.join(ROOT, 'tests', 'pw', 'shots');
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLOT_SCREEN = [{ x: 83, y: 691 }, { x: 206, y: 691 }, { x: 329, y: 691 }];

function battleClip() { return { x: 0, y: 0, width: VP.width, height: Math.round(VP.height * 0.55) }; }

async function waitBridge(page) {
  const d = Date.now() + 30_000;
  while (Date.now() < d) { if (await page.evaluate(() => !!window.__clashRoyal)) return true; await sleep(250); }
  return false;
}
async function dismiss(page) {
  const d = Date.now() + 15_000;
  while (Date.now() < d) { const aff = await page.evaluate(() => window.__clashRoyal.affordable()); if (aff.includes(0)) break; await sleep(250); }
  await page.mouse.click(SLOT_SCREEN[0].x, SLOT_SCREEN[0].y); await sleep(1000);
}

let browser = null;
try {
  mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch({ headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('[PAGEERROR]', String(e.message || e).slice(0, 200)));
  await page.addInitScript(() => { window.__al = []; window.ALPlayableAnalytics = { trackEvent: (e) => window.__al.push(e) }; });

  await page.goto(URL, { waitUntil: 'load', timeout: 25_000 });
  if (!(await waitBridge(page))) throw new Error('no bridge');
  await sleep(1200);
  await dismiss(page);
  await sleep(600);

  // Tight crop around the HERO ONLY (left ~46% of the canvas) so the heal "+" swarm +
  // mist dominates the frame and the top edge is visible (to prove the particles do NOT
  // spill out the top). The right side (where enemy impact bursts fire) is excluded.
  const heroClip = { x: 0, y: Math.round(VP.height * 0.12), width: Math.round(VP.width * 0.46), height: Math.round(VP.height * 0.42) };

  // Wait until the scene is in the live 'combat' state (NOT a scene transition or the end
  // card). Firing heal mid-transition (or after victory) produced blank/end-card frames
  // that masked the working VFX — the original "renders nothing" false alarm. We gate on
  // the bridge state so every burst lands on a real, hero-visible combat frame.
  const inCombat = async () => {
    // The playable reloads itself when the fight ends (the fake-ad loop), which destroys
    // the page's JS context — swallow that and report "not in combat" so waitCombat polls
    // again once the next fight's bridge is up.
    try { return await page.evaluate(() => !!window.__clashRoyal && window.__clashRoyal.state === 'combat'); }
    catch { return false; }
  };
  const waitCombat = async (budgetMs = 8000) => {
    const d = Date.now() + budgetMs;
    while (Date.now() < d) { if (await inCombat()) return true; await sleep(120); }
    return false;
  };

  // The handler flashes, waits ~150ms (~115ms at combat speed), THEN spawns the burst.
  // Heal aura/swarm life is ~1.5s. We fire, wait past the spawn delay, then capture a
  // dense run that covers the bloom-and-fade. Several bursts so at least one lands on a
  // clean, stationary-hero combat frame even amid live-fight jitter.
  let frame = 0;
  const grab = async () => {
    const tag = String(frame).padStart(2, '0');
    await page.screenshot({ path: path.join(SHOTS, `m22-heal-full-${tag}.png`), clip: battleClip() });
    await page.screenshot({ path: path.join(SHOTS, `m22-heal-hero-${tag}.png`), clip: heroClip });
    frame++;
    await sleep(15);
  };
  let fired = 0;
  for (let burst = 0; burst < 5 && fired < 4; burst++) {
    if (!(await waitCombat())) { log(`[m22heal] burst ${burst}: not in combat, skip`); continue; }
    let ok = false;
    try { ok = await page.evaluate(() => window.__clashRoyal.fireVfx('heal', 1)); }
    catch { log(`[m22heal] burst ${burst}: fire raced a reload, retry`); continue; }
    log(`[m22heal] burst ${burst}: fireVfx('heal', 1) → ${ok} (frame=${frame})`);
    fired++;
    // Skip past the ~115ms spawn delay, then densely sample the ~1.5s bloom-and-fade.
    await sleep(120);
    for (let k = 0; k < 22; k++) await grab();
    await sleep(250); // let the live fight breathe before the next burst
  }
  log(`[m22heal] DONE — ${frame} frame pairs, ${fired} bursts fired`);
} finally {
  if (browser) await browser.close();
}
