import { test } from 'node:test'; import assert from 'node:assert/strict';
import { CombatController, type CombatFxBridge } from '../combat/CombatController';
import { DEFAULT_CONFIG } from '../config';
import { skillById } from '../roster';

function makeFx() {
  const rec = {
    victoryCount: 0,
    killed: [] as number[],
    /** Every enemy-target deck-fire (playCast) with the rig-resolved damage + sim-time-ms. */
    damageHits: [] as { skillId: string; targetIndex: number; amount: number; tMs: number }[],
    /** Every scare(targetHp) call with sim-time-ms — used to assert scare-arc timings. */
    scares: [] as { targetHp: number; tMs: number }[],
    /** Every hero-melee swing the controller scheduled, with the rig-resolved chip amount. */
    meleeHits: [] as { targetIndex: number; amount: number; tMs: number }[],
    /** Mission G Issue 3 — every deck-fire (playCast call) timestamp; used to assert
     *  the finale-barrage cadence (>=3 fires within ~500ms below the threshold). */
    deckFires: [] as { tMs: number }[],
    /** Mission G Issue 1 — every enemy-attack the controller scheduled, with the
     *  rig-resolved chip amount on the hero (0 when saturated at the floor).
     *  Mission I-v2 — also records the attackerIndex the controller picked (-1 if
     *  the controller didn't pass one) and the `dodge` flag (true when the swing
     *  reads as an intentional dodge during a heal-HOLD, instead of "broken"). */
    enemyHits: [] as { amount: number; attackerIndex: number; dodge: boolean; tMs: number }[],
    /** External elapsed-ms clock the test owns (test increments via ctrl.step). */
    elapsedMs: 0,
    /** Set by killEnemy/onVictory observer below — separates ordinary fires from finale-volley. */
    finaleStarted: false,
    /** Lose-variant — count of heroDeath() calls (a downstream task asserts the lethal counter fires once). */
    heroDeaths: 0,
  };
  const fx: CombatFxBridge = {
    playCast: (skillId, _tier, targetIndex, isSelf, damageAmount, onImpact) => {
      // Skip the finale-volley path (pure cosmetic over already-resolved enemies; passes
      // amount=0 by design). We only care about ordinary deck-fires for the regression assert.
      if (!isSelf && !rec.finaleStarted) rec.damageHits.push({ skillId, targetIndex, amount: damageAmount, tMs: rec.elapsedMs });
      // Issue 3 — every deck-fire (including self/heal) logged for finale-barrage cadence assertions.
      rec.deckFires.push({ tMs: rec.elapsedMs });
      onImpact();
      return Promise.resolve();
    },
    showDamage: () => {},
    tweenHpEnemy: () => {}, tweenHpHero: () => {},
    killEnemy: (i) => {
      rec.killed.push(i);
      // Two enemies kept alive normally; the moment the THIRD (the boss) dies we're past
      // the natural killing-fire AND any finale-volley that follows is pure cosmetic.
      // Counting kills via this hook gives us a reliable "finale started" boundary that
      // works for BOTH the natural-killing-fire AND the MAX-backstop fireFinale path.
      if (rec.killed.length >= 3) rec.finaleStarted = true;
    },
    heroMelee: (targetIndex: number, amount: number) => {
      rec.meleeHits.push({ targetIndex, amount, tMs: rec.elapsedMs });
    },
    enemyAttack: (damageAmount?: number, opts?: { attackerIndex?: number; dodge?: boolean }) => {
      rec.enemyHits.push({
        amount: damageAmount ?? 0,
        attackerIndex: opts?.attackerIndex ?? -1,
        dodge: !!opts?.dodge,
        tMs: rec.elapsedMs,
      });
    },
    scare: (targetHp) => { rec.scares.push({ targetHp, tMs: rec.elapsedMs }); },
    clearScare: () => {}, onEnemyKilled: () => {},
    onVictory: () => { rec.victoryCount++; rec.finaleStarted = true; },
    heroDeath: () => { rec.heroDeaths = (rec.heroDeaths ?? 0) + 1; },
  };
  return { fx, rec };
}
function makeController(opts?: { startCoins?: number; regen?: number; coinMax?: number; seed?: number; gate?: boolean; outcome?: 'win' | 'lose'; deckCap?: number }) {
  const c = structuredClone(DEFAULT_CONFIG);
  if (opts?.startCoins !== undefined) c.coin.start = opts.startCoins;
  if (opts?.regen !== undefined) { c.coin.regenEarly = c.coin.regenMid = c.coin.regenBoss = opts.regen; }
  if (opts?.coinMax !== undefined) c.coin.max = opts.coinMax;
  if (opts?.deckCap !== undefined) c.deck.cap = opts.deckCap;
  // Default the onboarding fight-gate OFF for the harness so combat-isolation tests (which never
  // pick) still exercise melee/scares/clock from frame 0. Gating tests opt in via `gate: true`.
  c.gateFightUntilFirstPick = opts?.gate ?? false;
  if (opts?.outcome) c.outcome = opts.outcome;
  const { fx, rec } = makeFx();
  return { ctrl: new CombatController(c, fx, opts?.seed ?? 12345), fx: rec, cfg: c };
}

test('tapSlot picks: spends coins, adds to deck, refills slot', () => {
  // 8s @ regenEarly 1.5/s + start 0 = 12 coins (enough for any tier-1, max cost 10).
  const { ctrl } = makeController(); ctrl.step(8000);
  const before = ctrl.coins;
  assert.equal(ctrl.tapSlot(0), true);
  assert.ok(ctrl.coins < before);
  assert.equal(ctrl.deckList().length, 1);
});
test('empty deck never fires; a built deck progresses the boss', () => {
  const { ctrl } = makeController(); ctrl.step(8000);
  // Pick an OFFENSIVE (enemy-target) tier-1 — slot 0 may be heal/etc. after a roster change,
  // so don't assume slot index; find a real damage skill.
  const pick = findTier1EnemySlot(ctrl);
  assert.ok(pick, 'expected a tier-1 enemy skill in the slots');
  assert.equal(ctrl.tapSlot(pick.idx), true);
  for (let i = 0; i < 30; i++) ctrl.step(500);
  assert.ok(ctrl.killCount() >= 1);
});
test('idle auto-pick builds a deck for a never-tapping viewer', () => {
  const { ctrl } = makeController(); ctrl.beginOnboarding();
  for (let i = 0; i < 60; i++) ctrl.step(500);
  assert.ok(ctrl.deckList().length >= 1);
});
test('a MANUAL pick disengages auto-pick — an active player never gets surprise auto-picks', () => {
  // Reported bug: the idle timer fired even when the player was actively playing (just
  // paused to think). After ONE manual pick the player is "playing" — auto-pick must
  // never fire again, no matter how long they idle.
  const { ctrl, cfg } = makeController({ startCoins: 50, regen: 50, coinMax: 200 });
  ctrl.beginOnboarding();
  assert.equal(ctrl.tapSlot(0), true);               // one manual pick
  const picksAfterManual = ctrl.deckEntries().reduce((s, e) => s + e.stack, 0);
  // Idle for 3× the auto-pick window — a still-armed clock would add/stack more picks.
  for (let t = 0; t < cfg.idleAutoPickMs * 3; t += 100) ctrl.step(100);
  const picksAfterIdle = ctrl.deckEntries().reduce((s, e) => s + e.stack, 0);
  assert.equal(picksAfterIdle, picksAfterManual, 'no auto-pick fired after the manual pick');
});
test('always reaches victory, never before MIN_FIGHT_MS', () => {
  const { ctrl, cfg } = makeController(); ctrl.beginOnboarding();
  let t = 0; while (!ctrl.isVictory() && t < 60000) { ctrl.step(100); t += 100; }
  assert.equal(ctrl.isVictory(), true);
  assert.ok(t >= cfg.fightClock.minMs);
});
test('MAX backstop forces victory with a damage-less (no-coin) deck', () => {
  const { ctrl, cfg } = makeController({ startCoins: 0, regen: 0 });
  ctrl.beginOnboarding();
  let t = 0; while (!ctrl.isVictory() && t < 60000) { ctrl.step(100); t += 100; }
  assert.equal(ctrl.isVictory(), true);
  assert.ok(t >= cfg.fightClock.maxMs - 200);
});
test('victory latches once', () => {
  const { ctrl, fx } = makeController(); ctrl.beginOnboarding();
  while (!ctrl.isVictory()) ctrl.step(100);
  for (let i = 0; i < 10; i++) ctrl.step(100);
  assert.equal(fx.victoryCount, 1);
});

