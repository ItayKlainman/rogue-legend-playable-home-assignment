import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage5/Mummy_General.atlas';
import jsonRaw from 'assets/Spine/Stage5/Mummy_General.stripped.json';
import pngData from 'assets/Spine/Stage5/Mummy_General.webp';

export const mummyGeneralBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.07
};
