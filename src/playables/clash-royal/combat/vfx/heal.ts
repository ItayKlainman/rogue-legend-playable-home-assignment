import { registerCosmeticVfx, type CosmeticVfxContext } from './registry';
import { sfx } from '../../audio/sfx';

export const heal = async (ctx: CosmeticVfxContext): Promise<void> => {
  const self = ctx.resolveTargets()[0];
  sfx.skillCastHeal();
  // Sparkle/rise visuals are provided by CombatFx via flash; the rig applies the HP gain.
  ctx.flash(self);
  await ctx.delay(150);
  ctx.onImpact(self, true);
};

registerCosmeticVfx('heal', heal);
