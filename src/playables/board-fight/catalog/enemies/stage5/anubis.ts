import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage5/Anubis.atlas';
import jsonRaw from 'assets/Spine/Stage5/Anubis.stripped.json';
import pngData from 'assets/Spine/Stage5/Anubis.webp';

export const anubisBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.08,
  vsScale: 0.12
};
