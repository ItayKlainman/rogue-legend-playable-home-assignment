import { Container, Graphics, Sprite, Assets } from 'pixi.js';
import { requiresRoll, type PlayableEvent } from './PlayableDirector';

import skullIconData from 'assets/UI/skull_icon.webp';
import diceIconData from 'assets/UI/dice_icon.webp';

export interface FightMarker {
  isBoss: boolean;
  isElite: boolean;
}

export class FightProgressBar {
  readonly container: Container;

  private markers: FightMarker[];
  private targetRatio = 0;
  private currentRatio = 0;

  private bg!: Graphics;
  private fill!: Graphics;
  private icons: Sprite[] = [];
  private diceIcon!: Sprite;

  private barX = 0;
  private barY = 0;
  private barW = 0;
  private barH = 0;
  private ready = false;
  private fightIndex = 0;
  private pulseElapsed = 0;

  constructor(markers: FightMarker[]) {
    this.markers = markers;
    this.container = new Container();
  }

  static extractFights(events: PlayableEvent[]): FightMarker[] {
    return events
      .filter((e): e is Extract<PlayableEvent, { type: 'fight' }> => e.type === 'fight')
      .map(e => ({
        isBoss: !!(e.config as any).bossFight,
        isElite: !!(e.config as any).eliteFight,
      }));
  }

  async init(): Promise<void> {
    const skullTex = await Assets.load(skullIconData);

    this.bg = new Graphics();
    this.fill = new Graphics();
    this.container.addChild(this.bg, this.fill);

    // Dice icon at the bottom edge (start marker)
    const diceTex = await Assets.load(diceIconData);
    this.diceIcon = new Sprite(diceTex);
    this.diceIcon.anchor.set(0.5, 0.5);
    this.container.addChild(this.diceIcon);

    // Create icons bottom-to-top (first fight = bottom, last = top)
    // Boss/elite get red tint + larger scale
    for (const marker of this.markers) {
      const sprite = new Sprite(skullTex);
      sprite.anchor.set(0.5, 0.5);
      if (marker.isBoss || marker.isElite) sprite.tint = 0xdd3333;
      this.icons.push(sprite);
      this.container.addChild(sprite);
    }
    this.ready = true;
  }

  layout(screenW: number, screenH: number): void {
    if (!this.ready) return;
    // Fixed-size bar — only position changes with screen
    const w = 12;
    const h = 200;
    const marginLeft = 16;
    const x = marginLeft;
    const y = Math.round((screenH - h) / 2 - screenH * 0.08); // centered, nudged up

    this.barX = x;
    this.barY = y;
    this.barW = w;
    this.barH = h;

    this.container.x = x;
    this.container.y = y;

    // Distribute icons like a vertical layout group.
    // Dice icon at bottom, fight icons ascending, last icon at top edge.
    const count = this.markers.length;
    const spacing = h / count;

    // Dice icon at bottom edge (phantom slot position)
    this.diceIcon.x = w / 2;
    this.diceIcon.y = h;
    const diceTargetW = w * 2.6;
    this.diceIcon.scale.set(diceTargetW / this.diceIcon.texture.width);

    for (let i = 0; i < count; i++) {
      const sprite = this.icons[i];
      const marker = this.markers[i];
      // phantom at y=h (bottom), icons ascend from there
      const iconY = h - (i + 1) * spacing;
      sprite.x = w / 2;
      sprite.y = iconY;

      const targetW = marker.isBoss ? w * 2.8 : w * 2.0;
      const scaleVal = targetW / sprite.texture.width;
      sprite.scale.set(scaleVal);
    }

    this.draw();
  }

  update(deltaMS: number): void {
    if (Math.abs(this.currentRatio - this.targetRatio) < 0.001) {
      this.currentRatio = this.targetRatio;
    } else {
      this.currentRatio += (this.targetRatio - this.currentRatio) * 0.2;
      this.draw();
    }

    // Pulse the next fight icon (scale only)
    this.pulseElapsed += deltaMS;
    const nextIdx = this.fightIndex;
    if (nextIdx < this.icons.length && this.barW > 0) {
      const t = (Math.sin(this.pulseElapsed * 0.005) + 1) / 2; // 0..1
      const marker = this.markers[nextIdx];
      const baseW = marker.isBoss ? this.barW * 2.8 : this.barW * 2.0;
      const baseScale = baseW / this.icons[nextIdx].texture.width;
      this.icons[nextIdx].scale.set(baseScale * (1 + t * 0.15));
    }
  }

  setProgress(ratio: number): void {
    this.targetRatio = Math.min(1, Math.max(0, ratio));
  }

  advance(): void {
    // Reset outgoing icon to base scale
    if (this.fightIndex < this.icons.length && this.barW > 0) {
      const marker = this.markers[this.fightIndex];
      const baseW = marker.isBoss ? this.barW * 2.8 : this.barW * 2.0;
      this.icons[this.fightIndex].scale.set(baseW / this.icons[this.fightIndex].texture.width);
    }
    this.fightIndex++;
  }

  /**
   * Pre-compute a target fill ratio for each roll in the playable.
   * Each segment between fights is evenly subdivided by the rolls within it,
   * so non-fight rolls show smooth progression toward the next fight milestone.
   *
   * Tile events (treasure, dialogue, luckyWheel, etc.) require their own roll
   * but DON'T advance fight progression — they sit BETWEEN fights and
   * sub-segment the bar so the indicator creeps forward each roll.
   */
  static computeRollRatios(events: PlayableEvent[]): number[] {
    const fightCount = events.filter(e => e.type === 'fight').length;
    if (fightCount === 0) return [];

    // Count roll-required events per segment between fights. Anything that
    // requires its own roll counts here (fight + tile events).
    const segments: number[] = [];
    let rollsInSegment = 0;
    for (const event of events) {
      if (!requiresRoll(event.type)) continue;
      rollsInSegment++;
      if (event.type === 'fight') {
        segments.push(rollsInSegment);
        rollsInSegment = 0;
      }
    }
    // Trailing rolls after the last fight (rare) — append them to the last segment
    if (rollsInSegment > 0 && segments.length > 0) {
      segments[segments.length - 1] += rollsInSegment;
    }

    // Build ratio array: each roll maps to a fill ratio
    const ratios: number[] = [];
    for (let seg = 0; seg < segments.length; seg++) {
      const segStart = seg / fightCount;
      const segEnd = (seg + 1) / fightCount;
      const rolls = segments[seg];
      for (let r = 0; r < rolls; r++) {
        ratios.push(segStart + (segEnd - segStart) * (r + 1) / rolls);
      }
    }
    return ratios;
  }

  private draw(): void {
    const w = this.barW;
    const h = this.barH;
    if (w <= 0 || h <= 0) return;

    const r = w / 2;
    const border = 2;

    // Background track
    this.bg.clear();
    this.bg.roundRect(0, 0, w, h, r)
      .fill({ color: 0x1a1a2e })
      .stroke({ color: 0x333355, width: border });

    // Fill (rises from bottom)
    this.fill.clear();
    if (this.currentRatio > 0) {
      const fillH = Math.max(0, (h - border * 2) * this.currentRatio);
      const fillR = Math.max(0, r - 1);
      this.fill.roundRect(
        border,
        h - border - fillH,
        w - border * 2,
        fillH,
        fillR,
      ).fill({ color: 0x2ecaac });
    }
  }
}
