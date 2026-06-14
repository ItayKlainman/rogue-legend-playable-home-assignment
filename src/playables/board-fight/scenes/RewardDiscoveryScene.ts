import { Assets, Container, Graphics, NineSliceSprite, Sprite, Text, TextStyle, Ticker } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { Scene } from '@shared/Scene';
import type { PlayerState } from '../PlayerState';
import type { WeaponConfig, SpineAssets } from '@shared/SpineCharacter';
import { SpineCharacter } from '@shared/SpineCharacter';
import type { HeroConfig } from '../catalog/heroes/HeroConfig';
import { heroBundle } from '../catalog/heroes';
import glowRaysData from 'assets/UI/GlowRays.webp';
// Get-button component (canonical name from components-cli `use`).
import buttonConvexRectangle01Green from 'assets/UI/Button_Convex_Rectangle_01_Green.webp';
import { makeNineSlice, type UnityBorder } from '@shared/nineSlice';
import * as sfx from '../sfx';
import { easeOutQuad, easeInOutQuad } from '@shared/utils';

export interface RewardDiscoverySceneConfig {
  mode: 'weapon' | 'hero';
  background: string;
  weaponDisplaySprite?: string;
  weaponConfig?: WeaponConfig;
  weaponId?: string;
  heroConfig?: HeroConfig;
  heroBundle?: SpineAssets;
}

// Battle area layout (matches FightScene)
const BATTLE_AREA_RATIO = 0.55;
const BATTLE_SKEW = 0.025;
const REF_SHORT_SIDE = 390;
function viewportScale(w: number, h: number): number {
  const shortSide = Math.min(w, h);
  return shortSide >= REF_SHORT_SIDE ? 1 : shortSide / REF_SHORT_SIDE;
}

// Layout ratios (fraction of battle area width/height)
const HERO_X_RATIO = 0.27;
const HERO_Y_RATIO = 0.75;
const REWARD_X_RATIO = 0.72;
const REWARD_Y_RATIO = 0.45;

// Reward float animation
const BOB_AMPLITUDE = 8;
const BOB_PERIOD = 1500;

// Animation timing (ms)
const FADE_IN_MS = 200;
const REWARD_APPEAR_DELAY = 100;
const REWARD_APPEAR_MS = 350;
const TEXT_APPEAR_DELAY = 300;
const TEXT_APPEAR_MS = 200;
const BUTTON_APPEAR_DELAY = 400;
const BUTTON_APPEAR_MS = 200;

// Post-tap sequence
const BUTTON_FADE_MS = 150;
const WALK_MS = 400;
const FLASH_MS = 200;
const REWARD_ANIM_NAMES = ['Rage_Attack_Melee', 'Rage_Attack', 'Ultimate_Attack', 'Regular_Attack_Melee', 'Basic_Attack', 'Attack'];
const FADE_OUT_MS = 150;

// Shine sweep
const SHINE_PERIOD = 2000;
const SHINE_DURATION = 600;

