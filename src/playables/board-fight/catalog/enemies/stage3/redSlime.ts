import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage3/Red_Slime.atlas';
import jsonRaw from 'assets/Spine/Stage3/Red_Slime.stripped.json';
import pngData1 from 'assets/Spine/Stage3/Red_Slime.webp';
import pngData2 from 'assets/Spine/Stage3/Red_Slime_2.webp';

export const redSlimeBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData: [pngData1, pngData2],
  defaultScale: 0.08,
};
