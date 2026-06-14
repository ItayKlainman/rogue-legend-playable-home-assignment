import { Assets, Texture } from 'pixi.js';
import type { SpineAssets } from '@shared/SpineCharacter';
import type { EggReveal } from './script';
import heroAtlasRaw from 'assets/Spine/Main_Character.atlas';
// COMMITTED stripped skeleton (Base + Fire_Wizard skins, all 7 anims) — ~570KB
// smaller than the full 6-skin json. egg-summon only uses the Base skin, but the
// Base meshes LINK to Fire_Wizard meshes (linked meshes), so Fire_Wizard must
// stay — can't strip to Base-only. (NOT the gitignored .build.json.)
import heroJsonRaw from 'assets/Spine/Main_Character.stripped.json';
import heroPngData from 'assets/Spine/Main_Character.webp';
import glacidrakeAtlasRaw from 'assets/egg-summon/spine/Glacidrake.atlas';
import glacidrakeJsonRaw from 'assets/egg-summon/spine/Glacidrake.json';
import glacidrakePngData from 'assets/egg-summon/spine/Glacidrake.webp';
import slySprite from 'assets/egg-summon/pets/Sly.webp';
import lunaSprite from 'assets/egg-summon/pets/Luna.webp';
import glacidrakeSprite from 'assets/egg-summon/pets/Glacidrake.webp';
import eggClosedData from 'assets/egg-summon/egg/egg_closed.webp';
import eggOpenData from 'assets/egg-summon/egg/egg_open.webp';
import eggShardsData from 'assets/egg-summon/egg/egg_shards.webp';
import eggBurstData from 'assets/egg-summon/egg/egg_burst.webp';
import rayData from 'assets/egg-summon/egg/ray.webp';
import glowData from 'assets/egg-summon/egg/glow.webp';
import bannerData from 'assets/egg-summon/ui/banner.webp';
import tileFrameData from 'assets/egg-summon/ui/tile_frame.webp';
import handData from 'assets/UI/FTUE_Hand.webp';
import rarityBannerData from 'assets/UI/RarityBanner_Tapered.webp';
import statueData from 'assets/egg-summon/summon/statue.webp';
import padCover1Data from 'assets/egg-summon/summon/pad_cover_1.webp';
import padCover4Data from 'assets/egg-summon/summon/pad_cover_4.webp';
import torchSheetData from 'assets/egg-summon/summon/torch_sheet.webp';

// Hero: egg-summon's OWN bundle — uses the committed stripped skeleton (see import).
export const HERO_BASE_BUNDLE: SpineAssets = {
  atlasRaw: heroAtlasRaw,
  jsonRaw: heroJsonRaw,
  pngData: heroPngData,
  defaultScale: 0.12,
};
export const HERO_BASE_SKIN = 'Base';

// Fighter pet Spine: Glacidrake (anims: Idle, Move, Basic_Attack)
export const GLACIDRAKE_BUNDLE: SpineAssets = {
  atlasRaw: glacidrakeAtlasRaw,
  jsonRaw: glacidrakeJsonRaw,
  pngData: glacidrakePngData,
  defaultScale: 0.14,
};

// Reveal sprites (static art for all three pets)
const REVEAL_SPRITE_DATA: Record<string, string> = {
  sly: slySprite, luna: lunaSprite, glacidrake: glacidrakeSprite,
};

/** Load a pet's reveal sprite as a Texture. */
export async function loadRevealTexture(pet: EggReveal['pet']): Promise<Texture> {
  return Assets.load(REVEAL_SPRITE_DATA[pet]);
}

export const EGG_ART = {
  closed: eggClosedData, open: eggOpenData, shards: eggShardsData,
  burst: eggBurstData, ray: rayData, glow: glowData,
} as const;

export async function loadEggArt(): Promise<Record<keyof typeof EGG_ART, Texture>> {
  const entries = await Promise.all(
    (Object.keys(EGG_ART) as (keyof typeof EGG_ART)[]).map(async (k) => [k, await Assets.load(EGG_ART[k])] as const),
  );
  return Object.fromEntries(entries) as Record<keyof typeof EGG_ART, Texture>;
}

// Game UI frames (9-slice white, tinted per use): the tapered rarity-title
// banner (reveal) and the square pet-tile frame (pick screen).
export const UI_ART = { banner: bannerData, tileFrame: tileFrameData, hand: handData, rarityBanner: rarityBannerData } as const;

export async function loadUiTexture(key: keyof typeof UI_ART): Promise<Texture> {
  return Assets.load(UI_ART[key]);
}

// Real summon-screen art extracted from PocketRoll's Pets panel:
//  statue  = SummoningStatue.png (the teal egg-guardian)
//  padCover= Cover_1/Cover_4.png (the green pedestal front rim w/ glowing lip)
//  torch   = fire_loop_1_mid.png (5×5 sheet, 25 frames of the green summoning flame)
// (The purple stone-arch wall behind them was updated in the live build after our
//  source checkout, so it is recreated procedurally — see lessons.md.)
export const SUMMON_ART = {
  statue: statueData,
  padFront: padCover4Data,
  padRim: padCover1Data,
  torchSheet: torchSheetData,
} as const;

export async function loadSummonTexture(key: keyof typeof SUMMON_ART): Promise<Texture> {
  return Assets.load(SUMMON_ART[key]);
}
