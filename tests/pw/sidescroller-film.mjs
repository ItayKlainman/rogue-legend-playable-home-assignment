// "Film" capture for the Idle Tower Defense (sidescroller) playable — built for the
// game-feel-advisor agent to SEE the run, and for the lead to watch it back.
//
// Why this exists (vs sidescroller-shot.mjs, the unit/error harness): live page.screenshot() on
// software rendering costs ~2.5s each, which dwarfs any sleep and makes a dense, evenly-timed
// capture impossible. So instead we record the run as a real-time .webm and then let ffmpeg
// extract evenly-spaced stills from it — frame timing no longer depends on screenshot cost.
//
//   Video  -> tests/pw/film/run.webm           (for the lead to scrub)
//   Frames -> tests/pw/film/frames/open-*.png   (opening ~7s, 2 fps  -> ~0.5s apart)
//             tests/pw/film/frames/run-*.png    (rest of run, ~0.4 fps -> ~2.5s apart)
//
// Needs ffmpeg on PATH. Reuses a running dev server if present.
// Run: node tests/pw/sidescroller-film.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL = 'http://localhost:3000/?type=sidescroller';
const VP = { width: 412, height: 915 };
const FILM = path.join(ROOT, 'tests', 'pw', 'film');
const FRAMES = path.join(FILM, 'frames');
const RUN_SECONDS = 52;       // length of the ~40-55s playable
const OPEN_SECONDS = 7;       // densely-sampled opening window
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
let browser = null;

try {
  rmSync(FRAMES, { recursive: true, force: true }); // start clean so frames never mix across runs
  mkdirSync(FRAMES, { recursive: true });

  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 1,                 // dPR1 is plenty for the video and keeps it light
    recordVideo: { dir: FILM, size: VP },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { const m = '[PAGEERROR] ' + String(e.stack || e.message || e).slice(0, 600); errors.push(m); log(m); });
  page.on('console', (m) => { if (m.type() === 'error') { const t = '[console.error] ' + m.text().slice(0, 300); errors.push(t); log(t); } });

  await page.goto(URL, { waitUntil: 'load', timeout: 25_000 });

  // Walk the run in real time, tapping the 3 card slots every ~600ms to clear any level-up overlay
  // so the run keeps progressing. No screenshots here — the video is the capture.
  const cardTapsY = [VP.height * 0.5, VP.height * 0.62, VP.height * 0.74];
  const start = Date.now();
  while ((Date.now() - start) / 1000 < RUN_SECONDS) {
    for (const y of cardTapsY) { await page.mouse.click(VP.width / 2, y).catch(() => {}); }
    await sleep(600);
  }

  const videoPath = await page.video().path();
  await ctx.close();                      // flush the .webm to disk
  const runWebm = path.join(FILM, 'run.webm');
  try { rmSync(runWebm, { force: true }); renameSync(videoPath, runWebm); } catch { /* keep hashed name if rename fails */ }
  log('[film] video ->', runWebm);

  // Extract opening-weighted stills from the recorded video.
  const ff = (args) => spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  const src = runWebm;
  ff(['-ss', '0',  '-t', String(OPEN_SECONDS),            '-i', src, '-vf', 'fps=2',   path.join(FRAMES, 'open-%02d.png')]);
  ff(['-ss', String(OPEN_SECONDS), '-i', src,             '-vf', 'fps=0.4', path.join(FRAMES, 'run-%02d.png')]);
  log('[film] frames ->', FRAMES, '(open-*.png ~0.5s apart, run-*.png ~2.5s apart)');

  log(errors.length ? `[RESULT] ${errors.length} runtime error(s) captured` : '[RESULT] no runtime errors');
} catch (err) {
  log('driver exception:', err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
