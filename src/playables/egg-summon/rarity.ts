import type { Rarity } from './script';

/** Exact game rarity colors (ColorManager.asset `*_2` palette, applied by the
 *  egg's ColorMapper.ApplyColor(<Rarity>) to the burst/ray sprites). */
export const RARITY_TINT: Record<string, number> = {
  common: 0xcccae8,    // Gray_2  — lavender-grey
  great: 0xc5e53c,     // Green_2 — lime
  rare: 0x4fd9f4,      // Blue_2  — cyan
  epic: 0xd671fd,      // Purple_2 — violet
  legendary: 0xffc600, // Orange_2 — gold
  mythic: 0xfe4863,    // Red_2   — coral-red
};

/** Ascending ladder the mythic egg shakes through (mirrors the game's egg-open build-up). */
export const RARITY_LADDER = ['common', 'great', 'rare', 'epic', 'legendary', 'mythic'] as const;

/** Per-tier wait after each shake (seconds) — LootBoxPetEggAnimation
 *  `_animationDelaysForRarity`, indexed to match RARITY_LADDER. */
export const SHAKE_DELAYS: Record<string, number> = {
  common: 0.5, great: 0.6, rare: 0.4, epic: 0.6, legendary: 0.7, mythic: 0.5,
};

export const REVEAL_LABEL: Record<Rarity, string> = {
  common: 'COMMON',
  rare: 'RARE',
  mythic: 'MYTHIC!!!',
};

/** Egg base color shown before opening (bronze/silver/gold). */
export const EGG_BASE_TINT: Record<Rarity, number> = {
  common: 0xcd7f32, // bronze
  rare: 0xc0c0c0,   // silver
  mythic: 0xffd24a, // gold
};

/** Uppercase tier words flashed by the egg-crack rarity meter, per tap. */
export const CRACK_TIER_LABEL: Record<string, string> = {
  common: 'COMMON',
  rare: 'RARE!',
  epic: 'EPIC!',
  legendary: 'LEGENDARY!',
  mythic: 'MYTHIC!!!',
};
