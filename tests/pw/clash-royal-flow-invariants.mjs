// COMPREHENSIVE flow-and-logic invariant harness for the clash-royal playable — KEPT / CI-usable.
//
// Drives the REAL app (dev server + __clashRoyal bridge) across ALL THREE player journeys,
// samples the RENDERED scene + the flow state machine every ~100ms, and hard-asserts a full
// invariant battery CONTINUOUSLY (not just at the terminal frame). Exits non-zero on ANY
// violation. This is the superset companion to clash-royal-lose-flow-shot.mjs: that one
// screenshots; this one proves the logic/flow of the rendered ad is correct end-to-end.
//
// Journeys, each run across several seeds/cadences (E2E is slow — a handful exercises the
// state machine; the rig batch sim already runs 1000s of seeds for the NUMERIC invariants):
//   LOSE  (?type=clash-royal&outcome=lose)   — driven both AGGRESSIVE and IDLE
//   WIN   (?type=clash-royal)                — driven aggressive
//   RETRY (lose → TRY AGAIN → win)           — the reversal funnel
//
// Bridge surface used (CombatScene.installDevBridge, __DEV__ only):
//   state, heroHp, bossHp, heroAnim, bossAnim, heroDead, bossAlive, liveVfxCount,
//   slotSkillIds, onboardingActive, enemiesAlive, affordable(), tapSlot(i).
// The Defeat overlay's single TRY AGAIN button is a PIXI hit area (not on the bridge) —
// tapped by on-screen coordinates (mirrors clash-royal-lose-flow-shot.mjs).
//
// Run: node tests/pw/clash-royal-flow-invariants.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3025; // own port — NOT 3000 (live dev) / 3015 (lose-flow shot) / 3013 (playthrough)
const DEV_BASE = `http://localhost:${PORT}/`;
const VP = { width: 414, height: 896 };

// Domain constants (read from config.ts: BOSS_HP=16000, sliver=3%, fightClock.minMs=17000).
const BOSS_MAX = 16000;
const SLIVER = Math.round(BOSS_MAX * 0.03); // 480 — the forced lose sliver
const SLIVER_2PCT = Math.round(BOSS_MAX * 0.02); // 320 — hard floor: boss bar must NEVER dip below this
const MIN_FIGHT_MS = 17000;
const DIE_ANIMS = new Set(['Dead', 'Death', 'Die', 'Dying']);

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PASS/FAIL ledger ─────────────────────────────────────────────────────────
// Each invariant id is asserted once per flow-run; a single violation across all sampled
// frames flips it to FAIL. We print one line per (flow, invariant) and exit 1 if any failed.
const results = []; // { flow, id, pass, detail }
function record(flow, id, pass, detail) { results.push({ flow, id, pass, detail }); }

// ── dev-server bootstrap (mirrors clash-royal-lose-flow-shot.mjs) ─────────────
async function httpAlive() { try { return (await fetch(DEV_BASE, { method: 'GET' })).ok; } catch { return false; } }
async function ensureDevServer() {
  if (await httpAlive()) { log(`[harness] reusing dev server on ${DEV_BASE}`); return null; }
  log(`[harness] spawning playable-scripts dev --port ${PORT} ...`);
  const env = { ...process.env, PATH: `${path.join(ROOT, 'node_modules', '.bin')}:${process.env.PATH ?? ''}` };
  const child = spawn('playable-scripts', ['dev', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore', detached: true, env, shell: true });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) { if (await httpAlive()) { log('[harness] dev server up.'); return child; } await sleep(750); }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  throw new Error(`dev server did not come up on :${PORT} within 90s`);
}
function killDevServer(child) { if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ } } }

// addInitScript: stub ALPlayableAnalytics (ordered funnel) + synchronous store-open spy.
function installInitScript(page) {
  return page.addInitScript(() => {
    window.__alFunnel = [];
    window.ALPlayableAnalytics = { trackEvent: (e) => window.__alFunnel.push(e) };
    window.__tapTurn = 0;
    window.__storeOpens = [];
    const rec = (via, url) => window.__storeOpens.push({ via, url: String(url), turn: window.__tapTurn });
    const realOpen = window.open.bind(window);
    window.open = (url, ...rest) => { rec('window.open', url); try { return realOpen('about:blank', ...rest); } catch { return null; } };
    if (!window.mraid) {
      window.mraid = { getState: () => 'default', open: (url) => rec('mraid.open', url), addEventListener: () => {}, removeEventListener: () => {} };
    } else {
      const mo = window.mraid.open?.bind(window.mraid);
      window.mraid.open = (url) => { rec('mraid.open', url); if (mo) try { mo(url); } catch { /* ignore */ } };
    }
  });
}

async function waitBridge(page, ms = 30_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await page.evaluate(() => !!window.__clashRoyal)) return true; await sleep(200); }
  return false;
}

