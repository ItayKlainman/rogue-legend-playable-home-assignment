import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RigDirector } from '../combat/RigDirector';
import { DEFAULT_CONFIG } from '../config';
import { mulberry32 } from '../rng';
import { skillById } from '../roster';
import type { SkillDef } from '../config';

const skill = (id: string, tier: 1 | 2 | 3, target: 'enemy' | 'self' = 'enemy'): SkillDef =>
  ({ id: id as any, family: 'fire', tier, target, cost: 5, vfxId: 'fireballBarrage' });

function rig() { return new RigDirector(DEFAULT_CONFIG, mulberry32(1)); }

test('tier-1 cast clears exactly one milestone band', () => {
  const r = rig();
  const out = r.resolveCast(skill('shuriken', 1));
  assert.equal(out.kind, 'milestone');
  assert.equal(out.beatsCleared, 1);
  // first beat now CHIPS minion 1 (milestoneHp 300, no mustKill) — minions take 2 hits.
  assert.equal(out.targetIndex, 1);
  assert.equal(out.kills, false);
});

test('displayed amount always equals hp delta (number == bar)', () => {
  const r = rig();
  // advance through the 6 minion beats (2 chips + kill per minion @ MINION_HP=1200) to the boss.
  r.resolveCast(skill('shuriken', 1)); // chip A minion 1
  r.resolveCast(skill('shuriken', 1)); // chip B minion 1
  r.resolveCast(skill('shuriken', 1)); // kill minion 1
  r.resolveCast(skill('shuriken', 1)); // chip A minion 2
  r.resolveCast(skill('shuriken', 1)); // chip B minion 2
  r.resolveCast(skill('shuriken', 1)); // kill minion 2
  const out = r.resolveCast(skill('meteor', 3)); // boss, tier 3 -> clears up to 3 bands
  assert.equal(out.targetIndex, 0);
  assert.equal(out.amount, out.hpBefore - out.hpAfter);
  assert.ok(out.beatsCleared >= 2, 'tier-3 clears multiple bands');
});

test('tier-3 clears more bands than tier-1 on the boss', () => {
  // 6 minion beats now (2 chips + kill per minion @ MINION_HP=1200) before the boss.
  const advance = (r: ReturnType<typeof rig>) => {
    r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1));
    r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1));
  };
  const big = rig(); advance(big);
  const small = rig(); advance(small);
  const t3 = big.resolveCast(skill('meteor', 3)).beatsCleared;
  const t1 = small.resolveCast(skill('shuriken', 1)).beatsCleared;
  assert.ok(t3 > t1);
});

test('every ordinary fire while beats remain deals visible damage (no held/sliver suppression)', () => {
  // Mission #10 invariant: dd7d3aa's finisher-hold-suppression is REMOVED. Ordinary
  // fires advance the rig until the natural killing-fire (the final mustKill at hp 0).
  // Every cast resolving against a milestone beat must report amount > 0.
  const r = rig();
  let outs = 0;
  let guard = 0;
  while (!r.isVictory() && guard++ < 100) {
    if (r.pendingDangerBeat()) { r.forceResolveDanger(); continue; }
    const out = r.resolveCast(skill('shuriken', 1));
    if (out.targetSide === 'enemy') {
      assert.ok(out.amount > 0, `cast #${outs} amount=${out.amount} (must be > 0; no held/sliver hits)`);
    }
    outs++;
  }
  assert.equal(r.isVictory(), true, 'reached victory through ordinary casts (natural killing-fire)');
});

test('victory only when all enemies dead', () => {
  const r = rig();
  assert.equal(r.isVictory(), false);
  // Mission #10: ordinary casts grind the boss until they consume the finisher beat
  // (the killing fire) — that single cast resolves the win. No held-sliver / finale-volley.
  let guard = 0;
  while (!r.isVictory() && guard++ < 100) {
    if (r.pendingDangerBeat()) r.forceResolveDanger();
    else r.resolveCast(skill('meteor', 3));
  }
  assert.equal(r.isVictory(), true);
});

test('heal on a danger beat resolves the danger and reports a heal amount', () => {
  const r = rig();
  r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1));
  let guard = 0; while (!r.pendingDangerBeat() && guard++ < 20) r.resolveCast(skill('meteor', 3));
  assert.ok(r.pendingDangerBeat());
  const out = r.resolveCast(skill('heal', 1, 'self'));
  assert.equal(out.targetSide, 'self');
  assert.ok(out.amount > 0);
  assert.equal(r.pendingDangerBeat(), false);
});

