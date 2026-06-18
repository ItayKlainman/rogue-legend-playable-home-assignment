import { ColorMatrixFilter, Container, Ticker } from 'pixi.js';
import { SpineCharacter } from '@shared/SpineCharacter';
import type { SpineAssets } from '@shared/SpineCharacter';
import type { JoystickDirection } from '../ui/VirtualJoystick';
import emberStaff from 'assets/Weapons/EmberStaff.webp';

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

export class HeroEntity {
  readonly container = new Container();

  private character!: SpineCharacter;
  private hp: number;
  private maxHp: number;
  private speed: number;
  private attackRate: number;
  private arrowDamage: number;
  private arrowSpeed: number;
  private baseAttackRate: number;
  private attackRateMultiplier = 1;
  private fireTimer = 0;
  private alive = true;
  private moving = false;
  private width = 0;
  private height = 0;

  private idleAnim: string | null = null;
  private walkAnim: string | null = null;
  private hitAnim: string | null = null;
  private deathAnim: string | null = null;
  private fireOffsetY = 0;
  private flashTimer = 0;
  private flashing = false;

  onFire: ((x: number, y: number, damage: number, speed: number) => void) | null = null;
  onDeath: (() => void) | null = null;

  constructor(
    private spineBundle: SpineAssets,
    private skin: string | undefined,
    private scale: number,
    hp: number,
    speed: number,
    attackRate: number,
    arrowDamage: number,
    arrowSpeed: number,
  ) {
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.attackRate = attackRate;
    this.baseAttackRate = attackRate;
    this.arrowDamage = arrowDamage;
    this.arrowSpeed = arrowSpeed;
  }

  get currentHp(): number { return this.hp; }
  get maximumHp(): number { return this.maxHp; }
  get isAlive(): boolean { return this.alive; }

  get x(): number { return this.container.x; }
  get y(): number { return this.container.y; }

  get hitRadius(): number {
    if (this.character) {
      return this.character.spine.skeleton.data.height * Math.abs(this.character.spine.scale.x) * 0.3;
    }
    return 30;
  }

  async init(ticker: Ticker, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;

    this.character = await SpineCharacter.create('hero', this.spineBundle, ticker, {
      skin: this.skin,
      animation: undefined,
    });

    this.character.spine.scale.set(this.scale);
    this.character.facingLeft = false;
    this.container.addChild(this.character.spine);

    this.idleAnim = findAnim(this.character.spine, ANIM_IDLE);
    this.walkAnim = findAnim(this.character.spine, ANIM_WALK);
    this.hitAnim = findAnim(this.character.spine, ANIM_HIT);
    this.deathAnim = findAnim(this.character.spine, ANIM_DEATH);

    if (this.idleAnim) {
      this.character.play(this.idleAnim, true);
    }

    this.fireOffsetY = this.character.spine.skeleton.data.height * Math.abs(this.character.spine.scale.x) * 0.5;
    this.container.position.set(width * 0.15, height * 0.5);

    // Pin an EmberStaff to the hero's back-hand weapon slot (Sword_Hilt2, bone `Weapon`) so the
    // "wizard" reads as casting a spell-staff. This slot draws BEHIND the front hand, so the hand
    // visibly grips over the staff. (The front-hand slot Sword_Hilt3 draws on top of the hand —
    // staff floats un-gripped — and the spine API can't tuck a slot object behind the hand
    // attachment, so the back hand is the gripped-look option.)
    // NOTE: no GlowFilter — a per-sprite GlowFilter tanks FPS under software-GL, and PIXI's
    // clamped deltaMS then drags the whole (delta-timed) sim into slow-motion. The staff art
    // already glows; the additive projectiles carry the "spell" read.
    await this.character.equipWeapon(
      {
        spriteData: emberStaff,
        position: { x: 0.45, y: 0.9 }, // Unity units (auto → spine px)
        rotation: -22,
        scale: 1.3,
      },
      'Sword_Hilt2',
    );
  }

  update(deltaMS: number, direction: JoystickDirection): void {
    if (!this.alive) {
      return;
    }

    if (this.flashing) {
      this.flashTimer -= deltaMS;

      if (this.flashTimer <= 0) {
        this.flashing = false;
        this.character.spine.filters = [];
      }
    }

    const dx = direction.x * this.speed * (deltaMS / 1000);
    const dy = direction.y * this.speed * (deltaMS / 1000);

    this.container.x += dx;
    this.container.y += dy;

    this.container.x = Math.max(30, Math.min(this.width * 0.2, this.container.x));
    this.container.y = Math.max(60, Math.min(this.height - 60, this.container.y));

    const isMoving = Math.abs(direction.x) > 0.1 || Math.abs(direction.y) > 0.1;

    if (isMoving && !this.moving) {
      this.moving = true;

      if (this.walkAnim) {
        this.character.play(this.walkAnim, true);
      }
    } else if (!isMoving && this.moving) {
      this.moving = false;

      if (this.idleAnim) {
        this.character.play(this.idleAnim, true);
      }
    }

    this.fireTimer += deltaMS;
    const fireInterval = 1000 / this.attackRate;

    if (this.fireTimer >= fireInterval) {
      this.fireTimer -= fireInterval;
      this.onFire?.(this.container.x + 20, this.container.y - this.fireOffsetY, this.arrowDamage, this.arrowSpeed);
    }
  }

  takeDamage(amount: number): void {
    if (!this.alive) {
      return;
    }

    this.hp -= amount;
    this.triggerHurtFlash();

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;

      if (this.deathAnim) {
        this.character.play(this.deathAnim, false);
      }

      this.onDeath?.();
    } else if (this.hitAnim) {
      this.character.play(this.hitAnim, false);
      const resumeAnim = this.moving ? this.walkAnim : this.idleAnim;

      if (resumeAnim) {
        this.character.queue(resumeAnim, true, 0);
      }
    }
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

  setAttackRateMultiplier(mult: number): void {
    this.attackRateMultiplier = mult;
    this.attackRate = this.baseAttackRate * this.attackRateMultiplier;
  }

  private triggerHurtFlash(): void {
    const filter = new ColorMatrixFilter();
    filter.matrix = [
      1.5, 0, 0, 0, 0.3,
      0, 0.3, 0, 0, 0,
      0, 0, 0.3, 0, 0,
      0, 0, 0, 1, 0,
    ] as any;
    this.character.spine.filters = [filter];
    this.flashing = true;
    this.flashTimer = 150;
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
}