// Snapshot the full bridge surface (one round-trip).
//
// The store-open stub (window.open → realOpen('about:blank')) and the endcard/CTA redirect
// can tear down the page's JS execution context at the exact instant a snap eval is in flight,
// which Playwright surfaces as "Execution context was destroyed, most likely because of a
// navigation". That is a transient page-navigation race, NOT an invariant violation — so we
// catch it, retry once after a short settle, and if it persists return a benign skip sample
// the sampling loops drop (`continue`). No assertion is weakened: a skipped frame contributes
// no PASS and no FAIL; the next real frame resumes the continuous battery.
async function snapOnce(page, tap) {
  return page.evaluate((doTap) => {
    const x = window.__clashRoyal;
    if (!x) return { exists: false };
    if (doTap) { const aff = x.affordable(); if (doTap === 'all') { for (const i of aff) x.tapSlot(i); } else if (aff.length) x.tapSlot(aff[0]); }
    return {
      exists: true,
      state: x.state, heroHp: x.heroHp, bossHp: x.bossHp,
      heroAnim: x.heroAnim, bossAnim: x.bossAnim,
      heroDead: x.heroDead, bossAlive: x.bossAlive,
      liveVfxCount: x.liveVfxCount, slotSkillIds: x.slotSkillIds,
      onboardingActive: x.onboardingActive, enemiesAlive: x.enemiesAlive,
    };
  }, tap);
}
const isNavTeardown = (e) => /Execution context was destroyed|frame was detached|Target closed|Most likely the page has been closed/i.test(String(e?.message ?? e));
async function snap(page, tap) {
  try { return await snapOnce(page, tap); }
  catch (e) {
    if (!isNavTeardown(e)) throw e;
    await sleep(150);
    // Retry WITHOUT re-tapping — a re-tap could double-fire a CTA. A read-only retry is enough.
    try { return await snapOnce(page, false); }
    catch (e2) { if (!isNavTeardown(e2)) throw e2; return { exists: true, skip: true }; }
  }
}

// Legal state transitions (universal). win: combat→won→endcard | lose: combat→defeat→endcard.
const LEGAL_NEXT = {
  combat: new Set(['combat', 'won', 'defeat']),
  won: new Set(['won', 'endcard']),
  defeat: new Set(['defeat', 'endcard']),
  endcard: new Set(['endcard']),
};

