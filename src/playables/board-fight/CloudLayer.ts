import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import cloudsPng from 'assets/Backgrounds/Clouds.webp';

/* ── Types ── */

type SpawnEdge = 'top' | 'bottom' | 'left' | 'right';

interface SpawnArea {
  edge: SpawnEdge;
  /** Fractional range along the edge [min, max], 0 = start, 1 = end. */
  range?: [number, number];
  /** Drift angle override in degrees. */
  angleDeg?: number;
}

interface CloudParticle {
  sprite: Sprite;
  vx: number;
  vy: number;
}

interface AreaState {
  area: SpawnArea;
  timer: number;
}

/* ── Config (edit here) ── */

const CONFIG = {
  angleDeg: -45,
  speedRange: [30, 70] as [number, number],
  scaleRange: [1, 2] as [number, number],
  alphaRange: [1, 1] as [number, number],
  spawnInterval: 10,
  spawnBatch: [1, 3] as [number, number],
  prewarmCount: 2,
  spawnAreas: [
    { edge: 'bottom', range: [0.4, 0.6] },
    { edge: 'left', range: [0.35, 0.5] },
  ] as SpawnArea[],
};

/* ── CloudLayer ── */

export class CloudLayer {
  readonly container: Container;
  private clouds: CloudParticle[] = [];
  private textures: Texture[] = [];
  private areaStates: AreaState[] = [];
  private width = 0;
  private height = 0;

  private constructor() {
    this.container = new Container();
    this.container.interactiveChildren = false;
  }

  static async create(width: number, height: number): Promise<CloudLayer> {
    const layer = new CloudLayer();
    await layer.loadTextures();
    layer.layout(width, height);
    return layer;
  }

  private async loadTextures(): Promise<void> {
    const texture = await Assets.load(cloudsPng);
    const frameW = texture.width / 3;
    const frameH = texture.height;
    for (let i = 0; i < 3; i++) {
      this.textures.push(new Texture({
        source: texture.source,
        frame: new Rectangle(i * frameW, 0, frameW, frameH),
      }));
    }
  }

  private resolveRange(area: SpawnArea): [number, number] {
    const [rMin, rMax] = area.range ?? [0, 1];
    const isHorizontal = area.edge === 'top' || area.edge === 'bottom';
    const length = isHorizontal ? this.width : this.height;
    return [rMin * length, rMax * length];
  }

  private placeOnEdge(
    sprite: Sprite,
    area: SpawnArea,
    pos: number,
    prewarm: boolean,
  ): { angleRad: number } {
    const halfW = sprite.texture.width * sprite.scale.x * 0.5;
    const halfH = sprite.texture.height * sprite.scale.y * 0.5;
    const angleRad = ((area.angleDeg ?? CONFIG.angleDeg) * Math.PI) / 180;

    switch (area.edge) {
      case 'left':   sprite.x = -halfW;              sprite.y = pos; break;
      case 'right':  sprite.x = this.width + halfW;   sprite.y = pos; break;
      case 'top':    sprite.x = pos;                  sprite.y = -halfH; break;
      case 'bottom': sprite.x = pos;                  sprite.y = this.height + halfH; break;
    }

    if (prewarm) {
      const travel = Math.random() * Math.max(this.width, this.height);
      sprite.x += Math.cos(angleRad) * travel;
      sprite.y += Math.sin(angleRad) * travel;
    }

    return { angleRad };
  }

