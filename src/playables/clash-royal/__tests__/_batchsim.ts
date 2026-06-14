// Batch statistical sim — drives the REAL CombatController/RigDirector across many seeds and
// play patterns to validate the fight invariants hold at scale. Run:
//   node --import tsx --import src/playables/clash-royal/__tests__/setup.ts \
//        src/playables/clash-royal/__tests__/_batchsim.ts
// NOT a *.test.ts (underscore-prefixed) so the node:test runner ignores it.
import { CombatController, type CombatFxBridge } from '../combat/CombatController';
import { DEFAULT_CONFIG } from '../config';

const BOSS_MAX = DEFAULT_CONFIG.enemies[0].maxHp;
const MIN = DEFAULT_CONFIG.fightClock.minMs;
const MAX = DEFAULT_CONFIG.fightClock.maxMs;
const FINALE_THRESH = BOSS_MAX * (DEFAULT_CONFIG.deck.finaleAccel?.hpFracThreshold ?? 0.35);
const FLOOR = 60; // "boss at the floor" probe threshold

interface RunStat {
  won: boolean; victoryMs: number; heroMinHp: number;
  bossFloorMs: number | null; finaleStartMs: number | null;
  zeroDmgEnemyCasts: number; enemyCasts: number; scares: number; durMs: number;
  lost: boolean; bossHpEnd: number; heroHpEnd: number;
  // Lose-build watchdog: once the boss first drops to <=8% maxHp (the sliver band), the MIN
  // boss HP seen on EVERY step afterward until defeat. Catches the held-finisher chip-to-1
  // (the boss visibly sat near 0 during the hold). Infinity if the band was never reached.
  minBossHpAfterSliver: number;
}

function simulate(
  seed: number, pattern: 'idle' | 'active',
  outcome: 'win' | 'lose' = 'win', opts?: { startCoins?: number; regen?: number },
): RunStat {
  let elapsed = 0, victoryMs = -1, zeroDmg = 0, enemyCasts = 0, scares = 0;
  const fx: CombatFxBridge = {
    playCast: (_id, _tier, targetIndex, isSelf, amount, onImpact) => {
      if (!isSelf) { enemyCasts++; if (amount <= 0) zeroDmg++; void targetIndex; }
      onImpact();
      return Promise.resolve();
    },
    showDamage: () => {}, tweenHpEnemy: () => {}, tweenHpHero: () => {},
    killEnemy: () => {},
    heroMelee: () => {},
    enemyAttack: () => {},
    scare: () => { scares++; },
    clearScare: () => {}, onEnemyKilled: () => {},
    onVictory: () => { if (victoryMs < 0) victoryMs = elapsed; },
    heroDeath: () => {},
  };
  const cfg = structuredClone(DEFAULT_CONFIG);
  // Fight-balance sim: disable the onboarding gate so victoryMs measures FIGHT time (the gate only
  // delays the start under the onboarding; it's orthogonal to balance and unit-tested separately).
  cfg.gateFightUntilFirstPick = false;
  cfg.outcome = outcome;
  // A { startCoins: 0, regen: 0 } run is the damage-less deck (exercises the MAX backstop).
  if (opts?.startCoins !== undefined) cfg.coin.start = opts.startCoins;
  if (opts?.regen !== undefined) { cfg.coin.regenEarly = cfg.coin.regenMid = cfg.coin.regenBoss = opts.regen; }
  const ctrl = new CombatController(cfg, fx, seed);
  ctrl.beginOnboarding();
  let heroMinHp = Infinity, bossFloorMs: number | null = null, finaleStartMs: number | null = null;
  const SLIVER_BAND = 0.08 * BOSS_MAX;
  let reachedSliver = false, minBossHpAfterSliver = Infinity;
  // Stop on defeat too — inert for win mode (isDefeat never trips there), so the win pass is unchanged.
  while (!ctrl.isVictory() && !ctrl.isDefeat() && elapsed < 90000) {
    elapsed += 100; // advance BEFORE step so `elapsed` matches the controller's internal clock
    ctrl.step(100); // (it does this.elapsedMs += dtMs at the top) — onVictory() records correctly
    if (pattern === 'active') { const aff = ctrl.affordableSlots(); if (aff.length) ctrl.tapSlot(aff[0]); }
    heroMinHp = Math.min(heroMinHp, ctrl.heroHp());
    const bhp = ctrl.currentEnemyHp(0);
    if (finaleStartMs === null && bhp > 0 && bhp < FINALE_THRESH) finaleStartMs = elapsed;
    if (bossFloorMs === null && bhp > 0 && bhp <= FLOOR) bossFloorMs = elapsed;
    // Lose watchdog: once the boss enters the sliver band, record the MIN HP seen on every
    // subsequent step (while alive) until defeat. The chip-to-1 bug shows up here as a min near 1.
    if (bhp > 0 && bhp <= SLIVER_BAND) reachedSliver = true;
    if (reachedSliver && bhp > 0) minBossHpAfterSliver = Math.min(minBossHpAfterSliver, bhp);
  }
  return {
    won: ctrl.isVictory(), victoryMs: victoryMs < 0 ? elapsed : victoryMs,
    heroMinHp: heroMinHp === Infinity ? ctrl.heroHp() : heroMinHp,
    bossFloorMs, finaleStartMs, zeroDmgEnemyCasts: zeroDmg, enemyCasts, scares, durMs: elapsed,
    lost: ctrl.isDefeat(), bossHpEnd: ctrl.currentEnemyHp(0), heroHpEnd: ctrl.heroHp(),
    minBossHpAfterSliver,
  };
}

