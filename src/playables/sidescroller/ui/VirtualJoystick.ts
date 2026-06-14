import { Container, Graphics } from 'pixi.js';

export interface JoystickDirection {
  x: number;
  y: number;
}

export class VirtualJoystick {
  readonly container = new Container();
  readonly direction: JoystickDirection = { x: 0, y: 0 };

  private outerRadius: number;
  private innerRadius: number;
  private outer: Graphics;
  private inner: Graphics;
  private dragging = false;
  private startX = 0;
  private startY = 0;

  constructor(outerRadius = 60, innerRadius = 25) {
    this.outerRadius = outerRadius;
    this.innerRadius = innerRadius;

    this.outer = new Graphics();
    this.outer.circle(0, 0, outerRadius).fill({ color: 0xffffff, alpha: 0.2 });
    this.outer.circle(0, 0, outerRadius).stroke({ color: 0xffffff, alpha: 0.4, width: 2 });
    this.container.addChild(this.outer);

    this.inner = new Graphics();
    this.inner.circle(0, 0, innerRadius).fill({ color: 0xffffff, alpha: 0.5 });
    this.container.addChild(this.inner);

    this.container.eventMode = 'static';
    this.container.hitArea = { contains: () => true };

    this.container.on('pointerdown', this.onPointerDown, this);
    this.container.on('pointermove', this.onPointerMove, this);
    this.container.on('pointerup', this.onPointerUp, this);
    this.container.on('pointerupoutside', this.onPointerUp, this);
  }

  layout(width: number, height: number): void {
    this.container.position.set(
      this.outerRadius + 30,
      height - this.outerRadius - 30,
    );
  }

  private onPointerDown(e: any): void {
    this.dragging = true;
    const local = this.container.toLocal(e.global);
    this.startX = local.x;
    this.startY = local.y;
    this.updateKnob(local.x, local.y);
  }

  private onPointerMove(e: any): void {
    if (!this.dragging) {
      return;
    }

    const local = this.container.toLocal(e.global);
    this.updateKnob(local.x, local.y);
  }

  private onPointerUp(): void {
    this.dragging = false;
    this.inner.position.set(0, 0);
    this.direction.x = 0;
    this.direction.y = 0;
  }

  private updateKnob(localX: number, localY: number): void {
    const dx = localX;
    const dy = localY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = this.outerRadius - this.innerRadius;

    if (dist > maxDist) {
      const ratio = maxDist / dist;
      this.inner.position.set(dx * ratio, dy * ratio);
      this.direction.x = dx / dist;
      this.direction.y = dy / dist;
    } else {
      this.inner.position.set(dx, dy);

      if (dist > 5) {
        this.direction.x = dx / dist;
        this.direction.y = dy / dist;
      } else {
        this.direction.x = 0;
        this.direction.y = 0;
      }
    }
  }
}
