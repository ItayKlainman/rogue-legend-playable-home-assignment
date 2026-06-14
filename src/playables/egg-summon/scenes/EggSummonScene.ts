import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { ParticleEmitter } from '@shared/particleEmitter';
import { autoSizeText } from '@shared/autoSizeText';
import type { EggSummonScript } from '../script';
import { RARITY_LADDER, RARITY_TINT, SHAKE_DELAYS } from '../rarity';
import { loadRevealTexture, loadEggArt, loadSummonTexture, loadUiTexture } from '../catalog';
import { TorchFlame } from './TorchFlame';
import { EggReveal } from '../eggReveal';
import { GAME_FONT_STACK } from '@shared/gameFont';
import * as audio from '../audio';
import fightBtnData from 'assets/UI/Button_Convex_Rectangle_01_Green.webp';  // COLLECT CTA (green "go" button, same as Play Now)

// Exact game shake curves — SummonEgg_Shake.anim (0.5s clip @60fps): squash→
// stretch beat, ±3° rock, the white egg-flash window, and 3 staggered bursts.
// Motion is identical every shake; only the burst/glow COLOR escalates per tier
// (the game's LootBoxPetEggAnimation loops the clip i=0..rarity, ApplyColor(i)).
const SHAKE_CLIP_S = 0.5;
const SHAKE_SCALE_X: [number, number][] = [[0, 1], [0.083, 1.2], [0.167, 0.8], [0.333, 1]];
const SHAKE_SCALE_Y: [number, number][] = [[0, 1], [0.083, 0.9], [0.167, 1.3], [0.333, 1]];
const SHAKE_ROT_DEG: [number, number][] = [[0, 0], [0.083, -3], [0.25, 3], [0.333, -2], [0.417, 0]];
const SHAKE_BURSTS: [number, number][] = [[0.017, 0.183], [0.05, 0.217], [0.083, 0.25]];
const SHAKE_FLASH: [number, number] = [0.083, 0.167];
// Compress the escalating build so the reveal lands faster (playable pacing).
const BUILD_SPEEDUP = 0.45;
// The egg requires a real tap (that's the core interaction + engagement signal).
// This is only a LATE safety net: if the player stays completely idle this long,
// auto-open so the ad never dead-ends before the fight/end-card CTA.
const AUTO_TAP_MS = 8000;

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

/** Geometry of the pedestal scene, derived from the layout unit each layout(). */
interface StageGeom {
  cx: number; padY: number; eggY: number; eggH: number; u: number;
}

