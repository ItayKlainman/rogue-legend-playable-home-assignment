import { Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { Scene } from '@shared/Scene';
import type { PlayerState } from '../PlayerState';
import type { WeaponConfig } from '@shared/SpineCharacter';
import glowRaysData from 'assets/UI/GlowRays.webp';
import * as sfx from '../sfx';
import { easeOutQuad } from '@shared/utils';

const DIM_ALPHA = 0.85;

// Animation timing (ms)
const FADE_IN_MS = 200;
const WEAPON_APPEAR_DELAY = 100;
const WEAPON_APPEAR_MS = 350;
const TEXT_APPEAR_DELAY = 300;
const TEXT_APPEAR_MS = 200;
const BUTTON_APPEAR_DELAY = 400;
const BUTTON_APPEAR_MS = 200;
const FADE_OUT_MS = 150;

export interface WeaponRewardSceneConfig {
  displaySprite: string;
  weaponConfig: WeaponConfig;
  weaponId: string;
}

export class WeaponRewardScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: WeaponRewardSceneConfig;
  private state: PlayerState;
  private width: number;
  private height: number;
  private ready = false;

  private dimOverlay!: Graphics;
  private glowSprite!: Sprite;
  private weaponSprite!: Sprite;
  private weaponGlowFilter: GlowFilter | null = null;
  private weaponGlowElapsed = 0;
  private titleText!: Text;
  private button!: Container;
  private buttonBg!: Graphics;
  private buttonText!: Text;
  private btnShineMask!: Graphics;
  private btnShineStrip!: Graphics;

  // Animation state
  private animElapsed = 0;
  private fadingOut = false;
  private fadeOutElapsed = 0;
  private weaponBaseScale = 1;
  private glowBaseScale = 1;
  private btnW = 0;

  constructor(
    config: WeaponRewardSceneConfig,
    state: PlayerState,
    width: number,
    height: number,
  ) {
    this.container = new Container();
    this.config = config;
    this.state = state;
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

    // Glow rays behind weapon
    const glowTexture = await Assets.load(glowRaysData);
    this.glowSprite = new Sprite(glowTexture);
    this.glowSprite.anchor.set(0.5);
    this.glowSprite.tint = 0xffdd44;
    this.glowSprite.alpha = 0;
    this.glowSprite.scale.set(0);
    this.container.addChild(this.glowSprite);

    // Weapon sprite
    const texture = await Assets.load(this.config.displaySprite);
    this.weaponSprite = new Sprite(texture);
    this.weaponSprite.anchor.set(0.5);
    this.weaponSprite.scale.set(0);
    this.container.addChild(this.weaponSprite);

    // Weapon outline glow (e.g. blue pulsing glow on crystal hammer)
    const glowCfg = this.config.weaponConfig.glow;
    if (glowCfg) {
      const gf = new GlowFilter({
        color: glowCfg.color,
        distance: glowCfg.distance ?? 15,
        outerStrength: glowCfg.outerStrength ?? 4,
        innerStrength: 0,
        quality: glowCfg.quality ?? 1,
      });
      gf.resolution = 2;
      this.weaponSprite.filters = [gf];
      this.weaponGlowFilter = gf;
    }

    // Title text
    this.titleText = new Text({
      text: 'You got a new weapon!',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 6 },
      }),
    });
    this.titleText.anchor.set(0.5);
    this.titleText.alpha = 0;
    this.container.addChild(this.titleText);

    // Button
    this.button = new Container();
    this.buttonBg = new Graphics();
    this.button.addChild(this.buttonBg);

    this.buttonText = new Text({
      text: 'Get reward',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 4, join: 'round' },
      }),
    });
    this.buttonText.anchor.set(0.5);
    this.button.addChild(this.buttonText);

    // Shine sweep (diagonal strip masked to button shape)
    this.btnShineMask = new Graphics();
    this.btnShineStrip = new Graphics();
    this.btnShineStrip.mask = this.btnShineMask;
    this.button.addChild(this.btnShineMask);
    this.button.addChild(this.btnShineStrip);

    this.button.eventMode = 'static';
    this.button.cursor = 'pointer';
    this.button.on('pointerdown', () => {
      if (this.fadingOut) return;
      sfx.buttonClick();
      sfx.rewardReceived();
      this.state.weaponConfig = this.config.weaponConfig;
      this.state.weapon = this.config.weaponId;
      this.fadingOut = true;
      this.fadeOutElapsed = 0;
    });
    this.button.alpha = 0;
    this.container.addChild(this.button);

    this.layoutReward();
    this.animElapsed = 0;
    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);
  }

  async exit(): Promise<void> {}

  update(deltaMS: number): void {
    if (!this.ready) return;

    // Fade out on button press
    if (this.fadingOut) {
      this.fadeOutElapsed += deltaMS;
      const t = Math.min(1, this.fadeOutElapsed / FADE_OUT_MS);
      this.container.alpha = 1 - t;
      if (t >= 1) this.resolveDone();
      return;
    }

    this.animElapsed += deltaMS;

    // Phase 1: Dim overlay fade in
    if (this.animElapsed < FADE_IN_MS) {
      this.dimOverlay.alpha = (this.animElapsed / FADE_IN_MS) * DIM_ALPHA;
    } else {
      this.dimOverlay.alpha = DIM_ALPHA;
    }

    // Phase 2: Weapon + glow appear with bounce
    const weaponT = (this.animElapsed - WEAPON_APPEAR_DELAY) / WEAPON_APPEAR_MS;
    if (weaponT > 0 && weaponT <= 1) {
      const e = this.easeOutBack(weaponT);
      this.weaponSprite.scale.set(this.weaponBaseScale * e);
      this.glowSprite.scale.set(this.glowBaseScale * e);
      this.glowSprite.alpha = 0.8 * Math.min(1, weaponT * 2);
    } else if (weaponT > 1) {
      this.weaponSprite.scale.set(this.weaponBaseScale);
      this.glowSprite.alpha = 0.8;
    }

    // Pulse weapon outline glow
    if (this.weaponGlowFilter) {
      const glowCfg = this.config.weaponConfig.glow!;
      this.weaponGlowElapsed += deltaMS;
      const speed = glowCfg.pulseSpeed ?? 1200;
      const t = (Math.sin((this.weaponGlowElapsed / speed) * Math.PI * 2) + 1) / 2;
      const base = glowCfg.outerStrength ?? 4;
      this.weaponGlowFilter.outerStrength = base * (0.5 + 0.5 * t);
    }

    // Phase 3: Title text slide up + fade in
    const textT = (this.animElapsed - TEXT_APPEAR_DELAY) / TEXT_APPEAR_MS;
    if (textT > 0 && textT <= 1) {
      const e = easeOutQuad(textT);
      this.titleText.alpha = e;
      this.titleText.y = this.titleTextY + 15 * (1 - e);
    } else if (textT > 1) {
      this.titleText.alpha = 1;
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

    // Button shine sweep (loops every 2s, sweep takes 0.6s)
    const SHINE_PERIOD = 2000;
    const SHINE_DURATION = 600;
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
    this.layoutReward();
  }

  private drawDimOverlay(): void {
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000 });
  }

  // Stored layout positions for animations
  private titleTextY = 0;
  private buttonY = 0;

  private layoutReward(): void {
    const centerX = this.width / 2;
    const isLandscape = this.width > this.height;

    // Button metrics (compute first so we can budget vertical space)
    const btnFontSize = Math.max(20, Math.min(this.width, this.height) * 0.06);
    this.buttonText.style.fontSize = btnFontSize;
    this.btnW = Math.max(this.buttonText.width + 80, this.width * 0.55);
    const btnW = this.btnW;
    const btnH = btnFontSize * 2.5;
    const btnMargin = isLandscape ? 12 : 20;

    // Title text metrics
    const titleFontSize = Math.max(22, Math.min(this.width, this.height) * 0.07);
    this.titleText.style.fontSize = titleFontSize;

    // Layout order top-to-bottom: title → weapon + glow → button
    const topMargin = isLandscape ? 50 : 80;
    this.buttonY = this.height - btnMargin * 3.5 - btnH / 2;
    this.titleTextY = topMargin + titleFontSize / 2;

    // Weapon fills remaining space between title and button
    const weaponTop = this.titleTextY + titleFontSize;
    const weaponBottom = this.buttonY - btnH / 2;
    const availableWeaponH = weaponBottom - weaponTop;
    const weaponY = weaponTop + availableWeaponH / 2;

    // Weapon sprite — sized to fit available space
    const refSize = Math.min(availableWeaponH * 0.9, Math.min(this.width, this.height) * 0.55);
    const texW = this.weaponSprite.texture.width;
    const texH = this.weaponSprite.texture.height;
    this.weaponBaseScale = refSize / Math.max(texW, texH);
    this.weaponSprite.position.set(centerX, weaponY);

    // Glow rays — larger than weapon, centered behind it
    const glowSize = refSize * 2.2;
    const glowTexSize = Math.max(this.glowSprite.texture.width, this.glowSprite.texture.height);
    this.glowBaseScale = glowSize / glowTexSize;
    this.glowSprite.position.set(centerX, weaponY);

    // If animation is done, apply final scales
    if (this.animElapsed > WEAPON_APPEAR_DELAY + WEAPON_APPEAR_MS) {
      this.weaponSprite.scale.set(this.weaponBaseScale);
      this.glowSprite.scale.set(this.glowBaseScale);
    }

    // Title text
    this.titleText.position.set(centerX, this.titleTextY);

    // Button
    this.buttonBg.clear();
    this.buttonBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 4)
      .fill({ color: 0x44aa44 })
      .stroke({ color: 0x000000, width: 3 });

    // Shine sweep mask + strip
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
    this.buttonText.position.set(0, 0);
    this.button.position.set(centerX, this.buttonY);
  }

  private easeOutBack(t: number): number {
    const c = 1.4; // overshoot amount
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }

}
