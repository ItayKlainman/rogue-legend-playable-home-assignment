import { Container, Graphics, Sprite, Texture } from 'pixi.js';

// ── Star "earn" transition — used by SkillSlots + SkillQueue ──────────────────
//
// When a deck/slot star advances from cutout (disabled) → filled (gold), the user
// asked for a RICH transition: the cutout visibly TRANSFORMS into the filled
// star — spinning + scaling + a burst of mini gold sparkles. Not a fade, not a
// snap. The animation runs ~480ms total over three concurrent layers:
//
//   1) Cutout star (the disabled sprite the caller passes in):
//      0–240ms : spin to 360° (one full rotation) + scale 1 → 1.15
//      240–480ms: spin continues to 720° + alpha 1→0 + scale 1.15→0
//      At end : sprite is hidden by us (caller can re-show on a future demote).
//
//   2) Filled star (the gold sprite the caller passes in):
//      hidden at start, t < 240ms
//      240ms  : appear at scale 0, alpha 0, rotation -180° (mid-spin entry)
//      240–360ms : scale 0→1.2 + alpha 0→1 + rotation -180°→0
//      360–480ms : settle scale 1.2→1.0 with easeOutBack
//      Stays mounted at final size.
//
//   3) Particle burst (mini gold stars built via makeStar):
//      spawned at the swap moment (t ≈ 240ms) — 4–8 sparkles at the cutout's
//      position with random outward velocity, gravity, spin, and linear alpha
//      fade over ~600ms lifetime. blendMode='add' so they glow over the card.
//      Spawned into a host container the caller supplies.
//
// Driving: NO Ticker.shared. The caller advances all in-flight animations from
// its per-frame render(deltaMS) by calling `StarFillAnimGroup.update(deltaMS)`.
// Cleanup: when all internal phases finish the entry is removed from the group's
// active list; particles destroy themselves on lifetime expiry.

// ── Constants ──
const SPIN_DURATION = 480;         // ms total span of the cutout spin + filled settle
const CUTOUT_SCALE_PEAK_T = 240;   // ms — apex of the cutout's scale-up (1.0→1.15)
const SWAP_T = 240;                // ms — moment cutout starts shrinking + filled appears
const FILLED_APPEAR_T = 240;       // alias
const FILLED_OVERSHOOT_T = 360;    // ms — filled reaches peak (1.2) and starts settling
const FILLED_SETTLE_T = 480;       // ms — filled settles to 1.0 (= total duration)
const PARTICLE_LIFETIME = 600;     // ms each sparkle lives
const PARTICLE_GRAVITY = 200;      // px/s² downward acceleration on each sparkle
const SPARKLE_COLOR = 0xffe27a;    // gold (matches RarityJuice SPARKLE_GOLD)

// ── makeStar — local copy of RarityJuice's 8-vertex gold star polygon. Re-creating
//    it here keeps this module standalone (so the prior agent's RarityJuice file
//    stays untouched per Mission #8's scope). Same shape: 4-point-prominent star
//    with outer/inner alternating verts. ──
function makeStar(outer: number, color = SPARKLE_COLOR): Graphics {
  const inner = outer * 0.4;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new Graphics().poly(pts).fill(color);
}

// ── Shared star textures (canvas-baked per outer-radius bucket). Sparkles use
//    Sprite + a shared Texture instead of fresh Graphics every spawn so we don't
//    thrash the GPU on every merge. Texture is the size of the bbox + 1px pad. ──
const STAR_TEX_CACHE = new Map<number, Texture>();
function sparkleTexture(outer: number): Texture {
  const cached = STAR_TEX_CACHE.get(outer);
  if (cached) return cached;
  const SIZE = Math.ceil(outer * 2 + 2);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  // Draw the star polygon centered in the canvas.
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const inner = outer * 0.4;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffe27a';
  ctx.fill();
  const tex = Texture.from(canvas);
  STAR_TEX_CACHE.set(outer, tex);
  return tex;
}

// ── Per-anim state ──
interface ActiveAnim {
  cutout: Sprite;
  filled: Sprite;
  cutoutBaseScale: number;
  filledBaseScale: number;
  particles: Particle[];
  t: number; // elapsed ms across the whole 480ms group
  particleHost: Container;
  // ── caller hook: invoked once when the cutout reaches its peak so the caller
  //    can also fire any side effects timed to the swap (e.g. SFX). Optional. ──
  onSwap?: () => void;
  onSwapFired: boolean;
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  spin: number;     // rad/s
  rotation: number; // rad (accumulated)
  age: number;      // ms
  lifetime: number; // ms
  baseScale: number;
}

