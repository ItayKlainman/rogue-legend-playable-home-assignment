import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

// The real summon-screen torches: PocketRoll's fire_loop_1_mid.png — a 5×5
// sprite sheet (1280×1280, 256px cells) of one looping green flame. We slice it
// into 25 frames and cycle them for the flicker, exactly like the in-game flame.
const SHEET = 1280;
const COLS = 5;
const ROWS = 5;
const CELL = SHEET / COLS; // 256
const FRAMES = COLS * ROWS; // 25

/** A single animated green summoning flame, anchored at its base (0.5, 1). */
export class TorchFlame {
  readonly sprite: Sprite;
  private frames: Texture[];
  private frame = 0;
  private acc = 0;
  private readonly frameMs: number;

  constructor(sheet: Texture, fps = 24, phase = 0) {
    this.frames = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.frames.push(
          new Texture({
            source: sheet.source,
            frame: new Rectangle(c * CELL, r * CELL, CELL, CELL),
          }),
        );
      }
    }
    this.frameMs = 1000 / fps;
    this.frame = Math.floor(phase * FRAMES) % FRAMES;
    this.sprite = new Sprite(this.frames[this.frame]);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.blendMode = 'add'; // glowing flame reads brighter over the dark pad
  }

  /** Place + size the flame (height in px; width follows the square cell). */
  layout(x: number, y: number, height: number): void {
    this.sprite.position.set(x, y);
    this.sprite.height = height;
    this.sprite.scale.x = this.sprite.scale.y;
  }

  update(deltaMS: number): void {
    this.acc += deltaMS;
    while (this.acc >= this.frameMs) {
      this.acc -= this.frameMs;
      this.frame = (this.frame + 1) % FRAMES;
      this.sprite.texture = this.frames[this.frame];
    }
  }

  addTo(parent: Container): void {
    parent.addChild(this.sprite);
  }

  destroy(): void {
    this.frames.forEach((t) => t.destroy(false)); // keep shared source alive
    this.sprite.destroy();
  }
}
