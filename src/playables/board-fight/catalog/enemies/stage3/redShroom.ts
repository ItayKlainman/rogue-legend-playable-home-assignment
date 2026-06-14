import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage3/Red_Shroom.atlas';
import jsonRaw from 'assets/Spine/Stage3/Red_Shroom.stripped.json';
import pngData from 'assets/Spine/Stage3/Red_Shroom.webp';

export const redShroomBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.08,
};
