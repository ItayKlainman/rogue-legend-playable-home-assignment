// Coin reward HUD — top-center banner that shows the accumulated coin total
// during PostGame / Finished. The Pixi rendering lives in BlackjackScene; this
// module owns the pure number-formatting helper (so it's unit-testable without
// a renderer) and the constants the scene reuses.

const COIN_FORMATTER = new Intl.NumberFormat('en-US');

/**
 * Format a coin amount as a display string with thousand separators.
 * Floors to whole coins (the tween produces floats) and clamps negatives.
 */
export function formatCoins(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return COIN_FORMATTER.format(Math.floor(amount));
}

// Visual constants shared with BlackjackScene. Kept here so the scene file
// doesn't bloat further and so a future "tune coin HUD" iteration has a
// single landing spot.
export const COIN_HUD_COLORS = {
  /** Coin/text gold tint — matches the live game's reward UI palette. */
  goldTint: 0xffd33a,
  /** Background pill behind the count, semi-transparent dark. */
  pillBg: 0x14241f,
  pillBgAlpha: 0.65,
  /** Outline stroke around the gold text. */
  textStroke: 0x3b2e4e,
} as const;

export const COIN_HUD_TIMING = {
  /** Coin count tick-up duration on onRoundWin (ms). */
  countUpMs: 700,
  /** Coin count drain duration on onLoseAll (ms). */
  drainMs: 500,
  /** Slide-in duration when the HUD first appears. */
  appearMs: 280,
} as const;
