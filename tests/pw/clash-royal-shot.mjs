// Screenshot capture for the clash-royal hex-slots / fill / deck-view UI rework.
//
// Headless chromium (swiftshader GL) @ 412x915 dPR 2, against the __DEV__ dev server
// at localhost:3000/?type=clash-royal. Drives coins/picks via the window.__clashRoyal
// bridge to reach a mid-charge + fully-unlocked state, taps an affordable slot, and
// captures PNGs into tests/pw/shots/ for human review:
//   01-load.png        initial (slots + coin bar)
//   02-fills.png        mid/full charge fills visible
//   03-after-pick.png   deck tile + refilled slots after a tap
//   04-panel-band.png   full bottom UI band
// Plus *-full.png full-page variants for the clipped band shots.
//
// Reuses a running clash-royal dev server if present; else spawns one and tears it down.
// Run: node tests/pw/clash-royal-shot.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3000;
const URL = `http://localhost:${PORT}/?type=clash-royal`;
const VP = { width: 412, height: 915 };
const SHOTS = path.join(ROOT, 'tests', 'pw', 'shots');

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpAlive() {
  try { return (await fetch(URL, { method: 'GET' })).ok; } catch { return false; }
}

async function ensureDevServer() {
  if (await httpAlive()) { log(`[harness] reusing dev server already serving ${URL}`); return null; }
  log('[harness] no dev server on :3000 — spawning clash-royal dev server...');
  const child = spawn('node', ['scripts/variant-build.js', '--type', 'clash-royal', 'demo', 'dev'], {
    cwd: ROOT, stdio: 'ignore', detached: true,
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await httpAlive()) { log('[harness] dev server up.'); return child; }
    await sleep(1000);
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  throw new Error('dev server did not come up within 120s');
}

function killDevServer(child) { if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ } } }

// Band clip = bottom ~45% of the screen, where the slots + coin bar + deck row live.
// Playwright clip coords are CSS pixels (not device pixels) — the deviceScaleFactor is
// applied to the output buffer afterward.
function bandClip() {
  const top = Math.round(VP.height * 0.55);
  return { x: 0, y: top, width: VP.width, height: VP.height - top };
}

// Deck-tray band clip — the narrow strip just above the panel where SkillQueue tiles
// pop (TRAY_Y_FRAC ~0.605). Captured separately so the deck tile is reviewable.
function trayClip() {
  const top = Math.round(VP.height * 0.55);
  return { x: 0, y: top, width: VP.width, height: Math.round(VP.height * 0.12) };
}

// Slot screen centers (CSS px) derived from CombatScene layout @ 412x915 (panel scale
// ~0.866). A REAL click here fires the SkillSlots onTap → tray.addToDeck path (the dev
// bridge's tapSlot routes straight to the controller and skips that UI wiring).
const SLOT_SCREEN = [
  { x: 83, y: 691 },
  { x: 206, y: 691 },
  { x: 329, y: 691 },
];

let spawnedServer = null;
let browser = null;