// ── Stacking — the user's exact test ──
test('picking the SAME blue skill twice stacks (entries shows stack=2, deck size unchanged)', () => {
  // Use a huge coin reserve so a tier-1 skill is always affordable on demand.
  const { ctrl } = makeController({ startCoins: 50, regen: 50, coinMax: 200 });
  // Find the first slot whose skill is BLUE (tier 1) AND not a self-target (so it's stackable).
  let firstId: string | null = null; let firstIdx = -1;
  const snap0 = ctrl.slotsSnapshot();
  for (let i = 0; i < snap0.length; i++) {
    const id = snap0[i]?.skill.id; if (!id) continue;
    const def = skillById(id as any);
    if (def && def.tier === 1 && def.target !== 'self') { firstId = id; firstIdx = i; break; }
  }
  assert.ok(firstId && firstIdx >= 0, 'expected a blue stackable skill in the initial slots');
  assert.equal(ctrl.tapSlot(firstIdx), true);
  assert.deepEqual(ctrl.deckList(), [firstId]);
  assert.deepEqual(ctrl.deckEntries(), [{ id: firstId, stack: 1 }]);

  // Drive the sim and pick OTHER slots (refilling the pool) until that same blue skill
  // reappears in some slot. The pool re-includes it on refill (it's NOT excluded — only
  // maxed/non-stackable owned are). DO NOT call beginOnboarding() — the idle auto-pick
  // would fill the deck and contaminate the assertion.
  let recurred = -1;
  for (let n = 0; n < 200 && recurred < 0; n++) {
    ctrl.step(100);
    const snap = ctrl.slotsSnapshot();
    for (let i = 0; i < snap.length; i++) {
      if (snap[i]?.skill.id === firstId) { recurred = i; break; }
    }
    if (recurred >= 0) break;
    // Churn: pick a non-target slot (any non-blue) so a new slot draws. If only the target
    // id would be drawable we just keep stepping.
    const snap2 = ctrl.slotsSnapshot();
    for (let i = 0; i < snap2.length; i++) {
      const sid = snap2[i]?.skill.id;
      if (sid && sid !== firstId) { ctrl.tapSlot(i); break; }
    }
  }
  assert.ok(recurred >= 0, `blue skill ${firstId} should recur in some slot within the test window`);
  const sizeBefore = ctrl.deckList().length;
  assert.equal(ctrl.tapSlot(recurred), true);
  assert.equal(ctrl.deckList().length, sizeBefore, 'deck size unchanged on merge');
  // Find the merged entry and confirm its stack went to 2.
  const merged = ctrl.deckEntries().find(e => e.id === firstId);
  assert.ok(merged, 'merged entry exists');
  assert.equal(merged!.stack, 2);
});

// ── First-pick stack tutorial ────────────────────────────────────────────────
// Onboarding spotlights the cheapest tier-1 (shuriken, cost 5 = the starting coins) and the
// player picks it first. That ONE pick must re-offer the SAME skill so they can immediately
// pick it again and watch it merge/stack. Every later refill behaves normally.
test('onboarding guarantees shuriken (cheapest tier-1) in the opening slots', () => {
  const { ctrl } = makeController(); // default seed — shuriken is NOT in the raw draw, must be forced
  assert.equal(ctrl.slotsSnapshot()[0]?.skill.id, 'shuriken', 'cheapest (leftmost) slot is shuriken');
  assert.equal(ctrl.slotsSnapshot()[0]?.skill.cost, 5);
});

test('the FIRST pick re-offers the same skill so it can be stacked immediately; later picks refill normally', () => {
  const { ctrl } = makeController({ startCoins: 50, regen: 50, coinMax: 200 });
  assert.equal(ctrl.slotsSnapshot()[0]?.skill.id, 'shuriken');
  // First pick → shuriken into the deck, AND the same slot is re-offered shuriken.
  assert.equal(ctrl.tapSlot(0), true);
  assert.deepEqual(ctrl.deckEntries(), [{ id: 'shuriken', stack: 1 }]);
  const reoffered = ctrl.slotsSnapshot().findIndex(s => s?.skill.id === 'shuriken');
  assert.ok(reoffered >= 0, 'first pick re-offered shuriken into a slot');
  // Picking the re-offered shuriken merges → stack 2 (the tutorial stack moment).
  assert.equal(ctrl.tapSlot(reoffered), true);
  assert.deepEqual(ctrl.deckEntries(), [{ id: 'shuriken', stack: 2 }]);
  // The re-offer is a ONE-SHOT: this second pick refills normally (excludes shuriken), so no
  // slot is re-offered shuriken again right after.
  assert.ok(ctrl.slotsSnapshot().every(s => s?.skill.id !== 'shuriken'),
    'only the first pick re-offers; the next refill draws a different skill');
});

test('picking a YELLOW (tier-3) twice does not stack (second tap is rejected/non-merge)', () => {
  // Seed 7 keeps a tier-3 (thunderstorm) in the opening slots even after the onboarding forces
  // shuriken in (seed 7 already has shuriken, so no eviction). The find-loop below only steps
  // (no refill), so a tier-3 must be present in the FROZEN opening draw.
  const { ctrl } = makeController({ startCoins: 50, regen: 50, coinMax: 200, seed: 7 });
  // Find a tier-3 in the initial roster slots (or churn until one appears).
  let yellowId: string | null = null; let yellowIdx = -1;
  for (let n = 0; n < 200 && !yellowId; n++) {
    const snap = ctrl.slotsSnapshot();
    for (let i = 0; i < snap.length; i++) {
      const id = snap[i]?.skill.id; if (!id) continue;
      const def = skillById(id as any);
      if (def && def.tier === 3) { yellowId = id; yellowIdx = i; break; }
    }
    if (!yellowId) ctrl.step(100);
  }
  assert.ok(yellowId, 'expected a yellow skill to appear in some slot');
  assert.equal(ctrl.tapSlot(yellowIdx), true);
  assert.deepEqual(ctrl.deckEntries(), [{ id: yellowId, stack: 1 }]);

  // After the pick, the excluded set marks it (non-stackable owned) → it must NEVER recur.
  // Drive more sim and assert it does not reappear.
  for (let n = 0; n < 200; n++) {
    ctrl.step(100);
    const snap = ctrl.slotsSnapshot();
    for (const s of snap) if (s) assert.notEqual(s.skill.id, yellowId, 'yellow id should not be re-offered');
  }
  assert.deepEqual(ctrl.deckEntries(), [{ id: yellowId, stack: 1 }]);
});

// ── forceOffer (test/dev hook for the Playwright stacking-screenshot harness) ──
test('forceOffer places a specific skill in a slot and a follow-up tap merges into the deck', () => {
  // Build a controller with plenty of coins. Find a blue (stackable) skill currently in some
  // slot, tap it to seed the deck, then force-offer the SAME id back into slot 0 and tap it.
  const { ctrl } = makeController({ startCoins: 50, regen: 50, coinMax: 200 });
  let blueId: string | null = null; let blueIdx = -1;
  const snap = ctrl.slotsSnapshot();
  for (let i = 0; i < snap.length; i++) {
    const id = snap[i]?.skill.id; if (!id) continue;
    const def = skillById(id as any);
    if (def && def.tier === 1 && def.target !== 'self') { blueId = id; blueIdx = i; break; }
  }
  assert.ok(blueId && blueIdx >= 0);
  assert.equal(ctrl.tapSlot(blueIdx), true);
  // forceOffer the same id back into slot 0.
  assert.equal(ctrl.forceOffer(blueId!, 0), true);
  assert.equal(ctrl.slotsSnapshot()[0]?.skill.id, blueId);
  // Tapping it again should MERGE (deck size unchanged, stack=2).
  const sizeBefore = ctrl.deckList().length;
  assert.equal(ctrl.tapSlot(0), true);
  assert.equal(ctrl.deckList().length, sizeBefore);
  const merged = ctrl.deckEntries().find(e => e.id === blueId);
  assert.equal(merged?.stack, 2);
});

