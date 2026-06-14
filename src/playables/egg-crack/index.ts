import type { PlayableType } from '@shared/PlayableType';
import { EggCrackDirector } from './EggCrackDirector';
import { PHASE1_SCRIPT, type EggSummonScript } from './script';

const eggCrackType: PlayableType<EggSummonScript> = {
  name: 'egg-crack',
  async getScript() { return PHASE1_SCRIPT; },
  create(width, height, script) { return new EggCrackDirector(width, height, script); },
};

export default eggCrackType;
