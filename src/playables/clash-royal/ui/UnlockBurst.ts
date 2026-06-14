import { Container, Sprite, Texture } from 'pixi.js';

// ── Skill-slot "SKILL UNLOCKED" burst ────────────────────────────────────────
// Replaces the old additive WHITE ROUNDED-RECT flash (a rectangle over a HEX card)
// with a shape-true celebratory pop. Three layers, all additive, all SHORT:
//   1) a soft round glow that blooms behind the card (circular — never a rect),
//   2) an expanding + fading COPY of the tier's hex `_Border` sprite (the pop in
//      the card's OWN hexagon silhouette — no rectangle),
//   3) ~14 small gold/white spark sprites bursting radially outward with per-spark
//      velocity + drag + gravity + spin, alpha + scale easing out.
// A FEW sparks + the glow + the ring are tinted toward the slot's TIER color
// (Blue t1 / Purple t2 / amber t3) for cohesion.
//
// Driven by an externally-fed `update(deltaMS)` (the widget already ticks every
// frame via SkillSlots.render) so there is NO own Ticker.shared handler to leak.
// `destroy()` tears everything down immediately if the widget dies mid-burst.

const SPARK_COUNT = 14;
const LIFE_MS = 560;        // whole burst lifetime
const RING_LIFE_MS = 420;   // hex-ring pulse is a touch snappier than the sparks
const GLOW_LIFE_MS = 360;   // round glow blooms + fades quickest

