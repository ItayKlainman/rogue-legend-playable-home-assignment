import type { SpineAssets } from '@shared/SpineCharacter';

import skeletonKingAtlasRaw from 'assets/Spine/Skeleton_King.atlas';
import skeletonKingJsonRaw from 'assets/Spine/Skeleton_King.stripped.json';
import skeletonKingPngData from 'assets/Spine/Skeleton_King.webp';

export const skeletonKingBundle: SpineAssets = {
  atlasRaw: skeletonKingAtlasRaw,
  jsonRaw: skeletonKingJsonRaw,
  pngData: skeletonKingPngData,
  defaultScale: 0.16,
};
