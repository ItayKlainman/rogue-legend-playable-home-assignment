import type { PlayableType } from '@shared/PlayableType';
import { CombatDirector } from './CombatDirector';
import { DEFAULT_CONFIG, type ClashConfig } from './config';

const clashRoyal: PlayableType<ClashConfig> = {
  name: 'clash-royal',
  async getScript() {
    // PLAYABLE_VARIANT is the variant filename ('win' | 'lose', 'demo' fallback).
    const variant = typeof PLAYABLE_VARIANT === 'string' ? PLAYABLE_VARIANT : 'win';
    const outcome: 'win' | 'lose' = variant === 'lose' ? 'lose' : 'win';
    return { ...DEFAULT_CONFIG, outcome };
  },
  create(width, height, script) {
    return new CombatDirector(width, height, script);
  },
};

export default clashRoyal;
