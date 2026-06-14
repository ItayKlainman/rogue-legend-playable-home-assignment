import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage6/Boss_Tree.atlas';
import jsonRaw from 'assets/Spine/Stage6/Boss_Tree.stripped.json';
import pngData from 'assets/Spine/Stage6/Boss_Tree.webp';

export const bossTreeBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.10,
  vsScale: 0.14
};
