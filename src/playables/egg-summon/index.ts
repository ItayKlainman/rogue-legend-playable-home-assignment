import type { PlayableType } from '@shared/PlayableType';
import { EggSummonDirector } from './EggSummonDirector';
import { PHASE1_SCRIPT, type EggSummonScript } from './script';

const eggSummonType: PlayableType<EggSummonScript> = {
  name: 'egg-summon',
  async getScript() { return PHASE1_SCRIPT; },
  create(width, height, script) { return new EggSummonDirector(width, height, script); },
};

export default eggSummonType;
