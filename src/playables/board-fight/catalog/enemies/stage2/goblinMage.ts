import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage2/Goblin_Mage.atlas';
import jsonRaw from 'assets/Spine/Stage2/Goblin_Mage.stripped.json';
import pngData from 'assets/Spine/Stage2/Goblin_Mage.webp';

export const goblinMageBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