// One shared soft radial-gradient spark texture, baked ONCE from an offscreen
// <canvas>. `Texture.from(canvas)` adds ZERO bytes to the bundle and is allowed by
// the repo's check:textures guard (it only forbids Texture.from(<imported URL>)).
let SPARK_TEX: Texture | null = null;
function sparkTexture(): Texture {
  if (SPARK_TEX) return SPARK_TEX;
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  // Hot white core → warm gold mid → transparent edge. Tinting per-sprite shifts
  // the whole gradient toward the spark's color while keeping the soft falloff.
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

// tier → cohesion tint. Blue t1, Purple t2, amber t3.
const TIER_TINT: Record<1 | 2 | 3, number> = { 1: 0x6db4ff, 2: 0xc28bff, 3: 0xffc24a };

const GOLD = 0xffd87a;
const WHITE = 0xffffff;

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

interface Spark {
  sprite: Sprite;
  vx: number;   // px/s
  vy: number;   // px/s
  spin: number; // rad/s
  baseScale: number;
}

export class UnlockBurst extends Container {
  private elapsed = 0;
  private readonly life = LIFE_MS;
  private active = false;

  private readonly glow: Sprite;
  private readonly ring: Sprite;
  private readonly sparkLayer: Container;
  private sparks: Spark[] = [];
  private tierTint = TIER_TINT[1];

  constructor() {
    super();
    // Whole burst draws additively; it sits ABOVE the lit card.
    this.eventMode = 'none';

    // z0: round glow (reuses the soft spark texture, scaled big + tinted).
    this.glow = new Sprite(sparkTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.visible = false;
    this.addChild(this.glow);

    // z1: expanding hex-border ring (texture/scale assigned per-play from the slot's
    // own tier border, so the silhouette matches exactly — no rectangle).
    this.ring = new Sprite(Texture.EMPTY);
    this.ring.anchor.set(0.5);
    this.ring.blendMode = 'add';
    this.ring.visible = false;
    this.addChild(this.ring);

    // z2: spark sprites.
    this.sparkLayer = new Container();
    this.addChild(this.sparkLayer);
  }

  get isPlaying(): boolean {
    return this.active;
  }

  /**
   * Fire the burst centered at (x,y) in the burst container's local coords.
   * @param tial        slot tier (drives cohesion tint).
   * @param borderTex   the tier's hex `_Border` texture (for the shape-true ring).
   * @param borderScale the live card's border scale (so the ring starts card-sized).
   */
  play(x: number, y: number, tier: 1 | 2 | 3, borderTex: Texture, borderScale: number): void {
    this.position.set(x, y);
    this.elapsed = 0;
    this.active = true;
    this.visible = true;
    this.tierTint = TIER_TINT[tier];

    // ── glow ── soft round bloom behind the card.
    this.glow.visible = true;
    this.glow.tint = this.tierTint;
    this.glow.alpha = 0;
    this.glow.scale.set(2.2);

    // ── ring ── a fading expanding COPY of this tier's hex border.
    this.ring.texture = borderTex;
    this.ring.visible = true;
    this.ring.tint = WHITE;
    this.ring.alpha = 1;
    this.ring.scale.set(borderScale);
    this.ringBaseScale = borderScale;

    // ── sparks ── rebuild fresh each play (cheap; SPARK_COUNT small).
    this.clearSparks();
    const tex = sparkTexture();
    for (let i = 0; i < SPARK_COUNT; i++) {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      // Burst from a small jittered ring around center, fan out radially with speed
      // variance so it doesn't look like a perfect wheel.
      const ang = (i / SPARK_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 140 + Math.random() * 140; // px/s
      const startR = 6 + Math.random() * 10;
      sprite.x = Math.cos(ang) * startR;
      sprite.y = Math.sin(ang) * startR;
      // ~1 in 3 sparks carries the tier color; the rest are gold/white for sparkle.
      const roll = Math.random();
      sprite.tint = roll < 0.34 ? this.tierTint : (roll < 0.7 ? GOLD : WHITE);
      const baseScale = 0.28 + Math.random() * 0.26;
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

  private ringBaseScale = 1;

  /** Advance the burst. Fed deltaMS by the widget's per-frame render. */
  update(deltaMS: number): void {
    if (!this.active) return;
    this.elapsed += deltaMS;
    const dt = deltaMS / 1000;

    // ── glow: bloom in over first 30%, fade out the rest. ──
    {
      const t = Math.min(1, this.elapsed / GLOW_LIFE_MS);
      // 0→1 alpha curve that rises fast then eases away.
      const a = t < 0.3 ? (t / 0.3) : (1 - (t - 0.3) / 0.7);
      this.glow.alpha = Math.max(0, a) * 0.85;
      this.glow.scale.set(2.2 + easeOutCubic(t) * 1.0);
      if (t >= 1) this.glow.visible = false;
    }

    // ── ring: expand 1.0→1.35× of the card border, alpha 1→0 (ease-out). ──
    {
      const t = Math.min(1, this.elapsed / RING_LIFE_MS);
      const e = easeOutCubic(t);
      this.ring.scale.set(this.ringBaseScale * (1 + e * 0.35));
      this.ring.alpha = 1 - e;
      if (t >= 1) this.ring.visible = false;
    }

    // ── sparks: integrate velocity + drag + gravity + spin; ease alpha/scale out. ──
    const t = Math.min(1, this.elapsed / this.life);
    const e = easeOutCubic(t);
    const DRAG = 1.8;     // velocity damping per second
    const GRAVITY = 220;  // px/s² downward pull
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      // exponential-ish drag
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

  /** Burst complete: hide + free per-play sprites, but keep the (cheap) glow/ring
   *  sprites + this container alive for reuse on the next unlock. */
  private finish(): void {
    this.active = false;
    this.visible = false;
    this.glow.visible = false;
    this.ring.visible = false;
    this.ring.texture = Texture.EMPTY;
    this.clearSparks();
  }

  private clearSparks(): void {
    for (let i = 0; i < this.sparks.length; i++) {
      this.sparkLayer.removeChild(this.sparks[i].sprite);
      this.sparks[i].sprite.destroy();
    }
    this.sparks.length = 0;
  }

  /** Hard teardown if the widget dies mid-burst. The shared SPARK_TEX is module-level
   *  and intentionally NOT destroyed (it's reused across all slots/instances). */
  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.active = false;
    this.clearSparks();
    super.destroy(options);
  }
}
