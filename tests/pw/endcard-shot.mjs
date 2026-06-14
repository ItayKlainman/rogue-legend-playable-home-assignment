// Screenshot the standalone end card (?type=end_card) — used to verify the
// end-card CTA button visual. Run: node tests/pw/endcard-shot.mjs <tag>
// Mounts EndCardScene directly (no need to drive the whole combo flow).
import { chromium } from 'playwright';

const tag = process.argv[2] || 'endcard';
const URL = 'http://localhost:3000/?type=end_card';
const VP = { width: 412, height: 915 };

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + (e.message || e)));

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none'; });
await page.waitForTimeout(1500); // wait for button appear + shine
await page.screenshot({ path: `/tmp/endcard_${tag}.png` });

console.log(`tag=${tag} shot=/tmp/endcard_${tag}.png`);
console.log('ERRORS:', errors.length ? '\n  ' + errors.join('\n  ') : '(NONE)');
await browser.close();
console.log('DONE');
