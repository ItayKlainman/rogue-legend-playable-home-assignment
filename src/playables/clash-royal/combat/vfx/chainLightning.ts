import { registerCosmeticVfx, type CosmeticVfxContext } from './registry';
import { sfx } from '../../audio/sfx';

// Lightning family. Tier escalates from a single chained zap (t1) to a double pass (t2)
// to a SPECTACULAR storm (t3): more passes across the chain, electric SPARK particles
// at every strike, a bright glow flash + shockwave on the final bolt, crackle glints
// between passes and a stronger shake. Reads as a thunderstorm, not a single bolt.
//
// Mission C — per-target damage numbers via declareImpacts(targets.length).
// The bridge splits the rig-resolved damageAmount across the visible targets.
// Chain-lightning fires multiple PASSES across the chain — the bridge draws a
// slice on each of the FIRST `targets.length` onImpact calls; subsequent passes
// fire onImpact (driving flash/shake/kill signals) without drawing additional
// numbers. SUM-of-per-strike-numbers === rig delta (invariant preserved).
export const chainLightning = async (ctx: CosmeticVfxContext): Promise<void> => {
  sfx.skillCastLightning();
  const targets = ctx.resolveTargets();
  const t3 = ctx.tier === 3;
  const t2 = ctx.tier === 2;
  const arcs = ctx.tier === 1 ? 2 : t2 ? 3 : 6; // passes across the chain (denser storm — "more lightning")

  // Advertise impact count = number of distinct strike targets. The bridge pre-splits
  // damageAmount into `targets.length` slices; the FIRST pass's onImpacts consume them
  // (one slice per target). Later passes are pure flash/shake — bridge no-ops the
  // already-consumed slices. Defensive optional chain (test stubs omit declareImpacts).
  ctx.declareImpacts?.(targets.length);

  // Track whether the natural-last strike (last target on the last pass) was flagged.
  // If skipped because target is dead, fire a synthetic isLast=true after the loop so
  // the bridge's HP-tween + kill callback still drives. This is the regression guard
  // from 37381b2 — preserved.
  let naturalLastFlagged = false;
  let fallbackLandedTarget: { id: number } | null = null;
  for (let pass = 0; pass < arcs; pass++) {
    const lastPass = pass === arcs - 1;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const isLast = lastPass && i === targets.length - 1;
      if (ctx.isDead(t)) continue;
      ctx.flash(t);

      // Lightning's ELECTRIC SIGNATURE: a jagged bolt arc snaps from the hero to the
      // target. This is the visual that was missing — without it the cast was just a
      // white impactBurst indistinguishable from fire ("lightning doesn't trigger
      // lightning"). Intensity scales with tier so tier-3 reads as a heavier storm bolt.
      // Defensive optional chain (unit-test stubs omit lightningBolt).
      ctx.lightningBolt?.(t, t3 ? 1.6 : t2 ? 1.25 : 1);

      // Electric spark burst at each strike — fast, low-gravity, blue/white/violet.
      const perHit = ctx.tier === 1 ? 10 : t2 ? 16 : 22;
      ctx.impactBurst?.(t, {
        family: 'lightning',
        count: perHit,
        speed: t3 ? 340 : 260,
        scale: t3 ? 0.5 : 0.4,
        life: t3 ? 460 : 380,
        gravity: 30, // sparks fly mostly outward, barely fall
        glow: t3 ? 80 : t2 ? 50 : 0,
      });

      if (isLast && t3) {
        // ── STORM STRIKE (tier-3 finale flourish) ─────────────────────────────
        // A dense crackling spark burst, a bright electric glow flash, an expanding
        // shockwave ring and a hard shake — the storm's final thunderclap.
        ctx.impactBurst?.(t, {
          family: 'lightning', count: 34, speed: 420, scale: 0.62, life: 520,
          gravity: 20, shockwave: 150, glow: 180,
        });
        ctx.shake(12);
      } else {
        ctx.shake(isLast ? (t2 ? 7 : 6) : t3 ? 3 : 2);
      }
      ctx.onImpact(t, isLast);
      if (isLast) naturalLastFlagged = true;
      fallbackLandedTarget = t;
      await ctx.delay(t3 ? 50 : 60);
    }
    // Crackle glint between passes (tier-3 storm only): a quick spark flicker on the
    // front target so the gap between passes still reads as live electricity.
    if (t3 && !lastPass && targets.length > 0) {
      const front = targets[0];
      if (!ctx.isDead(front)) {
        ctx.impactBurst?.(front, {
          family: 'lightning', count: 8, speed: 220, scale: 0.32, life: 300, gravity: 20,
        });
      }
      await ctx.delay(40);
    }
  }
  // Post-loop regression guard (from 37381b2): if the natural-last strike was dropped
  // (target dead at that moment), the bridge never saw isLast=true and the controller's
  // HP-tween + kill callback never fires. Fire a synthetic isLast=true on the most-
  // recently-landed live target, or on the front target if no strike landed.
  if (!naturalLastFlagged) {
    if (fallbackLandedTarget) {
      ctx.onImpact(fallbackLandedTarget, true);
    } else if (targets.length > 0) {
      ctx.onImpact(targets[0], true);
    }
  }
};

registerCosmeticVfx('chainLightning', chainLightning);
