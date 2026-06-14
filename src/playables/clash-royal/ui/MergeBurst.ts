import { Container, Sprite, Texture } from 'pixi.js';

// ── Deck-tile MERGE burst ─────────────────────────────────────────────────
// Plays when a stackable skill is picked a second/third time and merges in
// place into its existing deck tile. Modeled on UnlockBurst but SMALLER + faster
// (the deck tile is ~half the size of a slot card), tinted to the tier color,
// and with no hex-ring (the tile keeps its own border; the burst is a glow +
// sparks fanning out from the tile center). Reuses the same canvas-baked spark
// gradient as UnlockBurst (a separate module-local cache here — both bursts share
// the same recipe so the look is cohesive without a cross-module import).
//
// Driven by an externally fed `update(deltaMS)` so there is NO Ticker.shared
// handler to leak; SkillQueue.render(deltaMS) advances every active burst.
// `destroy()` tears everything down immediately if the widget dies mid-burst.

const SPARK_COUNT = 10;
const LIFE_MS = 460;       // whole burst lifetime — shorter than the slot burst
const GLOW_LIFE_MS = 280;
// ── Celebration LEVELS ── the merge burst now scales with how far the stack went:
//   level 0 — a normal 1→2 merge (baseline, subtle).
//   level 1 — the 2→3 "three-of-a-kind" STEPPING-STONE: a much bigger, brighter pop
//             with an expanding shockwave ring + a hot core flash. Unmistakable, but
//             deliberately kept BELOW the cap.
//   level 2 — the 3→4 CAP (full gold star row): the decisive "maxed" moment — denser
//             sparks, a wider/brighter ring, a longer glow — clearly the biggest beat.
// Per-level multipliers ramp every layer so 4 always reads bigger than 3.
const LEVEL_SPARK_COUNT = [10, 26, 38];
const LEVEL_GLOW_LIFE_MS = [280, 420, 520];
const LEVEL_SCALE = [1, 1.7, 2.25];
const LEVEL_RING = [false, true, true];   // shockwave ring on celebration tiers
const LEVEL_RING_SCALE = [0, 2.4, 3.4];   // ring peak radius (× base) per level
const RING_LIFE_MS = 360;

let SPARK_TEX: Texture | null = null;
function sparkTexture(): Texture {
  if (SPARK_TEX) return SPARK_TEX;
  const SIZE = 48;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,244,210,0.9)');
  grad.addColorStop(0.7, 'rgba(255,210,120,0.35)');
  grad.addColorStop(1.0, 'rgba(255,200,90,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  SPARK_TEX = Texture.from(canvas);
  return SPARK_TEX;
}

// A hollow bright RING texture — a thin glowing annulus that reads as a shockwave
// expanding out of the tile. Canvas-baked once (zero bundle bytes, allowed by
// check:textures). Tinted per-play to the tier color.
let RING_TEX: Texture | null = null;
function ringTexture(): Texture {
  if (RING_TEX) return RING_TEX;
  const SIZE = 128;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  // Radial gradient with the bright band near the OUTER edge so it draws as a ring,
  // not a filled disc: dark/transparent core, hot band ~0.78–0.92, soft falloff to 0.
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0)');
  grad.addColorStop(0.80, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.90, 'rgba(255,240,200,0.85)');
  grad.addColorStop(1.0, 'rgba(255,210,120,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  RING_TEX = Texture.from(canvas);
  return RING_TEX;
}

// tier → cohesion tint (matches UnlockBurst.TIER_TINT).
const TIER_TINT: Record<1 | 2 | 3, number> = { 1: 0x6db4ff, 2: 0xc28bff, 3: 0xffc24a };
const GOLD = 0xffd87a;
const WHITE = 0xffffff;

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

interface Spark {
  sprite: Sprite;
  vx: number;
  vy: number;
  spin: number;
  baseScale: number;
}

export class MergeBurst extends Container {
  private elapsed = 0;
  private life = LIFE_MS;
  private active = false;

  private readonly glow: Sprite;
  private readonly ring: Sprite;
  private readonly flash: Sprite;
  private readonly sparkLayer: Container;
  private sparks: Spark[] = [];
  private tierTint = TIER_TINT[1];
  private glowLife = GLOW_LIFE_MS;
  private glowBaseScale = 1.4;
  private ringOn = false;
  private ringPeakScale = 0;