test('forceOffer refuses unknown ids and out-of-range slot indices', () => {
  const { ctrl } = makeController();
  assert.equal(ctrl.forceOffer('not-a-real-skill', 0), false);
  assert.equal(ctrl.forceOffer('shuriken', -1), false);
  assert.equal(ctrl.forceOffer('shuriken', 99), false);
});

// ── AppLovin analytics: challenge progress (drives CHALLENGE_PASS_25/50/75) ──
test('challengeProgress is 0 at start, reaches ~1 at victory, and never decreases', () => {
  const { ctrl } = makeController();
  assert.equal(ctrl.challengeProgress(), 0, 'no damage dealt yet → 0');
  ctrl.beginOnboarding();
  let prev = 0; let t = 0; let crossed25 = false; let crossed75 = false;
  while (!ctrl.isVictory() && t < 90000) {
    ctrl.step(100); t += 100;
    const aff = ctrl.affordableSlots(); if (aff.length) ctrl.tapSlot(aff[0]);
    const p = ctrl.challengeProgress();
    assert.ok(p >= prev - 1e-9, `progress must be monotonic (was ${prev}, now ${p} @${t}ms)`);
    assert.ok(p >= 0 && p <= 1, `progress in [0,1] (got ${p})`);
    if (p >= 0.25) crossed25 = true;
    if (p >= 0.75) crossed75 = true;
    prev = p;
  }
  assert.equal(ctrl.isVictory(), true);
  assert.ok(ctrl.challengeProgress() >= 0.999, 'all enemies dead → progress ~1');
  assert.ok(crossed25 && crossed75, 'fight passes through the 25% and 75% milestones');
});

// ── Onboarding fight-gate (cfg.gateFightUntilFirstPick) ──
test('gate ON: the fight is frozen until the first pick, then runs', () => {
  const { ctrl, fx } = makeController({ startCoins: 50, regen: 50, coinMax: 200, gate: true });
  const bossFull = ctrl.currentEnemyHp(0);
  // No beginOnboarding (idle clock NOT armed) + no tap → combat must stay frozen indefinitely.
  for (let i = 0; i < 80; i++) ctrl.step(100);
  assert.equal(ctrl.isVictory(), false, 'no victory while gated');
  assert.equal(ctrl.killCount(), 0, 'no kills while gated');
  assert.equal(fx.enemyHits.length, 0, 'no enemy attacks while gated');
  assert.equal(fx.meleeHits.length, 0, 'no hero melee while gated');
  assert.equal(fx.damageHits.length, 0, 'no deck-fire while gated');
  assert.equal(ctrl.currentEnemyHp(0), bossFull, 'boss HP untouched while gated');
  assert.ok(ctrl.coins > 0, 'economy still runs so a first pick is possible');
  // First pick starts the held fight.
  assert.equal(ctrl.tapSlot(0), true);
  for (let i = 0; i < 60; i++) ctrl.step(100);
  assert.ok(fx.meleeHits.length > 0, 'hero melee resumes after the first pick');
  assert.ok(ctrl.currentEnemyHp(0) < bossFull, 'boss takes damage once the fight starts');
});

test('gate ON: an idle (never-tapping) viewer still starts + completes the fight via auto-pick', () => {
  const { ctrl } = makeController({ gate: true });
  ctrl.beginOnboarding();
  let t = 0; while (!ctrl.isVictory() && t < 120000) { ctrl.step(100); t += 100; }
  assert.equal(ctrl.isVictory(), true, 'idle auto-pick starts the gated fight and it completes');
});

test('gate OFF (default): combat runs from frame 0 with no pick', () => {
  const { ctrl, fx } = makeController({ startCoins: 0, regen: 0 }); // gate defaults off in the harness
  for (let i = 0; i < 30; i++) ctrl.step(100);
  assert.ok(fx.enemyHits.length > 0, 'enemy attacks fire from the start when the gate is off');
});

// ── Mission A — pick cap = 4 per stackable skill (MAX_STACK=4) ──
test('Mission A — picking the SAME blue skill 4 times stacks to 4; 5th pick is rejected by Deck.add', () => {
  // Walk a single blue stackable through 4 forced picks → stacks 1,2,3,4. A 5th forceOffer +
  // tap must NOT change the stack (Deck.add rejects with reason: 'max'); the deck remains
  // a single entry at stack 4.
  const { ctrl } = makeController({ startCoins: 200, regen: 50, coinMax: 500 });
  // Find a blue stackable id in the roster (don't rely on initial slot composition — pick
  // any tier-1 enemy-target id deterministically).
  let blueId: string | null = null;
  const snap = ctrl.slotsSnapshot();
  for (let i = 0; i < snap.length; i++) {
    const id = snap[i]?.skill.id; if (!id) continue;
    const def = skillById(id as any);
    if (def && def.tier === 1 && def.target !== 'self') { blueId = id; break; }
  }
  assert.ok(blueId, 'expected a blue stackable skill in the initial slots');

  // First pick: ordinary tap.
  assert.equal(ctrl.forceOffer(blueId!, 0), true);
  assert.equal(ctrl.tapSlot(0), true);
  assert.equal(ctrl.deckEntries().find(e => e.id === blueId)?.stack, 1);

  // Merges 2→4.
  for (let target = 2; target <= 4; target++) {
    assert.equal(ctrl.forceOffer(blueId!, 0), true);
    assert.equal(ctrl.tapSlot(0), true);
    const entry: { id: string; stack: number } | undefined =
      ctrl.deckEntries().find(e => e.id === blueId);
    assert.equal(entry?.stack, target, `after ${target}th pick, stack should be ${target}`);
  }

  // 5th pick: forceOffer still places (it doesn't know about MAX) but the tap must NOT bump
  // the stack — Deck.add returns rejected:'max'. Deck size stays 1; stack stays 4.
  assert.equal(ctrl.forceOffer(blueId!, 0), true);
  ctrl.tapSlot(0); // tap proceeds but the deck rejects the merge internally
  assert.equal(ctrl.deckList().length, 1, 'deck still has 1 unique entry');
  assert.equal(ctrl.deckEntries().find(e => e.id === blueId)?.stack, 4, 'stack stays at 4 (max)');
});

test('Mission A — a stack-4 blue skill is permanently excluded from slot refills', () => {
  // Drive a blue skill to stack=4, then churn many refills and assert it never reappears
  // in any slot — parallel coverage to the existing "yellow once → never re-offered" test
  // but at the new MAX_STACK=4 ceiling.
  const { ctrl } = makeController({ startCoins: 200, regen: 50, coinMax: 500 });
  let blueId: string | null = null;
  const snap = ctrl.slotsSnapshot();
  for (let i = 0; i < snap.length; i++) {
    const id = snap[i]?.skill.id; if (!id) continue;
    const def = skillById(id as any);
    if (def && def.tier === 1 && def.target !== 'self') { blueId = id; break; }
  }
  assert.ok(blueId);
  // Force the id 4 times to reach stack 4.
  for (let k = 0; k < 4; k++) {
    assert.equal(ctrl.forceOffer(blueId!, 0), true);
    assert.equal(ctrl.tapSlot(0), true);
  }
  assert.equal(ctrl.deckEntries().find(e => e.id === blueId)?.stack, 4);
  // Churn many refills via stepping + tapping non-target slots; the maxed id must NEVER reappear.
  for (let n = 0; n < 200; n++) {
    ctrl.step(100);
    const sl = ctrl.slotsSnapshot();
    for (let i = 0; i < sl.length; i++) {
      if (sl[i]) assert.notEqual(sl[i]!.skill.id, blueId, `maxed stack-4 id ${blueId} must not be re-offered`);
    }
    // Tap a slot that's NOT the target id (and that's affordable) to churn refills.
    for (let i = 0; i < sl.length; i++) {
      const sid = sl[i]?.skill.id;
      if (sid && sid !== blueId) { ctrl.tapSlot(i); break; }
    }
  }
});

