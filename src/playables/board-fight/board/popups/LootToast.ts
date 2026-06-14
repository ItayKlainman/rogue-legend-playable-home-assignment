import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import { tween } from '@shared/tween';
import { ParticleEmitter } from '@shared/particleEmitter';
import * as sfx from '../../sfx';

import coinIconData from 'assets/UI/Coin.webp';

/**
 * LootObtainedUI faithful reproduction. See plan §1.2 for the Unity spec.
 *
 * Visual: golden +N text with inline coin icon, horizontal yellow glow underlay,
 * 10-particle radial white burst on overshoot.
 *
 * Animation timeline (legacy keyframes):
 *   t=0      scale (0,0,0)
 *   t=0.083s scale (1.1, 1.1, 1.1)  ← overshoot
 *   t=0.117s scale (1.0, 1.0, 1.0)  ← settle
 *   t=1.5s   scale (1.0, ...)       ← hold ends
 *   t=1.583s scale (0,0,0)          ← snap exit
 *   All linear interpolation between keyframes.
 */

const Y_OFFSET = -100;        // logical px above tile center
const TOTAL_SIZE_W = 320;
const COIN_GLYPH = 36;
const TEXT_FONT_SIZE = 32;

const COLOR_GOLD = 0xffc600;
const COLOR_GOLD_GLOW = 0xffcc00;

export interface LootToastOptions {
  ticker: Ticker;
  amount: number;
  currency: 'coin';
  /** Returns the screen position of the source tile each frame. */
  tileScreen: () => { x: number; y: number };
}

export class LootToast {
  readonly container = new Container();
  private opts: LootToastOptions;
  private content!: Container;
  private glow!: Graphics;
  private particles!: ParticleEmitter;
  private posHandler?: (t: Ticker) => void;

  constructor(opts: LootToastOptions) {
    this.opts = opts;
  }

  async init(): Promise<void> {
    const coinTex = await Assets.load(coinIconData) as Texture;

    // Glow underlay (golden horizontal halo behind text)
    this.glow = new Graphics();
    this.drawGlow(1, 1);
    this.container.addChild(this.glow);

    // Content row: text "+{amount}" + coin sprite
    this.content = new Container();
    const text = new Text({
      text: `+${this.opts.amount}`,
      style: {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: TEXT_FONT_SIZE,
        fontWeight: '900',
        fill: COLOR_GOLD,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    text.anchor.set(1, 0.5);

    const coin = new Sprite(coinTex);
    coin.anchor.set(0, 0.5);
    coin.width = COIN_GLYPH;
    coin.height = COIN_GLYPH;

    // Lay out: text right-aligned to gap, coin to its right
    const GAP = 8;
    text.x = -GAP / 2;
    coin.x = GAP / 2;
    text.y = 0;
    coin.y = 0;
    this.content.addChild(text, coin);
    this.container.addChild(this.content);

    // Particle emitter sits on top so the burst overlays the text
    this.particles = new ParticleEmitter(this.opts.ticker);
    this.container.addChild(this.particles.container);

    this.container.scale.set(0);

    // Position tracker
    this.posHandler = () => this.updatePosition();
    this.opts.ticker.add(this.posHandler);
    this.updatePosition();
  }

  async run(): Promise<void> {
    sfx.rewardReceived(0.7);

    // Radial burst at t=0
    this.particles.burst({
      texture: this.fakeWhiteParticleTex(),
      count: 10,
      origin: { x: 0, y: 0 },
      innerR: 10,
      outerR: 60,
      speedMin: 80,
      speedMax: 200,
      lifetimeMin: 500,
      lifetimeMax: 1000,
      scaleMin: 0.6,
      scaleMax: 1.2,
      scaleEnd: 0,
      tint: 0xffffff,
    });

    // Keyframes (linear interpolation, real time — not FIGHT_SPEED):
    // 0 → 1.1 over 83ms, 1.1 → 1.0 over 34ms, hold 1383ms, snap to 0 at 1583ms.
    await tween(this.opts.ticker, 83, (t) => { this.container.scale.set(1.1 * t); });
    await tween(this.opts.ticker, 34, (t) => { this.container.scale.set(1.1 - 0.1 * t); });

    // Glow fade: x-scale 1.0 → 0.0 over 500ms while alpha fades 1 → 0.
    const glowFade = tween(this.opts.ticker, 500, (t) => {
      this.drawGlow(1 - t, 1 - t);
    });

    // Hold ~1.4s
    await tween(this.opts.ticker, 1383, () => {});

    await glowFade.catch(() => {});

    // Snap exit (instant) — Unity uses linear interp from t=1.5 → 1.583s,
    // we use a 50ms scale-down for non-jarring readability.
    await tween(this.opts.ticker, 50, (t) => { this.container.scale.set(1 - t); });
  }

  /** Fast variant for use during a coin-fly: pop in (~120ms), brief hold (~280ms),
   *  fast exit (~120ms). Caller can resolve and let the player roll again while
   *  the parallel coin-fly continues to tick the HUD. Total ~520ms vs run()'s 2s+. */
  async runQuick(): Promise<void> {
    sfx.rewardReceived(0.7);

    // Tiny radial burst (fewer particles for the brief lifetime).
    this.particles.burst({
      texture: this.fakeWhiteParticleTex(),
      count: 8,
      origin: { x: 0, y: 0 },
      innerR: 8,
      outerR: 50,
      speedMin: 80,
      speedMax: 180,
      lifetimeMin: 350,
      lifetimeMax: 600,
      scaleMin: 0.5,
      scaleMax: 1.0,
      scaleEnd: 0,
      tint: 0xffffff,
    });

    // Pop in 0 → 1.1 over 80ms, settle to 1.0 over 40ms.
    await tween(this.opts.ticker, 80, (t) => { this.container.scale.set(1.1 * t); });
    await tween(this.opts.ticker, 40, (t) => { this.container.scale.set(1.1 - 0.1 * t); });

    // Glow fade in parallel.
    const glowFade = tween(this.opts.ticker, 360, (t) => {
      this.drawGlow(1 - t, 1 - t);
    });

    // Brief hold then exit
    await tween(this.opts.ticker, 240, () => {});
    await tween(this.opts.ticker, 120, (t) => { this.container.scale.set(1 - t); });
    await glowFade;
  }

  destroy(): void {
    if (this.posHandler) this.opts.ticker.remove(this.posHandler);
    this.particles.destroy();
    this.container.destroy({ children: true });
  }

  private updatePosition(): void {
    const tile = this.opts.tileScreen();
    this.container.x = tile.x;
    this.container.y = tile.y + Y_OFFSET;
  }

  private drawGlow(alpha: number, xScale: number): void {
    const w = TOTAL_SIZE_W * xScale;
    const h = 110;
    this.glow.clear();
    if (alpha <= 0 || xScale <= 0) return;
    // Soft horizontal ellipse: 4 concentric ellipses with falling alpha mimic a glow gradient.
    for (let i = 4; i >= 0; i--) {
      const aa = alpha * (0.08 + i * 0.04);
      this.glow.ellipse(0, 0, w / 2 * (0.5 + i * 0.15), h / 2 * (0.4 + i * 0.18))
        .fill({ color: COLOR_GOLD_GLOW, alpha: aa });
    }
  }

  private particleTex?: Texture;
  private fakeWhiteParticleTex(): Texture {
    if (this.particleTex) return this.particleTex;
    // Reuse Texture.WHITE — small, bundled-free.
    this.particleTex = Texture.WHITE;
    return this.particleTex;
  }
}