// ── Per-call tuning (slot card vs. deck tile). ──
export interface StarFillAnimOptions {
  /** Cutout sprite currently visible at the target row position. Will be spun + faded. */
  cutout: Sprite;
  /** Filled (gold) sprite at the same position. Will be revealed + overshot + settled. */
  filled: Sprite;
  /** The sprite's natural rest scale — both sprites are restored/parented around this. */
  baseScale: number;
  /** Where the sprite center lives in the host container (matches cutout/filled position). */
  centerX: number;
  centerY: number;
  /** A Container the particle burst is parented into (typically the same parent the
   *  cutout + filled are already children of — keeps coords aligned). */
  host: Container;
  /** Sparkle count (default 8 — appropriate for slot card; pass 6 for deck tile). */
  sparkleCount?: number;
  /** Sparkle outer radius in px (default 5 — slot card; pass 3 for the smaller deck tile). */
  sparkleOuter?: number;
  /** Outward speed range for sparkles in px/s. Default [60, 120]. */
  speedMin?: number;
  speedMax?: number;
  /** Optional hook fired at the swap moment (240ms in). Caller can play SFX here. */
  onSwap?: () => void;
}

/** A group of in-flight star-fill animations. One per widget (SkillSlots and SkillQueue
 *  each own one). Spawn via `start()`, then drain via `update(deltaMS)` from the widget's
 *  per-frame render. */
export class StarFillAnimGroup {
  private active: ActiveAnim[] = [];