  private spawnForArea(area: SpawnArea, prewarm: boolean): void {
    const [bMin, bMax] = CONFIG.spawnBatch;
    const count = bMin + Math.floor(Math.random() * (bMax - bMin + 1));
    const [pxMin, pxMax] = this.resolveRange(area);

    for (let i = 0; i < count; i++) {
      const tex = this.textures[Math.floor(Math.random() * this.textures.length)];
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.5);

      const scale = this.randRange(CONFIG.scaleRange);
      sprite.scale.set(scale);
      sprite.alpha = this.randRange(CONFIG.alphaRange);

      const pos = pxMin + Math.random() * (pxMax - pxMin);
      const { angleRad } = this.placeOnEdge(sprite, area, pos, prewarm);

      const speed = this.randRange(CONFIG.speedRange);
      const vx = Math.cos(angleRad) * speed;
      const vy = Math.sin(angleRad) * speed;

      this.container.addChild(sprite);
      this.clouds.push({ sprite, vx, vy });
    }
  }

  update(deltaMS: number): void {
    const dt = deltaMS / 1000;

    for (const state of this.areaStates) {
      state.timer -= dt;
      if (state.timer <= 0) {
        this.spawnForArea(state.area, false);
        state.timer = CONFIG.spawnInterval;
      }
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      cloud.sprite.x += cloud.vx * dt;
      cloud.sprite.y += cloud.vy * dt;

      const halfW = cloud.sprite.texture.width * cloud.sprite.scale.x * 0.5;
      const halfH = cloud.sprite.texture.height * cloud.sprite.scale.y * 0.5;
      const offRight  = cloud.vx > 0 && cloud.sprite.x > this.width + halfW;
      const offLeft   = cloud.vx < 0 && cloud.sprite.x < -halfW;
      const offBottom = cloud.vy > 0 && cloud.sprite.y > this.height + halfH;
      const offTop    = cloud.vy < 0 && cloud.sprite.y < -halfH;
      if (offRight || offLeft || offBottom || offTop) {
        cloud.sprite.destroy();
        this.clouds.splice(i, 1);
      }
    }
  }

  layout(width: number, height: number): void {
    const firstLayout = this.width === 0 && this.height === 0;
    this.width = width;
    this.height = height;

    if (firstLayout && this.textures.length > 0) {
      this.areaStates = CONFIG.spawnAreas.map(area => ({
        area,
        timer: CONFIG.spawnInterval,
      }));

      for (const area of CONFIG.spawnAreas) {
        for (let i = 0; i < CONFIG.prewarmCount; i++) {
          this.spawnForArea(area, true);
        }
      }
    }
  }

  destroy(): void {
    for (const cloud of this.clouds) {
      cloud.sprite.destroy();
    }
    this.clouds = [];
    this.areaStates = [];
    this.container.destroy({ children: true });
  }

  drawDebug(): void {
    if (this.debugGfx) {
      this.debugGfx.destroy();
    }
    const g = new Graphics();
    this.debugGfx = g;
    this.container.addChild(g);

    const COLORS = [0xff3333, 0x33ff33, 0x3399ff, 0xffcc00];
    const THICKNESS = 20;
    const INSET = THICKNESS / 2;

    for (let i = 0; i < CONFIG.spawnAreas.length; i++) {
      const area = CONFIG.spawnAreas[i];
      const [pxMin, pxMax] = this.resolveRange(area);
      const color = COLORS[i % COLORS.length];

      let x0: number, y0: number, x1: number, y1: number;
      switch (area.edge) {
        case 'left':
          x0 = INSET; y0 = pxMin;
          x1 = INSET; y1 = pxMax;
          break;
        case 'right':
          x0 = this.width - INSET; y0 = pxMin;
          x1 = this.width - INSET; y1 = pxMax;
          break;
        case 'top':
          x0 = pxMin; y0 = INSET;
          x1 = pxMax; y1 = INSET;
          break;
        case 'bottom':
          x0 = pxMin; y0 = this.height - INSET;
          x1 = pxMax; y1 = this.height - INSET;
          break;
      }

      g.moveTo(x0!, y0!).lineTo(x1!, y1!).stroke({ width: THICKNESS, color, alpha: 0.8 });
    }
  }

  private debugGfx: Graphics | null = null;

  private randRange([min, max]: [number, number]): number {
    return min + Math.random() * (max - min);
  }
}
