import { Container, Graphics, Sprite, Assets } from 'pixi.js';
import type { FightMarker } from './FightProgressBar';

import skullIconData from 'assets/UI/skull_icon.webp';
import diceIconData from 'assets/UI/dice_icon.webp';

export class FightProgressBarH {
  readonly container: Container;

  private markers: FightMarker[];
  private targetRatio = 0;
  private currentRatio = 0;
  private fightIndex = 0;

  private bg!: Graphics;
  private fill!: Graphics;
  private icons: Sprite[] = [];
  private swordIcon!: Sprite;

  private barX = 0;
  private barY = 0;
  private barW = 0;
  private barH = 0;
  private ready = false;
  private pulseElapsed = 0;

  constructor(markers: FightMarker[]) {
    this.markers = markers;
    this.container = new Container();
  }

  async init(): Promise<void> {
    const skullTex = await Assets.load(skullIconData);

    this.bg = new Graphics();
    this.fill = new Graphics();
    this.container.addChild(this.bg, this.fill);

    // Sword/dice icon at left edge (start marker)
    const diceTex = await Assets.load(diceIconData);
    this.swordIcon = new Sprite(diceTex);
    this.swordIcon.anchor.set(0.5, 0.5);
    this.container.addChild(this.swordIcon);

    // Skull icons distributed left-to-right
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

    const margin = 60;
    const h = 12;
    const y = 16;
    // Portrait: full width minus margins. Landscape: cap width and center so the bar
    // doesn't stretch into a thin line across a wide viewport.
    const landscape = screenW > screenH;
    const w = landscape ? Math.min(screenW - margin * 2, 560) : screenW - margin * 2;
    const x = landscape ? Math.round((screenW - w) / 2) : margin;

    this.barX = x;
    this.barY = y;
    this.barW = w;
    this.barH = h;

    this.container.x = x;
    this.container.y = y;

    // Distribute icons left-to-right
    const count = this.markers.length;
    const spacing = w / count;

    // Sword icon at left edge (phantom slot)
    this.swordIcon.x = 0;
    this.swordIcon.y = h / 2;
    const swordTargetH = h * 2.6;
    this.swordIcon.scale.set(swordTargetH / this.swordIcon.texture.height);

    for (let i = 0; i < count; i++) {
      const sprite = this.icons[i];
      const marker = this.markers[i];
      const iconX = (i + 1) * spacing;
      sprite.x = iconX;
      sprite.y = h / 2;

      const targetH = marker.isBoss ? h * 2.8 : h * 2.0;
      const scaleVal = targetH / sprite.texture.height;
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
    if (nextIdx < this.icons.length && this.barH > 0) {
      const t = (Math.sin(this.pulseElapsed * 0.005) + 1) / 2; // 0..1
      const marker = this.markers[nextIdx];
      const baseH = marker.isBoss ? this.barH * 2.8 : this.barH * 2.0;
      const baseScale = baseH / this.icons[nextIdx].texture.height;
      this.icons[nextIdx].scale.set(baseScale * (1 + t * 0.15));
    }
  }

  setProgress(ratio: number): void {
    this.targetRatio = Math.min(1, Math.max(0, ratio));
  }

  /** Advance one fight and animate the fill. */
  advance(): void {
    // Reset outgoing icon to base scale
    if (this.fightIndex < this.icons.length && this.barH > 0) {
      const marker = this.markers[this.fightIndex];
      const baseH = marker.isBoss ? this.barH * 2.8 : this.barH * 2.0;
      this.icons[this.fightIndex].scale.set(baseH / this.icons[this.fightIndex].texture.height);
    }
    this.fightIndex++;
    this.setProgress(this.fightIndex / this.markers.length);
  }

  private draw(): void {
    const w = this.barW;
    const h = this.barH;
    if (w <= 0 || h <= 0) return;

    const r = h / 2;
    const border = 2;

    // Background track
    this.bg.clear();
    this.bg.roundRect(0, 0, w, h, r)
      .fill({ color: 0x1a1a2e })
      .stroke({ color: 0x333355, width: border });

    // Fill (grows left-to-right)
    this.fill.clear();
    if (this.currentRatio > 0) {
      const fillW = Math.max(0, (w - border * 2) * this.currentRatio);
      const fillR = Math.max(0, r - 1);
      this.fill.roundRect(
        border,
        border,
        fillW,
        h - border * 2,
        fillR,
      ).fill({ color: 0x2ecaac });
    }
  }
}
