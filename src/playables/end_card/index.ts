import type { PlayableType } from '@shared/PlayableType';
import { EndCardDirector } from './EndCardDirector';
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';

export interface EndCardScript {
  splashImage: string;
  logoImage: string;
}

const endCardType: PlayableType<EndCardScript> = {
  name: 'end_card',

  async getScript() {
    return { splashImage, logoImage };
  },

  create(width, height, script) {
    return new EndCardDirector(width, height, script);
  },
};

export default endCardType;