// ── LOSE flow ──────────────────────────────────────────────────────────────────
// cadence: 'all' = aggressive (tap every affordable slot), 'idle' = never tap (drive by the
// scene's own idle auto-pick clock). Both must satisfy the SAME battery.
async function runLose(page, seed, cadence) {
  const FLOW = `LOSE[seed=${seed},${cadence}]`;
  log(`\n--- ${FLOW} ---`);
  const t0 = Date.now();
  // Trackers for the continuous battery.
  let legalTransitions = true, lastState = null, transDetail = '';
  let heroHpNonNeg = true, bossHpNonNeg = true;
  let bossNeverZero = true, bossNeverBelow2pct = true, bossZeroDetail = '';
  let reachedSliver = false; // only assert the sliver floor once the boss is actually in the sliver band
  let heroAlivePreLatch = true, heroPreLatchDetail = '';
  let bossNeverDeathAnim = true, bossAlwaysAlive = true, bossDeadDetail = '';
  let neverWon = true;
  let healNeverOffered = true, healDetail = '';
  // LOSE-5: after the defeat latch the only NEW transient the death sequence legitimately spawns
  // is the single big red killing-blow damage number (showDamageNumber, fired AFTER halt()). The
  // VFX-leak bug ("skills keep shooting") leaves many in-flight projectiles/arcs (5+) AND keeps
  // spawning more across the hold. So we bound the post-latch peak to a small number (the death
  // number + at most one float) and require it to settle back toward 0 by the end of the hold.
  const VFX_DEATH_BUDGET = 3;
  let vfxPeakAfterLatch = 0, vfxLastSample = 0, vfxDetail = '', defeatLatched = false;
  // LOSE-6: catch a REVIVE (Die anim → Idle/attack while still dead). The death sequence legitimately
  // keeps the hero in its prior anim during the boss-lunge windup (boss swings THEN hero dies), so we
  // only assert AFTER the hero has actually entered a Die anim — from then it must NEVER leave Die.
  let heroEnteredDie = false, heroDieHeld = true, heroDieDetail = '';
  let deathBossHp = -1, sawDefeat = false;
  let defeatLatchAtMs = -1;
  let heroSlumpedBeforeCard = true; // hero in Die anim BEFORE state===endcard
  // BUG 1 (LOSE-HEAL): in lose combat heroHp is MONOTONICALLY NON-INCREASING — with scares
  // suppressed it only ever drops (melee chip + the death drain). Any frame-over-frame RISE is
  // the scare-recovery heal. Sampled every frame; FAIL on any increase.
  let heroHpMonotone = true, prevHeroHp = -1, heroHealDetail = '';
  // BUG 2 (LOSE-BOSS-FROZEN): once heroDead (or state==='defeat'), bossHp is pinned at the sliver
  // and NEVER changes again. Capture it at the death latch; any later differing sample is a
  // post-death hit landing on the boss.
  let bossFrozenAfterDeath = true, frozenBossHp = -1, bossFrozenDetail = '';

  const cadenceArg = cadence === 'all' ? 'all' : false;
  const DRIVE_MS = 60_000;
  while (Date.now() - t0 < DRIVE_MS) {
    const s = await snap(page, cadenceArg);
    if (s.skip) continue; // transient navigation-teardown frame — drop, resume next tick
    if (!s.exists) { record(FLOW, 'bridge', false, 'bridge vanished mid-flow'); return; }
    const tMs = Date.now() - t0;

    // Universal
    if (lastState && s.state !== lastState && !LEGAL_NEXT[lastState]?.has(s.state)) { legalTransitions = false; transDetail = `${lastState}→${s.state}`; }
    lastState = s.state;
    if (s.heroHp < 0) heroHpNonNeg = false;
    if (s.bossHp < 0) bossHpNonNeg = false;

    // LOSE-1 / LOSE-8: boss bar never 0 / never below 2% while alive in combat
    if (s.state === 'combat' && s.bossAlive) {
      if (s.bossHp <= SLIVER_2PCT) reachedSliver = true;
      if (s.bossHp === 0) { bossNeverZero = false; bossZeroDetail = `bossHp=0 at ${tMs}ms`; }
      if (reachedSliver && s.bossHp > 0 && s.bossHp < SLIVER_2PCT) { bossNeverBelow2pct = false; bossZeroDetail ||= `bossHp=${s.bossHp} (<${SLIVER_2PCT}) at ${tMs}ms`; }
    }
    // LOSE-HEAL (BUG 1): heroHp monotonically non-increasing across lose combat. Only assert
    // while in combat (the retry/endcard reset to full is a legitimate jump). A RISE is the
    // suppressed scare's auto-recover heal.
    if (s.state === 'combat') {
      if (prevHeroHp >= 0 && s.heroHp > prevHeroHp) { heroHpMonotone = false; heroHealDetail ||= `heroHp rose ${prevHeroHp}→${s.heroHp} at ${tMs}ms`; }
      prevHeroHp = s.heroHp;
    }
    // LOSE-BOSS-FROZEN (BUG 2): after the hero dies (heroDead / state==='defeat'), bossHp is
    // pinned at the sliver — capture once, then every later sample must equal it.
    if (s.heroDead || s.state === 'defeat') {
      if (frozenBossHp < 0) frozenBossHp = s.bossHp;
      else if (s.bossHp !== frozenBossHp) { bossFrozenAfterDeath = false; bossFrozenDetail ||= `bossHp changed ${frozenBossHp}→${s.bossHp} after hero death at ${tMs}ms`; }
    }
    // LOSE-2: hero HP must not hit 0 while still in combat (pre-defeat-latch)
    if (s.state === 'combat' && s.heroHp === 0) { heroAlivePreLatch = false; heroPreLatchDetail = `heroHp=0 in combat at ${tMs}ms`; }
    // LOSE-3: boss never plays a death anim; bossAlive stays true
    if (s.bossAnim && DIE_ANIMS.has(s.bossAnim)) { bossNeverDeathAnim = false; bossDeadDetail = `bossAnim=${s.bossAnim} at ${tMs}ms`; }
    if (s.state !== 'endcard' && !s.bossAlive) { bossAlwaysAlive = false; bossDeadDetail ||= `bossAlive=false (state=${s.state}) at ${tMs}ms`; }
    // LOSE-4: never reach 'won'
    if (s.state === 'won') { neverWon = false; }
    // LOSE-7: 'heal' never offered during lose combat
    if (s.state === 'combat' && s.slotSkillIds.includes('heal')) { healNeverOffered = false; healDetail = `slots=${JSON.stringify(s.slotSkillIds)} at ${tMs}ms`; }

    // Defeat-latch-gated invariants
    if (s.state === 'defeat') {
      if (!defeatLatched) { defeatLatched = true; defeatLatchAtMs = tMs; sawDefeat = true; if (deathBossHp < 0) deathBossHp = s.bossHp; }
      // LOSE-5: post-latch transient count stays within the death-sequence budget.
      if (s.liveVfxCount > VFX_DEATH_BUDGET) { vfxDetail ||= `liveVfx peaked at ${s.liveVfxCount} (>${VFX_DEATH_BUDGET}) at ${tMs}ms`; }
      vfxPeakAfterLatch = Math.max(vfxPeakAfterLatch, s.liveVfxCount);
      vfxLastSample = s.liveVfxCount;
      // LOSE-6: once the hero has entered Die, heroAnim must stay a Die anim (no revive to Idle/attack).
      if (s.heroAnim && DIE_ANIMS.has(s.heroAnim)) heroEnteredDie = true;
      if (heroEnteredDie && s.heroAnim && !DIE_ANIMS.has(s.heroAnim)) { heroDieHeld = false; heroDieDetail = `heroAnim reverted to ${s.heroAnim} after Die at ${tMs}ms`; }
    }
    // LOSE-9 evidence: at the moment we first see endcard, the hero must already be slumped (Die).
    if (s.state === 'endcard' && s.heroDead && s.heroAnim && !DIE_ANIMS.has(s.heroAnim)) { heroSlumpedBeforeCard = false; }

    if (s.state === 'endcard') break; // terminal — funnel asserted after the loop
    // In LOSE the bridge stays 'defeat' under the overlay (it waits for TRY AGAIN), so
    // it never reaches 'endcard' on its own. Once we've sampled the full defeat hold (latch + 5s,
    // which covers the death sequence, VFX settle, and the Die-hold), stop driving and move on.
    if (defeatLatched && tMs - defeatLatchAtMs > 5_000) break;
    await sleep(100);
  }

  // Funnel + defeat-card timing (DOM/coords): tap TRY AGAIN to fire the CTA if still on defeat.
  const finalState = await page.evaluate(() => window.__clashRoyal?.state ?? 'gone');
  // If we latched defeat but the card hasn't mounted, the DefeatScene overlay is up; tap TRY AGAIN.
  if (sawDefeat) {
    // LOSE-9: the defeat card mounts only AFTER the hero is slumped (entered Die) AND ≥ minMs.
    // The bridge latches 'defeat' only at/after the killing blow, which the rig gates past the
    // min-fight clock; the DefeatScene overlay (ENDCARD_SHOWN) then mounts after DEFEAT_HOLD —
    // strictly later still. So latch ≥ minMs AND the hero having reached Die proves the ordering.
    record(FLOW, 'LOSE-9 defeat latch ≥ minMs(17s) & hero slumped before card',
      defeatLatchAtMs >= MIN_FIGHT_MS - 1500 && heroEnteredDie && heroSlumpedBeforeCard,
      `defeatLatchAtMs=${defeatLatchAtMs} heroEnteredDie=${heroEnteredDie}`);
  }

  // Fire the CTA via TRY AGAIN (synchronous store-open proof) — the SOLE defeat-card button now
  // routes through safeInstall (CTA_CLICKED + sync store open) then arms win-on-return. We do NOT
  // dispatch the visibility hide→show here, so the win resume never triggers — this checks the
  // pure store-open in the tap turn.
  const { tryAgain } = defeatButtonCoords(VP.width, VP.height);
  if (finalState === 'defeat') {
    await page.evaluate(() => { window.__tapTurn++; });
    await page.mouse.click(tryAgain.x * 1, tryAgain.y * 1); // viewport coords (DSR handled by PW)
    await sleep(800);
  }
  const funnel = await page.evaluate(() => window.__alFunnel.slice());
  const opens = await page.evaluate(() => window.__storeOpens.slice());

  // ── Record the LOSE battery ──
  record(FLOW, 'UNIV legal state transitions', legalTransitions, transDetail);
  record(FLOW, 'UNIV heroHp >= 0', heroHpNonNeg);
  record(FLOW, 'UNIV bossHp >= 0', bossHpNonNeg);
  record(FLOW, 'LOSE-1 boss bar NEVER 0 in combat (the boss-0hp class)', bossNeverZero, bossZeroDetail);
  record(FLOW, 'LOSE-1 boss bar NEVER < 2% sliver while alive', bossNeverBelow2pct, bossZeroDetail);
  record(FLOW, 'LOSE-2 hero HP > 0 through combat (only 0 at/after killing blow)', heroAlivePreLatch, heroPreLatchDetail);
  record(FLOW, 'LOSE-3 boss never plays death anim', bossNeverDeathAnim, bossDeadDetail);
  record(FLOW, 'LOSE-3 boss stays alive through defeat', bossAlwaysAlive, bossDeadDetail);
  record(FLOW, 'LOSE-4 state NEVER reaches won', neverWon);
  // LOSE-5: peak within budget (no projectile leak) AND settled back toward 0 by end of hold (no sustained spawning).
  record(FLOW, 'LOSE-5 no VFX leak after defeat (peak ≤ budget & settles)',
    vfxPeakAfterLatch <= VFX_DEATH_BUDGET && vfxLastSample <= VFX_DEATH_BUDGET,
    vfxDetail || `peak=${vfxPeakAfterLatch} last=${vfxLastSample}`);
  // LOSE-6: the hero MUST have entered a Die anim during the defeat hold AND, once it did, must
  // never revert to Idle/attack (the "hero revives" leak). Both halves catch the revive class.
  record(FLOW, 'LOSE-6 hero enters Die and stays (no revive)', heroEnteredDie && heroDieHeld,
    heroDieDetail || (heroEnteredDie ? '' : 'hero never entered a Die anim during the defeat hold'));
  record(FLOW, 'LOSE-7 heal NEVER offered during lose combat', healNeverOffered, healDetail);
  // LOSE-HEAL (BUG 1): hero HP never RISES during lose combat (scare-recovery heal suppressed).
  record(FLOW, 'LOSE-HEAL hero HP monotonically non-increasing (no scare heal)', heroHpMonotone, heroHealDetail);
  // LOSE-BOSS-FROZEN (BUG 2): boss HP pinned at the sliver after the hero dies (no post-death hit).
  record(FLOW, 'LOSE-BOSS-FROZEN boss HP never changes after hero death', sawDefeat && bossFrozenAfterDeath, bossFrozenDetail || (sawDefeat ? '' : 'never latched defeat'));
  record(FLOW, 'LOSE-8 boss bar ≈ 480 sliver at death frame (never 0)', sawDefeat && deathBossHp >= SLIVER_2PCT && deathBossHp <= SLIVER * 1.3, `deathBossHp=${deathBossHp}`);
  // LOSE-10: funnel order + TRY AGAIN synchronous store-open.
  const wantOrder = ['LOADING', 'LOADED', 'DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_PASS_25', 'CHALLENGE_PASS_50', 'CHALLENGE_PASS_75', 'ENDCARD_SHOWN'];
  record(FLOW, 'LOSE-10 funnel in order (LOADING→…→ENDCARD_SHOWN)', isSubsequenceInOrder(funnel, wantOrder), `funnel=${JSON.stringify(funnel)}`);
  const tryAgainTurn = await page.evaluate(() => window.__tapTurn);
  const syncOpen = opens.some((o) => o.turn === tryAgainTurn);
  record(FLOW, 'LOSE-10 CTA_CLICKED + synchronous store-open on TRY AGAIN', funnel.includes('CTA_CLICKED') && syncOpen, `opens=${JSON.stringify(opens)} turn=${tryAgainTurn}`);
}