test('any-tier milestone casts progress the boss (no hard tier-gate)', () => {
  const rig = new RigDirector(DEFAULT_CONFIG, mulberry32(1));
  const shuriken = skillById('shuriken')!;
  // 6 minion beats now (2 chips + kill per minion @ MINION_HP=1200).
  rig.resolveCast(shuriken); rig.resolveCast(shuriken); rig.resolveCast(shuriken);
  rig.resolveCast(shuriken); rig.resolveCast(shuriken); rig.resolveCast(shuriken);
  const before = rig.currentHp(0);
  rig.resolveCast(shuriken);
  assert.ok(rig.currentHp(0) < before);
});
test('ordinary casts grind the boss down to the finisher beat (the killing fire)', () => {
  // Mission #10: ordinary casts whittle ALL non-finisher boss beats. Use tier-1 (1 band per
  // cast) to stop EXACTLY at the finisher beat — the very next cast IS the killing fire.
  const rig = new RigDirector(DEFAULT_CONFIG, mulberry32(1));
  const shuriken = skillById('shuriken')!;
  let guard = 0;
  while (!rig.atFinisherBeat() && guard++ < 100) {
    if (rig.pendingDangerBeat()) rig.forceResolveDanger();
    else rig.resolveCast(shuriken);
  }
  assert.ok(rig.atFinisherBeat(), 'reached the finisher beat');
  assert.ok(rig.currentHp(0) > 0, 'boss still alive at the threshold');
  assert.equal(rig.isVictory(), false, 'not yet victory until the killing fire lands');
});
test('resolveFinisher kills every remaining enemy and reaches victory', () => {
  const rig = new RigDirector(DEFAULT_CONFIG, mulberry32(1));
  const res = rig.resolveFinisher();
  assert.equal(rig.isVictory(), true);
  assert.equal(res.kills.length, DEFAULT_CONFIG.enemies.length);
  assert.equal(rig.killCount(), DEFAULT_CONFIG.enemies.length);
});
test('the final mustKill (finisher) lands the natural killing fire', () => {
  // Mission #10: instead of a held sliver + orchestrated finale-volley, the deck whittles
  // the boss across ~16 milestones until the LAST beat (mustKill + finisher, milestoneHp 0)
  // is consumed by an ordinary cast — that cast IS the natural killing-fire (with visual flair).
  // Use shuriken (tier-1 = 1 band/cast) so we land EXACTLY on the finisher beat before the
  // killing fire (a tier-3 would always consume the finisher inside the same cast, so the
  // pre-fire pause assertion isn't meaningful for it — covered separately by the "every
  // ordinary fire while beats remain deals visible damage" test).
  const rig = new RigDirector(DEFAULT_CONFIG, mulberry32(1));
  const shuriken = skillById('shuriken')!;
  let guard = 0;
  while (!rig.atFinisherBeat() && guard++ < 100) {
    if (rig.pendingDangerBeat()) rig.forceResolveDanger();
    else rig.resolveCast(shuriken);
  }
  assert.equal(rig.atFinisherBeat(), true, 'reached the finisher beat through ordinary play');
  assert.ok(rig.currentHp(0) > 0, 'boss still alive at the threshold');
  // The killing fire on the finisher beat MUST land damage, kill the boss, and reach victory.
  const out = rig.resolveCast(shuriken);
  assert.ok(out.amount > 0, 'killing fire deals visible damage');
  assert.equal(out.kills, true, 'killing fire kills the boss');
  assert.equal(rig.isVictory(), true, 'victory reached by the natural killing-fire');
});
test('finisher stays blocked while danger is unresolved', () => {
  const rig = new RigDirector(DEFAULT_CONFIG, mulberry32(1));
  const meteor = skillById('meteor')!;
  for (let i = 0; i < 40 && !rig.pendingDangerBeat(); i++) rig.resolveCast(meteor);
  assert.equal(rig.pendingDangerBeat(), true);
  rig.resolveCast(meteor);
  assert.equal(rig.isVictory(), false);
});