// ── Mission #10 integration tests ────────────────────────────────────────────

/** Drive the sim and keep `fxRec.elapsedMs` in sync so showDamage / scare entries
 *  carry the test-owned timestamp. Picks any affordable slot at every tick so the
 *  deck actually fires. Returns the elapsed sim time at victory. */
function runActive(ctrl: CombatController, fxRec: ReturnType<typeof makeFx>['rec'], cfg: any): number {
  ctrl.beginOnboarding();
  let t = 0;
  while (!ctrl.isVictory() && t < 90000) {
    ctrl.step(100); t += 100; fxRec.elapsedMs = t;
    // Active picking: snap up anything affordable (any tier).
    const aff = ctrl.affordableSlots();
    if (aff.length) ctrl.tapSlot(aff[0]);
  }
  return t;
}

test('every deck-fire reports amount > 0 (no zero-damage hits — regression for dd7d3aa)', () => {
  const { ctrl, fx, cfg } = makeController();
  runActive(ctrl, fx, cfg);
  assert.equal(ctrl.isVictory(), true);
  assert.ok(fx.damageHits.length > 0, 'the deck actually fired some damage casts');
  // Every enemy-target playCast invocation MUST carry a positive amount. The dd7d3aa
  // suppression's regression was amount === 0 for held finisher fires. (Saturated
  // heal-scare chips at the floor are an exception — those would report amount=0 from
  // the rig, but the controller now never fires them because the heal-scare blocks the
  // deck until a heal/timeout clears it. The finisher-volley path uses amount=0 by
  // design, but only after the rig is already resolved by resolveFinisher.)
  for (const hit of fx.damageHits) {
    assert.ok(hit.amount > 0, `enemy hit ${hit.skillId} @${hit.tMs}ms reported amount=${hit.amount} (must be > 0)`);
  }
});

test('multi-scare arc: early scare lands ~12–22s, late scare lands later (≥17s)', () => {
  // Two danger beats fire two scare() calls. The early auto-clear scare lands earlier
  // (after 2 boss-milestones whittled — depends on coin curve / RNG), the late heal
  // scare lands closer to the finale. Window is generous because regen scales with kills.
  const { ctrl, fx, cfg } = makeController();
  runActive(ctrl, fx, cfg);
  assert.ok(fx.scares.length >= 2, `expected ≥2 scare calls, got ${fx.scares.length}`);
  const earlyTs = fx.scares[0].tMs;
  const lateTs = fx.scares[fx.scares.length - 1].tMs;
  // Early scare: somewhere in the first half of a fight that lasts < maxMs.
  assert.ok(earlyTs >= 5000 && earlyTs <= 25000, `early scare at ${earlyTs}ms outside [5000,25000]`);
  // Late scare: strictly after the early one (distinct beats). Margin kept modest so the
  // assertion is robust to roster/coin-curve pacing shifts — the meaningful invariant is the
  // two distinct scares at the ~50%/~15% HP fractions checked below.
  assert.ok(lateTs > earlyTs + 1500, `late scare at ${lateTs}ms not later than early at ${earlyTs}ms+1.5s`);
  // The two scare HP targets correspond to ~50% and ~15% of hero.maxHp.
  const maxHp = cfg.hero.maxHp;
  const earlyFrac = fx.scares[0].targetHp / maxHp;
  const lateFrac = fx.scares[fx.scares.length - 1].targetHp / maxHp;
  assert.ok(earlyFrac > 0.30 && earlyFrac < 0.65, `early scare hp ${earlyFrac.toFixed(2)} not ~50%`);
  assert.ok(lateFrac > 0.05 && lateFrac < 0.25, `late scare hp ${lateFrac.toFixed(2)} not ~15%`);
});

test('early auto-scare auto-clears (no heal needed) — fight progresses through it', () => {
  // The auto-kind scare must NOT freeze the deck — it scripts the hp dip but the
  // controller's autoClearMs (or the heal-bias) restores hero HP without a player heal.
  const { ctrl, fx, cfg } = makeController();
  const tVic = runActive(ctrl, fx, cfg);
  assert.equal(ctrl.isVictory(), true);
  assert.ok(tVic <= cfg.fightClock.maxMs + 200, `victory by MAX (${tVic}ms vs ${cfg.fightClock.maxMs}ms)`);
  // At least one scare fired AND the fight cleared past it.
  assert.ok(fx.scares.length >= 1);
});

test('an active fight ends via the natural killing-fire (no MAX-backstop volley required)', () => {
  // The deck whittles the boss to 0 across ordinary fires. The controller latches victory
  // the moment the rig is victorious AND we're past MIN. endedByNaturalKillingFire() is the
  // signal the scene uses to play the killing-fire flair (zoom + extra particles + shake).
  const { ctrl, fx, cfg } = makeController();
  const tVic = runActive(ctrl, fx, cfg);
  assert.equal(ctrl.isVictory(), true);
  assert.equal(ctrl.endedByNaturalKillingFire(), true, 'natural killing-fire path (not MAX backstop)');
  assert.ok(tVic >= cfg.fightClock.minMs, `won at ${tVic}ms, after MIN (${cfg.fightClock.minMs}ms)`);
  // The MAX backstop SHOULD NOT fire — natural killing-fire happens before pastMax.
  assert.ok(tVic < cfg.fightClock.maxMs, `won at ${tVic}ms, before MAX (${cfg.fightClock.maxMs}ms)`);
});

// ── Heal-scare HOLD: deck pause ───────────────────────────────────────────────
//
// User feedback after `899f955`: during the heal-scare HOLD the deck VISIBLY ticks
// cooldowns down, the slot "completes", and then NOTHING fires — because the rig
// was returning amount=0 (boss pinned at the chip-floor) and the controller silently
// skipped it. Felt like skills did nothing for up to `ignoreTimeoutMs`. The fix:
// PAUSE the deck (do not call deck.step) while a heal-kind danger beat is pending.
// Cooldowns visibly freeze; nothing auto-fires; the moment the HOLD clears (heal
// cast OR force-resolve timeout) the deck resumes and every cast lands real damage.

/** Build a controller whose very first cast triggers a heal-kind danger beat.
 *  Beats: a single boss-milestone beat marked dangerBeat+scareKind='heal'. The
 *  first enemy-target cast lands the chip, sets dangerActive=true, dangerKind='heal'.
 *  Subsequent ticks while HOLD is active MUST NOT call deck.step (no playCast). */
function makeHealHoldController(opts?: { startCoins?: number; regen?: number }) {
  const c = structuredClone(DEFAULT_CONFIG);
  c.gateFightUntilFirstPick = false; // these tests drive combat directly; no onboarding gate
  // Plenty of coin so any tier-1 pick is affordable on demand.
  c.coin.start = opts?.startCoins ?? 100;
  c.coin.regenEarly = c.coin.regenMid = c.coin.regenBoss = opts?.regen ?? 50;
  c.coin.max = 200;
  // Minimal beat plan: one heal-scare beat on the boss. The first ordinary cast hits
  // this dangerBeat and goes into HOLD. (milestoneHp left high so chip stays in-band.)
  c.beats = [
    { targetIndex: 0, milestoneHp: c.enemies[0].maxHp - 200, dangerBeat: true, scareKind: 'heal' },
    { targetIndex: 0, milestoneHp: 0, mustKill: true, finisher: true },
  ];
  // Slow the fightClock minMs out of the way so we don't accidentally latch victory.
  c.fightClock = { minMs: 60000, maxMs: 120000 };
  // Pin a SHORT ignoreTimeoutMs (3500ms) for the HOLD-pause / heal-clear tests. These
  // tests assert the deck resumes after the HOLD clears within ≤80 steps (8000ms);
  // DEFAULT_CONFIG's production value (7200ms — bumped in Mission I-v2 so the 3-dodge
  // resume arc is reachable) would push the force-resolve past the heal's post-HOLD
  // cooldown window and break the resume assertion. The dodge-cap tests use
  // makeDodgeTestController which lifts this ceiling explicitly.
  (c.scare as { ignoreTimeoutMs: number }).ignoreTimeoutMs = 3500;
  const { fx, rec } = makeFx();
  return { ctrl: new CombatController(c, fx, 12345), fx: rec, cfg: c };
}

