/** Format large numbers with k suffix. */
export function formatNumber(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k < 100 ? k.toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(k) + 'k';
  }
  return String(n);
}

/** Quadratic ease out: fast start, decelerating. */
export function easeOutQuad(t: number): number {
  return t * (2 - t);
}

/** Quadratic ease in-out: accelerate then decelerate. */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
