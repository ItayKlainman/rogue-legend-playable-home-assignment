import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PlayerState, StatDelta } from '../PlayerState';
import { tween, delay } from '@shared/tween';
import { punch, easeOutQuad, easeOutBack, shakeEnvelope } from '@shared/easing';
import * as sfx from '../sfx';

import chestClosedData from 'assets/tiles/chest_closed.webp';
import chestOpenData from 'assets/tiles/chest_open.webp';
import chestEffectData from 'assets/tiles/chest_effect.webp';
import coinIconData from 'assets/UI/Coin.webp';
import glowRaysData from 'assets/UI/GlowRays.webp';

// Unity-derived constants
const CHEST_LOGICAL_SIZE = 640;
const SHAKE_MS = 500;
const OPEN_PUNCH_MS = 500;
const HUD_EXPAND_MS = 500;
const SHAKE_ROT_MAX = Math.PI / 18; // ~10°
const SHAKE_SCALE_MAX = 0.1;
const PUNCH_MAGNITUDE = 0.2;
const REWARD_TITLE_FONT = 80;

// Reward popup chrome
const REWARD_DIM_ALPHA = 0.85;
const REWARD_FADE_IN_MS = 200;
const REWARD_FADE_OUT_MS = 150;

export interface TreasureChestSceneConfig {
  /** Coins to award on open. Required. */
  coins: number;
}

