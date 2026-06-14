import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage6/Ghost_Knight.atlas';
import jsonRaw from 'assets/Spine/Stage6/Ghost_Knight.stripped.json';
import pngData from 'assets/Spine/Stage6/Ghost_Knight.webp';

export const ghostKnightBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.15
};
