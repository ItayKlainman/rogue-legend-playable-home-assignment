import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage4/Snow_Spider.atlas';
import jsonRaw from 'assets/Spine/Stage4/Snow_Spider.stripped.json';
import pngData from 'assets/Spine/Stage4/Snow_Spider.webp';

export const snowSpiderBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.04
};
