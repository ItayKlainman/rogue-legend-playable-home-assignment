import { Assets, Container, Graphics, Sprite, Text, TextStyle, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { safeInstall } from '@shared/mraidInstall';
import { alTrack } from '@shared/alAnalytics';
import { easeOutQuad } from '@shared/utils';
import { SpineCharacter } from '@shared/SpineCharacter';
import { sfx } from '../sfx';

import { heroBundle } from '../catalog/hero';
import glowRaysData from 'assets/UI/GlowRays.webp';

const FADE_IN_MS = 300;
const BUTTON_APPEAR_DELAY = 400;
const BUTTON_APPEAR_MS = 250;
const FLASH_MS = 250;
const HERO_POP_MS = 350;

export interface GameEndSceneConfig {
  displayImage: string;
  logoImage?: string;
}

export class GameEndScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: GameEndSceneConfig;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private ready = false;

  private hitArea!: Graphics;
  private bgSprite!: Sprite;
  private glowSprite!: Sprite;
  private hero!: SpineCharacter;
  private logoSprite: Sprite | null = null;
  private button!: Container;
  private buttonBg!: Graphics;
  private buttonText!: Text;
  private btnShineMask!: Graphics;
  private btnShineStrip!: Graphics;
  private flash!: Graphics;

  private animElapsed = 0;
  private btnW = 0;

  constructor(
    config: GameEndSceneConfig,
    ticker: Ticker,
    width: number,
    height: number,
  ) {
    this.container = new Container();
    this.config = config;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    this.hitArea = new Graphics();
    this.hitArea.eventMode = 'static';
    this.hitArea.cursor = 'pointer';
    this.hitArea.on('pointerdown', () => {
      safeInstall();
    });
    this.drawHitArea();
    this.container.addChild(this.hitArea);

    const texture = await Assets.load(this.config.displayImage);
    this.bgSprite = new Sprite(texture);
    this.bgSprite.anchor.set(0.5, 0);
    this.bgSprite.alpha = 0;
    this.bgSprite.eventMode = 'none';
    this.container.addChild(this.bgSprite);

    // Spinning glow rays behind the victorious hero (LevelUpScene recipe).
    const glowTexture = await Assets.load(glowRaysData);
    this.glowSprite = new Sprite(glowTexture);
    this.glowSprite.anchor.set(0.5);
    this.glowSprite.tint = 0xffdd44;
    this.glowSprite.alpha = 0.7;
    this.glowSprite.eventMode = 'none';
    this.container.addChild(this.glowSprite);

    // Hero strikes a victorious Idle pose. Reuse the already-bundled hero art.
    this.hero = await SpineCharacter.create('endCardHero',
      heroBundle,
      this.ticker,
      { skin: 'Fire_Wizard', animation: 'Idle' },
    );
    this.hero.facingLeft = false;
    this.hero.spine.eventMode = 'none';
    this.container.addChild(this.hero.spine);

    if (this.config.logoImage) {
      const logoTex = await Assets.load(this.config.logoImage);
      this.logoSprite = new Sprite(logoTex);
      this.logoSprite.anchor.set(0.5);
      this.logoSprite.alpha = 0;
      this.logoSprite.eventMode = 'none';
      this.container.addChild(this.logoSprite);
    }

    this.button = new Container();
    this.buttonBg = new Graphics();
    this.button.addChild(this.buttonBg);

    this.buttonText = new Text({
      text: 'Play Now!',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 4, join: 'round' },
      }),
    });
    this.buttonText.anchor.set(0.5);
    this.button.addChild(this.buttonText);

    this.btnShineMask = new Graphics();
    this.btnShineStrip = new Graphics();
    this.btnShineStrip.mask = this.btnShineMask;
    this.button.addChild(this.btnShineMask);
    this.button.addChild(this.btnShineStrip);

    this.button.eventMode = 'none';
    this.button.alpha = 0;
    this.container.addChild(this.button);

    // Full-screen white flash on entry, synced with the win sting (fades in update()).
    this.flash = new Graphics();
    this.flash.eventMode = 'none';
    this.container.addChild(this.flash);

    this.layoutScene();
    this.animElapsed = 0;
    this.ready = true;
    sfx.win(); // victory payoff sting on the end card
    alTrack('ENDCARD_SHOWN');
  }

  async exit(): Promise<void> {}

  update(deltaMS: number): void {
    if (!this.ready) {
      return;
    }

    this.animElapsed += deltaMS;

    const fadeT = Math.min(1, this.animElapsed / FADE_IN_MS);
    this.bgSprite.alpha = fadeT;

    if (this.logoSprite) {
      this.logoSprite.alpha = fadeT;
    }

    // Spin the glow rays.
    this.glowSprite.rotation += deltaMS * 0.00015;

    // White flash fades out fast on entry.
    const flashT = Math.min(1, this.animElapsed / FLASH_MS);
    this.flash.alpha = 1 - flashT;

    // Brief entry pop on the hero + logo (scale punch settling to 1).
    const popT = Math.min(1, this.animElapsed / HERO_POP_MS);
    const pop = easeOutQuad(popT);
    const popScale = 0.85 + 0.15 * pop;
    const heroScale = this.heroBaseScale * popScale;
    this.hero.spine.scale.set(this.hero.facingLeft ? -heroScale : heroScale, heroScale);

    if (this.logoSprite && this.logoPop) {
      this.logoSprite.scale.set(this.logoBaseScale * popScale);
    }

    const btnT = (this.animElapsed - BUTTON_APPEAR_DELAY) / BUTTON_APPEAR_MS;

    if (btnT > 0 && btnT <= 1) {
      const e = easeOutQuad(btnT);
      this.button.alpha = e;
      this.button.y = this.buttonY + 20 * (1 - e);
    } else if (btnT > 1) {
      this.button.alpha = 1;
      // gentle breathing pulse to draw the eye to the CTA
      this.button.scale.set(1 + 0.05 * Math.sin(this.animElapsed * 0.006));
    }

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

    if (!this.ready) {
      return;
    }

    this.drawHitArea();
    this.layoutScene();
  }

  private drawHitArea(): void {
    const isLandscape = this.width > this.height;
    this.hitArea.clear();

    if (isLandscape) {
      this.hitArea.rect(0, 0, this.width, this.height).fill({ color: 0x111111 });
    } else {
      this.hitArea.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.001 });
    }
  }

  private buttonY = 0;
  private heroBaseScale = 1;
  private logoBaseScale = 1;
  private logoPop = false;

  private layoutScene(): void {
    const centerX = this.width / 2;
    const ref = Math.min(this.width, this.height);
    const isLandscape = this.width > this.height;

    this.bgSprite.visible = !isLandscape;

    if (!isLandscape) {
      const texW = this.bgSprite.texture.width;
      const texH = this.bgSprite.texture.height;
      const coverScale = Math.max(this.width / texW, this.height / texH);
      this.bgSprite.scale.set(coverScale);
      this.bgSprite.position.set(centerX, -50);
    }

    // Logo: portrait at the top, landscape centred. Visible in both.
    if (this.logoSprite) {
      this.logoSprite.visible = true;
      const logoTex = this.logoSprite.texture;

      if (isLandscape) {
        const maxW = this.width * 0.7;
        const maxH = this.height * 0.65;
        this.logoBaseScale = Math.min(maxW / logoTex.width, maxH / logoTex.height);
        this.logoSprite.position.set(centerX, this.height * 0.38);
        this.logoPop = false;
        this.logoSprite.scale.set(this.logoBaseScale);
      } else {
        const maxW = this.width * 0.8;
        const maxH = this.height * 0.22;
        this.logoBaseScale = Math.min(maxW / logoTex.width, maxH / logoTex.height);
        this.logoSprite.position.set(centerX, this.height * 0.16);
        this.logoPop = true;
      }
    }

    // Hero (+ glow behind it) anchored mid-screen in portrait, hidden in landscape.
    this.hero.spine.visible = !isLandscape;
    this.glowSprite.visible = !isLandscape;

    if (!isLandscape) {
      const skelH = this.hero.spine.skeleton.data.height;
      this.heroBaseScale = (this.height * 0.42) / skelH;
      const heroY = this.height * 0.66;
      this.hero.spine.position.set(centerX, heroY);

      const glowSize = ref * 0.85;
      const glowTexSize = Math.max(this.glowSprite.texture.width, this.glowSprite.texture.height);
      this.glowSprite.scale.set(glowSize / glowTexSize);
      this.glowSprite.position.set(centerX, heroY - this.height * 0.42 * 0.45);
    }

    const btnFontSize = Math.max(20, Math.min(this.width, this.height) * 0.06);
    this.buttonText.style.fontSize = btnFontSize;
    this.btnW = Math.max(this.buttonText.width + 80, this.width * 0.5);
    const btnW = this.btnW;
    const btnH = btnFontSize * 2.8;
    this.buttonY = this.height * 0.88;

    this.buttonBg.clear();
    this.buttonBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 4)
      .fill({ color: 0x22aa44 })
      .stroke({ color: 0x000000, width: 3 });

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

    this.flash.clear();
    this.flash.rect(0, 0, this.width, this.height).fill({ color: 0xffffff });
  }
}
