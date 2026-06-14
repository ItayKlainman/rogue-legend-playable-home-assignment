// Playwright diagnostic: load a board-fight combo variant at several viewports,
// screenshot each, and capture console + runtime errors. Deterministic repro for
// the "blackjack renders broken at some window sizes" report.
//
// Run: node tests/pw/diag-coldopen.mjs [variant]
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/?type=board-fight&variant=';
const variant = process.argv[2] || 'bj_cold_open_winRigged';
const viewports = [
  { w: 412, h: 915 },   // mobile-emulation size that rendered fine in the extension
  { w: 360, h: 780 },   // small phone
  { w: 390, h: 844 },   // iPhone-ish
  { w: 600, h: 900 },   // wider portrait (aspect > 0.5625 ref)
  { w: 820, h: 1000 },  // tablet-ish wide portrait
];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + (e.message || e)));
  try {
    await page.goto(BASE + variant, { waitUntil: 'load', timeout: 20000 });
  } catch (e) {
    console.log(`\n=== ${vp.w}x${vp.h} === GOTO FAILED: ${e.message}`);
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(4000); // let intro settle
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return {
      innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio,
      canvas: c ? { w: c.width, h: c.height, cssW: c.style.width, cssH: c.style.height } : null,
    };
  });
  const shot = `/tmp/pw_${variant}_${vp.w}x${vp.h}.png`;
  await page.screenshot({ path: shot });
  console.log(`\n=== viewport ${vp.w}x${vp.h} (aspect ${(vp.w / vp.h).toFixed(3)}) ===`);
  console.log('  page:', JSON.stringify(info));
  console.log('  shot:', shot);
  console.log('  errors:', errors.length ? '\n    ' + errors.slice(0, 15).join('\n    ') : '(none)');
  await ctx.close();
}
await browser.close();
console.log('\nDONE');