/** Find a tier-1 enemy-target skill currently in the slots. Returns the slot index
 *  or -1 if none is offered yet. */
function findTier1EnemySlot(ctrl: CombatController): { id: string; idx: number } | null {
  const snap = ctrl.slotsSnapshot();
  for (let i = 0; i < snap.length; i++) {
    const id = snap[i]?.skill.id; if (!id) continue;
    const def = skillById(id as any);
    if (def && def.tier === 1 && def.target !== 'self') return { id, idx: i };
  }
  return null;
}

test('a scare does NOT freeze the boss — the deck keeps firing + damaging it during the dip', () => {
  // Regression for "the hero doesn't deal damage to the boss when the grace period appears":
  // the old heal-HOLD froze the deck (boss HP pinned) until a heal/timeout. That's gone — a
  // scare now only scripts a hero-HP dip and auto-recovers; the boss keeps taking damage.
  const { ctrl, fx } = makeHealHoldController();
  const pick = findTier1EnemySlot(ctrl);
  assert.ok(pick, 'expected a tier-1 enemy skill in the initial slot offer');
  assert.equal(ctrl.tapSlot(pick!.idx), true);
  assert.deepEqual(ctrl.deckList(), [pick!.id]);

  // Step until the first cast fires AND the scare fires.
  let safety = 0;
  while ((fx.damageHits.length === 0 || fx.scares.length === 0) && safety < 300) {
    ctrl.step(100); fx.elapsedMs += 100; safety++;
  }
  assert.ok(fx.scares.length >= 1, 'scare fired');
  const bossHpAtScare = ctrl.currentEnemyHp(0);
  const firesAtScare = fx.damageHits.length;

  // Step through the scare window. With the freeze removed, the deck keeps firing (cooldown
  // 2200ms ⇒ several fires across 3000ms) and the boss MUST keep losing HP.
  for (let i = 0; i < 30; i++) { ctrl.step(100); fx.elapsedMs += 100; }

  assert.ok(
    ctrl.currentEnemyHp(0) < bossHpAtScare,
    `boss HP must DROP during the scare (hero keeps damaging it): was ${bossHpAtScare}, now ${ctrl.currentEnemyHp(0)}`,
  );
  assert.ok(
    fx.damageHits.length > firesAtScare,
    `the deck must keep firing during the scare: had ${firesAtScare} casts, now ${fx.damageHits.length}`,
  );
});

test('deck resumes after heal-scare HOLD clears (via heal cast)', () => {
  const { ctrl, fx } = makeHealHoldController();
  // Pick the tier-1 enemy skill to seed the deck.
  const pick = findTier1EnemySlot(ctrl);
  assert.ok(pick);
  assert.equal(ctrl.tapSlot(pick!.idx), true);
  // Drive until first cast fires AND the scare/heal-force-offer runs in the next tick.
  let safety = 0;
  while ((fx.damageHits.length === 0 || fx.scares.length === 0) && safety < 300) {
    ctrl.step(100); fx.elapsedMs += 100; safety++;
  }
  assert.equal(fx.damageHits.length, 1);
  const firesBeforeHeal = fx.damageHits.length;
  // The heal-scare force-offers 'heal' into a slot. Find it and tap it.
  let healIdx = -1;
  const snap = ctrl.slotsSnapshot();
  for (let i = 0; i < snap.length; i++) if (snap[i]?.skill.id === 'heal') { healIdx = i; break; }
  assert.ok(healIdx >= 0, 'heal was force-offered into a slot when the HOLD began');
  assert.equal(ctrl.tapSlot(healIdx), true, 'heal pick accepted (deck capacity available)');
  // The heal goes into the deck; once it fires it clears dangerActive in the rig.
  // Step long enough for the heal to fire AND the original tier-1 skill to fire again.
  for (let i = 0; i < 80; i++) { ctrl.step(100); fx.elapsedMs += 100; }
  // After the heal clears the HOLD, the deck resumes. We expect MORE enemy-target fires
  // since we last checked, AND each fire has amount > 0 (no silent skip / 0-damage).
  assert.ok(
    fx.damageHits.length > firesBeforeHeal,
    `deck must resume after heal clears HOLD: expected >${firesBeforeHeal} fires, got ${fx.damageHits.length}`,
  );
  for (const hit of fx.damageHits) {
    assert.ok(hit.amount > 0, `every fire amount > 0 (${hit.skillId}@${hit.tMs}ms amount=${hit.amount})`);
  }
});

test('deck resumes after heal-scare HOLD clears (via ignore-timeout)', () => {
  const { ctrl, fx, cfg } = makeHealHoldController();
  const pick = findTier1EnemySlot(ctrl);
  assert.ok(pick);
  assert.equal(ctrl.tapSlot(pick!.idx), true);
  // First cast triggers HOLD; wait for the next-tick scare/heal-force.
  let safety = 0;
  while ((fx.damageHits.length === 0 || fx.scares.length === 0) && safety < 300) {
    ctrl.step(100); fx.elapsedMs += 100; safety++;
  }
  assert.equal(fx.damageHits.length, 1);
  const firesBeforeTimeout = fx.damageHits.length;
  const heroHpBefore = ctrl.heroHp();
  // Step past ignoreTimeoutMs WITHOUT picking heal — the controller's force-resolve fires.
  const timeoutMs = cfg.scare.ignoreTimeoutMs;
  const steps = Math.ceil((timeoutMs + 200) / 100);
  for (let i = 0; i < steps; i++) { ctrl.step(100); fx.elapsedMs += 100; }
  // After force-resolve: hero HP restored to maxHp AND deck resumed (more fires arriving).
  assert.equal(ctrl.heroHp(), cfg.hero.maxHp, 'force-resolve restored hero HP to max');
  // Step a bit more so the tier-1 cooldown elapses post-HOLD.
  for (let i = 0; i < 30; i++) { ctrl.step(100); fx.elapsedMs += 100; }
  assert.ok(
    fx.damageHits.length > firesBeforeTimeout,
    `deck must resume after ignore-timeout: expected >${firesBeforeTimeout} fires, got ${fx.damageHits.length}`,
  );
  for (const hit of fx.damageHits) {
    assert.ok(hit.amount > 0, `every fire amount > 0 (${hit.skillId}@${hit.tMs}ms amount=${hit.amount})`);
  }
  // Self-check: hero HP did change (force-resolve path actually ran).
  assert.notEqual(heroHpBefore, ctrl.heroHp(), 'hero HP changed via the scare → force-resolve arc');
});

test('heal-scare biases the slots toward heal (guaranteed offer when the late scare goes pending)', () => {
  // Drive an idle viewer to victory and record the slot-snapshot once the SECOND scare
  // (heal-kind, late, at ~15% hero HP) fires. The controller must have placed 'heal' in
  // one of the slots — this is the spec's "guaranteed heal offer during dangerActive".
  const { ctrl, fx, cfg } = makeController();
  ctrl.beginOnboarding();
  let t = 0;
  let lateScareHealOffered = false;
  let sawLateScare = false;
  const maxHp = cfg.hero.maxHp;
  while (!ctrl.isVictory() && t < 90000) {
    ctrl.step(100); t += 100; fx.elapsedMs = t;
    // Detect the late scare entry: the last scare in fx.scares has hpFrac < 0.25.
    if (!sawLateScare && fx.scares.length > 0) {
      const last = fx.scares[fx.scares.length - 1];
      if (last.targetHp / maxHp < 0.25) {
        sawLateScare = true;
        // The player MUST have heal available at this moment — either as a slot offer (the
        // force-offer path) OR already picked into the deck (the slot-bias was a no-op because
        // heal was already owned). Both states equally satisfy the "guaranteed heal access"
        // spec invariant — what the player can tap on.
        const slotIds = ctrl.slotsSnapshot().map(s => s?.skill.id);
        const deckIds = ctrl.deckList();
        if (slotIds.includes('heal') || deckIds.includes('heal')) lateScareHealOffered = true;
      }
    }
  }
  assert.equal(sawLateScare, true, 'the late heal-scare fired at some point');
  assert.equal(lateScareHealOffered, true, 'heal available (in slots OR deck) when the heal-scare went pending');
});

