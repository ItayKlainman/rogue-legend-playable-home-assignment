import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js';

interface RotKF { t: number; x: number; y: number; z: number; w: number; }
interface PosKF { t: number; x: number; y: number; z: number; }

export interface DieTrack {
  rotation: RotKF[];
  position: PosKF[];
  faceEulers: [number, number, number][]; // 6 entries, one Euler (degrees) per target value 1..6
}

type Quat = { x: number; y: number; z: number; w: number };
type Vec3 = { x: number; y: number; z: number };

// Light direction in the die's body space (Unity-style: +X right, +Y up, +Z into scene / away from camera).
// A face whose normal most aligns with LIGHT is brightest.
// Runtime-tweakable via setDieLight(x, y, z) or window.setDieLight(x, y, z).
const LIGHT: Vec3 = { x: 0, y: 0, z: 0 };
let ambient = 0.85;
let range = 0.15;
setDieLight(-0.4, 0.6, -0.7);

export function setDieLight(x: number, y: number, z: number, opts?: { ambient?: number; range?: number }): void {
  const n = Math.hypot(x, y, z) || 1;
  LIGHT.x = x / n; LIGHT.y = y / n; LIGHT.z = z / n;
  if (opts?.ambient !== undefined) ambient = opts.ambient;
  if (opts?.range !== undefined) range = opts.range;
  // eslint-disable-next-line no-console
  console.log(`[Die3D] light set to (${x}, ${y}, ${z}) normalized (${LIGHT.x.toFixed(3)}, ${LIGHT.y.toFixed(3)}, ${LIGHT.z.toFixed(3)}), ambient=${ambient}, range=${range}`);
}

if (typeof window !== 'undefined') {
  // @ts-expect-error expose for live tweaking
  window.setDieLight = setDieLight;
}

export class Die3D {
  readonly outer: Container;
  private readonly inner: Container;
  private readonly faceMeshes: Mesh[] = [];
  private readonly facePositions: Float32Array[] = [];
  private readonly faceCorners: Vec3[][] = [];
  private readonly faceNormalsBody: Vec3[] = [];
  private readonly halfSize: number;

  private track: DieTrack | null = null;
  private elapsed = 0;
  private duration = 1;
  private animationLength = 1;
  private playbackRate = 1;
  private visibleEndT = 1;
  private posScale = 1;
  private faceOffset: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private settled = true;
  private onSettleCb: (() => void) | null = null;

  constructor(halfSize: number) {
    this.halfSize = halfSize;
    this.outer = new Container();
    this.inner = new Container();
    this.inner.sortableChildren = true;
    this.outer.addChild(this.inner);
    this.buildFaces();
  }

  private buildFaces(): void {
    const s = this.halfSize;
    // Face vertex order: CCW viewed from outside. UV maps (0,0) top-left, (1,1) bottom-right.
    // Value→face mapping matches Unity DiceD6 mesh: +Y=1, -X=2, +Z=3, -Z=4, +X=5, -Y=6.
    // (Derived from Dice_Roll_{1,2,3}.anim Die1Rotations/Die2Rotations across all clips.)
    const faces: { corners: [Vec3, Vec3, Vec3, Vec3]; normal: Vec3 }[] = [
      { // +Y (value 1), viewed from above: +Z up, +X right
        corners: [{ x: -s, y:  s, z: -s }, { x:  s, y:  s, z: -s }, { x:  s, y:  s, z:  s }, { x: -s, y:  s, z:  s }],
        normal:  { x: 0, y: 1, z: 0 },
      },
      { // -X (value 2), viewed from -X: +Y up, -Z right
        corners: [{ x: -s, y:  s, z:  s }, { x: -s, y:  s, z: -s }, { x: -s, y: -s, z: -s }, { x: -s, y: -s, z:  s }],
        normal:  { x: -1, y: 0, z: 0 },
      },
      { // +Z (value 3), viewed from +Z: +Y up, +X right
        corners: [{ x: -s, y:  s, z:  s }, { x:  s, y:  s, z:  s }, { x:  s, y: -s, z:  s }, { x: -s, y: -s, z:  s }],
        normal:  { x: 0, y: 0, z: 1 },
      },
      { // -Z (value 4), viewed from -Z: +Y up, -X right
        corners: [{ x:  s, y:  s, z: -s }, { x: -s, y:  s, z: -s }, { x: -s, y: -s, z: -s }, { x:  s, y: -s, z: -s }],
        normal:  { x: 0, y: 0, z: -1 },
      },
      { // +X (value 5), viewed from +X: +Y up, +Z right
        corners: [{ x:  s, y:  s, z: -s }, { x:  s, y:  s, z:  s }, { x:  s, y: -s, z:  s }, { x:  s, y: -s, z: -s }],
        normal:  { x: 1, y: 0, z: 0 },
      },
      { // -Y (value 6), viewed from below: +Z up, -X right
        corners: [{ x:  s, y: -s, z: -s }, { x: -s, y: -s, z: -s }, { x: -s, y: -s, z:  s }, { x:  s, y: -s, z:  s }],
        normal:  { x: 0, y: -1, z: 0 },
      },
    ];

    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);

