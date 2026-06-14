import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeOutBack } from '@shared/easing';
import { autoSizeText } from '@shared/autoSizeText';
import { GAME_FONT_STACK } from '@shared/gameFont';
import type { EggSummonScript } from '../../egg-summon/script';
import { RARITY_TINT, CRACK_TIER_LABEL } from '../../egg-summon/rarity';
import { EggReveal } from '../../egg-summon/eggReveal';
import { loadCrackArt, loadEggArt, loadRevealTexture, loadSummonTexture, loadUiTexture } from '../catalog';
import { rarityForTap, type CrackTier } from '../rollup';
import { RarityBar } from '../RarityBar';
import { TorchFlame } from '../../egg-summon/scenes/TorchFlame';
import * as audio from '../../egg-summon/audio';
import fightBtnData from 'assets/UI/Button_Convex_Rectangle_01_Green.webp';  // COLLECT CTA

const TAPS = 5;
// Idle safety net: if the player stalls this long between taps, auto-advance one
// tap so the ad never dead-ends before the reveal/CTA.
const AUTO_TAP_MS = 3500;
// The crack frames are a 512² canvas with the egg + transparent padding (stage-4
// light rays push the top out), so the egg reads smaller than a tight crop —
// scale up and nudge down so it sits on the pad like the egg-summon egg.
const EGG_FRAME_SCALE = 1.35;
const EGG_FRAME_DROP = 0.14;   // fraction of egg height to push the frame down

interface StageGeom { cx: number; padY: number; eggY: number; eggH: number; u: number; }

