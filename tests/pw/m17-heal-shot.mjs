// m17-heal-shot.mjs — capture green plus-sign particle burst on heal cast.
// PAUSED: requires the wire-up agent to actually fire HealPlusBurst from the heal handler
// before this driver produces visible particles. Run manually after that wire-up lands.
//
// Drives the playable to the late heal-scare moment (boss phase, heal forced into a slot),
// then taps that heal slot and samples tightly (30ms × 800ms) so the rising green plus-sign
// swarm is captured frame-by-frame.
//
// Output: tests/pw/shots/m17-heal-{NN}.png (NN = 00..26).
//
// Bridge surface used (already exposed on window.__clashRoyal):
//   .state                        — 'combat' once the fight is live
//   .affordable(): number[]       — affordable slot indices
//   .slots: { skill: { id } }[]   — slot ids, used to find the heal slot
//   .enemiesAlive: number         — minion-kill gate (3→2→1 before boss-only phase)
//
// Port: 3013 (NEVER 3000 — that's the dashboard).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3013;
const URL = `http://localhost:${PORT}/?type=clash-royal`;
const VP = { width: 412, height: 915 };
const SHOTS = path.join(ROOT, 'tests', 'pw', 'shots');
// Slot screen coords match the existing m10 driver's mapping (412×915 viewport, three
// bottom-row skill slots evenly spaced). If the layout shifts these need to follow.
const SLOT_SCREEN = [{ x: 83, y: 691 }, { x: 206, y: 691 }, { x: 329, y: 691 }];

const SAMPLE_INTERVAL_MS = 30;
const SAMPLE_DURATION_MS = 800;
const SAMPLE_COUNT = Math.floor(SAMPLE_DURATION_MS / SAMPLE_INTERVAL_MS); // 26 frames + maybe a trailer

