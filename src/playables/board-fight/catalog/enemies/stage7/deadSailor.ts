import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage7/Dead_Sailor.atlas';
import jsonRaw from 'assets/Spine/Stage7/Dead_Sailor.stripped.json';
import pngData from 'assets/Spine/Stage7/Dead_Sailor.webp';

export const deadSailorBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.13,
};