function pct(arr: number[], p: number): number { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
const f = (n: number) => (n / 1000).toFixed(1) + 's';

const SEEDS = 500;
const patterns: ('idle' | 'active')[] = ['idle', 'active'];
const all: { pattern: string; stat: RunStat }[] = [];
for (const pattern of patterns) for (let s = 0; s < SEEDS; s++) all.push({ pattern, stat: simulate(s * 2654435761 % 2147483647 + 1, pattern) });

console.log(`\n=== clash-royal batch sim: ${SEEDS} seeds × ${patterns.length} patterns = ${all.length} runs ===`);
console.log(`(boss maxHp ${BOSS_MAX}, fightClock [${f(MIN)}, ${f(MAX)}], finale threshold ${Math.round(FINALE_THRESH)} hp)\n`);

const fails: string[] = [];
for (const pattern of patterns) {
  const runs = all.filter(r => r.pattern === pattern).map(r => r.stat);
  const won = runs.filter(r => r.won).length;
  const vt = runs.map(r => r.victoryMs);
  const heroMin = runs.map(r => r.heroMinHp);
  const zero = runs.map(r => r.zeroDmgEnemyCasts);
  const finaleDur = runs.filter(r => r.finaleStartMs !== null).map(r => (r.bossFloorMs ?? r.victoryMs) - (r.finaleStartMs as number));
  const heldWindow = runs.filter(r => r.bossFloorMs !== null).map(r => r.victoryMs - (r.bossFloorMs as number));
  console.log(`── pattern: ${pattern} ──`);
  console.log(`  win rate           : ${won}/${runs.length} (${(100 * won / runs.length).toFixed(1)}%)`);
  console.log(`  victory time       : min ${f(Math.min(...vt))}  p5 ${f(pct(vt, .05))}  med ${f(pct(vt, .5))}  p95 ${f(pct(vt, .95))}  max ${f(Math.max(...vt))}`);
  console.log(`  hero min HP        : min ${Math.min(...heroMin)}  p5 ${pct(heroMin, .05)}  med ${pct(heroMin, .5)}  (maxHp ${DEFAULT_CONFIG.hero.maxHp})`);
  console.log(`  scares per run     : min ${Math.min(...runs.map(r => r.scares))}  med ${pct(runs.map(r => r.scares), .5)}  max ${Math.max(...runs.map(r => r.scares))}`);
  console.log(`  finale real-dmg dur: med ${f(pct(finaleDur, .5))}  p95 ${f(pct(finaleDur, .95))}  (boss<threshold → floor)`);
  console.log(`  0-dmg enemy casts  : mean ${(zero.reduce((a, b) => a + b, 0) / zero.length).toFixed(2)}  med ${pct(zero, .5)}  max ${Math.max(...zero)}`);
  console.log(`  held window (floor→win): med ${f(pct(heldWindow, .5))}  max ${f(Math.max(...heldWindow, 0))}\n`);
  // HARD correctness invariants (these MUST hold for every run).
  if (won !== runs.length) fails.push(`${pattern}: ${runs.length - won} runs did NOT reach victory`);
  const tooEarly = vt.filter(t => t < MIN).length, tooLate = vt.filter(t => t > MAX).length;
  if (tooEarly) fails.push(`${pattern}: ${tooEarly} runs won BEFORE minMs (${f(MIN)})`);
  if (tooLate) fails.push(`${pattern}: ${tooLate} runs won AFTER maxMs (${f(MAX)})`);
  const died = heroMin.filter(h => h <= 0).length;
  if (died) fails.push(`${pattern}: ${died} runs the HERO DIED (heroHp<=0)`);
  // SOFT note (not a correctness failure): hyper-aggressive bot play can merge the two
  // scares (cross both danger beats within the 1.2s auto-clear). Only flag if even a
  // realistic (idle) viewer drops below 2 scares — that WOULD be a real regression.
  const lowScare = runs.filter(r => r.scares < 2).length;
  if (lowScare) console.log(`  note: ${lowScare}/${runs.length} ${pattern} runs saw 1 scare (scare-merge under fast play)`);
  if (pattern === 'idle' && lowScare) fails.push(`idle: ${lowScare} realistic runs had <2 scares (regression)`);
}

// ── LOSE pass — the "so close" reversal. Same seeds × both patterns, outcome:'lose', PLUS one
// damage-less deck ({ startCoins: 0, regen: 0 }) per pattern to exercise the MAX backstop.
const loseAll: { pattern: string; stat: RunStat }[] = [];
for (const pattern of patterns) {
  for (let s = 0; s < SEEDS; s++) loseAll.push({ pattern, stat: simulate(s * 2654435761 % 2147483647 + 1, pattern, 'lose') });
  loseAll.push({ pattern, stat: simulate(1, pattern, 'lose', { startCoins: 0, regen: 0 }) });
  // Hyper-aggressive high-coin/high-regen run: reaches the sliver band BEFORE minMs, forcing the
  // held-finisher window where the boss is chipped during the pastMin wait — exactly the path that
  // drove the boss to 1 HP pre-fix. The minBossHpAfterSliver watchdog asserts it never dips <2%.
  for (let s = 0; s < SEEDS; s++) loseAll.push({ pattern, stat: simulate(s * 2654435761 % 2147483647 + 1, pattern, 'lose', { startCoins: 200, regen: 50 }) });
}
const SLIVER_MAX = 0.08 * BOSS_MAX;
const SLIVER_FLOOR = Math.round(0.02 * BOSS_MAX); // ≈320 — a boss chipped toward 1 HP FAILS this
console.log(`=== LOSE pass: ${SEEDS} seeds + 1 damage-less deck × ${patterns.length} patterns = ${loseAll.length} runs ===`);
console.log(`(boss sliver ceiling ${Math.round(SLIVER_MAX)} hp = 8% of ${BOSS_MAX})\n`);
for (const pattern of patterns) {
  const runs = loseAll.filter(r => r.pattern === pattern).map(r => r.stat);
  const lost = runs.filter(r => r.lost).length;
  const wonAny = runs.filter(r => r.won).length;
  const sliver = runs.map(r => r.bossHpEnd);
  const dt = runs.map(r => r.durMs);
  const heroAlive = runs.filter(r => r.heroHpEnd !== 0).length;
  // Watchdog: the MIN boss HP seen on any step AFTER the boss first entered the sliver band,
  // across runs that reached it. A chip-to-1 (the shipped bug) shows up as a value near 1.
  const reachedSliverRuns = runs.filter(r => r.minBossHpAfterSliver !== Infinity);
  const minDuringHold = reachedSliverRuns.length ? Math.min(...reachedSliverRuns.map(r => r.minBossHpAfterSliver)) : Infinity;
  console.log(`── pattern: lose / ${pattern} ──`);
  console.log(`  defeat rate        : ${lost}/${runs.length} (${(100 * lost / runs.length).toFixed(1)}%)`);
  console.log(`  victories (must be 0): ${wonAny}`);
  console.log(`  hero HP end        : ${heroAlive} runs with hero HP ≠ 0 (must be 0)`);
  console.log(`  boss sliver hp     : min ${Math.min(...sliver)}  med ${pct(sliver, .5)}  max ${Math.max(...sliver)}  (floor ${SLIVER_FLOOR}, ceiling ${Math.round(SLIVER_MAX)})`);
  console.log(`  min boss HP in hold: ${minDuringHold === Infinity ? 'n/a' : minDuringHold}  across ${reachedSliverRuns.length}/${runs.length} runs that reached the sliver band  (must be ≥ ${SLIVER_FLOOR})`);
  console.log(`  defeat time        : min ${f(Math.min(...dt))}  med ${f(pct(dt, .5))}  max ${f(Math.max(...dt))}\n`);
  // HARD correctness invariants for the lose build (every run).
  if (lost !== runs.length) fails.push(`lose/${pattern}: ${runs.length - lost} runs did NOT reach defeat`);
  if (wonAny) fails.push(`lose/${pattern}: ${wonAny} runs reached VICTORY (lose build must never win)`);
  if (heroAlive) fails.push(`lose/${pattern}: ${heroAlive} runs the hero was NOT drained to 0`);
  // TIGHTENED lower bound: a boss chipped toward 1 HP (the shipped bug) now FAILS (was >=1).
  const badSliver = sliver.filter(h => h < SLIVER_FLOOR || h > SLIVER_MAX).length;
  if (badSliver) fails.push(`lose/${pattern}: ${badSliver} runs the boss end-HP was NOT in [2%, 8%] (${SLIVER_FLOOR}..${Math.round(SLIVER_MAX)})`);
  // The watchdog: the boss NEVER drained below 2% during the held sliver window. This is the
  // check that would have caught the chip-to-1 (boss visibly sat near 0 during the hold).
  if (minDuringHold !== Infinity && minDuringHold < SLIVER_FLOOR) {
    fails.push(`lose/${pattern}: boss drained to ${minDuringHold} HP during the held sliver window (< ${SLIVER_FLOOR} = 2% — the chip-to-1 class)`);
  }
  const tooEarly = dt.filter(t => t < MIN).length;
  if (tooEarly) fails.push(`lose/${pattern}: ${tooEarly} runs defeat landed BEFORE minMs (${f(MIN)})`);
}

// ── LOSE→RETRY→WIN pass — the full lose-variant player journey: fight loses, TRY AGAIN
// re-runs in win mode (same seed, no onboarding gate — exactly what CombatDirector.retryAsWin
// does). For each seed × pattern: assert phase 1 reaches defeat, then assert phase 2 reaches
// victory in [MIN,MAX] with hero alive. Mirrors what a real player sees end-to-end.
console.log(`=== LOSE→RETRY→WIN pass: full player journey across ${SEEDS} seeds × ${patterns.length} patterns ===\n`);
const journey: { pattern: string; seed: number; lostP1: boolean; wonP2: boolean; p1Ms: number; p2Ms: number; heroP2Min: number }[] = [];
for (const pattern of patterns) {
  for (let s = 0; s < SEEDS; s++) {
    const seed = s * 2654435761 % 2147483647 + 1;
    const p1 = simulate(seed, pattern, 'lose');                       // the lose fight
    const p2 = simulate(seed, pattern, 'win');                        // the retry (same seed, win-mode, no gate)
    journey.push({ pattern, seed, lostP1: p1.lost, wonP2: p2.won, p1Ms: p1.durMs, p2Ms: p2.victoryMs, heroP2Min: p2.heroMinHp });
  }
}
for (const pattern of patterns) {
  const runs = journey.filter(j => j.pattern === pattern);
  const fullFlow = runs.filter(j => j.lostP1 && j.wonP2).length;
  const p1Ms = runs.map(j => j.p1Ms);
  const p2Ms = runs.map(j => j.p2Ms);
  const heroMin = runs.map(j => j.heroP2Min);
  const totalMs = runs.map(j => j.p1Ms + j.p2Ms);
  console.log(`── ${pattern}: lose-then-retry-win ──`);
  console.log(`  full flow succeeded : ${fullFlow}/${runs.length} (${(100 * fullFlow / runs.length).toFixed(1)}%) — P1 reached DEFEAT and P2 retry reached VICTORY`);
  console.log(`  P1 (lose)    time   : min ${f(Math.min(...p1Ms))}  med ${f(pct(p1Ms, .5))}  max ${f(Math.max(...p1Ms))}`);
  console.log(`  P2 (retry)   time   : min ${f(Math.min(...p2Ms))}  med ${f(pct(p2Ms, .5))}  max ${f(Math.max(...p2Ms))}  (must be in [${f(MIN)}, ${f(MAX)}])`);
  console.log(`  end-to-end   time   : med ${f(pct(totalMs, .5))}  max ${f(Math.max(...totalMs))}`);
  console.log(`  P2 retry hero min HP: min ${Math.min(...heroMin)}  (must be > 0 — hero survives the retry)\n`);
  if (fullFlow !== runs.length) fails.push(`lose→retry/${pattern}: ${runs.length - fullFlow} seeds did NOT complete the full lose→win journey`);
  const p2TooEarly = p2Ms.filter(t => t < MIN).length, p2TooLate = p2Ms.filter(t => t > MAX).length;
  if (p2TooEarly) fails.push(`lose→retry/${pattern}: ${p2TooEarly} retries won BEFORE minMs (${f(MIN)})`);
  if (p2TooLate) fails.push(`lose→retry/${pattern}: ${p2TooLate} retries won AFTER maxMs (${f(MAX)})`);
  if (heroMin.some(h => h <= 0)) fails.push(`lose→retry/${pattern}: hero died on the retry (heroHp<=0)`);
}

if (fails.length === 0) console.log('✅ ALL INVARIANTS HOLD: WIN — 100% win, victory in [MIN,MAX], hero never dies, ≥2 scares; LOSE — 100% defeat, boss survives at a sliver, hero HP→0, never wins, defeat≥MIN; LOSE→RETRY — 100% full player journey (lose then retry-win).');
else { console.log('❌ INVARIANT FAILURES:'); fails.forEach(x => console.log('  - ' + x)); }
process.exit(fails.length === 0 ? 0 : 1);
