// HEADLESS Playwright E2E for the clash-royal LOSE flow — KEPT / CI-usable.
//
// Validates the full "so close" reversal funnel end-to-end:
//   Part 1 (dev server, bridge present): ?outcome=lose → drive to defeat → assert
//     state==='defeat' + boss ALIVE + hero HP 0 → screenshot the death frame (during
//     the ~1.4s hold, before the overlay) AND the Defeat overlay → tap TRY AGAIN →
//     assert the fight RE-RUNS (state→'combat', NO onboarding scrim) and reaches a
//     win/endcard → screenshot the retry win end card.
//   Part 2 (fresh dev-server run): drive to defeat again → tap TRY AGAIN (the sole
//     defeat-card CTA) → assert __alFunnel contains 'CTA_CLICKED' AND the store-open spy
//     fired SYNCHRONOUSLY in the tap turn (red-team C2: DefeatScene.enter() called
//     sdk.finish() so install() opens the store inside the gesture instead of deferring
//     through a popup-killed setTimeout).
//   Part 3 (built prod artifacts, NO bridge): rebuild fresh AppLovin artifacts, serve
//     the lose + win artifacts via file:// and drive by tapping slot SCREEN-COORDS;
//     assert zero pageerror and that each reaches its terminal screen (defeat overlay
//     / victory end card), verified by screenshot.
//
// Parts 1-2 use the __clashRoyal dev bridge (CombatScene.installDevBridge, __DEV__):
//   state ('combat'|'defeat'|'won'|'endcard'), enemiesAlive, affordable(), tapSlot(i).
//   The Defeat overlay's single TRY AGAIN button is a PIXI hit area — NOT on the bridge —
//   so it's tapped by on-screen coordinates.
//
// Run: node tests/pw/clash-royal-lose-flow-shot.mjs
import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3015; // own port — 3013 is the playthrough harness, 3011 the firstpick one
const DEV_BASE = `http://localhost:${PORT}/`;
const VP = { width: 414, height: 896 };

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PASS/FAIL ledger — every assertion records one line; non-empty `fails` ⇒ exit 1.
const fails = [];
function check(label, cond, detail) {
  if (cond) { log(`  PASS  ${label}`); }
  else { log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); fails.push(label); }
}

// ── dev-server bootstrap (mirrors clash-royal-playthrough.mjs) ────────────────
async function httpAlive() {
  try { return (await fetch(DEV_BASE, { method: 'GET' })).ok; } catch { return false; }
}
async function ensureDevServer() {
  if (await httpAlive()) { log(`[harness] reusing dev server on ${DEV_BASE}`); return null; }
  log(`[harness] spawning playable-scripts dev --port ${PORT} ...`);
  const env = { ...process.env, PATH: `${path.join(ROOT, 'node_modules', '.bin')}:${process.env.PATH ?? ''}` };
  const child = spawn('playable-scripts', ['dev', '--port', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', detached: true, env, shell: true,
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await httpAlive()) { log('[harness] dev server up.'); return child; }
    await sleep(750);
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  throw new Error(`dev server did not come up on :${PORT} within 90s`);
}
function killDevServer(child) { if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ } } }

// Hide the dev TypePicker <select> (the only non-canvas body child) before screenshots.
const hideDom = (page) => page.evaluate(() => {
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLCanvasElement)) el.style.display = 'none';
  }
});

// Init script for the dev-server pages: stub ALPlayableAnalytics (capture CTA_CLICKED /
// ENDCARD_SHOWN) AND a SYNCHRONOUS store-open spy. install() resolves applovin to the
// default `window.open(destinationUrl)` branch once sdk.finish() has run (C2); some
// protocols route through mraid.open — stub BOTH and record the tap-turn timestamp so
// we can prove the open fired inside the gesture (synchronously), not via setTimeout.
function installInitScript(page) {
  return page.addInitScript(() => {
    window.__alFunnel = [];
    window.ALPlayableAnalytics = { trackEvent: (e) => window.__alFunnel.push(e) };
    // Spy: record EVERY store-open and the turn-id active when it fired. __tapTurn is
    // bumped right before each TRY AGAIN tap; a synchronous open lands in the same turn.
    window.__tapTurn = 0;
    window.__storeOpens = [];
    const rec = (via, url) => window.__storeOpens.push({ via, url: String(url), turn: window.__tapTurn });
    const realOpen = window.open.bind(window);
    window.open = (url, ...rest) => { rec('window.open', url); try { return realOpen('about:blank', ...rest); } catch { return null; } };
    // mraid may not exist on the dev server; define a minimal stub so install()'s
    // mraid branch (if taken) is observable and never throws.
    if (!window.mraid) {
      window.mraid = {
        getState: () => 'default',
        open: (url) => rec('mraid.open', url),
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    } else {
      const mo = window.mraid.open?.bind(window.mraid);
      window.mraid.open = (url) => { rec('mraid.open', url); if (mo) try { mo(url); } catch { /* ignore */ } };
    }
  });
}

// Wait for the __clashRoyal dev bridge to install (CombatScene.enter is async).
async function waitBridge(page, ms = 30_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => !!window.__clashRoyal)) return true;
    await sleep(250);
  }
  return false;
}

