import icon from 'assets/Skills/skill_Bolt.webp';
import '../../fight/skillVfx/chainLightning';
import type { SkillConfig } from '../../skills';

export const CHAIN_LIGHTNING: SkillConfig = {
  id: 'chainLightning',
  name: 'Chain Lightning',
  description: 'Become the lightning master!',
  rarity: 'common',
  icon,
  family: 'lightning',
  tier: 1,
};
