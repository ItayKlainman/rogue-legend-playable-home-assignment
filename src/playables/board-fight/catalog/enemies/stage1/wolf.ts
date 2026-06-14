import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage1/Wolf.atlas';
import jsonRaw from 'assets/Spine/Stage1/Wolf.stripped.json';
import pngData from 'assets/Spine/Stage1/Wolf.webp';

export const wolfBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
