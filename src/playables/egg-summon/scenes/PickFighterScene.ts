import { Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeInOutQuad, easeOutBack } from '@shared/easing';
import { autoSizeText } from '@shared/autoSizeText';
import type { EggSummonScript } from '../script';
import { RARITY_TINT } from '../rarity';
import { loadRevealTexture, loadUiTexture } from '../catalog';

/** Green_2 checkmark color (matches game's selected-pet indicator). */
const CHECK_COLOR = 0xc5e53c;

/** Background panel color (game's pet screen dark purple). */
const BG_COLOR = 0x231f2d;

interface FighterView {
  root: Container;
  frame: Sprite;
  icon: Sprite;
  check: Graphics;
}

export class PickFighterScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private ready = false;
  private bg!: Graphics;
  private title!: Text;
  private lastTitleWidth = -1;
  private icons: FighterView[] = [];
  private petTex: Awaited<ReturnType<typeof loadRevealTexture>>[] = [];
  private tileTex!: Texture;
  private busy = false;
  private elapsed = 0;
  private glowFor = -1;

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
    private onCta?: () => void,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
    this.glowFor = script.fighterIndex;
  }

  async enter(): Promise<void> {
    [this.petTex, this.tileTex] = await Promise.all([
      Promise.all(this.script.eggs.map((e) => loadRevealTexture(e.pet))),
      loadUiTexture('tileFrame'),
    ]);

    this.bg = new Graphics();
    this.container.addChild(this.bg);
    this.title = this.makeTitle();
    this.container.addChild(this.title);

    for (let i = 0; i < this.script.eggs.length; i++) {
      const root = new Container();

      // Rarity-tinted square frame sprite
      const frame = new Sprite(this.tileTex);
      frame.anchor.set(0.5);
      frame.tint = RARITY_TINT[this.script.eggs[i].rarity];

      // Pet icon centered inside the frame, with slight upward bias
      const icon = new Sprite(this.petTex[i]);
      icon.anchor.set(0.5);

      // Checkmark (hidden until selected)
      const check = new Graphics();
      check.visible = false;

      root.addChild(frame, icon, check);
      root.eventMode = 'static'; root.cursor = 'pointer';
      root.on('pointerdown', () => this.pick(i));
      this.container.addChild(root);
      this.icons.push({ root, frame, icon, check });
    }
    this.ready = true;
    this.layout(this.width, this.height);
  }

  private makeTitle(): Text {
    const t = autoSizeText({
      text: 'PICK YOUR FIGHTER',
      style: { fontFamily: 'Arial', fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 6 } },
      maxWidth: this.width * 0.9,
      maxHeight: this.height * 0.1,
      minPx: 20,
      maxPx: 72,
    });
    t.anchor.set(0.5);
    return t;
  }

  /** Draw a checkmark in the top-right of a tile of given side length. */
  private drawCheck(g: Graphics, side: number): void {
    g.clear();
    const s = side * 0.22; // checkmark icon size relative to tile
    const ox = side * 0.35; // offset from center to top-right corner
    const oy = -side * 0.35;
    // Checkmark path: three points forming a tick
    const x1 = ox - s * 0.5;  const y1 = oy + s * 0.1;
    const x2 = ox - s * 0.15; const y2 = oy + s * 0.5;
    const x3 = ox + s * 0.5;  const y3 = oy - s * 0.4;
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineTo(x3, y3);
    g.stroke({ color: CHECK_COLOR, width: Math.max(3, s * 0.2), cap: 'round', join: 'round' });
  }

  private async pick(i: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.onCta?.();

    const chosen = this.icons[i];

    // Show checkmark on selected tile
    chosen.check.visible = true;

    // Dim and fade other tiles
    this.icons.forEach((v, idx) => {
      if (idx !== i) tween(this.ticker, 300, (t) => { v.root.alpha = 1 - t * 0.7; });
    });

    // Select-pop: scale up then back, while brightening the frame briefly
    const baseScale = chosen.root.scale.x;
    await tween(this.ticker, 400, (t) => {
      const e = easeOutBack(t);
      const s = baseScale * (1 + 0.25 * Math.sin(t * Math.PI));
      chosen.root.scale.set(s);
      // Brighten frame during the pop
      chosen.frame.alpha = 1 + 0.3 * (1 - t);
    });
    chosen.root.scale.set(baseScale);
    chosen.frame.alpha = 1;

    // Short fly toward hero side (lower-left), then resolve
    const startX = chosen.root.x, startY = chosen.root.y;
    const targetX = this.width * 0.3, targetY = this.height * 0.7;
    await tween(this.ticker, 500, (t) => {
      const e = easeInOutQuad(t);
      chosen.root.position.set(
        startX + (targetX - startX) * e,
        startY + (targetY - startY) * e,
      );
      chosen.root.scale.set(baseScale * (1 + 0.3 * Math.sin(t * Math.PI)));
    });

    this.resolveDone();
  }

  async exit(): Promise<void> { this.container.destroy({ children: true }); }

  update(deltaMS: number): void {
    this.elapsed += deltaMS;
    if (this.glowFor >= 0 && !this.busy && this.icons[this.glowFor]) {
      // Gentle alpha pulse on the highlighted (mythic) frame
      const v = this.icons[this.glowFor];
      v.frame.alpha = 0.85 + 0.15 * Math.abs(Math.sin(this.elapsed / 400));
      // Subtle scale pulse
      const baseScale = v.root.scale.x;
      const pulse = 1 + 0.03 * Math.sin(this.elapsed / 500);
      // Only adjust if not mid-animation
      if (!this.busy) v.root.scale.set(baseScale * pulse / (1 + 0.03 * Math.sin((this.elapsed - deltaMS) / 500)));
    }
  }

  pause(): void {}
  resume(): void {}

  layout(width: number, height: number, fillX = 0, fillW = width, fillY = 0, fillH = height): void {
    this.width = width; this.height = height;
    if (!this.ready) return;
    this.bg.clear().rect(fillX, fillY, fillW, fillH).fill(BG_COLOR);
    if (width !== this.lastTitleWidth) {
      this.title.destroy();
      this.title = this.makeTitle();
      this.container.addChild(this.title);
      this.lastTitleWidth = width;
    }
    this.title.position.set(width / 2, height * 0.2);
    const n = this.icons.length;
    const gap = Math.min(width / (n + 1), 190);
    const side = gap * 0.9; // tile side length (square frame)

    for (let i = 0; i < n; i++) {
      const v = this.icons[i];
      v.root.position.set(width / 2 + (i - (n - 1) / 2) * gap, height * 0.6);

      // Square frame (uniform scale so it stays square)
      v.frame.width = side;
      v.frame.height = side;

      // Pet icon at ~70% of frame, shifted slightly upward
      const iconSize = side * 0.7;
      v.icon.height = iconSize;
      v.icon.scale.x = v.icon.scale.y;
      v.icon.position.set(0, -side * 0.05); // slight upward bias

      // Highlight state: mythic tile is brighter; others slightly dimmed
      const isHero = i === this.glowFor;
      v.frame.alpha = isHero ? 1.0 : 0.65;
      v.root.alpha = 1;

      // Redraw checkmark for current tile size
      this.drawCheck(v.check, side);
    }
    this.container.hitArea = { contains: () => true };
  }
}
