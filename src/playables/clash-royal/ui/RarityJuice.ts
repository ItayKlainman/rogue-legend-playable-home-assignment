import { Container, Graphics, Sprite, Texture } from 'pixi.js';

// ── Per-card RARITY JUICE — idle eye-candy that escalates with tier ──────────
//
// Mounted on the BOTTOM of a skill card's container (so it draws BEHIND the
// frame's bg+border + icon when added first, or ABOVE if added last — caller's
// choice). Driven by a per-frame `render(deltaMS)` from the widget that owns
// this layer (SkillSlots.render / SkillQueue.render) — NO Ticker.shared
// handlers to leak. `destroy()` tears everything down cleanly.
//
// Tier hierarchy (clearly escalating — the user sees a clean tier-1, a softly
// breathing tier-2, and a full FX bloom on tier-3):
//   • Tier 1 (blue):    inert — `update()` is a no-op, no children spawned.
//   • Tier 2 (purple):  soft radial glow behind the card, gentle alpha breathe
//                       (~1.5s sin), tinted purple. No sparkles, no shine.
//   • Tier 3 (yellow):  full treatment —
//                         1) radial GLOW that pulses (slower, deeper),
//                         2) 2–3 drifting SPARKLE stars rising off the card
//                            and respawning at the bottom (loop),
//                         3) periodic SHINE-SWEEP diagonal streak across the
//                            icon every ~3s, masked to the hex silhouette so
//                            it never reads as a square.
//
// Performance: a single canvas-baked soft-glow texture is shared across ALL
// RarityJuice instances (~5KB at runtime, zero bundle bytes). Sparkles are
// `Graphics` polygons (Reuse-the-makeStar pattern from user's notes); each
// instance owns its own (cheap). Shine sweep is a single Graphics rectangle
// with a mask copy of the card's border texture.

// ── Tier tints ──
const TIER_TINT: Record<1 | 2 | 3, number> = {
  1: 0x6db4ff, // blue — unused (tier-1 is inert)
  2: 0xc28bff, // purple
  3: 0xffc24a, // amber/gold
};

const SPARKLE_GOLD = 0xffe27a;

// ── Perf A/B toggles (dev/profiling only — read off globalThis.__crPerf). ──
// Set via Playwright addInitScript before page load to disable a single suspect
// and measure its FPS contribution. Absent in production (flag undefined → all on).
function perfFlag(name: 'noMask' | 'noJuice'): boolean {
  const f = (globalThis as { __crPerf?: Record<string, boolean> }).__crPerf;
  return !!(f && f[name]);
}

// ── Shared soft-glow texture (canvas-baked radial gradient). ──
let GLOW_TEX: Texture | null = null;
function glowTexture(): Texture {
  if (GLOW_TEX) return GLOW_TEX;
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  // Softened falloff — the gentler shoulder (lower mid-alpha, earlier fade) bakes
  // the blur that tier-2 used to apply at runtime via a BlurFilter. Dropping that
  // per-frame filter removes a render-texture round-trip per card per frame, which
  // is one of the biggest non-DPR Safari-iOS GPU wins (see m21-perf-ab.mjs).
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,240,200,0.5)');
  grad.addColorStop(0.7, 'rgba(255,210,140,0.14)');
  grad.addColorStop(1.0, 'rgba(255,200,90,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  GLOW_TEX = Texture.from(canvas);
  return GLOW_TEX;
}

/** Build a gold star polygon (4-point-prominent = 8 alternating outer/inner verts).
 *  Standard sparkle look — outer=tip length, inner=outer*0.4. Filled with gold by
 *  default. Caller can override tint via sprite.tint or graphics.tint. */
function makeStar(outer: number, color = SPARKLE_GOLD): Graphics {
  const inner = outer * 0.4;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new Graphics().poly(pts).fill(color);
}

