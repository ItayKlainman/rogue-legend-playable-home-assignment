import type { SpineAssets } from '@shared/SpineCharacter';

import enemyAtlasRaw from 'assets/Spine/Skeleton_Warrior.atlas';
import enemyJsonRaw from 'assets/Spine/Skeleton_Warrior.stripped.json';
import enemyPngData from 'assets/Spine/Skeleton_Warrior.webp';

export const skeletonBundle: SpineAssets = {
  atlasRaw: enemyAtlasRaw,
  jsonRaw: enemyJsonRaw,
  pngData: enemyPngData,
  defaultScale: 0.1,
};