// ── Hero melee (rogue basic-attack chip) ────────────────────────────────────────
// The hero's basic swing now deals a small amount of visible damage — a "chip" that
// never crosses the next milestone (the deck owns milestones + the killing fire).
test('resolveHeroMelee returns a positive amount on the front living enemy', () => {
  const r = rig();
  const out = r.resolveHeroMelee();
  assert.ok(out.amount > 0, 'hero melee deals visible damage');
  assert.equal(out.targetSide, 'enemy');
  // Front living = lowest index with hp>0 (matches the controller's frontEnemy() helper).
  // At fight start enemy index 0 (the boss) is the lowest living index — that's the target.
  assert.equal(out.targetIndex, 0);
  // The chip moved HP toward (but not past) the next milestone.
  assert.ok(out.hpAfter < out.hpBefore);
});

test('resolveHeroMelee never crosses the next milestone (deck owns milestones)', () => {
  // Walk to a boss milestone beat and verify melee never reduces HP at-or-below the floor.
  const r = rig();
  // 6 minion beats now (2 chips + kill per minion @ MINION_HP=1200).
  r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1));
  r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1)); r.resolveCast(skill('s', 1));
  // First boss milestone floor is 3750. Repeatedly melee and assert HP stays > 3750.
  for (let i = 0; i < 200; i++) {
    const out = r.resolveHeroMelee();
    if (out.amount === 0) break; // saturated at floor+1
    assert.ok(r.currentHp(0) > 3750, `melee #${i} dropped HP=${r.currentHp(0)} to floor`);
  }
  // After many melee swings the boss is still alive (no kill from hero melee).
  assert.ok(r.currentHp(0) > 0);
  assert.equal(r.killCount(), 2, 'only the 2 minion kills — boss not killed by melee');
});

test('resolveHeroMelee never kills the boss (deck owns the killing fire)', () => {
  const r = rig();
  // Walk the rig to the final finisher beat via ordinary casts.
  const shuriken = skillById('shuriken')!;
  let guard = 0;
  while (!r.atFinisherBeat() && guard++ < 100) {
    if (r.pendingDangerBeat()) r.forceResolveDanger();
    else r.resolveCast(shuriken);
  }
  assert.equal(r.atFinisherBeat(), true);
  const hpBefore = r.currentHp(0);
  assert.ok(hpBefore > 0);
  // Spam melee — boss must never die, killCount must not advance past current.
  const killsBefore = r.killCount();
  for (let i = 0; i < 500; i++) {
    const out = r.resolveHeroMelee();
    assert.equal(out.kills, false, 'melee never reports a kill');
    assert.ok(r.currentHp(0) > 0, 'boss never dies from melee alone');
  }
  assert.equal(r.killCount(), killsBefore, 'killCount unchanged by melee');
  assert.equal(r.isVictory(), false, 'no victory from melee alone');
});

test('resolveHeroMelee does NOT advance the beat pointer (deck owns the milestone curve)', () => {
  const r = rig();
  // Repeated melee at the very start — should not pop the first minion beat (now a chip).
  for (let i = 0; i < 200; i++) r.resolveHeroMelee();
  assert.equal(r.killCount(), 0, 'no minion kills from melee — the deck advances the curve');
  // A subsequent shuriken cast must still consume the first minion chip beat — proves the
  // beat pointer was unchanged. The chip is non-mustKill so kills=false; the SECOND cast
  // (next test below) is the one that mustKill-resolves.
  const out = r.resolveCast(skill('s', 1));
  assert.equal(out.beatsCleared, 1, 'deck consumes the first minion beat (chip)');
  assert.equal(out.targetIndex, 1, 'first beat targets minion 1');
});

// Mission G Issue 4 — re-tuned hero-melee clamp [25, 80] (was [8, 35]).
test('resolveHeroMelee chip is clamped to the new [25, 80] range', () => {
  const r = rig();
  const out = r.resolveHeroMelee();
  assert.ok(out.amount >= 25, `min hero chip should be ≥25, got ${out.amount}`);
  assert.ok(out.amount <= 80, `max hero chip should be ≤80, got ${out.amount}`);
});

// ── Mission G Issue 1 — enemy melee (the hero TAKES rig-resolved damage) ────────
test('resolveEnemyMelee returns a positive amount targeting the hero', () => {
  const r = rig();
  const out = r.resolveEnemyMelee();
  assert.equal(out.targetSide, 'self', 'enemy melee targets the hero');
  assert.equal(out.targetIndex, 0);
  assert.ok(out.amount > 0, 'enemy melee deals visible chip damage');
  assert.ok(out.hpAfter < out.hpBefore, 'hero HP went down');
});

