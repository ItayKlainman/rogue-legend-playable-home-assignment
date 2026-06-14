import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage7/Fish_Monster.atlas';
import jsonRaw from 'assets/Spine/Stage7/Fish_Monster.stripped.json';
import pngData from 'assets/Spine/Stage7/Fish_Monster.webp';

export const fishMonsterBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.13,
};