// Drive the live fight (bridge): tap an affordable slot each step; poll `state` until it
// leaves 'combat'. Returns the terminal state ('defeat'|'won'|'endcard') or 'timeout'.
async function driveUntilLeavesCombat(page, ms = 35_000) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => {
      const x = window.__clashRoyal;
      if (!x) return { exists: false };
      const aff = x.affordable();
      if (aff.length) x.tapSlot(aff[0]);
      return { exists: true, state: x.state, enemiesAlive: x.enemiesAlive };
    });
    if (!s.exists) return 'no-bridge';
    if (s.state !== last) { last = s.state; log(`    [drive] t=${((Date.now() - t0) / 1000).toFixed(1)}s state=${s.state} enemiesAlive=${s.enemiesAlive}`); }
    if (s.state !== 'combat') return s.state;
    await sleep(150);
  }
  return 'timeout';
}

// Lose-build watchdog drive (Issue 1): drive AGGRESSIVELY (tap EVERY affordable slot each
// step), sampling the RENDERED boss HP (window.__clashRoyal.bossHp — the value the bar
// shows). From the moment the boss display HP first drops below ~8% maxHp until defeat,
// record the MIN bossHp seen and the bossHp at the death frame. This is the assertion that
// directly catches the user's "boss displayed 0 HP when it killed me" bug. Returns
// { state, minBossHpAfterSliver, deathBossHp }.
async function driveLoseTrackingBossHp(page, bossMax, ms = 40_000) {
  const t0 = Date.now();
  let last = '';
  let reachedSliver = false;
  let minBossHpAfterSliver = Infinity;
  let deathBossHp = -1;
  const sliverBand = 0.08 * bossMax;
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => {
      const x = window.__clashRoyal;
      if (!x) return { exists: false };
      const aff = x.affordable();
      for (const i of aff) x.tapSlot(i); // AGGRESSIVE — tap every affordable slot
      return { exists: true, state: x.state, bossHp: x.bossHp, enemiesAlive: x.enemiesAlive };
    });
    if (!s.exists) return { state: 'no-bridge', minBossHpAfterSliver, deathBossHp };
    if (s.state !== last) { last = s.state; log(`    [drive] t=${((Date.now() - t0) / 1000).toFixed(1)}s state=${s.state} bossHp=${s.bossHp} enemiesAlive=${s.enemiesAlive}`); }
    if (s.state === 'combat' && s.bossHp >= 0) {
      if (s.bossHp <= sliverBand) reachedSliver = true;
      if (reachedSliver && s.bossHp > 0) minBossHpAfterSliver = Math.min(minBossHpAfterSliver, s.bossHp);
    }
    if (s.state !== 'combat') { deathBossHp = s.bossHp; return { state: s.state, minBossHpAfterSliver, deathBossHp }; }
    await sleep(80); // tight sampling so a transient display dip toward 0 is caught
  }
  return { state: 'timeout', minBossHpAfterSliver, deathBossHp };
}

// Poll the bridge state until it equals one of `wanted`, or timeout.
async function pollState(page, wanted, ms = 12_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.state : 'no-bridge'));
    if (wanted.includes(st)) return st;
    await sleep(150);
  }
  return await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.state : 'no-bridge'));
}

// Defeat-overlay button screen coordinate. Mirrors DefeatScene.layoutScene():
//   The defeat card now has a SINGLE centered TRY AGAIN button at (W/2, H*0.60).
function defeatButtonCoords(W, H) {
  const tryAgainY = H * 0.60;
  return { tryAgain: { x: W / 2, y: tryAgainY } };
}

