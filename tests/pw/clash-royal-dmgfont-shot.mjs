// One-off screenshot driver: capture frames where styled damage numbers float over
// the boss/enemies so we can READ the glyphs and confirm Luckiest Guy (not Arial).
// Drives the dev server already running on :3011. NOT a committed gate — leaves PNGs.
//
// Run: node tests/pw/clash-royal-dmgfont-shot.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = path.join(ROOT, 'tests', 'pw', 'shots');
const PORT = 3011;
const URL = `http://localhost:${PORT}/?type=clash-royal`;
const VP = { width: 412, height: 915 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('[PAGEERROR]', String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') log('[console.error]', m.text().slice(0, 200)); });

  await page.addInitScript(() => {
    window.__al = [];
    window.ALPlayableAnalytics = { trackEvent: (e) => { window.__al.push(e); } };
  });
  await page.goto(URL, { waitUntil: 'load', timeout: 25_000 });

  // Wait for the dev bridge.
  const deadline = Date.now() + 30_000;
  let haveBridge = false;
  while (Date.now() < deadline) {
    haveBridge = await page.evaluate(() => !!window.__clashRoyal);
    if (haveBridge) break;
    await sleep(250);
  }
  log('bridge installed:', haveBridge);
  if (!haveBridge) throw new Error('bridge never installed');

  // Confirm the font genuinely loaded in the page (not just a CSS declaration).
  const fontStatus = await page.evaluate(async () => {
    try {
      await document.fonts.ready;
      const loaded = document.fonts.check('40px "Luckiest Guy"');
      const faces = [...document.fonts].map((f) => `${f.family}:${f.status}`);
      return { loaded, faces };
    } catch (e) { return { error: String(e) }; }
  });
  log('document.fonts.check("Luckiest Guy"):', JSON.stringify(fontStatus));

  await sleep(1000); // let first frames paint

  // Dismiss onboarding FIRST (one tap) and wait until the overlay is gone, so the
  // captured frames are pure battle with no "BUILD YOUR DECK" scrim over them.
  await page.evaluate(() => {
    const x = window.__clashRoyal;
    const aff = x?.affordable() ?? [];
    if (aff.length) x.tapSlot(aff[0]);
  });
  await sleep(1500);

  // Fire casts and screenshot densely. We want frames where the floating "-N"
  // number is at/near its pop peak (~60ms in) BEFORE the HitEffect white flash
  // fully washes the enemy, and a few mid-life rising frames. Capture the FULL
  // viewport (numbers spawn high — spine.y-120) plus an upper-band crop.
  let shot = 0;
  const captured = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 45_000 && shot < 18) {
    const s = await page.evaluate(() => {
      const x = window.__clashRoyal;
      if (!x) return { exists: false };
      const aff = x.affordable();
      let tapped = 0;
      for (const i of aff) { if (x.tapSlot(i)) tapped++; }
      return { exists: true, state: x.state, enemiesAlive: x.enemiesAlive, tapped, coins: Math.round(x.coins) };
    });
    if (!s.exists || s.state === 'endcard') break;
    if (s.tapped > 0) {
      // Stagger across the number's 700ms life: pop-in peak (~90ms), settle/rise
      // (~250ms), late rise (~480ms). The projectile flight delays impact ~160ms,
      // so the earliest useful frame is a bit after the tap.
      for (const dly of [200, 340, 520]) {
        await sleep(dly);
        const full = path.join(SHOTS, `dmg-${String(shot).padStart(2, '0')}.png`);
        await page.screenshot({ path: full });
        // Upper band of the battle viewport where the "-N" floats, full width.
        const crop = path.join(SHOTS, `dmg-${String(shot).padStart(2, '0')}-crop.png`);
        await page.screenshot({
          path: crop,
          clip: { x: 0, y: VP.height * 0.04, width: VP.width, height: VP.height * 0.34 },
        });
        captured.push(full);
        log(`shot ${shot} state=${s.state} enemiesAlive=${s.enemiesAlive} tapped=${s.tapped} dly=${dly}`);
        shot++;
        if (shot >= 18) break;
      }
    } else {
      await sleep(200);
    }
  }
  log('captured', captured.length, 'frames');
  fs.writeFileSync(path.join(SHOTS, 'dmg-fontstatus.json'), JSON.stringify(fontStatus, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
}
log('done');
