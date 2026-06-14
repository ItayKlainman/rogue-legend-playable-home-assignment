import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage4/Yeti.atlas';
import jsonRaw from 'assets/Spine/Stage4/Yeti.stripped.json';
import pngData from 'assets/Spine/Stage4/Yeti.webp';

export const yetiBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.06
};
