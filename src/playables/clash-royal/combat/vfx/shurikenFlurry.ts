import { registerCosmeticVfx, type CosmeticVfxContext } from './registry';
import { sfx } from '../../audio/sfx';

const STAGGER_MS = 100;
const FLY_MS = 130;

// Mission C — projectile counts reduced to spec values (1 / 3 / 5) so each landed
// shuriken can show its own per-strike damage number without overwhelming the
// screen. Bridge splits the rig-resolved damageAmount across the declared count
// (declareImpacts) so the SUM still equals the rig delta (invariant).
//
// Invariant contract with the bridge: the handler fires EXACTLY `count` onImpact
// callbacks total (one per declared strike) so the bridge consumes all slices
// of the split damageAmount. The natural-last throw is flagged isLast=true. If
// a throw is skipped because its target is dead the per-throw VISUALS are
// skipped but the onImpact STILL fires so the slice draws (the bridge's
// showDamageNumber positions on the spine; a dead spine still has x/y).
export const shurikenFlurry = async (ctx: CosmeticVfxContext): Promise<void> => {
  const count = ctx.tier === 1 ? 1 : ctx.tier === 2 ? 3 : 5;
  const targets = ctx.resolveTargets();
  const pick = (i: number) => targets[i % targets.length];

  // Advertise impact count to the bridge BEFORE the first impact lands so it can
  // pre-split the damage amount. Defensive optional chain — unit-test stubs may
  // omit declareImpacts (the back-compat single-number path remains valid then).
  ctx.declareImpacts?.(count);

  const throws: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const isNaturalLast = i === count - 1;
    const t = pick(i);
    throws.push((async () => {
      await ctx.delay(i * STAGGER_MS);
      const dead = ctx.isDead(t);
      if (!dead) {
        sfx.skillCastShuriken();
        await ctx.spawnProjectile('hero', t);
        await ctx.delay(FLY_MS);
        ctx.flash(t);
        ctx.shake(isNaturalLast ? 5 : 2);
      }
      // Always fire onImpact (even on a dead target) so the bridge consumes the
      // declared-slice for THIS strike. Dead-target damage number still draws on
      // the body's last spine position; bridge's actor() returns the FightActor
      // regardless of dead state. The natural-last is flagged so the bridge
      // drives controller HP-tween + kill exactly once.
      ctx.onImpact(t, isNaturalLast);
    })());
  }
  await Promise.all(throws);
};

registerCosmeticVfx('shurikenFlurry', shurikenFlurry);