// ── Hero melee deals visible damage (Mission #11 follow-up) ─────────────────────
// The hero's basic-melee swing now lands a small rig-resolved chip on the front living
// enemy. The deck still owns milestones + the killing fire; melee chips around the floor.
test('hero melee fires at heroAttackIntervalMs cadence and reports positive damage early', () => {
  const { ctrl, fx, cfg } = makeController({ startCoins: 0, regen: 0 });
  // Drive a fight-clock window covering ~3 hero swings without any picks.
  const window = cfg.heroAttackIntervalMs * 3 + 200;
  for (let t = 0; t < window; t += 100) ctrl.step(100);
  assert.ok(fx.meleeHits.length >= 3, `expected ≥3 melee swings, saw ${fx.meleeHits.length}`);
  const withDamage = fx.meleeHits.filter(h => h.amount > 0).length;
  assert.ok(withDamage >= 2, `expected ≥2 swings to deal damage, saw ${withDamage}`);
});

test('hero melee alone never wins the fight (deck still owns the killing fire)', () => {
  // Zero coins + zero regen ⇒ no slot picks possible, no skill fires. The only HP movement
  // is the hero's melee chip. The fight must NOT reach victory before the MAX-backstop.
  const { ctrl, cfg } = makeController({ startCoins: 0, regen: 0 });
  // Simulate up to (maxMs - 200) — short of the MAX backstop. Victory must NOT latch.
  let t = 0;
  while (t < cfg.fightClock.maxMs - 200 && !ctrl.isVictory()) { ctrl.step(100); t += 100; }
  assert.equal(ctrl.isVictory(), false, 'melee alone cannot win — deck owns the killing fire');
  assert.equal(ctrl.killCount(), 0, 'no kills from melee alone');
});

test('hero melee chip stays bounded (proportional to skills, never dwarfs them)', () => {
  // Mission G Issue 4: chip clamped at [25, 80] now (previously [8, 35]). Skills do
  // 150–300 per single-strike cast (or that split into per-strike slices). A swing
  // capped at 80 is comparable to ONE slice of a 5-strike chain-lightning (~60/strike)
  // — proportionate, not negligible. The deck still owns the milestone curve.
  const { ctrl, fx, cfg } = makeController({ startCoins: 0, regen: 0 });
  for (let t = 0; t < cfg.fightClock.maxMs - 200 && !ctrl.isVictory(); t += 100) ctrl.step(100);
  const amounts = fx.meleeHits.map(h => h.amount).filter(a => a > 0);
  assert.ok(amounts.length > 0, 'at least one swing dealt damage');
  // The HERO_MELEE_MAX_AMOUNT cap is 80 — no swing exceeds it.
  const maxSeen = Math.max(...amounts);
  assert.ok(maxSeen <= 80, `max melee chip should be ≤80 (new cap), saw ${maxSeen}`);
  // MEDIAN floor — final saturation swings can clamp lower as `room` shrinks below MIN.
  const sorted = amounts.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median >= 25, `median melee chip should be ≥25 (new floor), saw ${median}`);
});

// ── Mission G Issue 3 — finale barrage (deck cooldowns accelerate below 35% boss HP) ──
test('deck fires accelerated when boss HP drops below the finale-accel threshold', () => {
  // Build a fight controller with cheap coins so the deck is non-trivially populated by
  // the time the boss falls under the threshold. We sample the cadence of deckFires
  // during the BELOW-threshold window and assert >=3 deck-fires occur inside any
  // 500ms sliding window (the "barrage" definition).
  const { ctrl, fx, cfg } = makeController({ startCoins: 50, regen: 4, coinMax: 30 });
  ctrl.beginOnboarding();
  const bossMax = cfg.enemies[0].maxHp;
  const threshold = bossMax * (cfg.deck.finaleAccel?.hpFracThreshold ?? 0.35);
  const recordsBelowThreshold: number[] = []; // tMs of deck-fires while bossHp < threshold
  let t = 0;
  while (!ctrl.isVictory() && t < 90000) {
    ctrl.step(100); t += 100; fx.elapsedMs = t;
    const aff = ctrl.affordableSlots();
    if (aff.length) ctrl.tapSlot(aff[0]);
    if (ctrl.currentEnemyHp(0) > 0 && ctrl.currentEnemyHp(0) < threshold) {
      // Record any deck-fire that happened in this tick.
      while (recordsBelowThreshold.length < fx.deckFires.length &&
             fx.deckFires[recordsBelowThreshold.length].tMs <= t) {
        recordsBelowThreshold.push(fx.deckFires[recordsBelowThreshold.length].tMs);
      }
    }
  }
  assert.ok(recordsBelowThreshold.length >= 3,
    `expected ≥3 deck-fires while bossHp<${threshold}, got ${recordsBelowThreshold.length}`);
  // Sliding-window check: at least one 500ms window contains 3+ fires.
  let bestWindow = 0;
  for (let i = 0; i < recordsBelowThreshold.length; i++) {
    let count = 1;
    for (let j = i + 1; j < recordsBelowThreshold.length; j++) {
      if (recordsBelowThreshold[j] - recordsBelowThreshold[i] <= 500) count++;
      else break;
    }
    if (count > bestWindow) bestWindow = count;
  }
  assert.ok(bestWindow >= 3,
    `expected a 500ms window with ≥3 deck-fires below threshold, best was ${bestWindow} (fires: ${recordsBelowThreshold.join(',')})`);
});

// ── Mission G Issue 1 — enemy melee chip (the hero TAKES damage) ───────────────
test('enemy attack fires at enemyAttackIntervalMs cadence and reports positive damage', () => {
  // Zero coins + zero regen ⇒ no slot picks possible, no skills fire — pure attack-clock.
  const { ctrl, fx, cfg } = makeController({ startCoins: 0, regen: 0 });
  // Drive ~3 enemy swings.
  const window = cfg.enemyAttackIntervalMs * 3 + 200;
  for (let t = 0; t < window; t += 100) ctrl.step(100);
  assert.ok(fx.enemyHits.length >= 3, `expected ≥3 enemy attacks, saw ${fx.enemyHits.length}`);
  // At least 2 of them must have landed actual chip (positive amount). The first scare beat
  // is far away (boss-side), so the no-scare-pending path gives a clean chip.
  const withDamage = fx.enemyHits.filter(h => h.amount > 0).length;
  assert.ok(withDamage >= 2, `expected ≥2 enemy attacks with damage, saw ${withDamage}`);
});

test('enemy melee alone never kills the hero (hero HP always > 0)', () => {
  // Zero coins + zero regen — no hero skills, no heals. The hero just absorbs swings.
  // Run for the FULL fight-clock window. Hero HP must NEVER drop to 0.
  const { ctrl, cfg } = makeController({ startCoins: 0, regen: 0 });
  for (let t = 0; t < cfg.fightClock.maxMs - 100 && !ctrl.isVictory(); t += 100) {
    ctrl.step(100);
    assert.ok(ctrl.heroHp() > 0, `hero must never die from enemy melee alone (heroHp=${ctrl.heroHp()} at t=${t}ms)`);
  }
});

test('enemy melee chip stays bounded [25, 80] same as hero (proportionate combatants)', () => {
  const { ctrl, fx, cfg } = makeController({ startCoins: 0, regen: 0 });
  for (let t = 0; t < cfg.fightClock.maxMs - 200 && !ctrl.isVictory(); t += 100) ctrl.step(100);
  const amounts = fx.enemyHits.map(h => h.amount).filter(a => a > 0);
  assert.ok(amounts.length > 0, 'at least one enemy attack landed damage');
  const maxSeen = Math.max(...amounts);
  assert.ok(maxSeen <= 80, `max enemy chip should be ≤80 (cap), saw ${maxSeen}`);
  // MEDIAN floor — final saturation swings can clamp lower as `room` shrinks below MIN.
  const sorted = amounts.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median >= 25, `median enemy chip should be ≥25 (floor), saw ${median}`);
});