export class TreasureChestScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: TreasureChestSceneConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private applyStatDelta: (delta: StatDelta) => StatDelta;
  private ready = false;

  // Phase 1 — chest stage
  private dimOverlay!: Graphics;
  private hitArea!: Graphics;
  private chestContainer!: Container;
  private chestSprite!: Sprite;
  private footerText!: Text;
  private chestClosedTexture: any = null;
  private chestOpenTexture: any = null;

  // Animation state for chest stage
  private chestBaseScale = 1;
  private shakeRotOffset = 0;
  private shakeScaleOffsetX = 0;
  private shakeScaleOffsetY = 0;
  private punchScaleOffset = 0;
  /** Y-stretch multiplier driven by the HUD-expand window (Unity-faithful). */
  private hudExpandStretchY = 1;
  private hasInteracted = false;
  private chestStageDone = false;

  // Phase 2 — reward popup
  private rewardContainer!: Container;
  private rewardDim!: Graphics;
  private glowSprite!: Sprite;
  private coinSprite!: Sprite;
  private amountText!: Text;
  private continueButton!: Container;
  private continueButtonBg!: Graphics;
  private continueButtonText!: Text;
  private rewardElapsed = 0;
  private rewardFadingOut = false;
  private rewardFadeOutElapsed = 0;
  private rewardActive = false;
  private glowBaseScale = 1;
  private coinBaseScale = 1;
  private btnW = 0;

  constructor(
    config: TreasureChestSceneConfig,
    state: PlayerState,
    ticker: Ticker,
    width: number,
    height: number,
    applyStatDelta: (delta: StatDelta) => StatDelta,
  ) {
    this.container = new Container();
    this.config = config;
    this.state = state;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.applyStatDelta = applyStatDelta;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    // Dim overlay (semi-transparent) covering the whole viewport
    this.dimOverlay = new Graphics();
    this.drawDimOverlay();
    this.container.addChild(this.dimOverlay);

    // Full-screen tap target — captures the first tap to start the open sequence
    this.hitArea = new Graphics();
    this.hitArea.eventMode = 'static';
    this.hitArea.cursor = 'pointer';
    this.hitArea.on('pointerdown', () => { this.onChestTap(); });
    this.drawHitArea();
    this.container.addChild(this.hitArea);

    // Pre-load chest textures so we can swap instantly at t=0.5s. If any asset
    // 404s in production, fall back to PIXI Texture.WHITE rather than hanging
    // `done` forever (Code-review #6).
    try {
      this.chestClosedTexture = await Assets.load(chestClosedData);
      this.chestOpenTexture = await Assets.load(chestOpenData);
      await Assets.load(chestEffectData);
      await Assets.load(coinIconData);
      await Assets.load(glowRaysData);
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[TreasureChestScene] asset load failed', err);
      this.chestClosedTexture = Texture.WHITE;
      this.chestOpenTexture = Texture.WHITE;
    }

    // Chest container — pivots at center so shake/punch animate around the middle
    this.chestContainer = new Container();
    this.chestSprite = new Sprite(this.chestClosedTexture);
    this.chestSprite.anchor.set(0.5);
    this.chestContainer.addChild(this.chestSprite);
    this.chestContainer.scale.set(0); // entrance scale-in
    this.container.addChild(this.chestContainer);

    // Footer text
    this.footerText = new Text({
      text: 'Tap anywhere to open!',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 4, join: 'round' },
      }),
    });
    this.footerText.anchor.set(0.5);
    this.container.addChild(this.footerText);

    this.layoutChestStage();
    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);

    // Entrance: scale 0 → 1 over 400ms easeOutBack
    tween(this.ticker, 400, (t) => {
      this.chestContainer.scale.set(this.chestBaseScale * t);
    }, 1, easeOutBack);
  }

  async exit(): Promise<void> {}

  update(_deltaMS: number): void {
    if (!this.ready) return;
    // All animations are driven through tween() / ticker handlers; nothing
    // ticker-side to do here. Keep the method present for the Scene contract.
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
    this.layoutChestStage();
    if (this.rewardActive) this.layoutReward();
  }

  // -------------------------------------------------------------------------
  // Chest stage
  // -------------------------------------------------------------------------

  private onChestTap(): void {
    if (this.hasInteracted) return;
    this.hasInteracted = true;
    sfx.buttonClick();
    // Hide footer immediately on tap
    this.footerText.visible = false;
    void this.runOpenSequence();
  }

  private async runOpenSequence(): Promise<void> {
    // t=0.0–0.5s: parallel shake rotation + shake scale on chest
    await tween(this.ticker, SHAKE_MS, (t) => {
      // Random per-frame rotation offset, fade-out envelope (1-t)^1
      const rotMag = shakeEnvelope(SHAKE_ROT_MAX, 1, t);
      const sclMag = shakeEnvelope(SHAKE_SCALE_MAX, 1, t);
      this.shakeRotOffset = (Math.random() * 2 - 1) * rotMag;
      this.shakeScaleOffsetX = (Math.random() * 2 - 1) * sclMag;
      this.shakeScaleOffsetY = (Math.random() * 2 - 1) * sclMag;
      this.applyChestTransform();
    });
    // Reset shake to zero now that it's complete
    this.shakeRotOffset = 0;
    this.shakeScaleOffsetX = 0;
    this.shakeScaleOffsetY = 0;
    this.applyChestTransform();

    // t=0.5s: instant sprite swap (no fade)
    this.chestSprite.texture = this.chestOpenTexture;

    // t=0.5–1.0s: open punch on chest. Run in parallel with HUD expand (we'll
    // run them as parallel tweens via Promise.all so the chest punch and the
    // reward popup expansion both complete at t=1.0s).
    const punchPromise = tween(this.ticker, OPEN_PUNCH_MS, (t) => {
      this.punchScaleOffset = punch(PUNCH_MAGNITUDE, 10, t);
      this.applyChestTransform();
    });

    // HUD container expand: Unity grows the HUD parent's height 1× → 3× over 0.5s
    // symmetric (TreasureBoxOpenSequence.cs:80-95). We don't have a separate HUD
    // container, so apply the same window as a subtle Y-stretch + Y-offset on the
    // chest itself, easeOutQuad. (Layered on top of the punch wobble.)
    const expandPromise = tween(this.ticker, HUD_EXPAND_MS, (t) => {
      // Stretch from 1.0 to ~1.15 then back to 1.0 (triangle wave so the chest
      // springs vertically and settles by t=1.0).
      const k = t < 0.5 ? t * 2 : (1 - t) * 2;
      this.hudExpandStretchY = 1.0 + 0.15 * k;
      this.applyChestTransform();
    }, 1, easeOutQuad);

    await Promise.all([punchPromise, expandPromise]);
    this.punchScaleOffset = 0;
    this.hudExpandStretchY = 1;
    this.applyChestTransform();

    this.chestStageDone = true;

    // Tiny breath before reward popup
    await delay(this.ticker, 50);

    // t=1.0s: reward popup
    await this.showRewardPopup();
  }

  private applyChestTransform(): void {
    if (!this.chestContainer) return;
    const s = this.chestBaseScale * (1 + this.punchScaleOffset);
    this.chestContainer.scale.set(
      s * (1 + this.shakeScaleOffsetX),
      s * (1 + this.shakeScaleOffsetY) * this.hudExpandStretchY,
    );
    this.chestContainer.rotation = this.shakeRotOffset;
  }

  private layoutChestStage(): void {
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // Chest scale: target CHEST_LOGICAL_SIZE relative to viewport
    const refSize = Math.min(this.width, this.height) * 0.6;
    // The source PNG is 512x512; CHEST_LOGICAL_SIZE (640) is the design size.
    // Use the texture's max dimension so we cover non-square sprites cleanly.
    const texW = this.chestSprite.texture.width;
    const texH = this.chestSprite.texture.height;
    const baseFromLogical = refSize / Math.max(texW, texH);
    // Bias slightly toward the design 640px feel: clamp scale to a sensible range
    this.chestBaseScale = baseFromLogical * (CHEST_LOGICAL_SIZE / 640);

    this.chestContainer.position.set(centerX, centerY);
    // Re-apply to honor any in-flight punch/shake offsets
    this.applyChestTransform();

    // Footer text below chest
    const footerFontSize = Math.max(20, Math.min(this.width, this.height) * 0.04);
    this.footerText.style.fontSize = footerFontSize;
    const chestRenderedH = texH * this.chestBaseScale;
    this.footerText.position.set(
      centerX,
      Math.min(this.height - footerFontSize * 1.5, centerY + chestRenderedH / 2 + footerFontSize * 1.5),
    );
  }

  private drawDimOverlay(): void {
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: 0.6 });
  }

  private drawHitArea(): void {
    this.hitArea.clear();
    this.hitArea.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: 0.001 });
  }

  // -------------------------------------------------------------------------
  // Reward popup (dim + glow + coin + amount + Continue button)
  // -------------------------------------------------------------------------

  private async showRewardPopup(): Promise<void> {
    sfx.rewardReceived();

    // Disable chest-stage hit area so taps don't advance prematurely
    this.hitArea.eventMode = 'none';

    this.rewardContainer = new Container();
    this.container.addChild(this.rewardContainer);

    // Reward dim (darker than the chest stage dim)
    this.rewardDim = new Graphics();
    this.rewardDim.alpha = 0;
    this.drawRewardDim();
    this.rewardContainer.addChild(this.rewardDim);

    // Glow rays behind coin
    this.glowSprite = new Sprite(Assets.get(glowRaysData));
    this.glowSprite.anchor.set(0.5);
    this.glowSprite.tint = 0xffdd44;
    this.glowSprite.alpha = 0;
    this.glowSprite.scale.set(0);
    this.rewardContainer.addChild(this.glowSprite);

    // Coin icon
    this.coinSprite = new Sprite(Assets.get(coinIconData));
    this.coinSprite.anchor.set(0.5);
    this.coinSprite.scale.set(0);
    this.rewardContainer.addChild(this.coinSprite);

    // Amount text "x{amount}" — Arial Black 80pt white with black stroke 4px
    this.amountText = new Text({
      text: `x${this.config.coins}`,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fontSize: REWARD_TITLE_FONT,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4, join: 'round' },
      }),
    });
    this.amountText.anchor.set(0.5);
    this.amountText.alpha = 0;
    this.rewardContainer.addChild(this.amountText);

    // Continue button — gold #FFC600 fill, dark stroke
    this.continueButton = new Container();
    this.continueButtonBg = new Graphics();
    this.continueButton.addChild(this.continueButtonBg);

    this.continueButtonText = new Text({
      text: 'Continue',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 4, join: 'round' },
      }),
    });
    this.continueButtonText.anchor.set(0.5);
    this.continueButton.addChild(this.continueButtonText);

    this.continueButton.eventMode = 'static';
    this.continueButton.cursor = 'pointer';
    this.continueButton.on('pointerdown', () => {
      if (this.rewardFadingOut) return;
      sfx.buttonClick();
      this.applyStatDelta({ coins: this.config.coins });
      this.rewardFadingOut = true;
      this.rewardFadeOutElapsed = 0;
      void this.runRewardFadeOut();
    });
    this.continueButton.alpha = 0;
    this.rewardContainer.addChild(this.continueButton);

    this.layoutReward();
    this.rewardActive = true;
    this.rewardElapsed = 0;

    // Drive popup intro via tween() — fade dim, pop coin/glow with easeOutBack,
    // fade text + button.
    const FADE_IN = REWARD_FADE_IN_MS;
    const COIN_DELAY = 100;
    const COIN_MS = 350;
    const TEXT_DELAY = 300;
    const TEXT_MS = 200;
    const BTN_DELAY = 400;
    const BTN_MS = 200;

    // Dim fade in
    tween(this.ticker, FADE_IN, (t) => {
      this.rewardDim.alpha = t * REWARD_DIM_ALPHA;
    });

    // Coin + glow pop in (after delay)
    void (async () => {
      await delay(this.ticker, COIN_DELAY);
      await tween(this.ticker, COIN_MS, (t) => {
        this.coinSprite.scale.set(this.coinBaseScale * t);
        this.glowSprite.scale.set(this.glowBaseScale * t);
        this.glowSprite.alpha = 0.8 * Math.min(1, t * 2);
      }, 1, easeOutBack);
    })();

    // Amount text fade in (after delay)
    void (async () => {
      await delay(this.ticker, TEXT_DELAY);
      await tween(this.ticker, TEXT_MS, (t) => {
        this.amountText.alpha = t;
      }, 1, easeOutQuad);
    })();

    // Continue button fade in (after delay)
    void (async () => {
      await delay(this.ticker, BTN_DELAY);
      await tween(this.ticker, BTN_MS, (t) => {
        this.continueButton.alpha = t;
      }, 1, easeOutQuad);
    })();

    // Continuous slow rotation on glow rays (360° / 4s) — drive via ticker tween
    // running effectively forever until reward fades out
    void (async () => {
      while (!this.rewardFadingOut) {
        await tween(this.ticker, 4000, (t) => {
          this.glowSprite.rotation = t * Math.PI * 2;
        });
        if (this.rewardFadingOut) break;
        this.glowSprite.rotation = 0;
      }
    })();
  }

  private async runRewardFadeOut(): Promise<void> {
    await tween(this.ticker, REWARD_FADE_OUT_MS, (t) => {
      this.container.alpha = 1 - t;
    });
    this.resolveDone();
  }

  private drawRewardDim(): void {
    this.rewardDim.clear();
    this.rewardDim.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000 });
  }

  private layoutReward(): void {
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const isLandscape = this.width > this.height;

    this.drawRewardDim();

    // Coin sprite — ~150px reference, scaled to short edge for portability
    const coinTargetSize = Math.min(this.width, this.height) * 0.22;
    const coinTex = this.coinSprite.texture;
    this.coinBaseScale = coinTargetSize / Math.max(coinTex.width, coinTex.height);
    const coinY = centerY - Math.min(this.width, this.height) * 0.05;
    this.coinSprite.position.set(centerX, coinY);

    // Glow rays — larger than coin, behind it
    const glowSize = coinTargetSize * 2.6;
    const glowTex = this.glowSprite.texture;
    this.glowBaseScale = glowSize / Math.max(glowTex.width, glowTex.height);
    this.glowSprite.position.set(centerX, coinY);

    // If pop-in already done, snap to base scale
    if (this.rewardActive && this.rewardElapsed > 9999) {
      this.coinSprite.scale.set(this.coinBaseScale);
      this.glowSprite.scale.set(this.glowBaseScale);
    }

    // Amount text
    const titleFontSize = Math.max(40, Math.min(this.width, this.height) * 0.1);
    this.amountText.style.fontSize = Math.min(REWARD_TITLE_FONT, titleFontSize);
    const coinRenderedH = coinTex.height * this.coinBaseScale;
    this.amountText.position.set(centerX, coinY + coinRenderedH / 2 + this.amountText.style.fontSize * 0.7);

    // Continue button — ~250x80 rounded rect
    const btnFontSize = Math.max(20, Math.min(this.width, this.height) * 0.05);
    this.continueButtonText.style.fontSize = btnFontSize;
    this.btnW = Math.max(this.continueButtonText.width + 80, isLandscape ? 250 : this.width * 0.5);
    const btnW = this.btnW;
    const btnH = btnFontSize * 2.5;
    const btnY = this.height * (isLandscape ? 0.85 : 0.78);

    this.continueButtonBg.clear();
    this.continueButtonBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 4)
      .fill({ color: 0xffc600 })
      .stroke({ color: 0x222222, width: 3 });
    this.continueButtonText.position.set(0, 0);
    this.continueButton.position.set(centerX, btnY);
  }
}
