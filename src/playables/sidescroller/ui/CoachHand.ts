import { Assets, Container, Sprite, Texture } from 'pixi.js';
import handData from 'assets/UI/Tutorial_Hand.webp';

// Tap-pulse tuning.
const HAND_SIZE = 110;      // target on-screen size for the hand sprite
const PULSE_PERIOD = 650;   // ms per tap cycle
const SCALE_MIN = 0.9;      // base scale at the "released" point
const SCALE_AMP = 0.16;     // how much it grows at the "tap" point
const BOB_AMP = 6;          // px downward bob at the tap point

// PIXI v8: build the sprite from a LOADED texture, never `Texture.from(importedUrl)`.
let HAND_TEX: Texture | undefined;

export class CoachHand extends Container {
  /** Load this widget's texture. MUST be awaited before the constructor runs. */
  static async preload(): Promise<void> {
    HAND_TEX = await Assets.load<Texture>(handData);
  }

  private hand: Sprite;
  private elapsed = 0;
  private baseScale: number;

  constructor() {
    super();
    if (!HAND_TEX) throw new Error('CoachHand.preload() must be awaited before constructing CoachHand');
    this.hand = new Sprite(HAND_TEX);
    // Anchor near the fingertip so it visually "taps" the point we move to.
    this.hand.anchor.set(0.3, 0.1);
    const w = HAND_TEX.width || HAND_SIZE;
    const h = HAND_TEX.height || HAND_SIZE;
    this.baseScale = Math.min(HAND_SIZE / w, HAND_SIZE / h);
    this.hand.scale.set(this.baseScale);
    this.addChild(this.hand);
    this.visible = false;
  }

  /** Move the hand over a target point (local coords) and show it. */
  pointAt(x: number, y: number): void {
    this.position.set(x, y);
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  /** Looping tap pulse: a sine-driven scale + small downward bob on the hand sprite. */
  update(dtMs: number): void {
    if (!this.visible) return;
    this.elapsed += dtMs;
    const phase = (this.elapsed % PULSE_PERIOD) / PULSE_PERIOD;
    const tap = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; // [0,1]
    const s = this.baseScale * (SCALE_MIN + SCALE_AMP * tap);
    this.hand.scale.set(s);
    this.hand.y = BOB_AMP * tap;
  }
}