// ── WIN flow ────────────────────────────────────────────────────────────────────
async function runWin(page, seed) {
  const FLOW = `WIN[seed=${seed}]`;
  log(`\n--- ${FLOW} ---`);
  const t0 = Date.now();
  let legalTransitions = true, lastState = null, transDetail = '';
  let heroHpNonNeg = true, heroNeverZero = true, heroZeroDetail = '';
  let bossHpNonNeg = true;
  let reachedWon = false, wonAtMs = -1, endcardAtMs = -1;
  let enemiesZeroAtVictory = true, victoryDetail = '';
  let healSeen = false;
  // WIN-DEATH-AT-ZERO (BUG 3): the boss death anim plays ONLY at hp=0. Every frame, if the boss
  // is in a Die anim its displayed HP must be exactly 0 (no death anim mid-drain).
  let bossDeathAtZero = true, bossDeathDetail = '';

  const DRIVE_MS = 70_000;
  while (Date.now() - t0 < DRIVE_MS) {
    const s = await snap(page, 'all');
    if (s.skip) continue; // transient navigation-teardown frame — drop, resume next tick
    if (!s.exists) { record(FLOW, 'bridge', false, 'bridge vanished mid-flow'); return; }
    const tMs = Date.now() - t0;
    if (lastState && s.state !== lastState && !LEGAL_NEXT[lastState]?.has(s.state)) { legalTransitions = false; transDetail = `${lastState}→${s.state}`; }
    lastState = s.state;
    if (s.heroHp < 0) heroHpNonNeg = false;
    if (s.bossHp < 0) bossHpNonNeg = false;
    if (s.heroHp === 0) { heroNeverZero = false; heroZeroDetail = `heroHp=0 at ${tMs}ms (state=${s.state})`; }
    // WIN-DEATH-AT-ZERO (BUG 3): if the boss is in a Die anim, its HP must be 0 (drained first).
    if (s.bossAnim && DIE_ANIMS.has(s.bossAnim) && s.bossHp !== 0) { bossDeathAtZero = false; bossDeathDetail ||= `bossAnim=${s.bossAnim} with bossHp=${s.bossHp} at ${tMs}ms`; }
    if (s.state === 'combat' && s.slotSkillIds.includes('heal')) healSeen = true;
    if (s.state === 'won' && !reachedWon) { reachedWon = true; wonAtMs = tMs; if (s.enemiesAlive !== 0) { enemiesZeroAtVictory = false; victoryDetail = `enemiesAlive=${s.enemiesAlive} at won`; } }
    if (s.state === 'endcard') { endcardAtMs = tMs; break; }
    await sleep(100);
  }
  const funnel = await page.evaluate(() => window.__alFunnel.slice());
  // Tap the end card (tap-anywhere installs) for the CTA proof — re-taps until the open lands
  // (the hitArea mounts a beat after the bridge flips to 'endcard'; see tapEndCardUntilOpen).
  let winCtaTurn = -1;
  if (await page.evaluate(() => window.__clashRoyal?.state) === 'endcard') {
    winCtaTurn = await tapEndCardUntilOpen(page, VP.width / 2, VP.height * 0.55);
  }
  const funnel2 = await page.evaluate(() => window.__alFunnel.slice());
  const opens = await page.evaluate(() => window.__storeOpens.slice());

  record(FLOW, 'UNIV legal state transitions', legalTransitions, transDetail);
  record(FLOW, 'UNIV heroHp >= 0', heroHpNonNeg);
  record(FLOW, 'UNIV bossHp >= 0', bossHpNonNeg);
  record(FLOW, 'WIN hero HP never 0', heroNeverZero, heroZeroDetail);
  record(FLOW, 'WIN boss dies at victory (enemiesAlive→0 at won)', reachedWon && enemiesZeroAtVictory, victoryDetail);
  // WIN-DEATH-AT-ZERO (BUG 3): boss death anim only ever plays on an empty (0) HP bar.
  record(FLOW, 'WIN-DEATH-AT-ZERO boss death anim only at hp=0', bossDeathAtZero, bossDeathDetail);
  record(FLOW, 'WIN reached won→endcard within [minMs, maxMs]',
    reachedWon && endcardAtMs >= 0 && wonAtMs >= MIN_FIGHT_MS - 1500 && endcardAtMs <= 65_000,
    `wonAtMs=${wonAtMs} endcardAtMs=${endcardAtMs}`);
  record(FLOW, 'WIN slots CAN include heal (full roster)', healSeen, 'no heal slot observed across combat');
  const wantOrder = ['LOADING', 'LOADED', 'DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_PASS_25', 'CHALLENGE_PASS_50', 'CHALLENGE_PASS_75', 'ENDCARD_SHOWN'];
  record(FLOW, 'WIN funnel in order', isSubsequenceInOrder(funnel2, wantOrder), `funnel=${JSON.stringify(funnel2)}`);
  record(FLOW, 'WIN CTA_CLICKED + store-open on Play Now', funnel2.includes('CTA_CLICKED') && opens.some((o) => o.turn === winCtaTurn), `opens=${JSON.stringify(opens)} turn=${winCtaTurn}`);
}

