import type { SpineAssets } from '@shared/SpineCharacter';
// Webpack inlines these as data URLs. Use the committed *.stripped.json (hero full
// Main_Character.json is ~1.24 MB; stripped is ~670 KB) and likewise for enemies.
import heroJson from 'assets/Spine/Main_Character.stripped.json';
import heroAtlas from 'assets/Spine/Main_Character.atlas';
import heroPng from 'assets/Spine/Main_Character.webp';
import kingJson from 'assets/Spine/Skeleton_King.stripped.json';
import kingAtlas from 'assets/Spine/Skeleton_King.atlas';
import kingPng from 'assets/Spine/Skeleton_King.webp';
import warriorJson from 'assets/Spine/Skeleton_Warrior.stripped.json';
import warriorAtlas from 'assets/Spine/Skeleton_Warrior.atlas';
import warriorPng from 'assets/Spine/Skeleton_Warrior.webp';
import slimeJson from 'assets/Spine/Slime.stripped.json';
import slimeAtlas from 'assets/Spine/Slime.atlas';
import slimePng from 'assets/Spine/Slime.webp';

// SpineAssets fields are { atlasRaw, jsonRaw, pngData, defaultScale?, vsScale? }
// (verified in @shared/SpineCharacter.ts + board-fight/catalog/enemies/stage1/skeletonKing.ts).
// Mapping: the .atlas import → atlasRaw, the .json import → jsonRaw, the .webp → pngData.
export const HERO: SpineAssets = { atlasRaw: heroAtlas, jsonRaw: heroJson, pngData: heroPng, defaultScale: 0.12 };
export const SKELETON_KING: SpineAssets = { atlasRaw: kingAtlas, jsonRaw: kingJson, pngData: kingPng, defaultScale: 0.18 };
export const SKELETON_WARRIOR: SpineAssets = { atlasRaw: warriorAtlas, jsonRaw: warriorJson, pngData: warriorPng, defaultScale: 0.11 };
export const SLIME: SpineAssets = { atlasRaw: slimeAtlas, jsonRaw: slimeJson, pngData: slimePng, defaultScale: 0.11 };

export const ENEMY_ASSETS = { skeletonKing: SKELETON_KING, skeletonWarrior: SKELETON_WARRIOR, slime: SLIME };
