import { AnimatedSprite, ColorMatrixFilter, Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import { SpineCharacter } from '@shared/SpineCharacter';
import type { SpineAssets } from '@shared/SpineCharacter';
import type { SpriteEffect } from '@shared/SpriteEffect';
import { sfx } from '../sfx';

const ANIM_IDLE = ['Idle', 'Idle_Full', 'Idle_Loop'];
const ANIM_WALK = ['Walk', 'Run', 'Idle', 'Idle_Full', 'Idle_Loop'];
const ANIM_HIT = ['TakeHit', 'Take_Hit', 'Hit', 'Hurt', 'Damaged'];
const ANIM_DEATH = ['Dead', 'Death', 'Die', 'Dying'];

function findAnim(spine: any, candidates: string[]): string | null {
  for (const name of candidates) {
    if (spine.skeleton.data.findAnimation(name)) {
      return name;
    }
  }
  return null;
}

let enemyIdCounter = 0;

export class EnemyEntity {
  readonly container = new Container();
  readonly id: number;

  private character!: SpineCharacter;
  private hp: number;
  private maxHp: number;
  private speed: number;
  private damage: number;
  private scale: number;
  private alive = true;
  private dying = false;
  private ready = false;
  private contactCooldown = 0;

  private walkAnim: string | null = null;
  private hitAnim: string | null = null;
  private deathAnim: string | null = null;

  private hpBarBg!: Graphics;
  private hpBarFill!: Graphics;
  private hpBarWidth = 40;
  private hpBarHeight = 5;
  private hpBarY = 0;
  private charHeight = 0;

  private flashTimer = 0;
  private flashing = false;

  private slowed = false;
  private slowFactor = 1;
  private slowTimer = 0;
  private baseSpeed = 0;
  private filter: ColorMatrixFilter | null = null;

  private burning = false;
  private burnDps = 0;
  private burnTimer = 0;
  private burnTickTimer = 0;
  private burnFlame: AnimatedSprite | null = null;

  onDeath: ((enemy: EnemyEntity) => void) | null = null;
  /** Fired the instant HP hits 0 (any damage source) — for death VFX/shake. */
  onKilled: ((enemy: EnemyEntity) => void) | null = null;

  private lockMiddle = false;
  private screenWidth = 0;
  private screenHeight = 0;
  private engaged = false;

  constructor(hp: number, speed: number, damage: number, scale: number, isBoss = false) {
    this.id = enemyIdCounter++;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed * (0.85 + Math.random() * 0.3);
    this.baseSpeed = this.speed;
    this.damage = damage;
    this.scale = scale;
    this.lockMiddle = isBoss;
  }

  get isAlive(): boolean { return this.alive; }
  get isDying(): boolean { return this.dying; }
  get isBoss(): boolean { return this.lockMiddle; }
  get currentHp(): number { return this.hp; }
  get contactDamage(): number { return this.damage; }
  get canDealDamage(): boolean { return this.alive && this.contactCooldown <= 0; }

  get x(): number { return this.container.x; }
  get y(): number { return this.container.y; }

  get hitRadius(): number {
    if (this.character) {
      return this.charHeight * 0.35;
    }
    return 30;
  }

  get centerY(): number {
    return this.container.y - this.charHeight * 0.5;
  }

  get displayHeight(): number { return this.charHeight; }

  async init(
    spineBundle: SpineAssets,
    skin: string | undefined,
    ticker: Ticker,
    startX: number,
    startY: number,
    screenW = 0,
    screenH = 0,
  ): Promise<void> {
    this.screenWidth = screenW;
    this.screenHeight = screenH;
    // Position immediately (before the async spine load) so the enemy isn't briefly at
    // (0,0) where it could be targeted/hit while still initialising.
    this.container.position.set(startX, startY);
    this.character = await SpineCharacter.create(
      `enemy_${this.id}`,
      spineBundle,
      ticker,
      { skin, animation: undefined },
    );

    this.character.spine.scale.set(this.scale);
    this.character.facingLeft = false;
    this.container.addChild(this.character.spine);

    this.walkAnim = findAnim(this.character.spine, ANIM_WALK);
    this.hitAnim = findAnim(this.character.spine, ANIM_HIT);
    this.deathAnim = findAnim(this.character.spine, ANIM_DEATH);

    if (this.walkAnim) {
      this.character.play(this.walkAnim, true);
    }

    this.charHeight = this.character.spine.skeleton.data.height * Math.abs(this.character.spine.scale.x);
    this.hpBarWidth = Math.max(40, this.charHeight * 0.6);
    this.hpBarY = -(this.charHeight + 5);

    this.hpBarBg = new Graphics();
    this.hpBarBg.roundRect(-this.hpBarWidth / 2, 0, this.hpBarWidth, this.hpBarHeight, 2).fill(0x333333);
    this.hpBarBg.position.set(0, this.hpBarY);
    this.container.addChild(this.hpBarBg);

    this.hpBarFill = new Graphics();
    this.hpBarFill.position.set(0, this.hpBarY);
    this.drawHpFill(1);
    this.container.addChild(this.hpBarFill);
    this.ready = true;
  }

  update(deltaMS: number, heroX: number, heroY: number): void {
    if (!this.ready) {
      return;
    }
    if (this.flashing) {
      this.flashTimer -= deltaMS;

      if (this.flashTimer <= 0) {
        this.flashing = false;

        if (this.slowed) {
          this.applyIceTint();
        } else {
          this.character.spine.filters = [];
          this.filter = null;
        }
      }
    }

    if (this.slowed && !this.flashing) {
      this.slowTimer -= deltaMS;

      if (this.slowTimer <= 0) {
        this.slowed = false;
        this.speed = this.baseSpeed;
        this.character.spine.filters = [];
        this.filter = null;
      }
    }

    if (this.burning && this.alive) {
      this.burnTimer -= deltaMS;
      this.burnTickTimer -= deltaMS;

      if (this.burnTickTimer <= 0) {
        this.burnTickTimer += 500;
        this.takeDamage(Math.round(this.burnDps * 0.5));
      }

      if (this.burnTimer <= 0) {
        this.burning = false;
        this.burnDps = 0;

        if (this.burnFlame) {
          this.burnFlame.destroy();
          this.burnFlame = null;
        }
      }
    }

    if (!this.alive) {
      if (this.burnFlame) {
        this.burnFlame.destroy();
        this.burnFlame = null;
      }
      return;
    }

    if (this.contactCooldown > 0) {
      this.contactCooldown -= deltaMS;
    }

    const dt = deltaMS / 1000;

    if (!this.engaged && this.container.x - heroX <= this.screenWidth * 0.2) {
      this.engaged = true;
    }

    if (this.engaged) {
      const dx = heroX - this.container.x;
      const dy = heroY - this.container.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 1) {
        this.container.x += (dx / dist) * this.speed * dt;
        this.container.y += (dy / dist) * this.speed * dt;
      }
    } else {
      this.container.x -= this.speed * dt;

      if (this.lockMiddle) {
        const centerY = this.screenHeight * 0.5;
        const dy = centerY - this.container.y;
        const driftSpeed = this.speed * 0.3;
        const maxDrift = driftSpeed * dt;

        if (Math.abs(dy) > 1) {
          this.container.y += Math.sign(dy) * Math.min(Math.abs(dy), maxDrift);
        }
      }
    }
  }

  takeDamage(amount: number, isCrit = false): void {
    if (!this.alive || !this.ready) {
      return; // ignore hits during the async spine-load window (no hp bar / character yet)
    }

    this.hp -= amount;
    this.updateHpBar();
    this.triggerHitFlash();
    this.spawnDamageNumber(amount, isCrit);

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.dying = true;
      sfx.enemyDeath();
      this.onKilled?.(this);

      if (this.deathAnim) {
        this.character.play(this.deathAnim, false);
        this.character.spine.state.addListener({
          complete: () => {
            this.dying = false;
            this.onDeath?.(this);
          },
        });
      } else {
        this.dying = false;
        this.onDeath?.(this);
      }
    } else if (this.hitAnim) {
      this.character.play(this.hitAnim, false);

      if (this.walkAnim) {
        this.character.queue(this.walkAnim, true, 0);
      }
    }
  }

  resetContactCooldown(): void {
    this.contactCooldown = 500;
  }

  setSpinePaused(frozen: boolean): void {
    if (this.character) {
      this.character.spine.state.timeScale = frozen ? 0 : 1;
    }
  }

  setSpineTimeScale(scale: number): void {
    if (this.character) {
      this.character.spine.state.timeScale = scale;
    }
  }

  applySlow(factor: number, durationMs: number): void {
    if (!this.alive || !this.ready) {
      return;
    }

    this.slowTimer = durationMs;

    if (!this.slowed) {
      this.slowed = true;
      this.slowFactor = factor;
      this.speed = this.baseSpeed * factor;
    }

    if (!this.flashing) {
      this.applyIceTint();
    }
  }

  applyBurn(dps: number, durationMs: number, flameEffect?: SpriteEffect): void {
    if (!this.alive || !this.ready) {
      return;
    }

    this.burning = true;
    this.burnDps = dps;
    this.burnTimer = durationMs;

    if (this.burnTickTimer <= 0) {
      this.burnTickTimer = 500;
    }

    if (!this.burnFlame && flameEffect) {
      this.burnFlame = flameEffect.play(this.container, 0, -this.charHeight * 0.5, {
        loop: true,
        scale: Math.max(0.3, this.charHeight / 200),
      });
    }
  }

  private applyIceTint(): void {
    if (!this.filter) {
      this.filter = new ColorMatrixFilter();
    }

    this.filter.matrix = [
      0.3, 0, 0, 0, 0.2,
      0, 0.4, 0, 0, 0.3,
      0, 0, 0.6, 0, 0.5,
      0, 0, 0, 1, 0,
    ] as any;
    this.character.spine.filters = [this.filter];
  }

  private triggerHitFlash(): void {
    if (!this.character) {
      return;
    }

    if (!this.filter) {
      this.filter = new ColorMatrixFilter();
    }

    this.filter.matrix = [
      0, 0, 0, 0, 1,
      0, 0, 0, 0, 1,
      0, 0, 0, 0, 1,
      0, 0, 0, 1, 0,
    ] as any;
    this.character.spine.filters = [this.filter];
    this.flashTimer = 100;
    this.flashing = true;
  }

  private updateHpBar(): void {
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.drawHpFill(ratio);
  }

  private drawHpFill(ratio: number): void {
    this.hpBarFill.clear();
    const fillWidth = this.hpBarWidth * ratio;

    if (fillWidth > 0) {
      const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
      this.hpBarFill.roundRect(-this.hpBarWidth / 2, 0, fillWidth, this.hpBarHeight, 2).fill(color);
    }
  }

  private spawnDamageNumber(amount: number, isCrit = false): void {
    const fontSize = Math.max(isCrit ? 22 : 14, this.charHeight * (isCrit ? 0.34 : 0.2));
    const text = new Text({
      text: isCrit ? `${amount}!` : `-${amount}`,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fontSize,
        fill: isCrit ? 0xffd23f : 0xff4444,
        stroke: { color: isCrit ? 0x7a3b00 : 0x000000, width: isCrit ? 4 : 3, join: 'round' },
      }),
    });
    text.anchor.set(0.5);
    text.position.set(0, this.hpBarY - 10);
    this.container.addChild(text);

    const startY = text.y;
    const floatDist = isCrit ? 58 : 40;
    const duration = isCrit ? 750 : 600;
    let elapsed = 0;

    const onTick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / duration);
      text.y = startY - floatDist * t;
      text.alpha = 1 - t;

      if (t >= 1) {
        text.destroy();
        ticker.remove(onTick);
      }
    };

    Ticker.shared.add(onTick);
  }
}
