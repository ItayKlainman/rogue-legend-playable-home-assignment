import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { SpineCharacter } from '@shared/SpineCharacter';
import { tween } from '@shared/tween';
import { easeOutBack } from '@shared/easing';
import { autoSizeText } from '@shared/autoSizeText';
import { makeNineSlice } from '@shared/nineSlice';
import { GAME_FONT_STACK } from '@shared/gameFont';
import { RARITY_TINT, CRACK_TIER_LABEL } from '../../egg-summon/rarity';
import { rarityForTap, type CrackTier } from '../../egg-crack/rollup';
import { RarityBar } from '../../egg-crack/RarityBar';
import { loadCrackArt } from '../../egg-crack/catalog';
import { loadEggArt, loadUiTexture, BONECLAW_BUNDLE, BONECLAW_SKIN } from '../catalog';
import * as audio from '../../egg-summon/audio';
import fightBtnData from 'assets/UI/Button_Convex_Rectangle_01_Green.webp';

// A lean copy of egg-crack's tap-to-crack mini-game for the escalate reward: the
// altar (arch + tiled wall + green pad) is drawn with Graphics — NOT the heavy
// statue/torch summon sprites — so this scene adds no summon art to the bundle
// (keeps the build under the 5 MB network cap). The burst reveals the live
// Boneclaw Spine + a COLLECT button instead of the static-sprite EggReveal.
const TAPS = 5;
const AUTO_TAP_MS = 3000;
const EGG_FRAME_SCALE = 1.35;
const EGG_FRAME_DROP = 0.14;
const AUTO_COLLECT_MS = 6000;
// Nine-slice borders — match egg-summon's EggReveal so the banner + button
// render identically to the real game reveal.
const RARITY_BANNER_BORDER = { left: 69, bottom: 0, right: 72, top: 0 };
const FIGHT_BTN_BORDER = { left: 20, bottom: 29, right: 20, top: 19 };

interface StageGeom { cx: number; padY: number; eggY: number; eggH: number; u: number; }