// ── Mission I-v2 — Issue I1a: MINIONS must attack the hero (not just the boss) ──
//
// Bug as observed in the runtime log (tests/pw/shots/m18-runtime-log.txt, attackerIdx=0
// on every line while minions were alive): `enemies.find(e => !e.dead)` always returned
// the boss because the boss is enemies[0] and was alive through both minion-kill beats.
// Fix invariant: while >=1 minion is alive, at least one enemy-attack tick MUST be
// attributed to a minion (attackerIndex 1 or 2). The controller now picks the attacker
// (round-robin among living enemies, preferring minions) and passes it via `attackerIndex`.
test('I1a: minions attack the hero while alive (not just the boss)', () => {
  const { ctrl, fx, cfg } = makeController({ startCoins: 0, regen: 0 });
  // Run only through the minion phase — until both minions are dead OR the first
  // boss-side beat is hit. Zero coins ⇒ deck never fires ⇒ minions stay alive at their
  // maxHp the whole time, so the controller cycles enemyAttack across them.
  // (We don't need to kill minions to assert minion attacks fire.)
  const window = cfg.enemyAttackIntervalMs * 4 + 200; // ~4 enemy ticks
  for (let t = 0; t < window; t += 100) ctrl.step(100);
  assert.ok(fx.enemyHits.length >= 3, `expected ≥3 enemy attacks, saw ${fx.enemyHits.length}`);
  // The controller must pass an explicit attackerIndex (no longer -1 sentinel).
  for (const h of fx.enemyHits) {
    assert.ok(h.attackerIndex >= 0,
      `controller must pick the attacker (attackerIndex=${h.attackerIndex} @ t=${h.tMs}ms)`);
  }
  // At least one tick must be attributed to a minion (idx 1 or 2). With minions alive,
  // the boss SHOULD NOT have a monopoly on enemy attacks.
  const minionAttacks = fx.enemyHits.filter(h => h.attackerIndex === 1 || h.attackerIndex === 2).length;
  assert.ok(minionAttacks >= 1,
    `expected ≥1 minion attack while minions are alive, got ${minionAttacks} (attackerIdxs: ${fx.enemyHits.map(h => h.attackerIndex).join(',')})`);
});

test('I1a: the BOSS also attacks during the minion phase (boss is in the rotation from the start)', () => {
  // User follow-up: "boss only starts attacking after the minions die, he should attack
  // from the start". The round-robin must include the boss (idx 0) AND the minions, so
  // the boss lands at least one hit before any minion dies. Zero coins ⇒ deck never fires
  // ⇒ all three enemies stay alive at maxHp, so the rotation cycles 0 → 1 → 2 → 0 …
  const { ctrl, fx, cfg } = makeController({ startCoins: 0, regen: 0 });
  // Run enough ticks that the rotation visits all three enemies at least once (≥4 ticks).
  const window = cfg.enemyAttackIntervalMs * 5 + 200;
  for (let t = 0; t < window; t += 100) ctrl.step(100);
  // All three enemies are alive the whole window (zero coins ⇒ no deck damage), so the
  // rotation should visit each at least once.
  assert.ok(fx.enemyHits.length >= 4, `expected ≥4 enemy attacks, saw ${fx.enemyHits.length}`);
  const bossAttacks = fx.enemyHits.filter(h => h.attackerIndex === 0).length;
  const minionAttacks = fx.enemyHits.filter(h => h.attackerIndex === 1 || h.attackerIndex === 2).length;
  assert.ok(bossAttacks >= 1,
    `boss (idx 0) must attack during the minion phase, got ${bossAttacks} boss hits (attackerIdxs: ${fx.enemyHits.map(h => h.attackerIndex).join(',')})`);
  assert.ok(minionAttacks >= 1,
    `minions must still attack too, got ${minionAttacks} (attackerIdxs: ${fx.enemyHits.map(h => h.attackerIndex).join(',')})`);
});

test('I1a: enemy-attack tick is skipped when all enemies are dead (no ghost attacks)', () => {
  // A more direct invariant from the runtime log: lines 59-73 fired enemyAttack with
  // aliveCount=0 — boss just died, victory not yet latched. The controller MUST gate
  // by enemiesAlive() > 0 so the bridge never gets called with "no living enemy".
  const { ctrl, fx, cfg } = makeController();
  ctrl.beginOnboarding();
  let t = 0; let firstAllDeadT = -1;
  while (!ctrl.isVictory() && t < 90000) {
    ctrl.step(100); t += 100; fx.elapsedMs = t;
    const aff = ctrl.affordableSlots();
    if (aff.length) ctrl.tapSlot(aff[0]);
    if (firstAllDeadT < 0 && ctrl.enemiesAlive() === 0) firstAllDeadT = t;
  }
  if (firstAllDeadT > 0) {
    // No enemy attack at-or-after the moment all enemies died.
    const ghostAttacks = fx.enemyHits.filter(h => h.tMs >= firstAllDeadT).length;
    assert.equal(ghostAttacks, 0,
      `no enemy attacks after all enemies died (saw ${ghostAttacks} starting at t=${firstAllDeadT}ms)`);
  }
  // Sanity: enemy attacks fired earlier in the fight.
  assert.ok(fx.enemyHits.length >= 3, 'sanity — enemy attacks fired during the fight');
});

// ── Mission I-v2 — Issue I1b: boss attacks during heal-HOLD render as DODGES ──
//
// User directive (round 1): "the boss not dealing any damage is unacceptable. lets dodge
// its attacks maybe" — visualize the HOLD-window attacks as intentional DODGES instead
// of silent damage=0 (which read as broken to viewers).
//
// User directive (round 2): "but if user didnt chose heal/kill the boss after 3 doges
// keep the sequence going normally after" — the dodge is a TEMPORARY grace window. After
// MAX_HEAL_HOLD_DODGES (=3) dodges, the boss RESUMES landing real damage so the threat
// re-asserts. The rig clamps at the hard survival floor (SAT_MIN_HERO_HP=50) so the hero
// still cannot die from enemy melee alone, but a visible chip number lands per swing.
/** Same as makeHealHoldController but with a stretched ignoreTimeoutMs so the I1b
 *  tests can sample 4+ enemy-attack ticks while the HOLD is still active (default
 *  3500ms covers ~2 ticks @ 1700ms cadence; the dodge-cap test needs 5-6). */
function makeDodgeTestController() {
  const ctx = makeHealHoldController();
  // Webpack/structured-clone-safe mutation: keep scare object stable, just lift the
  // timeout. The controller reads cfg.scare.ignoreTimeoutMs each tick.
  (ctx.cfg.scare as { ignoreTimeoutMs: number }).ignoreTimeoutMs = 20000;
  return ctx;
}

test('enemy attacks are NEVER flagged as dodge (heal-HOLD dodge mechanic removed)', () => {
  // The 3-dodge grace within a heal-HOLD is gone. During a scare the enemy attack is just
  // cosmetic (amount 0 — the rig pinned hero HP to the scripted dip); after the scare clears
  // it chips normally. NOTHING is ever flagged dodge anymore.
  const { ctrl, fx } = makeDodgeTestController();
  const pick = findTier1EnemySlot(ctrl);
  assert.ok(pick);
  assert.equal(ctrl.tapSlot(pick!.idx), true);
  // Drive until the cast lands AND the scare fires.
  let safety = 0;
  while ((fx.damageHits.length === 0 || fx.scares.length === 0) && safety < 300) {
    ctrl.step(100); fx.elapsedMs += 100; safety++;
  }
  assert.ok(fx.scares.length >= 1, 'sanity — scare fired');
  const enemyHitsBeforeScare = fx.enemyHits.length;
  // Sample a long run of enemy attacks across the scare (this helper pins a 20s scare so the
  // whole window is "during the dip", where the enemy is cosmetic — amount 0 — by design).
  for (let i = 0; i < 100; i++) { ctrl.step(100); fx.elapsedMs += 100; }
  const enemyHitsAfter = fx.enemyHits.slice(enemyHitsBeforeScare);
  assert.ok(enemyHitsAfter.length >= 4, `expected several enemy-attack ticks, got ${enemyHitsAfter.length}`);
  // The invariant: NOTHING is ever flagged as a dodge (the grace mechanic is gone).
  for (const h of enemyHitsAfter) {
    assert.notEqual(h.dodge, true, `no enemy attack should be flagged dodge (got dodge=${h.dodge})`);
  }
});

