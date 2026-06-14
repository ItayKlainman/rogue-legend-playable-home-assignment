import { Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { safeInstall } from '@shared/mraidInstall';
import { alTrack } from '@shared/alAnalytics';
import { easeOutQuad } from '@shared/utils';

const FADE_IN_MS = 300;
const BUTTON_APPEAR_DELAY = 400;
const BUTTON_APPEAR_MS = 250;

export interface GameEndSceneConfig {
  displayImage: string;
  logoImage?: string;
}

export class GameEndScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: GameEndSceneConfig;
  private width: number;
  private height: number;
  private ready = false;

  private hitArea!: Graphics;
  private bgSprite!: Sprite;
  private logoSprite: Sprite | null = null;
  private button!: Container;
  private buttonBg!: Graphics;
  private buttonText!: Text;
  private btnShineMask!: Graphics;
  private btnShineStrip!: Graphics;

  private animElapsed = 0;
  private btnW = 0;

  constructor(
    config: GameEndSceneConfig,
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

    this.layoutScene();
    this.animElapsed = 0;
    this.ready = true;
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

    const btnT = (this.animElapsed - BUTTON_APPEAR_DELAY) / BUTTON_APPEAR_MS;

    if (btnT > 0 && btnT <= 1) {
      const e = easeOutQuad(btnT);
      this.button.alpha = e;
      this.button.y = this.buttonY + 20 * (1 - e);
    } else if (btnT > 1) {
      this.button.alpha = 1;
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

  private layoutScene(): void {
    const centerX = this.width / 2;
    const isLandscape = this.width > this.height;

    this.bgSprite.visible = !isLandscape;

    if (!isLandscape) {
      const texW = this.bgSprite.texture.width;
      const texH = this.bgSprite.texture.height;
      const coverScale = Math.max(this.width / texW, this.height / texH);
      this.bgSprite.scale.set(coverScale);
      this.bgSprite.position.set(centerX, -50);
    }

    if (this.logoSprite) {
      this.logoSprite.visible = isLandscape;

      if (isLandscape) {
        const logoTex = this.logoSprite.texture;
        const maxW = this.width * 0.7;
        const maxH = this.height * 0.65;
        const logoScale = Math.min(maxW / logoTex.width, maxH / logoTex.height);
        this.logoSprite.scale.set(logoScale);
        this.logoSprite.position.set(centerX, this.height * 0.38);
      }
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
  }
}
