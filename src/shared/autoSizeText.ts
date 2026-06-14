import { Text, TextStyle } from 'pixi.js';

/**
 * Binary-searches the largest font size in [minPx, maxPx] where the rendered Text
 * fits within (maxWidth, maxHeight). Mirrors Unity TMP's auto-size feature.
 *
 * Returns the configured Text instance ready to add to the scene graph.
 */
export interface AutoSizeOptions {
  text: string;
  style: Partial<TextStyle>;
  maxWidth: number;
  maxHeight: number;
  minPx: number;
  maxPx: number;
  /** Number of binary-search iterations. 8 covers any pixel range we care about. */
  iterations?: number;
}

export function autoSizeText(opts: AutoSizeOptions): Text {
  const t = new Text({
    text: opts.text,
    style: { ...opts.style, fontSize: opts.maxPx } as TextStyle,
  });

  if (fits(t, opts.maxWidth, opts.maxHeight)) return t;

  let lo = opts.minPx;
  let hi = opts.maxPx;
  let best = opts.minPx;
  const iterations = opts.iterations ?? 8;
  for (let i = 0; i < iterations; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (mid <= lo) break;
    t.style.fontSize = mid;
    if (fits(t, opts.maxWidth, opts.maxHeight)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  t.style.fontSize = best;
  return t;
}

function fits(t: Text, w: number, h: number): boolean {
  return t.width <= w && t.height <= h;
}
