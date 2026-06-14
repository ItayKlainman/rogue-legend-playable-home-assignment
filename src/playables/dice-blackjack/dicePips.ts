import { Graphics, Renderer, Texture } from 'pixi.js';

export const DOT_PATTERNS: { x: number; y: number }[][] = [
  [],
  [{ x: 0, y: 0 }],
  [{ x: 1, y: -1 }, { x: -1, y: 1 }],
  [{ x: 1, y: -1 }, { x: 0, y: 0 }, { x: -1, y: 1 }],
  [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }],
  [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 0, y: 0 }, { x: -1, y: 1 }, { x: 1, y: 1 }],
  [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 1 }, { x: 1, y: 1 }],
];

const FACE_PX = 128;
const CORNER_R = 14;
const DOT_R = 12;
const DOT_SPREAD = 30;
const FACE_COLOR = 0xffffff;
const PIP_COLOR = 0x000000;
const EDGE_COLOR = 0x000000;
const EDGE_W = 3;

function drawFace(g: Graphics, value: number): void {
  g.roundRect(0, 0, FACE_PX, FACE_PX, CORNER_R)
    .fill({ color: FACE_COLOR })
    .stroke({ color: EDGE_COLOR, width: EDGE_W });

  const cx = FACE_PX / 2;
  const cy = FACE_PX / 2;
  for (const dot of DOT_PATTERNS[value]) {
    g.circle(cx + dot.x * DOT_SPREAD, cy + dot.y * DOT_SPREAD, DOT_R).fill({ color: PIP_COLOR });
  }
}

let cached: Texture[] | null = null;

export function bakeFaceTextures(renderer: Renderer): Texture[] {
  if (cached) return cached;
  const out: Texture[] = [];
  for (let v = 1; v <= 6; v++) {
    const g = new Graphics();
    drawFace(g, v);
    const tex = renderer.generateTexture({
      target: g,
      resolution: renderer.resolution,
      antialias: true,
    });
    g.destroy();
    out.push(tex);
  }
  cached = out;
  return out;
}
