// Screenshot capture for the clash-royal STACKING flow.
//
// Drives the __clashRoyal dev bridge to:
//  1) accrue coins, tap a BLUE skill into the deck (stack=1, dim/locked star badge),
//  2) force-offer the SAME skill back into slot 0, tap it → MERGE (badge upgrades to lit
//     star, deck size unchanged, tier-tinted burst plays on the tile),
//  3) force-offer the SAME skill again → second MERGE (badge upgrades to DiamondStar).
//
// Captures the following frames into tests/pw/shots/:
//   stack-base.png       — single blue tile, stack-1 (dim) badge
//   stack-merging.png    — mid-merge animation (card arcing onto the existing tile)
//   stack-after.png      — same tile, badge upgraded to lit star, deck did NOT grow
//   stack-3.png          — after a third pick, badge is DiamondStar (apex)
//
// Headless chromium @ 412x915 dPR 2; targets http://localhost:3011/?type=clash-royal so it
// never conflicts with the user's own :3000 dev server. The harness expects a dev server
// already running on :3011 OR spawns one. The build.json is shared, so the type=clash-royal
// query string is what tells the playable shell which playable to mount.
//
// Run: node tests/pw/clash-royal-stack-shot.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
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

async function httpAlive() {
  try { return (await fetch(URL, { method: 'GET' })).ok; } catch { return false; }
}

async function ensureDevServer() {
  if (await httpAlive()) { log(`[harness] reusing dev server already serving ${URL}`); return null; }
  log(`[harness] no dev server on :${PORT} — spawning playable-scripts dev --port ${PORT}...`);
  // Spawn playable-scripts directly (not via variant-build) so we don't race with the user's
  // :3000 dev server on build.json. The user's session has already configured build.json for
  // type=clash-royal, so we just need to serve it on a non-conflicting port.
  const child = spawn('npx', ['playable-scripts', 'dev', '--port', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', detached: true, shell: true,
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await httpAlive()) { log('[harness] dev server up.'); return child; }
    await sleep(1000);
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  throw new Error(`dev server did not come up within 120s on port ${PORT}`);
}

function killDevServer(child) { if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ } } }

// Slot screen centers (CSS px) at 412x915 — same as the other clash-royal shot harnesses.
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

  // Wait for the __clashRoyal bridge to install (scene.enter loads bg + spine before installDevBridge).
  const bridgeDeadline = Date.now() + 30_000;
  let haveBridge = false;
  while (Date.now() < bridgeDeadline) {
    haveBridge = await page.evaluate(() => !!window.__clashRoyal);
    if (haveBridge) break;
    await sleep(250);
  }
  log('[shot] bridge installed:', haveBridge);
  if (!haveBridge) throw new Error('bridge never installed');
  await sleep(1500); // let first frames paint

  // Find the cheapest BLUE (tier-1, enemy-target) skill id by reading the live roster slot.
  // We look at the current 3 slots and pick the first id that's a known blue.
  // The bridge exposes slots: SlotEntry[]. We don't have a roster API on the bridge so use
  // the well-known blue ids: shuriken (5), fireball (8), bolt (10). Heal is also tier 1 but
  // self-target → non-stackable; exclude it.
  const BLUE_IDS = ['shuriken', 'fireball', 'bolt'];

  // Step 1: BASE — wait for the cheapest slot to be affordable, click it, capture stack-1.
  {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const aff = await page.evaluate(() => window.__clashRoyal.affordable());
      if (aff.length) break;
      await sleep(300);
    }
    // Find a slot whose id is a known blue stackable.
    const target = await page.evaluate((BLUE) => {
      const slots = window.__clashRoyal.slots;
      for (let i = 0; i < slots.length; i++) {
        const id = slots[i]?.skill.id;
        if (id && BLUE.includes(id)) return { i, id };
      }
      return null;
    }, BLUE_IDS);
    if (!target) throw new Error('no blue slot offered in the initial draw');
    log('[shot] step 1 → tapping blue slot', target);
    // Wait until that specific slot is affordable.
    const affDeadline = Date.now() + 30_000;
    while (Date.now() < affDeadline) {
      const aff = await page.evaluate(() => window.__clashRoyal.affordable());
      if (aff.includes(target.i)) break;
      await sleep(300);
    }
    await page.mouse.click(SLOT_SCREEN[target.i].x, SLOT_SCREEN[target.i].y);
    log('[shot] step 1 click @', SLOT_SCREEN[target.i]);
    await sleep(900); // fly + pop settle
    const entries1 = await page.evaluate(() => window.__clashRoyal.deckEntries);
    log('[shot] deck after step 1:', JSON.stringify(entries1));
    if (!entries1.find((e) => e.id === target.id && e.stack === 1)) {
      throw new Error(`expected stack=1 for ${target.id} after first pick`);
    }
    await page.screenshot({ path: path.join(SHOTS, 'stack-base.png') });
    log('[shot] captured stack-base.png');

    // Step 2: force-offer the same id into slot 0, then click it. Capture mid-flight as the
    // arc plays, then capture again after merge settles.
    await page.evaluate(({ id }) => window.__clashRoyal.forceOffer(id, 0), { id: target.id });
    // wait for slot 0 to be affordable
    const affDeadline2 = Date.now() + 30_000;
    while (Date.now() < affDeadline2) {
      const aff = await page.evaluate(() => window.__clashRoyal.affordable());
      if (aff.includes(0)) break;
      await sleep(200);
    }
    log('[shot] step 2 → clicking slot 0 (forced)');
    await page.mouse.click(SLOT_SCREEN[0].x, SLOT_SCREEN[0].y);
    // Capture mid-merge — fly tween is ~380ms; aim ~180ms in for a parabolic arc midpoint.
    await sleep(180);
    await page.screenshot({ path: path.join(SHOTS, 'stack-merging.png') });
    log('[shot] captured stack-merging.png');
    // Let merge settle
    await sleep(900);
    const entries2 = await page.evaluate(() => window.__clashRoyal.deckEntries);
    log('[shot] deck after step 2:', JSON.stringify(entries2));
    const merged = entries2.find((e) => e.id === target.id);
    if (!merged || merged.stack !== 2) {
      throw new Error(`expected stack=2 for ${target.id} after first merge — got ${JSON.stringify(merged)}`);
    }
    await page.screenshot({ path: path.join(SHOTS, 'stack-after.png') });
    log('[shot] captured stack-after.png');

    // Step 3: force-offer again, click again → stack 3 (apex / DiamondStar).
    await page.evaluate(({ id }) => window.__clashRoyal.forceOffer(id, 0), { id: target.id });
    const affDeadline3 = Date.now() + 30_000;
    while (Date.now() < affDeadline3) {
      const aff = await page.evaluate(() => window.__clashRoyal.affordable());
      if (aff.includes(0)) break;
      await sleep(200);
    }
    log('[shot] step 3 → clicking slot 0 (forced again)');
    await page.mouse.click(SLOT_SCREEN[0].x, SLOT_SCREEN[0].y);
    await sleep(1100); // fly + merge settle
    const entries3 = await page.evaluate(() => window.__clashRoyal.deckEntries);
    log('[shot] deck after step 3:', JSON.stringify(entries3));
    const merged3 = entries3.find((e) => e.id === target.id);
    if (!merged3 || merged3.stack !== 3) {
      throw new Error(`expected stack=3 for ${target.id} after second merge — got ${JSON.stringify(merged3)}`);
    }
    await page.screenshot({ path: path.join(SHOTS, 'stack-3.png') });
    log('[shot] captured stack-3.png');
  }
  log('[shot] DONE — 4 frames captured.');
} catch (err) {
  log('[shot] ERROR:', err && err.message || err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  killDevServer(spawnedServer);
}