// ── RETRY flow (lose → TRY AGAIN → win) ───────────────────────────────────────────
async function runRetry(page, seed) {
  const FLOW = `RETRY[seed=${seed}]`;
  log(`\n--- ${FLOW} ---`);
  // 1) Drive lose → defeat overlay.
  const t0 = Date.now();
  let sawDefeat = false;
  while (Date.now() - t0 < 60_000) {
    const s = await snap(page, 'all');
    if (s.skip) { await sleep(100); continue; } // transient navigation-teardown frame — drop
    if (!s.exists) { record(FLOW, 'bridge', false, 'bridge gone before defeat'); return; }
    if (s.state === 'defeat') { sawDefeat = true; break; }
    if (s.state === 'endcard') break;
    await sleep(100);
  }
  if (!sawDefeat) { record(FLOW, 'RETRY reached defeat overlay', false, 'never latched defeat'); return; }
  record(FLOW, 'RETRY reached defeat overlay', true);
  // The DefeatScene overlay (single TRY AGAIN button) only mounts after the in-scene
  // DEFEAT_HOLD (2200ms) elapses + the headline/buttons rise & settle. Tapping earlier hits
  // dead space and leaves us on the frozen death frame. Mirror the proven lose-flow-shot wait.
  await sleep(2800);

  // 2) Tap TRY AGAIN, then poll until the bridge reports a FRESH combat scene. NOTE: TRY AGAIN
  // now opens the store and resumes into the win sequence ON RETURN (the CTA→store→win-on-return
  // feature) — it no longer retries immediately. So after the tap we SIMULATE the store round
  // trip (visibility hidden→visible + focus/pageshow), which fires the director's armWinOnReturn
  // listener → retryAsWin(): the old bridge is deleted on scene exit and reinstalled on the new
  // scene; we wait for the bridge to come BACK reading state==='combat'/'won'. Retry a couple of
  // times in case the first click lands a frame before the buttons settle.
  const { tryAgain } = defeatButtonCoords(VP.width, VP.height);
  let freshCombat = false;
  for (let attempt = 0; attempt < 3 && !freshCombat; attempt++) {
    await page.mouse.click(tryAgain.x, tryAgain.y);
    await sleep(120);
    // Simulate leaving to the store then returning to the ad → triggers the win-on-return resume.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(120);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
    });
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => window.__clashRoyal?.state ?? 'gone');
      if (st === 'combat' || st === 'won') { freshCombat = true; break; }
      await sleep(150);
    }
  }
  record(FLOW, 'RETRY fresh bridge after TRY AGAIN', freshCombat);
  if (!freshCombat) return;
  await sleep(400); // first frames of the retry combat paint

  // 3) Assert the retry is a FRESH WIN combat: hero revived, no onboarding, heal in pool.
  const r0 = await snap(page, false);
  record(FLOW, 'RETRY fresh combat (state=combat)', r0.state === 'combat', `state=${r0.state}`);
  record(FLOW, 'RETRY hero revived (heroHp full, not 0)', r0.heroHp > 0, `heroHp=${r0.heroHp}`);
  record(FLOW, 'RETRY hero anim Idle not Die', r0.heroAnim != null && !DIE_ANIMS.has(r0.heroAnim), `heroAnim=${r0.heroAnim}`);
  record(FLOW, 'RETRY NO onboarding/coach overlay', r0.onboardingActive === false, `onboardingActive=${r0.onboardingActive}`);

  // 4) Drive the win, watching for heal in the pool + reaching won→endcard. Funnel dedup check.
  const t1 = Date.now();
  let healSeen = false, reachedWon = false, lastState = null, legalTransitions = true, transDetail = '';
  while (Date.now() - t1 < 70_000) {
    const s = await snap(page, 'all');
    if (s.skip) continue; // transient navigation-teardown frame — drop, resume next tick
    if (!s.exists) break;
    if (lastState && s.state !== lastState && !LEGAL_NEXT[lastState]?.has(s.state)) { legalTransitions = false; transDetail = `${lastState}→${s.state}`; }
    lastState = s.state;
    if (s.state === 'combat' && s.slotSkillIds.includes('heal')) healSeen = true;
    if (s.state === 'won') reachedWon = true;
    if (s.state === 'endcard') break;
    await sleep(100);
  }
  const finalState = await page.evaluate(() => window.__clashRoyal?.state ?? 'gone');
  record(FLOW, 'RETRY legal transitions in win leg', legalTransitions, transDetail);
  record(FLOW, 'RETRY slots INCLUDE heal again (win pool)', healSeen, 'no heal slot observed in retry combat');
  record(FLOW, 'RETRY reached won→endcard', reachedWon && finalState === 'endcard', `reachedWon=${reachedWon} final=${finalState}`);

  // 5) ENDCARD_SHOWN dedup + single CTA on tap.
  const funnel = await page.evaluate(() => window.__alFunnel.slice());
  const endcardCount = funnel.filter((e) => e === 'ENDCARD_SHOWN').length;
  record(FLOW, 'RETRY ENDCARD_SHOWN not double-fired (dedup)', endcardCount === 1, `count=${endcardCount} funnel=${JSON.stringify(funnel)}`);
  if (finalState === 'endcard') {
    await tapEndCardUntilOpen(page, VP.width / 2, VP.height * 0.55);
  }
  const funnel2 = await page.evaluate(() => window.__alFunnel.slice());
  const ctaCount = funnel2.filter((e) => e === 'CTA_CLICKED').length;
  record(FLOW, 'RETRY CTA_CLICKED fired once', ctaCount === 1, `count=${ctaCount}`);
}