  /** Start one star transition. The cutout will spin+shrink, the filled will appear
   *  with overshoot, and a particle burst will fire at the swap moment. */
  start(opts: StarFillAnimOptions): void {
    const sparkleCount = opts.sparkleCount ?? 8;
    const sparkleOuter = opts.sparkleOuter ?? 5;
    const speedMin = opts.speedMin ?? 60;
    const speedMax = opts.speedMax ?? 120;
    // Pre-build the particle pool but DON'T mount yet — we mount them at the swap
    // moment so we don't pay for their render until they actually need to draw.
    const particles: Particle[] = [];
    const tex = sparkleTexture(sparkleOuter);
    for (let i = 0; i < sparkleCount; i++) {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.visible = false; // hidden until swap moment
      sprite.position.set(opts.centerX, opts.centerY);
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const baseScale = 0.7 + Math.random() * 0.6; // 0.7–1.3
      sprite.scale.set(baseScale);
      opts.host.addChild(sprite);
      particles.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: (Math.random() < 0.5 ? -1 : 1) * (Math.PI * 1.5 + Math.random() * Math.PI), // ~270–540°/s
        rotation: 0,
        age: 0,
        lifetime: PARTICLE_LIFETIME * (0.7 + Math.random() * 0.4), // jitter 0.7–1.1×
        baseScale,
      });
    }
    // Prep the cutout for the spin (rest state). Already mounted.
    opts.cutout.visible = true;
    opts.cutout.alpha = 1;
    opts.cutout.rotation = 0;
    opts.cutout.scale.set(opts.baseScale);
    // Prep the filled (hidden until swap moment).
    opts.filled.visible = false;
    opts.filled.alpha = 0;
    opts.filled.rotation = 0;
    opts.filled.scale.set(0);

    this.active.push({
      cutout: opts.cutout,
      filled: opts.filled,
      cutoutBaseScale: opts.baseScale,
      filledBaseScale: opts.baseScale,
      particles,
      t: 0,
      particleHost: opts.host,
      onSwap: opts.onSwap,
      onSwapFired: false,
    });
  }

  /** Per-frame pump. Drives every active animation forward by deltaMS and reaps
   *  finished entries. Safe to call when there are no active anims (no-op). */
  update(deltaMS: number): void {
    if (this.active.length === 0) return;
    const dt = deltaMS / 1000;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += deltaMS;
      this.advanceCutout(a);
      this.advanceFilled(a);
      this.advanceParticles(a, dt);
      // Done condition: main 480ms span past AND every particle expired.
      const allParticlesDone = a.particles.every((p) => p.age >= p.lifetime);
      if (a.t >= FILLED_SETTLE_T && allParticlesDone) {
        // Cleanup: particles already destroyed inside advanceParticles when their age
        // crosses lifetime. Just remove the active entry.
        this.active.splice(i, 1);
      }
    }
  }

  /** Force-finish every in-flight anim — sets cutout=hidden, filled=settled, drops
   *  all particles. Used when a slot's id changes mid-anim or when destroy() runs. */
  cancelAll(): void {
    for (const a of this.active) {
      a.cutout.visible = false;
      a.cutout.alpha = 1;
      a.cutout.rotation = 0;
      a.cutout.scale.set(a.cutoutBaseScale);
      a.filled.visible = true;
      a.filled.alpha = 1;
      a.filled.rotation = 0;
      a.filled.scale.set(a.filledBaseScale);
      for (const p of a.particles) {
        if (p.sprite.parent) p.sprite.parent.removeChild(p.sprite);
        p.sprite.destroy();
      }
    }
    this.active.length = 0;
  }

  /** True if any animation is currently in-flight. Cheap accessor for tests/debug. */
  get isPlaying(): boolean { return this.active.length > 0; }

  // ── private — per-layer advance ────────────────────────────────────────

  private advanceCutout(a: ActiveAnim): void {
    const base = a.cutoutBaseScale;
    if (a.t <= CUTOUT_SCALE_PEAK_T) {
      // 0–240ms: spin 0→360° + scale 1→1.15 + alpha stays 1.
      const u = a.t / CUTOUT_SCALE_PEAK_T;
      a.cutout.rotation = u * Math.PI * 2; // full revolution
      a.cutout.scale.set(base * (1 + 0.15 * u));
      a.cutout.alpha = 1;
      a.cutout.visible = true;
      return;
    }
    if (a.t < FILLED_SETTLE_T) {
      // 240–480ms: spin 360°→720° + alpha 1→0 + scale 1.15→0.
      const u = (a.t - CUTOUT_SCALE_PEAK_T) / (FILLED_SETTLE_T - CUTOUT_SCALE_PEAK_T);
      a.cutout.rotation = Math.PI * 2 + u * Math.PI * 2;
      a.cutout.alpha = 1 - u;
      a.cutout.scale.set(base * (1.15 * (1 - u)));
      a.cutout.visible = true;
      // At the swap moment, fire onSwap once + reveal particles.
      if (!a.onSwapFired) {
        a.onSwapFired = true;
        if (a.onSwap) a.onSwap();
        for (const p of a.particles) p.sprite.visible = true;
      }
      return;
    }
    // Past total span — settle cutout fully invisible.
    a.cutout.visible = false;
    a.cutout.alpha = 1; // restore alpha so any future re-use of the sprite is clean
    a.cutout.rotation = 0;
    a.cutout.scale.set(base);
  }

  private advanceFilled(a: ActiveAnim): void {
    const base = a.filledBaseScale;
    if (a.t < FILLED_APPEAR_T) {
      a.filled.visible = false;
      a.filled.alpha = 0;
      a.filled.scale.set(0);
      return;
    }
    if (a.t < FILLED_OVERSHOOT_T) {
      // 240–360ms: scale 0→1.2, alpha 0→1, rotation -180°→0.
      const u = (a.t - FILLED_APPEAR_T) / (FILLED_OVERSHOOT_T - FILLED_APPEAR_T);
      a.filled.visible = true;
      a.filled.alpha = u;
      a.filled.scale.set(base * 1.2 * u);
      a.filled.rotation = -Math.PI + u * Math.PI; // -180°→0
      return;
    }
    if (a.t < FILLED_SETTLE_T) {
      // 360–480ms: scale 1.2→1.0 with easeOutBack on the residual.
      const u = (a.t - FILLED_OVERSHOOT_T) / (FILLED_SETTLE_T - FILLED_OVERSHOOT_T);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const v = u - 1;
      const k = 1 + c3 * v * v * v + c1 * v * v; // easeOutBack
      const target = 1; // settled scale multiplier (× base)
      const peak = 1.2;
      a.filled.visible = true;
      a.filled.alpha = 1;
      a.filled.scale.set(base * (peak + (target - peak) * k));
      a.filled.rotation = 0;
      return;
    }
    // Settled.
    a.filled.visible = true;
    a.filled.alpha = 1;
    a.filled.scale.set(base);
    a.filled.rotation = 0;
  }

  private advanceParticles(a: ActiveAnim, dt: number): void {
    // Particles don't start moving until the swap moment.
    if (a.t < SWAP_T) return;
    for (const p of a.particles) {
      if (p.age >= p.lifetime) continue;
      p.age += dt * 1000;
      // Integrate motion + gravity.
      p.vy += PARTICLE_GRAVITY * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      // Spin.
      p.rotation += p.spin * dt;
      p.sprite.rotation = p.rotation;
      // Linear alpha fade over lifetime.
      const u = Math.min(1, p.age / p.lifetime);
      p.sprite.alpha = 1 - u;
      // Slight scale shrink toward end for a "ember" feel.
      p.sprite.scale.set(p.baseScale * (1 - u * 0.4));
      if (p.age >= p.lifetime) {
        // Tear down the sparkle.
        if (p.sprite.parent) p.sprite.parent.removeChild(p.sprite);
        p.sprite.destroy();
      }
    }
  }
}
