// Two-die container that wraps the shared Die3D (lifted from board-fight).
// Plays Unity-authored Dice_Roll keyframes via the existing Die3D system, but
// drops board-fight's tile-anchored positioning in favor of a fixed lane
// pair centered on a screen position the host scene controls.

import { Container, Renderer, Ticker } from 'pixi.js';
import { Die3D, type DieTrack } from './Die3D';
import { bakeFaceTextures } from './dicePips';
import diceAnimDataRaw from './data/diceAnimations.json';

interface ClipData {
  name: string;
  duration: number;
  animationLength: number;
  die1: DieTrack;
  die2: DieTrack;
}

const CLIPS: ClipData[] = (JSON.parse(diceAnimDataRaw as unknown as string) as { clips: ClipData[] }).clips;

const CUBE_HALF = 36;       // visual half-size of each die
const POS_SCALE = 22;       // Horizontal Unity-unit → px (X spread / lateral motion)
const POS_SCALE_Y = 55;     // Vertical Unity-unit → px (drop arc) — 2.5× larger
                            // than X so the dice clearly "fall from above"
                            // instead of just nudging into place.

// Each variation is a discrete recipe of knobs that produce a visibly distinct
// throw. We rotate through them deterministically (avoiding repeats of the
// previous variation) so consecutive rolls always feel different.
interface ThrowVariation {
  clipIndex: number;     // which of CLIPS[] to play
  swap: boolean;         // if true, die1 plays clip.die2 and vice versa
  flipX: boolean;        // mirror left↔right (visually a backhand toss)
  playbackRate: number;  // 1.0 = real-time clip; ~2× makes it pop
  spreadX: number;       // rest separation between dice (px in REF space)
  spreadY: number;       // vertical offset between dice at rest
}

// Lower playback rates than before — at 2.4-2.8× we were ADVANCING the anim
// by ~40ms per render frame (faster than the Unity clip's 33ms keyframe
// spacing), so we'd skip keyframes and the tumble looked choppy. 1.7-2.0×
// stays inside a single keyframe per frame at 60fps for smooth interpolation.
const VARIATIONS: ThrowVariation[] = [
  { clipIndex: 0, swap: false, flipX: false, playbackRate: 1.9, spreadX: 140, spreadY: 0   },
  { clipIndex: 1, swap: false, flipX: false, playbackRate: 1.7, spreadX: 130, spreadY: -12 },
  { clipIndex: 2, swap: false, flipX: false, playbackRate: 2.0, spreadX: 150, spreadY:  10 },
  { clipIndex: 0, swap: true,  flipX: true,  playbackRate: 1.8, spreadX: 145, spreadY:  -6 },
  { clipIndex: 1, swap: false, flipX: true,  playbackRate: 2.0, spreadX: 135, spreadY:   8 },
  { clipIndex: 2, swap: true,  flipX: false, playbackRate: 1.7, spreadX: 155, spreadY: -10 },
  { clipIndex: 0, swap: true,  flipX: false, playbackRate: 1.9, spreadX: 138, spreadY:  12 },
  { clipIndex: 2, swap: false, flipX: true,  playbackRate: 1.8, spreadX: 142, spreadY:   0 },
];

export class BlackjackDice {
  readonly container: Container;
  private readonly die1: Die3D;
  private readonly die2: Die3D;
  private readonly ticker: Ticker;
  private tickerCb: ((t: Ticker) => void) | null = null;
  private anchorX = 0;
  private anchorY = 0;
  private avgEndX = 0;
  private avgEndY = 0;
  private hasActiveThrow = false;

  // Current-throw variation state — drives where each die settles.
  private currentSpreadX = 140;
  private currentSpreadY = 0;
  private currentFlipX = false;

  // Last-used variation index so we never repeat back-to-back.
  private lastVariationIndex = -1;