interface Sparkle {
  star: Graphics;
  // current "phase" in [0..1] — 0 = bottom edge, 1 = top edge → wraps back to 0.
  phase: number;
  // per-sparkle drift speed (phase per second).
  speed: number;
  // horizontal jitter offset (px from center) — randomly +/-.
  xJitter: number;
  // base scale (pre-fade).
  baseScale: number;
  // per-sparkle rotation rate (rad/s).
  spin: number;
}

export interface RarityJuiceOptions {
  /** Card-local center y of the area to juice (usually the icon's y). */
  centerY?: number;
  /** Vertical half-extent in card-local units — sparkles travel ±this from center. */
  halfHeight?: number;
  /** Horizontal half-extent — sparkles drift within ±this of center x. */
  halfWidth?: number;
  /** Optional hex silhouette texture for masking the shine sweep (tier-3 only). When
   *  omitted the shine sweep is a plain rectangle (still nice, but not hex-true). */
  borderTex?: Texture;
  /** Scale to apply to `borderTex` so the mask matches the card's actual border size. */
  borderScale?: number;
  /** Sparkle count override (default 3 for slot-card; pass 2 for deck-tile to keep
   *  the smaller tile uncluttered). Only used for tier-3. */
  sparkleCount?: number;
}

export class RarityJuice extends Container {
  private readonly tier: 1 | 2 | 3;
  // Named `juiceTint` (not plain `tint`) — PIXI v8's Container already has a public
  // `tint` getter/setter; shadowing it with a private field hits TS2415.
  private readonly juiceTint: number;
  private elapsed = 0;

  // Tier-2+ layers — created lazily based on tier.
  private glow: Sprite | null = null;
  // Tier-3-only layers.
  private sparkles: Sparkle[] = [];
  private shine: Graphics | null = null;
  private shineMask: Sprite | null = null;
  private readonly opts: Required<Omit<RarityJuiceOptions, 'borderTex' | 'borderScale'>> & Pick<RarityJuiceOptions, 'borderTex' | 'borderScale'>;

  constructor(tier: 1 | 2 | 3, opts: RarityJuiceOptions = {}) {
    super();
    this.tier = tier;
    this.juiceTint = TIER_TINT[tier];
    this.eventMode = 'none'; // purely decorative — taps pass through
    this.opts = {
      centerY: opts.centerY ?? 0,
      halfHeight: opts.halfHeight ?? 50,
      halfWidth: opts.halfWidth ?? 40,
      sparkleCount: opts.sparkleCount ?? 3,
      borderTex: opts.borderTex,
      borderScale: opts.borderScale,
    };
    if (perfFlag('noJuice')) { this.tier = 1 as 1 | 2 | 3; return; } // profiling: fully inert
    // Glow is LEGENDARY-only now (tier 3 / yellow). Tier 1 (blue) and tier 2 (purple) are
    // inert — no glow — so the gold bloom reads as a genuine "legendary" signal.
    if (tier === 3) {
      this.buildGlow();
      this.buildSparkles(this.opts.sparkleCount);
      this.buildShine();
    }
  }

  /** Per-frame pump. Called from the parent widget's render(deltaMS). NOTE: named
   *  `update` (not `render`) to avoid colliding with PIXI Container's internal `render`
   *  override slot — overriding `render` causes a TS2415 incompatible-override error. */
  update(deltaMS: number): void {
    if (this.tier !== 3) return; // only legendary (tier-3) has juice now; tier-1/2 are inert
    this.elapsed += deltaMS;
    const dt = deltaMS / 1000;
    this.advanceGlow();
    this.advanceSparkles(dt);
    this.advanceShine();
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    // Children (glow Sprite, sparkle Graphics, shine Graphics + mask Sprite) are
    // owned by us and torn down via super.destroy({children:true}). Module-shared
    // GLOW_TEX is intentionally NOT destroyed.
    super.destroy(options);
  }

  // ── builders ────────────────────────────────────────────────────────────

