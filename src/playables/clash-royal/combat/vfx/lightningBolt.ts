import { Container, Graphics } from 'pixi.js';

// ── Lightning bolt arc ───────────────────────────────────────────────────────
//
// A jagged electric arc drawn from a source point to a target point (hero→enemy),
// with random branch forks, an additive blue/white glow, and a short flicker→fade
// lifetime. This is the lightning family's missing VISUAL SIGNATURE: before it, a
// chain-lightning cast emitted only a white/pale impactBurst that was visually
// indistinguishable from fire ("the lightning skill doesn't trigger lightning").
//
// Mounting & lifetime mirror HealPlusBurst (no Ticker.shared handler):
//   const bolt = new LightningBolt(parent, sx, sy, tx, ty, { intensity });
//   // every frame: bolt.render(deltaMS); if (!bolt.alive) bolt.destroy();
// Pure Graphics — no textures (so it never trips check:textures and needs no preload).
// The geometry is baked once at construction (a fresh random zig-zag); render() only
// re-flickers alpha + does a couple of mid-life "re-strikes" (a new jagged path) so the
// bolt reads as live electricity rather than a static line.

const LIFETIME_MS = 420;          // total on-screen time — a crackling strike (matches the spark burst)
const SEGMENTS = 11;              // main-bolt zig-zag segments
const JITTER = 30;                // px perpendicular deviation of the zig-zag
const CORE_COLOR = 0xffffff;      // hot white core (thin)
const GLOW_COLOR = 0x1f9bff;      // SATURATED electric blue — the dominant lightning read
const MID_COLOR = 0x8fd4ff;       // a mid pale-blue layer between glow and core for depth
const RESTRIKE_AT = [0.22, 0.44, 0.66]; // fractions of life where the bolt re-jags (flicker)

export interface LightningBoltOpts {
  /** Scales thickness + branch count. 1 = tier-1; ~1.6 = tier-3 storm bolt. */
  intensity?: number;
}

/** A self-contained electric arc from (sx,sy) to (tx,ty) in parent-local coords. */
export class LightningBolt {
  private readonly layer: Container;
  private readonly core: Graphics;
  private readonly glow: Graphics;
  private _alive = true;
  private destroyed = false;
  private ageMs = 0;
  private restrikeIdx = 0;
  private readonly sx: number;
  private readonly sy: number;
  private readonly tx: number;
  private readonly ty: number;
  private readonly intensity: number;

  constructor(parent: Container, sx: number, sy: number, tx: number, ty: number, opts: LightningBoltOpts = {}) {
    this.sx = sx; this.sy = sy; this.tx = tx; this.ty = ty;
    this.intensity = opts.intensity ?? 1;
    this.layer = new Container();
    this.layer.eventMode = 'none';
    // Glow drawn first (under the core) — both additive so they pop on the bright bg.
    this.glow = new Graphics();
    this.glow.blendMode = 'add';
    this.core = new Graphics();
    this.core.blendMode = 'add';
    this.layer.addChild(this.glow);
    this.layer.addChild(this.core);
    parent.addChild(this.layer);
    this.strike();
  }

  get alive(): boolean { return this._alive && !this.destroyed; }

  /** Per-frame pump. Flickers alpha + re-jags the bolt a couple of times mid-life. */
  render(deltaMS: number): void {
    if (this.destroyed) return;
    this.ageMs += deltaMS;
    const t = this.ageMs / LIFETIME_MS;
    if (t >= 1) {
      this._alive = false;
      this.layer.visible = false;
      return;
    }
    // Re-strike (new random jag) at the scheduled flicker points so it reads as live.
    while (this.restrikeIdx < RESTRIKE_AT.length && t >= RESTRIKE_AT[this.restrikeIdx]) {
      this.restrikeIdx++;
      this.strike();
    }
    // Alpha: bright for the first 40%, then ease out. A little high-frequency flicker
    // on top so the arc shimmers.
    const base = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
    const flicker = 0.82 + 0.18 * Math.abs(Math.sin(this.ageMs * 0.06));
    const a = Math.max(0, base * flicker);
    this.core.alpha = a;
    this.glow.alpha = a * 0.8;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._alive = false;
    this.layer.destroy({ children: true });
  }

  // ── internal ───────────────────────────────────────────────────────────────

  /** Draw a fresh jagged main bolt + forks. Three stacked layers (wide saturated-blue
   *  glow → mid pale-blue → thin white core) so the BLUE fringe reads outside the white
   *  spark burst the handler also fires — the bolt was previously washed out to a generic
   *  white poof. The glow is drawn on `glow` (under) and the mid+core on `core` (over). */
  private strike(): void {
    if (this.destroyed) return;
    const pts = this.jaggedPath(this.sx, this.sy, this.tx, this.ty, SEGMENTS, JITTER);
    const coreW = 3 * this.intensity;      // thin hot-white spine
    const midW = 8 * this.intensity;       // pale-blue body
    const glowW = 18 * this.intensity;     // wide saturated-blue halo — the dominant blue read

    this.core.clear();
    this.glow.clear();
    // Wide saturated-blue halo (under): strong alpha so blue clearly fringes the white.
    this.drawPolyline(this.glow, pts, glowW, GLOW_COLOR, 0.7);
    this.drawPolyline(this.glow, pts, glowW * 0.6, GLOW_COLOR, 0.85);
    // Mid pale-blue body + thin white core (over).
    this.drawPolyline(this.core, pts, midW, MID_COLOR, 0.95);
    this.drawPolyline(this.core, pts, coreW, CORE_COLOR, 1);

    // Forks: branch off mid-bolt vertices toward random nearby points so the strike looks
    // branched, not a single clean line. More forks at higher intensity (storm = busier).
    const forkCount = Math.round(3 * this.intensity);
    for (let f = 0; f < forkCount; f++) {
      const vi = 2 + Math.floor(Math.random() * (pts.length - 3));
      const from = pts[vi];
      const ang = Math.random() * Math.PI * 2;
      const len = 22 + Math.random() * 40;
      const fx = from.x + Math.cos(ang) * len;
      const fy = from.y + Math.sin(ang) * len;
      const fork = this.jaggedPath(from.x, from.y, fx, fy, 4, JITTER * 0.6);
      this.drawPolyline(this.glow, fork, glowW * 0.5, GLOW_COLOR, 0.55);
      this.drawPolyline(this.core, fork, midW * 0.5, MID_COLOR, 0.8);
      this.drawPolyline(this.core, fork, coreW * 0.55, CORE_COLOR, 0.9);
    }
  }

  /** A list of points zig-zagging from (sx,sy) to (tx,ty) with perpendicular jitter. */
  private jaggedPath(sx: number, sy: number, tx: number, ty: number, segments: number, jitter: number): { x: number; y: number }[] {
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    // Unit perpendicular to the bolt direction.
    const px = -dy / len;
    const py = dx / len;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= segments; i++) {
      const f = i / segments;
      // Endpoints are exact; interior vertices deviate perpendicular by random jitter
      // (tapered to 0 at both ends so the arc still connects hero→target cleanly).
      const taper = Math.sin(f * Math.PI); // 0 at ends, 1 in the middle
      const off = (Math.random() - 0.5) * 2 * jitter * taper;
      pts.push({ x: sx + dx * f + px * off, y: sy + dy * f + py * off });
    }
    return pts;
  }

  private drawPolyline(g: Graphics, pts: { x: number; y: number }[], width: number, color: number, alpha: number): void {
    if (pts.length < 2) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }
}