// Tap the tap-anywhere end card and WAIT for the synchronous store-open to land. The bridge flips
// state→'endcard' the instant CombatDirector.showEndCard() calls markEndCardShown(), but that is
// BEFORE `new EndCardScene().enter()` finishes its async Assets.load + hitArea mount + fade-in — so
// a tap fired the moment state reads 'endcard' can hit the screen before the hitArea is interactive
// (→ no install → opens=[]). This is a mount-timing race, NOT a CTA bug: we re-tap until the open
// records (or give up after a generous budget). Returns the turn used for the install gesture; the
// caller still asserts CTA_CLICKED fired + an open landed on that turn (intent preserved, not weakened).
async function tapEndCardUntilOpen(page, x, y) {
  const turn = await page.evaluate(() => (window.__tapTurn++, window.__tapTurn));
  const deadline = Date.now() + 8_000;
  let landed = false;
  while (Date.now() < deadline && !landed) {
    await page.mouse.click(x, y);
    const settle = Date.now() + 1_200; // sdk.install() defers the real open via setTimeout on first call
    while (Date.now() < settle) {
      landed = await page.evaluate((t) => window.__storeOpens.some((o) => o.turn === t), turn);
      if (landed) break;
      await sleep(150);
    }
  }
  return turn;
}

// Defeat-overlay button screen coord (mirrors DefeatScene.layoutScene + lose-flow shot).
// The defeat card now has a SINGLE centered TRY AGAIN button at (W/2, H*0.60).
function defeatButtonCoords(W, H) {
  const tryAgainY = H * 0.60;
  return { tryAgain: { x: W / 2, y: tryAgainY } };
}

