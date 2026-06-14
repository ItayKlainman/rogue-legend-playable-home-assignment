// Drive a board-fight fight-only variant through its flow and screenshot it in
// portrait + landscape. Fight-only variants gate each fight (and the progress bar)
// behind tap-to-advance skill-select / reward scenes, so a passive shooter never
// reaches a fight — this taps a vertical spread at center each cycle (hits the
// levelup skill-card AND the reward "Get reward" button; harmless mid-fight) to
// drain the flow, hiding the dev VariantPicker DOM overlay before each shot.
// Verifies: bg covers, enemy layout, FightProgressBarH reflow, win->victory /
// lose->DEFEAT. Requires the dev server running (`npm run dev`).
//
// Usage: node tests/pw/board-fight-bg-shot.mjs <variant> <out-prefix> [both|portrait|landscape] [cycles] [port]
//   e.g. node tests/pw/board-fight-bg-shot.mjs m2_fight_victory_splash /tmp/bf-s2-win
import { chromium } from 'playwright';

const variant = process.argv[2];
const OUT = process.argv[3];
const WHICH = process.argv[4] || 'both';
const CYCLES = Number(process.argv[5] || 22);
const PORT = process.argv[6] || '3000';
if (!variant || !OUT) { console.error('usage: <variant> <out-prefix> [both|portrait|landscape] [cycles] [port]'); process.exit(2); }
const URL = `http://localhost:${PORT}/?type=board-fight&variant=${variant}`;

const ALL = [
  { tag: 'portrait', w: 390, h: 844, taps: [0.42, 0.60, 0.82, 0.88] },
  { tag: 'landscape', w: 844, h: 390, taps: [0.55, 0.62, 0.78, 0.84] },
];
const SIZES = WHICH === 'both' ? ALL : ALL.filter((s) => s.tag === WHICH);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;
for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  const hide = () => page.evaluate(() => { for (const el of Array.from(document.body.children)) if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none'; });
  const advance = async () => { for (const fy of s.taps) await page.mouse.click(s.w * 0.5, s.h * fy); };
  await page.waitForTimeout(2800);
  for (let i = 0; i < CYCLES; i++) {
    await hide();
    await page.screenshot({ path: `${OUT}-${s.tag}-${String(i).padStart(2, '0')}.png` });
    await advance();
    await page.waitForTimeout(2000);
  }
  if (!await page.$('canvas')) { console.error(`[${s.tag}] NO CANVAS`); failed = true; }
  if (errors.length) { console.error(`[${s.tag}] console errors:`, errors.slice(0, 5)); failed = true; }
  console.log(`[${s.tag}] ${CYCLES} frames -> ${OUT}-${s.tag}-NN.png`);
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