export class EggSummonScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private ready = false;

  // Pedestal scene
  private bg!: Graphics;
  private stage!: Container;
  private statue!: Sprite;
  private pad!: Graphics;
  private padFront!: Sprite;
  private torches: TorchFlame[] = [];
  private eggHolder!: Container;
  private eggGlow!: Sprite;
  private eggBody!: Sprite;

  // CTA
  private cta!: Text;
  private pointer!: Sprite;       // FTUE pointing hand
  private pointerRestY = 0;       // resting Y the tap-bob animates around
  private handTex!: Texture;
  private rarityBannerTex!: Texture;  // game's tapered rarity title frame

  // Reveal screen — the egg-open → COLLECT sequence (shared module).
  private reveal!: EggReveal;
  private fightBtnTex!: Texture;

  private emitter!: ParticleEmitter;

  // Loaded textures
  private petTex: Texture[] = [];
  private eggTex!: Record<'closed' | 'open' | 'shards' | 'burst' | 'ray' | 'glow', Texture>;
  private summonTex!: Record<'statue' | 'padFront' | 'padRim' | 'torchSheet', Texture>;

  private index = 0;
  private busy = false;
  private elapsed = 0;
  private geom: StageGeom = { cx: 0, padY: 0, eggY: 0, eggH: 0, u: 0 };
  private fillX = 0;
  private fillW = 0;
  private fillY = 0;
  private fillH = 0;

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    const [petTex, eggTex, statue, padFront, padRim, torchSheet, handTex] = await Promise.all([
      Promise.all(this.script.eggs.map((e) => loadRevealTexture(e.pet))),
      loadEggArt(),
      loadSummonTexture('statue'),
      loadSummonTexture('padFront'),
      loadSummonTexture('padRim'),
      loadSummonTexture('torchSheet'),
      loadUiTexture('hand'),
    ]);
    this.petTex = petTex;
    this.eggTex = eggTex;
    this.summonTex = { statue, padFront, padRim, torchSheet };
    this.handTex = handTex;
    this.rarityBannerTex = await loadUiTexture('rarityBanner');
    this.fightBtnTex = await Assets.load(fightBtnData);

    // ── Background: recreated purple stone-brick wall + arched niche ──────
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    // ── Pedestal stage ───────────────────────────────────────────────────
    this.stage = new Container();
    this.container.addChild(this.stage);

    // back torches (drawn first → behind the statue)
    const backTorches = [new TorchFlame(torchSheet, 22, 0.0), new TorchFlame(torchSheet, 22, 0.5)];

    this.statue = new Sprite(statue);
    this.statue.anchor.set(0.5, 1);
    this.stage.addChild(this.statue);

    this.pad = new Graphics();
    this.stage.addChild(this.pad);

    this.padFront = new Sprite(padFront);
    this.padFront.anchor.set(0.5, 0.5);
    this.stage.addChild(this.padFront);

    // egg holder (glow + egg body) sits on the pad
    this.eggHolder = new Container();
    this.eggGlow = new Sprite(eggTex.glow);
    this.eggGlow.anchor.set(0.5);
    this.eggGlow.alpha = 0.55;
    this.eggBody = new Sprite(eggTex.closed);
    this.eggBody.anchor.set(0.5, 1); // base sits on the pad
    this.eggHolder.addChild(this.eggGlow, this.eggBody);
    this.eggHolder.eventMode = 'static';
    this.eggHolder.cursor = 'pointer';
    this.eggHolder.on('pointerdown', () => this.openEgg());
    this.stage.addChild(this.eggHolder);

    // front torches (drawn last → in front, flanking the egg, larger)
    const frontTorches = [new TorchFlame(torchSheet, 24, 0.2), new TorchFlame(torchSheet, 24, 0.7)];
    this.torches = [...backTorches, ...frontTorches];
    backTorches.forEach((t) => this.stage.addChildAt(t.sprite, this.stage.getChildIndex(this.statue)));
    frontTorches.forEach((t) => this.stage.addChild(t.sprite));

    // ── CTA: pulsing prompt + hand pointer on the egg ────────────────────
    this.cta = autoSizeText({
      text: 'TAP THE EGG!',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffe066, stroke: { color: 0x000000, width: 6 } },
      maxWidth: this.width * 0.7, maxHeight: this.height * 0.07, minPx: 16, maxPx: 40,
    });
    this.cta.anchor.set(0.5);
    this.container.addChild(this.cta);
    this.pointer = this.makeHandPointer();
    this.container.addChild(this.pointer);

    // ── Reveal overlay (hidden until the egg opens) ──────────────────────
    this.reveal = new EggReveal(this.ticker, {
      egg: { closed: this.eggTex.closed, glow: this.eggTex.glow, ray: this.eggTex.ray },
      rarityBanner: this.rarityBannerTex, fightBtn: this.fightBtnTex, hand: this.handTex,
    }, () => ({ w: this.width, h: this.height, u: this.geom.u }));
    this.container.addChild(this.reveal.overlay);

    this.emitter = new ParticleEmitter(this.ticker);
    this.container.addChild(this.emitter.container);

    this.ready = true;
    this.layout(this.width, this.height);
    // One egg, one tap: the egg builds up through every rarity tier and resolves
    // on the mythic dragon (script.fighterIndex).
    this.showEgg(this.script.fighterIndex);
  }

  // ── EGG STATE ───────────────────────────────────────────────────────────
  private showEgg(index: number): void {
    this.index = index;
    this.eggBody.visible = true;
    this.eggBody.rotation = 0;
    // Neutral warm glow before the tap — the rarity is a SURPRISE, so don't
    // pre-tint it (the shake build-up reveals the escalating colour).
    this.eggGlow.tint = 0xfff0d0;
    this.eggHolder.visible = true;
    this.eggHolder.eventMode = 'static';
    this.cta.visible = true;
    this.pointer.visible = true;
    this.busy = false;
    this.layout(this.width, this.height);
    // If the player doesn't tap quickly, open it for them so the reveal still
    // lands fast (openEgg guards against a double-open if they do tap).
    tween(this.ticker, AUTO_TAP_MS, () => {}).then(() => { if (!this.busy) void this.openEgg(); });
  }

  private async openEgg(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.eggHolder.eventMode = 'none';
    this.cta.visible = false;
    this.pointer.visible = false;

    const egg = this.script.eggs[this.index];
    const targetTier = RARITY_LADDER.indexOf(egg.rarity as (typeof RARITY_LADDER)[number]);
    const bs = this.eggBaseScale();

    // White egg-silhouette flash layered above the egg body.
    const flashSprite = new Sprite(this.eggTex.closed);
    flashSprite.anchor.set(0.5, 1);
    flashSprite.tint = 0xffffff;
    flashSprite.blendMode = 'add';
    flashSprite.alpha = 0;
    flashSprite.position.copyFrom(this.eggBody.position);
    this.eggHolder.addChildAt(flashSprite, this.eggHolder.getChildIndex(this.eggBody) + 1);

    // ── SHAKE: replay the exact 0.5s clip once per tier. Skip the lowest tier so
    // the build-up is one colour/step shorter — quicker to the reveal.
    const startTier = targetTier > 0 ? 1 : 0;
    for (let tier = startTier; tier <= targetTier; tier++) {
      const tint = RARITY_TINT[RARITY_LADDER[tier]];
      this.eggGlow.tint = tint;
      // Real game egg-shell crack on each bump; pitch climbs with the tier so
      // the build-up audibly escalates toward the mythic reveal.
      audio.eggCrack(0.85, 1 + tier * 0.07);
      const burstCY = this.eggBody.y - this.eggBody.height * 0.5;
      const bursts = SHAKE_BURSTS.map(() => {
        const b = new Sprite(this.eggTex.burst);
        b.anchor.set(0.5);
        b.tint = tint;
        b.alpha = 0; b.scale.set(0); b.visible = false;
        b.position.set(this.eggBody.x, burstCY);
        this.eggHolder.addChild(b);
        return b;
      });
      // SummonEgg_Rays_<Rarity>: 9 rarity-coloured rays that FLASH out of the egg
      // on each bump (colour escalates per tier). Added behind the egg body.
      const rayLen = (this.eggBody.height * 1.05) / (this.eggTex.ray.width || 1);
      const shakeRays = Array.from({ length: 9 }, (_, r) => {
        const ray = new Sprite(this.eggTex.ray);
        ray.anchor.set(0, 0.5);
        ray.tint = tint;
        ray.blendMode = 'add';
        ray.rotation = (r / 9) * Math.PI * 2 - Math.PI / 2;
        ray.scale.set(0); ray.alpha = 0;
        ray.position.set(this.eggBody.x, burstCY);
        this.eggHolder.addChildAt(ray, this.eggHolder.getChildIndex(this.eggBody));
        return ray;
      });
      // Compress the build so the mythic payoff lands fast (~2s of escalating
      // shakes instead of ~3.3s): play the full 0.5s clip inside a shortened
      // per-tier window.
      const tierDur = (SHAKE_DELAYS[RARITY_LADDER[tier]] ?? SHAKE_CLIP_S) * BUILD_SPEEDUP;
      await tween(this.ticker, tierDur * 1000, (t) => {
        const ct = t * SHAKE_CLIP_S;
        this.eggBody.scale.set(bs * sampleCurve(SHAKE_SCALE_X, ct), bs * sampleCurve(SHAKE_SCALE_Y, ct));
        this.eggBody.rotation = (sampleCurve(SHAKE_ROT_DEG, ct) * Math.PI) / 180;
        flashSprite.scale.copyFrom(this.eggBody.scale);
        flashSprite.rotation = this.eggBody.rotation;
        flashSprite.alpha = ct >= SHAKE_FLASH[0] && ct <= SHAKE_FLASH[1]
          ? 1 - (ct - SHAKE_FLASH[0]) / (SHAKE_FLASH[1] - SHAKE_FLASH[0]) : 0;
        for (let bi = 0; bi < bursts.length; bi++) {
          const [s, e] = SHAKE_BURSTS[bi];
          if (ct >= s && ct <= e) {
            const f = (ct - s) / (e - s);
            bursts[bi].visible = true;
            bursts[bi].scale.set(bs * f * 1.7);
            bursts[bi].alpha = 1 - f;
          } else bursts[bi].visible = false;
        }
        // Rarity rays flash out on the bump: scale in fast, hold, then fade.
        const rayScaleNow = (ct < 0.1 ? ct / 0.1 : 1) * rayLen;
        const rayAlpha = ct < 0.22 ? Math.min(1, ct / 0.06) : Math.max(0, 1 - (ct - 0.22) / 0.22);
        for (const ray of shakeRays) { ray.scale.set(rayScaleNow); ray.alpha = rayAlpha; }
      });
      this.eggBody.rotation = 0;
      this.eggBody.scale.set(bs);
      bursts.forEach((b) => b.destroy());
      shakeRays.forEach((r) => r.destroy());
    }
    flashSprite.destroy();

    // ── OPEN: a final anticipation squash, then the egg vanishes ──────────
    const CRACK_KF = [
      { t: 0.0, sx: 1, sy: 1 }, { t: 0.33, sx: 0.9, sy: 1.2 }, { t: 0.66, sx: 1.2, sy: 0.9 },
      { t: 0.9, sx: 0.84, sy: 1.26 }, { t: 1.0, sx: 1, sy: 1 },
    ];
    await tween(this.ticker, 240, (t) => {
      let prev = CRACK_KF[0], next = CRACK_KF[1];
      for (let k = 1; k < CRACK_KF.length; k++) {
        if (t <= CRACK_KF[k].t) { prev = CRACK_KF[k - 1]; next = CRACK_KF[k]; break; }
        prev = CRACK_KF[k]; next = CRACK_KF[k];
      }
      const segLen = next.t - prev.t;
      const segT = segLen > 0 ? (t - prev.t) / segLen : 1;
      this.eggBody.scale.x = bs * (prev.sx + (next.sx - prev.sx) * segT);
      this.eggBody.scale.y = bs * (prev.sy + (next.sy - prev.sy) * segT);
    });
    this.eggBody.visible = false;

    // Triumphant pet-reveal sting (the game's Pet_Summon_End) as the egg opens.
    audio.summonReveal(1);

    // The shared reveal owns the rest of the open: white burst → star → gold
    // ray-fan + sparkles → pet → COLLECT CTA. Resolves when the player collects
    // (or the late auto-tap fires), then we hand off to the board/fight.
    this.eggHolder.visible = false;
    await this.reveal.run(this.petTex[this.index], egg.name, egg.rarity);
    this.resolveDone();
  }

  async exit(): Promise<void> {
    if (this.emitter) { this.container.removeChild(this.emitter.container); this.emitter.destroy(); }
    this.torches.forEach((t) => t.destroy());
    this.container.destroy({ children: true });
  }

  update(deltaMS: number): void {
    this.elapsed += deltaMS;
    for (const t of this.torches) t.update(deltaMS);
    if (this.pointer?.visible) {
      // tap gesture: poke the fingertip UP into the egg and back on a ~0.7s
      // loop (only the upward half "presses", like a real tap on the egg).
      const phase = (this.elapsed % 520) / 520;
      const press = Math.max(0, Math.sin(phase * Math.PI * 2));
      this.pointer.y = this.pointerRestY - press * this.geom.eggH * 0.16;
    }
    if (this.cta?.visible) this.cta.scale.set(1 + 0.05 * Math.sin(this.elapsed / 250));
    // Egg idle breathing when waiting for a tap
    if (this.ready && !this.busy && this.eggBody?.visible) {
      const bs = this.eggBaseScale();
      // Stronger "tap me!" pulse — a bigger, snappier throb to draw the eye.
      const f = 1 + 0.06 * Math.abs(Math.sin(this.elapsed / 380));
      this.eggBody.scale.set(bs * f);
      this.eggGlow.alpha = 0.4 + 0.3 * Math.abs(Math.sin(this.elapsed / 380));
    }
    // Reveal + COLLECT juice (sparkle twinkle, pet bob, CTA throb) lives in the
    // shared module.
    this.reveal?.update(this.elapsed, deltaMS);
  }

  pause(): void {}
  resume(): void {}

  // ── LAYOUT ────────────────────────────────────────────────────────────
  private eggBaseScale(): number {
    // height of the egg = geom.eggH; scale derived from native texture height.
    return this.geom.eggH / (this.eggTex.closed.height || 1);
  }

  private makeHandPointer(): Sprite {
    // Real FTUE pointing hand. Anchor at the index-finger TIP — measured from
    // the 200×228 art (topmost opaque pixel, x-centroid) = (0.381, 0.039) — so
    // positioning the sprite lands the fingertip exactly on the target.
    const s = new Sprite(this.handTex);
    s.anchor.set(0.381, 0.039);
    return s;
  }


  layout(width: number, height: number, fillX = 0, fillW = width, fillY = 0, fillH = height): void {
    this.width = width; this.height = height;
    this.fillX = fillX; this.fillW = fillW;
    this.fillY = fillY; this.fillH = fillH;
    if (!this.ready) return;

    const u = Math.min(width, height * 0.62);
    const cx = width / 2;
    const padY = height * 0.585;
    const eggY = height * 0.595;   // base sits low, nestled onto the pad
    const eggH = u * 0.36;          // big focal egg, still smaller than the statue
    this.geom = { cx, padY, eggY, eggH, u };

    this.drawBackground(width, height, u, cx, fillX, fillW, fillY, fillH);

    // statue: the dominant guardian — big, with its head/horns/gem visible ABOVE
    // the egg (like the game). Base on the pad, egg nestles in front of its belly.
    this.statue.position.set(cx, padY + u * 0.04);
    this.statue.height = u * 0.62;
    this.statue.scale.x = this.statue.scale.y;

    // pad: glowing green disc + front rim sprite
    const padW = u * 0.74;
    const padH = u * 0.20;
    this.pad.clear()
      .ellipse(cx, padY, padW * 0.5, padH * 0.5).fill(0x1f4a3a)
      .ellipse(cx, padY, padW * 0.42, padH * 0.42).fill(0x2e6b4f)
      .ellipse(cx, padY - padH * 0.04, padW * 0.40, padH * 0.40).stroke({ color: 0x6ff0d0, width: Math.max(2, u * 0.006), alpha: 0.9 });
    this.padFront.width = padW * 1.02;
    this.padFront.scale.y = this.padFront.scale.x;
    this.padFront.position.set(cx, padY + padH * 0.45);

    // torches: 2 back (smaller, behind statue), 2 front (larger, flank egg)
    const [bL, bR, fL, fR] = this.torches;
    bL.layout(cx - u * 0.27, padY - u * 0.02, u * 0.16);
    bR.layout(cx + u * 0.27, padY - u * 0.02, u * 0.16);
    fL.layout(cx - u * 0.34, padY + padH * 0.4, u * 0.24);
    fR.layout(cx + u * 0.34, padY + padH * 0.4, u * 0.24);

    // egg on the pad — the egg ART's cream mass sits a touch left of its sprite
    // centre, and the statue's centre (between its hands) is a hair right of cx,
    // so nudge the egg right to sit centred between the guardian's hands.
    const eggCx = cx + u * 0.006;
    this.eggHolder.position.set(eggCx, 0);
    this.eggBody.position.set(0, eggY + eggH * 0.0);
    this.eggBody.height = eggH;
    this.eggBody.scale.x = this.eggBody.scale.y;
    this.eggGlow.position.set(0, eggY - eggH * 0.5);
    this.eggGlow.width = eggH * 1.7;
    this.eggGlow.height = eggH * 1.7;

    // CTA floats in the dark arch space above the statue (so it never covers
    // the guardian/egg); the hand pointer taps the egg itself.
    this.cta.position.set(cx, height * 0.18);
    this.pointer.height = eggH * 0.8;
    this.pointer.scale.x = this.pointer.scale.y;
    // Hand points UP at the egg from below: the INDEX-FINGER TIP lands exactly on
    // the horizontal centre (the sprite anchor is the fingertip), touching the
    // egg's lower shell; the hand body droops below over the pad.
    this.pointerRestY = eggY - eggH * 0.12;
    this.pointer.position.set(eggCx, this.pointerRestY);   // fingertip stays on the egg centre

    this.reveal?.layoutBg(this.fillX, this.fillY, this.fillW, this.fillH);
    this.container.hitArea = { contains: () => true };
  }

  /** Recreated purple stone-brick wall with a tall arched niche (the live-build
   *  summon backdrop isn't in our asset checkout — see lessons.md). */
  private drawBackground(w: number, h: number, u: number, cx: number, fillX = 0, fillW = w, fillY = 0, fillH = h): void {
    const g = this.bg.clear();
    g.rect(fillX, fillY, fillW, fillH).fill(0x241d3a);
    // brick courses — tile over the FULL fill rect (not just 0..h) so phones
    // taller/narrower than the design don't show the bare base fill as a purple
    // band at the top/bottom edge.
    const bh = u * 0.06;
    const bw = u * 0.13;
    const top = fillY;
    const bottom = fillY + fillH;
    const startRow = Math.floor(top / bh);
    for (let row = startRow, y = startRow * bh; y < bottom; row++, y += bh) {
      const parity = ((row % 2) + 2) % 2;            // 0/1 even for negative rows
      const off = parity * (bw / 2);
      for (let x = fillX - bw + off; x < fillX + fillW; x += bw) {
        g.roundRect(x + 2, y + 2, bw - 4, bh - 4, 3).fill(parity ? 0x2f2650 : 0x342a57);
      }
    }
    // arched niche
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
      .fill(0x1b1530); // dark recess
    // stone arch frame (lighter rim)
    g.moveTo(archX, archBottom)
      .lineTo(archX, archTop + archR)
      .arc(cx, archTop + archR, archR, Math.PI, 0)
      .lineTo(archX + archW, archBottom)
      .stroke({ color: 0x4a3d6e, width: Math.max(4, u * 0.02) });
    // soft floor glow inside the niche
    g.ellipse(cx, archBottom, archW * 0.5, u * 0.06).fill({ color: 0x2e6b4f, alpha: 0.5 });
  }
}