  constructor() {
    super();
    this.eventMode = 'none';

    this.glow = new Sprite(sparkTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.visible = false;
    this.addChild(this.glow);

    // Expanding shockwave ring (celebration tiers only).
    this.ring = new Sprite(ringTexture());
    this.ring.anchor.set(0.5);
    this.ring.blendMode = 'add';
    this.ring.visible = false;
    this.addChild(this.ring);

    // Hot white core flash — a quick bright pop right at the tile center.
    this.flash = new Sprite(sparkTexture());
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.visible = false;
    this.addChild(this.flash);

    this.sparkLayer = new Container();
    this.addChild(this.sparkLayer);
  }

  get isPlaying(): boolean { return this.active; }

  /** Fire the merge burst at (x,y) in this container's local coords, tinted by tier.
   *  `level` ramps the celebration: 0 = normal 1→2 merge, 1 = the 2→3 three-of-a-kind
   *  stepping-stone (shockwave ring + core flash + dense sparks), 2 = the 3→4 CAP
   *  (the biggest beat — wider ring, more sparks, longer glow). */
  play(x: number, y: number, tier: 1 | 2 | 3, level = 0): void {
    this.position.set(x, y);
    this.elapsed = 0;
    this.active = true;
    this.visible = true;
    this.tierTint = TIER_TINT[tier];

    const lv = level | 0;
    const sparkCount = LEVEL_SPARK_COUNT[lv] ?? SPARK_COUNT;
    const scale = LEVEL_SCALE[lv] ?? 1;
    this.glowLife = LEVEL_GLOW_LIFE_MS[lv] ?? GLOW_LIFE_MS;
    this.glowBaseScale = 1.4 * scale;
    // keep the burst alive until the slowest layer (the glow) has finished fading.
    this.life = Math.max(LIFE_MS, this.glowLife);

    this.glow.visible = true;
    this.glow.tint = this.tierTint;
    this.glow.alpha = 0;
    this.glow.scale.set(this.glowBaseScale);

    // ── shockwave ring (celebration tiers) ── expands + fades from the tile center.
    this.ringOn = LEVEL_RING[lv] ?? false;
    this.ringPeakScale = LEVEL_RING_SCALE[lv] ?? 0;
    if (this.ringOn) {
      this.ring.visible = true;
      this.ring.tint = this.tierTint;
      this.ring.alpha = 1;
      this.ring.scale.set(this.ringPeakScale * 0.25);
    } else {
      this.ring.visible = false;
    }

    // ── core flash ── a hot white pop right at center (celebration tiers only).
    if (lv > 0) {
      this.flash.visible = true;
      this.flash.tint = WHITE;
      this.flash.alpha = 1;
      this.flash.scale.set(0.6 * scale);
    } else {
      this.flash.visible = false;
    }

    this.clearSparks();
    const tex = sparkTexture();
    for (let i = 0; i < sparkCount; i++) {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      const ang = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = (95 + Math.random() * 95) * scale; // a touch slower than the slot burst
      const startR = 4 + Math.random() * 6;
      sprite.x = Math.cos(ang) * startR;
      sprite.y = Math.sin(ang) * startR;
      const roll = Math.random();
      sprite.tint = roll < 0.45 ? this.tierTint : (roll < 0.78 ? GOLD : WHITE);
      const baseScale = (0.22 + Math.random() * 0.22) * scale;
      sprite.scale.set(baseScale);
      sprite.rotation = Math.random() * Math.PI * 2;
      this.sparkLayer.addChild(sprite);
      this.sparks.push({
        sprite,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        spin: (Math.random() - 0.5) * 8,
        baseScale,
      });
    }
  }

  update(deltaMS: number): void {
    if (!this.active) return;
    this.elapsed += deltaMS;
    const dt = deltaMS / 1000;

    // glow: bloom + fade.
    {
      const t = Math.min(1, this.elapsed / this.glowLife);
      const a = t < 0.3 ? (t / 0.3) : (1 - (t - 0.3) / 0.7);
      this.glow.alpha = Math.max(0, a) * 0.8;
      this.glow.scale.set(this.glowBaseScale + easeOutCubic(t) * 0.8);
      if (t >= 1) this.glow.visible = false;
    }

    // shockwave ring: expand from 0.25× to peak, alpha 1→0 (ease-out).
    if (this.ringOn) {
      const t = Math.min(1, this.elapsed / RING_LIFE_MS);
      const e = easeOutCubic(t);
      this.ring.scale.set(this.ringPeakScale * (0.25 + 0.75 * e));
      this.ring.alpha = 1 - e;
      if (t >= 1) { this.ring.visible = false; this.ringOn = false; }
    }

    // core flash: a fast bright pop that scales up while fading out (~140ms).
    if (this.flash.visible) {
      const t = Math.min(1, this.elapsed / 140);
      this.flash.alpha = 1 - t;
      this.flash.scale.set((0.6 + 1.4 * easeOutCubic(t)) * (this.glowBaseScale / 1.4));
      if (t >= 1) this.flash.visible = false;
    }

    const t = Math.min(1, this.elapsed / this.life);
    const e = easeOutCubic(t);
    const DRAG = 1.6;
    const GRAVITY = 140;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      const damp = Math.max(0, 1 - DRAG * dt);
      s.vx *= damp;
      s.vy = s.vy * damp + GRAVITY * dt;
      s.sprite.x += s.vx * dt;
      s.sprite.y += s.vy * dt;
      s.sprite.rotation += s.spin * dt;
      s.sprite.alpha = 1 - e;
      s.sprite.scale.set(s.baseScale * (1 - 0.5 * e));
    }

    if (this.elapsed >= this.life) this.finish();
  }

  private finish(): void {
    this.active = false;
    this.visible = false;
    this.glow.visible = false;
    this.ring.visible = false;
    this.ringOn = false;
    this.flash.visible = false;
    this.clearSparks();
  }

  private clearSparks(): void {
    for (let i = 0; i < this.sparks.length; i++) {
      this.sparkLayer.removeChild(this.sparks[i].sprite);
      this.sparks[i].sprite.destroy();
    }
    this.sparks.length = 0;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.active = false;
    this.clearSparks();
    super.destroy(options);
  }
}
