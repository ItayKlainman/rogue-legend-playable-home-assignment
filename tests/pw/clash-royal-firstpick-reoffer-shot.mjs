// Screenshot + E2E assertion for the FIRST-PICK RE-OFFER (onboarding stack tutorial).
//
// The onboarding spotlights the cheapest tier-1 (shuriken, cost 5 = the starting coins). The
// player's FIRST pick must re-offer the SAME skill into its slot so they can immediately pick
// it again and watch it merge/stack. Every later refill behaves normally.
//
// Drives the __clashRoyal dev bridge to:
//   1) assert shuriken is the cheapest opening slot (forced in by the controller),
//   2) tap it (the first pick) → deck [{shuriken, stack:1}] AND a slot is re-offered shuriken,
//   3) tap the re-offered shuriken → MERGE → stack 2 (the tutorial stack moment).
//
// Captures into tests/pw/shots/:
//   firstpick-before.png  — opening slots (shuriken spotlit, cheapest/leftmost)
//   firstpick-after.png   — after the first pick: shuriken re-offered into a slot, deck stack-1
//   firstpick-stack2.png  — after picking the re-offered shuriken: deck stack-2
//
// Headless chromium @ 412x915 dPR 2; serves on :3011 so it never conflicts with the user's
// :3000 dev server. Run: node tests/pw/clash-royal-firstpick-reoffer-shot.mjs
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
  log(`[harness] spawning playable-scripts dev --port ${PORT}...`);
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

async function waitAffordable(page, idx, ms = 30_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const aff = await page.evaluate(() => window.__clashRoyal.affordable());
    if (aff.includes(idx)) return;
    await sleep(200);
  }
  throw new Error(`slot ${idx} never became affordable`);
}

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
  let pageErrors = 0;
  page.on('pageerror', (e) => { pageErrors++; log('[PAGEERROR]', String(e.message || e).slice(0, 300)); });
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
    await sleep(250);
  }
  if (!haveBridge) throw new Error('bridge never installed');
  await sleep(1500); // let first frames paint

  // ── 1) Opening slots: shuriken must be the cheapest (leftmost) — forced by onboarding.
  const opening = await page.evaluate(() => window.__clashRoyal.slots.map((s) => s && { id: s.skill.id, cost: s.skill.cost }));
  log('[shot] opening slots:', JSON.stringify(opening));
  if (opening[0]?.id !== 'shuriken') throw new Error(`expected shuriken in slot 0, got ${JSON.stringify(opening[0])}`);
  await page.screenshot({ path: path.join(SHOTS, 'firstpick-before.png') });
  log('[shot] captured firstpick-before.png');

  // ── 2) First pick: tap shuriken → deck stack-1 AND shuriken re-offered into a slot.
  await waitAffordable(page, 0);
  const ok1 = await page.evaluate(() => window.__clashRoyal.tapSlot(0));
  if (!ok1) throw new Error('first tapSlot(0) returned false');
  await sleep(1000); // fly + pop settle
  const deck1 = await page.evaluate(() => window.__clashRoyal.deckEntries);
  log('[shot] deck after first pick:', JSON.stringify(deck1));
  if (!(deck1.length === 1 && deck1[0].id === 'shuriken' && deck1[0].stack === 1)) {
    throw new Error(`expected deck [{shuriken,1}] after first pick, got ${JSON.stringify(deck1)}`);
  }
  const reoffered = await page.evaluate(() => window.__clashRoyal.slots.findIndex((s) => s?.skill.id === 'shuriken'));
  log('[shot] re-offered shuriken slot index:', reoffered);
  if (reoffered < 0) throw new Error('shuriken was NOT re-offered after the first pick');
  await page.screenshot({ path: path.join(SHOTS, 'firstpick-after.png') });
  log('[shot] captured firstpick-after.png');

  // ── 3) Pick the re-offered shuriken → MERGE → stack 2.
  await waitAffordable(page, reoffered);
  const ok2 = await page.evaluate((i) => window.__clashRoyal.tapSlot(i), reoffered);
  if (!ok2) throw new Error(`second tapSlot(${reoffered}) returned false`);
  await sleep(1100); // fly + merge settle
  const deck2 = await page.evaluate(() => window.__clashRoyal.deckEntries);
  log('[shot] deck after second pick:', JSON.stringify(deck2));
  const merged = deck2.find((e) => e.id === 'shuriken');
  if (!merged || merged.stack !== 2) throw new Error(`expected shuriken stack=2 after merge, got ${JSON.stringify(merged)}`);
  if (deck2.length !== 1) throw new Error(`deck should still have 1 unique entry, got ${JSON.stringify(deck2)}`);
  await page.screenshot({ path: path.join(SHOTS, 'firstpick-stack2.png') });
  log('[shot] captured firstpick-stack2.png');

  if (pageErrors > 0) throw new Error(`${pageErrors} page error(s) fired during the run`);
  log('[shot] PASS — first-pick re-offer verified, 3 frames captured.');
} catch (err) {
  log('[shot] ERROR:', (err && err.message) || err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  killDevServer(spawnedServer);
}
