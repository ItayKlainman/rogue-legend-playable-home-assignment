import { Assets, Container, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { StatDelta } from '../../PlayerState';
import { tween, delay } from '@shared/tween';
import { makeNineSlice } from '@shared/nineSlice';
import * as sfx from '../../sfx';

import bubbleFrameData from 'assets/UI/BubbleFrame_02_Bg.webp';
import hpIconData from 'assets/UI/HP_Base_Stat.webp';
import atkIconData from 'assets/UI/ATK_Base_Stat.webp';
import defIconData from 'assets/UI/DEF_Base_Stat.webp';
// Co-located: Power_Down.mp3 is only used here and in ShopScene, both of which
// are codegen-gated. Importing here keeps it out of variants that don't use them.
import powerDownData from 'assets/Audio/Power_Down.mp3';

/**
 * StatChangeTilePopup faithful reproduction. See plan §1.1 for the Unity spec.
 *
 * Visual: speech bubble with inline icon + green/red text, 9-sliced beige frame.
 * Behavior: scale 0→1 over 500ms, hold 3000ms, scale 1→0 over 500ms (linear).
 * Pivot-flip math runs every frame: bubble tail points toward the source tile
 * regardless of which side of the camera anchor that tile sits on.
 */

// Playable native viewport ~360–600px wide; Unity uses 1080px reference.
// Scale popup by 0.4 so a single bubble takes ~30% of viewport width
// at standard playable resolutions (was 334x110 → 134x44 visual size).
const SCALE = 0.4;
const W = 334.35 * SCALE;
const H = 110.6 * SCALE;
const ICON_GLYPH_SIZE = 60 * SCALE;
const TEXT_PADDING_LEFT = 70 * SCALE;
const SHOW_MS = 500;
const HOLD_MS = 3000;
const HIDE_MS = 500;

const POSITIVE_HEX = 0xaaffaa;  // light green
const NEGATIVE_HEX = 0xffaaaa;  // light red

// Unity 9-slice borders: {left:44, bottom:21, right:32, top:69}
const FRAME_BORDER = { left: 44, bottom: 21, right: 32, top: 69 };

export interface StatChangePopupOptions {
  ticker: Ticker;
  stat: 'hp' | 'atk' | 'def';
  pct?: number;
  amount?: number;
  applied: StatDelta;
  /** Returns the screen position of the source tile each frame. */
  tileScreen: () => { x: number; y: number };
  /** Returns the camera anchor (player) screen-X each frame. */
  cameraAnchorX: () => number;
}

export class StatChangePopup {
  readonly container = new Container();
  private opts: StatChangePopupOptions;
  private bg!: Sprite;
  private inner!: Container;       // holds bg + text/icon; flipped horizontally for right-side
  private posTracker: () => void = () => {};
  private posHandler?: (t: Ticker) => void;

  constructor(opts: StatChangePopupOptions) {
    this.opts = opts;
  }

  async init(): Promise<void> {
    const [frameTex, iconTex] = await Promise.all([
      Assets.load(bubbleFrameData) as Promise<Texture>,
      this.loadIcon(),
    ]);

    this.inner = new Container();

    const frame = makeNineSlice({ texture: frameTex, border: FRAME_BORDER, width: W, height: H });
    this.inner.addChild(frame);
    this.bg = frame as unknown as Sprite; // expose for flip via scale.x

    const sign = this.signValue();
    const isPositive = sign >= 0;

    const icon = new Sprite(iconTex);
    icon.anchor.set(0.5, 0.5);
    icon.width = ICON_GLYPH_SIZE;
    icon.height = ICON_GLYPH_SIZE;
    icon.x = 28 * SCALE;
    icon.y = H / 2;
    this.inner.addChild(icon);

    const text = new Text({
      text: this.formatLabel(),
      style: {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 35 * 1.2 * SCALE, // Unity rich-text <size=120%> × playable scale
        fontWeight: '900',
        fill: isPositive ? POSITIVE_HEX : NEGATIVE_HEX,
        stroke: { color: 0x1a1a2e, width: 2 },
      },
    });
    text.anchor.set(0, 0.5);
    text.x = TEXT_PADDING_LEFT;
    text.y = H / 2;
    this.inner.addChild(text);

    this.container.addChild(this.inner);
    this.container.alpha = 0;
    this.container.scale.set(0);

    // SFX on show
    if (sign > 0) sfx.powerUp(0.8);
    else if (sign < 0) sfx.play(powerDownData, 0.8);

    // Position tracker — runs every tick to keep popup glued to its tile and
    // mirror the bubble when the tile crosses the camera anchor.
    this.posTracker = () => this.updatePosition();
    this.posHandler = (_t: Ticker) => this.posTracker();
    this.opts.ticker.add(this.posHandler);
    this.updatePosition();
  }

  /** Lifecycle: 500ms scale-in → 3s hold → 500ms scale-out. */
  async run(): Promise<void> {
    this.container.alpha = 1;
    await tween(this.opts.ticker, SHOW_MS, (t) => { this.container.scale.set(t); });
    await delay(this.opts.ticker, HOLD_MS);
    await tween(this.opts.ticker, HIDE_MS, (t) => { this.container.scale.set(1 - t); });
  }

  destroy(): void {
    if (this.posHandler) this.opts.ticker.remove(this.posHandler);
    this.container.destroy({ children: true });
  }

  private updatePosition(): void {
    const tile = this.opts.tileScreen();
    const anchorX = this.opts.cameraAnchorX();
    const tileLeftOfAnchor = tile.x < anchorX;

    // Anchor popup just above the tile and offset slightly to the side opposite
    // the camera anchor so the bubble's tail points back at the tile.
    //   LEFT-of-anchor: bubble extends RIGHT (tail at bubble bottom-LEFT)
    //   RIGHT-of-anchor: bubble extends LEFT  (tail at bubble bottom-RIGHT, mirrored frame)
    const TAIL_DROP = H * 0.5;     // how far below bubble bottom the tail tip sits
    const TILE_OFFSET_X = 0.15 * W; // tail-tip lateral offset from tile center

    if (tileLeftOfAnchor) {
      // Tail tip at bubble local (TILE_OFFSET_X, H + TAIL_DROP). Pivot there so the tip aligns with tile.
      this.container.pivot.set(TILE_OFFSET_X, H + TAIL_DROP);
      this.inner.scale.x = 1;
      this.inner.x = 0;
    } else {
      // Mirror: tail tip at bubble local (W - TILE_OFFSET_X, H + TAIL_DROP).
      this.container.pivot.set(W - TILE_OFFSET_X, H + TAIL_DROP);
      // Mirror the frame only — text + icon stay readable.
      this.inner.scale.x = 1;
      this.inner.x = 0;
      this.bg.scale.x = -1;
      this.bg.x = W;
    }
    this.container.x = tile.x;
    this.container.y = tile.y;
  }

  private signValue(): number {
    const v = this.opts.amount ?? this.opts.pct ?? 0;
    return Math.sign(v);
  }

  private formatLabel(): string {
    const sign = this.signValue();
    const sigil = sign > 0 ? '+' : sign < 0 ? '-' : '';
    const magnitude = Math.abs(this.opts.amount ?? this.opts.pct ?? 0);
    const label = ({ hp: 'HP', atk: 'ATK', def: 'DEF' } as const)[this.opts.stat];
    const suffix = this.opts.amount != null ? '' : '%';
    return `${label} ${sigil}${magnitude}${suffix}`;
  }

  private async loadIcon(): Promise<Texture> {
    const url = ({ hp: hpIconData, atk: atkIconData, def: defIconData } as const)[this.opts.stat];
    return await Assets.load(url) as Texture;
  }
}
