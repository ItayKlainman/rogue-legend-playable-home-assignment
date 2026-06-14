// Drive the standalone dice-blackjack to its PostGame (Claim/Double buttons) and
// screenshot — verifies the convex CLAIM/DOUBLE buttons after the shared-factory
// refactor. Run: node tests/pw/blackjack-postgame-shot.mjs [variant]
import { chromium } from 'playwright';

const variant = process.argv[2] || 'winRigged';
const URL = `http://localhost:3000/?type=dice-blackjack&variant=${variant}`;
const VP = { width: 412, height: 915 };
const ROLL = { x: 345, y: 858 };
const STAND = { x: 140, y: 858 };

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
const hideOverlay = () => page.evaluate(() => { for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none'; });

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(2500);
await hideOverlay();
await wait(800);
await page.screenshot({ path: `/tmp/bj_pg_${variant}_00_intro.png` });

// winRigged: roll a few mid rolls then STAND → gambler busts → round win → PostGame.
for (let i = 0; i < 3; i++) { await hideOverlay(); await click(ROLL); await wait(1900); }
await hideOverlay();
await page.screenshot({ path: `/tmp/bj_pg_${variant}_01_rolled.png` });
await click(STAND);
await wait(10000);
await hideOverlay();
await page.screenshot({ path: `/tmp/bj_pg_${variant}_02_postgame.png` });

console.log(`variant=${variant}`);
console.log('ERRORS:', errors.length ? '\n  ' + errors.join('\n  ') : '(NONE)');
console.log('shots: /tmp/bj_pg_' + variant + '_*.png');
await browser.close();
console.log('DONE');
