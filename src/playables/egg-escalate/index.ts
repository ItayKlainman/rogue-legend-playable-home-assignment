import type { PlayableType } from '@shared/PlayableType';
import { EggEscalateDirector } from './EggEscalateDirector';
import { ESCALATE_SCRIPT, type EggEscalateScript } from './script';

const eggEscalateType: PlayableType<EggEscalateScript> = {
  name: 'egg-escalate',
  async getScript() { return ESCALATE_SCRIPT; },
  create(width, height, script) { return new EggEscalateDirector(width, height, script); },
};

export default eggEscalateType;
