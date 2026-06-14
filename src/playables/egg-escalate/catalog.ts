import type { SpineAssets } from '@shared/SpineCharacter';
import boneclawAtlasRaw from 'assets/egg-escalate/spine/Boneclaw.atlas';
import boneclawJsonRaw from 'assets/egg-escalate/spine/Boneclaw.json';
import boneclawPngData from 'assets/egg-escalate/spine/Boneclaw.webp';

// Reuse the hero, Glacidrake, egg art, and reveal/ui loaders from egg-summon.
export {
  HERO_BASE_BUNDLE, HERO_BASE_SKIN, GLACIDRAKE_BUNDLE,
  loadEggArt, loadUiTexture, loadRevealTexture, EGG_ART, UI_ART,
} from '../egg-summon/catalog';

// Collected reward pet: Boneclaw (Mythic). Anims: Idle, Move, Basic_Attack.
// Atlas/webp downscaled 0.35 from the real client asset (see assets/egg-escalate).
export const BONECLAW_BUNDLE: SpineAssets = {
  atlasRaw: boneclawAtlasRaw,
  jsonRaw: boneclawJsonRaw,
  pngData: boneclawPngData,
  defaultScale: 0.026,   // tuned later next to Glacidrake (Task 8)
};
export const BONECLAW_SKIN = 'BoneClaw';
