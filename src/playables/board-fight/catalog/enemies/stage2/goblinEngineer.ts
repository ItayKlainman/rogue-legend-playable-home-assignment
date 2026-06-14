import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage2/Goblin_Engeneer.atlas';
import jsonRaw from 'assets/Spine/Stage2/Goblin_Engeneer.stripped.json';
import pngData from 'assets/Spine/Stage2/Goblin_Engeneer.webp';

export const goblinEngineerBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
