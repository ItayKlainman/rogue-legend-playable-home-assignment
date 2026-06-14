import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage1/Skeleton_Commander.atlas';
import jsonRaw from 'assets/Spine/Stage1/Skeleton_Commander.stripped.json';
import pngData from 'assets/Spine/Stage1/Skeleton_Commander.webp';

export const skeletonCommanderBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
