// Easing functions and DOTween-equivalent helpers used by tile UX scenes.
// All easing functions take t in [0, 1] and return a value in [0, 1].

export type EaseFn = (t: number) => number;

export const linear: EaseFn = (t) => t;

export const easeInQuad: EaseFn = (t) => t * t;
export const easeOutQuad: EaseFn = (t) => t * (2 - t);
export const easeInOutQuad: EaseFn = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const easeInQuint: EaseFn = (t) => t * t * t * t * t;
export const easeOutQuint: EaseFn = (t) => 1 - Math.pow(1 - t, 5);

export const easeOutBack: EaseFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** DOPunchScale / DOPunchPosition equivalent.
 *  Returns the offset/delta at time t (normalized 0..1) for a punch with given
 *  magnitude and vibrato (oscillation count). Multiply into base scale or position. */
export function punch(magnitude: number, vibrato: number, t: number): number {
  return magnitude * Math.sin(t * vibrato * Math.PI) * (1 - t);
}

/** DOShakeAnchorPos / DOShakeRotation / DOShakeScale envelope.
 *  Returns the magnitude scalar at time t with `(1 - t)^fadeOut` envelope.
 *  Multiply this into per-frame random offsets to mirror DOTween's shake fade. */
export function shakeEnvelope(magnitude: number, fadeOut: number, t: number): number {
  return magnitude * Math.pow(1 - t, fadeOut);
}
