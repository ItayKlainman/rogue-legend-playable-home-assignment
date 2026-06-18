import { Container, Texture } from 'pixi.js';
import { Projectile } from '../entities/Projectile';
import type { ProjectileLook } from '../entities/Projectile';

/** Loaded card-icon textures for sprite-mode projectiles, keyed by powerup id. */
export type ProjectileTextures = Partial<Record<string, Texture>>;

const POOL_SIZE = 80;

export class ProjectileManager {
  readonly container = new Container();

  private pool: Projectile[] = [];
  private screenWidth = 0;
  private screenHeight = 0;

  piercing = false;
  homing = false;
  homingStrength = 3.0;
  splitActive = false;
  splitDelayMs = 150;
  splitAngle = 15;
  /** Current projectile look; most-recent upgrade wins. Applied to every (re)fired projectile. */
  projectileLook: ProjectileLook = { mode: 'default' };
  /** Card-icon textures for sprite-mode upgrades; populated by GameScene after lazy load. */
  projectileTextures: ProjectileTextures = {};
  findTarget: ((x: number, y: number) => { x: number; y: number } | null) | null = null;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    for (let i = 0; i < POOL_SIZE; i++) {
      const p = new Projectile();
      this.pool.push(p);
      this.container.addChild(p.graphics);
    }
  }

  fire(x: number, y: number, speed: number, damage: number, angle = 0): void {
    const projectile = this.pool.find(p => !p.isActive);

    if (!projectile) {
      return;
    }

    projectile.piercing = this.piercing;
    projectile.setLook(this.projectileLook);

    if (this.homing) {
      projectile.homing = true;
      projectile.homingStrength = this.homingStrength;
      projectile.findTarget = this.findTarget;
    }

    if (this.splitActive) {
      projectile.canSplit = true;
      projectile.splitTimer = this.splitDelayMs;
      projectile.onSplit = (sx, sy, spd, dmg) => this.fireSplit(sx, sy, spd, dmg);
    }

    projectile.fire(x, y, speed, damage, angle);
  }

  update(deltaMS: number): void {
    for (const p of this.pool) {
      if (!p.isActive) {
        continue;
      }

      p.update(deltaMS);

      if (p.isOffScreen(this.screenWidth, this.screenHeight)) {
        p.deactivate();
      }
    }
  }

  getActiveProjectiles(): Projectile[] {
    return this.pool.filter(p => p.isActive);
  }

  layout(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  private fireSplit(x: number, y: number, speed: number, damage: number): void {
    const angleRad = (this.splitAngle * Math.PI) / 180;
    this.fireChild(x, y, speed, damage, angleRad);
    this.fireChild(x, y, speed, damage, -angleRad);
  }

  private fireChild(x: number, y: number, speed: number, damage: number, angle: number): void {
    const projectile = this.pool.find(p => !p.isActive);

    if (!projectile) {
      return;
    }

    projectile.piercing = this.piercing;
    projectile.setLook(this.projectileLook);

    if (this.homing) {
      projectile.homing = true;
      projectile.homingStrength = this.homingStrength;
      projectile.findTarget = this.findTarget;
    }

    projectile.fire(x, y, speed, damage, angle);
  }
}
