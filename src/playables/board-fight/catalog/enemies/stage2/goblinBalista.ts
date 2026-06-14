import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage2/Goblin_Balista.atlas';
import jsonRaw from 'assets/Spine/Stage2/Goblin_Balista.stripped.json';
import pngData from 'assets/Spine/Stage2/Goblin_Balista.webp';

export const goblinBalistaBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