export class RewardDiscoveryScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: RewardDiscoverySceneConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private ready = false;

  // Display objects
  private dimOverlay!: Graphics;
  private battleArea!: Container;
  private battleMask!: Graphics;
  private bgSprite!: Sprite;
  private hero!: SpineCharacter;
  private rewardSprite?: Sprite;
  private rewardGlowFilter: GlowFilter | null = null;
  private rewardGlowElapsed = 0;
  private rewardHero?: SpineCharacter;
  private glowSprite!: Sprite;
  private mysteryText!: Text;
  private button!: Container;
  private btnBg!: NineSliceSprite;
  private buttonText!: Text;
  private btnShineMask!: Graphics;
  private btnShineStrip!: Graphics;

  // Animation state
  private animElapsed = 0;
  private activated = false;
  private rewardBaseScale = 1;
  private glowBaseScale = 1;
  private btnW = 0;
  private textY = 0;
  private buttonY = 0;
  private rewardBaseY = 0;

  constructor(
    config: RewardDiscoverySceneConfig,
    state: PlayerState,
    ticker: Ticker,
    width: number,
    height: number,
  ) {
    this.container = new Container();
    this.config = config;
    this.state = state;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    // Dim overlay
    this.dimOverlay = new Graphics();
    this.dimOverlay.alpha = 0;
    this.drawDimOverlay();
    this.container.addChild(this.dimOverlay);

    // Battle area container with angled bottom mask
    this.battleArea = new Container();
    this.container.addChild(this.battleArea);
    this.battleMask = new Graphics();
    this.drawBattleMask();
    this.container.addChild(this.battleMask);
    this.battleArea.mask = this.battleMask;

    // Background
    const bgTexture = await Assets.load(this.config.background);
    this.bgSprite = new Sprite(bgTexture);
    this.bgSprite.anchor.set(0.5, 0.5);
    this.battleArea.addChild(this.bgSprite);

    // Hero on left side
    this.hero = await SpineCharacter.create(
      'discoveryHero', heroBundle, this.ticker,
      { skin: this.state.heroSkin, animation: 'Idle' },
    );
    this.hero.facingLeft = false;
    this.battleArea.addChild(this.hero.spine);

    // Equip current weapon if any
    if (this.state.weaponConfig) {
      await this.hero.equipWeapon(this.state.weaponConfig);
    }

    // Pre-load weapon texture for instant equip during flash
    if (this.config.mode === 'weapon' && this.config.weaponConfig) {
      Assets.load(this.config.weaponConfig.spriteData).catch(() => {});
    }

    // Glow rays behind reward
    const glowTexture = await Assets.load(glowRaysData);
    this.glowSprite = new Sprite(glowTexture);
    this.glowSprite.anchor.set(0.5);
    this.glowSprite.tint = 0xffdd44;
    this.glowSprite.alpha = 0;
    this.glowSprite.scale.set(0);
    this.battleArea.addChild(this.glowSprite);

    // Reward display
    if (this.config.mode === 'weapon' && this.config.weaponDisplaySprite) {
      const texture = await Assets.load(this.config.weaponDisplaySprite);
      this.rewardSprite = new Sprite(texture);
      this.rewardSprite.anchor.set(0.5);
      this.rewardSprite.scale.set(0);
      this.battleArea.addChild(this.rewardSprite);
      const glowCfg = this.config.weaponConfig?.glow;
      if (glowCfg) {
        const gf = new GlowFilter({
          color: glowCfg.color,
          distance: glowCfg.distance ?? 15,
          outerStrength: glowCfg.outerStrength ?? 4,
          innerStrength: 0,
          quality: glowCfg.quality ?? 1,
        });
        gf.resolution = 2;
        this.rewardSprite.filters = [gf];
        this.rewardGlowFilter = gf;
      }
    } else if (this.config.mode === 'hero' && this.config.heroBundle && this.config.heroConfig) {
      this.rewardHero = await SpineCharacter.create(
        'discoveryReward', this.config.heroBundle, this.ticker,
        { skin: this.config.heroConfig.skinName, animation: 'Idle' },
      );
      this.rewardHero.facingLeft = true;
      this.rewardHero.spine.visible = false;
      this.battleArea.addChild(this.rewardHero.spine);
    }

    // Mystery text (below battle area)
    this.mysteryText = new Text({
      text: 'You have found a mysterious reward, what is it?',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: '900',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 6 },
        wordWrap: true,
        wordWrapWidth: this.width * 0.85,
        align: 'center',
      }),
    });
    this.mysteryText.anchor.set(0.5);
    this.mysteryText.alpha = 0;
    this.container.addChild(this.mysteryText);

    // Button — convex green component button (border + pocket baked in).
    const btnBorderGeom: UnityBorder = { left: 20, bottom: 29, right: 20, top: 19 };
    const greenTex = await Assets.load(buttonConvexRectangle01Green);
    this.button = new Container();
    this.btnBg = makeNineSlice({ texture: greenTex, border: btnBorderGeom, width: 10, height: 10 });
    this.button.addChild(this.btnBg);

    this.buttonText = new Text({
      text: 'Get',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 4, join: 'round' },
      }),
    });
    this.buttonText.anchor.set(0.5);
    this.button.addChild(this.buttonText);

    // Shine sweep
    this.btnShineMask = new Graphics();
    this.btnShineStrip = new Graphics();
    this.btnShineStrip.mask = this.btnShineMask;
    this.button.addChild(this.btnShineMask);
    this.button.addChild(this.btnShineStrip);

    this.button.eventMode = 'static';
    this.button.cursor = 'pointer';
    this.button.on('pointerdown', () => this.onGetPressed());
    this.button.alpha = 0;
    this.container.addChild(this.button);

    this.layoutScene();
    this.animElapsed = 0;
    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);
  }

  async exit(): Promise<void> {}

  update(deltaMS: number): void {
    if (!this.ready) return;
    if (this.activated) {
      // Post-tap animation is handled by the async promise chain
      // Just keep glow rotating
      this.glowSprite.rotation += deltaMS * 0.00015;
      return;
    }

    this.hero.updateWeaponGlow(deltaMS);
    if (this.rewardGlowFilter && this.config.weaponConfig?.glow) {
      this.rewardGlowElapsed += deltaMS;
      const speed = this.config.weaponConfig.glow.pulseSpeed ?? 1200;
      const t = (Math.sin((this.rewardGlowElapsed / speed) * Math.PI * 2) + 1) / 2;
      const base = this.config.weaponConfig.glow.outerStrength ?? 4;
      this.rewardGlowFilter.outerStrength = base * (0.5 + 0.5 * t);
    }
    this.animElapsed += deltaMS;

    // Phase 1: Dim overlay fade in
    if (this.animElapsed < FADE_IN_MS) {
      this.dimOverlay.alpha = (this.animElapsed / FADE_IN_MS) * 0.85;
    } else {
      this.dimOverlay.alpha = 0.85;
    }

    // Phase 2: Reward + glow appear with bounce
    const rewardT = (this.animElapsed - REWARD_APPEAR_DELAY) / REWARD_APPEAR_MS;
    if (rewardT > 0 && rewardT <= 1) {
      const e = this.easeOutBack(rewardT);
      this.setRewardScale(this.rewardBaseScale * e);
      this.glowSprite.scale.set(this.glowBaseScale * e);
      this.glowSprite.alpha = 0.8 * Math.min(1, rewardT * 2);
    } else if (rewardT > 1) {
      this.setRewardScale(this.rewardBaseScale);
      this.glowSprite.alpha = 0.8;
    }

    // Phase 3: Text slide up + fade in
    const textT = (this.animElapsed - TEXT_APPEAR_DELAY) / TEXT_APPEAR_MS;
    if (textT > 0 && textT <= 1) {
      const e = easeOutQuad(textT);
      this.mysteryText.alpha = e;
      this.mysteryText.y = this.textY + 15 * (1 - e);
    } else if (textT > 1) {
      this.mysteryText.alpha = 1;
    }

    // Phase 4: Button slide up + fade in
    const btnT = (this.animElapsed - BUTTON_APPEAR_DELAY) / BUTTON_APPEAR_MS;
    if (btnT > 0 && btnT <= 1) {
      const e = easeOutQuad(btnT);
      this.button.alpha = e;
      this.button.y = this.buttonY + 15 * (1 - e);
    } else if (btnT > 1) {
      this.button.alpha = 1;
    }

    // Continuous glow rotation
    this.glowSprite.rotation += deltaMS * 0.00015;

    // Reward sine bob
    const bobOffset = BOB_AMPLITUDE * Math.sin(this.animElapsed * (2 * Math.PI / BOB_PERIOD));
    this.setRewardY(this.rewardBaseY + bobOffset);

    // Button shine sweep
    const phase = (this.animElapsed % SHINE_PERIOD) / SHINE_DURATION;
    if (phase > 1) {
      this.btnShineStrip.visible = false;
    } else {
      this.btnShineStrip.visible = true;
      this.btnShineStrip.x = -this.btnW * 0.3 + phase * this.btnW * 1.6;
    }
  }

  pause(): void {
    this.container.interactiveChildren = false;
  }

  resume(): void {
    this.container.interactiveChildren = true;
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) return;
    this.drawDimOverlay();
    this.drawBattleMask();
    this.layoutScene();
  }

  // ── Layout helpers ──

  private drawDimOverlay(): void {
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000 });
  }

  private drawBattleMask(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    const skew = this.height * BATTLE_SKEW;
    this.battleMask.clear();
    this.battleMask.poly([
      0, 0, this.width, 0,
      this.width, battleH - skew,
      0, battleH + skew,
    ]).fill({ color: 0xffffff });
  }

  private layoutScene(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    const vScale = viewportScale(this.width, this.height);

    // Battle area scaling (matches FightScene)
    this.battleArea.scale.set(vScale);
    this.battleArea.pivot.set(this.width / 2, battleH / 2);
    this.battleArea.position.set(this.width / 2, battleH / 2);

    // Background
    this.bgSprite.scale.set(0.34);
    this.bgSprite.x = this.width / 2;
    this.bgSprite.y = battleH / 2;

    // Hero position (left side, standing on ground)
    const heroScale = 0.12;
    this.hero.spine.scale.set(heroScale);
    this.hero.spine.x = this.width * HERO_X_RATIO;
    this.hero.spine.y = battleH * HERO_Y_RATIO;

    // Reward position (right side, floating)
    const rewardX = this.width * REWARD_X_RATIO;
    this.rewardBaseY = battleH * REWARD_Y_RATIO;

    if (this.rewardSprite) {
      const texW = this.rewardSprite.texture.width;
      const texH = this.rewardSprite.texture.height;
      const refSize = Math.min(battleH * 0.35, this.width * 0.25);
      this.rewardBaseScale = refSize / Math.max(texW, texH);
      this.rewardSprite.x = rewardX;
      this.rewardSprite.y = this.rewardBaseY;
      if (this.animElapsed > REWARD_APPEAR_DELAY + REWARD_APPEAR_MS) {
        this.rewardSprite.scale.set(this.rewardBaseScale);
      }
    }

    if (this.rewardHero) {
      const skelData = this.rewardHero.spine.skeleton.data;
      const refSize = Math.min(battleH * 0.5, this.width * 0.3);
      this.rewardBaseScale = refSize / Math.max(skelData.width, skelData.height);
      this.rewardHero.spine.x = rewardX;
      this.rewardHero.spine.y = this.rewardBaseY + battleH * 0.2;
      if (this.animElapsed > REWARD_APPEAR_DELAY + REWARD_APPEAR_MS) {
        this.rewardHero.spine.scale.set(this.rewardBaseScale);
      }
    }

    // Glow behind reward
    const glowRefSize = (this.rewardSprite ? Math.min(battleH * 0.35, this.width * 0.25) : Math.min(battleH * 0.5, this.width * 0.3)) * 2.2;
    const glowTexSize = Math.max(this.glowSprite.texture.width, this.glowSprite.texture.height);
    this.glowBaseScale = glowRefSize / glowTexSize;
    this.glowSprite.x = rewardX;
    this.glowSprite.y = this.rewardBaseY;
    if (this.animElapsed > REWARD_APPEAR_DELAY + REWARD_APPEAR_MS) {
      this.glowSprite.scale.set(this.glowBaseScale);
    }

    // Text and button below battle area
    const isLandscape = this.width > this.height;
    const belowBattle = battleH + this.height * BATTLE_SKEW;
    const bottomArea = this.height - belowBattle;

    const btnFontSize = Math.max(20, Math.min(this.width, this.height) * 0.06);
    this.buttonText.style.fontSize = btnFontSize;
    this.btnW = Math.max(this.buttonText.width + 80, this.width * 0.55);
    const btnW = this.btnW;
    const btnH = btnFontSize * 2.5;

    const titleFontSize = Math.max(22, Math.min(this.width, this.height) * 0.055);
    this.mysteryText.style.fontSize = titleFontSize;
    (this.mysteryText.style as TextStyle).stroke = { color: 0x222222, width: Math.max(3, titleFontSize * 0.18) };
    this.mysteryText.style.wordWrapWidth = this.width * 0.85;

    // Center text and button in bottom area
    const btnMargin = isLandscape ? 12 : 20;
    this.buttonY = this.height - btnMargin * 3.5 - btnH / 2;
    this.textY = belowBattle + (this.buttonY - btnH / 2 - belowBattle) / 2;

    this.mysteryText.position.set(this.width / 2, this.textY);

    // Button — size the convex green 9-slice; border + pocket are baked into the art.
    this.btnBg.width = btnW;
    this.btnBg.height = btnH;
    this.btnBg.position.set(-btnW / 2, -btnH / 2);

    this.btnShineMask.clear();
    this.btnShineMask.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 4)
      .fill({ color: 0xffffff });
    const stripW = btnW * 0.2;
    this.btnShineStrip.clear();
    this.btnShineStrip.poly([
      0, -btnH / 2,
      stripW, -btnH / 2,
      stripW - btnH * 0.4, btnH / 2,
      -btnH * 0.4, btnH / 2,
    ]).fill({ color: 0xffffff, alpha: 0.25 });
    // Nudge label up slightly to sit on the convex face (small bottom lip).
    this.buttonText.position.set(0, -btnH * 0.04);
    this.button.position.set(this.width / 2, this.buttonY);
  }

  // ── Reward helpers ──

  private setRewardScale(s: number): void {
    if (this.rewardSprite) {
      this.rewardSprite.scale.set(s);
    }
    if (this.rewardHero) {
      this.rewardHero.spine.visible = true;
      // facingLeft = true means scale.x is negative
      const sign = this.rewardHero.facingLeft ? -1 : 1;
      this.rewardHero.spine.scale.set(sign * s, s);
    }
  }

  private setRewardY(y: number): void {
    if (this.rewardSprite) {
      this.rewardSprite.y = y;
    }
    if (this.rewardHero) {
      const battleH = this.height * BATTLE_AREA_RATIO;
      this.rewardHero.spine.y = y + battleH * 0.2;
    }
    this.glowSprite.y = y;
  }

  private playRewardAnim(): void {
    const skeleton = this.hero.spine.skeleton;
    for (const name of REWARD_ANIM_NAMES) {
      if (skeleton.data.findAnimation(name)) {
        this.hero.play(name, false);
        return;
      }
    }
    this.hero.play('Idle', true);
  }

  // ── Post-tap sequence ──

  private async onGetPressed(): Promise<void> {
    if (this.activated) return;
    this.activated = true;
    this.button.eventMode = 'none';
    sfx.buttonClick();

    // 1. Fade out button and text
    await this.tween(BUTTON_FADE_MS, (t) => {
      this.button.alpha = 1 - t;
      this.mysteryText.alpha = 1 - t;
    });

    // 2. Hero walks to reward
    this.hero.play('Run', true);
    const battleH = this.height * BATTLE_AREA_RATIO;
    const startX = this.width * HERO_X_RATIO;
    const targetX = this.width * REWARD_X_RATIO - this.width * 0.05;
    await this.tween(WALK_MS, (t) => {
      const e = easeInOutQuad(t);
      this.hero.spine.x = startX + (targetX - startX) * e;
    });

    // 3. Flash + equip
    const flash = new Graphics();
    flash.rect(0, 0, this.width, battleH).fill({ color: 0xffffff });
    flash.alpha = 0;
    this.battleArea.addChild(flash);

    // Hide reward display during flash
    if (this.rewardSprite) {
      this.rewardSprite.visible = false;
    }
    if (this.rewardHero) {
      this.rewardHero.spine.visible = false;
    }
    this.glowSprite.visible = false;

    // Equip during flash peak
    if (this.config.mode === 'weapon' && this.config.weaponConfig) {
      this.state.weaponConfig = this.config.weaponConfig;
      this.state.weapon = this.config.weaponId ?? '';
      await this.hero.equipWeapon(this.config.weaponConfig);
    } else if (this.config.mode === 'hero' && this.config.heroConfig) {
      this.state.heroSkin = this.config.heroConfig.skinName;
      // Destroy old hero and create fresh one with new skin
      const oldX = this.hero.spine.x;
      const oldY = this.hero.spine.y;
      const oldScaleX = this.hero.spine.scale.x;
      const oldScaleY = this.hero.spine.scale.y;
      this.hero.unequipWeapon();
      this.battleArea.removeChild(this.hero.spine);
      this.hero.spine.destroy();
      this.hero = await SpineCharacter.create(
        'discoveryHero', heroBundle, this.ticker,
        { skin: this.config.heroConfig.skinName, animation: 'Idle' },
      );
      this.hero.facingLeft = false;
      this.hero.spine.scale.set(oldScaleX, oldScaleY);
      this.hero.spine.x = oldX;
      this.hero.spine.y = oldY;
      this.battleArea.addChild(this.hero.spine);
      if (this.state.weaponConfig) {
        await this.hero.equipWeapon(this.state.weaponConfig);
      }
    }

    sfx.rewardReceived();

    // 4. Hero celebration — start the rage anim at the same time as the flash
    // so the wind-up plays under the flash cover instead of after it.
    this.playRewardAnim();

    await this.tween(FLASH_MS, (t) => {
      // Triangle envelope: ramp up first half, ramp down second half
      flash.alpha = t < 0.5 ? t * 2 * 0.8 : (1 - t) * 2 * 0.8;
    });
    this.battleArea.removeChild(flash);
    flash.destroy();

    await this.delay(400);

    // 5. Fade out
    await this.tween(FADE_OUT_MS, (t) => {
      this.container.alpha = 1 - t;
    });

    this.ready = false;
    this.resolveDone();
  }

  // ── Ticker-based tween utility ──

  private tween(durationMs: number, apply: (t: number) => void): Promise<void> {
    return new Promise(resolve => {
      let elapsed = 0;
      const tick = (dt: { deltaMS: number }) => {
        elapsed += dt.deltaMS;
        const t = Math.min(elapsed / durationMs, 1);
        apply(t);
        if (t >= 1) {
          this.ticker.remove(tick);
          resolve();
        }
      };
      this.ticker.add(tick);
    });
  }

  private delay(ms: number): Promise<void> {
    return this.tween(ms, () => {});
  }

  private easeOutBack(t: number): number {
    const c = 1.4;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
}
