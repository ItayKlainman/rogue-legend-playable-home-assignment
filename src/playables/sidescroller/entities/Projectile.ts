import { Graphics } from 'pixi.js';

export class Projectile {
  readonly graphics: Graphics;

  piercing = false;
  readonly hitEnemyIds = new Set<number>();

  homing = false;
  homingStrength = 3.0;
  findTarget: ((x: number, y: number) => { x: number; y: number } | null) | null = null;

  canSplit = false;
  splitTimer = 0;
  onSplit: ((x: number, y: number, speed: number, damage: number) => void) | null = null;

  private active = false;
  private vx = 0;
  private vy = 0;
  private damage = 0;

  constructor() {
    this.graphics = new Graphics();
    this.graphics.roundRect(-12, -3, 24, 6, 3).fill(0xffee66);
    this.graphics.roundRect(-12, -3, 24, 6, 3).stroke({ color: 0xcc8800, width: 1.5 });
    this.graphics.visible = false;
  }

  get isActive(): boolean { return this.active; }
  get x(): number { return this.graphics.x; }
  get y(): number { return this.graphics.y; }
  get hitDamage(): number { return this.damage; }

  fire(x: number, y: number, speed: number, damage: number, angle = 0): void {
    this.graphics.position.set(x, y);
    this.vx = speed * Math.cos(angle);
    this.vy = speed * Math.sin(angle);
    this.damage = damage;
    this.active = true;
    this.graphics.visible = true;
    this.hitEnemyIds.clear();
  }

  update(deltaMS: number): void {
    if (!this.active) {
      return;
    }

    const dt = deltaMS / 1000;

    if (this.homing && this.findTarget) {
      const target = this.findTarget(this.graphics.x, this.graphics.y);

      if (target) {
        const dx = target.x - this.graphics.x;
        const dy = target.y - this.graphics.y;
        const targetAngle = Math.atan2(dy, dx);
        const currentAngle = Math.atan2(this.vy, this.vx);
        let diff = targetAngle - currentAngle;

        while (diff > Math.PI) { diff -= Math.PI * 2; }
        while (diff < -Math.PI) { diff += Math.PI * 2; }

        const maxTurn = this.homingStrength * dt;
        const turn = Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
        const newAngle = currentAngle + turn;
        const totalSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);

        this.vx = totalSpeed * Math.cos(newAngle);
        this.vy = totalSpeed * Math.sin(newAngle);
      }
    }

    this.graphics.x += this.vx * dt;
    this.graphics.y += this.vy * dt;

    if (this.canSplit && this.splitTimer > 0) {
      this.splitTimer -= deltaMS;

      if (this.splitTimer <= 0) {
        const totalSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        this.onSplit?.(this.graphics.x, this.graphics.y, totalSpeed, this.damage);
        this.deactivate();
      }
    }
  }

  deactivate(): void {
    this.active = false;
    this.graphics.visible = false;
    this.hitEnemyIds.clear();
    this.homing = false;
    this.canSplit = false;
    this.onSplit = null;
    this.findTarget = null;
  }

  isOffScreen(screenWidth: number, screenHeight: number): boolean {
    return this.graphics.x > screenWidth + 20 || this.graphics.y < -50 || this.graphics.y > screenHeight + 50;
  }
}
