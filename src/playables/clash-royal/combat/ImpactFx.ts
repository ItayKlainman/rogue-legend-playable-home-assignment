// ImpactFx — the IMPACT PARTICLE SYSTEM for clash-royal skill casts.
//
// Owns a single Container (added to battleArea by CombatFx) and a SINGLE ticker
// handler on the app ticker that integrates every live effect each frame and
// reaps them when their lifetime ends. There is NO Ticker.shared usage and the
// one handler is removed in destroy() — honoring the repo's hard lesson about
// leaked ticker handlers killing the app.
//
// All textures are BAKED once from offscreen <canvas> (Texture.from(canvas) — zero
// bundle bytes, allowed by check:textures; never Texture.from(<imported URL>)).
// Reuses the soft-spark approach from ui/UnlockBurst.ts.
//
// Three baked textures:
//   - SPARK: soft white-core radial gradient (used for sparks, embers, glow bloom).
//   - DEBRIS: a small hard-ish chunk (radial with a tighter falloff) for meteor debris.
//   - RING: a stroked hollow circle for the expanding shockwave ring.
//
// Public API (called by CombatFx, which forwards from the CosmeticVfxContext):
//   impactBurst(x, y, opts)  — radial particle burst (embers/sparks) with velocity,
//                              drag, gravity, ease-out alpha+scale.
//   shockwave(x, y, opts)    — an expanding + fading stroked ring.
//   glowBloom(x, y, opts)    — a soft additive glow that blooms then fades.
import { Container, Sprite, Texture, Ticker } from 'pixi.js';

let SPARK_TEX: Texture | null = null;
let DEBRIS_TEX: Texture | null = null;
let RING_TEX: Texture | null = null;

/** Soft round spark: hot white core → warm falloff → transparent edge. Tint per-sprite. */
function sparkTexture(): Texture {
  if (SPARK_TEX) return SPARK_TEX;
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,248,230,0.92)');
  grad.addColorStop(0.7, 'rgba(255,225,170,0.38)');
  grad.addColorStop(1.0, 'rgba(255,210,140,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  SPARK_TEX = Texture.from(canvas);
  return SPARK_TEX;
}

/** Debris chunk: tighter, harder-edged white blob for meteor ember/rock fling. Tint per-sprite. */
function debrisTexture(): Texture {
  if (DEBRIS_TEX) return DEBRIS_TEX;
  const SIZE = 48;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,235,200,0.95)');
  grad.addColorStop(0.82, 'rgba(255,180,90,0.6)');
  grad.addColorStop(1.0, 'rgba(180,90,30,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  DEBRIS_TEX = Texture.from(canvas);
  return DEBRIS_TEX;
}

