import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage6/Living_Tree.atlas';
import jsonRaw from 'assets/Spine/Stage6/Living_Tree.stripped.json';
import pngData from 'assets/Spine/Stage6/Living_Tree.webp';

export const livingTreeBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.15
};