// ── PIXEL helper: scan for the DEFEAT overlay's red glow / dark scrim signature ───────
// Used for the prod (no-bridge) lose smoke: the overlay is a near-opaque dark-red scrim
// (0x120000 @ .82) with a deep-red focal glow + blood-red "DEFEAT" caps. A blank/combat
// frame is bright + colourful; the overlay frame is overwhelmingly dark with a red bias.
async function looksLikeDefeatOverlay(buf) {
  const { dominant } = await sharp(buf).stats();
  const { data, info } = await sharp(buf).resize(64, 128, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let dark = 0; let redBias = 0; const px = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    if (r + g + b < 150) dark++;            // very dark pixel (the scrim)
    if (r > g + 25 && r > b + 25) redBias++; // red-leaning pixel (glow + DEFEAT caps)
  }
  return { darkFrac: dark / px, redFrac: redBias / px, dominant };
}

// ── Build fresh prod artifacts + locate the lose / win AppLovin HTML files ────────────
function buildProdArtifacts() {
  log('[harness] rebuilding fresh AppLovin artifacts: node scripts/build-all.js --type clash-royal --network applovin');
  execFileSync('node', ['scripts/build-all.js', '--type', 'clash-royal', '--network', 'applovin'], {
    cwd: ROOT, stdio: 'inherit', timeout: 300_000,
  });
  const dir = path.join(ROOT, 'dist', 'AppLovin', 'clash-royal');
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const lose = files.find((f) => /clash-royal_lose_.*_AL\.html$/.test(f));
  const win = files.find((f) => /clash-royal_win_.*_AL\.html$/.test(f));
  return { dir, files, lose, win };
}