    for (const face of faces) {
      const positions = new Float32Array(8);
      const geom = new MeshGeometry({
        positions,
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
      });
      const mesh = new Mesh({ geometry: geom, texture: Texture.EMPTY });
      this.inner.addChild(mesh);
      this.faceMeshes.push(mesh);
      this.facePositions.push(positions);
      this.faceCorners.push(face.corners);
      this.faceNormalsBody.push(face.normal);
    }
  }

  setFaceTextures(textures: Texture[]): void {
    for (let i = 0; i < 6; i++) this.faceMeshes[i].texture = textures[i];
  }

  loadClip(
    track: DieTrack,
    duration: number,
    animationLength: number,
    targetValue: number,
    posScale: number,
    playbackRate: number,
  ): void {
    this.track = track;
    this.duration = duration;
    this.animationLength = animationLength;
    this.playbackRate = playbackRate;
    this.visibleEndT = Math.min(duration * playbackRate, animationLength);
    this.elapsed = 0;
    this.settled = false;
    this.posScale = posScale;

    // Unity: `_die1.localRotation = Quaternion.Euler(faceEulers[V-1])` is set on the
    // grandchild; animation drives the parent. Grandchild world rotation =
    // animQ × grandchildLocal. We compose faceOffset on the right of animQ below.
    const e = track.faceEulers[targetValue - 1];
    this.faceOffset = quatFromEulerDegrees(e[0], e[1], e[2]);
  }

  setOnSettle(cb: (() => void) | null): void {
    this.onSettleCb = cb;
  }

  setWorldPos(x: number, y: number): void {
    this.outer.x = x;
    this.outer.y = y;
  }

  update(deltaMS: number): void {
    if (!this.track || this.settled) return;

    this.elapsed += deltaMS / 1000;
    const animT = Math.min(this.elapsed * this.playbackRate, this.animationLength);

    const animQ = sampleRotation(this.track.rotation, animT);
    const animP = samplePosition(this.track.position, animT);
    // Compose: grandchild.worldRotation = parent.animatedQ × grandchild.localQ.
    const q = quatMul(animQ, this.faceOffset);

    // Unity (Y-up) → screen (Y-down). Position is absolute in the parent's local
    // space; animation already encodes "die1 to the right, die2 to the left" etc.
    this.inner.x = animP.x * this.posScale;
    this.inner.y = -animP.y * this.posScale;

    for (let i = 0; i < 6; i++) {
      const mesh = this.faceMeshes[i];
      const corners = this.faceCorners[i];
      const positions = this.facePositions[i];
      let avgZ = 0;
      for (let j = 0; j < 4; j++) {
        const r = quatRotateVec(q, corners[j]);
        positions[j * 2] = r.x;
        positions[j * 2 + 1] = -r.y; // Y-flip for screen space
        avgZ += r.z;
      }
      avgZ /= 4;
      mesh.geometry.getBuffer('aPosition').update();
      // Unity +Z is forward (into scene). Our camera looks at -Unity_Z.
      // A face with higher unity.z is FARTHER from camera → draw first (lower zIndex).
      mesh.zIndex = (-avgZ * 1000) | 0;

      const n = quatRotateVec(q, this.faceNormalsBody[i]);
      // Direct Unity-space dot: LIGHT is defined in Unity body space (+Y up, +Z into scene).
      const dot = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
      const shade = Math.round((ambient + range * dot) * 255);
      mesh.tint = (shade << 16) | (shade << 8) | shade;
    }

    if (this.elapsed >= this.duration) {
      this.settled = true;
      const cb = this.onSettleCb;
      this.onSettleCb = null;
      if (cb) cb();
    }
  }

  isSettled(): boolean {
    return this.settled;
  }

  destroy(): void {
    this.outer.destroy({ children: true });
    this.faceMeshes.length = 0;
    this.facePositions.length = 0;
  }
}

// --- quaternion math ---

function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatFromEulerDegrees(x: number, y: number, z: number): Quat {
  // Unity Quaternion.Euler uses ZXY intrinsic order: q = qz × qx × qy
  const rx = (x * Math.PI) / 180;
  const ry = (y * Math.PI) / 180;
  const rz = (z * Math.PI) / 180;
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  const qy: Quat = { x: 0, y: sy, z: 0, w: cy };
  const qx: Quat = { x: sx, y: 0, z: 0, w: cx };
  const qz: Quat = { x: 0, y: 0, z: sz, w: cz };
  return quatNormalize(quatMul(qz, quatMul(qx, qy)));
}

function quatRotateVec(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2 * q_vec × (q_vec × v + q_w * v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

function sampleRotation(kfs: RotKF[], t: number): Quat {
  if (t <= kfs[0].t) return { x: kfs[0].x, y: kfs[0].y, z: kfs[0].z, w: kfs[0].w };
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y, z: last.z, w: last.w };
  let lo = 0;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (kfs[i].t <= t && t < kfs[i + 1].t) { lo = i; break; }
  }
  const a = kfs[lo], b = kfs[lo + 1];
  const u = (t - a.t) / (b.t - a.t);
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = dot < 0 ? -1 : 1;
  return quatNormalize({
    x: a.x + (b.x * sign - a.x) * u,
    y: a.y + (b.y * sign - a.y) * u,
    z: a.z + (b.z * sign - a.z) * u,
    w: a.w + (b.w * sign - a.w) * u,
  });
}

function samplePosition(kfs: PosKF[], t: number): Vec3 {
  if (t <= kfs[0].t) return { x: kfs[0].x, y: kfs[0].y, z: kfs[0].z };
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y, z: last.z };
  let lo = 0;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (kfs[i].t <= t && t < kfs[i + 1].t) { lo = i; break; }
  }
  const a = kfs[lo], b = kfs[lo + 1];
  const u = (t - a.t) / (b.t - a.t);
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}
