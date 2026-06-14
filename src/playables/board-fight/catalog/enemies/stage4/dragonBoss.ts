import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage4/Dragon_Boss.atlas';
import jsonRaw from 'assets/Spine/Stage4/Dragon_Boss.stripped.json';
import pngData from 'assets/Spine/Stage4/Dragon_Boss.webp';

export const dragonBossBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
  vsScale: 0.15,
};