/** Hollow stroked ring for the shockwave; scaled big at runtime. Tint per-sprite. */
function ringTexture(): Texture {
  if (RING_TEX) return RING_TEX;
  const SIZE = 128;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  // A soft-edged annulus: bright thin ring with a feathered inner+outer falloff.
  const grad = ctx.createRadialGradient(r, r, r * 0.62, r, r, r * 0.96);
  grad.addColorStop(0.0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  RING_TEX = Texture.from(canvas);
  return RING_TEX;
}

function easeOutCubic(t: number): number { const u = 1 - t; return 1 - u * u * u; }

export type ImpactFamily = 'fire' | 'lightning' | 'shuriken' | 'none';

export interface BurstOptions {
  family?: ImpactFamily;
  /** Number of particles. */
  count?: number;
  /** Base outward speed (px/s). */
  speed?: number;
  /** Base particle scale. */
  scale?: number;
  /** Lifetime ms. */
  life?: number;
  /** Downward gravity px/s² (embers fall; sparks ~0). */
  gravity?: number;
  /** Use the harder DEBRIS texture instead of the soft spark (meteor debris). */
  debris?: boolean;
}

export interface ShockwaveOptions {
  family?: ImpactFamily;
  /** Final ring radius in px. */
  radius?: number;
  life?: number;
  /** Initial line thickness factor (visual via scale of the soft annulus). */
  thickness?: number;
}

export interface GlowOptions {
  family?: ImpactFamily;
  /** Peak radius in px. */
  radius?: number;
  life?: number;
  alpha?: number;
}

// Family → warm/cool palette the burst pulls from (the soft texture is tinted per-sprite).
const FAMILY_COLORS: Record<ImpactFamily, number[]> = {
  fire: [0xffffff, 0xffd24a, 0xff8a2a, 0xff5a1e],
  // Lightning — shifted toward SATURATED electric blue/violet (one white spark for a hot
  // core, the rest blue/cyan/violet). The earlier palette was mostly white/pale-blue which,
  // under additive blend over the bright bg, washed out to a fire-like white poof — the
  // "lightning doesn't trigger lightning" read. The bolt arc carries the shape; these
  // sparks now carry the electric COLOR.
  lightning: [0xffffff, 0x4aa6ff, 0x1f9bff, 0x7e5cff, 0x9fd8ff],
  shuriken: [0xffffff, 0xfff0a0, 0xffd060],
  none: [0xffffff, 0x9affb0],
};
const GLOW_COLOR: Record<ImpactFamily, number> = {
  fire: 0xff8326, lightning: 0x86c8ff, shuriken: 0xffd24a, none: 0x7bff9a,
};

interface Particle {
  sprite: Sprite;
  vx: number; vy: number;
  spin: number;
  baseScale: number;
  gravity: number;
  age: number; life: number;
}
interface Ring {
  sprite: Sprite;
  age: number; life: number;
  fromScale: number; toScale: number;
}
interface Glow {
  sprite: Sprite;
  age: number; life: number;
  peakScale: number; peakAlpha: number;
}

export class ImpactFx {
  readonly container: Container;
  private readonly particleLayer: Container;
  private readonly particles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly glows: Glow[] = [];
  private readonly tickHandler: (t: Ticker) => void;
  private destroyed = false;

  constructor(
    parent: Container,
    private readonly ticker: Ticker,
    private readonly speed = 1,
  ) {
    this.container = new Container();
    this.container.eventMode = 'none';
    // Glows + rings sit below the particle sparks for a clean read.
    this.particleLayer = new Container();
    this.particleLayer.eventMode = 'none';
    this.container.addChild(this.particleLayer);
    parent.addChild(this.container);
    // Single persistent handler integrating all live effects. Removed in destroy().
    this.tickHandler = (t: Ticker) => this.update(t.deltaMS * this.speed);
    this.ticker.add(this.tickHandler);
  }

  /** Radial particle burst (embers/sparks) at (x,y) in the parent's local coords. */
  impactBurst(x: number, y: number, opts: BurstOptions = {}): void {
    if (this.destroyed) return;
    const family = opts.family ?? 'fire';
    const count = opts.count ?? 18;
    const speed = opts.speed ?? 240;
    const baseScale = opts.scale ?? 0.5;
    const life = opts.life ?? 560;
    const gravity = opts.gravity ?? (family === 'fire' ? 260 : 40);
    const tex = opts.debris ? debrisTexture() : sparkTexture();
    const palette = FAMILY_COLORS[family];
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      const spd = speed * (0.55 + Math.random() * 0.9);
      const startR = 4 + Math.random() * 12;
      sprite.x = x + Math.cos(ang) * startR;
      sprite.y = y + Math.sin(ang) * startR;
      sprite.tint = palette[Math.floor(Math.random() * palette.length)];
      const sc = baseScale * (0.6 + Math.random() * 0.8);
      sprite.scale.set(sc);
      sprite.rotation = Math.random() * Math.PI * 2;
      this.particleLayer.addChild(sprite);
      this.particles.push({
        sprite,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (family === 'fire' ? Math.random() * 60 : 0),
        spin: (Math.random() - 0.5) * 10,
        baseScale: sc,
        gravity,
        age: 0,
        life: life * (0.7 + Math.random() * 0.5),
      });
    }
  }

  /** Expanding + fading stroked ring (shockwave) at (x,y). */
  shockwave(x: number, y: number, opts: ShockwaveOptions = {}): void {
    if (this.destroyed) return;
    const family = opts.family ?? 'fire';
    const radius = opts.radius ?? 120;
    const life = opts.life ?? 420;
    const thickness = opts.thickness ?? 1;
    const sprite = new Sprite(ringTexture());
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.position.set(x, y);
    sprite.tint = family === 'fire' ? 0xffb45a : family === 'lightning' ? 0xaeddff : 0xffe08a;
    // ringTexture is 128px → scale 1 ≈ 64px radius. Start small, grow to `radius`.
    const fromScale = (12 / 64) * thickness;
    const toScale = radius / 64;
    sprite.scale.set(fromScale);
    sprite.alpha = 0.95;
    this.container.addChildAt(sprite, 0); // below particles
    this.rings.push({ sprite, age: 0, life, fromScale, toScale });
  }

  /** Soft additive glow bloom at (x,y) — orange/electric flash that blooms then fades. */
  glowBloom(x: number, y: number, opts: GlowOptions = {}): void {
    if (this.destroyed) return;
    const family = opts.family ?? 'fire';
    const radius = opts.radius ?? 140;
    const life = opts.life ?? 360;
    const peakAlpha = opts.alpha ?? 0.8;
    const sprite = new Sprite(sparkTexture());
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.position.set(x, y);
    sprite.tint = GLOW_COLOR[family];
    // sparkTexture is 64px → scale 1 ≈ 32px radius. Scale to peak radius.
    const peakScale = radius / 32;
    sprite.scale.set(peakScale * 0.4);
    sprite.alpha = 0;
    this.container.addChildAt(sprite, 0);
    this.glows.push({ sprite, age: 0, life, peakScale, peakAlpha });
  }

  private update(deltaMS: number): void {
    if (this.destroyed) return;
    const dt = deltaMS / 1000;

    // ── particles ──
    const DRAG = 1.9;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += deltaMS;
      const t = Math.min(1, p.age / p.life);
      const e = easeOutCubic(t);
      const damp = Math.max(0, 1 - DRAG * dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      p.sprite.alpha = 1 - e;
      p.sprite.scale.set(p.baseScale * (1 - 0.55 * e));
      if (t >= 1) {
        this.particleLayer.removeChild(p.sprite);
        p.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }

    // ── rings ──
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += deltaMS;
      const t = Math.min(1, r.age / r.life);
      const e = easeOutCubic(t);
      r.sprite.scale.set(r.fromScale + (r.toScale - r.fromScale) * e);
      r.sprite.alpha = 0.95 * (1 - e);
      if (t >= 1) {
        this.container.removeChild(r.sprite);
        r.sprite.destroy();
        this.rings.splice(i, 1);
      }
    }

    // ── glows ──
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      g.age += deltaMS;
      const t = Math.min(1, g.age / g.life);
      // bloom in over first 30%, fade out the rest
      const a = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      g.sprite.alpha = Math.max(0, a) * g.peakAlpha;
      g.sprite.scale.set(g.peakScale * (0.4 + easeOutCubic(t) * 0.8));
      if (t >= 1) {
        this.container.removeChild(g.sprite);
        g.sprite.destroy();
        this.glows.splice(i, 1);
      }
    }
  }

  /** Hard teardown: remove the ticker handler, destroy all live sprites + the container.
   *  The shared baked textures are module-level and intentionally NOT destroyed. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ticker.remove(this.tickHandler);
    for (let i = 0; i < this.particles.length; i++) this.particles[i].sprite.destroy();
    for (let i = 0; i < this.rings.length; i++) this.rings[i].sprite.destroy();
    for (let i = 0; i < this.glows.length; i++) this.glows[i].sprite.destroy();
    this.particles.length = 0;
    this.rings.length = 0;
    this.glows.length = 0;
    this.container.destroy({ children: true });
  }
}
