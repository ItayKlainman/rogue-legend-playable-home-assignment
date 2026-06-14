import { Container, Text } from 'pixi.js';

const FONT_SIZE = 24;
const LABEL_OFFSET_BASE = 1050; // offset above hero in Spine units (scaled by heroScaleY) — skeleton origin is at feet, head is ~700 units up

// Delay before animation starts
const START_DELAY = 400;

// Scale animation
const SCALE_UP_MS = 150;   // time to ramp up to peak scale
const SCALE_DOWN_MS = 300;  // time to settle back to 1.0 after lerp finishes
const PEAK_SCALE = 1.5;

// Counter roll-up
const LERP_FACTOR = 0.08;

export class OverheadAtkLabel {
  readonly container: Container;

  private text!: Text;

  private displayedAtk: number;
  private targetAtk: number;
  private scalePhase: 'idle' | 'up' | 'hold' | 'down' = 'idle';
  private scaleTimer = 0;
  private delayRemaining = -1;
  private pendingAtk = -1;

  constructor(initialAtk: number) {
    this.container = new Container();
    this.displayedAtk = initialAtk;
    this.targetAtk = initialAtk;
  }

  async init(): Promise<void> {
    this.text = new Text({
      text: String(this.targetAtk),
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: FONT_SIZE,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });
    this.text.anchor.set(0.5, 0.5);

    this.container.addChild(this.text);
  }

  initAtk(value: number): void {
    this.displayedAtk = value;
    this.targetAtk = value;
    if (this.text) {
      this.text.text = String(value);
    }
  }

  setAtk(value: number): void {
    this.pendingAtk = value;
    this.delayRemaining = START_DELAY;
  }

  update(deltaMS: number): void {
    // Delay before starting animation
    if (this.delayRemaining >= 0) {
      this.delayRemaining -= deltaMS;
      if (this.delayRemaining < 0) {
        this.targetAtk = this.pendingAtk;
        this.scalePhase = 'up';
        this.scaleTimer = 0;
      }
    }

    // Counter roll-up
    const isLerping = Math.round(this.displayedAtk) !== this.targetAtk;
    if (isLerping) {
      this.displayedAtk += (this.targetAtk - this.displayedAtk) * LERP_FACTOR;
      if (Math.round(this.displayedAtk) === this.targetAtk) {
        this.displayedAtk = this.targetAtk;
      }
      if (this.text) {
        this.text.text = String(Math.round(this.displayedAtk));
      }
    }

    // Scale: ramp up → hold while lerping → settle down when lerp finishes
    this.scaleTimer += deltaMS;
    switch (this.scalePhase) {
      case 'up': {
        const t = Math.min(this.scaleTimer / SCALE_UP_MS, 1);
        this.container.scale.set(1 + (PEAK_SCALE - 1) * t);
        if (t >= 1) {
          this.scalePhase = 'hold';
        }
        break;
      }
      case 'hold': {
        this.container.scale.set(PEAK_SCALE);
        if (!isLerping) {
          this.scalePhase = 'down';
          this.scaleTimer = 0;
        }
        break;
      }
      case 'down': {
        const t = Math.min(this.scaleTimer / SCALE_DOWN_MS, 1);
        this.container.scale.set(PEAK_SCALE - (PEAK_SCALE - 1) * t);
        if (t >= 1) {
          this.container.scale.set(1);
          this.scalePhase = 'idle';
        }
        break;
      }
    }
  }

  syncPosition(heroX: number, heroY: number, heroScaleY: number): void {
    this.container.x = heroX;
    this.container.y = heroY - LABEL_OFFSET_BASE * heroScaleY;
  }

}