export class EggCrackRewardScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private ready = false;

  private bg!: Graphics;
  private stage!: Container;
  private pad!: Graphics;
  private eggHolder!: Container;
  private eggGlow!: Sprite;
  private eggBody!: Sprite;

  private cta!: Text;
  private pointer!: Sprite;
  private pointerRestY = 0;
  private handTex!: Texture;
  private fightBtnTex!: Texture;
  private rarityBannerTex!: Texture;
  private bar!: RarityBar;
  private barW = 0;
  private barH = 0;
  private tierWord!: Text;

  private crackTex: Texture[] = [];
  private eggTex!: Record<'closed' | 'open' | 'shards' | 'burst' | 'ray' | 'glow', Texture>;

  // Reveal (post-burst)
  private revealRoot?: Container;
  private revealRays?: Container;
  private revealPet?: SpineCharacter;
  private collectBtn?: Container;
  private collectHand?: Sprite;
  private collectHandRestY = 0;
  private collectReady = false;
  private collectedSince = -1;

  private taps = 0;
  private started = false;   // gates the tap mini-game until the egg has dropped in
  private busy = false;
  private elapsed = 0;
  private idleSince = 0;
  private geom: StageGeom = { cx: 0, padY: 0, eggY: 0, eggH: 0, u: 0 };
  private fillX = 0; private fillW = 0; private fillY = 0; private fillH = 0;

  constructor(
    private petName: string,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    const [crackTex, eggTex, handTex, fightBtnTex, rarityBannerTex] = await Promise.all([
      loadCrackArt(),
      loadEggArt(),
      loadUiTexture('hand'),
      Assets.load(fightBtnData),
      loadUiTexture('rarityBanner'),
    ]);
    this.crackTex = crackTex;
    this.eggTex = eggTex;
    this.handTex = handTex;
    this.fightBtnTex = fightBtnTex;
    this.rarityBannerTex = rarityBannerTex;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.stage = new Container();
    this.container.addChild(this.stage);
    this.pad = new Graphics();
    this.stage.addChild(this.pad);

    this.eggHolder = new Container();
    this.eggGlow = new Sprite(eggTex.glow);
    this.eggGlow.anchor.set(0.5);
    this.eggGlow.alpha = 0.55;
    this.eggBody = new Sprite(this.crackTex[0]);
    this.eggBody.anchor.set(0.5, 1);
    this.eggHolder.addChild(this.eggGlow, this.eggBody);
    this.eggHolder.eventMode = 'static';
    this.eggHolder.cursor = 'pointer';
    this.eggHolder.on('pointerdown', () => void this.tapEgg());
    this.stage.addChild(this.eggHolder);

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

    // The egg was already awarded in the fight (FightScene victoryReward); here
    // it just rests on the pedestal. Brief beat, then open the tap-to-crack prompt.
    this.cta.visible = false;
    this.pointer.visible = false;

    this.ready = true;
    this.layout(this.width, this.height);
    void this.introSettle();
  }

  private async introSettle(): Promise<void> {
    await tween(this.ticker, 500, () => {});
    this.cta.visible = true;
    this.pointer.visible = true;
    this.started = true;
    this.idleSince = this.elapsed;
  }

  // ── TAP ────────────────────────────────────────────────────────────────────
  private async tapEgg(): Promise<void> {
    if (!this.started || this.busy || this.taps >= TAPS) return;
    this.busy = true;
    const tapIndex = this.taps;
    this.taps++;
    this.idleSince = this.elapsed;
    const tier = rarityForTap(tapIndex);
    const isFinal = this.taps >= TAPS;

    audio.eggCrack(0.9, 1 + tapIndex * 0.1);
    const stage = Math.min(this.taps, this.crackTex.length - 1);
    this.eggBody.texture = this.crackTex[stage];
    this.eggGlow.tint = RARITY_TINT[tier];
    this.eggGlow.alpha = 0.9;
    this.flashLight(tier, isFinal ? 1.9 : 1);
    this.bar.fill(tapIndex, tier);
    this.popTierWord(tier);
    if (this.taps === 1) { this.cta.visible = false; this.pointer.visible = false; }

    if (isFinal) {
      await tween(this.ticker, 420, () => {});
      void this.breakEgg();
      return;
    }
    const bs = this.eggBaseScale();
    await tween(this.ticker, 220, (t) => {
      const s = 1 + 0.16 * Math.sin(t * Math.PI);
      this.eggBody.scale.set(bs / s, bs * s);
      this.eggBody.rotation = Math.sin(t * Math.PI * 3) * 0.06;
    });
    this.eggBody.rotation = 0; this.eggBody.scale.set(bs);
    this.busy = false;
  }

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
    this.eggHolder.addChildAt(glow, eggIdx);
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

  private popTierWord(tier: CrackTier): void {
    this.tierWord.text = CRACK_TIER_LABEL[tier];
    this.tierWord.style.fill = RARITY_TINT[tier];
    this.tierWord.alpha = 0;
    void tween(this.ticker, 300, (t) => {
      this.tierWord.alpha = Math.min(1, t * 2.2);
      this.tierWord.scale.set(0.6 + 0.4 * easeOutBack(t));
    }).then(() => { this.tierWord.scale.set(1); this.tierWord.alpha = 1; });
  }

  private async breakEgg(): Promise<void> {
    this.cta.visible = false; this.pointer.visible = false;
    this.eggHolder.eventMode = 'none';
    void tween(this.ticker, 300, (t) => { this.bar.container.alpha = 1 - t; this.tierWord.alpha = 1 - t; });

    const bs = this.eggBaseScale();
    const KF: [number, number, number][] = [[0, 1, 1], [0.33, 0.9, 1.2], [0.66, 1.2, 0.9], [0.9, 0.84, 1.26], [1, 1, 1]];
    await tween(this.ticker, 260, (t) => {
      let p = KF[0], n = KF[1];
      for (let k = 1; k < KF.length; k++) { if (t <= KF[k][0]) { p = KF[k - 1]; n = KF[k]; break; } p = KF[k]; n = KF[k]; }
      const seg = n[0] - p[0]; const st = seg > 0 ? (t - p[0]) / seg : 1;
      this.eggBody.scale.set(bs * (p[1] + (n[1] - p[1]) * st), bs * (p[2] + (n[2] - p[2]) * st));
    });
    audio.summonReveal(1);
    this.openFlash();
    this.spawnShards();
    await tween(this.ticker, 240, (t) => {
      this.eggBody.scale.set(bs * (1 + 0.6 * t));
      this.eggBody.alpha = 1 - t;
      this.eggGlow.alpha = (1 - t) * 0.9;
    });
    this.eggHolder.visible = false;

    await this.revealSpinePet();
  }

  /** Fullscreen "ta-da" reveal, mirroring egg-summon's EggReveal layout: dim the
   *  pedestal, centre the live Boneclaw Spine with a ray sunburst + back glow,
   *  a tapered rarity banner + name up top, and a nine-slice COLLECT button with
   *  a pulsing hand at the bottom. */
  private async revealSpinePet(): Promise<void> {
    const fx = this.fillX, fy = this.fillY, fw = this.fillW, fh = this.fillH;
    const cx = fx + fw / 2;
    const cy = fy + fh * 0.58;   // sunburst/glow centre, behind the revealed pet
    const u = this.geom.u;
    const tint = RARITY_TINT.mythic;

    const root = new Container();
    this.revealRoot = root;
    this.container.addChild(root);

    // Dim the cracked pedestal so the reveal reads as a fresh moment.
    const dim = new Graphics().rect(fx, fy, fw, fh).fill({ color: 0x0a0618, alpha: 0.86 });
    dim.alpha = 0;
    root.addChild(dim);

    // Ray sunburst + soft back glow behind the pet.
    const rays = new Container(); rays.position.set(cx, cy); root.addChild(rays);
    const R = Math.min(fw, fh);
    const rayLen = (R * 0.5) / (this.eggTex.ray.width || 1);
    const RN = 14;
    for (let r = 0; r < RN; r++) {
      const ray = new Sprite(this.eggTex.ray);
      ray.anchor.set(0, 0.5); ray.tint = tint; ray.blendMode = 'add'; ray.alpha = 0.5;
      ray.rotation = (r / RN) * Math.PI * 2;
      ray.scale.set(rayLen);
      rays.addChild(ray);
    }
    rays.alpha = 0;
    this.revealRays = rays;
    const backGlow = new Sprite(this.eggTex.glow);
    backGlow.anchor.set(0.5); backGlow.tint = tint; backGlow.blendMode = 'add';
    backGlow.position.set(cx, cy); backGlow.alpha = 0;
    const bgScale = (R * 0.7) / (this.eggTex.glow.width || 1);
    backGlow.scale.set(bgScale);
    root.addChild(backGlow);

    // Live Boneclaw Spine. Size it to a fixed fraction of screen HEIGHT by
    // measuring its actual bounds, so it reads the same on any window/aspect
    // (a viewport-relative multiplier blew it up on larger screens). Centre its
    // bounding box low enough to clear the name text above.
    const pet = await SpineCharacter.create('crackRewardPet', BONECLAW_BUNDLE, this.ticker, {
      skin: BONECLAW_SKIN, animation: 'Idle',
    });
    this.revealPet = pet;
    pet.spine.scale.set(1);
    const lb = pet.spine.getLocalBounds();
    const rawH = (lb && lb.height > 1) ? lb.height : (1 / (BONECLAW_BUNDLE.defaultScale ?? 0.026));
    const target = (fh * 0.30) / rawH;          // pet ≈ 30% of screen height
    const petCy = fy + fh * 0.60;               // bounding-box centre sits here
    const boundsMidLocal = (lb && lb.height > 1) ? (lb.y + lb.height / 2) : 0;
    pet.spine.position.set(cx, petCy - boundsMidLocal * target);
    pet.spine.alpha = 0;
    root.addChild(pet.spine);

    // Tapered rarity banner ("MYTHIC") + pet name, upper band (clear of the pet).
    const titleGroup = new Container();
    titleGroup.position.set(cx, fy + fh * 0.18);
    const bannerW = u * 0.46, bannerH = u * 0.17;
    const banner = makeNineSlice({ texture: this.rarityBannerTex, border: RARITY_BANNER_BORDER, width: bannerW, height: bannerH });
    banner.tint = tint;
    banner.position.set(-bannerW / 2, -bannerH / 2);
    titleGroup.addChild(banner);
    const rarityText = autoSizeText({ text: 'MYTHIC', style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffffff, stroke: { color: 0x1a1a1a, width: 4 } }, maxWidth: bannerW * 0.6, maxHeight: bannerH * 0.5, minPx: 12, maxPx: 30 });
    rarityText.anchor.set(0.5);
    titleGroup.addChild(rarityText);
    titleGroup.scale.set(0);
    root.addChild(titleGroup);
    const nameText = autoSizeText({ text: this.petName, style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffffff, stroke: { color: 0x000000, width: 5 } }, maxWidth: fw * 0.74, maxHeight: fh * 0.07, minPx: 18, maxPx: 46 });
    nameText.anchor.set(0.5); nameText.position.set(cx, fy + fh * 0.28); nameText.scale.set(0);
    root.addChild(nameText);

    // Fade dim + rays in, then pop the pet, then the title/name.
    await tween(this.ticker, 240, (t) => { dim.alpha = t * 0.86; rays.alpha = t * 0.6; backGlow.alpha = t * 0.7; });
    await tween(this.ticker, 440, (t) => {
      const e = easeOutBack(t);
      pet.spine.alpha = Math.min(1, t * 2);
      pet.spine.scale.set((pet.facingLeft ? -1 : 1) * target * e, target * e);
    });
    await tween(this.ticker, 260, (t) => {
      const e = easeOutBack(t);
      titleGroup.scale.set(e); nameText.scale.set(e);
    });

    this.showCollectButton(cx, fy + fh * 0.82, u, root);
    this.collectReady = true;
    this.collectedSince = this.elapsed;
  }

  /** Nine-slice green COLLECT button + a hand that taps it from below (matching
   *  EggReveal: hand centred under the button, fingertip on it, bobbing). */
  private showCollectButton(cx: number, cyBtn: number, u: number, root: Container): void {
    const btn = new Container();
    const wdt = u * 0.55, hgt = u * 0.17;
    const bg = makeNineSlice({ texture: this.fightBtnTex, border: FIGHT_BTN_BORDER, width: wdt, height: hgt });
    bg.position.set(-wdt / 2, -hgt / 2);
    btn.addChild(bg);
    const label = autoSizeText({
      text: 'COLLECT',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffffff, stroke: { color: 0x1c3a12, width: 5 } },
      maxWidth: wdt * 0.7, maxHeight: hgt * 0.5, minPx: 18, maxPx: 40,
    });
    label.anchor.set(0.5); label.y = -hgt * 0.08;
    btn.addChild(label);
    btn.position.set(cx, cyBtn);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => this.collect());
    btn.scale.set(0);
    root.addChild(btn);
    this.collectBtn = btn;
    void tween(this.ticker, 300, (t) => { btn.scale.set(easeOutBack(t)); }).then(() => btn.scale.set(1));

    const hand = new Sprite(this.handTex);
    hand.anchor.set(0.381, 0.039);
    hand.height = u * 0.2; hand.scale.x = hand.scale.y;
    this.collectHandRestY = cyBtn;
    hand.position.set(cx, cyBtn);
    root.addChild(hand);
    this.collectHand = hand;
  }

  private collect(): void {
    if (!this.collectReady) return;
    this.collectReady = false;
    this.resolveDone();
  }

  private eggCenter(): { x: number; y: number } {
    return { x: this.geom.cx + this.geom.u * 0.006, y: this.geom.eggY - this.geom.eggH * 0.5 };
  }

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
        sh.y = y + Math.sin(a) * dist * t + R * 0.6 * t * t;
        sh.rotation = rot * t;
        sh.alpha = 1 - t * t;
      }).then(() => { if (!sh.destroyed) sh.destroy(); });
    }
  }

  async exit(): Promise<void> { this.container.destroy({ children: true }); }

  update(deltaMS: number): void {
    this.elapsed += deltaMS;
    if (this.started && !this.busy && this.taps < TAPS && this.elapsed - this.idleSince > AUTO_TAP_MS) {
      this.idleSince = this.elapsed;
      void this.tapEgg();
    }
    if (this.pointer?.visible) {
      const phase = (this.elapsed % 520) / 520;
      const press = Math.max(0, Math.sin(phase * Math.PI * 2));
      this.pointer.y = this.pointerRestY - press * this.geom.eggH * 0.16;
    }
    if (this.cta?.visible) this.cta.scale.set(1 + 0.05 * Math.sin(this.elapsed / 250));
    if (this.started && !this.busy && this.taps < TAPS && this.eggBody?.visible) {
      const bs = this.eggBaseScale();
      const f = 1 + 0.05 * Math.abs(Math.sin(this.elapsed / 380));
      this.eggBody.scale.set(bs * f);
      this.eggGlow.alpha = 0.4 + 0.25 * Math.abs(Math.sin(this.elapsed / 380));
    }
    if (this.collectReady) {
      if (this.revealRays) this.revealRays.rotation += deltaMS / 6000;
      if (this.collectHand) {
        const phase = (this.elapsed % 520) / 520;
        const press = Math.max(0, Math.sin(phase * Math.PI * 2));
        this.collectHand.y = this.collectHandRestY - press * this.geom.u * 0.05;
      }
      if (this.collectedSince >= 0 && this.elapsed - this.collectedSince > AUTO_COLLECT_MS) this.collect();
    }
  }

  pause(): void {}
  resume(): void {}

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

    const padW = u * 0.74;
    const padH = u * 0.20;
    this.pad.clear()
      .ellipse(cx, padY, padW * 0.5, padH * 0.5).fill(0x1f4a3a)
      .ellipse(cx, padY, padW * 0.42, padH * 0.42).fill(0x2e6b4f)
      .ellipse(cx, padY - padH * 0.04, padW * 0.40, padH * 0.40).stroke({ color: 0x6ff0d0, width: Math.max(2, u * 0.006), alpha: 0.9 });

    const eggCx = cx + u * 0.006;
    this.eggHolder.position.set(eggCx, 0);
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

    const barY = height * 0.86;
    this.bar.container.position.set(cx - this.barW / 2, barY);
    this.tierWord.position.set(cx, barY - this.barH - height * 0.045);

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
