#!/usr/bin/env node
// m14-star-anim-shot.mjs — Mission #8 (clash-royal star spin+burst transition) validation.
//
// Drives one merge of the SAME blue skill, then samples ~40ms-spaced screenshots while
// continuously re-forcing the same skill into slot 0 (so the slot CARD keeps showing it
// — the controller naturally refills with a different offer after each tap, which would
// destroy the read). Captures:
//   • Pre-merge baseline (3 cutouts, 0 filled stars on slot card AND tile)
//   • Mid-spin (cutout spinning + scaling)
//   • Swap moment (particles bursting around the new gold star)
//   • Settle (gold star at full size + lingering sparkles fading)
//
// Two parallel sequences saved:
//   tests/pw/shots/m14-anim-slot-{NN}.png  (slot card upgrade row close-up)
//   tests/pw/shots/m14-anim-tile-{NN}.png  (deck tile in the tray)
//
// Pre: PATH="$PWD/node_modules/.bin:$PATH" playable-scripts dev --port 3011 &
// Run: node tests/pw/m14-star-anim-shot.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(__dirname, 'shots');
mkdirSync(SHOTS_DIR, { recursive: true });

const URL = 'http://localhost:3011/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(globalThis).__clashRoyal, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.waitForFunction(() => {
  const b = (globalThis).__clashRoyal;
  return !!(b && typeof b.affordable === 'function' && typeof b.tapSlot === 'function' && typeof b.forceOffer === 'function');
}, { timeout: 15000 });

const blueId = 'shuriken';
console.log('[m14] using blue id:', blueId);

// ── First pick: adds shuriken to the deck (stack=1, no stars filled) AND dismisses
//    the onboarding overlay. Settle for the fly+land+onboarding-dismiss animation. ──
await page.evaluate((id) => (globalThis).__clashRoyal.forceOffer(id, 0), blueId);
await page.waitForFunction(() => (globalThis).__clashRoyal.affordable().includes(0), { timeout: 30000 });
await page.evaluate(() => (globalThis).__clashRoyal.tapSlot(0));
// Wait LONG enough for onboarding-fadeOut + fly-to-deck + tile-pop to fully settle so
// the panel is at its final rest position when we begin sampling.
await page.waitForTimeout(2000);
console.log('[m14] after first pick:', JSON.stringify(await page.evaluate(() => (globalThis).__clashRoyal.deckEntries)));

// Re-arm slot 0 with shuriken. Wait until it becomes affordable so the next tap merges.
await page.evaluate((id) => (globalThis).__clashRoyal.forceOffer(id, 0), blueId);
await page.waitForFunction(() => (globalThis).__clashRoyal.affordable().includes(0), { timeout: 30000 });
await page.waitForTimeout(300);

// Probe tray geometry for the tile crop.
const trayProbe = await page.evaluate(() => {
  const dbg = (globalThis).__clashRoyalDebug;
  return dbg ? dbg.trayGeom() : null;
});
console.log('[m14] tray (pre-merge):', trayProbe ? JSON.stringify(trayProbe.tray) : 'unavailable');

// Crops. Tile crop is centered on the FIRST tile (the shuriken tile we're merging into).
const firstTile = trayProbe?.tiles?.[0]?.tile;
const tileCrop = firstTile
  ? {
      x: Math.max(0, Math.floor(firstTile.x - 28)),
      y: Math.max(0, Math.floor(firstTile.y - 28)),
      width: Math.min(540, Math.ceil(firstTile.w + 56)),
      height: Math.ceil(firstTile.h + 56),
    }
  : { x: 220, y: 520, width: 100, height: 130 };
// Slot crop targets slot 0 (left-most position) in the post-onboarding panel layout.
// The panel sits at the bottom of the viewport; slot 0 is at roughly x≈90 (center) and
// y≈790. Capture a generous box covering the slot card + its star row + a bit below.
const slotCrop = { x: 30, y: 700, width: 180, height: 200 };

const shoot = async (tag, idx, crop) => {
  const path = resolve(SHOTS_DIR, `m14-anim-${tag}-${String(idx).padStart(2, '0')}.png`);
  await page.screenshot({ path, clip: crop });
};

// Pre-tap baseline at idx=0.
await shoot('slot', 0, slotCrop);
await shoot('tile', 0, tileCrop);

// ── Continuous re-force loop ──
// We need the slot 0 to KEEP showing shuriken as the merge animation runs. Without this,
// the controller refills slot 0 with a different skill the moment the merge resolves,
// and the slot card's animation gets cut off (currentId changes → starFx.cancelAll).
//
// Strategy: fire the merge tap, then in a tight loop sample frames + re-force the offer.
// We sample at ~40ms intervals via wall-clock, using page.evaluate for each operation.
const tapTime = Date.now();
await page.evaluate(() => (globalThis).__clashRoyal.tapSlot(0));
console.log('[m14] merge tap fired at t=0');

const FRAMES = 20;
const INTERVAL_MS = 40;
for (let i = 1; i <= FRAMES; i++) {
  const target = tapTime + i * INTERVAL_MS;
  const now = Date.now();
  if (target > now) await page.waitForTimeout(target - now);
  // Keep shuriken in slot 0 so the slot CARD render reflects the live deck stack
  // of shuriken (and its star row animates as the stack increments).
  await page.evaluate((id) => (globalThis).__clashRoyal.forceOffer(id, 0), blueId);
  await shoot('slot', i, slotCrop);
  await shoot('tile', i, tileCrop);
}
// Settled frame ~1100ms after tap.
await page.waitForTimeout(220);
await page.evaluate((id) => (globalThis).__clashRoyal.forceOffer(id, 0), blueId);
await page.waitForTimeout(80);
await shoot('slot', FRAMES + 1, slotCrop);
await shoot('tile', FRAMES + 1, tileCrop);

const after = await page.evaluate(() => (globalThis).__clashRoyal.deckEntries);
console.log('[m14] after merge deckEntries:', JSON.stringify(after));
const after2 = await page.evaluate(() => (globalThis).__clashRoyalDebug?.trayGeom());
console.log('[m14] tray after merge:', after2 ? JSON.stringify(after2.tray) + ' tiles=' + after2.tiles.length : 'unavailable');

await browser.close();
console.log('[m14] done — captured', FRAMES + 2, 'frames for slot AND tile.');
