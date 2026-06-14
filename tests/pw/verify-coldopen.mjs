// Verify the reworked cold-open: blackjack → CROSSFADE → board (hero on bj tile 4)
// → roll (5 = 3+2) → land on tile 39 fight → end card. Captures rapid frames across
// the minigame→board hand-off to eyeball the dissolve.
// Run: node tests/pw/verify-coldopen.mjs [variant]
import { chromium } from 'playwright';

const variant = process.argv[2] || 'bj_cold_open_winRigged';
const URL = `http://localhost:3000/?type=board-fight&variant=${variant}`;
const VP = { width: 412, height: 915 };
const ROLL = { x: 345, y: 858 }, STAND = { x: 140, y: 858 }, CLAIM = { x: 78, y: 882 }, BOARD_ROLL = { x: 256, y: 845 };

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 140)));
const wait = (ms) => page.waitForTimeout(ms);
const hide = () => page.evaluate(() => { for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none'; });
const shot = (s) => page.screenshot({ path: `/tmp/co_${variant}_${s}.png` });

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(1800); await hide();

// Cold-open blackjack
for (let i = 0; i < 4; i++) { await hide(); await page.mouse.click(ROLL.x, ROLL.y); await wait(1900); }
await hide(); await page.mouse.click(STAND.x, STAND.y); await wait(9000);
for (const dy of [0, -8, 8, -16]) { await hide(); await page.mouse.click(CLAIM.x, CLAIM.y + dy); await wait(700); }

// Rapid frames across the claim-resolve + crossfade to the board.
for (let i = 0; i < 10; i++) { await hide(); await shot(`fade_${String(i).padStart(2, '0')}`); await wait(220); }
await wait(800); await hide(); await shot('board');   // hero should be on tile 4

// One board roll → 5 hops → tile 39 fight
await page.mouse.click(BOARD_ROLL.x, BOARD_ROLL.y);
await wait(6000); await hide(); await shot('fight');   // skeleton fight on tile 39
await wait(7000); await hide(); await shot('after');

console.log(`variant=${variant}`);
console.log('PAGEERRORS:', errs.length ? errs.join('; ') : '(NONE)');
console.log('shots: /tmp/co_' + variant + '_*.png');
await browser.close();
console.log('DONE');
