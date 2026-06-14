import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRIT_RATE, HERO_HIT_STYLE, rollCrit } from '../combat/Crit';
import { mulberry32 } from '../rng';

// Mission C — cosmetic crit system.
// Each drawn damage number has a chance (CRIT_RATE) to be displayed as a CRIT
// (bolder style, warmer color, "CRIT!" label). The actual numeric value is
// unchanged — crit is PURELY VISUAL and never alters the rig math.

test('CRIT_RATE is a sensible probability in (0, 1)', () => {
  assert.ok(CRIT_RATE > 0 && CRIT_RATE < 1, 'CRIT_RATE must be a probability');
  // Pinned to the design choice in the spec — 18% feels "occasional but not rare".
  assert.equal(CRIT_RATE, 0.18, 'CRIT_RATE pinned at 0.18 per spec');
});

test('rollCrit returns boolean and respects the seeded rng', () => {
  const rng = mulberry32(123);
  const a = rollCrit(rng);
  assert.equal(typeof a, 'boolean');
  // Same seed → same sequence (determinism for tests).
  const rng2 = mulberry32(123);
  const sequence1: boolean[] = [];
  const sequence2: boolean[] = [];
  const rngA = mulberry32(456);
  const rngB = mulberry32(456);
  for (let i = 0; i < 50; i++) sequence1.push(rollCrit(rngA));
  for (let i = 0; i < 50; i++) sequence2.push(rollCrit(rngB));
  assert.deepEqual(sequence1, sequence2, 'same seed → same crit sequence');
});

// ── Mission I-v2 Issue I2 — HERO_HIT_STYLE shape invariants ───────────────────
//
// The hero-hit damage number's red gradient is consumed at runtime by
// CombatFx.showDamageNumber as a FillGradient.colorStops payload. A regression that
// drops one of the stops or mis-orders them silently breaks the visual cue — easier
// to detect with a structural test than a screenshot diff.

test('I2: HERO_HIT_STYLE has a 4-stop gradient ordered top→bottom', () => {
  assert.ok(Array.isArray(HERO_HIT_STYLE.gradientStops), 'gradientStops is an array');
  assert.equal(HERO_HIT_STYLE.gradientStops.length, 4, 'expected exactly 4 gradient stops');
  // Offsets strictly increase from 0 to 1.
  const offsets = HERO_HIT_STYLE.gradientStops.map(s => s.offset);
  assert.equal(offsets[0], 0, 'first stop at 0');
  assert.equal(offsets[offsets.length - 1], 1, 'last stop at 1');
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] > offsets[i - 1], `stop ${i} offset must increase (got ${offsets[i - 1]} → ${offsets[i]})`);
  }
});

test('I2: HERO_HIT_STYLE reads as RED (high-red, low-green/blue at the body stops)', () => {
  // Verify the visual semantics: the BODY stops (offset 0.30 and 0.70) and the BOTTOM
  // anchor MUST be unambiguously red — i.e. red channel dominates green + blue. The
  // VERY TOP stop is allowed to be light (silhouette pop), so we skip it.
  const stops = HERO_HIT_STYLE.gradientStops;
  for (let i = 1; i < stops.length; i++) {
    const c = stops[i].color;
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    assert.ok(r > g && r > b,
      `stop ${i} (#${c.toString(16).padStart(6, '0')}) must be red-dominant (R=${r} G=${g} B=${b})`);
  }
});

test('I2: HERO_HIT_STYLE stroke is dark and red-tinted (anchors the warm fill)', () => {
  const c = HERO_HIT_STYLE.strokeColor;
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  // Dark: max channel < 0.4 of full.
  assert.ok(Math.max(r, g, b) < 102, `stroke must be DARK (max channel <102, got ${Math.max(r, g, b)})`);
  // Red-tinted: r >= g and r >= b.
  assert.ok(r >= g && r >= b, `stroke must be red-tinted (R=${r} G=${g} B=${b})`);
});

test('rollCrit converges to CRIT_RATE over large N (statistical)', () => {
  const rng = mulberry32(0xC0FFEE);
  const N = 5000;
  let crits = 0;
  for (let i = 0; i < N; i++) if (rollCrit(rng)) crits++;
  const observed = crits / N;
  // Allow ±3 percentage points slack — 5000 trials is enough to keep this stable
  // across reasonable mulberry32 seeds. The acceptance band is wider than the
  // expected ±1 SD (~0.5pp) so this is robust against tail seeds.
  assert.ok(Math.abs(observed - CRIT_RATE) < 0.03,
    `observed crit rate ${observed.toFixed(3)} should be within ±0.03 of CRIT_RATE ${CRIT_RATE}`);
});
