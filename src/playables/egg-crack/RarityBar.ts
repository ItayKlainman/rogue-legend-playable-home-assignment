import { Container, Graphics } from 'pixi.js';
import { RARITY_TINT } from '../egg-summon/rarity';
import type { CrackTier } from './rollup';
import { barSegmentRects } from './rarityBarLayout';

const EMPTY = 0x2a2440;
const FRAME = 0x0c0a18;

/** Segmented rarity meter: each fill() lights one segment in its tier color. */
export class RarityBar {
  readonly container = new Container();
  private g = new Graphics();
  private filled: (CrackTier | null)[];

  constructor(private segments: number, private width: number, private height: number, private gap = 4) {
    this.filled = new Array(segments).fill(null);
    this.container.addChild(this.g);
    this.redraw();
  }

  /** Light segment `index` (0-based) in `tier`'s color, permanently. */
  fill(index: number, tier: CrackTier): void {
    if (index >= 0 && index < this.segments) this.filled[index] = tier;
    this.redraw();
  }

  private redraw(): void {
    const pad = 3;
    const rects = barSegmentRects(this.width, this.height, this.segments, this.gap);
    this.g.clear();
    this.g.roundRect(-pad, -pad, this.width + pad * 2, this.height + pad * 2, 8).fill(FRAME);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const tier = this.filled[i];
      this.g.roundRect(r.x, r.y, r.w, r.h, 3).fill(tier ? RARITY_TINT[tier] : EMPTY);
    }
  }
}
