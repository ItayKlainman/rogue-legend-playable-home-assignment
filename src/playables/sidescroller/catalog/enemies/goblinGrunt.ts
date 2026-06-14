import type { SpineAssets } from '@shared/SpineCharacter';

import atlasRaw from 'assets/Spine/Stage2/Goblin_Grunt.atlas';
import jsonRaw from 'assets/Spine/Stage2/Goblin_Grunt.stripped.json';
import pngData from 'assets/Spine/Stage2/Goblin_Grunt.webp';

export const goblinGruntBundle: SpineAssets = {
  atlasRaw,
  jsonRaw,
  pngData,
  defaultScale: 0.1,
};
