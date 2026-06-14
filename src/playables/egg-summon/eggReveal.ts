import { Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js';
import { tween } from '@shared/tween';
import { easeOutBack } from '@shared/easing';
import { makeNineSlice } from '@shared/nineSlice';
import { autoSizeText } from '@shared/autoSizeText';
import { GAME_FONT_STACK } from '@shared/gameFont';
import { RARITY_TINT } from './rarity';
import * as audio from './audio';

const FIGHT_BTN_BORDER = { left: 20, bottom: 29, right: 20, top: 19 };
const RARITY_BANNER_BORDER = { left: 69, bottom: 0, right: 72, top: 0 };
const PILL_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic',
};

export interface EggRevealTextures {
  egg: Record<'closed' | 'glow' | 'ray', Texture>;
  rarityBanner: Texture;
  fightBtn: Texture;
  hand: Texture;
}

/** Geometry the reveal needs from the host scene. */
export interface RevealGeom { w: number; h: number; u: number; }

/** The egg-open reveal + COLLECT sequence, shared by egg-summon and egg-crack.
 *  Replays SummonEgg_Open.anim one-for-one, then shows a COLLECT CTA that
 *  resolves run()'s promise when the player collects (tap or late auto-tap). */
export class EggReveal {
  readonly overlay = new Container();
  private bg = new Graphics();
  private content = new Container();

  private rays: Container | null = null;            // dense rarity sunburst behind the pet
  private sparkles: { g: Graphics; phase: number }[] = []; // twinkling gold stars
  private juiceReady = false;                       // gates the continuous pulse/twinkle
  private pet: Sprite | null = null;                // for the idle bob
  private petBaseScale = 1;
  private cta: Container | null = null;             // FIGHT!/COLLECT button after the reveal
  private ctaHand: Sprite | null = null;
  private ctaHandRestY = 0;
  private ctaReady = false;                          // gates the CTA pulse + accepts the tap

  private fillX = 0; private fillY = 0; private fillW = 0; private fillH = 0;
  private resolveRun: (() => void) | null = null;

  constructor(
    private ticker: Ticker,
    private tex: EggRevealTextures,
    private geom: () => RevealGeom,
  ) {
    this.overlay.visible = false;
    this.overlay.addChild(this.bg, this.content);
  }

