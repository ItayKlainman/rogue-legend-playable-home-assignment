import { test } from 'node:test'; import assert from 'node:assert/strict';
import { SlotModel } from '../combat/SlotModel';
import { mulberry32 } from '../rng';
import { ROSTER } from '../roster';
const POOL = ROSTER.map(s => ({ id: s.id, cost: s.cost }));
test('initial slots are distinct roster skills', () => {
  const ids = new SlotModel(POOL, mulberry32(1)).slots.map(s => s!.skill.id);
  assert.equal(new Set(ids).size, ids.length);
});
test('pick returns the slot skill and refills with a not-owned, not-shown skill', () => {
  const m = new SlotModel(POOL, mulberry32(1)); const owned = new Set<string>();
  const picked = m.pick(0, owned); assert.ok(picked); owned.add(picked!.id);
  assert.notEqual(m.slots[0]!.skill.id, picked!.id);
  const shown = m.slots.filter(Boolean).map(s => s!.skill.id);
  assert.equal(new Set(shown).size, shown.length);
});
test('costAt reflects slot cost; >0 for a filled slot', () => {
  assert.ok(new SlotModel(POOL, mulberry32(1)).costAt(0) > 0);
});
test('pool exhaustion leaves null slots, not a crash', () => {
  const m = new SlotModel(POOL, mulberry32(1)); const owned = new Set<string>();
  for (let n = 0; n < POOL.length + 3; n++) for (let i = 0; i < 3; i++) { const p = m.pick(i, owned); if (p) owned.add(p.id); }
  assert.doesNotThrow(() => m.costAt(0));
  assert.ok(m.slots.some(s => s === null));
});

// ── Stacking-aware refill: only EXCLUDED ids stay out of the pool. Partially-stacked
// stackables are NOT excluded (caller doesn't add them to the excluded set yet), so they
// can recur in a later slot — that's exactly what allows the merge flow.
test('partially-stacked stackable can recur (caller did NOT add it to excluded)', () => {
  // We can't directly script SlotModel's rng pick, but we CAN drive the deterministic mulberry32:
  // pick a slot WITHOUT adding the id to `excluded` and verify the slot's id can later equal it.
  // Iterate refills with an EMPTY excluded set: at some point the same id must recur because the
  // pool is small (9 skills) and refill draws from `pool \ (excluded ∪ shown)`.
  const m = new SlotModel(POOL, mulberry32(7)); const excluded = new Set<string>();
  const firstId = m.slots[0]!.skill.id;
  let recurred = false;
  // 60 picks is more than enough churn for the same id to reappear in some slot.
  for (let n = 0; n < 60 && !recurred; n++) {
    for (let i = 0; i < 3; i++) m.pick(i, excluded);
    for (const s of m.slots) if (s && s.skill.id === firstId) { recurred = true; break; }
  }
  assert.equal(recurred, true, 'a not-excluded skill should be offerable again over time');
});

// ── First-pick stack tutorial: a one-shot `reoffer` re-draws the SAME id back into the
// picked slot (instead of excluding it) so the player can immediately pick it again and
// watch it merge/stack. Every NON-reoffer pick still excludes the just-picked id.
test('reoffer re-draws the SAME id back into the picked slot', () => {
  const m = new SlotModel(POOL, mulberry32(1));
  const before = m.slots[0]!.skill.id;
  const picked = m.pick(0, new Set(), undefined, true /* reoffer */);
  assert.equal(picked!.id, before);
  assert.ok(m.slots.some(s => s?.skill.id === before), 'reoffered id should be back in a slot');
});

test('reoffer still respects excluded ids (a maxed/owned id is NOT re-offered)', () => {
  const m = new SlotModel(POOL, mulberry32(1));
  const before = m.slots[0]!.skill.id;
  // The caller marked the picked id permanently un-offerable (e.g. it just maxed). Even with
  // reoffer set, the bias must NOT override the exclusion — the slot draws a different id.
  const picked = m.pick(0, new Set([before]), undefined, true /* reoffer */);
  assert.equal(picked!.id, before);
  for (const s of m.slots) if (s) assert.notEqual(s.skill.id, before);
});

test('an excluded (maxed/owned-non-stackable) id is never offered again', () => {
  const m = new SlotModel(POOL, mulberry32(7));
  const excluded = new Set<string>();
  // Pick slot 0, add THAT id to excluded — emulating "the controller decided this id is maxed".
  const first = m.pick(0, excluded); excluded.add(first!.id);
  for (let n = 0; n < 60; n++) {
    for (let i = 0; i < 3; i++) m.pick(i, excluded);
    for (const s of m.slots) if (s) assert.notEqual(s.skill.id, first!.id, `excluded id ${first!.id} should not be offered`);
  }
});