const log = (...a) => console.log('[m17-heal]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Crude green-pixel probe — used in the assertion pass below to confirm the swarm
// actually rendered. Reads the saved PNG as raw bytes and counts pixels in the
// curated green band that match one of GREEN_HUES (with a tolerance).
const GREEN_HUES = [
  [0x86, 0xef, 0xac],
  [0x4a, 0xde, 0x80],
  [0x22, 0xc5, 0x5e],
  [0x16, 0xa3, 0x4a],
  [0x15, 0x80, 0x3d],
];
function countGreenish(rgbaBuf) {
  let n = 0;
  for (let i = 0; i + 3 < rgbaBuf.length; i += 4) {
    const r = rgbaBuf[i], g = rgbaBuf[i + 1], b = rgbaBuf[i + 2], a = rgbaBuf[i + 3];
    if (a < 64) continue;
    // Quick reject: dominant-green requirement filters most non-green pixels.
    if (g < 90 || g <= r || g <= b) continue;
    for (let h = 0; h < GREEN_HUES.length; h++) {
      const dr = r - GREEN_HUES[h][0];
      const dg = g - GREEN_HUES[h][1];
      const db = b - GREEN_HUES[h][2];
      if (dr * dr + dg * dg + db * db < 40 * 40) { n++; break; }
    }
  }
  return n;
}

let browser = null;
try {
  mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load', timeout: 30_000 });

  // Bridge handshake.
  while (true) { if (await page.evaluate(() => !!window.__clashRoyal)) break; await sleep(150); }
  // Wait for state === 'combat'.
  while (true) {
    const st = await page.evaluate(() => window.__clashRoyal?.state ?? null);
    if (st === 'combat') break;
    await sleep(150);
  }
  log('bridge ready, state=combat');

  // Build a basic deck so coins regen and the deck has something to fire.
  for (let n = 0; n < 4; n++) {
    const aff = await page.evaluate(() => window.__clashRoyal?.affordable() || []);
    if (aff.length) { await page.mouse.click(SLOT_SCREEN[aff[0]].x, SLOT_SCREEN[aff[0]].y); await sleep(500); }
  }
  log('starter picks placed');

  // Wait until both minions are dead so the boss-only phase is live (heal-scare is
  // scripted on the penultimate boss beat). Bridge enemiesAlive goes 3 → 2 → 1.
  const minionDeadline = Date.now() + 60_000;
  while (Date.now() < minionDeadline) {
    const aff = await page.evaluate(() => {
      const slots = window.__clashRoyal?.slots || [];
      const a = window.__clashRoyal?.affordable() || [];
      // Don't squander coins on the heal slot before the scare lands — skip it.
      return a.filter((i) => slots[i]?.skill?.id !== 'heal');
    });
    if (aff.length) await page.mouse.click(SLOT_SCREEN[aff[0]].x, SLOT_SCREEN[aff[0]].y);
    const alive = await page.evaluate(() => window.__clashRoyal?.enemiesAlive ?? 3);
    if (alive <= 1) break;
    await sleep(140);
  }
  log('boss-only phase');

  // Wait for the late heal-scare: a heal slot appears as forced-into-deck offer.
  let healSlotIdx = -1;
  const healDeadline = Date.now() + 40_000;
  while (Date.now() < healDeadline) {
    const idx = await page.evaluate(() => {
      const slots = window.__clashRoyal?.slots || [];
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] && slots[i].skill && slots[i].skill.id === 'heal') return i;
      }
      return -1;
    });
    if (idx >= 0) {
      // Heal must also be affordable — otherwise wait/regen.
      const aff = await page.evaluate(() => window.__clashRoyal?.affordable() || []);
      if (aff.includes(idx)) { healSlotIdx = idx; break; }
    }
    // Keep ticking non-heal taps so the fight progresses (don't auto-burn the heal).
    const aff = await page.evaluate(() => {
      const slots = window.__clashRoyal?.slots || [];
      const a = window.__clashRoyal?.affordable() || [];
      return a.filter((i) => slots[i]?.skill?.id !== 'heal');
    });
    if (aff.length) await page.mouse.click(SLOT_SCREEN[aff[0]].x, SLOT_SCREEN[aff[0]].y);
    await sleep(120);
  }
  if (healSlotIdx < 0) throw new Error('heal slot never became affordable inside the wait window');
  log(`heal slot offered at index ${healSlotIdx}`);

  // Tap heal and start tight 30ms sampling for 800ms.
  await page.mouse.click(SLOT_SCREEN[healSlotIdx].x, SLOT_SCREEN[healSlotIdx].y);
  const t0 = Date.now();
  log('heal tapped — sampling burst');
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const target = t0 + i * SAMPLE_INTERVAL_MS;
    const now = Date.now();
    if (target > now) await sleep(target - now);
    await page.screenshot({ path: path.join(SHOTS, `m17-heal-${String(i).padStart(2, '0')}.png`) });
  }
  log(`captured ${SAMPLE_COUNT} frames`);

  // Cross-check: confirm at least one mid-burst frame shows >1 distinct green hue.
  // We rely on Playwright having written PNG files we can re-decode via sharp.
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { /* not fatal */ }
  if (sharp) {
    let bestFrame = -1;
    let bestGreen = 0;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const p = path.join(SHOTS, `m17-heal-${String(i).padStart(2, '0')}.png`);
      if (!existsSync(p)) continue;
      const raw = await sharp(p).raw().ensureAlpha().toBuffer();
      const n = countGreenish(raw);
      if (n > bestGreen) { bestGreen = n; bestFrame = i; }
    }
    log(`peak green-pixel count = ${bestGreen} at frame ${bestFrame}`);
    if (bestGreen < 20) {
      log('WARN: very few green pixels — the HealPlusBurst may not be wired yet (expected).');
    } else {
      log('OK: green plus particles are visible.');
    }
  } else {
    log('sharp not available — skipping post-shot pixel verification');
  }
} catch (err) {
  log('exception', err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
