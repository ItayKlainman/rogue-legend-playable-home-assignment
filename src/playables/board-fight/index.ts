import type { PlayableType } from '@shared/PlayableType';
import { PlayableDirector } from './PlayableDirector';
import type { PlayableScript } from './PlayableDirector';
import { activeScript } from './variants/_active.generated';

const boardFightType: PlayableType<PlayableScript> = {
  name: 'board-fight',

  async getScript() {
    if (__DEV__) {
      import('./dev/VariantPicker').then(m => m.mount());

      const { getDebugScript } = await import('./variants/debug');
      const debugScript = getDebugScript();
      if (debugScript) {
        return debugScript;
      }

      const params = new URLSearchParams(window.location.search);
      const variantName = params.get('variant');
      if (variantName) {
        try {
          const mod = await import(
            /* webpackChunkName: "[request]" */
            `./variants/${variantName}.generated`
          );
          const exportKey = Object.keys(mod).find(k => k.endsWith('Script'));
          if (exportKey) {
            return mod[exportKey];
          }
        } catch (e) {
          console.error(`[variant] Failed to load variant "${variantName}":`, e);
        }
      }
    }
    return activeScript;
  },

  create(width, height, script) {
    return new PlayableDirector(width, height, script);
  },
};

export default boardFightType;
