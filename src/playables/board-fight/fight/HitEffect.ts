import { ColorMatrixFilter, Container, Graphics, Ticker } from 'pixi.js';
import type { FightActor } from './FightActor';
import { SpriteEffect } from '@shared/SpriteEffect';
import hitVfxSheet from 'assets/VFX/Hit_1_normal_SpriteSheet.webp';

/** ColorMatrix that outputs pure white (R=G=B=1) while preserving original alpha. */
const WHITE_MATRIX: number[] = [
  0, 0, 0, 0, 1,
  0, 0, 0, 0, 1,
  0, 0, 0, 0, 1,
  0, 0, 0, 1, 0,
];

const HIT_VFX_SCALE = 1.0;

// Module-scope memoized loader — every fight constructs a new HitEffect, so
// without this each fight re-allocates the spritesheet's frame Textures.
let hitVfxEffectP: Promise<SpriteEffect> | null = null;
const getHitVfxEffect = () => hitVfxEffectP ??=
  SpriteEffect.load({ spriteData: hitVfxSheet, columns: 4, rows: 2, totalFrames: 8, fps: 30 });

export class HitEffect {
  private battleArea: Container;
  private ticker: Ticker;
  private darkOverlay: Graphics | null = null;
  private whiteFilter: ColorMatrixFilter;
  private hitVfx: SpriteEffect | null = null;

  constructor(battleArea: Container, ticker: Ticker) {
    this.battleArea = battleArea;
    this.ticker = ticker;
    this.whiteFilter = new ColorMatrixFilter();
    this.whiteFilter.matrix = WHITE_MATRIX as any;
  }

  /** Preload hit VFX spritesheet. Call during fight init. */
  async preload(): Promise<void> {
    this.hitVfx = await getHitVfxEffect();
  }

  /** White flash + hit VFX on target — matches Unity's 150 ms shader flash. */
  flash(target: FightActor, durationMs = 150): void {
    const spine = target.character.spine;

    // White flash
    spine.filters = [this.whiteFilter];
    let elapsed = 0;
    const handler = (t: Ticker) => {
      elapsed += t.deltaMS;
      if (elapsed >= durationMs) {
        spine.filters = [];
        this.ticker.remove(handler);
      }
    };
    this.ticker.add(handler);

    // Hit VFX at target center
    if (this.hitVfx) {
      this.hitVfx.play(this.battleArea, spine.x, spine.y - 60, {
        scale: HIT_VFX_SCALE,
      });
    }
  }

  /** Screen shake — shifts battleArea position briefly. */
  shake(px = 3, durationMs = 200): void {
    const origX = this.battleArea.x;
    const origY = this.battleArea.y;
    let elapsed = 0;
    const handler = (t: Ticker) => {
      elapsed += t.deltaMS;
      if (elapsed >= durationMs) {
        this.battleArea.x = origX;
        this.battleArea.y = origY;
        this.ticker.remove(handler);
        return;
      }
      const decay = 1 - elapsed / durationMs;
      this.battleArea.x = origX + (Math.random() - 0.5) * px * 2 * decay;
      this.battleArea.y = origY + (Math.random() - 0.5) * px * 2 * decay;
    };
    this.ticker.add(handler);
  }

  /** Fade in dark overlay behind characters but in front of BG. */
  async fadeInDarkening(durationMs: number): Promise<void> {
    if (!this.darkOverlay) {
      this.darkOverlay = new Graphics();
      // Index 1 = right after the BG sprite (index 0), before character sprites
      this.battleArea.addChildAt(this.darkOverlay, 1);
    }

    this.darkOverlay.clear();
    this.darkOverlay.rect(-2000, -2000, 6000, 6000).fill({ color: 0x000000 });
    this.darkOverlay.alpha = 0;

    await this.tweenAlpha(this.darkOverlay, 0, 0.5, durationMs);
  }

  /** Fade out dark overlay. */
  async fadeOutDarkening(durationMs: number): Promise<void> {
    if (!this.darkOverlay) return;
    await this.tweenAlpha(this.darkOverlay, this.darkOverlay.alpha, 0, durationMs);
    this.darkOverlay.destroy();
    this.darkOverlay = null;
  }

  private tweenAlpha(target: { alpha: number }, from: number, to: number, durationMs: number): Promise<void> {
    return new Promise(resolve => {
      let elapsed = 0;
      const handler = (t: Ticker) => {
        elapsed += t.deltaMS;
        const p = Math.min(1, elapsed / durationMs);
        target.alpha = from + (to - from) * p;
        if (p >= 1) {
          this.ticker.remove(handler);
          resolve();
        }
      };
      this.ticker.add(handler);
    });
  }
}