// True iff `want` appears as an ordered subsequence of `got` (extra events allowed between).
function isSubsequenceInOrder(got, want) {
  let i = 0;
  for (const e of got) { if (e === want[i]) i++; if (i === want.length) return true; }
  return i === want.length;
}

async function freshPage(browser, query) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
  await installInitScript(page);
  await page.goto(`${DEV_BASE}${query}`, { waitUntil: 'load', timeout: 25_000 });
  const ok = await waitBridge(page);
  if (!ok) throw new Error(`no bridge for ${query}`);
  await sleep(1200);
  return { ctx, page, errs };
}

// ── main ────────────────────────────────────────────────────────────────────
let spawnedServer = null, browser = null;
try {
  spawnedServer = await ensureDevServer();
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

  // Several runs per flow, varying the DRIVE CADENCE (aggressive 'all' vs 'idle' auto-pick) and
  // re-running fresh pages — this exercises the state machine across the meaningful interaction
  // paths. (The rig itself is deterministic-seeded; numeric invariants across 1000s of seeds are
  // covered by the rig batch sim. The `?seed=` label below is a run id, not a behavioral knob —
  // the production rng seed is fixed in config; this E2E proves the RENDERED scene + flow.)
  let LOSE_RUNS = [{ seed: 1, cad: 'all' }, { seed: 2, cad: 'idle' }, { seed: 7, cad: 'all' }, { seed: 13, cad: 'idle' }, { seed: 99, cad: 'all' }];
  let WIN_RUNS = [1, 2, 7, 13, 99];
  let RETRY_RUNS = [1, 13];
  // CR_FLOW_ONLY=lose|win|retry runs just one journey (CI / fast iteration). Default (unset) runs
  // the full multi-seed/idle battery across all flows (the Tier-2 pre-merge gate).
  const only = process.env.CR_FLOW_ONLY;
  if (only) { if (only !== 'lose') LOSE_RUNS = []; if (only !== 'win') WIN_RUNS = []; if (only !== 'retry') RETRY_RUNS = []; }
  // --fast (argv) or CR_FLOW_QUICK=1 (env): Tier-1 SMOKE — one AGGRESSIVE seed per journey, dropping
  // the slow ~40s idle-cadence runs, and reusing any already-running dev server (ensureDevServer
  // reuses :3025 if alive). Turns the ~6-min full pass into ~1 min for routine iteration.
  const FAST = process.argv.includes('--fast') || process.env.CR_FLOW_QUICK === '1';
  if (FAST) { LOSE_RUNS = (LOSE_RUNS.filter(r => r.cad === 'all')[0] ? [LOSE_RUNS.filter(r => r.cad === 'all')[0]] : LOSE_RUNS.slice(0, 1)); WIN_RUNS = WIN_RUNS.slice(0, 1); RETRY_RUNS = RETRY_RUNS.slice(0, 1); }

  if (LOSE_RUNS.length) log('\n════════ LOSE flows ════════');
  for (const { seed, cad } of LOSE_RUNS) {
    const { ctx, page, errs } = await freshPage(browser, `?type=clash-royal&outcome=lose&seed=${seed}`);
    await runLose(page, seed, cad);
    record(`LOSE[seed=${seed},${cad}]`, 'no pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  if (WIN_RUNS.length) log('\n════════ WIN flows ════════');
  for (const seed of WIN_RUNS) {
    const { ctx, page, errs } = await freshPage(browser, `?type=clash-royal&seed=${seed}`);
    await runWin(page, seed);
    record(`WIN[seed=${seed}]`, 'no pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  if (RETRY_RUNS.length) log('\n════════ RETRY flows ════════');
  for (const seed of RETRY_RUNS) {
    const { ctx, page, errs } = await freshPage(browser, `?type=clash-royal&outcome=lose&seed=${seed}`);
    await runRetry(page, seed);
    record(`RETRY[seed=${seed}]`, 'no pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
} catch (e) {
  log('\n[harness] FATAL:', e?.stack || e);
  record('HARNESS', 'completed without fatal error', false, String(e?.message || e));
} finally {
  if (browser) await browser.close();
  killDevServer(spawnedServer);
}

// ── report ────────────────────────────────────────────────────────────────────
log('\n════════════════════════ INVARIANT REPORT ════════════════════════');
const byFlow = new Map();
for (const r of results) { if (!byFlow.has(r.flow)) byFlow.set(r.flow, []); byFlow.get(r.flow).push(r); }
let failCount = 0;
for (const [flow, rs] of byFlow) {
  log(`\n${flow}`);
  for (const r of rs) {
    if (r.pass) log(`  PASS  ${r.id}`);
    else { log(`  FAIL  ${r.id}${r.detail ? ' — ' + r.detail : ''}`); failCount++; }
  }
}
log(`\n──────────────────────────────────────────────────────────────────`);
log(`TOTAL: ${results.length} assertions, ${failCount} FAILED across ${byFlow.size} flow-runs.`);
if (failCount > 0) { log('RESULT: FAIL'); process.exit(1); }
log('RESULT: PASS — every invariant held across all flows.');
process.exit(0);
