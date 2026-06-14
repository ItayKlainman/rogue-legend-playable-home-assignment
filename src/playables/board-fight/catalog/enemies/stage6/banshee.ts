import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage6/Banshee.atlas';
import jsonRaw from 'assets/Spine/Stage6/Banshee.stripped.json';
import pngData from 'assets/Spine/Stage6/Banshee.webp';

export const bansheeBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.13
};
