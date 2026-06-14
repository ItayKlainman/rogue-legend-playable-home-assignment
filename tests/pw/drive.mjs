// Generic variant driver for board×blackjack combo variants. Brute-forces through
// the flow (robust to win/lose RNG) while capturing ALL console errors + pageerrors
// and screenshotting key stages. Screenshots are namespaced by variant.
//
// Run: node tests/pw/drive.mjs <variant>
//   Direction A (bj_after_board_*): board -> spin -> blackjack -> end card
//   Direction B (bj_cold_open_*):   blackjack cold-open -> board -> fight -> end card
import { chromium } from 'playwright';

const variant = process.argv[2];
if (!variant) { console.error('usage: node tests/pw/drive.mjs <variant>'); process.exit(2); }
const isColdOpen = variant.includes('cold_open');
const URL = `http://localhost:3000/?type=board-fight&variant=${variant}`;
const VP = { width: 412, height: 915 };
const OUT = (s) => `/tmp/v_${variant}_${s}.png`;

// Canvas button coords (CSS px @ 412x915, dev overlay hidden)
const ROLL = { x: 345, y: 858 };      // blackjack ROLL (bottom-right)
const STAND = { x: 140, y: 858 };     // blackjack STAND (bottom-left)
const CLAIM = { x: 78, y: 882 };      // PostGame CLAIM (bottom-left, green)
const BOARD_ROLL = { x: 256, y: 845 };// board roll dice (bottom-center)

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 180)); });
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + (e.message || e)));

const click = (p) => page.mouse.click(p.x, p.y);
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(1500);
await page.evaluate(() => { for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none'; });
await wait(1200);
await page.screenshot({ path: OUT('00_initial') });

async function playBlackjack(tag) {
  for (let i = 0; i < 4; i++) { await click(ROLL); await wait(1900); }
  await page.screenshot({ path: OUT(tag + '_rolled') });
  await click(STAND);
  await wait(10000); // gambler busts + coin count-up + buttons reveal
  await page.screenshot({ path: OUT(tag + '_postgame') });
  // CLAIM (retry a few Y positions for robustness)
  for (const dy of [0, -8, 8, -16]) { await page.mouse.click(CLAIM.x, CLAIM.y + dy); await wait(700); }
  await wait(5500); // coin rain + done + transition
}

if (isColdOpen) {
  // Direction B: blackjack first
  await playBlackjack('bj');
  await page.screenshot({ path: OUT('10_board') });   // board after cold-open (Bug 2 site)
  await wait(1600);
  await page.screenshot({ path: OUT('11_board2') });   // liveness frame
  await click(BOARD_ROLL);
  await wait(5500);
  await page.screenshot({ path: OUT('12_fight') });     // scripted spin -> skeleton fight
  await wait(6000);
  await page.screenshot({ path: OUT('13_after') });     // fight / end card
} else {
  // Direction A: board first
  await page.screenshot({ path: OUT('05_board') });
  await click(BOARD_ROLL);
  await wait(5000);
  await page.screenshot({ path: OUT('06_blackjack') }); // blackjack after spin
  await playBlackjack('bj');
  await page.screenshot({ path: OUT('20_after') });      // end card
}

console.log(`variant=${variant} direction=${isColdOpen ? 'B(cold-open)' : 'A(after-board)'}`);
console.log('ERRORS:', errors.length ? '\n  ' + errors.join('\n  ') : '(NONE)');
console.log('screenshots: /tmp/v_' + variant + '_*.png');
await browser.close();
console.log('DONE');
