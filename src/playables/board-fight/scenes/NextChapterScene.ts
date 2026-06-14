import { Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { safeInstall } from '@shared/mraidInstall';
import { easeOutQuad } from '@shared/utils';
import glowRaysData from 'assets/UI/GlowRays.webp';
import logoData from 'assets/UI/LOGO_rogue legend_.webp';

// Animation timing (ms)
const DIM_ALPHA = 0.65;
const FADE_IN_MS = 300;
const BANNER_APPEAR_DELAY = 200;
const BANNER_APPEAR_MS = 350;
const BUTTON_APPEAR_DELAY = 500;
const BUTTON_APPEAR_MS = 250;

export interface NextChapterSceneConfig {
  bannerImage: string; // webpack base64 import for end banner
  victoryText?: string; // default "VICTORY"
  countText?: string;   // default "5"
  buttonText?: string;  // default "Next Chapter"
  buttonColor?: number; // default 0x22aa44 (green)
}

export class NextChapterScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: NextChapterSceneConfig;
  private width: number;
  private height: number;
  private ready = false;

  private dimOverlay!: Graphics;
  private hitArea!: Graphics;
  private glowSprite!: Sprite;
  private bannerSprite!: Sprite;
  private logoSprite!: Sprite;
  private victoryText!: Text;
  private subtitleText!: Text;
  private countText!: Text;
  private button!: Container;
  private buttonBg!: Graphics;
  private buttonText!: Text;
  private btnShineMask!: Graphics;
  private btnShineStrip!: Graphics;

  // Animation state
  private animElapsed = 0;
  private bannerBaseScale = 1;
  private glowBaseScale = 1;
  private btnW = 0;

  // Stored layout positions for animations
  private bannerY = 0;
  private buttonY = 0;

  constructor(
    config: NextChapterSceneConfig,
    width: number,
    height: number,
  ) {
    this.container = new Container();
    this.config = config;
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

    // Full-screen tap target (AppLovin requirement)
    this.hitArea = new Graphics();
    this.hitArea.eventMode = 'static';
    this.hitArea.cursor = 'pointer';
    this.hitArea.on('pointerdown', () => { safeInstall(); });
    this.drawHitArea();
    this.container.addChild(this.hitArea);

    // Glow rays behind banner top
    const glowTex = await Assets.load(glowRaysData);
    this.glowSprite = new Sprite(glowTex);
    this.glowSprite.anchor.set(0.5);
    this.glowSprite.tint = 0xffdd44;
    this.glowSprite.alpha = 0;
    this.glowSprite.scale.set(0);
    this.container.addChild(this.glowSprite);

    // Banner image
    const bannerTex = await Assets.load(this.config.bannerImage);
    this.bannerSprite = new Sprite(bannerTex);
    this.bannerSprite.anchor.set(0.5);
    this.bannerSprite.scale.set(0);
    this.bannerSprite.alpha = 0;
    this.container.addChild(this.bannerSprite);

    // Logo — shown instead of banner/glow/texts in landscape
    const logoTex = await Assets.load(logoData);
    this.logoSprite = new Sprite(logoTex);
    this.logoSprite.anchor.set(0.5);
    this.logoSprite.alpha = 0;
    this.logoSprite.eventMode = 'none';
    this.container.addChild(this.logoSprite);

    // Victory text
    this.victoryText = new Text({
      text: this.config.victoryText ?? 'VICTORY',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 6 },
      }),
    });
    this.victoryText.anchor.set(0.5);
    this.victoryText.alpha = 0;
    this.container.addChild(this.victoryText);

    // Subtitle text
    this.subtitleText = new Text({
      text: 'Rolls Survived',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
      }),
    });
    this.subtitleText.anchor.set(0.5);
    this.subtitleText.alpha = 0;
    this.container.addChild(this.subtitleText);

    // Count text
    this.countText = new Text({
      text: (this.config.countText ?? '5') + ' Rolls',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 6 },
      }),
    });
    this.countText.anchor.set(0.5);
    this.countText.alpha = 0;
    this.container.addChild(this.countText);

    // "Next Chapter" button
    this.button = new Container();
    this.buttonBg = new Graphics();
    this.button.addChild(this.buttonBg);

    this.buttonText = new Text({
      text: this.config.buttonText ?? 'Next Chapter',
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

    this.button.eventMode = 'none';
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

    this.animElapsed += deltaMS;

    // Phase 1: Dim overlay fade in
    if (this.animElapsed < FADE_IN_MS) {
      this.dimOverlay.alpha = (this.animElapsed / FADE_IN_MS) * DIM_ALPHA;
    } else {
      this.dimOverlay.alpha = DIM_ALPHA;
    }

    // Phase 2: Banner + glow appear with bounce (portrait) / logo fade (landscape)
    const isLandscape = this.width > this.height;
    const bannerT = (this.animElapsed - BANNER_APPEAR_DELAY) / BANNER_APPEAR_MS;
    if (isLandscape) {
      // Logo fade in
      this.logoSprite.alpha = Math.min(1, Math.max(0, bannerT));
    } else {
      if (bannerT > 0 && bannerT <= 1) {
        const e = this.easeOutBack(bannerT);
        const fade = Math.min(1, bannerT * 2);
        this.bannerSprite.scale.set(this.bannerBaseScale * e);
        this.bannerSprite.alpha = fade;
        this.glowSprite.scale.set(this.glowBaseScale * e);
        this.glowSprite.alpha = 0.8 * fade;
        this.victoryText.scale.set(e);
        this.victoryText.alpha = fade;
        this.subtitleText.scale.set(e);
        this.subtitleText.alpha = fade;
        this.countText.scale.set(e);
        this.countText.alpha = fade;
      } else if (bannerT > 1) {
        this.bannerSprite.scale.set(this.bannerBaseScale);
        this.bannerSprite.alpha = 1;
        this.glowSprite.alpha = 0.8;
        this.victoryText.scale.set(1);
        this.victoryText.alpha = 1;
        this.subtitleText.scale.set(1);
        this.subtitleText.alpha = 1;
        this.countText.scale.set(1);
        this.countText.alpha = 1;
      }
      // Continuous glow rotation
      this.glowSprite.rotation += deltaMS * 0.00015;
    }

    // Phase 3: Button slide up + fade in
    const btnT = (this.animElapsed - BUTTON_APPEAR_DELAY) / BUTTON_APPEAR_MS;
    if (btnT > 0 && btnT <= 1) {
      const e = easeOutQuad(btnT);
      this.button.alpha = e;
      this.button.y = this.buttonY + 20 * (1 - e);
    } else if (btnT > 1) {
      this.button.alpha = 1;
    }

    // Button shine sweep (loops every 2s, sweep takes 0.6s)
    const SHINE_PERIOD = 2000;
    const SHINE_DURATION = 600;
    const phase = (this.animElapsed % SHINE_PERIOD) / SHINE_DURATION;
    if (phase > 1) {
      this.btnShineStrip.visible = false;
    } else {
      this.btnShineStrip.visible = true;
      this.btnShineStrip.x = -this.btnW * 0.7 + phase * this.btnW * 1.6;
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
    this.drawHitArea();
    this.layoutScene();
  }

  private drawDimOverlay(): void {
    const isLandscape = this.width > this.height;
    this.dimOverlay.clear();
    if (isLandscape) {
      // Solid dark background in landscape (no banner)
      this.dimOverlay.rect(0, 0, this.width, this.height).fill({ color: 0x111111 });
      this.dimOverlay.alpha = 1;
    } else {
      this.dimOverlay.rect(0, 0, this.width, this.height).fill({ color: 0x000000 });
    }
  }

  private drawHitArea(): void {
    this.hitArea.clear();
    this.hitArea.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: 0.001 });
  }

  private layoutScene(): void {
    const centerX = this.width / 2;
    const isLandscape = this.width > this.height;

    // Button metrics
    const btnFontSize = Math.max(20, Math.min(this.width, this.height) * 0.06);
    this.buttonText.style.fontSize = btnFontSize;
    this.btnW = Math.max(this.buttonText.width + 80, this.width * 0.5);
    const btnW = this.btnW;
    const btnH = btnFontSize * 2.8;
    this.buttonY = this.height * (isLandscape ? 0.88 : 0.78);

    // Portrait: banner + glow + texts
    this.bannerSprite.visible = !isLandscape;
    this.glowSprite.visible = !isLandscape;
    this.victoryText.visible = !isLandscape;
    this.subtitleText.visible = !isLandscape;
    this.countText.visible = !isLandscape;

    // Landscape: logo centered above button
    this.logoSprite.visible = isLandscape;

    if (isLandscape) {
      const logoTex = this.logoSprite.texture;
      const maxW = this.width * 0.7;
      const maxH = this.height * 0.65;
      const logoScale = Math.min(maxW / logoTex.width, maxH / logoTex.height);
      this.logoSprite.scale.set(logoScale);
      this.logoSprite.position.set(centerX, this.height * 0.38);
    } else {
      // Banner — centered in upper portion
      const bannerTex = this.bannerSprite.texture;
      const maxBannerW = this.width * 1.1;
      const maxBannerH = (this.buttonY - btnH) * 0.95;
      this.bannerBaseScale = Math.min(maxBannerW / bannerTex.width, maxBannerH / bannerTex.height);
      this.bannerY = this.height * 0.38;
      this.bannerSprite.position.set(centerX, this.bannerY);

      // Glow rays — scaled relative to banner
      const bannerW = bannerTex.width * this.bannerBaseScale;
      const bannerH = bannerTex.height * this.bannerBaseScale;
      const glowY = this.bannerY - bannerH * 0.1;
      const glowSize = Math.max(bannerW, bannerH) * 1.5;
      const glowTexSize = Math.max(this.glowSprite.texture.width, this.glowSprite.texture.height);
      this.glowBaseScale = glowSize / glowTexSize;
      this.glowSprite.position.set(centerX, glowY);

      // Apply scales if animation is done
      if (this.animElapsed > BANNER_APPEAR_DELAY + BANNER_APPEAR_MS) {
        this.bannerSprite.scale.set(this.bannerBaseScale);
        this.glowSprite.scale.set(this.glowBaseScale);
      }

      // Texts — sized proportional to rendered banner height
      const victoryFontSize = Math.max(10, bannerH * 0.06);
      const subtitleFontSize = Math.max(8, bannerH * 0.04);
      const countFontSize = Math.max(12, bannerH * 0.1);

      this.victoryText.style.fontSize = victoryFontSize;
      this.subtitleText.style.fontSize = subtitleFontSize;
      this.countText.style.fontSize = countFontSize;

      const gap = bannerH * 0.02;
      const victoryY = this.bannerY - bannerH * 0.08;
      const subtitleY = victoryY + victoryFontSize * 0.5 + subtitleFontSize * 0.5 + gap * 3;
      const countY = subtitleY + subtitleFontSize * 0.5 + countFontSize * 0.5 + gap * 3;

      this.victoryText.position.set(centerX, victoryY);
      this.subtitleText.position.set(centerX, subtitleY);
      this.countText.position.set(centerX, countY);
    }

    // Button
    this.buttonBg.clear();
    this.buttonBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 4)
      .fill({ color: this.config.buttonColor ?? 0x22aa44 })
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
    const c = 1.4;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
}
