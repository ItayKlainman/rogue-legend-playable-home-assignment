import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage3/Cave_Spider.atlas';
import jsonRaw from 'assets/Spine/Stage3/Cave_Spider.stripped.json';
import pngData from 'assets/Spine/Stage3/Cave_Spider.webp';

export const caveSpiderBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.03
};
