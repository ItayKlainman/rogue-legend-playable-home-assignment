import type { SpineAssets } from '@shared/SpineCharacter';

import slimeAtlasRaw from 'assets/Spine/Slime.atlas';
import slimeJsonRaw from 'assets/Spine/Slime.stripped.json';
import slimePngData from 'assets/Spine/Slime.webp';

export const slimeBundle: SpineAssets = {
  atlasRaw: slimeAtlasRaw,
  jsonRaw: slimeJsonRaw,
  pngData: slimePngData,
  defaultScale: 0.08,
};
