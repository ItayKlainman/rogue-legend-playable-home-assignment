import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage1/Skeleton_Archer.atlas';
import jsonRaw from 'assets/Spine/Stage1/Skeleton_Archer.stripped.json';
import pngData from 'assets/Spine/Stage1/Skeleton_Archer.webp';

export const skeletonArcherBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