try {
  mkdirSync(SHOTS, { recursive: true });
  spawnedServer = await ensureDevServer();

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

  // Wait for the bridge to install (scene.enter loads bg + spine before installDevBridge).
  const bridgeDeadline = Date.now() + 30_000;
  let haveBridge = false;
  while (Date.now() < bridgeDeadline) {
    haveBridge = await page.evaluate(() => !!window.__clashRoyal);
    if (haveBridge) break;
    await sleep(250);
  }
  log('[shot] bridge installed:', haveBridge);
  await sleep(1500); // let first frames paint

  // 10 — ONBOARDING overlay at fresh load: the scrim dims the scene, the cheapest slot is
  // bright through the rectangular cutout, the coach finger sits on it, and the tutorial
  // card (title + body) is legible above the panel. Captured FIRST, before any pick
  // (a pick dismisses the overlay). Spotlight slot = cheapest = slot 0 (cost-ascending).
  await page.screenshot({ path: path.join(SHOTS, '10-onboarding.png') });
  log('[shot] 10-onboarding captured');

  // 11 — AFTER FIRST PICK: a REAL pointer click on the spotlit (cheapest) slot dismisses the
  // overlay (the dismiss + fly are on the pick path) and pops a deck tile. Coins start at 1
  // and the cheapest slot costs 5, so wait until slot 0 is affordable, then click it.
  if (haveBridge) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const aff = await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.affordable() : []));
      if (aff.includes(0)) break;
      await sleep(300);
    }
    await page.mouse.click(SLOT_SCREEN[0].x, SLOT_SCREEN[0].y);
    log('[shot] real-clicked spotlit slot 0 at', SLOT_SCREEN[0]);
    // Let the overlay fade out (~260ms) + the deck tile pop-in settle.
    await sleep(900);
    const deckLen = await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.deck.length : -1));
    log('[shot] deck length after first pick:', deckLen);
  }
  await page.screenshot({ path: path.join(SHOTS, '11-after-firstpick.png') });
  await page.screenshot({ path: path.join(SHOTS, '11-after-firstpick-band.png'), clip: bandClip() });
  log('[shot] 11-after-firstpick captured');

  // 01 — initial load.
  await page.screenshot({ path: path.join(SHOTS, '01-load.png') });
  await page.screenshot({ path: path.join(SHOTS, '01-load-band.png'), clip: bandClip() });
  log('[shot] 01-load captured');

  // 02 — mid/full charge. The coin meter accrues over time; idle auto-pick is armed only
  // by the onboarding flow, so just let coins build for a few seconds to reveal partial
  // bottom-up fills, then capture once at least one slot is near full.
  if (haveBridge) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const aff = await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.affordable().length : 0));
      if (aff >= 1) break;
      await sleep(400);
    }
    await sleep(600); // a touch more so partial fills on the costlier slots show
  }
  await page.screenshot({ path: path.join(SHOTS, '02-fills.png') });
  await page.screenshot({ path: path.join(SHOTS, '02-fills-band.png'), clip: bandClip() });
  log('[shot] 02-fills captured');

  // 03 — after a pick: REAL-click the cheapest affordable slot (fires SkillSlots.onTap →
  // tray.addToDeck), then capture the deck tile + the refilled slot row.
  if (haveBridge) {
    const aff = await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.affordable() : []));
    if (aff.length) {
      const i = aff[0];
      await page.mouse.click(SLOT_SCREEN[i].x, SLOT_SCREEN[i].y);
      log('[shot] real-clicked slot', i, 'at', SLOT_SCREEN[i]);
    } else {
      log('[shot] WARN: no affordable slot to click for 03');
    }
    await sleep(1000);
  }
  await page.screenshot({ path: path.join(SHOTS, '03-after-pick.png') });
  await page.screenshot({ path: path.join(SHOTS, '03-after-pick-band.png'), clip: bandClip() });
  await page.screenshot({ path: path.join(SHOTS, '03-deck-tray.png'), clip: trayClip() });
  log('[shot] 03-after-pick captured');

  // Click a couple more affordable slots to populate the deck row, for the panel-band shot.
  for (let n = 0; n < 3; n++) {
    const aff = await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.affordable() : []));
    if (!aff.length) { await sleep(1200); continue; }
    const i = aff[0];
    await page.mouse.click(SLOT_SCREEN[i].x, SLOT_SCREEN[i].y);
    await sleep(900);
  }

  // 04 — full bottom UI band + a wider band incl. the deck tray row.
  await sleep(800);
  await page.screenshot({ path: path.join(SHOTS, '04-panel-band.png'), clip: bandClip() });
  await page.screenshot({ path: path.join(SHOTS, '04-panel-band-full.png') });
  await page.screenshot({ path: path.join(SHOTS, '04-deck-tray.png'), clip: trayClip() });
  log('[shot] 04-panel-band captured');

  log('[shot] done — PNGs in', SHOTS);
} catch (err) {
  log('driver exception:', err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  killDevServer(spawnedServer);
}