  constructor(renderer: Renderer, ticker: Ticker) {
    this.ticker = ticker;
    this.container = new Container();
    this.container.visible = false;

    const textures = bakeFaceTextures(renderer);
    this.die1 = new Die3D(CUBE_HALF);
    this.die1.setFaceTextures(textures);
    this.die2 = new Die3D(CUBE_HALF);
    this.die2.setFaceTextures(textures);
    this.container.addChild(this.die1.outer, this.die2.outer);
  }

  /** Move the lane center (where the dice land). Called by the host scene on layout. */
  setAnchor(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
    if (this.hasActiveThrow) this.updateAnchorPosition();
  }

  /**
   * Where each die is VISIBLY drawn RIGHT NOW (in dice-container local coords,
   * which equal REF coords since the dice container has no transform).
   * Returns the visual center AND the visual bottom Y so callers can spawn
   * ground-impact effects flush with the bottom face.
   */
  getDicePositions(): [
    { x: number; y: number; bottomY: number },
    { x: number; y: number; bottomY: number },
  ] {
    const c1 = this.die1.getVisualCenter();
    const c2 = this.die2.getVisualCenter();
    return [
      { x: c1.x, y: c1.y, bottomY: this.die1.getVisualBottomY() },
      { x: c2.x, y: c2.y, bottomY: this.die2.getVisualBottomY() },
    ];
  }

  hide(): void {
    this.container.visible = false;
    this.hasActiveThrow = false;
    this.stopTicker();
  }

  /** Roll: shows the dice, plays the Unity clip, resolves when both settle. */
  throw(die1Value: number, die2Value: number): Promise<void> {
    return new Promise(resolve => {
      // Reset visual state in case the previous turn left the dice scaled
      // down + faded out by flyAway().
      this.die1.outer.scale.set(1);
      this.die1.outer.alpha = 1;
      this.die2.outer.scale.set(1);
      this.die2.outer.alpha = 1;

      const v = this.pickVariation();
      const clip = CLIPS[v.clipIndex];

      // Optional: swap which die plays which clip track — gives left/right
      // dice asymmetric tumbles depending on the variation.
      const trackForDie1 = v.swap ? clip.die2 : clip.die1;
      const trackForDie2 = v.swap ? clip.die1 : clip.die2;

      this.die1.loadClip(trackForDie1, clip.duration, clip.animationLength, die1Value, POS_SCALE, v.playbackRate, POS_SCALE_Y);
      this.die2.loadClip(trackForDie2, clip.duration, clip.animationLength, die2Value, POS_SCALE, v.playbackRate, POS_SCALE_Y);

      const die1End = trackForDie1.position[trackForDie1.position.length - 1];
      const die2End = trackForDie2.position[trackForDie2.position.length - 1];
      this.avgEndX = (die1End.x + die2End.x) / 2;
      this.avgEndY = (die1End.y + die2End.y) / 2;

      this.currentSpreadX = v.spreadX;
      this.currentSpreadY = v.spreadY;
      this.currentFlipX = v.flipX;

      this.hasActiveThrow = true;
      this.updateAnchorPosition();

      // CRITICAL: snap the dice meshes to the FIRST keyframe of the new clip
      // BEFORE making the container visible. Without this, on a second-or-
      // later throw the meshes still hold the previous roll's settled state
      // until the next ticker tick — Pixi renders that stale frame and you
      // see a 1-frame flicker of the old dice at the new anchor position.
      this.die1.update(0);
      this.die2.update(0);

      this.container.visible = true;

      let done1 = false;
      let done2 = false;
      const tryFinish = () => {
        if (!done1 || !done2) return;
        try { navigator?.vibrate?.(40); } catch { /* unsupported */ }
        resolve();
      };
      this.die1.setOnSettle(() => { done1 = true; tryFinish(); });
      this.die2.setOnSettle(() => { done2 = true; tryFinish(); });

      this.ensureTicker();
    });
  }

