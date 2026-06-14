import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeOutBack } from '@shared/easing';
import { makeNineSlice, type UnityBorder } from '@shared/nineSlice';
import { GAME_FONT_STACK } from '@shared/gameFont';
import * as audio from '../audio';
import eggClosedData from 'assets/egg-summon/egg/egg_closed.webp';   // reward: ANOTHER egg to hatch (the loop reward)
import handData from 'assets/UI/FTUE_Hand.webp';
import buttonYellowData from 'assets/UI/Button_Convex_Rectangle_01_Yellow.webp';  // CLAIM CTA (same component as Play Now)
import patternData from 'assets/egg-summon/ui/reward_pattern.webp';  // game's reward-screen paw pattern (Patterns_Rewards)
import ringGlowData from 'assets/egg-summon/ui/ring_glow.webp';      // soft halo (Particles/RingGlow)
import glowData from 'assets/egg-summon/egg/glow.webp';              // soft radial glow disc
import rayData from 'assets/egg-summon/egg/ray.webp';                // light-beam sprite for the sunburst

const CLAIM_BTN_BORDER: UnityBorder = { left: 20, bottom: 28, right: 20, top: 20 };

// Authentic post-battle beat: beating the boss drops a reward. The player taps
// CLAIM to collect it (a real interaction) before the install end card. A late
// fallback auto-claims if the player stays idle so the ad always reaches the CTA.
const AUTO_CLAIM_MS = 8000;

