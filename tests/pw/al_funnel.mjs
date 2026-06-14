// Capture the AppLovin analytics funnel (event + ms-since-load) by stubbing
// window.ALPlayableAnalytics BEFORE the app loads, then driving the flow.
// Verifies CHALLENGE_PASS_* milestones spread across the WHOLE combo (P2 fix).
// Run: node tests/pw/al_funnel.mjs <variant>
import { chromium } from 'playwright';

const variant = process.argv[2] || 'bj_cold_open_winRigged';
const isColdOpen = variant.includes('cold_open');
const URL = `http://localhost:3000/?type=board-fight&variant=${variant}`;
const VP = { width: 412, height: 915 };
const ROLL = { x: 345, y: 858 }, STAND = { x: 140, y: 858 }, CLAIM = { x: 78, y: 882 }, BOARD_ROLL = { x: 256, y: 845 };

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();
// Stub the AL global before any app code runs; record event + ms since first script.
await page.addInitScript(() => {
  window.__t0 = performance.now();
  window.__alFunnel = [];
  window.ALPlayableAnalytics = { trackEvent: (e) => { window.__alFunnel.push(`${e}@${Math.round(performance.now() - window.__t0)}`); } };
});
const errors = [];
page.on('pageerror', (e) => errors.push('[PAGEERROR] ' + (e.message || e)));

const click = (p) => page.mouse.click(p.x, p.y);
const wait = (ms) => page.waitForTimeout(ms);
const hide = () => page.evaluate(() => { for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none'; });

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await wait(1800); await hide();

async function playBlackjack() {
  for (let i = 0; i < 4; i++) { await hide(); await click(ROLL); await wait(1900); }
  await hide(); await click(STAND); await wait(10000);
  for (const dy of [0, -8, 8, -16]) { await hide(); await page.mouse.click(CLAIM.x, CLAIM.y + dy); await wait(700); }
  await wait(4000);
}

if (isColdOpen) {
  await playBlackjack();        // cold-open blackjack → drains leading event (expect PASS_25)
  await wait(1500); await hide();
  await click(BOARD_ROLL); await wait(6000);  // spin → fight (expect PASS_50)
  await wait(6000);             // fight resolves → endCard (expect PASS_75 + ENDCARD_SHOWN)
  await wait(3000);
} else {
  await hide(); await click(BOARD_ROLL); await wait(4500);   // spin1 → fight (PASS_25)
  await wait(13000); await hide();                            // fight done
  await click(BOARD_ROLL); await wait(5000);                  // spin2 → blackjack (PASS_50)
  await playBlackjack();                                      // → endCard (PASS_75)
  await wait(4000);
}

const funnel = await page.evaluate(() => window.__alFunnel || []);
console.log(`variant=${variant}`);
console.log('FUNNEL:', funnel.join('  '));
console.log('PAGEERRORS:', errors.length ? errors.join('; ') : '(NONE)');
await browser.close();
console.log('DONE');
