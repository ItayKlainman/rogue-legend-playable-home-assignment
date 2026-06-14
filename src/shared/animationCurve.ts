/**
 * Unity AnimationCurve evaluator. Unity uses HERMITE tangents, not cubic Bezier.
 *
 * Each keyframe has `time`, `value`, `inSlope`, `outSlope`. Between two consecutive
 * keys (k0, k1) at distance Δt = k1.time - k0.time, the curve is:
 *
 *   h00*v0 + h10*outSlope0*Δt + h01*v1 + h11*inSlope1*Δt
 *
 * with standard Hermite basis polynomials in normalized u = (t - k0.time) / Δt:
 *
 *   h00 = 2u³ - 3u² + 1
 *   h10 = u³ - 2u² + u
 *   h01 = -2u³ + 3u²
 *   h11 = u³ - u²
 *
 * Used by LuckyWheel `_wheelSpeedCurve` (slopes 3.168 → 0.024).
 */

export interface Keyframe {
  time: number;
  value: number;
  inSlope: number;
  outSlope: number;
}

export class AnimationCurve {
  constructor(private keys: Keyframe[]) {
    if (keys.length === 0) throw new Error('AnimationCurve requires at least one key');
  }

  evaluate(t: number): number {
    const keys = this.keys;
    if (t <= keys[0].time) return keys[0].value;
    if (t >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    // Find the segment [k0, k1] containing t. Linear scan — keyframe arrays are tiny.
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].time < t) i++;
    const k0 = keys[i];
    const k1 = keys[i + 1];

    const dt = k1.time - k0.time;
    if (dt <= 0) return k1.value;
    const u = (t - k0.time) / dt;
    const u2 = u * u;
    const u3 = u2 * u;

    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;

    return h00 * k0.value + h10 * k0.outSlope * dt + h01 * k1.value + h11 * k1.inSlope * dt;
  }
}