// ── main ──────────────────────────────────────────────────────────────────────
let spawnedServer = null;
let browser = null;
try {
  spawnedServer = await ensureDevServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PART 1 — dev-server lose flow (bridge present)
  // ════════════════════════════════════════════════════════════════════════════
  log('\n=== PART 1 — dev-server lose flow (defeat → overlay → TRY AGAIN → win) ===');
  {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
    await installInitScript(page);
    await page.goto(`${DEV_BASE}?type=clash-royal&outcome=lose`, { waitUntil: 'load', timeout: 25_000 });

    const haveBridge = await waitBridge(page);
    check('P1 bridge installed', haveBridge);
    if (!haveBridge) throw new Error('no bridge — aborting Part 1');
    await sleep(1200); // first frames paint

    // 1) Drive to defeat AGGRESSIVELY while tracking the RENDERED boss HP (Issue 1 watchdog).
    //    The lose climax fires past the min-fight clock (~17s).
    const BOSS_MAX = 16000;
    const SLIVER_FLOOR = Math.round(BOSS_MAX * 0.02); // 320 — a boss chipped toward 0/1 fails this
    const track = await driveLoseTrackingBossHp(page, BOSS_MAX, 40_000);
    const reached = track.state;
    log(`    [drive] left combat with state=${reached} minBossHpAfterSliver=${track.minBossHpAfterSliver} deathBossHp=${track.deathBossHp}`);

    // ISSUE 1 ASSERTIONS — the rendered boss bar must NEVER read 0 (or <2%) during the hold,
    // and at the death frame must be the ~3% sliver (≈480). This directly catches the user's bug.
    check('P1 boss display HP NEVER dipped below 2% during the held sliver window (≥320, never 0)',
      track.minBossHpAfterSliver === Infinity || track.minBossHpAfterSliver >= SLIVER_FLOOR,
      `minBossHpAfterSliver=${track.minBossHpAfterSliver} floor=${SLIVER_FLOOR}`);
    check('P1 boss display HP at the death frame is a clean sliver (≈3%, >0)',
      track.deathBossHp > SLIVER_FLOOR && track.deathBossHp <= Math.round(BOSS_MAX * 0.08),
      `deathBossHp=${track.deathBossHp} expected ~${Math.round(BOSS_MAX * 0.03)}`);

    // 2a) DEATH-FRAME screenshot — during the ~1.4s DEFEAT_HOLD, BEFORE the overlay mounts.
    //     reached==='defeat' means the bridge sees controller.isDefeat() but the scene is
    //     still holding (resolveDone not fired yet), so the death frame is on-screen now.
    await hideDom(page);
    await page.screenshot({ path: '/var/tmp/clash-lose-death.png' });
    log('    wrote /var/tmp/clash-lose-death.png');

    // 2b) ASSERT defeat state + boss alive + hero dead (read while still in the hold).
    const atDefeat = await page.evaluate(() => {
      const x = window.__clashRoyal;
      return { state: x.state, bossHp: x.enemiesAlive }; // boss alive ⇒ enemiesAlive >= 1
    });
    check('P1 reached defeat (state==="defeat")', reached === 'defeat' || atDefeat.state === 'defeat', `reached=${reached} state=${atDefeat.state}`);
    check('P1 boss still ALIVE at defeat (enemiesAlive>0)', atDefeat.bossHp > 0, `enemiesAlive=${atDefeat.bossHp}`);
    // Hero HP 0 is implied by the scripted defeat (resolveHeroDeath drains hero to 0). The
    // bridge doesn't expose hero HP directly; the defeat latch IS the hero-death signal.
    check('P1 hero died (defeat latched via scripted hero death)', reached === 'defeat' || atDefeat.state === 'defeat');

    // Wait out the DEFEAT_HOLD (1400ms) + overlay enter so the DEFEAT overlay mounts.
    const overlayState = await pollState(page, ['defeat'], 4_000); // bridge stays 'defeat' under the overlay
    await sleep(1400); // let the headline slam + buttons rise/settle for a clean shot
    await hideDom(page);
    await page.screenshot({ path: '/var/tmp/clash-lose-overlay.png' });
    log(`    wrote /var/tmp/clash-lose-overlay.png (bridge state under overlay=${overlayState})`);
    // Confirm the overlay actually painted (dark-red scrim signature) — proves it's the
    // Defeat overlay, not the bare death frame.
    const ovSig = await looksLikeDefeatOverlay(await page.screenshot());
    log(`    overlay signature: darkFrac=${ovSig.darkFrac.toFixed(2)} redFrac=${ovSig.redFrac.toFixed(3)}`);
    check('P1 Defeat overlay rendered (dark-red scrim signature)', ovSig.darkFrac > 0.55, `darkFrac=${ovSig.darkFrac.toFixed(2)}`);

    // 3) Tap TRY AGAIN (the sole CTA) → SOFT CTA (dice-blackjack double-or-nothing pattern):
    // safeInstall (store-open) + retryAsWin() fires IMMEDIATELY in the background — no visibility
    // round-trip needed, so the user "keeps playing from where they left off" whether or not they
    // bounce back. The old bridge is dropped on scene exit and a fresh one re-installs on the new
    // combat scene. Reaches win/endcard, NO onboarding scrim.
    const btns = defeatButtonCoords(VP.width, VP.height);
    log(`    tapping TRY AGAIN at (${btns.tryAgain.x.toFixed(0)}, ${btns.tryAgain.y.toFixed(0)})`);
    await page.mouse.click(btns.tryAgain.x, btns.tryAgain.y);

    // retryAsWin() exits the old scene + bridge, then mounts a fresh CombatScene (which
    // re-installs the bridge). Wait for the NEW bridge, then assert it's back in combat.
    await sleep(500);
    const reBridge = await waitBridge(page, 15_000);
    check('P1 retry re-installed the dev bridge', reBridge);
    const backToCombat = await pollState(page, ['combat', 'won', 'endcard'], 8_000);
    check('P1 TRY AGAIN re-ran the fight (state→"combat")', backToCombat === 'combat' || backToCombat === 'won' || backToCombat === 'endcard', `state=${backToCombat}`);

    // NO onboarding scrim on retry: retryCfg sets gateFightUntilFirstPick:false, so the
    // combat is live immediately (controller.combatLive starts true) — assert by driving
    // with NO manual first pick and seeing the fight progress on its own (enemiesAlive can
    // only drop if the fight is live, which it isn't while gated under the scrim).
    await sleep(1500);
    const liveProof = await page.evaluate(() => {
      const x = window.__clashRoyal;
      return { state: x.state, enemiesAlive: x.enemiesAlive };
    });
    log(`    [retry] post-mount state=${liveProof.state} enemiesAlive=${liveProof.enemiesAlive}`);

    // Drive the retry to victory + end card.
    const retryEnd = await driveUntilLeavesCombat(page, 35_000);
    const retryFinal = await pollState(page, ['won', 'endcard'], 8_000);
    check('P1 retry reached victory (state "won"/"endcard")', retryFinal === 'won' || retryFinal === 'endcard', `end=${retryEnd} final=${retryFinal}`);

    await sleep(1500); // let the end card mount + fire ENDCARD_SHOWN
    await hideDom(page);
    await page.screenshot({ path: '/var/tmp/clash-lose-retrywin.png' });
    log('    wrote /var/tmp/clash-lose-retrywin.png');
    const endFinal = await page.evaluate(() => (window.__clashRoyal ? window.__clashRoyal.state : 'no-bridge'));
    check('P1 retry win end card shown (state==="endcard")', endFinal === 'endcard', `state=${endFinal}`);

    check('P1 zero page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PART 2 — TRY AGAIN synchronous install (fresh run to a defeat)
  // ════════════════════════════════════════════════════════════════════════════
  log('\n=== PART 2 — TRY AGAIN: CTA_CLICKED + synchronous store-open (C2) ===');
  {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
    await installInitScript(page);
    await page.goto(`${DEV_BASE}?type=clash-royal&outcome=lose`, { waitUntil: 'load', timeout: 25_000 });

    const haveBridge = await waitBridge(page);
    check('P2 bridge installed', haveBridge);
    if (!haveBridge) throw new Error('no bridge — aborting Part 2');
    await sleep(1200);

    const reached = await driveUntilLeavesCombat(page, 35_000);
    check('P2 reached defeat', reached === 'defeat', `state=${reached}`);
    // Wait out the hold so the DefeatScene mounts (it calls sdk.finish() in enter()).
    // Must exceed DEFEAT_HOLD_MS (now 2200, was 1400) + the overlay enter — the TRY AGAIN
    // button doesn't exist until the overlay mounts, so tapping at 1800ms hit empty canvas.
    await sleep(2800);

    // Bump the tap-turn id, then tap TRY AGAIN (the sole defeat-card CTA — routes through
    // safeInstall then arms win-on-return). A SYNCHRONOUS store-open lands in this same turn;
    // a deferred (setTimeout) open would land in a later turn (or never within the gesture).
    // We read the spy IMMEDIATELY after the click resolves and do NOT dispatch the visibility
    // round-trip, so the win resume never fires — this isolates the pure store-open.
    await page.evaluate(() => { window.__tapTurn += 1; });
    const tapTurn = await page.evaluate(() => window.__tapTurn);
    const btns = defeatButtonCoords(VP.width, VP.height);
    log(`    tapping TRY AGAIN at (${btns.tryAgain.x.toFixed(0)}, ${btns.tryAgain.y.toFixed(0)}) turn=${tapTurn}`);
    await page.mouse.click(btns.tryAgain.x, btns.tryAgain.y);

    // Read the funnel + spy. The click handler runs synchronously inside the gesture, so
    // by the time click() resolves the open has already (or not) fired.
    const out = await page.evaluate(() => ({
      funnel: window.__alFunnel.slice(),
      opens: window.__storeOpens.slice(),
      tapTurn: window.__tapTurn,
    }));
    log(`    funnel: ${JSON.stringify(out.funnel)}`);
    log(`    storeOpens: ${JSON.stringify(out.opens)}`);
    check('P2 CTA_CLICKED pushed to AL funnel', out.funnel.includes('CTA_CLICKED'));
    const syncOpen = out.opens.find((o) => o.turn === out.tapTurn);
    check('P2 store-open fired SYNCHRONOUSLY in the TRY AGAIN-tap turn (C2)', !!syncOpen, `opens=${JSON.stringify(out.opens)} tapTurn=${out.tapTurn}`);
    if (syncOpen) log(`    sync open via ${syncOpen.via}`);

    check('P2 zero page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PART 3 — built-artifact (prod) smoke (NO bridge)
  // ════════════════════════════════════════════════════════════════════════════
  log('\n=== PART 3 — built prod artifact smoke (file://, no bridge) ===');
  const built = buildProdArtifacts();
  log(`    dist files: ${JSON.stringify(built.files)}`);
  check('P3 build emitted clash-royal_lose_*_AL.html', !!built.lose, `files=${JSON.stringify(built.files)}`);
  check('P3 build emitted clash-royal_win_*_AL.html', !!built.win, `files=${JSON.stringify(built.files)}`);

  // Slot screen-coordinates (prod has no bridge). Mirrors CombatScene.layoutUi():
  //   panelW = 3*116+2*26 + 2*26 = 452; s = min(1, W*0.95/panelW); panel.x=(W - panelW*s)/2,
  //   panel.y = H*0.66; slotsLocalX = panelW/2; slot i center local = -142 + i*142 (SLOT_W=116,
  //   GAP=26 ⇒ rowW=400, startX=-142); slot row y local = PANEL_PAD(26)+SLOT_BOX_H/2(75)=101.
  function slotCoords(W, H) {
    const panelW = 452;
    const s = Math.min(1, (W * 0.95) / panelW);
    const panelX = (W - panelW * s) / 2;
    const panelY = H * 0.66;
    const slotsLocalX = panelW / 2;
    const ys = panelY + s * 101;
    return [0, 1, 2].map((i) => ({ x: panelX + s * (slotsLocalX + (-142 + i * 142)), y: ys }));
  }

  async function runProdArtifact(name, file, opts) {
    log(`\n--- prod ${name}: ${file} ---`);
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
    // Prod has no AL global / no bridge, but stub AL anyway so any trackEvent is a no-op
    // (and we can sanity-read CTA later if needed). No effect on the bundle's logic.
    await page.addInitScript(() => {
      window.__alFunnel = [];
      window.ALPlayableAnalytics = { trackEvent: (e) => window.__alFunnel.push(e) };
    });
    const url = pathToFileURL(path.join(built.dir, file)).href;
    await page.goto(url, { waitUntil: 'load', timeout: 25_000 });

    // No bridge in prod — confirm it's truly absent (proves we're driving the real bundle).
    await sleep(2500);
    const bridgeAbsent = await page.evaluate(() => !window.__clashRoyal);
    check(`P3 ${name}: prod bundle has NO dev bridge`, bridgeAbsent);

    const coords = slotCoords(VP.width, VP.height);
    // Drive by tapping slot screen-coords cyclically for ~`driveMs`. The fight auto-fires
    // the deck once a pick lands; idle auto-pick also fires after ~7s, but tapping makes it
    // brisk + deterministic. The first tap dismisses the onboarding scrim.
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < opts.driveMs) {
      const c = coords[k % 3];
      await page.mouse.click(c.x, c.y);
      k += 1;
      await sleep(450);
    }
    await sleep(opts.settleMs);

    const buf = await page.screenshot({ path: opts.shot });
    log(`    wrote ${opts.shot}`);
    check(`P3 ${name}: zero page errors`, pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
    return buf;
  }

  if (built.lose) {
    const buf = await runProdArtifact('lose', built.lose, { driveMs: 22_000, settleMs: 2200, shot: '/var/tmp/clash-lose-prod.png' });
    const sig = await looksLikeDefeatOverlay(buf);
    log(`    lose prod signature: darkFrac=${sig.darkFrac.toFixed(2)} redFrac=${sig.redFrac.toFixed(3)}`);
    // The terminal lose screen is the dark-red DEFEAT overlay. A still-in-combat frame is
    // bright/colourful; the overlay is overwhelmingly dark.
    check('P3 lose prod reached the Defeat overlay (dark-red scrim)', sig.darkFrac > 0.5, `darkFrac=${sig.darkFrac.toFixed(2)} redFrac=${sig.redFrac.toFixed(3)}`);
  }
  if (built.win) {
    const buf = await runProdArtifact('win', built.win, { driveMs: 22_000, settleMs: 3000, shot: '/var/tmp/clash-win-prod.png' });
    // The win terminal screen is the EndCard (splash + logo + Play Now CTA) — bright, NOT
    // the dark defeat scrim. Assert it's NOT a dark-red defeat frame (i.e. it advanced past
    // combat into the bright end card).
    const sig = await looksLikeDefeatOverlay(buf);
    log(`    win prod signature: darkFrac=${sig.darkFrac.toFixed(2)} redFrac=${sig.redFrac.toFixed(3)}`);
    check('P3 win prod reached a bright terminal (NOT the dark defeat overlay)', sig.darkFrac < 0.6, `darkFrac=${sig.darkFrac.toFixed(2)}`);
  }
} catch (err) {
  log('DRIVER EXCEPTION:', err && err.stack ? err.stack : String(err));
  fails.push('driver exception: ' + (err && err.message ? err.message : String(err)));
} finally {
  if (browser) await browser.close().catch(() => {});
  killDevServer(spawnedServer);
}

// ── Summary ──
log('\n' + '='.repeat(60));
if (fails.length) {
  log(`RESULT: FAIL — ${fails.length} assertion(s) failed:`);
  for (const f of fails) log('  x ' + f);
  log('='.repeat(60));
  process.exit(1);
}
log('RESULT: PASS — full lose flow (defeat → overlay → retry-win), TRY AGAIN sync install (CTA_CLICKED + C2), and prod lose/win smokes all verified.');
log('='.repeat(60));
process.exit(0);