  private buildGlow(): void {
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = this.juiceTint;
    glow.position.set(0, this.opts.centerY);
    // Size: cover the card's icon area + a halo around it. The glow texture is 256×256;
    // scale so it's ~2× the icon box (roughly fits a slot card hex; deck tiles scale
    // down naturally because the parent container is smaller).
    const targetD = Math.max(this.opts.halfHeight, this.opts.halfWidth) * 3.4;
    glow.scale.set(targetD / 256);
    glow.alpha = this.tier === 2 ? 0.45 : 0.55; // initial; pulse modulates around this
    // No runtime BlurFilter: the softness is now baked into the shared glow texture's
    // gradient (see glowTexture). A per-frame filter is a render-texture round-trip per
    // card — brutal on Safari iOS — for a softening the texture already provides.
    this.glow = glow;
    // Glow goes at the BOTTOM of THIS container so it draws behind everything else
    // (sparkles + shine). Caller still controls where this RarityJuice sits in the
    // PARENT (i.e. behind or in front of the card body).
    this.addChildAt(glow, 0);
  }

  private buildSparkles(count: number): void {
    for (let i = 0; i < count; i++) {
      const outer = 4 + Math.random() * 3; // 4–7px star outer radius
      const star = makeStar(outer, SPARKLE_GOLD);
      star.blendMode = 'add';
      // Mix gold + tier color: ~1 in 3 sparkles are tier-tinted.
      if (Math.random() < 0.34) star.tint = this.juiceTint;
      // Initial phase + speed jitter so they don't move in lockstep.
      const baseScale = 0.8 + Math.random() * 0.4;
      star.scale.set(baseScale);
      this.addChild(star);
      this.sparkles.push({
        star,
        phase: Math.random(), // start mid-arc so they don't all spawn at the bottom
        speed: 0.35 + Math.random() * 0.25, // ~3-4s full bottom-to-top transit
        xJitter: (Math.random() - 0.5) * this.opts.halfWidth * 1.4,
        baseScale,
        spin: (Math.random() - 0.5) * 1.6, // gentle spin
      });
    }
  }

  private buildShine(): void {
    // Diagonal white streak (a thin tall rectangle, rotated 25°). It starts off
    // the card's LEFT edge and translates across to off the RIGHT edge over the
    // shine duration. Masked to the card's hex border so it never reads square.
    const shine = new Graphics();
    // The rectangle is wider than the card on its short axis so the angled streak
    // covers full diagonal; height extends well beyond the card vertically to allow
    // the rotation without clipping.
    const stripeW = Math.max(this.opts.halfWidth, this.opts.halfHeight) * 0.5;
    const stripeH = Math.max(this.opts.halfWidth, this.opts.halfHeight) * 3.4;
    shine.rect(-stripeW / 2, -stripeH / 2, stripeW, stripeH).fill({ color: 0xffffff });
    shine.rotation = -Math.PI / 6.5; // ~28°
    shine.blendMode = 'add';
    shine.alpha = 0; // hidden until the sweep cycle reveals it
    shine.visible = false; // parked → off the render+stencil path until advanceShine reveals it
    shine.position.set(-this.opts.halfWidth * 1.6, this.opts.centerY);
    this.shine = shine;
    this.addChild(shine);

    // Mask: a copy of the card's hex border so the shine reads as "light passing
    // INSIDE the hex" not a square stripe. Only available if caller passed borderTex.
    if (this.opts.borderTex && this.opts.borderScale != null && !perfFlag('noMask')) {
      const mask = new Sprite(this.opts.borderTex);
      mask.anchor.set(0.5);
      mask.scale.set(this.opts.borderScale);
      mask.position.set(0, this.opts.centerY);
      // Mask must be a child of the same container as the masked node and added to
      // this container's tree so it participates in the render. (PIXI v8 takes any
      // displayobject as mask; using a Sprite of the border keeps the silhouette
      // perfectly aligned with the on-card border.)
      this.addChild(mask);
      this.shineMask = mask;
      shine.mask = mask;
    }
  }

  // ── per-frame advance ───────────────────────────────────────────────────

