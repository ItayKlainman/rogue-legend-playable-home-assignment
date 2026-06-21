import { Container, Graphics, Texture } from 'pixi.js';
import { Projectile } from '../entities/Projectile';
import type { ProjectileLook } from '../entities/Projectile';
import type { SpriteEffect } from '@shared/SpriteEffect';

/** Loaded card-icon textures for sprite-mode projectiles, keyed by powerup id. */
export type ProjectileTextures = Partial<Record<string, Texture>>;

const POOL_SIZE = 80;
const TRAIL_POOL_SIZE = 64;
const TRAIL_LIFE_MS = 170;

/** A pooled, recycled trail spark — never allocated per-frame (GC-friendly on low-end devices). */
interface TrailSpark { g: Graphics; life: number; }

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
  /** Current projectile look; most-recent upgrade wins. Applied to every (re)fired projectile.
   *  Default bolts get a generic energy glow + gold trail; element upgrades swap to their own
   *  themed look (lightning → electric aura, fire → flame aura, etc.). */
  projectileLook: ProjectileLook = { mode: 'default', trailColor: 0xffd35a };
  /** Card-icon textures for sprite-mode upgrades; populated by GameScene after lazy load. */
  projectileTextures: ProjectileTextures = {};
  /** Looping element auras (electric / fire); populated by GameScene after lazy load. */
  electricAura: SpriteEffect | null = null;
  fireAura: SpriteEffect | null = null;
  findTarget: ((x: number, y: number) => { x: number; y: number } | null) | null = null;

  // Spark trail: drop a fading additive spark behind each live projectile on a fixed cadence
  // so it leaves a coloured streak. Lives in `container` (not the moving projectile) so the
  // trail stays put as the bolt travels on. Pooled + aged in update() — no per-frame allocation,
  // and it freezes with the world during the level-up pause.
  private trailTimer = 0;
  private trailPool: TrailSpark[] = [];

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // Trail sparks first so they render BEHIND the projectile heads.
    for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
      const g = new Graphics();
      g.circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.55 });
      g.circle(0, 0, 2.5).fill({ color: 0xffffff });
      g.blendMode = 'add';
      g.visible = false;
      this.container.addChild(g);
      this.trailPool.push({ g, life: 0 });
    }

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
    projectile.setAura(this.auraForLook(), this.projectileLook.auraScale ?? 0.5);

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
    // Drop a coloured trail spark behind every live projectile on a fixed cadence.
    this.trailTimer -= deltaMS;
    let dropTrail = false;

    if (this.trailTimer <= 0) {
      this.trailTimer = 30;
      dropTrail = true;
    }

    const trailColor = this.projectileLook.trailColor ?? 0xffd35a;

    for (const p of this.pool) {
      if (!p.isActive) {
        continue;
      }

      p.update(deltaMS);

      if (dropTrail) {
        this.spawnTrailSpark(p.x, p.y, trailColor);
      }

      if (p.isOffScreen(this.screenWidth, this.screenHeight)) {
        p.deactivate();
      }
    }

    // Age live trail sparks (fade + shrink), recycling them back into the pool.
    for (const t of this.trailPool) {
      if (t.life <= 0) {
        continue;
      }

      t.life -= deltaMS;

      if (t.life <= 0) {
        t.g.visible = false;
        continue;
      }

      const k = t.life / TRAIL_LIFE_MS;
      t.g.alpha = k;
      t.g.scale.set(0.4 + k * 0.6);
    }
  }

  /** The looping aura SpriteEffect for the current look, or null for non-aura looks. */
  private auraForLook(): SpriteEffect | null {
    if (this.projectileLook.aura === 'electric') {
      return this.electricAura;
    }

    if (this.projectileLook.aura === 'fire') {
      return this.fireAura;
    }

    return null;
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
    projectile.setAura(this.auraForLook(), this.projectileLook.auraScale ?? 0.5);

    if (this.homing) {
      projectile.homing = true;
      projectile.homingStrength = this.homingStrength;
      projectile.findTarget = this.findTarget;
    }

    projectile.fire(x, y, speed, damage, angle);
  }

  private spawnTrailSpark(x: number, y: number, color: number): void {
    const s = this.trailPool.find(t => t.life <= 0);

    if (!s) {
      return; // pool exhausted — just thin the trail rather than allocate
    }

    s.g.position.set(x, y);
    s.g.tint = color;
    s.g.alpha = 1;
    s.g.scale.set(1);
    s.g.visible = true;
    s.life = TRAIL_LIFE_MS;
  }
}
