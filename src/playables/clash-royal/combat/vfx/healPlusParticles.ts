import { Container, Sprite, Texture } from 'pixi.js';

// ── Heal "+" particle burst + light-green healing mist ──────────────────────
//
// Self-contained heal-cast VFX. Two layered effects, both short-lived and driven
// by render(deltaMS) (NO Ticker.shared handler — the parent's destroy() chain frees
// us, so it can never leak):
//
//   1) A LOW soft-green MIST haze that blooms then fades AROUND the hero's body — a
//      healing aura. A single canvas-baked radial-gradient texture (the RarityJuice
//      glowTexture pattern — zero bundle bytes, no per-frame BlurFilter) drawn with
//      additive blend so it reads as light rather than a flat green disc.
//
//   2) A swarm of green "+" sprites that emit AROUND the body — a soft radial/orbital
//      spread HUGGING the torso, NOT a fountain that shoots up and spills out the top.
//      Each plus springs out from the chest along a radial direction, drifts a short
//      distance (with a faint buoyant lift that is CAPPED to the body-height envelope),
//      spins gently, and fades gracefully. "Soft and swift": quick to pop, short life,
//      graceful fade.
//
// Mounting & lifetime (unchanged caller contract):
//   const burst = new HealPlusBurst(parent, x, y);
//   // every frame: burst.render(deltaMS);  if (!burst.alive) burst.destroy();
//
// Both the "+" texture and the mist texture are BAKED once from offscreen <canvas>
// (Texture.from(canvas) — allowed by check:textures; never Texture.from(<imported
// asset url>)). Each is a module-level singleton reused across every burst forever.
//
// History: the original implementation shot plus-signs straight UP with a strong
// vy (a geyser) so they spilled out of the top of the frame ("i dont want the plus
// signs to spill out of the top, i want them emitting around his body softly and
// swiftly ... i also want light green mist around the hero"). This rewrite replaces
// the upward fountain with a body-hugging radial spread + adds the mist aura.

// ── Baked textures (module-level singletons) ────────────────────────────────
let PLUS_TEX: Texture | null = null;
let MIST_TEX: Texture | null = null;

/** Bake the chunky "+" texture: a soft glow halo behind a bold rounded white cross.
 *  White-source so PIXI per-sprite tint colours it to any green hue. */
function buildPlusTexture(): Texture {
  if (PLUS_TEX) return PLUS_TEX;
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const c = SIZE / 2;
  // Soft round glow halo behind the cross so the tinted plus blooms rather than
  // sitting as a hard flat shape — gives the swarm a sparkly, energetic read.
  const glow = ctx.createRadialGradient(c, c, 2, c, c, c);
  glow.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  glow.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
  // Bold rounded plus on top. Arm half-length and half-thickness chosen so the cross
  // fills most of the canvas with thick, crisp strokes (reads clearly when tinted).
  const armLen = SIZE * 0.40;   // distance from centre to arm tip
  const armHalf = SIZE * 0.14;  // half the bar thickness
  const ol = 3;                 // dark outline thickness (px)
  ctx.lineJoin = 'round';
  // DARK outline plus first (drawn larger). Per-sprite green tint turns this into a dark
  // green border so the small "+" reads against the bright-green forest grass (green-on-
  // green otherwise washes out). Then the white core on top tints to bright mint.
  ctx.fillStyle = 'rgba(22,64,38,0.92)';
  roundRect(ctx, c - armLen - ol, c - armHalf - ol, (armLen + ol) * 2, (armHalf + ol) * 2, (armHalf + ol) * 0.6);
  ctx.fill();
  roundRect(ctx, c - armHalf - ol, c - armLen - ol, (armHalf + ol) * 2, (armLen + ol) * 2, (armHalf + ol) * 0.6);
  ctx.fill();
  // White core plus.
  ctx.fillStyle = 'rgba(255,255,255,1)';
  roundRect(ctx, c - armLen, c - armHalf, armLen * 2, armHalf * 2, armHalf * 0.6);
  ctx.fill();
  roundRect(ctx, c - armHalf, c - armLen, armHalf * 2, armLen * 2, armHalf * 0.6);
  ctx.fill();
  PLUS_TEX = Texture.from(canvas);
  return PLUS_TEX;
}

/** Bake the soft healing-mist texture: a wide, very-soft radial gradient. White-source
 *  (tinted green per-sprite) with a gentle shoulder so the additive blend reads as a
 *  light haze, not a hard disc. Mirrors RarityJuice/ImpactFx's baked-glow approach so
 *  we never pay a per-frame BlurFilter for the softness. */
