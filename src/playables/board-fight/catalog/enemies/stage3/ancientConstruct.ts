import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage3/Ancient_Construct.atlas';
import jsonRaw from 'assets/Spine/Stage3/Ancient_Construct.stripped.json';
import pngData1 from 'assets/Spine/Stage3/Ancient_Construct.webp';
import pngData2 from 'assets/Spine/Stage3/Ancient_Construct_2.webp';
import pngData3 from 'assets/Spine/Stage3/Ancient_Construct_3.webp';

export const ancientConstructBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData: [pngData1, pngData2, pngData3],
  defaultScale: 0.16,
};
