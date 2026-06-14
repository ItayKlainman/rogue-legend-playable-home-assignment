/** The 5-tier crack ladder — one tier per tap, mythic guaranteed on tap 5. */
export const CRACK_TIERS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type CrackTier = (typeof CRACK_TIERS)[number];

/** Settled tier for a 0-based tap index (clamped to the ladder). */
export function rarityForTap(tapIndex: number): CrackTier {
  const i = Math.max(0, Math.min(CRACK_TIERS.length - 1, tapIndex));
  return CRACK_TIERS[i];
}

/** A short cosmetic flicker that cycles a few tiers (never above the settled
 *  one) and ends on the settled tier — the Brawl-Stars slot-machine suspense. */
export function flickerSequence(tapIndex: number): CrackTier[] {
  const settled = rarityForTap(tapIndex);
  const cap = CRACK_TIERS.indexOf(settled);
  const seq: CrackTier[] = [];
  const FRAMES = 5;
  for (let f = 0; f < FRAMES - 1; f++) {
    seq.push(CRACK_TIERS[Math.floor(Math.random() * (cap + 1))]);
  }
  seq.push(settled);
  return seq;
}
