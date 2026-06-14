import { Container, Sprite, Texture, Ticker } from 'pixi.js';

/**
 * Tiny pooled particle emitter — radial emission with lifetime, color/alpha gradient,
 * and per-particle scale. Designed for one-shot bursts (loot toast, sword hit, etc.),
 * not long-running steady-state systems.
 *
 * Bundle cost: ~3 KB. We hand-rolled instead of pulling @pixi/particle-emitter (~30 KB)
 * because the playable needs every kilobyte for AppLovin's 5 MB cap.
 */

export interface BurstOptions {
  texture: Texture;
  count: number;
  /** Center of the burst (in container-local coordinates). */
  origin: { x: number; y: number };
  /** Radius range — particles spawn at random distance in [innerR, outerR]. */
  innerR?: number;
  outerR?: number;
  /** Outward speed range (px/sec). */
  speedMin: number;
  speedMax: number;
  /** Lifetime range (ms). */
  lifetimeMin: number;
  lifetimeMax: number;
  /** Initial particle scale range. */
  scaleMin?: number;
  scaleMax?: number;
  /** Final scale at end of life (linear). Default = scaleStart. */
  scaleEnd?: number;
  /** Starting alpha (default 1). */
  alphaStart?: number;
  /** Final alpha at end of life (default 0). */
  alphaEnd?: number;
  /** Initial tint color (default 0xffffff). */
  tint?: number;
}

interface Particle {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  scaleStart: number;
  scaleEnd: number;
  alphaStart: number;
  alphaEnd: number;
}

export class ParticleEmitter {
  readonly container: Container;
  private particles: Particle[] = [];
  private ticker: Ticker;
  private handler: (t: Ticker) => void;

  constructor(ticker: Ticker) {
    this.container = new Container();
    this.ticker = ticker;
    this.handler = (t) => this.update(t.deltaMS);
    this.ticker.add(this.handler);
  }

  burst(opts: BurstOptions): void {
    const innerR = opts.innerR ?? 0;
    const outerR = opts.outerR ?? 0;
    const sMin = opts.scaleMin ?? 1;
    const sMax = opts.scaleMax ?? 1;
    const sEnd = opts.scaleEnd ?? sMin;
    const aStart = opts.alphaStart ?? 1;
    const aEnd = opts.alphaEnd ?? 0;
    const tint = opts.tint ?? 0xffffff;

    for (let i = 0; i < opts.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = innerR + Math.random() * (outerR - innerR);
      const speed = opts.speedMin + Math.random() * (opts.speedMax - opts.speedMin);
      const life = opts.lifetimeMin + Math.random() * (opts.lifetimeMax - opts.lifetimeMin);
      const sStart = sMin + Math.random() * (sMax - sMin);

      const sprite = new Sprite(opts.texture);
      sprite.anchor.set(0.5);
      sprite.tint = tint;
      sprite.x = opts.origin.x + Math.cos(angle) * r;
      sprite.y = opts.origin.y + Math.sin(angle) * r;
      sprite.scale.set(sStart);
      sprite.alpha = aStart;
      this.container.addChild(sprite);

      this.particles.push({
        sprite,
        age: 0,
        life,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        scaleStart: sStart,
        scaleEnd: sEnd,
        alphaStart: aStart,
        alphaEnd: aEnd,
      });
    }
  }

  private update(deltaMS: number): void {
    if (this.particles.length === 0) return;
    const dtSec = deltaMS / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += deltaMS;
      const t = Math.min(1, p.age / p.life);
      p.sprite.x += p.vx * dtSec;
      p.sprite.y += p.vy * dtSec;
      const s = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
      p.sprite.scale.set(s);
      p.sprite.alpha = p.alphaStart + (p.alphaEnd - p.alphaStart) * t;
      if (t >= 1) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  destroy(): void {
    this.ticker.remove(this.handler);
    for (const p of this.particles) p.sprite.destroy();
    this.particles = [];
    this.container.destroy({ children: true });
  }
}
