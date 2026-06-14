// Pure layout math, extracted so it can be unit-tested without spinning up
// PixiJS. BlackjackScene calls computeLayout() during relayout() and applies
// the returned positions to its elements.

export const REF_W = 720;
export const REF_H = 1280;
export const BAR_W = 460;
export const BAR_H = 42;

// Raised from 172 → 120 so the gambler's score text ("0 / 21") clears the
// dealer sprite's head on standard phone aspect ratios. The overlap was
// roughly 5px at REF height 1280; this gives a ~20px buffer instead.
export const OPPONENT_BAR_Y = 120;
export const PLAYER_BAR_OFFSET_FROM_BOTTOM = 310;
export const BUTTON_OFFSET_FROM_BOTTOM = 140;
export const FTUE_HAND_OFFSET_FROM_BOTTOM = 280;

export interface Point {
  x: number;
  y: number;
}

export interface BackgroundLayout {
  /** Center position (sprite anchor=0.5). */
  center: Point;
  /** Uniform scale applied to the texture. */
  scale: number;
}

export interface LayoutSnapshot {
  /** Scale applied to uiRoot. All UI element positions are inside uiRoot,
   *  so are in REF coords (i.e. NOT multiplied by this scale). */
  uiScale: number;
  /** Position uiRoot is offset by, inside the viewport. */
  uiOffset: Point;
  /** Effective REF height: how many REF Y units fit inside the viewport. */
  effectiveRefH: number;
  /** Background covers the whole viewport. */
  background: (texW: number, texH: number) => BackgroundLayout;
  /** Bar / button / stage positions in REF coords. */
  opponentBar: Point;
  playerBar: Point;
  rollButton: Point;
  standButton: Point;
  ftueHand: Point;
  stage: Point;
  diceAnchor: Point;
}

/** Compute the full layout for a given viewport size. Pure function. */
export function computeLayout(viewportWidth: number, viewportHeight: number): LayoutSnapshot {
  // UI aspect-FITS the REF canvas — Math.min so nothing crops horizontally
  // on narrow phones or vertically on wide tablets.
  const uiScale = Math.min(viewportWidth / REF_W, viewportHeight / REF_H);

  const uiOffset: Point = {
    // Center horizontally
    x: (viewportWidth - REF_W * uiScale) / 2,
    // Pin to top (we use effectiveRefH to position bottom UI)
    y: 0,
  };

  // The "effective REF height" — REF Y units that fit in the viewport. On
  // taller phones this is > REF_H so bottom-anchored UI uses the extra space.
  const effectiveRefH = viewportHeight / uiScale;

  const playerBarY = effectiveRefH - PLAYER_BAR_OFFSET_FROM_BOTTOM;
  const buttonY = effectiveRefH - BUTTON_OFFSET_FROM_BOTTOM;
  const ftueY = effectiveRefH - FTUE_HAND_OFFSET_FROM_BOTTOM;

  // Stage centered between the two bars, then biased downward so it sits
  // closer to the player bar (where the action focus is). The dice land in
  // the inner circle, slightly ABOVE the stage geometric center so the drop
  // arc reads as a tall fall onto the platform.
  const midY = (OPPONENT_BAR_Y + BAR_H + playerBarY) / 2;
  const stageY = midY + 130;        // push stage downward (closer to player bar)
  // Dice land ~10% higher than the stage center — visually they settle in
  // the upper half of the stone ring, leaving the lower half free as a
  // "shadow" for the arc.
  const diceLandY = stageY - 50;

  return {
    uiScale,
    uiOffset,
    effectiveRefH,
    background: (texW: number, texH: number) => {
      // Aspect-FILL the viewport — cover, not contain. Crops bg edges if the
      // texture aspect differs from the viewport.
      const bgScale = Math.max(viewportWidth / texW, viewportHeight / texH);
      return {
        center: { x: viewportWidth / 2, y: viewportHeight / 2 },
        scale: bgScale,
      };
    },
    opponentBar: { x: (REF_W - BAR_W) / 2, y: OPPONENT_BAR_Y },
    playerBar:   { x: (REF_W - BAR_W) / 2, y: playerBarY },
    standButton: { x: REF_W / 2 - 130, y: buttonY },
    rollButton:  { x: REF_W / 2 + 130, y: buttonY },
    ftueHand:    { x: REF_W / 2 + 130, y: ftueY },
    stage:       { x: REF_W / 2, y: stageY },
    diceAnchor:  { x: REF_W / 2, y: diceLandY },
  };
}

/**
 * Compute the visible REF rectangle — the slice of the REF canvas that is
 * actually inside the viewport. UI elements must keep their x-range inside
 * this rect to never get cropped on the screen.
 *
 * Returns REF coords (x = 0..REF_W, y = 0..effectiveRefH).
 */
export function visibleRefBounds(
  viewportWidth: number,
  viewportHeight: number,
): { left: number; right: number; top: number; bottom: number } {
  const layout = computeLayout(viewportWidth, viewportHeight);
  // uiOffset.x is the gap between viewport edge and REF edge IN PIXELS.
  // Since UI is centered, the visible REF horizontal range is always [0, REF_W]
  // (Math.min scaling guarantees the full REF width fits the viewport width).
  const _ = layout;
  return {
    left: 0,
    right: REF_W,
    top: 0,
    bottom: layout.effectiveRefH,
  };
}
