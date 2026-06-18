import { Graphics, Sprite, Texture } from 'pixi.js';

/** How a projectile should render. `default`/`tint` keep the Graphics bolt; `sprite` shows a card icon. */
export interface ProjectileLook {
  mode: 'default' | 'tint' | 'sprite';
  texture?: Texture | null;
  tint?: number;
  spin?: boolean;
  /** Local sprite rotation (radians) so an upright icon can be laid along travel. */
  baseRotation?: number;
}

// Target on-screen size for sprite-mode projectiles (px), kept ~ the Graphics bolt so hit
// detection still feels right.
const SPRITE_SIZE = 34;

export class Projectile {
  readonly graphics: Graphics;
  private sprite: Sprite | null = null;
  private spinning = false;

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

  private readonly bolt: Graphics;

  constructor() {
    this.graphics = new Graphics();
    this.graphics.visible = false;

    // The bolt lives in a child so sprite-mode upgrades can hide it without a redraw.
    this.bolt = new Graphics();
    // Additive glow halo behind the bolt so it reads as a cast spell, not a stick.
    this.bolt.ellipse(-2, 0, 20, 7).fill({ color: 0xfff2a0, alpha: 0.45 });
    this.bolt.roundRect(-12, -3, 24, 6, 3).fill(0xffee66);
    this.bolt.roundRect(-12, -3, 24, 6, 3).stroke({ color: 0xcc8800, width: 1.5 });
    this.bolt.blendMode = 'add';
    this.graphics.addChild(this.bolt);
  }

  /** Apply a projectile look (most-recent upgrade wins). Switches between bolt + sprite. */
  setLook(look: ProjectileLook): void {
    if (look.mode === 'sprite' && look.texture) {
      if (!this.sprite) {
        this.sprite = new Sprite();
        this.sprite.anchor.set(0.5);
        this.graphics.addChild(this.sprite);
      }
      this.sprite.texture = look.texture;
      const tex = look.texture;
      const scale = SPRITE_SIZE / Math.max(tex.width, tex.height);
      this.sprite.scale.set(scale);
      this.sprite.visible = true;
      this.sprite.rotation = look.baseRotation ?? 0;
      this.spinning = !!look.spin;
      this.bolt.visible = false;
      this.graphics.tint = 0xffffff;
      this.graphics.alpha = 1;
    } else {
      if (this.sprite) {
        this.sprite.visible = false;
      }
      this.spinning = false;
      this.bolt.visible = true;
      this.graphics.tint = look.tint ?? 0xffffff;
      this.graphics.alpha = 1;
    }
  }

  get isActive(): boolean { return this.active; }
  get x(): number { return this.graphics.x; }
  get y(): number { return this.graphics.y; }
  get hitDamage(): number { return this.damage; }

  fire(x: number, y: number, speed: number, damage: number, angle = 0): void {
    this.graphics.position.set(x, y);
    this.graphics.rotation = angle;
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
        this.graphics.rotation = newAngle;
      }
    }

    this.graphics.x += this.vx * dt;
    this.graphics.y += this.vy * dt;

    if (this.spinning && this.sprite) {
      // Add a steady local spin so the shuriken whirls (on top of the container's aim rotation).
      this.sprite.rotation += 0.5 * (deltaMS / 16.67);
    }

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
    this.spinning = false;
    if (this.sprite) {
      this.sprite.rotation = 0;
    }
  }

  isOffScreen(screenWidth: number, screenHeight: number): boolean {
    return this.graphics.x > screenWidth + 20 || this.graphics.y < -50 || this.graphics.y > screenHeight + 50;
  }
}