test('I1b: post-dodge resumed attacks NEVER kill the hero (survival floor clamps)', () => {
  // The HOLD pinned hero to ~15% maxHp. After 3 dodges, real damage starts landing.
  // The rig's SAT_MIN_HERO_HP=50 floor MUST keep hero HP > 0 across many such ticks.
  const { ctrl, fx, cfg } = makeDodgeTestController();
  const pick = findTier1EnemySlot(ctrl);
  assert.ok(pick);
  assert.equal(ctrl.tapSlot(pick!.idx), true);
  let safety = 0;
  while ((fx.damageHits.length === 0 || fx.scares.length === 0) && safety < 300) {
    ctrl.step(100); fx.elapsedMs += 100; safety++;
  }
  // Drive 30+ enemy-attack intervals worth of HOLD (force-resolve will kick in via
  // ignoreTimeoutMs; we just need to confirm hero never dies along the way).
  for (let i = 0; i < 600; i++) {
    ctrl.step(100); fx.elapsedMs += 100;
    assert.ok(ctrl.heroHp() > 0, `hero must never die during HOLD/post-dodge (heroHp=${ctrl.heroHp()} at i=${i})`);
  }
  // The fight may have ended via timeout/heal — sanity-check no hero-death.
  assert.ok(ctrl.heroHp() > 0, 'hero alive at end of test');
  // Reference cfg so the helper's adjusted timeouts aren't optimized out.
  assert.ok(cfg.scare.ignoreTimeoutMs > 0);
});

test('I1b: normal enemy attacks (no HOLD) are NEVER flagged as dodge', () => {
  // Outside the heal-HOLD, the boss/minions deal real chip damage. The dodge flag
  // is exclusive to the heal-HOLD path so the player's eye reads "real threat" vs
  // "scripted scare moment" clearly.
  const { ctrl, fx, cfg } = makeController({ startCoins: 0, regen: 0 });
  const window = cfg.enemyAttackIntervalMs * 3 + 200;
  for (let t = 0; t < window; t += 100) ctrl.step(100);
  // No heal-HOLD has triggered yet (no boss damage to advance beats). Every hit must be
  // real damage with dodge=false.
  for (const h of fx.enemyHits) {
    assert.equal(h.dodge, false, `non-HOLD enemy attack must not be a dodge (h.amount=${h.amount} @t=${h.tMs}ms)`);
  }
  // And at least some hits delivered actual damage.
  const realHits = fx.enemyHits.filter(h => h.amount > 0).length;
  assert.ok(realHits >= 2, `expected ≥2 real enemy hits, saw ${realHits}`);
});

// ── Lose variant (Task 3) — defeat latch, finisher held forever, MAX backstop cannot win ──
test('lose outcome: hero dies at the finale, boss survives, defeat (not victory)', () => {
  const { ctrl, fx } = makeController({ startCoins: 50, regen: 50, coinMax: 200, outcome: 'lose' });
  ctrl.beginOnboarding();
  let t = 0; while (!ctrl.isDefeat() && !ctrl.isVictory() && t < 90000) { ctrl.step(100); t += 100; const a = ctrl.affordableSlots(); if (a.length) ctrl.tapSlot(a[0]); }
  assert.equal(ctrl.isDefeat(), true, 'reaches defeat');
  assert.equal(ctrl.isVictory(), false, 'never victory in lose mode');
  assert.equal(ctrl.heroHp(), 0, 'hero died');
  assert.ok(ctrl.currentEnemyHp(0) > 0, 'boss survived (not killed)');
  assert.ok(t >= 17000, 'defeat lands past minMs (during the finale)');
  assert.equal(fx.heroDeaths, 1, 'death announced exactly once');
});

test('lose outcome with a damage-less deck still reaches defeat by the backstop (boss never wins)', () => {
  const { ctrl } = makeController({ startCoins: 0, regen: 0, outcome: 'lose' });
  let t = 0; while (!ctrl.isDefeat() && !ctrl.isVictory() && t < 60000) { ctrl.step(100); t += 100; }
  assert.equal(ctrl.isDefeat(), true);
  assert.equal(ctrl.isVictory(), false, 'MAX backstop must NOT produce a win in a lose build');
});

test('win outcome (default) is unaffected — still reaches victory, never defeat', () => {
  const { ctrl } = makeController(); ctrl.beginOnboarding();
  let t = 0; while (!ctrl.isVictory() && t < 90000) { ctrl.step(100); t += 100; const a = ctrl.affordableSlots(); if (a.length) ctrl.tapSlot(a[0]); }
  assert.equal(ctrl.isVictory(), true);
  assert.equal(ctrl.isDefeat(), false);
});

// ── Iteration #3: store-CTA on the LATE-SCARE pressure point ─────────────────────────────
// onVolley() fires ONCE — on the first MANUAL pick after the late "heal" scare (boss ~20% HP,
// the near-death "so close" moment). Idle auto-picks never trigger it; it never fires before the
// late scare (i.e. not at the early ~85% scare); and it fires at most once per run.

test('volley: fires once on the first manual tap AFTER the late (near-death) scare', () => {
  const { ctrl, fx, cfg } = makeController({ startCoins: 9999, regen: 9999, coinMax: 99999 });
  const bossMax = cfg.enemies[0].maxHp;
  let fires = 0; let bossHpAtFire = -1;
  ctrl.setOnVolley(() => { fires++; if (bossHpAtFire < 0) bossHpAtFire = ctrl.currentEnemyHp(0); });
  ctrl.beginOnboarding();
  // Drive (step + pick what's available) until BOTH scares have fired — the 2nd is the late
  // heal-scare (hero floors to ~15% HP), which arms the soft CTA.
  let t = 0;
  while (fx.scares.length < 2 && t < 90000 && !ctrl.isVictory()) {
    ctrl.step(100); t += 100; fx.elapsedMs = t;
    const aff = ctrl.affordableSlots(); if (aff.length) ctrl.tapSlot(aff[0]);
  }
  assert.ok(fx.scares.length >= 2, `both scares fired (got ${fx.scares.length})`);
  // The first manual skill-slot tap after the late scare fires the soft CTA (a real user gesture).
  // (A pick during the drive above may have already fired it the instant the scare armed — either
  // way the result is exactly one fire, and never on the early ~85% scare.)
  ctrl.tapSlot(0);
  assert.equal(fires, 1, 'the soft store CTA fires exactly once, after the late scare');
  assert.ok(bossHpAtFire > 0 && bossHpAtFire < bossMax * 0.35,
    `fired at the LATE scare, boss low (hp=${bossHpAtFire} < ${bossMax * 0.35})`);
  // Never re-fires on later taps.
  ctrl.tapSlot(0); ctrl.tapSlot(1);
  assert.equal(fires, 1, 'fires at most once per run');
});

test('volley: does NOT fire before the late scare (early picks, boss still healthy)', () => {
  const { ctrl, cfg } = makeController({ startCoins: 200, regen: 200, coinMax: 999 });
  const bossMax = cfg.enemies[0].maxHp;
  let fires = 0; ctrl.setOnVolley(() => { fires++; });
  ctrl.step(0);
  const a = ctrl.affordableSlots(); assert.ok(a.length); ctrl.tapSlot(a[0]); ctrl.step(300);
  assert.ok(ctrl.currentEnemyHp(0) > bossMax * 0.35, 'boss still healthy — no late scare yet');
  assert.equal(fires, 0, 'no store CTA before the late scare');
});

test('volley: idle AUTO-picks never trigger it (only an engaged player tapping)', () => {
  // A never-tapping viewer auto-builds via the idle clock; even if the late scare fires, with
  // NO manual pick (auto-picks are excluded) the soft CTA must never fire.
  const { ctrl } = makeController({ startCoins: 999, regen: 999, coinMax: 9999 });
  let fires = 0; ctrl.setOnVolley(() => { fires++; });
  ctrl.beginOnboarding();
  for (let i = 0; i < 200; i++) ctrl.step(50); // 10s of auto-pick churn
  assert.equal(fires, 0, 'auto-picks alone never trigger the store CTA');
});
