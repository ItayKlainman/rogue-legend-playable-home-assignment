import type { Ticker } from 'pixi.js';
import { linear, type EaseFn } from './easing';

/**
 * General-purpose tween: drives `fn(t)` from 0..1 over `durationMs`.
 * - `speed` multiplier: pass FIGHT_SPEED (1.3) from FightEngine to preserve
 *   the engine's existing time scaling. Default 1 = real time.
 * - `ease` applies an easing curve to the t value passed to `fn`. Default linear.
 *
 * Returns a Promise that resolves when t reaches 1.
 */
export function tween(
  ticker: Ticker,
  durationMs: number,
  fn: (t: number) => void,
  speed = 1,
  ease: EaseFn = linear,
): Promise<void> {
  return new Promise(resolve => {
    let elapsed = 0;
    const handler = (t: Ticker) => {
      elapsed += t.deltaMS * speed;
      const raw = Math.min(1, elapsed / durationMs);
      fn(ease(raw));
      if (raw >= 1) {
        ticker.remove(handler);
        resolve();
      }
    };
    ticker.add(handler);
  });
}

/** Wait for a duration. Honors the same speed multiplier as tween(). */
export function delay(ticker: Ticker, ms: number, speed = 1): Promise<void> {
  return tween(ticker, ms, () => {}, speed);
}