  /** Run the full reveal for `petTexture`/`name` at `rarity`, then show COLLECT.
   *  Resolves when the player collects (tap or late auto-tap). */
  run(petTexture: Texture, name: string, rarity: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveRun = resolve;
      void this.playReveal(petTexture, name, rarity);
    });
  }

  private async playReveal(petTexture: Texture, name: string, rarity: string): Promise<void> {
    await this.showRevealScreen(petTexture, name, rarity);
    // Hold a beat on the dragon, then present a CTA the player taps.
    await tween(this.ticker, 500, () => {});
    this.showRevealCta();
  }

  // ── REVEAL — replays SummonEgg_Open.anim one-for-one (clip = 1.333s) ──────
  private async showRevealScreen(petTexture: Texture, name: string, rarity: string): Promise<void> {
    const { w, h, u } = this.geom();
    this.overlay.visible = true;
    this.overlay.alpha = 1;
    this.drawBg();
    const content = this.content;
    const cx = w / 2, cy = h * 0.5;
    const R = Math.min(w, h);
    const tint = RARITY_TINT[rarity];
    const eggR = R * 0.20;
    const rayLenScale = (px: number) => px / (this.tex.egg.ray.width || 1);
    const glowScale = (px: number) => px / (this.tex.egg.glow.width || 1);

    // ── Rarity rays (Ray_1..9) split BACK(5)/FRONT(4) of the egg ──
    const backRays = new Container(); backRays.position.set(cx, cy); content.addChild(backRays);
    const eggSprite = new Sprite(this.tex.egg.closed);
    eggSprite.anchor.set(0.5); eggSprite.position.set(cx, cy);
    eggSprite.height = eggR; eggSprite.scale.x = eggSprite.scale.y;
    const eggBaseS = eggSprite.scale.y;
    const eggWhite = new Sprite(this.tex.egg.closed);   // Chest_Closed/White
    eggWhite.anchor.set(0.5); eggWhite.position.set(cx, cy);
    eggWhite.height = eggR; eggWhite.scale.x = eggWhite.scale.y; eggWhite.tint = 0xffffff; eggWhite.blendMode = 'add'; eggWhite.alpha = 0;
    content.addChild(eggSprite, eggWhite);
    const frontRays = new Container(); frontRays.position.set(cx, cy); content.addChild(frontRays);
    const rarityRays: Sprite[] = [];
    const RAY_N = 14;                                  // denser, cleaner burst (like the game)
    const rarityRayScale = rayLenScale(R * 0.42);
    for (let r = 0; r < RAY_N; r++) {
      const ray = new Sprite(this.tex.egg.ray);
      ray.anchor.set(0, 0.5); ray.tint = tint; ray.blendMode = 'add';
      ray.rotation = (r / RAY_N) * Math.PI * 2 - Math.PI / 2;
      ray.scale.set(rarityRayScale, rarityRayScale * 0.7);  // thinner than long → crisp rays
      (r % 2 === 0 ? backRays : frontRays).addChild(ray);
      rarityRays.push(ray);
    }

    // ── Open VFX (Open_VFX_Holder), created hidden ──
    const glowWhite = new Sprite(this.tex.egg.glow);
    glowWhite.anchor.set(0.5); glowWhite.tint = 0xffffff; glowWhite.blendMode = 'add';
    glowWhite.position.set(cx, cy); glowWhite.scale.set(0); glowWhite.visible = false;
    const circles = [0, 1, 2].map(() => {
      const c = new Sprite(this.tex.egg.glow);
      c.anchor.set(0.5); c.tint = 0xffffff; c.blendMode = 'add';
      c.position.set(cx, cy); c.scale.set(0); c.alpha = 0;
      return c;
    });
    const openRayHolder = new Container(); openRayHolder.position.set(cx, cy);
    const openRays: Sprite[] = [];
    const OPEN_RAY_N = 12;
    const openRayScale = rayLenScale(R * 0.40);
    for (let i = 0; i < OPEN_RAY_N; i++) {
      const ray = new Sprite(this.tex.egg.ray);
      ray.anchor.set(0, 0.5); ray.tint = 0xffffff; ray.blendMode = 'add';
      ray.rotation = (i / OPEN_RAY_N) * Math.PI * 2 - Math.PI / 2;
      ray.scale.set(0); ray.visible = false;
      openRayHolder.addChild(ray); openRays.push(ray);
    }
    const star = this.makeStar(4, R * 0.15, R * 0.04, 0xffffff);
    star.position.set(cx, cy); star.scale.set(0); star.blendMode = 'add'; star.visible = false;
    const petBackGlow = new Sprite(this.tex.egg.glow);
    petBackGlow.anchor.set(0.5); petBackGlow.tint = tint; petBackGlow.blendMode = 'add';
    petBackGlow.position.set(cx, cy); petBackGlow.scale.set(0); petBackGlow.visible = false;
    const pet = new Sprite(petTexture);
    pet.anchor.set(0.5); pet.position.set(cx, cy);
    const petH = Math.min(h * 0.30, u * 0.5);
    pet.height = petH; pet.scale.x = pet.scale.y;
    const petTargetScale = pet.scale.y; pet.scale.set(0);
    // z-order: glow circles → open rays → star → back glow → pet (pet on top)
    content.addChild(...circles, openRayHolder, star, petBackGlow, pet);

    // ── Rarity title (game's tapered banner, tinted per rarity) + name ──
    const titleGroup = new Container();
    titleGroup.position.set(cx, h * 0.24);
    const bannerW = u * 0.42, bannerH = u * 0.16;
    const banner = makeNineSlice({ texture: this.tex.rarityBanner, border: RARITY_BANNER_BORDER, width: bannerW, height: bannerH });
    banner.tint = tint;
    banner.position.set(-bannerW / 2, -bannerH / 2);
    titleGroup.addChild(banner);
    const rarityText = autoSizeText({ text: PILL_LABEL[rarity] ?? rarity, style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffffff, stroke: { color: 0x1a1a1a, width: 4 } }, maxWidth: bannerW * 0.6, maxHeight: bannerH * 0.5, minPx: 12, maxPx: 30 });
    rarityText.anchor.set(0.5); rarityText.position.set(0, 0);
    titleGroup.addChild(rarityText);
    titleGroup.scale.set(0); content.addChild(titleGroup);
    const nameText = autoSizeText({ text: name, style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffffff, stroke: { color: 0x000000, width: 5 } }, maxWidth: w * 0.8, maxHeight: h * 0.08, minPx: 18, maxPx: 56 });
    nameText.anchor.set(0.5); nameText.position.set(cx, h * 0.32); nameText.scale.set(0); content.addChild(nameText);

    // ── Curves (clip seconds) ──
    const EGG_SQUASH: [number, number][] = [[0, 1], [0.083, 0.9], [0.167, 1.2], [0.233, 0.842], [0.25, 1]];
    const STAR_S: [number, number][] = [[0.25, 0], [0.267, 0.5], [0.5, 1], [0.583, 0]];
    const PET_S: [number, number][] = [[0.833, 0], [1.0, 1.1], [1.083, 1]];
    const TITLE_S: [number, number][] = [[0.917, 0], [1.083, 1.05], [1.25, 1]];
    const NAME_S: [number, number][] = [[1.083, 0], [1.25, 1.05], [1.333, 1]];
    const CLIP = 1.3333;
    let glitterFired = false;
    let punchFired = false;
    let washFired = false;

    await tween(this.ticker, CLIP * 1000, (t) => {   // real game speed (1.333s clip)
      const ct = t * CLIP;
      // egg squash + vanish at 0.25
      const sq = sampleCurve(EGG_SQUASH, ct);
      eggSprite.scale.set(eggBaseS * sq); eggWhite.scale.set(eggBaseS * sq);
      eggSprite.visible = ct < 0.25; eggWhite.alpha = ct < 0.25 ? 0.35 * sq : 0;
      // rarity rays fade out 0–0.25, then return 0.583–0.833 behind the pet
      let rAlpha = 1;
      if (ct < 0.25) rAlpha = 1 - ct / 0.25;
      else if (ct < 0.583) rAlpha = 0;
      else rAlpha = Math.min(1, (ct - 0.583) / 0.25);
      backRays.alpha = frontRays.alpha = rAlpha;
      // FULL-SCREEN white flash on open (the game's defining white burst).
      glowWhite.visible = ct >= 0.24 && ct < 0.46;
      if (glowWhite.visible) {
        const ft = (ct - 0.24) / 0.22;
        glowWhite.scale.set(glowScale(R * 2.6));
        glowWhite.alpha = ft < 0.12 ? ft / 0.12 : 1 - (ft - 0.12) / 0.88;   // hard in, soft out
      }
      // a crisp white screen wash layered on the radial for the first instant
      if (ct >= 0.25 && !washFired) {
        washFired = true;
        const wash = new Graphics().rect(0, 0, w, h).fill(0xffffff); wash.alpha = 0; content.addChild(wash);
        void tween(this.ticker, 300, (pt) => { wash.alpha = pt < 0.2 ? (pt / 0.2) * 0.85 : 0.85 * (1 - (pt - 0.2) / 0.8); }).then(() => wash.destroy());
      }
      // GlowWhiteStar 0.25→0.5(peak)→0.583
      star.visible = ct >= 0.25 && ct < 0.59;
      if (star.visible) { star.scale.set(sampleCurve(STAR_S, ct)); star.rotation = (ct - 0.25) * 1.2; }
      // 3 GlowCircles staggered pulse (low alpha)
      circles.forEach((c, i) => {
        const o = 0.05 * i;
        const sc = sampleCurve([[0.25 + o, 1], [0.5 + o, 0], [0.75 + o, 1]], ct);
        c.scale.set(glowScale(R * 0.5) * sc); c.alpha = sampleCurve([[0.25 + o, 0], [0.5 + o, 0.22], [0.75 + o, 0]], ct);
      });
      // White open-rays burst out TOGETHER, grow 0.28→0.34, fade 0.5→0.55.
      const parentA = ct < 0.5 ? 1 : ct < 0.55 ? 1 - (ct - 0.5) / 0.05 : 0;
      openRays.forEach((ray) => {
        ray.visible = ct >= 0.28 && ct < 0.56;
        if (ray.visible) { ray.scale.set(openRayScale * Math.min(1, (ct - 0.28) / 0.06)); ray.alpha = parentA; }
      });
      // Burst_Glitter + Loop_Glitter at 0.55
      if (ct >= 0.55 && !glitterFired) { glitterFired = true; this.spawnRevealGlitter(content, cx, cy, R); }
      // PetBackGlow 0.583→0.833 — smaller + softer so the crisp rays read
      petBackGlow.visible = ct >= 0.583;
      if (petBackGlow.visible) {
        petBackGlow.scale.set(glowScale(R * 0.40) * sampleCurve([[0.583, 0], [0.833, 1]], ct));
        petBackGlow.alpha = 0.6;
      }
      // pet / title / name pops
      pet.scale.set(sampleCurve(PET_S, ct) * petTargetScale);
      if (ct >= 0.84 && !punchFired) {   // white screen punch the instant the pet lands
        punchFired = true;
        const punch = new Graphics().rect(0, 0, w, h).fill(0xffffff); punch.alpha = 0; content.addChild(punch);
        void tween(this.ticker, 200, (pt) => { punch.alpha = Math.sin(pt * Math.PI) * 0.3; }).then(() => punch.destroy());
      }
      const ts = sampleCurve(TITLE_S, ct); titleGroup.scale.set(ts);
      nameText.scale.set(sampleCurve(NAME_S, ct));
    });
    eggSprite.destroy(); eggWhite.destroy(); glowWhite.destroy();
    circles.forEach((c) => c.destroy()); openRayHolder.destroy(); star.destroy();
    pet.scale.set(petTargetScale); titleGroup.scale.set(1); nameText.scale.set(1);

    // ── Sustained reveal (Idle loop) ──
    this.pet = pet; this.petBaseScale = petTargetScale;
    this.rays = null;   // code-accurate: idle rays are static (life = glitter + bob)
    this.juiceReady = true;
  }

  /** Loop_Glitter: continuous gold sparkle stars that twinkle around the pet. */
  private spawnRevealGlitter(content: Container, cx: number, cy: number, R: number): void {
    this.sparkles = [];
    const N = 12;
    for (let s = 0; s < N; s++) {
      const ang = (s / N) * Math.PI * 2 + 0.3 + (s % 2) * 0.22;
      const dist = R * (0.15 + (s % 3) * 0.06);
      const outer = R * (0.032 + (s % 3) * 0.016);
      const sp = this.makeStar(4, outer, outer * 0.36, 0xffe27a);
      sp.position.set(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
      sp.scale.set(0); sp.blendMode = 'add';
      content.addChild(sp);
      this.sparkles.push({ g: sp, phase: (s / N) * Math.PI * 2 });
      void tween(this.ticker, 340 + s * 22, (t) => {
        const e = t < 0.5 ? easeOutBack(t / 0.5) * 1.35 : 1.35 - ((t - 0.5) / 0.5) * 0.35;
        sp.scale.set(Math.max(0, e));
      });
    }
  }

  /** COLLECT call-to-action after the reveal: green "go" button + hand pointer. */
  private showRevealCta(): void {
    const { w, h, u } = this.geom();
    const cta = new Container();
    const wdt = u * 0.55, hgt = u * 0.17;
    const bg = makeNineSlice({ texture: this.tex.fightBtn, border: FIGHT_BTN_BORDER, width: wdt, height: hgt });
    bg.position.set(-wdt / 2, -hgt / 2);
    cta.addChild(bg);
    const label = autoSizeText({
      text: 'COLLECT',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffffff, stroke: { color: 0x1c3a12, width: 5 } },
      maxWidth: wdt * 0.7, maxHeight: hgt * 0.5, minPx: 18, maxPx: 40,
    });
    label.anchor.set(0.5); label.y = -hgt * 0.08;
    cta.addChild(label);
    cta.position.set(w / 2, h * 0.82);
    cta.eventMode = 'static'; cta.cursor = 'pointer';
    cta.on('pointerdown', () => this.finishReveal());
    cta.scale.set(0);
    this.content.addChild(cta);

    const hand = new Sprite(this.tex.hand);
    hand.anchor.set(0.381, 0.039);
    hand.height = u * 0.2; hand.scale.x = hand.scale.y;
    this.ctaHandRestY = h * 0.82;
    hand.position.set(w / 2, this.ctaHandRestY);
    hand.alpha = 0;
    this.content.addChild(hand);

    this.cta = cta; this.ctaHand = hand;

    void tween(this.ticker, 300, (t) => { cta.scale.set(easeOutBack(t)); }).then(() => {
      cta.scale.set(1);
      hand.alpha = 1;
      this.ctaReady = true;
      void tween(this.ticker, 7000, () => {}).then(() => { if (this.ctaReady) this.finishReveal(); });
    });
  }

  private finishReveal(): void {
    if (!this.ctaReady) return;
    this.ctaReady = false;
    this.juiceReady = false;   // idle bob/twinkle hand off to the collect burst
    audio.buttonTap(0.9);
    audio.collect(1);
    void this.playCollectEffect().then(() => this.resolveRun?.());
  }

  /** Satisfying "collected!" feedback on the COLLECT tap. */
  private async playCollectEffect(): Promise<void> {
    const { w, h } = this.geom();
    const R = Math.min(w, h);
    const cx = w / 2, cy = h * 0.5;

    const btn = this.cta;
    if (btn && !btn.destroyed) {
      void tween(this.ticker, 200, (t) => {
        if (btn.destroyed) return;
        btn.scale.set(t < 0.4 ? 1 - 0.14 * (t / 0.4) : 0.86 + 0.14 * ((t - 0.4) / 0.6));
      });
    }
    const flash = new Sprite(this.tex.egg.glow);
    flash.anchor.set(0.5); flash.tint = 0xffffff; flash.blendMode = 'add';
    flash.position.set(cx, cy); flash.alpha = 0; flash.width = flash.height = R * 0.6;
    this.content.addChild(flash);
    void tween(this.ticker, 340, (t) => {
      if (flash.destroyed) return;
      flash.alpha = (t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75) * 0.85;
      flash.width = flash.height = R * (0.6 + 0.5 * t);
    }).then(() => { if (!flash.destroyed) flash.destroy(); });
    const pet = this.pet, base = this.petBaseScale;
    if (pet && !pet.destroyed) {
      void tween(this.ticker, 320, (t) => {
        if (pet.destroyed) return;
        pet.scale.set(base * (1 + 0.2 * Math.sin(Math.min(1, t) * Math.PI)));
      });
    }
    for (let i = 0; i < 12; i++) {
      const st = this.makeStar(4, R * (0.022 + Math.random() * 0.012), R * 0.008, 0xffe27a);
      st.position.set(cx, cy); st.blendMode = 'add';
      this.content.addChild(st);
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const d = R * (0.18 + Math.random() * 0.14);
      void tween(this.ticker, 400, (t) => {
        if (st.destroyed) return;
        st.x = cx + Math.cos(a) * d * t;
        st.y = cy + Math.sin(a) * d * t;
        st.alpha = 1 - t; st.scale.set(1 - 0.4 * t); st.rotation = t * 3;
      }).then(() => { if (!st.destroyed) st.destroy(); });
    }
    await tween(this.ticker, 360, () => {});
  }

  /** Per-frame juice (reveal sparkle/bob + CTA throb). Call from scene update(). */
  update(elapsed: number, _deltaMS: number): void {
    const { h } = this.geom();
    if (this.juiceReady) {
      for (const s of this.sparkles) {
        if (s.g.destroyed) continue;
        const a = 0.45 + 0.55 * Math.abs(Math.sin(elapsed / 260 + s.phase));
        s.g.alpha = a;
        s.g.scale.set(0.9 + 0.45 * a);
        s.g.rotation = Math.sin(elapsed / 600 + s.phase) * 0.25;   // subtle shimmer
      }
      if (this.pet && !this.pet.destroyed) {
        this.pet.scale.set(this.petBaseScale * (1 + 0.025 * Math.sin(elapsed / 320)));
      }
    }
    if (this.ctaReady && this.cta && !this.cta.destroyed) {
      this.cta.scale.set(1 + 0.04 * Math.abs(Math.sin(elapsed / 320)));
      if (this.ctaHand && !this.ctaHand.destroyed) {
        const phase = (elapsed % 600) / 600;
        const press = Math.max(0, Math.sin(phase * Math.PI * 2));
        this.ctaHand.y = this.ctaHandRestY + press * h * 0.02;
      }
    }
  }

  /** Update the fill rect the paw-print backdrop covers, and redraw if visible. */
  layoutBg(fillX: number, fillY: number, fillW: number, fillH: number): void {
    this.fillX = fillX; this.fillY = fillY; this.fillW = fillW; this.fillH = fillH;
    if (this.overlay.visible) this.drawBg();
  }

  private drawBg(): void {
    const { w, h } = this.geom();
    const fillW = this.fillW || w, fillH = this.fillH || h;
    this.bg.clear().rect(this.fillX, this.fillY, fillW, fillH).fill(0x2a2440);
    // faint scattered paw prints
    const cols = 5, rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const x = (cc + 0.5 + (r % 2 ? 0.5 : 0)) * (w / cols);
        const y = (r + 0.5) * (h / rows);
        const s = Math.min(w, h) * 0.022;
        this.bg.ellipse(x, y + s * 0.4, s, s * 0.8).fill({ color: 0x35305a, alpha: 0.45 });
        this.bg.circle(x - s * 0.7, y - s * 0.5, s * 0.32).fill({ color: 0x35305a, alpha: 0.45 });
        this.bg.circle(x, y - s * 0.8, s * 0.34).fill({ color: 0x35305a, alpha: 0.45 });
        this.bg.circle(x + s * 0.7, y - s * 0.5, s * 0.32).fill({ color: 0x35305a, alpha: 0.45 });
      }
    }
  }

  /** A sharp N-point sparkle star. */
  private makeStar(points: number, outerR: number, innerR: number, color: number): Graphics {
    const pts: number[] = [];
    const n = points * 2;
    for (let i = 0; i < n; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new Graphics().poly(pts).fill(color);
  }
}

function sampleCurve(kfs: [number, number][], t: number): number {
  if (t <= kfs[0][0]) return kfs[0][1];
  for (let i = 1; i < kfs.length; i++) {
    if (t <= kfs[i][0]) {
      const [t0, v0] = kfs[i - 1];
      const [t1, v1] = kfs[i];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return kfs[kfs.length - 1][1];
}
