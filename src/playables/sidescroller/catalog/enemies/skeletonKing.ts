import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage1/Skeleton_King.atlas';
import jsonRaw from 'assets/Spine/Stage1/Skeleton_King.stripped.json';
import pngData from 'assets/Spine/Stage1/Skeleton_King.webp';

export const skeletonKingBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.16,
};
