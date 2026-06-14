// HEADLESS verify of Direction A (bj_after_board_loseRigged).
// board (hero starts tile 14) → spin1 (6 hops → tile 8) → skeletonIntro fight →
// spin2 (4 hops → tile 4) → dice-blackjack (loseRigged) → end card.
//
// loseRigged flow (see Sequence.ts + config.ts SCRIPT_LOSE_RIGGED):
//   round 0 is winnable (player reaches PostGame, CLAIM/CHALLENGE shown) →
//   click CHALLENGE (double-or-nothing) → round 1 forcePlayerBust + bustLosesAll →
//   player busts → onLoseAll drains coins → Finished → blackjack end card.
//
// Source of truth: zero pageerrors, variant loads (no "[variant] Failed to load"),
// all stages render. Captures console.error + pageerror + stage screenshots.
import { chromium } from 'playwright';

const VARIANT = 'bj_after_board_loseRigged';
const URL = `http://localhost:3000/?type=board-fight&variant=${VARIANT}`;
const VP = { width: 412, height: 915 };
const OUT = (s) => `/tmp/A_loseRigged_${s}.png`;

// Canvas button coords (CSS px @ 412x915, dev overlay hidden).
const BOARD_ROLL = { x: 256, y: 845 }; // board roll dice (bottom-center)
const ROLL = { x: 345, y: 858 };       // blackjack ROLL (bottom-right)
const STAND = { x: 140, y: 858 };      // blackjack STAND (bottom-left)
const CLAIM = { x: 78, y: 882 };       // PostGame CLAIM (bottom-left, green)
const CHALLENGE = { x: 334, y: 882 };  // PostGame CHALLENGE / double-or-nothin' (bottom-right)

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
const alEvents = [];
let variantFailedToLoad = false;
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[variant] Failed to load variant')) variantFailedToLoad = true;
  if (t.startsWith('[AL] ')) alEvents.push(t.slice(5));
  if (m.type() === 'error') errors.push('[console.error] ' + t.slice(0, 200));
});
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + (e.message || e)));

// Shim the playable's analytics sink so we can observe the funnel from the
// driver (ENDCARD_SHOWN proves the end card mounted). We only stub a window
// global the playable already probes for — no source is modified.
await page.addInitScript(() => {
  window.ALPlayableAnalytics = { trackEvent: (e) => console.log('[AL] ' + e) };
});

const click = (p) => page.mouse.click(p.x, p.y);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (s) => page.screenshot({ path: OUT(s) });

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(3000);
await page.evaluate(() => {
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none';
  }
});
await wait(1000);
await shot('00_board_start'); // hero should be at tile 14 (upper-right edge)

// Spin 1 → tile 8 → skeletonIntro fight
await click(BOARD_ROLL);
await wait(3000); await shot('01_spin1');
await wait(13000); await shot('02_after_fight'); // fight plays + victory + back to board

// Spin 2 → tile 4 → dice-blackjack
await click(BOARD_ROLL);
await wait(5000); await shot('03_blackjack');

// loseRigged round 0 is winnable: playerAlwaysRerollsBust + resetOnFirstBust keep
// the player safe. Roll to a strong score, then STAND. With no forceOpponentBust
// in round 0 the gambler rolls until it passes us — but the player has had a fair
// shot. Either way the round resolves and the scene proceeds toward the end card.
for (let i = 0; i < 4; i++) { await click(ROLL); await wait(1900); }
await shot('04_bj_round0_rolled');
await click(STAND);
await wait(2500); await shot('05_opponent_turn'); // gambler rolls
await wait(6000); await shot('06_round0_result'); // win→PostGame(CLAIM/CHALLENGE) OR clean loss→resolving

// If round 0 WON, PostGame shows CLAIM/CHALLENGE — take the double-or-nothin'
// (CHALLENGE) so round 1's forcePlayerBust + bustLosesAll deliver the rigged loss.
// If round 0 already LOST cleanly, these clicks are harmless no-ops (Finished state).
for (const dy of [0, -8, 8, -16, 16]) { await page.mouse.click(CHALLENGE.x, CHALLENGE.y + dy); await wait(700); }
await wait(2500); await shot('07_round1_or_resolving'); // round 1 Playing, or already resolving to end card

// Round 1: roll into the forced bust. forcePlayerBust climbs to a "feels safe" mid
// score then overshoots 21 → onLoseAll drains coins → resolveDone. (No-op if we
// already resolved from a round-0 loss.)
for (let i = 0; i < 6; i++) { await click(ROLL); await wait(1700); }
await shot('08_loss'); // BUST! winnings vanish (lose_all) OR already gone to end card
await wait(9000); await shot('09_after_loss'); // coin drain + transition

// End card auto-chains after blackjack resolves (requiresRoll(endCard) === false).
await wait(7000); await shot('10_endcard');

const endCardShown = alEvents.includes('ENDCARD_SHOWN');
console.log(`variant=${VARIANT} direction=A(after-board) rig=loseRigged`);
console.log('variantFailedToLoad:', variantFailedToLoad);
console.log('AL funnel:', alEvents.length ? alEvents.join(' -> ') : '(none captured)');
console.log('endCardShown:', endCardShown);
console.log('ERRORS:', errors.length ? '\n  ' + errors.join('\n  ') : '(NONE)');
console.log('screenshots: /tmp/A_loseRigged_00..10_*.png');

await browser.close();

const failed =
  errors.some((e) => e.startsWith('[PAGEERROR]')) ||
  variantFailedToLoad ||
  !endCardShown;
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
console.log('DONE');
process.exit(failed ? 1 : 0);
