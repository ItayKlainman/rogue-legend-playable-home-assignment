import { Assets, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { makeNineSlice } from '@shared/nineSlice';
import { GAME_FONT_STACK } from '../fonts';
// Coin bar built from a real Slider component set (Slider_Border_Rectangle_01):
//   _Bg     = the dark rounded track            (9-sliced, border L15 T16 R15 B16)
//   _Border = the lighter rim over the track    (9-sliced, same border)
//   _Fill   = the gold fill that grows L→R       (9-sliced, border L1 T13 R8 B13)
// The per-coin SEGMENTATION is done by masking the gold fill with a tiled mask (one
// rounded pip per coin, dark dividers between) — NOT by drawing rectangles as art.
import coinBarBg from 'assets/UI/CoinBar_Bg.webp';
import coinBarBorder from 'assets/UI/CoinBar_Border.webp';
import coinBarFill from 'assets/UI/CoinBar_Fill.webp';
import coinData from 'assets/UI/ResourceBar_01_Coin.webp';

// PIXI v8: every Sprite/NineSlice is built from an Assets.load-ed Texture, never
// Texture.from(importedUrl) (renders blank). Populated by preload().
const TEX: {
  coin?: Texture;
  barBg?: Texture;
  barBorder?: Texture;
  barFill?: Texture;
} = {};

// Unity 9-slice border insets (from components-cli `use`).
const BAR_BORDER = { left: 15, top: 16, right: 15, bottom: 16 };
const FILL_BORDER = { left: 1, top: 13, right: 8, bottom: 13 };

/** Passive coin meter (matches the design mock): a gold coin disk + count overlapping
 *  the LEFT end of a long dark rounded track that fills with GOLD SEGMENTS (one per
 *  coin, dark dividers between) left→right; the empty remainder shows the dark track.
 *  Built entirely from real Slider component art (9-sliced) — no Graphics frames. */
export class CoinMeter extends Container {
  /** Load this widget's textures. MUST be awaited before the constructor runs. */
  static async preload(): Promise<void> {
    await Promise.all([
      Assets.load<Texture>(coinData).then((t) => { TEX.coin = t; }),
      Assets.load<Texture>(coinBarBg).then((t) => { TEX.barBg = t; }),
      Assets.load<Texture>(coinBarBorder).then((t) => { TEX.barBorder = t; }),
      Assets.load<Texture>(coinBarFill).then((t) => { TEX.barFill = t; }),
    ]);
  }

  private readonly barW: number;
  private readonly barH: number;
  private readonly fillX: number;     // left edge of the fill region (inside the track)
  private readonly fillW: number;     // full-coins width of the fill region
  private readonly fill: Container;    // gold fill (9-sliced), revealed by segMask
  private readonly fillSprite: ReturnType<typeof makeNineSlice>;
  private readonly segMask: Graphics;  // segmented mask (redrawn in setCoins)
  private readonly coinLabel: Text;
  private lastFilled = -1;
  private lastMax = -1;

  /** @param width total bar track width in px (the disk overlaps to its left). */
  constructor(width: number) {
    super();
    if (!TEX.coin || !TEX.barBg || !TEX.barBorder || !TEX.barFill) {
      throw new Error('CoinMeter.preload() must be awaited before constructing CoinMeter');
    }
    const barH = Math.round(width * 0.135);
    this.barW = width;
    this.barH = barH;

    // The track is laid so its LEFT end starts after the coin disk overlap, but the
    // widget origin (0,0) is the track's top-left so CombatScene can align it to the
    // panel. The disk hangs to the LEFT of the origin (negative x).
    // z0: dark track Bg (9-sliced — corners never distort). The source art is light, so
    // tint it dark to read as an empty track (the gold fill shows the filled remainder).
    const bg = makeNineSlice({ texture: TEX.barBg, border: BAR_BORDER, width, height: barH });
    bg.tint = 0x1c1822;
    this.addChild(bg);

    // z1: gold fill (9-sliced), masked by the segmented mask. The fill region starts
    // AFTER the disk + 2-digit count (which sit over the track's left end) so the gold
    // segments never collide with the number.
    const innerPad = Math.max(2, barH * 0.16);
    const diskD = barH * 1.5;
    const labelClear = diskD * 0.4 + barH * 0.95; // disk + room for a 2-digit count
    this.fillX = labelClear;
    this.fillW = width - innerPad - labelClear;
    const fillH = barH - innerPad * 2;
    this.fill = new Container();
    this.fillSprite = makeNineSlice({ texture: TEX.barFill, border: FILL_BORDER, width: this.fillW, height: fillH });
    this.fillSprite.position.set(this.fillX, innerPad);
    this.fill.addChild(this.fillSprite);
    this.addChild(this.fill);

    this.segMask = new Graphics();
    this.addChild(this.segMask);
    this.fill.mask = this.segMask;

    // z2: lighter rim over the track + fill (9-sliced); tinted a warm grey so it frames
    // the bar without washing out (the source rim art is near-white).
    const border = makeNineSlice({ texture: TEX.barBorder, border: BAR_BORDER, width, height: barH });
    border.tint = 0x4a4350;
    this.addChild(border);

    // z3: coin disk endcap — bigger than the bar, overlapping the left end (hangs left
    // of origin). Border 0/0/0/0 → plain Sprite, uniform-scaled (no distortion).
    const coin = new Sprite(TEX.coin);
    coin.anchor.set(0.5);
    coin.width = diskD;
    coin.height = diskD;
    coin.position.set(0, barH / 2);
    this.addChild(coin);

    // z4: coin count, sitting just right of the disk center over the track's left end.
    this.coinLabel = new Text({
      text: '0',
      style: {
        fontFamily: GAME_FONT_STACK,
        fontSize: Math.round(barH * 0.68),
        fill: 0xffffff,
        stroke: { color: 0x3a2a05, width: Math.max(3, barH * 0.12), join: 'round' },
      },
    });
    this.coinLabel.anchor.set(0, 0.5);
    this.coinLabel.position.set(diskD * 0.4, barH / 2 - 1);
    this.addChild(this.coinLabel);

    this.setCoins(0, 24);
  }

  setCoins(coins: number, max: number): void {
    const m = Math.max(1, max);
    const filled = Math.max(0, Math.min(m, Math.floor(coins)));
    this.coinLabel.text = String(Math.floor(coins));

    // Only redraw the segmented mask when the integer fill or max changes.
    if (filled === this.lastFilled && m === this.lastMax) return;
    this.lastFilled = filled;
    this.lastMax = m;

    const innerPad = Math.max(2, this.barH * 0.16);
    const fillH = this.barH - innerPad * 2;
    const cellW = this.fillW / m;            // one cell per coin
    const divider = Math.max(1.5, cellW * 0.16); // dark gap between gold pips
    const pipW = Math.max(1, cellW - divider);
    const pipR = Math.min(fillH * 0.45, pipW * 0.45, 5);

    const g = this.segMask;
    g.clear();
    for (let i = 0; i < filled; i++) {
      const x = this.fillX + i * cellW;
      g.roundRect(x, innerPad, pipW, fillH, pipR).fill(0xffffff);
    }
  }
}
