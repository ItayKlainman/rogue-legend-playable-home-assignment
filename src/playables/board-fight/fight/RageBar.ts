import { Container, Graphics, TextStyle, Text } from 'pixi.js';

const RAGE_BG_COLOR = 0x1a1a2e;
const RAGE_FILL_COLOR = 0xe8a020;
const RAGE_FULL_COLOR = 0xff6600;
const RAGE_BORDER_COLOR = 0x333355;
const BORDER_WIDTH = 2;
const CORNER_RADIUS = 3;

export class RageBar {
  readonly container: Container;
  private bg: Graphics;
  private fill: Graphics;
  private glowFill: Graphics;
  private max: number;
  private current = 0;
  private barWidth = 80;
  private barHeight = 10;
  private full = false;

  constructor(max: number) {
    this.max = max;
    this.container = new Container();

    this.bg = new Graphics();
    this.fill = new Graphics();
    this.glowFill = new Graphics();
    this.glowFill.alpha = 0;

    this.container.addChild(this.bg, this.fill, this.glowFill);
  }

  private wasFull = false;

  setRage(current: number): void {
    this.current = Math.max(0, Math.min(current, this.max));
    this.full = this.current >= this.max;
    this.drawFill();
    this.updateGlow();
  }

  layout(centerX: number, y: number, width: number, height: number): void {
    this.barWidth = width;
    this.barHeight = height;
    this.container.x = centerX - width / 2;
    this.container.y = y;
    this.drawBg();
    this.drawFill();
    this.updateGlow();
  }

  get isFull(): boolean {
    return this.full;
  }

  /** Discharge rage to 0 with a quick visual. */
  discharge(): void {
    this.current = 0;
    this.full = false;
    this.drawFill();
    this.updateGlow();
  }

  /** Static background + border — only redrawn on layout. */
  private drawBg(): void {
    this.bg.clear();
    this.bg.roundRect(0, 0, this.barWidth, this.barHeight, CORNER_RADIUS)
      .fill({ color: RAGE_BG_COLOR })
      .stroke({ color: RAGE_BORDER_COLOR, width: BORDER_WIDTH });
  }

  /** Fill — redrawn per rage tick. */
  private drawFill(): void {
    const w = this.barWidth;
    const h = this.barHeight;
    const ratio = this.max > 0 ? this.current / this.max : 0;
    this.fill.clear();
    if (ratio > 0) {
      const fillW = Math.max(0, (w - BORDER_WIDTH * 2) * ratio);
      const color = this.full ? RAGE_FULL_COLOR : RAGE_FILL_COLOR;
      this.fill.roundRect(
        BORDER_WIDTH, BORDER_WIDTH,
        fillW, h - BORDER_WIDTH * 2,
        Math.max(0, CORNER_RADIUS - 1),
      ).fill({ color });
    }
  }

  /** Glow only flips on the full↔not-full transition, not every tick. */
  private updateGlow(): void {
    if (this.full === this.wasFull) {
      this.glowFill.alpha = this.full ? 0.4 : 0;
      return;
    }
    this.wasFull = this.full;
    this.glowFill.alpha = this.full ? 0.4 : 0;
    if (this.full) {
      this.glowFill.clear();
      this.glowFill.roundRect(0, 0, this.barWidth, this.barHeight, CORNER_RADIUS)
        .fill({ color: RAGE_FULL_COLOR });
    }
  }
}