export class EggCrackScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private ready = false;

  // Pedestal scene (reused from egg-summon staging)
  private bg!: Graphics;
  private stage!: Container;
  private statue!: Sprite;
  private pad!: Graphics;
  private padFront!: Sprite;
  private torches: TorchFlame[] = [];
  private eggHolder!: Container;
  private eggGlow!: Sprite;
  private eggBody!: Sprite;

  // CTA + meter
  private cta!: Text;
  private pointer!: Sprite;
  private pointerRestY = 0;
  private handTex!: Texture;
  private bar!: RarityBar;
  private barW = 0;
  private barH = 0;
  private tierWord!: Text;

  private reveal!: EggReveal;

  // Loaded textures
  private crackTex: Texture[] = [];
  private eggTex!: Record<'closed' | 'open' | 'shards' | 'burst' | 'ray' | 'glow', Texture>;

  private taps = 0;
  private busy = false;
  private elapsed = 0;
  private idleSince = 0;
  private geom: StageGeom = { cx: 0, padY: 0, eggY: 0, eggH: 0, u: 0 };
  private fillX = 0; private fillW = 0; private fillY = 0; private fillH = 0;

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    const [crackTex, eggTex, statue, padFront, , torchSheet, handTex, rarityBanner, fightBtnTex] = await Promise.all([
      loadCrackArt(),
      loadEggArt(),
      loadSummonTexture('statue'),
      loadSummonTexture('padFront'),
      loadSummonTexture('padRim'),
      loadSummonTexture('torchSheet'),
      loadUiTexture('hand'),
      loadUiTexture('rarityBanner'),
      Assets.load(fightBtnData),
    ]);
    this.crackTex = crackTex;
    this.eggTex = eggTex;
    this.handTex = handTex;

    // ── Background ──
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    // ── Pedestal stage ──
    this.stage = new Container();
    this.container.addChild(this.stage);
    const backTorches = [new TorchFlame(torchSheet, 22, 0.0), new TorchFlame(torchSheet, 22, 0.5)];
    this.statue = new Sprite(statue);
    this.statue.anchor.set(0.5, 1);
    this.stage.addChild(this.statue);
    this.pad = new Graphics();
    this.stage.addChild(this.pad);
    this.padFront = new Sprite(padFront);
    this.padFront.anchor.set(0.5, 0.5);
    this.stage.addChild(this.padFront);

    // egg holder (glow + crack body)
    this.eggHolder = new Container();
    this.eggGlow = new Sprite(eggTex.glow);
    this.eggGlow.anchor.set(0.5);
    this.eggGlow.alpha = 0.55;
    this.eggBody = new Sprite(this.crackTex[0]);  // idle = first crack stage (faint hairline)
    this.eggBody.anchor.set(0.5, 1);
    this.eggHolder.addChild(this.eggGlow, this.eggBody);
    this.eggHolder.eventMode = 'static';
    this.eggHolder.cursor = 'pointer';
    this.eggHolder.on('pointerdown', () => void this.tapEgg());
    this.stage.addChild(this.eggHolder);

    const frontTorches = [new TorchFlame(torchSheet, 24, 0.2), new TorchFlame(torchSheet, 24, 0.7)];
    this.torches = [...backTorches, ...frontTorches];
    backTorches.forEach((t) => this.stage.addChildAt(t.sprite, this.stage.getChildIndex(this.statue)));
    frontTorches.forEach((t) => this.stage.addChild(t.sprite));

    // ── CTA + hand ──
    this.cta = autoSizeText({
      text: 'TAP THE EGG!',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffe066, stroke: { color: 0x000000, width: 6 } },
      maxWidth: this.width * 0.7, maxHeight: this.height * 0.07, minPx: 16, maxPx: 40,
    });
    this.cta.anchor.set(0.5);
    this.container.addChild(this.cta);
    this.pointer = new Sprite(this.handTex);
    this.pointer.anchor.set(0.381, 0.039);
    this.container.addChild(this.pointer);

    // ── Rarity meter (bottom) + tier word ──
    const u0 = Math.min(this.width, this.height * 0.62);
    this.barW = u0 * 0.62;
    this.barH = Math.max(12, u0 * 0.05);
    this.bar = new RarityBar(TAPS, this.barW, this.barH);
    this.container.addChild(this.bar.container);
    this.tierWord = new Text({
      text: '',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fontSize: 36, fill: 0xffffff, stroke: { color: 0x000000, width: 6 } },
    });
    this.tierWord.anchor.set(0.5);
    this.tierWord.alpha = 0;
    this.container.addChild(this.tierWord);

    // ── Shared reveal ──
    this.reveal = new EggReveal(this.ticker, {
      egg: { closed: this.eggTex.closed, glow: this.eggTex.glow, ray: this.eggTex.ray },
      rarityBanner, fightBtn: fightBtnTex, hand: this.handTex,
    }, () => ({ w: this.width, h: this.height, u: this.geom.u }));
    this.container.addChild(this.reveal.overlay);

    this.ready = true;
    this.layout(this.width, this.height);
    this.idleSince = this.elapsed;
  }

  // ── TAP ──────────────────────────────────────────────────────────────────
  private async tapEgg(): Promise<void> {
    if (this.busy || this.taps >= TAPS) return;
    this.busy = true;
    const tapIndex = this.taps;   // 0-based
    this.taps++;
    this.idleSince = this.elapsed;
    const tier = rarityForTap(tapIndex);   // clean upgrade up the ladder per tap
    const isFinal = this.taps >= TAPS;     // tap 5 reaches mythic — the climax

    // ── INSTANT feedback the moment the finger lands (Brawl-Stars style): the
    // egg cracks more, the rarity light bursts FROM the egg, the aura snaps to
    // the new tier, the meter fills, and the tier word pops. ──
    audio.eggCrack(0.9, 1 + tapIndex * 0.1);   // pitch climbs per upgrade
    const stage = Math.min(this.taps, this.crackTex.length - 1);
    this.eggBody.texture = this.crackTex[stage];
    this.eggGlow.tint = RARITY_TINT[tier];
    this.eggGlow.alpha = 0.9;
    this.flashLight(tier, isFinal ? 1.9 : 1);  // huge burst on the mythic tap
    this.bar.fill(tapIndex, tier);
    this.popTierWord(tier);

    if (isFinal) {
      // Tap 5 = mythic on the full-shatter frame (crack_5). Hold a short beat so
      // the player reads "MYTHIC!!!" on the shattered egg, then it bursts open.
      await tween(this.ticker, 420, () => {});
      void this.breakEgg();
      return;
    }

    // non-final: a quick squash/shake bump
    const bs = this.eggBaseScale();
    await tween(this.ticker, 220, (t) => {
      const s = 1 + 0.16 * Math.sin(t * Math.PI);
      this.eggBody.scale.set(bs / s, bs * s);
      this.eggBody.rotation = Math.sin(t * Math.PI * 3) * 0.06;
    });
    this.eggBody.rotation = 0; this.eggBody.scale.set(bs);
    this.busy = false;
  }

  /** A burst of rarity-colored light from the egg: a radial glow flash + rays
   *  flashing out from behind the egg (visible beyond its silhouette). */
  private flashLight(tier: CrackTier, intensity = 1): void {
    const tint = RARITY_TINT[tier];
    const cx = this.eggGlow.x, cy = this.eggGlow.y;
    const eggIdx = this.eggHolder.getChildIndex(this.eggBody);
    const R = this.geom.eggH * intensity;

    const glow = new Sprite(this.eggTex.glow);
    glow.anchor.set(0.5); glow.tint = tint; glow.blendMode = 'add';
    glow.position.set(cx, cy); glow.alpha = 0;
    const gBase = (R * 1.7) / (this.eggTex.glow.width || 1);
    glow.scale.set(gBase * 0.7);
    this.eggHolder.addChildAt(glow, eggIdx);   // behind the egg body
    void tween(this.ticker, 380, (t) => {
      if (glow.destroyed) return;
      glow.alpha = (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7) * 0.85;
      glow.scale.set(gBase * (0.7 + 0.5 * t));
    }).then(() => { if (!glow.destroyed) glow.destroy(); });

    const N = 9;
    const rayLen = (R * 1.15) / (this.eggTex.ray.width || 1);
    for (let r = 0; r < N; r++) {
      const ray = new Sprite(this.eggTex.ray);
      ray.anchor.set(0, 0.5); ray.tint = tint; ray.blendMode = 'add';
      ray.rotation = (r / N) * Math.PI * 2 - Math.PI / 2;
      ray.position.set(cx, cy); ray.scale.set(0); ray.alpha = 0;
      this.eggHolder.addChildAt(ray, eggIdx);
      void tween(this.ticker, 360, (t) => {
        if (ray.destroyed) return;
        ray.scale.set(Math.min(1, t / 0.22) * rayLen);
        ray.alpha = t < 0.22 ? t / 0.22 : Math.max(0, 1 - (t - 0.22) / 0.78);
      }).then(() => { if (!ray.destroyed) ray.destroy(); });
    }
  }

  private setTierWord(tier: CrackTier): void {
    this.tierWord.text = CRACK_TIER_LABEL[tier];
    this.tierWord.style.fill = RARITY_TINT[tier];
  }

  /** Smooth: set the settled tier word, then fade + scale-overshoot it in once. */
  private popTierWord(tier: CrackTier): void {
    this.setTierWord(tier);
    this.tierWord.alpha = 0;
    void tween(this.ticker, 300, (t) => {
      this.tierWord.alpha = Math.min(1, t * 2.2);
      this.tierWord.scale.set(0.6 + 0.4 * easeOutBack(t));
    }).then(() => { this.tierWord.scale.set(1); this.tierWord.alpha = 1; });
  }

  private async breakEgg(): Promise<void> {
    this.cta.visible = false; this.pointer.visible = false;
    this.eggHolder.eventMode = 'none';
    // fade the meter out as the egg opens (COLLECT takes the bottom)
    void tween(this.ticker, 300, (t) => { this.bar.container.alpha = 1 - t; this.tierWord.alpha = 1 - t; });

    // ── EGG OPENING animation, in place on the pedestal ──
    const bs = this.eggBaseScale();
    // 1) anticipation squash (the egg-open wind-up, like the game's SummonEgg_Open)
    const KF: [number, number, number][] = [[0, 1, 1], [0.33, 0.9, 1.2], [0.66, 1.2, 0.9], [0.9, 0.84, 1.26], [1, 1, 1]];
    await tween(this.ticker, 260, (t) => {
      let p = KF[0], n = KF[1];
      for (let k = 1; k < KF.length; k++) { if (t <= KF[k][0]) { p = KF[k - 1]; n = KF[k]; break; } p = KF[k]; n = KF[k]; }
      const seg = n[0] - p[0]; const st = seg > 0 ? (t - p[0]) / seg : 1;
      this.eggBody.scale.set(bs * (p[1] + (n[1] - p[1]) * st), bs * (p[2] + (n[2] - p[2]) * st));
    });
    // 2) BURST open: white + mythic flash, shell shards fly out
    audio.summonReveal(1);
    this.openFlash();
    this.spawnShards();
    // 3) the cracked egg pops bigger and fades as it splits open
    await tween(this.ticker, 240, (t) => {
      this.eggBody.scale.set(bs * (1 + 0.6 * t));
      this.eggBody.alpha = 1 - t;
      this.eggGlow.alpha = (1 - t) * 0.9;
    });
    this.eggHolder.visible = false;

    const egg = this.script.eggs[this.script.fighterIndex];   // the mythic Glacidrake
    const petTex = await loadRevealTexture(egg.pet);
    await this.reveal.run(petTex, egg.name, 'mythic');
    this.resolveDone();
  }

  /** World-space centre of the egg (for burst FX that outlive the egg holder). */
  private eggCenter(): { x: number; y: number } {
    return { x: this.geom.cx + this.geom.u * 0.006, y: this.geom.eggY - this.geom.eggH * 0.5 };
  }

  /** A white + mythic radial flash at the egg as it opens. */
  private openFlash(): void {
    const { x, y } = this.eggCenter();
    const R = this.geom.eggH;
    const layers: [number, number, number][] = [[0xffffff, 2.6, 360], [RARITY_TINT.mythic, 3.2, 480]];
    for (const [tint, mul, dur] of layers) {
      const f = new Sprite(this.eggTex.glow);
      f.anchor.set(0.5); f.tint = tint; f.blendMode = 'add';
      f.position.set(x, y); f.alpha = 0;
      const base = (R * mul) / (this.eggTex.glow.width || 1);
      f.scale.set(base * 0.5);
      this.container.addChild(f);
      void tween(this.ticker, dur, (t) => {
        if (f.destroyed) return;
        f.alpha = (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.9;
        f.scale.set(base * (0.5 + 0.7 * t));
      }).then(() => { if (!f.destroyed) f.destroy(); });
    }
  }

  /** Shell pieces flying out + falling as the egg breaks open. */
  private spawnShards(): void {
    const { x, y } = this.eggCenter();
    const R = this.geom.eggH;
    const N = 7;
    for (let i = 0; i < N; i++) {
      const sh = new Sprite(this.eggTex.shards);
      sh.anchor.set(0.5);
      sh.height = R * (0.18 + Math.random() * 0.12); sh.scale.x = sh.scale.y;
      sh.position.set(x, y);
      this.container.addChild(sh);
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.5;
      const dist = R * (0.5 + Math.random() * 0.5);
      const rot = (Math.random() - 0.5) * 6;
      void tween(this.ticker, 600, (t) => {
        if (sh.destroyed) return;
        sh.x = x + Math.cos(a) * dist * t;
        sh.y = y + Math.sin(a) * dist * t + R * 0.6 * t * t;   // gravity
        sh.rotation = rot * t;
        sh.alpha = 1 - t * t;
      }).then(() => { if (!sh.destroyed) sh.destroy(); });
    }
  }

  async exit(): Promise<void> {
    this.torches.forEach((t) => t.destroy());
    this.container.destroy({ children: true });
  }

  update(deltaMS: number): void {
    this.elapsed += deltaMS;
    for (const t of this.torches) t.update(deltaMS);
    // idle safety net
    if (this.ready && !this.busy && this.taps < TAPS && this.elapsed - this.idleSince > AUTO_TAP_MS) {
      this.idleSince = this.elapsed;
      void this.tapEgg();
    }
    if (this.pointer?.visible) {
      const phase = (this.elapsed % 520) / 520;
      const press = Math.max(0, Math.sin(phase * Math.PI * 2));
      this.pointer.y = this.pointerRestY - press * this.geom.eggH * 0.16;
    }
    if (this.cta?.visible) this.cta.scale.set(1 + 0.05 * Math.sin(this.elapsed / 250));
    // egg idle breathing while waiting for the next tap
    if (this.ready && !this.busy && this.taps < TAPS && this.eggBody?.visible) {
      const bs = this.eggBaseScale();
      const f = 1 + 0.05 * Math.abs(Math.sin(this.elapsed / 380));
      this.eggBody.scale.set(bs * f);
      this.eggGlow.alpha = 0.4 + 0.25 * Math.abs(Math.sin(this.elapsed / 380));
    }
    this.reveal?.update(this.elapsed, deltaMS);
  }

  pause(): void {}
  resume(): void {}

  // ── LAYOUT ────────────────────────────────────────────────────────────────
  private eggBaseScale(): number {
    return (this.geom.eggH * EGG_FRAME_SCALE) / (this.crackTex[0]?.height || 1);
  }

  layout(width: number, height: number, fillX = 0, fillW = width, fillY = 0, fillH = height): void {
    this.width = width; this.height = height;
    this.fillX = fillX; this.fillW = fillW; this.fillY = fillY; this.fillH = fillH;
    if (!this.ready) return;

    const u = Math.min(width, height * 0.62);
    const cx = width / 2;
    const padY = height * 0.585;
    const eggY = height * 0.595;
    const eggH = u * 0.36;
    this.geom = { cx, padY, eggY, eggH, u };

    this.drawBackground(width, height, u, cx, fillX, fillW, fillY, fillH);

    this.statue.position.set(cx, padY + u * 0.04);
    this.statue.height = u * 0.62;
    this.statue.scale.x = this.statue.scale.y;

    const padW = u * 0.74;
    const padH = u * 0.20;
    this.pad.clear()
      .ellipse(cx, padY, padW * 0.5, padH * 0.5).fill(0x1f4a3a)
      .ellipse(cx, padY, padW * 0.42, padH * 0.42).fill(0x2e6b4f)
      .ellipse(cx, padY - padH * 0.04, padW * 0.40, padH * 0.40).stroke({ color: 0x6ff0d0, width: Math.max(2, u * 0.006), alpha: 0.9 });
    this.padFront.width = padW * 1.02;
    this.padFront.scale.y = this.padFront.scale.x;
    this.padFront.position.set(cx, padY + padH * 0.45);

    const [bL, bR, fL, fR] = this.torches;
    bL.layout(cx - u * 0.27, padY - u * 0.02, u * 0.16);
    bR.layout(cx + u * 0.27, padY - u * 0.02, u * 0.16);
    fL.layout(cx - u * 0.34, padY + padH * 0.4, u * 0.24);
    fR.layout(cx + u * 0.34, padY + padH * 0.4, u * 0.24);

    const eggCx = cx + u * 0.006;
    this.eggHolder.position.set(eggCx, 0);
    // crack frame is square w/ padding: push down so the egg base sits on the pad
    this.eggBody.position.set(0, eggY + eggH * EGG_FRAME_DROP);
    this.eggBody.height = eggH * EGG_FRAME_SCALE;
    this.eggBody.scale.x = this.eggBody.scale.y;
    this.eggGlow.position.set(0, eggY - eggH * 0.5);
    this.eggGlow.width = eggH * 1.7;
    this.eggGlow.height = eggH * 1.7;

    this.cta.position.set(cx, height * 0.18);
    this.pointer.height = eggH * 0.8;
    this.pointer.scale.x = this.pointer.scale.y;
    this.pointerRestY = eggY - eggH * 0.12;
    this.pointer.position.set(eggCx, this.pointerRestY);

    // rarity meter + word, anchored low
    const barY = height * 0.86;
    this.bar.container.position.set(cx - this.barW / 2, barY);
    this.tierWord.position.set(cx, barY - this.barH - height * 0.045);

    this.reveal?.layoutBg(this.fillX, this.fillY, this.fillW, this.fillH);
    this.container.hitArea = { contains: () => true };
  }

  private drawBackground(w: number, h: number, u: number, cx: number, fillX = 0, fillW = w, fillY = 0, fillH = h): void {
    const g = this.bg.clear();
    g.rect(fillX, fillY, fillW, fillH).fill(0x241d3a);
    const bh = u * 0.06;
    const bw = u * 0.13;
    const top = fillY;
    const bottom = fillY + fillH;
    const startRow = Math.floor(top / bh);
    for (let row = startRow, y = startRow * bh; y < bottom; row++, y += bh) {
      const parity = ((row % 2) + 2) % 2;
      const off = parity * (bw / 2);
      for (let x = fillX - bw + off; x < fillX + fillW; x += bw) {
        g.roundRect(x + 2, y + 2, bw - 4, bh - 4, 3).fill(parity ? 0x2f2650 : 0x342a57);
      }
    }
    const archW = u * 0.78;
    const archX = cx - archW / 2;
    const archTop = h * 0.10;
    const archBottom = h * 0.66;
    const archR = archW / 2;
    g.moveTo(archX, archBottom)
      .lineTo(archX, archTop + archR)
      .arc(cx, archTop + archR, archR, Math.PI, 0)
      .lineTo(archX + archW, archBottom)
      .closePath()
      .fill(0x1b1530);
    g.moveTo(archX, archBottom)
      .lineTo(archX, archTop + archR)
      .arc(cx, archTop + archR, archR, Math.PI, 0)
      .lineTo(archX + archW, archBottom)
      .stroke({ color: 0x4a3d6e, width: Math.max(4, u * 0.02) });
    g.ellipse(cx, archBottom, archW * 0.5, u * 0.06).fill({ color: 0x2e6b4f, alpha: 0.5 });
  }
}
