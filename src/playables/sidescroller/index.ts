import type { PlayableType } from '@shared/PlayableType';
import { SidescrollerDirector } from './SidescrollerDirector';
import type { SidescrollerScript } from './SidescrollerScript';
import { getDefaultScript } from './defaultScript';

const sidescrollerType: PlayableType<SidescrollerScript> = {
  name: 'sidescroller',

  async getScript() {
    return getDefaultScript();
  },

  create(width, height, script) {
    return new SidescrollerDirector(width, height, script);
  },
};

export default sidescrollerType;
