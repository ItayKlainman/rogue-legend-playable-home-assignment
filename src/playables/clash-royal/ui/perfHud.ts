// perfHud.ts — on-screen diagnostic overlay for REAL-DEVICE perf testing.
//
// Activated only by the `?perf=1` URL param, so it is completely inert in the
// shipped ad (no param) yet present in the build we serve for testing. It shows
// live FPS + renderer backend + the resolution PIXI actually chose + which A/B
// toggles are active — so we can read the truth off a real iPhone instead of
// guessing on a desktop simulator (Chromium/WebKit on a Mac run the Mac GPU and
// cannot reproduce iPhone fill-rate lag).
//
// FPS is measured from raw performance.now() inter-frame deltas (NOT ticker.deltaMS,
// which PIXI clamps to minFPS and would hide true stalls).
import type { Application, Ticker } from 'pixi.js';

export interface PerfHudInfo {
  /** Human label for the DPR state, e.g. "CAPPED 1.5" or "FULL 3". */
  dprLabel: string;
  antialias: boolean;
  /** Space-joined list of active ?-overrides, or '' for none. */
  overrides: string;
}

export class PerfHud {
  private el: HTMLDivElement;
  private fpsEl: HTMLSpanElement;
  private frames: number[] = [];
  private lastFrame = performance.now();
  private lastUpdate = 0;
  private ticker: Ticker;
  private readonly tickHandler: () => void;

  constructor(app: Application, ticker: Ticker, info: PerfHudInfo) {
    this.ticker = ticker;
    const renderer = app.renderer as unknown as { gl?: unknown; resolution?: number };
    const backend = renderer.gl ? 'WebGL' : 'WebGPU/other';
    const res = renderer.resolution ?? '?';
    const dpr = window.devicePixelRatio || 1;
    const screen = `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}`;

    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'top:4px', 'left:4px', 'z-index:99999',
      'font:12px/1.4 ui-monospace,Menlo,monospace', 'color:#9fe',
      'background:rgba(0,0,0,0.74)', 'padding:6px 9px', 'border-radius:7px',
      'pointer-events:none', 'white-space:pre', 'letter-spacing:0.2px',
    ].join(';');

    const fps = document.createElement('div');
    fps.style.cssText = 'color:#7CFC00;font-weight:700;font-size:19px;line-height:1.1;margin-bottom:3px';
    fps.textContent = '-- fps';
    this.fpsEl = fps;

    const meta = document.createElement('div');
    meta.textContent =
      `renderer : ${backend}\n` +
      `pixi res : ${res}x  (device dpr ${dpr})\n` +
      `viewport : ${screen}\n` +
      `dpr      : ${info.dprLabel}\n` +
      `aa       : ${info.antialias ? 'on' : 'OFF'}\n` +
      `override : ${info.overrides || 'none'}`;

    el.appendChild(fps);
    el.appendChild(meta);
    document.body.appendChild(el);
    this.el = el;

    this.tickHandler = () => {
      const now = performance.now();
      this.frames.push(now - this.lastFrame);
      this.lastFrame = now;
      if (this.frames.length > 150) this.frames.shift();
      if (now - this.lastUpdate < 400) return;
      this.lastUpdate = now;
      const sorted = [...this.frames].sort((a, b) => a - b);
      const avg = sorted.reduce((s, x) => s + x, 0) / sorted.length;
      const worst = sorted[sorted.length - 1] || 0;
      const fpsVal = avg > 0 ? 1000 / avg : 0;
      this.fpsEl.textContent = `${fpsVal.toFixed(0)} fps  ·  ${avg.toFixed(0)}ms avg  ·  worst ${worst.toFixed(0)}ms`;
      this.fpsEl.style.color = fpsVal >= 50 ? '#7CFC00' : fpsVal >= 30 ? '#ffd84d' : '#ff5a5a';
    };
    ticker.add(this.tickHandler);
  }

  destroy(): void {
    this.ticker.remove(this.tickHandler);
    this.el.remove();
  }
}