test('resolveEnemyMelee chip is clamped to [25, 80]', () => {
  const r = rig();
  const out = r.resolveEnemyMelee();
  assert.ok(out.amount >= 25, `min enemy chip should be ≥25, got ${out.amount}`);
  assert.ok(out.amount <= 80, `max enemy chip should be ≤80, got ${out.amount}`);
});

test('resolveEnemyMelee never crosses the next scare floor (scare beats own the dramatic dips)', () => {
  // The first scare beat (auto-kind, earlyHpFrac 0.50) sets the early dip; before it
  // resolves, enemy melee MUST NOT drop hero HP at-or-below that scare floor + 1.
  const r = rig();
  // The first scare beat is encountered after several boss beats; the relevant floor for
  // the rig BEFORE that scare is still earlyHpFrac * maxHp because the scan looks ahead.
  // At maxHp=900, earlyHpFrac=0.50 → floor=450. Survival floor is 50 → floor=max(450,50)=450.
  const expectedFloor = Math.round(900 * 0.50); // 450
  for (let i = 0; i < 200; i++) {
    const out = r.resolveEnemyMelee();
    if (out.amount === 0) break; // saturated
    assert.ok(r.heroCurrentHp() > expectedFloor,
      `enemy melee #${i} pushed hero HP=${r.heroCurrentHp()} to/under floor ${expectedFloor}`);
  }
  // After many swings the hero is saturated above the floor but still alive.
  assert.ok(r.heroCurrentHp() > expectedFloor);
});

test('resolveEnemyMelee never kills the hero (hero HP always > 0)', () => {
  const r = rig();
  // Spam enemy melee against a hero that never heals. Must never die.
  for (let i = 0; i < 1000; i++) {
    const out = r.resolveEnemyMelee();
    assert.equal(out.kills, false, 'enemy melee never reports a kill');
    assert.ok(r.heroCurrentHp() > 0, `hero must never die from enemy melee alone (HP=${r.heroCurrentHp()} at swing ${i})`);
  }
});

test('resolveEnemyMelee returns amount=0 (saturated) once at the floor (no infinite drain)', () => {
  const r = rig();
  // Walk many swings and confirm we eventually saturate to amount=0 and stay there.
  let sawSaturated = false;
  for (let i = 0; i < 500; i++) {
    const out = r.resolveEnemyMelee();
    if (out.amount === 0) { sawSaturated = true; break; }
  }
  assert.equal(sawSaturated, true, 'enemy melee eventually saturates at the floor');
  // Subsequent swings stay saturated (no damage delta).
  const hpAtSat = r.heroCurrentHp();
  for (let i = 0; i < 50; i++) {
    const out = r.resolveEnemyMelee();
    assert.equal(out.amount, 0);
  }
  assert.equal(r.heroCurrentHp(), hpAtSat, 'hero HP unchanged once saturated');
});

test('resolveHeroDeath forces the boss to a sliver and drains the hero to 0 (defeat)', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); // RigDirector.test already imports DEFAULT_CONFIG
  const rig = new RigDirector(cfg, mulberry32(1));
  const out = rig.resolveHeroDeath();
  assert.equal(rig.heroCurrentHp(), 0, 'hero drained to 0 (floor overridden)');
  assert.ok(rig.currentHp(0) > 0, 'boss SURVIVES (not killed)');
  assert.ok(rig.currentHp(0) <= cfg.enemies[0].maxHp * 0.08, 'boss forced to a sliver for "so close"');
  assert.equal(rig.isDefeat(), true);
  assert.equal(rig.isVictory(), false, 'defeat is not victory');
  assert.equal(out.heroHpBefore >= 0, true);
  // The returned bossHpAfter IS the forced 3% sliver, and equals the live boss HP — the display
  // bar reads this (never 0). This is the field the bridge sets the boss bar to.
  assert.equal(out.bossHpAfter, Math.max(1, Math.round(cfg.enemies[0].maxHp * 0.03)), 'bossHpAfter is the 3% sliver');
  assert.ok(out.bossHpAfter > 0 && rig.currentHp(0) === out.bossHpAfter, 'currentHp(0) === bossHpAfter > 0');
});
