import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage2/Goblin_Ogre.atlas';
import jsonRaw from 'assets/Spine/Stage2/Goblin_Ogre.stripped.json';
import pngData1 from 'assets/Spine/Stage2/Goblin_Ogre.webp';
import pngData2 from 'assets/Spine/Stage2/Goblin_Ogre_2.webp';

export const goblinOgreBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData: [pngData1, pngData2],
  defaultScale: 0.16,
};
