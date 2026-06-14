import type { Sprite, Ticker } from 'pixi.js';

/**
 * Fly a single sprite from its current position to `target` with a parabolic
 * arc, an `easeInQuad`-style horizontal/vertical interpolation, and an alpha
 * fade in the final tail of the lifetime.
 *
 * Used by HUD-flytext effects (XP icons → XP bar, coins → coin bar, etc.).
 *
 * The sprite is destroyed on arrival; caller's `onArrive` runs first if
 * provided (e.g., to bump a HUD counter or spawn a landing ring).
 */
export interface FlyIconOptions {
  /** Per-sprite stagger delay in ms before the fly begins. Default 0. */
  initialDelay?: number;
  /** Base flight duration in ms. Default 250. */
  durationMs?: number;
  /** Additional random duration in ms (0..jitter added per sprite). Default 80. */
  durationJitter?: number;
  /** Arc apex height in screen px (negative = upward arch). Default -40. */
  arcHeight?: number;
  /** Additional random arc height (0..jitter, applied with same sign). Default 40. */
  arcJitter?: number;
  /** Normalized t (0..1) at which the alpha fade-out starts. Default 0.85. */
  alphaFadeStart?: number;
  /** Callback fired the frame the sprite arrives (just before destroy). */
  onArrive?: () => void;
}

export function flyIcon(
  ticker: Ticker,
  sprite: Sprite,
  target: { x: number; y: number },
  opts: FlyIconOptions = {},
): Promise<void> {
  return new Promise<void>(resolve => {
    const startX = sprite.x;
    const startY = sprite.y;
    const baseDuration = opts.durationMs ?? 250;
    const jitterDuration = opts.durationJitter ?? 80;
    const baseArc = opts.arcHeight ?? -40;
    const jitterArc = opts.arcJitter ?? 40;
    const fadeStart = opts.alphaFadeStart ?? 0.85;

    const FLY_DURATION = baseDuration + Math.random() * jitterDuration;
    // Preserve the sign of arcHeight when applying random jitter.
    const ARC_HEIGHT = baseArc + Math.sign(baseArc || -1) * Math.random() * jitterArc;
    let elapsed = -(opts.initialDelay ?? 0);

    const onTick = (dt: { deltaMS: number }) => {
      elapsed += dt.deltaMS;
      if (elapsed < 0) return;
      const t = Math.min(1, elapsed / FLY_DURATION);
      const e = t * t; // easeInQuad
      sprite.x = startX + (target.x - startX) * e;
      sprite.y = startY + (target.y - startY) * e + ARC_HEIGHT * Math.sin(Math.PI * t);
      sprite.alpha = t > fadeStart ? 1 - (t - fadeStart) / (1 - fadeStart) : 1;
      if (t >= 1) {
        ticker.remove(onTick);
        opts.onArrive?.();
        sprite.destroy();
        resolve();
      }
    };
    ticker.add(onTick);
  });
}
