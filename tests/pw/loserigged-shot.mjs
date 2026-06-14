// Play standalone loseRigged: roll N times then STAND, screenshot the gambler's
// result — to confirm the player loses to a VARIED, believable gambler total
// (not always 21). Run: node tests/pw/loserigged-shot.mjs <rolls> <tag>
import { chromium } from 'playwright';

const rolls = Number(process.argv[2] || 2);
const tag = process.argv[3] || `r${rolls}`;
const URL = 'http://localhost:3000/?type=dice-blackjack&variant=loseRigged';
const VP = { width: 412, height: 915 };
const ROLL = { x: 345, y: 858 }, STAND = { x: 140, y: 858 };

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

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(5000); await hide();  // wait out the LoadBar before the scene is interactive
for (let i = 0; i < rolls; i++) { await hide(); await page.mouse.click(ROLL.x, ROLL.y); await wait(2100); }
await hide(); await page.screenshot({ path: `/tmp/lose_${tag}_pre.png` });   // player's stand
await page.mouse.click(STAND.x, STAND.y);
// Capture rapidly through the gambler's turn to catch its final total + the loss
// before the scene resolves to the end card.
for (let i = 0; i < 8; i++) { await hide(); await page.screenshot({ path: `/tmp/lose_${tag}_g${i}.png` }); await wait(700); }

console.log(`tag=${tag} rolls=${rolls}`);
console.log('PAGEERRORS:', errs.length ? errs.join('; ') : '(NONE)');
await browser.close();
console.log('DONE');