  /** Sin-pulse the glow's alpha around its base. Tier-2 = subtle, slow (~1.5s).
   *  Tier-3 = a touch deeper + slightly faster (~1.2s). */
  private advanceGlow(): void {
    if (!this.glow) return;
    const period = this.tier === 2 ? 1500 : 1200;
    const phase = (this.elapsed % period) / period;
    const sin = Math.sin(phase * Math.PI * 2);
    const base = this.tier === 2 ? 0.42 : 0.55;
    const swing = this.tier === 2 ? 0.18 : 0.30;
    this.glow.alpha = base + sin * swing;
    // For tier-3, also gently breathe the glow's scale so it reads as a living halo.
    if (this.tier === 3) {
      const breath = 1 + sin * 0.06;
      const targetD = Math.max(this.opts.halfHeight, this.opts.halfWidth) * 3.4;
      this.glow.scale.set((targetD / 256) * breath);
    }
  }

  /** Each sparkle drifts upward through `phase` ∈ [0,1]; when it tops out it wraps
   *  back to 0 (re-enters at the bottom). Alpha fades in at the bottom + out at
   *  the top so the loop reads as continuous emission, not a teleport. */
  private advanceSparkles(dt: number): void {
    for (let i = 0; i < this.sparkles.length; i++) {
      const s = this.sparkles[i];
      s.phase += s.speed * dt;
      if (s.phase >= 1) s.phase -= 1;
      // y travels from +halfHeight (bottom) up to -halfHeight (top) as phase 0→1.
      const y = this.opts.centerY + this.opts.halfHeight - s.phase * (this.opts.halfHeight * 2);
      // x: base jitter + a small sinusoidal wobble so the rise isn't a straight line.
      const wobble = Math.sin(s.phase * Math.PI * 4) * (this.opts.halfWidth * 0.18);
      s.star.position.set(s.xJitter + wobble, y);
      // Fade-in over first 15%, fade-out over last 25%.
      const a = s.phase < 0.15
        ? s.phase / 0.15
        : (s.phase > 0.75 ? (1 - s.phase) / 0.25 : 1);
      s.star.alpha = Math.max(0, Math.min(1, a));
      // Gentle spin + a touch of scale variation through the rise.
      s.star.rotation += s.spin * dt;
      s.star.scale.set(s.baseScale * (0.9 + 0.15 * Math.sin(s.phase * Math.PI)));
    }
  }

  /** Shine cycle: every SHINE_PERIOD ms, the streak sweeps from left → right over
   *  SHINE_DURATION ms. Outside the sweep, alpha is 0 (the streak is parked). */
  private advanceShine(): void {
    if (!this.shine) return;
    const SHINE_PERIOD = 3000; // ms — once every ~3s
    const SHINE_DURATION = 600;
    const t = this.elapsed % SHINE_PERIOD;
    if (t >= SHINE_DURATION) {
      // Parked between sweeps (~80% of the time). Hide the masked Graphics entirely
      // (visible=false) rather than just alpha=0 — PIXI skips a hidden node AND its
      // stencil-mask setup, so the per-card mask round-trip (a Safari-iOS GPU cost)
      // is only paid during the brief active sweep. Visual is unchanged: the mask
      // still clips the streak to the hex while it's actually visible.
      if (this.shine.visible) this.shine.visible = false;
      this.shine.alpha = 0;
      return;
    }
    if (!this.shine.visible) this.shine.visible = true;
    const u = t / SHINE_DURATION; // 0..1 through the sweep
    // X travels from -halfWidth*1.6 (off-left) to +halfWidth*1.6 (off-right).
    const x = -this.opts.halfWidth * 1.6 + u * (this.opts.halfWidth * 3.2);
    this.shine.position.set(x, this.opts.centerY);
    // Triangular alpha: 0 → 0.85 at mid-sweep → 0.
    const a = u < 0.5 ? u * 2 : (1 - u) * 2;
    this.shine.alpha = a * 0.85;
  }
}
