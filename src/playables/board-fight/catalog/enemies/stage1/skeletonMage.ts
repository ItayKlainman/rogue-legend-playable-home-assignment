import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage1/Skeleton_Mage.atlas';
import jsonRaw from 'assets/Spine/Stage1/Skeleton_Mage.stripped.json';
import pngData from 'assets/Spine/Stage1/Skeleton_Mage.webp';

export const skeletonMageBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
