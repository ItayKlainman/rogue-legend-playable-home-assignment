#!/usr/bin/env node
// m13-leak-shot.mjs — Mission D (clash-royal deck-tile star leak).
//
// Goal: prove the star row leaks below the deck-tile hex border, then re-prove after fix.
// Drives 3 different blue/purple/yellow picks into the deck so we have a row of tiles, and
// captures cropped + full-frame shots of the tray at the playable's native viewport.
//
// Usage:
//   node tests/pw/m13-leak-shot.mjs <tag>
//     tag = "pre"  -> tests/pw/shots/m13-leak-pre-*.png
//     tag = "post" -> tests/pw/shots/m13-leak-post-*.png
//
// Pre: PATH="$PWD/node_modules/.bin:$PATH" playable-scripts dev --port 3011 &
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = process.argv[2] || 'pre';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(__dirname, 'shots');
mkdirSync(SHOTS_DIR, { recursive: true });

const URL = 'http://localhost:3011/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(globalThis).__clashRoyal, { timeout: 30000 });
// Give the playable time to settle — preload + scene mount.
await page.waitForTimeout(1500);
// Sanity check the bridge surface (rebuilds during HMR can briefly null the controller).
await page.waitForFunction(() => {
  const b = (globalThis).__clashRoyal;
  return !!(b && typeof b.affordable === 'function' && typeof b.tapSlot === 'function' && typeof b.forceOffer === 'function');
}, { timeout: 15000 });

const shoot = async (name, clip) => {
  const opts = { path: resolve(SHOTS_DIR, `m13-leak-${TAG}-${name}.png`) };
  if (clip) opts.clip = clip;
  await page.screenshot(opts);
  console.log('[m13]', `m13-leak-${TAG}-${name}.png`);
};

// Pick helper: force id into slot 0, wait until affordable, tap, wait for it in deck.
async function pickAndWait(id, targetStack) {
  await page.evaluate((sid) => (globalThis).__clashRoyal.forceOffer(sid, 0), id);
  await page.waitForFunction(() => (globalThis).__clashRoyal.affordable().includes(0), { timeout: 30000 });
  await page.evaluate(() => (globalThis).__clashRoyal.tapSlot(0));
  await page.waitForFunction(
    (params) => {
      const e = (globalThis).__clashRoyal.deckEntries.find((x) => x.id === params.id);
      return !!(e && e.stack >= params.target);
    },
    { id, target: targetStack },
    { timeout: 15000 },
  ).catch(() => { /* tolerate */ });
  await page.waitForTimeout(1100); // settle slide + pop + star-pop
}

// Pick 3 different skills so we get a TRAY with 3 tiles side-by-side.
// shuriken=blue/tier1, lightningShot=purple/tier2, meteor=yellow/tier3.
// Then merge shuriken twice more so it's at stack 3 (2 stars filled) for a strong read.
await pickAndWait('shuriken', 1);
await pickAndWait('lightningShot', 1);
await pickAndWait('meteor', 1);
// Three more shurikens to fill all 3 stars on tile 0 (stack=4, MAX)
await pickAndWait('shuriken', 2);
await pickAndWait('shuriken', 3);
await pickAndWait('shuriken', 4);

// Geometry probe via the new __clashRoyalDebug bridge (installed by SkillQueue itself under __DEV__).
const geom = await page.evaluate(() => {
  const dbg = (globalThis).__clashRoyalDebug;
  if (!dbg) return null;
  return dbg.trayGeom();
});
if (geom) {
  console.log('[m13] geometry:');
  for (const tile of geom.tiles) {
    const tileBottom = tile.tile.bottom;
    const lowestVisible = Math.max(
      ...tile.cutouts.map((s) => s.bottom),
      ...tile.filled.filter((s) => s.visible).map((s) => s.bottom),
      -Infinity,
    );
    const leak = lowestVisible - tileBottom;
    console.log(
      `[m13]  tile#${tile.i} stack=${tile.stack}: ` +
      `tile.bbox.bottom=${tileBottom.toFixed(2)} ` +
      `lowestStar.bottom=${isFinite(lowestVisible) ? lowestVisible.toFixed(2) : 'N/A'} ` +
      `delta=${isFinite(lowestVisible) ? leak.toFixed(2) : 'N/A'} ` +
      `${leak > 0 ? 'LEAK_BELOW_BBOX' : 'inside'}`,
    );
  }
  console.log('[m13] tray bbox:', JSON.stringify(geom.tray));
} else {
  console.log('[m13] __clashRoyalDebug.trayGeom() unavailable — visual only.');
}

// Determine tray bbox from geom for tight crop.
let trayBox = null;
if (geom && geom.tray) trayBox = geom.tray;

if (trayBox) {
  const pad = 40;
  const tight = {
    x: Math.max(0, Math.floor(trayBox.x - pad)),
    y: Math.max(0, Math.floor(trayBox.y - pad)),
    width: Math.ceil(trayBox.w + pad * 2),
    height: Math.ceil(trayBox.h + pad * 2),
  };
  await shoot('tray-tight', tight);
  const wide = {
    x: 0,
    y: Math.max(0, Math.floor(trayBox.y - 80)),
    width: 540,
    height: Math.min(960 - Math.floor(trayBox.y - 80), Math.ceil(trayBox.h + 200)),
  };
  await shoot('tray-wide', wide);
}
await shoot('full', null);

const finalSnap = await page.evaluate(() => (globalThis).__clashRoyal.deckEntries);
console.log('[m13] final deckEntries:', JSON.stringify(finalSnap));

await browser.close();
console.log('[m13] done.');
