// Pure styling/layout helpers for floating damage numbers. NO PIXI or asset
// imports, so the logic is unit-testable under `node --test` (type-stripped TS).

export interface DamageStyleOpts {
  /** Resolved fill colour for a normal hit (crits override to gold). */
  color?: number;
  crit?: boolean;
}

export interface DamageStyle {
  fontSize: number;
  fill: number;
  strokeColor: number;
  strokeWidth: number;
  shadowAlpha: number;
  shadowBlur: number;
  shadowDistance: number;
  /** Pop / settle target scale. */
  scale: number;
}

export const DAMAGE_BASE_SIZE = 36;
export const DAMAGE_CRIT_SCALE = 1.4;
const CRIT_FILL = 0xffe25a;     // hot gold — crits pop in a distinct colour
const STROKE_COLOR = 0x301c06;  // dark warm outline (reads better than pure black)

export function damageNumberStyle(opts: DamageStyleOpts): DamageStyle {
  const crit = opts.crit ?? false;
  return {
    fontSize: DAMAGE_BASE_SIZE,
    fill: crit ? CRIT_FILL : (opts.color ?? 0xffffff),
    strokeColor: STROKE_COLOR,
    strokeWidth: crit ? 6 : 5,
    shadowAlpha: 0.5,
    shadowBlur: 2,
    shadowDistance: 3,
    scale: crit ? DAMAGE_CRIT_SCALE : 1,
  };
}

const BASE_OFFSET_Y = -116;   // above the target's anchor
const STACK_OFFSET_Y = 22;
const MAX_STACK = 2;

/** Vertical offset (from the target anchor) for the Nth concurrent number, so
 *  stacked hits don't overlap. */
export function damageStackOffsetY(activeCount: number): number {
  return BASE_OFFSET_Y - Math.min(activeCount, MAX_STACK) * STACK_OFFSET_Y;
}
