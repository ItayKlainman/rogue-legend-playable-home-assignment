import type { PlayableType } from '@shared/PlayableType';
import { MyDirector } from './MyDirector';

interface MyScript {
  message: string;
}

const myType: PlayableType<MyScript> = {
  name: '_template',

  async getScript() {
    return { message: 'Tap to install!' };
  },

  create(width, height, script) {
    return new MyDirector(width, height, script);
  },
};

export default myType;
