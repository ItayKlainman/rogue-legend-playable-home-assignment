import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeOutBack } from '@shared/easing';
import { autoSizeText } from '@shared/autoSizeText';
import { GAME_FONT_STACK } from '@shared/gameFont';
import { RARITY_TINT } from '../rarity';
import { loadRevealTexture, loadUiTexture } from '../catalog';
import type { EggReveal, EggSummonScript } from '../script';
import * as audio from '../audio';
import { pickPetTilePositions, pickPetTileSize, dimTargets } from './pickPetLayout';
import glowData from 'assets/egg-summon/egg/glow.webp';

const BG_COLOR = 0x231f2d;     // game pet-screen dark purple
const CHECK_COLOR = 0xc5e53c;  // Green_2 selected indicator
const AUTO_PICK_MS = 6000;

interface PetTile {
  root: Container;
  halo: Sprite;
  frame: Sprite;
  icon: Sprite;
  name: Text;
  check: Graphics;
  sparkles: { g: Graphics; phase: number }[];
  baseScale: number;
}

/** Reward step: the egg opens into two new pets; the player picks one (juicy),
 *  then the flow continues to the end card. */
export class PickPetScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private ready = false;
  private busy = false;
  private elapsed = 0;
  private bg!: Graphics;
  private title!: Text;
  private hand!: Sprite;
  private tiles: PetTile[] = [];
  private pets: EggReveal[];

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((r) => { this.resolveDone = r; });
    // The two NEW pets = the eggs that did NOT become the fighter.
    this.pets = this.script.eggs.filter((_, i) => i !== this.script.fighterIndex);
  }

  async enter(): Promise<void> {
    const [petTex, tileTex, handTex, glowTex] = await Promise.all([
      Promise.all(this.pets.map((p) => loadRevealTexture(p.pet))),
      loadUiTexture('tileFrame'),
      loadUiTexture('hand'),
      Assets.load(glowData),
    ]);

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.title = this.makeTitle();
    this.container.addChild(this.title);

    for (let i = 0; i < this.pets.length; i++) {
      const root = new Container();
      const tint = RARITY_TINT[this.pets[i].rarity];

      const halo = new Sprite(glowTex);
      halo.anchor.set(0.5); halo.tint = tint; halo.blendMode = 'add'; halo.alpha = 0.5;

      const frame = new Sprite(tileTex);
      frame.anchor.set(0.5); frame.tint = tint;

      const icon = new Sprite(petTex[i]);
      icon.anchor.set(0.5);

      const name = new Text({
        text: this.pets[i].name,
        style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fontSize: 26, fill: 0xffffff, stroke: { color: 0x000000, width: 5 } },
      });
      name.anchor.set(0.5, 0);

      const check = new Graphics();
      check.visible = false;

      const sparkles: { g: Graphics; phase: number }[] = [];
      for (let s = 0; s < 5; s++) {
        const star = this.makeStar(6);
        star.blendMode = 'add';
        sparkles.push({ g: star, phase: (s / 5) * Math.PI * 2 });
      }

      root.addChild(halo, frame, icon, name, check, ...sparkles.map((s) => s.g));
      root.eventMode = 'static'; root.cursor = 'pointer';
      root.on('pointerdown', () => void this.pick(i));
      this.container.addChild(root);
      this.tiles.push({ root, halo, frame, icon, name, check, sparkles, baseScale: 1 });
    }

    this.hand = new Sprite(handTex);
    this.hand.anchor.set(0.381, 0.039);
    this.container.addChild(this.hand);

    this.ready = true;
    this.layout(this.width, this.height);

    // Juicy entrance: title slam + tiles bounce in (overshoot).
    this.title.scale.set(0);
    void tween(this.ticker, 320, (t) => { if (!this.title.destroyed) this.title.scale.set(easeOutBack(Math.min(1, t * 1.2))); })
      .then(() => { if (!this.title.destroyed) this.title.scale.set(1); });
    for (const tile of this.tiles) {
      tile.root.scale.set(0);
      void tween(this.ticker, 420, (t) => { if (!tile.root.destroyed) tile.root.scale.set(easeOutBack(t) * tile.baseScale); })
        .then(() => { if (!tile.root.destroyed) tile.root.scale.set(tile.baseScale); });
    }

    // Auto-pick fallback so the ad never dead-ends.
    void tween(this.ticker, AUTO_PICK_MS, () => {}).then(() => { if (!this.busy) void this.pick(0); });
  }

  private makeTitle(): Text {
    const t = autoSizeText({
      text: 'CHOOSE YOUR PET!',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffe066, stroke: { color: 0x000000, width: 7 } },
      maxWidth: this.width * 0.92, maxHeight: this.height * 0.1, minPx: 22, maxPx: 64,
    });
    t.anchor.set(0.5);
    return t;
  }

  private makeStar(outer: number): Graphics {
    const inner = outer * 0.4;
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new Graphics().poly(pts).fill(0xffe27a);
  }

  private drawCheck(g: Graphics, side: number): void {
    g.clear();
    const s = side * 0.22, ox = side * 0.35, oy = -side * 0.35;
    g.moveTo(ox - s * 0.5, oy + s * 0.1).lineTo(ox - s * 0.15, oy + s * 0.5).lineTo(ox + s * 0.5, oy - s * 0.4)
      .stroke({ color: CHECK_COLOR, width: Math.max(3, s * 0.2), cap: 'round', join: 'round' });
  }

  private async pick(i: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hand.visible = false;

    const chosen = this.tiles[i];
    const side = pickPetTileSize(this.width, this.tiles.length);

    // Sound: confirm sting + pet reveal.
    audio.buttonTap(0.9);
    audio.collect(1);
    audio.summonReveal(1);

    // Full-screen white flash.
    const flash = new Graphics().rect(0, 0, this.width, this.height).fill(0xffffff);
    flash.alpha = 0;
    this.container.addChild(flash);
    void tween(this.ticker, 280, (t) => { if (!flash.destroyed) flash.alpha = (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7) * 0.8; })
      .then(() => { if (!flash.destroyed) flash.destroy(); });

    // Checkmark + halo flare on the chosen tile.
    chosen.check.visible = true;
    chosen.halo.alpha = 0.95;

    // Dim the losers: desaturate, shrink, fade.
    for (const idx of dimTargets(i, this.tiles.length)) {
      const v = this.tiles[idx];
      const bs = v.baseScale;
      void tween(this.ticker, 360, (t) => {
        if (v.root.destroyed) return;
        v.root.alpha = 1 - t * 0.75;
        v.root.scale.set(bs * (1 - t * 0.25));
        v.frame.tint = 0x888888;
      });
    }

    // Shockwave ring out of the chosen tile.
    const ring = new Graphics().circle(0, 0, side * 0.4).stroke({ color: 0xffffff, width: 6, alpha: 0.9 });
    ring.position.copyFrom(chosen.root.position); ring.blendMode = 'add';
    this.container.addChild(ring);
    void tween(this.ticker, 420, (t) => { if (ring.destroyed) return; ring.scale.set(0.6 + t * 1.8); ring.alpha = (1 - t) * 0.9; })
      .then(() => { if (!ring.destroyed) ring.destroy(); });

    // Confetti/star burst from the chosen tile.
    for (let k = 0; k < 16; k++) {
      const st = this.makeStar(side * (0.04 + Math.random() * 0.03));
      st.blendMode = 'add';
      st.position.copyFrom(chosen.root.position);
      this.container.addChild(st);
      const ang = Math.random() * Math.PI * 2, sp = side * (0.5 + Math.random() * 0.7);
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
      void tween(this.ticker, 600 + Math.random() * 300, (t) => {
        if (st.destroyed) return;
        st.x = chosen.root.x + vx * t;
        st.y = chosen.root.y + vy * t + side * 0.6 * t * t;
        st.rotation += 0.2; st.alpha = 1 - t * t;
      }).then(() => { if (!st.destroyed) st.destroy(); });
    }

    // Elastic pop on the chosen tile.
    const bs = chosen.baseScale;
    await tween(this.ticker, 420, (t) => {
      if (chosen.root.destroyed) return;
      chosen.root.scale.set(bs * (1 + 0.35 * Math.sin(Math.min(1, t) * Math.PI)));
    });
    if (!chosen.root.destroyed) chosen.root.scale.set(bs);

    // Celebratory hold, then resolve → end card (the scene crossfade dissolves out).
    await tween(this.ticker, 600, () => {});
    this.resolveDone();
  }

  update(deltaMS: number): void {
    if (!this.ready || this.busy) return;
    this.elapsed += deltaMS;
    for (const tile of this.tiles) {
      if (tile.root.destroyed) continue;
      tile.halo.alpha = 0.4 + 0.2 * Math.abs(Math.sin(this.elapsed / 420));
      for (const s of tile.sparkles) {
        if (s.g.destroyed) continue;
        s.g.alpha = 0.4 + 0.6 * Math.abs(Math.sin(this.elapsed / 260 + s.phase));
        s.g.scale.set(0.8 + 0.4 * Math.abs(Math.sin(this.elapsed / 300 + s.phase)));
      }
    }
    if (this.hand.visible && this.tiles.length >= 2) {
      const p = (Math.sin(this.elapsed / 700) + 1) / 2;
      const a = this.tiles[0].root.position, b = this.tiles[1].root.position;
      const side = pickPetTileSize(this.width, this.tiles.length);
      this.hand.position.set(a.x + (b.x - a.x) * p, a.y + side * 0.55 + 24);
    }
  }

  pause(): void {}
  resume(): void {}

  async exit(): Promise<void> { this.container.destroy({ children: true }); }

  layout(width: number, height: number, fillX = 0, fillW = width, fillY = 0, fillH = height): void {
    this.width = width; this.height = height;
    if (!this.ready) return;
    this.bg.clear().rect(fillX, fillY, fillW, fillH).fill(BG_COLOR);
    this.title.position.set(width / 2, height * 0.2);

    const positions = pickPetTilePositions(this.tiles.length, width, height);
    const side = pickPetTileSize(width, this.tiles.length);
    for (let i = 0; i < this.tiles.length; i++) {
      const v = this.tiles[i];
      v.root.position.set(positions[i].x, positions[i].y);
      v.frame.width = side; v.frame.height = side;
      v.halo.width = v.halo.height = side * 1.6;
      v.halo.position.set(0, -side * 0.08);
      // Pets are the focal point: big, sitting in their (now larger) frame with a
      // slight overflow so the frame reads as a matching pedestal behind the pet.
      const iconSize = side * 1.05;
      v.icon.height = iconSize; v.icon.scale.x = v.icon.scale.y;
      v.icon.position.set(0, -side * 0.08);
      v.name.style.fontSize = Math.max(16, side * 0.16);
      v.name.position.set(0, side * 0.5 + 6);
      this.drawCheck(v.check, side);
      v.sparkles.forEach((s, k) => {
        const a = (k / v.sparkles.length) * Math.PI * 2;
        s.g.position.set(Math.cos(a) * side * 0.55, Math.sin(a) * side * 0.55 - side * 0.05);
      });
    }
    this.hand.height = Math.min(width, height) * 0.2; this.hand.scale.x = this.hand.scale.y;
    this.container.hitArea = { contains: () => true };
  }
}
