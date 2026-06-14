// HEADED drive of Direction A (bj_after_board_winRigged) so a human can watch.
// board (hero starts tile 14) → spin1 (6 hops → tile 8) → skeletonIntro fight →
// spin2 (4 hops → tile 4) → dice-blackjack (winRigged) → claim → end card.
// Captures console errors + pageerrors + stage screenshots.
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/?type=board-fight&variant=bj_after_board_winRigged';
const VP = { width: 412, height: 915 };

const browser = await chromium.launch({ headless: false, slowMo: 250 }); // visible window, slowed for watching
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 180)); });
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + (e.message || e)));

const click = (x, y) => page.mouse.click(x, y);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (s) => page.screenshot({ path: `/tmp/headedA_${s}.png` });

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(3000);
await page.evaluate(() => { for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none'; });
await wait(1000);
await shot('00_board_start');           // hero should be at tile 14 (upper-right edge)

// Spin 1 → tile 8 → skeletonIntro fight
await click(256, 845);
await wait(3000); await shot('01_spin1');
await wait(13000); await shot('02_after_fight');  // fight plays + victory + back to board

// Spin 2 → tile 4 → dice-blackjack
await click(256, 845);
await wait(5000); await shot('03_blackjack');

// Play blackjack (winRigged): 3 rolls to a mid score (avoid the first-bust reset to 0,
// which disables STAND), then STAND → gambler busts → win → CLAIM → end card.
for (let i = 0; i < 3; i++) { await click(345, 858); await wait(1900); }
await shot('04_bj_rolled');
await click(140, 858);                  // STAND
await wait(12000); await shot('05_postgame');   // gambler busts + coin count-up + CLAIM/CHALLENGE
for (const dy of [0, -8, 8, -16, 16]) { await click(78, 882 + dy); await wait(800); } // CLAIM (retry Y)
await wait(7000); await shot('06_endcard');

console.log('ERRORS:', errors.length ? '\n  ' + errors.join('\n  ') : '(NONE)');
console.log('shots: /tmp/headedA_00..06_*.png');
await browser.close();
console.log('DONE');
