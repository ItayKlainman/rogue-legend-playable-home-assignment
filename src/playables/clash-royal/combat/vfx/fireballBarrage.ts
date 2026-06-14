import { registerCosmeticVfx, type CosmeticVfxContext } from './registry';
import { sfx } from '../../audio/sfx';

// Fire family. Mission C — projectile counts reduced to spec values (1 / 3 / 5)
// so each landed fireball can show its own per-strike damage number without
// overwhelming the screen. Bridge splits the rig-resolved damageAmount across
// the declared count (declareImpacts) so the SUM still equals the rig delta.
//
// Tier-3 keeps the METEOR SLAM finale flourish on the natural last impact
// (dense ember+debris burst, shockwave ring, glow bloom, hard shake spike).
export const fireballBarrage = async (ctx: CosmeticVfxContext): Promise<void> => {
  sfx.skillCastFireball();
  const t3 = ctx.tier === 3;
  const t2 = ctx.tier === 2;
  const count = ctx.tier === 1 ? 1 : t2 ? 3 : 5;
  const targets = ctx.resolveTargets();
  const pick = (i: number) => targets[i % targets.length];

  // Advertise impact count to the bridge BEFORE the first impact lands so it can
  // pre-split the damage amount. Defensive optional chain — unit-test stubs may
  // omit declareImpacts (the back-compat single-number path remains valid then).
  ctx.declareImpacts?.(count);

  for (let i = 0; i < count; i++) {
    const isNaturalLast = i === count - 1;
    const t = pick(i);
    const dead = ctx.isDead(t);
    if (!dead) {
      await ctx.spawnProjectile('hero', t);
      await ctx.delay(t3 ? 70 : 90);
      ctx.flash(t);

      // Per-hit ember burst. Tier scales the particle count/spread; tier-3 throws hard debris.
      const perHit = ctx.tier === 1 ? 12 : t2 ? 18 : 26;
      ctx.impactBurst?.(t, {
        family: 'fire',
        count: perHit,
        speed: t3 ? 280 : 220,
        scale: t3 ? 0.6 : 0.45,
        life: t3 ? 620 : 520,
        gravity: 300,
        debris: t3,
        // every tier-3 hit gets a small glow; only the final gets the big slam below.
        glow: t3 ? 90 : t2 ? 60 : 0,
      });

      if (isNaturalLast && t3) {
        // ── METEOR SLAM (tier-3 finale flourish) ──────────────────────────────
        // A dense second burst of ember+debris, a wide shockwave ring, a bright
        // orange glow bloom and a hard shake spike layered on the final impact.
        ctx.impactBurst?.(t, {
          family: 'fire', count: 38, speed: 360, scale: 0.8, life: 700,
          gravity: 340, debris: true, shockwave: 170, glow: 200,
        });
        // A second, softer ember cloud (sparks, lighter gravity) drifting up like heat.
        ctx.impactBurst?.(t, {
          family: 'fire', count: 22, speed: 200, scale: 0.5, life: 640, gravity: 120,
        });
        ctx.shake(14); // slam spike — well above the t1/t2 per-hit shake
      } else {
        ctx.shake(isNaturalLast ? (t2 ? 8 : 6) : 3);
      }
    }
    // Always fire onImpact — even on a dead target — so the bridge consumes the
    // declared-slice for THIS strike (preserves SUM-of-numbers === rig delta).
    // Dead-target damage numbers still draw on the body's spine position.
    ctx.onImpact(t, isNaturalLast);
  }
};

registerCosmeticVfx('fireballBarrage', fireballBarrage);
