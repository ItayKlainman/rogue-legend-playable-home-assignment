import { Graphics, Ticker } from 'pixi.js';

export class XpOrb {
  readonly graphics: Graphics;
  private ghost: Graphics;

  private active = false;
  private startX = 0;
  private startY = 0;
  private targetX = 0;
  private targetY = 0;
  private elapsed = 0;
  private duration = 300;
  private prevX = 0;
  private prevY = 0;

  onCollected: (() => void) | null = null;

  constructor() {
    this.graphics = new Graphics();
    // Trailing ghost (drawn behind the orb body) for a comet streak.
    this.ghost = new Graphics();
    this.ghost.circle(0, 0, 9).fill({ color: 0xffee88, alpha: 0.5 });
    this.ghost.blendMode = 'add';
    this.graphics.addChild(this.ghost);
    this.graphics.circle(0, 0, 12).fill(0xffcc00);
    this.graphics.circle(0, 0, 8).fill(0xffee88);
    this.graphics.blendMode = 'add';
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
    this.graphics.scale.set(1);
    this.graphics.alpha = 1;
    this.prevX = fromX;
    this.prevY = fromY;
  }

  update(deltaMS: number): void {
    if (!this.active) {
      return;
    }

    this.elapsed += deltaMS;
    const t = Math.min(1, this.elapsed / this.duration);
    const ease = t * t;

    const arcHeight = -80 * Math.sin(t * Math.PI);

    this.prevX = this.graphics.x;
    this.prevY = this.graphics.y;
    this.graphics.x = this.startX + (this.targetX - this.startX) * ease;
    this.graphics.y = this.startY + (this.targetY - this.startY) * ease + arcHeight;
    this.graphics.alpha = 0.6 + 0.4 * (1 - t);

    // Trail: offset the ghost back along the last motion step for a comet streak.
    const dx = this.graphics.x - this.prevX;
    const dy = this.graphics.y - this.prevY;
    this.ghost.position.set(-dx * 1.5, -dy * 1.5);

    if (t >= 1) {
      this.spawnLandPop();
      this.active = false;
      this.graphics.visible = false;
      this.onCollected?.();
    }
  }

  // Sparkle pop where the orb lands in the bar.
  private spawnLandPop(): void {
    const parent = this.graphics.parent;
    if (!parent) {
      return;
    }

    const pop = new Graphics();
    pop.circle(0, 0, 6).fill({ color: 0xffffff });
    pop.blendMode = 'add';
    pop.position.set(this.graphics.x, this.graphics.y);
    parent.addChild(pop);

    let elapsed = 0;
    const duration = 220;
    const onTick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const tt = Math.min(1, elapsed / duration);
      pop.scale.set(1 + tt * 2.5);
      pop.alpha = 1 - tt;

      if (tt >= 1) {
        pop.destroy();
        ticker.remove(onTick);
      }
    };
    Ticker.shared.add(onTick);
  }

  deactivate(): void {
    this.active = false;
    this.graphics.visible = false;
  }
}