export class ClaimRewardScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private ready = false;
  private bgRect!: Graphics;
  private rays!: Container;       // rotating light-beam sunburst behind the chest
  private ringGlow!: Sprite;      // pulsing halo
  private centerGlow!: Sprite;    // soft warm glow lifting the centre
  private sparkles: { g: Graphics; phase: number }[] = [];
  private hand!: Sprite;
  private handRestY = 0;
  private claimBtn!: Container;
  private claimed = false;
  private elapsed = 0;
  private eggTex!: Texture;
  private handTex!: Texture;
  private btnTex!: Texture;
  private patternTex!: Texture;
  private ringTex!: Texture;
  private glowTex!: Texture;
  private rayTex!: Texture;

  constructor(private ticker: Ticker, private width: number, private height: number) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    [this.eggTex, this.handTex, this.btnTex, this.patternTex, this.ringTex, this.glowTex, this.rayTex] = await Promise.all([
      Assets.load(eggClosedData), Assets.load(handData), Assets.load(buttonYellowData),
      Assets.load(patternData), Assets.load(ringGlowData), Assets.load(glowData), Assets.load(rayData),
    ]);
    const w = this.width, h = this.height;
    const u = Math.min(w, h);
    const cx = w / 2, cy = h * 0.52;

    // ── Game reward backdrop: deep base + a soft warm centre glow + the game's
    // paw-print reward pattern (Patterns_Rewards), tinted low so it reads like
    // the real Reward-Received screen and frames/highlights the chest. ──
    this.bgRect = new Graphics().rect(0, 0, w, h).fill(0x171028);
    this.container.addChild(this.bgRect);

    const pattern = new Sprite(this.patternTex);
    pattern.anchor.set(0.5);
    const pcover = Math.max(w / pattern.texture.width, h / pattern.texture.height) * 1.05;
    pattern.scale.set(pcover);
    pattern.position.set(cx, h / 2);
    pattern.tint = 0x6a5ba8; pattern.alpha = 0.14;   // subtle lavender paws
    this.container.addChild(pattern);

    // warm radial glow lifting the chest area out of the dark
    this.centerGlow = new Sprite(this.glowTex);
    this.centerGlow.anchor.set(0.5); this.centerGlow.position.set(cx, cy);
    this.centerGlow.width = this.centerGlow.height = u * 1.5;
    this.centerGlow.tint = 0xffcf6a; this.centerGlow.blendMode = 'add'; this.centerGlow.alpha = 0.32;
    this.container.addChild(this.centerGlow);

    // ── Bright light-beam SUNBURST behind the chest (real ray sprite, gold) ──
    this.rays = new Container();
    this.rays.position.set(cx, cy);
    this.container.addChild(this.rays);
    const RAYS = 16;
    const rayLen = (u * 0.62) / (this.rayTex.width || 1);
    for (let r = 0; r < RAYS; r++) {
      const ray = new Sprite(this.rayTex);
      ray.anchor.set(0, 0.5);
      ray.tint = r % 2 === 0 ? 0xffe07a : 0xffb43a;   // alternating gold tones
      ray.blendMode = 'add';
      ray.alpha = r % 2 === 0 ? 0.85 : 0.55;
      ray.rotation = (r / RAYS) * Math.PI * 2;
      ray.scale.set(rayLen, rayLen * 0.85);
      this.rays.addChild(ray);
    }

    // soft halo ring tight around the chest
    this.ringGlow = new Sprite(this.ringTex);
    this.ringGlow.anchor.set(0.5); this.ringGlow.position.set(cx, cy);
    this.ringGlow.width = this.ringGlow.height = u * 0.9;
    this.ringGlow.tint = 0xfff0c0; this.ringGlow.blendMode = 'add'; this.ringGlow.alpha = 0.5;
    this.container.addChild(this.ringGlow);

    // gold sparkle stars around the chest
    for (let s = 0; s < 9; s++) {
      const ang = (s / 9) * Math.PI * 2 + 0.4;
      const dist = u * (0.26 + (s % 3) * 0.07);
      const star = this.makeStar(u * (0.02 + (s % 3) * 0.008));
      star.position.set(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
      star.blendMode = 'add'; star.scale.set(0);
      this.container.addChild(star);
      this.sparkles.push({ g: star, phase: (s / 9) * Math.PI * 2 });
      void tween(this.ticker, 360 + s * 25, (t) => {
        if (star.destroyed) return;
        const e = t < 0.5 ? easeOutBack(t / 0.5) * 1.3 : 1.3 - ((t - 0.5) / 0.5) * 0.3;
        star.scale.set(Math.max(0, e));
      });
    }

    // "VICTORY!" title.
    const victory = new Text({
      text: 'VICTORY!',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fontSize: u * 0.12, fill: 0xffe066, stroke: { color: 0x000000, width: 7 } },
    });
    victory.anchor.set(0.5);
    victory.position.set(w / 2, h * 0.26);
    this.container.addChild(victory);

    // Reward: ANOTHER EGG to hatch — the loop reward (play again for a new pet),
    // reusing the closed-egg art from the summon scene.
    const chestGroup = new Container();
    chestGroup.position.set(w / 2, h * 0.52);
    const egg = new Sprite(this.eggTex);
    egg.anchor.set(0.5);
    // Sized so the egg fills the sunburst highlight as the chest did (the egg art
    // is narrower than the chest, so it needs to be a bit taller to read as the
    // focal reward rather than getting lost in the rays).
    egg.height = u * 0.50; egg.scale.x = egg.scale.y;
    chestGroup.addChild(egg);
    const chestScale = 1; // pop target
    this.container.addChild(chestGroup);

    // CLAIM button (gold, with a 3D lip) + FTUE hand.
    this.claimBtn = this.makeClaimButton(u);
    this.claimBtn.position.set(w / 2, h * 0.78);
    this.claimBtn.eventMode = 'static';
    this.claimBtn.cursor = 'pointer';
    this.claimBtn.on('pointerdown', () => this.claim());
    this.container.addChild(this.claimBtn);

    this.hand = new Sprite(this.handTex);
    this.hand.anchor.set(0.381, 0.039);
    this.hand.height = u * 0.2; this.hand.scale.x = this.hand.scale.y;
    this.handRestY = h * 0.80;
    this.hand.position.set(w / 2, this.handRestY);   // fingertip centered on the CLAIM button
    this.container.addChild(this.hand);

    // Intro: rays + VICTORY + egg pop, sparkle burst.
    this.rays.scale.set(0);
    victory.scale.set(0);
    chestGroup.scale.set(0);
    void tween(this.ticker, 360, (t) => {
      this.rays.scale.set(t);
      victory.scale.set(easeOutBack(Math.min(1, t * 1.2)));
    });
    audio.chestOpen(1);   // reward pop sting as the egg appears
    await tween(this.ticker, 420, (t) => {
      const s = t < 0.7 ? (t / 0.7) * 1.12 : 1.12 - ((t - 0.7) / 0.3) * 0.12;
      chestGroup.scale.set(s * chestScale);
    });
    audio.rewardReceived(1);   // reward collected sting
    this.burstSparkles(w / 2, h * 0.5, u);

    this.ready = true;
    // Late fallback so the ad always reaches the CTA.
    void tween(this.ticker, AUTO_CLAIM_MS, () => {}).then(() => { if (!this.claimed) this.claim(); });
  }

  private claim(): void {
    if (this.claimed) return;
    this.claimed = true;
    // Button feedback: click sound + a quick press squash on the CLAIM button.
    audio.buttonTap(0.9);
    const btn = this.claimBtn;
    if (btn && !btn.destroyed) {
      void tween(this.ticker, 200, (t) => {
        if (btn.destroyed) return;
        btn.scale.set(t < 0.4 ? 1 - 0.14 * (t / 0.4) : 0.86 + 0.14 * ((t - 0.4) / 0.6));
      });
    }
    // Juice: a quick white flash + a second coin shower as the reward lands.
    const w = this.width, h = this.height, u = Math.min(w, h);
    const flash = new Graphics().rect(0, 0, w, h).fill(0xffffff); flash.alpha = 0;
    this.container.addChild(flash);
    void tween(this.ticker, 260, (t) => { if (flash.destroyed) return; flash.alpha = t < 0.3 ? (t / 0.3) * 0.7 : 0.7 * (1 - (t - 0.3) / 0.7); }).then(() => { if (!flash.destroyed) flash.destroy(); });
    this.burstSparkles(w / 2, h * 0.5, u);
    audio.rewardReceived(1);
    void tween(this.ticker, 220, () => {}).then(() => this.resolveDone());
  }

  private burstSparkles(cx: number, cy: number, u: number): void {
    for (let i = 0; i < 14; i++) {
      const star = this.makeStar(u * (0.018 + Math.random() * 0.014));
      star.position.set(cx, cy);
      star.blendMode = 'add';
      star.rotation = Math.random() * Math.PI;
      this.container.addChild(star);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const speed = u * (0.4 + Math.random() * 0.5);
      const vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
      const spin = (Math.random() - 0.5) * 8;
      void tween(this.ticker, 700 + Math.random() * 300, (t) => {
        if (star.destroyed) return;   // scene may exit (claim) before sparkles land
        star.x = cx + vx * t;
        star.y = cy + vy * t + u * 0.9 * t * t; // gravity
        star.rotation += spin * 0.02;
        star.alpha = 1 - t * t;
      }).then(() => { if (!star.destroyed) star.destroy(); });
    }
  }

  private makeClaimButton(u: number): Container {
    const c = new Container();
    const wdt = u * 0.5, hgt = u * 0.16;   // a bit taller — the 3D pocket is baked in
    const bg = makeNineSlice({ texture: this.btnTex, border: CLAIM_BTN_BORDER, width: wdt, height: hgt });
    bg.position.set(-wdt / 2, -hgt / 2);
    c.addChild(bg);
    const t = new Text({
      text: 'CLAIM!',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fontSize: hgt * 0.34, fill: 0xffffff, stroke: { color: 0x6a4a10, width: 4 } },
    });
    t.anchor.set(0.5);
    t.y = -hgt * 0.08;   // sit on the face, above the pocket lip
    c.addChild(t);
    return c;
  }

  async exit(): Promise<void> { this.container.destroy({ children: true }); }

  update(deltaMS: number): void {
    if (!this.ready) return;
    this.elapsed += deltaMS;
    // Sunburst slowly rotates; halo + centre glow breathe; stars twinkle.
    this.rays.rotation += deltaMS * 0.00028;
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed / 360);
    this.ringGlow.alpha = 0.4 + 0.22 * pulse;
    this.centerGlow.alpha = 0.28 + 0.12 * pulse;
    for (const s of this.sparkles) {
      if (s.g.destroyed) continue;
      const a = 0.45 + 0.55 * Math.abs(Math.sin(this.elapsed / 280 + s.phase));
      s.g.alpha = a;
      s.g.scale.set(0.85 + 0.4 * a);
      s.g.rotation = Math.sin(this.elapsed / 600 + s.phase) * 0.25;
    }
    const phase = (this.elapsed % 600) / 600;
    const press = Math.max(0, Math.sin(phase * Math.PI * 2));
    this.hand.y = this.handRestY + press * this.height * 0.02;
    // Idle pulse — but once tapped, the press-squash tween owns the button scale.
    if (!this.claimed) this.claimBtn.scale.set(1 + 0.04 * Math.abs(Math.sin(this.elapsed / 320)));
  }

  /** A simple gold 4-point sparkle star. */
  private makeStar(outer: number): Graphics {
    const inner = outer * 0.36;
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new Graphics().poly(pts).fill(0xffe27a);
  }

  pause(): void {}
  resume(): void {}

  layout(width: number, height: number, fillX = 0, fillW = width, fillY = 0, fillH = height): void {
    this.width = width; this.height = height;
    if (this.bgRect && !this.bgRect.destroyed) {
      this.bgRect.clear().rect(fillX, fillY, fillW, fillH).fill(0x171028);
    }
    // Built for the captured aspect; full responsive relayout is unnecessary for
    // this short terminal beat (a resize mid-claim is not a real scenario here).
  }
}
