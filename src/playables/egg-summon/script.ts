export type Rarity = 'common' | 'rare' | 'mythic';

export interface EggReveal {
  /** Egg glow tier (bronze/silver/gold maps to common/rare/mythic for Phase 1). */
  rarity: Rarity;
  /** Display name shown on reveal, e.g. "Glacidrake". */
  name: string;
  /** Pet id used to resolve reveal sprite + (for the fighter) the Spine bundle. */
  pet: 'sly' | 'luna' | 'glacidrake';
}

export interface EggSummonScript {
  eggs: EggReveal[];           // length 3, ascending rarity (straight arc)
  fighterIndex: number;        // which egg becomes the battling pet (the mythic)
}

export const PHASE1_SCRIPT: EggSummonScript = {
  eggs: [
    { rarity: 'common', name: 'Sly', pet: 'sly' },
    { rarity: 'rare', name: 'Luna', pet: 'luna' },
    { rarity: 'mythic', name: 'Glacidrake', pet: 'glacidrake' },
  ],
  fighterIndex: 2,
};