function buildMistTexture(): Texture {
  if (MIST_TEX) return MIST_TEX;
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  // Low-alpha, early shoulder → most of the radius is faint haze; the additive blend
  // brightens the hero softly rather than stamping a solid green circle on the grass.
  // Greener core (not pure white) so the additive haze reads as LIGHT-GREEN mist rather
  // than a white cloud. The small hot centre keeps it luminous; the green shoulder tints
  // the bloom.
  grad.addColorStop(0.0, 'rgba(225,255,235,0.5)');
  grad.addColorStop(0.22, 'rgba(170,255,200,0.34)');
  grad.addColorStop(0.55, 'rgba(130,245,175,0.13)');
  grad.addColorStop(1.0, 'rgba(120,240,165,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  MIST_TEX = Texture.from(canvas);
  return MIST_TEX;
}

/** Small rounded-rect path helper (some canvas impls lack ctx.roundRect). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Pre-load the heal textures. Optional — the helper bakes lazily on first construct —
 *  kept async + named the same so CombatScene's preload path is unchanged. The baked
 *  canvas textures are ready synchronously, so the first burst spawns on frame 1. */
export async function preloadHealPlusTexture(): Promise<Texture> {
  buildMistTexture();
  return buildPlusTexture();
}

// ── Multi-hue green palette ─────────────────────────────────────────────────
// Light end of the green band (plus a near-white mint sparkle) so the "+"es POP
// against the green forest battle background. White-source tints accept these directly.
const GREEN_HUES = [0xeaffea, 0xb9ffcf, 0x86efac, 0x6ee7a0, 0x4ade80];
// The mist is tinted a soft light green so the additive haze reads as a healing aura.
const MIST_TINT = 0x9dffc0;

// ── Default tuning ──────────────────────────────────────────────────────────
// MOTION MODEL: a FEW small "+" crosses that HOVER at scattered heights and locations
// around the hero (user: "do less particles and have them hovering around in different
// height and locations") — each is parked at a random spot in an ellipse around the torso
// and drifts gently in place (a soft bob on both axes). NOT a fountain, NOT a tight orbit.
// Long life so the gentle hover lingers and survives frame jitter (the earlier 1-frame-flash
// bug). The soft green mist sits behind as the aura.
const DEFAULT_COUNT = 9;            // FEW crosses (was 18) — scattered, not a swarm
const DEFAULT_LIFETIME_MS = 1500;   // lingering hover — survives frame jitter
const DEFAULT_SCALE_MIN = 0.24;     // small
const DEFAULT_SCALE_MAX = 0.44;
const DEFAULT_SPIN_DEG_S = 70;      // very gentle self-rotation of each "+"
const FADE_TAIL_MS = 650;           // long graceful fade-out
// Scale-in "pop": 0 → overshoot → base over the first POP_MS (caught even at ~100ms frames).
const POP_MS = 240;
const POP_OVERSHOOT = 1.25;

// ── Scatter envelope + hover (local px, relative to the chest anchor) ────────
// Each "+" parks at a random spot inside an ellipse around the torso (varied X and HEIGHT),
// then gently bobs around that home. Radii hug the body so nothing spills out the top of
// the frame (top reach ≈ ENV_CY - ENV_RY - HOVER_AMP_Y).
const ENV_RX = 52;                  // horizontal scatter radius
const ENV_RY = 48;                  // vertical scatter radius (varied heights)
const ENV_CY = 10;                  // envelope centre, nudged onto the torso
const HOVER_AMP_X = 4;              // gentle horizontal bob amplitude (px)
const HOVER_AMP_Y = 7;              // gentle vertical bob amplitude (px)
const HOVER_FREQ_MIN = 1.1;         // rad/s — slow hover
const HOVER_FREQ_MAX = 2.0;

// ── Mist tuning ───────────────────────────────────────────────────────────────
// Same robustness fix as the swarm: a longer life + a gentler bloom so the aura is
// visible across several frames instead of peaking-and-vanishing in one. A quick bloom
// (so it appears promptly on the cast) then a long, soft fade.
const MIST_LIFE_MS = 1500;         // bloom-and-fade lifetime of the aura (lingers)
const MIST_BLOOM_FRAC = 0.14;      // quick bloom-in (≈210ms) so the aura pops on the cast
const MIST_PEAK_ALPHA = 0.6;       // peak additive alpha — soft haze, not a white cloud
const MIST_DIAMETER_PX = 158;      // on-screen diameter at peak — hugs the body, no head-spill
const MIST_START_SCALE = 0.6;      // starts smaller, blooms outward

export interface HealPlusBurstOpts {
  count?: number;
  lifetimeMs?: number;
  scaleMin?: number;
  scaleMax?: number;
  /** Self-rotation rate of each "+" in degrees per second (converted to radians internally). */
  spin?: number;
}

interface Particle {
  sprite: Sprite;
  homeX: number;     // parked position — scattered around the torso (varied X)
  homeY: number;     // parked position — varied HEIGHT
  phaseX: number;    // hover-bob phase, X axis
  phaseY: number;    // hover-bob phase, Y axis
  freqX: number;     // hover-bob frequency (rad/s), X axis
  freqY: number;     // hover-bob frequency (rad/s), Y axis
  spinRad: number;   // gentle self-rotation (rad/s)
  lifeMs: number;    // accumulated lifetime
  /** Absolute lifetime in ms (lifeMs >= deathMs ⇒ expired). */
  deathMs: number;
  /** Cached birth scale so we don't read it from the sprite (slightly faster). */
  baseScale: number;
}

/** Self-contained heal burst at (x, y) in parent's local coords.
 *  Mount: pass `parent` — the burst attaches its own Container as a child.
 *  Drive: call `render(deltaMS)` each frame.
 *  Free: when `alive` is false, call `destroy()` to release GC.
 *
 *  No Ticker.shared handlers — driven by external deltaMS only. The internal
 *  container is auto-marked invisible once the mist AND last particle expire;
 *  calling destroy() tears down the container + sprites. Safe to call destroy()
 *  while alive (cancels in-flight). */
export class HealPlusBurst {
  private readonly layer: Container;
  private readonly mist: Sprite;
  private mistAgeMs = 0;
  private particles: Particle[] = [];
  private _alive = true;
  private destroyed = false;
  private readonly opts: Required<HealPlusBurstOpts>;

  constructor(parent: Container, x: number, y: number, opts: HealPlusBurstOpts = {}) {
    this.opts = {
      count: opts.count ?? DEFAULT_COUNT,
      lifetimeMs: opts.lifetimeMs ?? DEFAULT_LIFETIME_MS,
      scaleMin: opts.scaleMin ?? DEFAULT_SCALE_MIN,
      scaleMax: opts.scaleMax ?? DEFAULT_SCALE_MAX,
      spin: opts.spin ?? DEFAULT_SPIN_DEG_S,
    };
    this.layer = new Container();
    this.layer.eventMode = 'none'; // taps pass through
    this.layer.position.set(x, y);
    parent.addChild(this.layer);

    // ── Healing mist (added FIRST so it sits behind the "+" swarm) ──
    // A soft additive green haze that blooms then fades around the hero's body.
    const mist = new Sprite(buildMistTexture());
    mist.anchor.set(0.5);
    mist.blendMode = 'add';
    mist.tint = MIST_TINT;
    // Centre the aura on the body mass: the container is at the CHEST anchor (spine.y-78),
    // so nudge the aura DOWN onto the torso/legs so it hugs the body silhouette rather
    // than blooming up over the head.
    mist.position.set(0, 30);
    mist.scale.set((MIST_DIAMETER_PX / 256) * MIST_START_SCALE);
    mist.alpha = 0;
    this.layer.addChild(mist);
    this.mist = mist;

    // The textures are baked synchronously from canvas, so always ready on frame 1.
    this.spawnAll(buildPlusTexture());
  }

  /** True until BOTH the mist and the last particle expire (or destroy() is called). */
  get alive(): boolean { return this._alive && !this.destroyed; }

  /** Per-frame pump. Caller passes the delta in milliseconds. */
  render(deltaMS: number): void {
    if (this.destroyed) return;

    // ── Mist: bloom in over the first MIST_BLOOM_FRAC, then fade for the rest, while
    // gently growing from MIST_START_SCALE toward full. ──
    this.mistAgeMs += deltaMS;
    const mt = Math.min(1, this.mistAgeMs / MIST_LIFE_MS);
    const mistAlpha = mt < MIST_BLOOM_FRAC
      ? (mt / MIST_BLOOM_FRAC)
      : 1 - (mt - MIST_BLOOM_FRAC) / (1 - MIST_BLOOM_FRAC);
    this.mist.alpha = Math.max(0, mistAlpha) * MIST_PEAK_ALPHA;
    const mistGrow = MIST_START_SCALE + (1 - MIST_START_SCALE) * easeOut(mt);
    this.mist.scale.set((MIST_DIAMETER_PX / 256) * mistGrow);
    const mistDone = mt >= 1;

    // ── Plus swarm — hover ──
    const dt = deltaMS / 1000;
    let liveCount = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.lifeMs >= p.deathMs) continue; // already expired
      p.lifeMs += deltaMS;
      // HOVER: stay parked at the scattered home and bob gently around it on both axes
      // (different phase/freq per particle so they drift independently). Position is set
      // ABSOLUTELY each frame, so the "+"es never wander off-body or spill out the top.
      const tSec = p.lifeMs / 1000;
      p.sprite.x = p.homeX + Math.sin(tSec * p.freqX + p.phaseX) * HOVER_AMP_X;
      p.sprite.y = p.homeY + Math.sin(tSec * p.freqY + p.phaseY) * HOVER_AMP_Y;
      p.sprite.rotation += p.spinRad * dt;
      // Scale-in "pop": 0 → overshoot → base over the first POP_MS, then hold at base.
      if (p.lifeMs < POP_MS) {
        const k = p.lifeMs / POP_MS;
        const s = k < 0.6
          ? (k / 0.6) * POP_OVERSHOOT
          : POP_OVERSHOOT - ((k - 0.6) / 0.4) * (POP_OVERSHOOT - 1);
        p.sprite.scale.set(p.baseScale * s);
      } else {
        p.sprite.scale.set(p.baseScale);
      }
      // Alpha: full for the first (lifetime - FADE_TAIL_MS), then graceful linear fade.
      const remaining = p.deathMs - p.lifeMs;
      if (remaining >= FADE_TAIL_MS) {
        p.sprite.alpha = 1;
      } else if (remaining > 0) {
        p.sprite.alpha = remaining / FADE_TAIL_MS;
      } else {
        p.sprite.alpha = 0;
        p.sprite.visible = false;
      }
      if (p.lifeMs < p.deathMs) liveCount++;
    }

    if (liveCount === 0 && mistDone) {
      // Auto-cleanup once BOTH the mist and the last particle expire.
      this._alive = false;
      this.layer.visible = false;
    }
  }

  /** Tear down: removes the container from its parent and destroys all sprites.
   *  Safe to call multiple times; safe to call while still alive (cancels). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._alive = false;
    // Destroying the container with children:true tears down every Sprite child
    // (incl. the mist) and their shared Texture handles — PIXI v8 refcounts texture
    // sources so the module-level singletons stay alive for the next burst.
    this.layer.destroy({ children: true });
    this.particles.length = 0;
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private spawnAll(tex: Texture): void {
    if (this.destroyed) return;
    const o = this.opts;
    const spinRad = (o.spin * Math.PI) / 180;
    const count = Math.max(1, Math.floor(o.count));
    for (let i = 0; i < count; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      const hueIdx = Math.floor(Math.random() * GREEN_HUES.length);
      s.tint = GREEN_HUES[hueIdx];
      const baseScale = o.scaleMin + Math.random() * (o.scaleMax - o.scaleMin);
      s.scale.set(0);
      s.rotation = Math.random() * Math.PI * 2;
      s.alpha = 1;
      // NORMAL blend (not additive): over the bright forest grass, additive green "+"es
      // saturate to pale white and read as a vague poof. Normal blend keeps the bright
      // mint tints as CRISP green crosses. The mist layer behind them (additive) supplies
      // the soft glow/aura; the hovering "+"es are the readable icon.
      s.blendMode = 'normal';
      // ── Scatter the parked home inside the ellipse (varied X + HEIGHT) ──
      // Random angle + sqrt(random) radius ⇒ roughly even area fill so the few crosses sit
      // at clearly different spots/heights around the torso rather than on one ring.
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random());
      const homeX = Math.cos(a) * ENV_RX * rr;
      const homeY = ENV_CY + Math.sin(a) * ENV_RY * rr;
      const spinSign = Math.random() < 0.5 ? -1 : 1;
      s.x = homeX;
      s.y = homeY;
      this.layer.addChild(s);
      this.particles.push({
        sprite: s,
        homeX,
        homeY,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        freqX: HOVER_FREQ_MIN + Math.random() * (HOVER_FREQ_MAX - HOVER_FREQ_MIN),
        freqY: HOVER_FREQ_MIN + Math.random() * (HOVER_FREQ_MAX - HOVER_FREQ_MIN),
        spinRad: spinRad * spinSign,
        lifeMs: 0,
        deathMs: o.lifetimeMs * (0.85 + Math.random() * 0.3),
        baseScale,
      });
    }
  }
}

function easeOut(t: number): number { const u = 1 - t; return 1 - u * u; }
