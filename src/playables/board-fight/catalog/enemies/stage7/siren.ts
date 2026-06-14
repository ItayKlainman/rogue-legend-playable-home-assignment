import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage7/Siren.atlas';
import jsonRaw from 'assets/Spine/Stage7/Siren.stripped.json';
import pngData from 'assets/Spine/Stage7/Siren.webp';

export const sirenBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.10,
};
