import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage7/Kraken.atlas';
import jsonRaw from 'assets/Spine/Stage7/Kraken.stripped.json';
import pngData from 'assets/Spine/Stage7/Kraken.webp';

export const krakenBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.16,
};
