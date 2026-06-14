import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage7/Pirate_Captain.atlas';
import jsonRaw from 'assets/Spine/Stage7/Pirate_Captain.stripped.json';
import pngData from 'assets/Spine/Stage7/Pirate_Captain.webp';

export const pirateCaptainBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.16,
};
