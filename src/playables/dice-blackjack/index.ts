import type { PlayableType } from '@shared/PlayableType';
import { BlackjackDirector } from './BlackjackDirector';
import {
  SCRIPTS_BY_VARIANT,
  SCRIPT_WIN_RIGGED,
  isVariantName,
  type BlackjackScript,
  type VariantName,
} from './config';

function resolveVariant(): VariantName {
  // Dev: ?variant=loseRigged|fair|winRigged on the URL flips the rig live.
  if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('variant');
    if (param && isVariantName(param)) return param;
  }
  // Prod: compile-time define injected by scripts/variant-build.js
  if (typeof PLAYABLE_VARIANT !== 'undefined' && isVariantName(PLAYABLE_VARIANT)) {
    return PLAYABLE_VARIANT;
  }
  return 'winRigged';
}

const diceBlackjack: PlayableType<BlackjackScript> = {
  name: 'dice-blackjack',

  async getScript() {
    const variant = resolveVariant();
    return SCRIPTS_BY_VARIANT[variant] ?? SCRIPT_WIN_RIGGED;
  },

  create(width, height, script) {
    return new BlackjackDirector(width, height, script);
  },
};

export default diceBlackjack;
