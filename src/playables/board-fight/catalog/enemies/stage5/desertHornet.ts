import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage5/Desert_Hornet.atlas';
import jsonRaw from 'assets/Spine/Stage5/Desert_Hornet.stripped.json';
import pngData from 'assets/Spine/Stage5/Desert_Hornet.webp';

export const desertHornetBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.04
};