  /**
   * After the dice settle, fly them BOTH toward a screen-space target (a
   * bar's center). Each die shrinks and fades as it accelerates toward the
   * target — reads as the result being "absorbed" into the score bar.
   *
   * Target is in dice-container local coords (= REF coords, since the dice
   * container has no transform).
   */
  flyAway(targetX: number, targetY: number): Promise<void> {
    // Stop the per-tick anchor tracking so it doesn't fight the fly tween.
    this.hasActiveThrow = false;

    const FLY_DURATION_MS = 200;   // was 380 → 260 → 200 — punchier suction-to-bar
    const START_DELAY_MS = 120;  // hold on the settled result before flying

    return new Promise(resolve => {
      let waited = 0;
      const wait = (t: Ticker) => {
        waited += t.deltaMS;
        if (waited >= START_DELAY_MS) {
          this.ticker.remove(wait);
          void Promise.all([
            this.flyDie(this.die1, targetX, targetY, FLY_DURATION_MS),
            this.flyDie(this.die2, targetX, targetY, FLY_DURATION_MS),
          ]).then(() => {
            this.hide();
            resolve();
          });
        }
      };
      this.ticker.add(wait);
    });
  }

  private flyDie(die: Die3D, tx: number, ty: number, durationMs: number): Promise<void> {
    const start = { x: die.outer.x, y: die.outer.y };
    return new Promise(resolve => {
      let elapsed = 0;
      const cb = (t: Ticker) => {
        elapsed += t.deltaMS;
        const u = Math.min(1, elapsed / durationMs);
        // Ease-in cubic — slow at first, then accelerates toward the target.
        const e = u * u * u;
        die.outer.x = start.x + (tx - start.x) * e;
        die.outer.y = start.y + (ty - start.y) * e;
        die.outer.scale.set(1 - 0.7 * u);
        die.outer.alpha = 1 - u;
        if (u >= 1) {
          this.ticker.remove(cb);
          resolve();
        }
      };
      this.ticker.add(cb);
    });
  }

  /** Pick a variation that's different from the previous throw. */
  private pickVariation(): ThrowVariation {
    let idx = Math.floor(Math.random() * VARIATIONS.length);
    if (idx === this.lastVariationIndex) {
      idx = (idx + 1) % VARIATIONS.length;
    }
    this.lastVariationIndex = idx;
    return VARIATIONS[idx];
  }

  private ensureTicker(): void {
    if (this.tickerCb) return;
    const cb = (t: Ticker) => {
      this.die1.update(t.deltaMS);
      this.die2.update(t.deltaMS);
      if (this.hasActiveThrow) this.updateAnchorPosition();
    };
    this.tickerCb = cb;
    this.ticker.add(cb);
  }

  private stopTicker(): void {
    if (this.tickerCb) {
      this.ticker.remove(this.tickerCb);
      this.tickerCb = null;
    }
  }

  private updateAnchorPosition(): void {
    // Compensate for the animation's end position so the dice LAND at the
    // anchor point (not wherever the Unity clip ended). X uses POS_SCALE,
    // Y uses POS_SCALE_Y (which is exaggerated for a tall drop arc).
    const ax = this.anchorX - this.avgEndX * POS_SCALE;
    const ay = this.anchorY + this.avgEndY * POS_SCALE_Y;
    // Spread the dice apart on both axes. Optionally mirror left↔right (the
    // "flip" variation) so the same clip reads as a different throw.
    const sx = this.currentSpreadX / 2;
    const sy = this.currentSpreadY / 2;
    const leftSign = this.currentFlipX ? +1 : -1;
    this.die1.setWorldPos(ax + leftSign * sx, ay - sy);
    this.die2.setWorldPos(ax - leftSign * sx, ay + sy);
  }

  destroy(): void {
    this.stopTicker();
    this.die1.destroy();
    this.die2.destroy();
    this.container.destroy({ children: true });
  }
}
