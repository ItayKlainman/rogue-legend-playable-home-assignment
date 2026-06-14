// Discriminate "real desktop layout bug" vs "headless/visibility artifact (frozen ticker)".
// Loads the cold-open at 412x915 desktop in BOTH headless and headed, checks page
// visibility + rAF liveness, and screenshots at 1.5s and 6s (animating vs frozen).
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/?type=board-fight&variant=bj_cold_open_winRigged';

for (const headless of [true, false]) {
  const browser = await chromium.launch({
    headless,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 200)));
  page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.message || e)));
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/pw_instr_${headless ? 'headless' : 'headed'}_1500ms.png` });

  const probe = await page.evaluate(async () => {
    // measure rAF rate over ~600ms
    const start = performance.now();
    let frames = 0;
    await new Promise((res) => {
      function tick() { frames++; if (performance.now() - start < 600) requestAnimationFrame(tick); else res(); }
      requestAnimationFrame(tick);
    });
    return {
      visibility: document.visibilityState,
      hidden: document.hidden,
      hasFocus: document.hasFocus(),
      ptrCoarse: matchMedia('(pointer: coarse)').matches,
      ptrFine: matchMedia('(pointer: fine)').matches,
      dpr: window.devicePixelRatio,
      rafFramesIn600ms: frames,
      debugState: typeof window.__debugState !== 'undefined' ? 'present' : 'absent',
    };
  });
  await page.waitForTimeout(4500); // total ~6s
  await page.screenshot({ path: `/tmp/pw_instr_${headless ? 'headless' : 'headed'}_6000ms.png` });

  console.log(`\n=== headless=${headless} ===`);
  console.log('  probe:', JSON.stringify(probe));
  console.log('  shots:', `/tmp/pw_instr_${headless ? 'headless' : 'headed'}_{1500,6000}ms.png`);
  console.log('  console (last 12):', logs.length ? '\n    ' + logs.slice(-12).join('\n    ') : '(none)');
  await browser.close();
}
console.log('\nDONE');
