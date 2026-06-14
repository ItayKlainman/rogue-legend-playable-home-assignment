import type { Tier } from '../../config';

/** A handle the rig understands; the handler treats it opaquely. */
export interface TargetRef { id: number; }

/** Family of the cast, drives the impact particle palette/behaviour. */
export type ImpactFamily = 'fire' | 'lightning' | 'shuriken' | 'none';

/** Impact-particle escalation knobs the handler hands to CombatFx. All optional —
 *  the spectacular tier-3 flourishes (shockwave/glow) are opt-in per call. */
export interface ImpactBurstSpec {
  family?: ImpactFamily;
  count?: number;       // particle count
  speed?: number;       // outward speed px/s
  scale?: number;       // base particle scale
  life?: number;        // particle lifetime ms
  gravity?: number;     // downward pull px/s²
  debris?: boolean;     // use the harder DEBRIS chunk texture (meteor rubble)
  shockwave?: number;   // if > 0, also emit an expanding ring of this radius (px)
  glow?: number;        // if > 0, also bloom a soft glow of this radius (px)
}

/** Cosmetic-only context: visuals + rig-driven impact callbacks. No HP, no kills, no target-picking. */
export interface CosmeticVfxContext {
  tier: Tier;
  /** Rig-owned: which target(s) this cast hits (front living enemy / all, per family). */
  resolveTargets: () => TargetRef[];
  /** Rig-owned death state, replacing the old `target.hp <= 0` guards. */
  isDead: (t: TargetRef) => boolean;
  /** Called at each impact moment on the handler's own timeline. The rig shows the
   *  number + moves the bar (milestone vs chip) and triggers death when designated. */
  onImpact: (t: TargetRef, isLast: boolean) => void;
  /** Visuals (provided by CombatFx in prod; no-ops in unit tests). */
  spawnProjectile: (from: 'hero', to: TargetRef) => Promise<void>;
  flash: (t: TargetRef) => void;
  shake: (px: number) => void;
  tween: (ms: number, fn: (t: number) => void) => Promise<void>;
  delay: (ms: number) => Promise<void>;
  /** Spectacular impact particles at a target (ember/spark burst + optional shockwave
   *  ring + glow bloom). Provided by CombatFx in prod; OPTIONAL so unit-test stubs that
   *  omit it still satisfy the interface — handlers call it defensively (ctx.impactBurst?.(…)). */
  impactBurst?: (t: TargetRef, spec: ImpactBurstSpec) => void;
  /** Mission J — a jagged electric BOLT arc drawn from the hero to the target. Lightning
   *  is the one family with no thrown projectile; before this hook a lightning cast was a
   *  white/pale impactBurst visually indistinguishable from fire ("the lightning skill
   *  doesn't trigger lightning"). The bolt gives the family its electric signature: a
   *  branching blue/white zig-zag that flickers then fades. Provided by CombatFx in prod;
   *  OPTIONAL so unit-test stubs that omit it still satisfy the interface — handlers call
   *  it defensively (ctx.lightningBolt?.(t)). The `intensity` knob scales thickness +
   *  branch count so tier-3 reads as a heavier storm bolt. */
  lightningBolt?: (t: TargetRef, intensity?: number) => void;
  /** Mission C — advertise how many damage-number-bearing impacts this cast will fire.
   *  Called once BEFORE the first impact lands. The bridge keys off this declared count
   *  to split a single rig-resolved damageAmount across the visible strikes so EVERY
   *  impact draws its own floating damage number (integer slices summing to the full
   *  amount — last slice absorbs the remainder so the invariant holds).
   *
   *  Optional for back-compat: a handler that omits the call gets the single-impact
   *  legacy behaviour (one consolidated number on the last impact). Unit-test stubs
   *  that omit this field still satisfy the interface — handlers call it defensively
   *  (ctx.declareImpacts?.(N)). */
  declareImpacts?: (count: number) => void;
}

export type CosmeticVfxHandler = (ctx: CosmeticVfxContext) => Promise<void>;

const REGISTRY = new Map<string, CosmeticVfxHandler>();
export function registerCosmeticVfx(id: string, h: CosmeticVfxHandler): void { REGISTRY.set(id, h); }
export function getCosmeticVfx(id: string): CosmeticVfxHandler | undefined { return REGISTRY.get(id); }
