import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from '../combat/Deck';
const CD = 1500;
// MAX_STACK extended from 3 → 4 (Mission A). Cooldown table extrapolates the existing
// ~30% reduction per stack: 2200 → 1500 (-32%) → 1000 (-33%) → 700 (-30%).
const STACK_CDS: [number, number, number, number] = [2200, 1500, 1000, 700];

// ── Legacy single-arg add() — non-stackable behaviour (no tier → treat as dedupe) ──
// The old test surface: add() is truthy on accept, falsy on reject; deck still caps + dedupes
// when callers don't pass tier/target. The new add() returns an object — these tests assert
// on the .added / .rejected discriminator, not on boolean equality.
test('add dedupes and respects cap (legacy single-arg path)', () => {
  const d = new Deck({ cooldownMs: CD, cap: 3 });
  assert.equal(d.add('shuriken').added, true);
  assert.equal(d.add('shuriken').rejected, true); // dedupe (no tier → non-stackable)
  assert.deepEqual(d.list(), ['shuriken']);
  assert.equal(d.has('shuriken'), true);
  d.add('fireball'); d.add('bolt');
  assert.equal(d.add('meteor').rejected, true);   // deck full
  assert.equal(d.size(), 3);
});
test('a newly added skill fires next step, then every cooldownMs', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6 });
  d.add('shuriken');
  assert.deepEqual(d.step(16), ['shuriken']);
  assert.deepEqual(d.step(16), []);
  assert.deepEqual(d.step(CD), ['shuriken']);
});
test('multiple ready skills fire in deck-index order', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6 });
  d.add('bolt'); d.add('shuriken');
  assert.deepEqual(d.step(16), ['bolt', 'shuriken']);
});
test('isFull reflects the cap (unique entries)', () => {
  const d = new Deck({ cooldownMs: CD, cap: 2 });
  assert.equal(d.isFull(), false);
  d.add('shuriken'); d.add('fireball');
  assert.equal(d.isFull(), true);
});

// ── Stacking — blue/purple (tier 1/2, target enemy) ──
test('adding the same stackable twice produces stack=2 (one entry)', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  const r1 = d.add('shuriken', 1, 'enemy'); assert.equal(r1.added, true); assert.equal(r1.stack, 1);
  const r2 = d.add('shuriken', 1, 'enemy'); assert.equal(r2.merged, true); assert.equal(r2.stack, 2);
  assert.equal(d.size(), 1);
  assert.deepEqual(d.list(), ['shuriken']);
  assert.deepEqual(d.entries(), [{ id: 'shuriken', stack: 2 }]);
});
test('stack maxes at 4; 5th add returns rejected=max', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  // Narrow through the discriminated union — added/merged carry stack, rejected does not.
  const r1 = d.add('shuriken', 1, 'enemy'); assert.ok(r1.added); assert.equal(r1.stack, 1);
  const r2 = d.add('shuriken', 1, 'enemy'); assert.ok(r2.merged); assert.equal(r2.stack, 2);
  const r3 = d.add('shuriken', 1, 'enemy'); assert.ok(r3.merged); assert.equal(r3.stack, 3);
  const r4 = d.add('shuriken', 1, 'enemy'); assert.ok(r4.merged); assert.equal(r4.stack, 4);
  const r5 = d.add('shuriken', 1, 'enemy');
  assert.ok(r5.rejected);
  assert.equal(r5.reason, 'max');
});
test('tier-3 cannot stack (dedupe on second add)', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  assert.equal(d.add('meteor', 3, 'enemy').added, true);
  const r = d.add('meteor', 3, 'enemy');
  assert.equal(r.rejected, true);
  assert.equal(r.reason, 'dedupe');
});
test('heal cannot stack (self-target, dedupe on second add)', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  assert.equal(d.add('heal', 1, 'self').added, true);
  const r = d.add('heal', 1, 'self');
  assert.equal(r.rejected, true);
  assert.equal(r.reason, 'dedupe');
});
test('merged entry cooldown resets to 0 so it fires next step at the new level cd', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  d.add('shuriken', 1, 'enemy');
  // Burn it once so its cd is the level-1 cooldown (2200).
  assert.deepEqual(d.step(16), ['shuriken']);
  // Half-way through its cd, merge: should fire on the next step.
  d.step(1000);
  d.add('shuriken', 1, 'enemy'); // merge → stack=2
  assert.deepEqual(d.step(16), ['shuriken']);
  // After firing at stack=2, cooldown = STACK_CDS[1] (1500). Stepping 1499 doesn't fire; 1500 does.
  assert.deepEqual(d.step(1499), []);
  assert.deepEqual(d.step(2), ['shuriken']);
});
test('higher stack fires more often over a long simulation', () => {
  // Simulate the SAME skill at stack 1 vs stack 4 for a long window. Stack-4 should
  // fire at least 2× as often (level-4 cd 700 vs level-1 cd 2200 → ~3.1×).
  const a = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  a.add('shuriken', 1, 'enemy');
  const b = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  b.add('shuriken', 1, 'enemy'); b.add('shuriken', 1, 'enemy');
  b.add('shuriken', 1, 'enemy'); b.add('shuriken', 1, 'enemy');
  let fa = 0, fb = 0;
  for (let t = 0; t < 30000; t += 100) {
    fa += a.step(100).length;
    fb += b.step(100).length;
  }
  assert.ok(fb >= fa * 2, `stack-4 fires ${fb} vs stack-1 fires ${fa}`);
});

test('cooldownForStack returns table entry for stacks 1..4 (capped at table length)', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  assert.equal(d.cooldownForStack(1), 2200);
  assert.equal(d.cooldownForStack(2), 1500);
  assert.equal(d.cooldownForStack(3), 1000);
  assert.equal(d.cooldownForStack(4), 700);
  // Above-table requests clamp to the last entry (stable behaviour).
  assert.equal(d.cooldownForStack(5), 700);
});
test('entries() reflects current stacks across multiple adds', () => {
  const d = new Deck({ cooldownMs: CD, cap: 6, stack: { cooldowns: STACK_CDS } });
  d.add('shuriken', 1, 'enemy');
  d.add('fireball', 1, 'enemy');
  d.add('shuriken', 1, 'enemy');
  assert.deepEqual(d.entries(), [
    { id: 'shuriken', stack: 2 },
    { id: 'fireball', stack: 1 },
  ]);
});
