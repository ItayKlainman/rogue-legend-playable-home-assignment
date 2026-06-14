import type { WeaponConfig } from '@shared/SpineCharacter';

export type SkillId = string;
export type WeaponId = string;

export interface PlayerState {
  hp: number;
  maxHp: number;
  atk: number;
  /** Shop-coin currency. Default 0. Mutated by treasure/loot/shop tiles via applyStatDelta.
   *  Optional in script initialState — director defaults to 0 at construction. */
  coins?: number;
  skills: SkillId[];
  weapon: WeaponId;
  weaponConfig: WeaponConfig | null;
  heroSkin: string;
  boardTileIndex: number;
}

/** Delta payload accepted by PlayableDirector.applyStatDelta — every field is optional. */
export interface StatDelta {
  /** Absolute HP delta (clamped to [1, maxHp]). */
  hp?: number;
  /** Percentage of maxHp added to current HP (e.g., +30 = +30% maxHp; clamped to [1, maxHp]). */
  hpPct?: number;
  /** Absolute maxHp delta. Also applied to current HP so the new max isn't immediately wasted. */
  maxHp?: number;
  /** Absolute ATK delta. */
  atk?: number;
  /** Percentage of current ATK added (e.g., +12 = +12% ATK, rounded). */
  atkPct?: number;
  /** Absolute coin delta (positive or negative). HUD floor is 0 — never goes negative. */
  coins?: number;
  /** Skill ID to learn (added to state.skills if not already present). */
  skill?: string;
}
