import { Container, Graphics } from 'pixi.js';

interface Mote {
  g: Graphics;
  speed: number;   // upward px/s
  sway: number;    // horizontal sway amplitude (px)
  phase: number;   // sway phase offset
  baseX: number;   // sway centre
}

// Drifting ambient motes (dust / embers / spores) that rise slowly across the backdrop at
// parallax depths, so a static background feels alive. Procedural — no art, cheap.
const COLORS = [0x6fe0d6, 0x8fe8ff, 0xaef0e0];

export class AmbientParticles {
  readonly container = new Container();
  private motes: Mote[] = [];
  private w: number;
  private h: number;
  private t = 0;

  constructor(width: number, height: number, count = 26) {
    this.w = width;
    this.h = height;
    this.container.eventMode = 'none';

    for (let i = 0; i < count; i++) {
      const depth = Math.random(); // 0 = far/small/faint, 1 = near/big/bright
      const r = 1.5 + depth * 4;
      const g = new Graphics();
      g.circle(0, 0, r).fill({ color: COLORS[i % COLORS.length], alpha: 0.1 + depth * 0.32 });
      g.blendMode = 'add';
      const baseX = Math.random() * this.w;
      g.position.set(baseX, Math.random() * this.h);
      this.container.addChild(g);
      this.motes.push({
        g,
        speed: 6 + depth * 22,
        sway: 6 + depth * 16,
        phase: Math.random() * Math.PI * 2,
        baseX,
      });
    }
  }

  update(deltaMS: number): void {
    const dt = deltaMS / 1000;
    this.t += deltaMS;

    for (const m of this.motes) {
      m.g.y -= m.speed * dt;
      m.g.x = m.baseX + Math.sin(this.t * 0.0006 + m.phase) * m.sway;

      if (m.g.y < -10) {
        m.g.y = this.h + 10;
        m.baseX = Math.random() * this.w;
      }
    }
  }

  layout(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }
}
