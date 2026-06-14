// Mission C2 — cosmetic crit system.
//
// Each rendered damage number has a CRIT_RATE chance of being styled as a CRIT
// (bolder weight, warmer red→orange gradient, a small "CRIT!" label rising above
// the number). The actual displayed numeric value is UNCHANGED — crit is purely
// a visual flourish and never alters the rig math (sum-of-per-strike-numbers
// remains exactly equal to the rig delta).
//
// Determinism: rollCrit takes an explicit rng so CombatFx can seed a side-channel
// PRNG (separate from the rig's Rng) and tests can pin the crit sequence.
//
// Edge cases handled by the caller (CombatFx), not here:
//   • Heal numbers do NOT crit (different feel — green shimmer / +N stays vanilla).
//   • Self-target casts do NOT crit (consistency with heal).
//   • Hero melee chip numbers CAN crit (consistency with deck-fire numbers).

/** Probability per drawn damage number of being displayed as a CRIT. */
export const CRIT_RATE = 0.18;

/** Roll a crit. Returns true with probability CRIT_RATE. */
export function rollCrit(rng: () => number): boolean {
  return rng() < CRIT_RATE;
}

/** Visual constants for crit styling. Consumed by CombatFx.showDamageNumber. */
export const CRIT_STYLE = {
  /** Multiplier on the number's base font size (crits look slightly chunkier). */
  fontSizeMul: 1.18,
  /** Stroke width multiplier (heavier outline for the warmer fill). */
  strokeMul: 1.25,
  /** Warm red→orange→white gradient stops (top → bottom, local 0..1 space). */
  gradientStops: [
    { offset: 0,    color: 0xffffff },
    { offset: 0.35, color: 0xffdb4d },
    { offset: 0.70, color: 0xff7a1a },
    { offset: 1,    color: 0xb52a00 },
  ] as Array<{ offset: number; color: number }>,
  /** Dark warm stroke that pairs with the warm fill. */
  strokeColor: 0x3a0d00,
  /** "CRIT!" label font size. */
  labelFontSize: 22,
  /** "CRIT!" label fill (bright accent). */
  labelFill: 0xffe14d,
  /** "CRIT!" label stroke. */
  labelStroke: 0x3a0d00,
  /** Vertical offset of the "CRIT!" label above the damage number (px). */
  labelOffsetY: 28,
};

/** Mission I-v2 Issue I2 — distinct visual styling for damage the HERO takes (enemy
 *  melee chips landing on the hero). The previous styling was identical to the gold/
 *  white enemy-side number, which made "incoming damage" indistinguishable from
 *  "outgoing damage" at a glance. The new style:
 *
 *  • Deep dark-red → bright-red → soft-pink gradient — reads unambiguously as "bad".
 *  • Heavier dark-red stroke for legibility against the bright battle bg.
 *  • The minus prefix in the text ("-NN") stays visible against the cool-bright top
 *    stops; the dark-red bottom anchors the number as hostile.
 *
 *  NOT crit-eligible (consistency with the heal/enemy-attack design — only the
 *  player's own outgoing hits roll crits). Mirrors the CRIT_STYLE pattern so future
 *  damage-flavour variants land via the same constant-table approach. */
export const HERO_HIT_STYLE = {
  /** Warm-red gradient stops (top → bottom). The TOP is the lightest stop so the
   *  number's silhouette pops against a darker bg; the bottom is the deep blood-red
   *  that anchors the "this is incoming damage" read. */
  gradientStops: [
    { offset: 0,    color: 0xffe5e5 }, // very-light pink (almost white) — silhouette pop
    { offset: 0.30, color: 0xff5252 }, // bright red — eye magnet
    { offset: 0.70, color: 0xc62828 }, // deep red — body
    { offset: 1,    color: 0x7f1010 }, // dark blood red — anchor
  ] as Array<{ offset: number; color: number }>,
  /** Dark-red stroke (darker than gradientStops[3] so the outline reads as separate
   *  from the body, not as a continuation of it). */
  strokeColor: 0x4a0606,
  /** Stroke width multiplier on the base (matches CRIT_STYLE's heavier-than-vanilla
   *  weight so the hero-hit number reads as bold/significant, not as a stray chip). */
  strokeMul: 1.20,
};
