import { Graphics } from 'pixi.js';

export class XpOrb {
  readonly graphics: Graphics;

  private active = false;
  private startX = 0;
  private startY = 0;
  private targetX = 0;
  private targetY = 0;
  private elapsed = 0;
  private duration = 300;

  onCollected: (() => void) | null = null;

  constructor() {
    this.graphics = new Graphics();
    this.graphics.circle(0, 0, 12).fill(0xffcc00);
    this.graphics.circle(0, 0, 8).fill(0xffee88);
    this.graphics.visible = false;
  }

  get isActive(): boolean { return this.active; }

  spawn(fromX: number, fromY: number, toX: number, toY: number, durationMs: number): void {
    this.startX = fromX;
    this.startY = fromY;
    this.targetX = toX;
    this.targetY = toY;
    this.duration = durationMs;
    this.elapsed = 0;
    this.active = true;
    this.graphics.visible = true;
    this.graphics.position.set(fromX, fromY);
    this.graphics.alpha = 1;
  }

  update(deltaMS: number): void {
    if (!this.active) {
      return;
    }

    this.elapsed += deltaMS;
    const t = Math.min(1, this.elapsed / this.duration);
    const ease = t * t;

    const arcHeight = -80 * Math.sin(t * Math.PI);

    this.graphics.x = this.startX + (this.targetX - this.startX) * ease;
    this.graphics.y = this.startY + (this.targetY - this.startY) * ease + arcHeight;
    this.graphics.alpha = 0.6 + 0.4 * (1 - t);

    if (t >= 1) {
      this.active = false;
      this.graphics.visible = false;
      this.onCollected?.();
    }
  }

  deactivate(): void {
    this.active = false;
    this.graphics.visible = false;
  }
}
