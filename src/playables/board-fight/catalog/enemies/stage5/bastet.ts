import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage5/Bastet.atlas';
import jsonRaw from 'assets/Spine/Stage5/Bastet.stripped.json';
import pngData from 'assets/Spine/Stage5/Bastet.webp';

export const bastetBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.08
};
