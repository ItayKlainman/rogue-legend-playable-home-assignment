// HEADLESS verify of Direction A (bj_after_board_fair): blackjack plays out per RNG (no rig).
// board (hero starts tile 14) -> spin1 (6 hops -> tile 8) -> skeletonIntro fight ->
// spin2 (4 hops -> tile 4) -> dice-blackjack (fair) -> claim/postgame -> end card.
// Source of truth: collects ALL console.error + pageerror events and asserts.
//
// Run: node tests/pw/verify-A-fair.mjs
import { chromium } from 'playwright';

const VARIANT = 'bj_after_board_fair';
const URL = `http://localhost:3000/?type=board-fight&variant=${VARIANT}`;
const VP = { width: 412, height: 915 };
const OUT = (s) => `/tmp/A_fair_${s}.png`;

// Canvas button coords (CSS px @ 412x915, dev overlay hidden)
const BOARD_ROLL = { x: 256, y: 845 }; // board roll dice (bottom-center)
const BJ_ROLL = { x: 345, y: 858 };    // blackjack ROLL (bottom-right)
const STAND = { x: 140, y: 858 };      // blackjack STAND (bottom-left)
const CLAIM = { x: 78, y: 882 };       // PostGame CLAIM (bottom-left, green)

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
let variantFailedToLoad = false;
const allConsole = [];
page.on('console', (m) => {
  const text = m.text();
  allConsole.push(`[${m.type()}] ${text.slice(0, 200)}`);
  if (m.type() === 'error') errors.push('[console.error] ' + text.slice(0, 200));
  if (text.includes('[variant] Failed to load variant')) variantFailedToLoad = true;
});
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + (e.message || e)));

const click = (p) => page.mouse.click(p.x, p.y);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (s) => page.screenshot({ path: OUT(s) });
// The dev VariantPicker is a position:fixed div (bottom-left, z-index:99999) that
// overlaps the bottom-row canvas buttons (STAND/CLAIM) and intercepts clicks. It can
// re-appear across re-mounts, so hide ALL non-canvas body children before each phase.
const hideOverlay = () => page.evaluate(() => {
  for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none';
});

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(3000);
await hideOverlay();
await wait(1000);
await shot('00_board_start');           // hero should be at tile 14 (upper-right edge)

// Spin 1 -> tile 8 -> skeletonIntro fight
await hideOverlay();
await click(BOARD_ROLL);
await wait(3000); await shot('01_spin1');
await wait(18000); await shot('02_after_fight');  // fight plays + victory + back to board

// Spin 2 -> tile 4 -> dice-blackjack (fair)
await hideOverlay();
await click(BOARD_ROLL);
await wait(7000);
await hideOverlay();
await shot('03_blackjack');

// Play blackjack FAIR: roll a few times to a mid score (avoid an immediate first-bust
// that disables STAND), then STAND. Outcome is per-RNG (could win or lose).
for (let i = 0; i < 3; i++) { await hideOverlay(); await click(BJ_ROLL); await wait(1900); }
await hideOverlay();
await shot('04_bj_rolled');
await click(STAND);                     // STAND
await wait(12000); await hideOverlay(); await shot('05_postgame');   // resolution + coin count-up + CLAIM/CHALLENGE
// Click through postgame: CLAIM is the win path; on a loss the button is the
// same bottom-left "continue"/CLAIM. Retry a few Y positions for robustness.
for (const dy of [0, -8, 8, -16, 16]) { await hideOverlay(); await page.mouse.click(CLAIM.x, CLAIM.y + dy); await wait(800); }
await wait(7000); await hideOverlay(); await shot('06_endcard');

console.log(`variant=${VARIANT} direction=A(after-board, fair)`);
console.log('variantFailedToLoad:', variantFailedToLoad);
console.log('ERRORS:', errors.length ? '\n  ' + errors.join('\n  ') : '(NONE)');
console.log('screenshots: /tmp/A_fair_00..06_*.png');

await browser.close();

// Assert: fail (non-zero exit) if any pageerror OR if the variant failed to load.
const pageErrors = errors.filter((e) => e.startsWith('[PAGEERROR]'));
if (variantFailedToLoad) {
  console.error('FAIL: variant failed to load (RED).');
  process.exit(1);
}
if (pageErrors.length) {
  console.error(`FAIL: ${pageErrors.length} pageerror(s).`);
  process.exit(1);
}
console.log('PASS: variant loaded and no pageerrors.');
process.exit(0);
