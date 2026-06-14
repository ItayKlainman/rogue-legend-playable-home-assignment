import icon from 'assets/Skills/skill_Deadly_Fireball.webp';
import '../../fight/skillVfx/fireballBarrage';
import type { SkillConfig } from '../../skills';

export const FIREBALL_BARRAGE: SkillConfig = {
  id: 'fireballBarrage',
  name: 'Fireball Barrage',
  description: 'Become the fire master!',
  rarity: 'common',
  icon,
  family: 'fire',
  tier: 1,
};
