import type { SpineAssets } from '@shared/SpineCharacter';

import heroAtlasRaw from 'assets/Spine/Main_Character.atlas';
import heroJsonRaw from 'assets/Spine/Main_Character.json';
import heroPngData from 'assets/Spine/Main_Character.webp';

export const heroBundle: SpineAssets = {
  atlasRaw: heroAtlasRaw,
  jsonRaw: heroJsonRaw,
  pngData: heroPngData,
  defaultScale: 0.12,
};
