import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage2/Goblin_Hunter.atlas';
import jsonRaw from 'assets/Spine/Stage2/Goblin_Hunter.stripped.json';
import pngData from 'assets/Spine/Stage2/Goblin_Hunter.webp';

export const goblinHunterBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
