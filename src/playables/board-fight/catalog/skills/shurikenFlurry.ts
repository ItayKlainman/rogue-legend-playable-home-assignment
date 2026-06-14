import icon from 'assets/Skills/skill_Shuriken.webp';
import '../../fight/skillVfx/shurikenFlurry';
import type { SkillConfig } from '../../skills';

export const SHURIKEN_FLURRY: SkillConfig = {
  id: 'shurikenFlurry',
  name: 'Shuriken Flurry',
  description: 'Become the shuriken master!',
  rarity: 'common',
  icon,
  family: 'shuriken',
  tier: 1,
};
