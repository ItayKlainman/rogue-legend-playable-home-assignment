// Deterministic Direction-B drive: hide the dev variant-picker DOM overlay (it
// occludes the canvas STAND/Claim buttons), win the blackjack via STAND
// (winRigged -> opponent always busts), then Claim -> seamlessReplace board.
// Verifies Bug 2: no pageerror (Director ticker survives) + board is alive.
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/?type=board-fight&variant=bj_cold_open_winRigged';
const VP = { width: 412, height: 915 };

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 180)); });
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + (e.message || e)));

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(1500);
// Hide the dev variant-picker overlay so canvas buttons at the bottom are clickable.
await page.evaluate(() => {
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none';
  }
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/drive_s0_clean.png' });

// Roll a few times to get a mid score, then STAND (bottom-left).
const ROLL = { x: 345, y: 858 };
const STAND = { x: 140, y: 858 };
for (let i = 0; i < 3; i++) { await page.mouse.click(ROLL.x, ROLL.y); await page.waitForTimeout(1900); }
await page.screenshot({ path: '/tmp/drive_s1_rolled.png' });
await page.mouse.click(STAND.x, STAND.y);
await page.waitForTimeout(11500); // gambler busts + coin count-up + Claim/Challenge buttons reveal
await page.screenshot({ path: '/tmp/drive_s2_postgame.png' });

// CLAIM (green, bottom-left) -> done resolves -> seamlessReplace(board). THIS is
// where Bug 2 manifested (orphaned ticker handlers killing the board after the
// blackjack exit). Capture the board + verify it's alive.
await page.mouse.click(80, 888);
await page.waitForTimeout(6000); // coin rain + done (RESOLVE_DELAY) + board.enter()
await page.screenshot({ path: '/tmp/drive_s3_board.png' });
await page.waitForTimeout(1600);
await page.screenshot({ path: '/tmp/drive_s4_board2.png' });

// Liveness/interactivity: roll on the board -> scripted spin/hop -> skeletonIntro fight.
await page.mouse.click(256, 845);
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/drive_s5_rolled.png' });
await page.waitForTimeout(4500);
await page.screenshot({ path: '/tmp/drive_s6_fight.png' });

console.log('errors:', errors.length ? '\n  ' + errors.join('\n  ') : '(none)');
console.log('shots: /tmp/drive_s2_postgame.png .. drive_s6_fight.png');
await browser.close();
console.log('DONE');
