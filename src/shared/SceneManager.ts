import type { Container, Ticker } from 'pixi.js';
import type { Scene } from './Scene';
import { tween } from './tween';
import { easeInOutQuad } from './easing';

/** Optional crossfade for seamlessReplace: fades the outgoing scene out over `ms`
 *  (on `ticker`) to reveal the incoming scene behind it, instead of a hard cut. */
export interface SeamlessFade {
  ticker: Ticker;
  ms: number;
}

interface StackEntry {
  scene: Scene;
  mode: 'replace' | 'overlay';
}

/** Crossfade duration when swapping scenes via seamlessReplace(). */
const CROSSFADE_MS = 300;

export class SceneManager {
  private stack: StackEntry[] = [];
  private stage: Container;
  private ticker?: Ticker;
  private lastLayout: { width: number; height: number; fillX?: number; fillW?: number; fillY?: number; fillH?: number } | null = null;

  constructor(stage: Container, ticker?: Ticker) {
    this.stage = stage;
    this.ticker = ticker;
  }

  async push(scene: Scene, mode: 'replace' | 'overlay'): Promise<void> {
    const prev = this.top;
    if (prev) {
      prev.scene.pause();
      if (mode === 'replace') {
        prev.scene.container.visible = false;
      }
    }

    this.stack.push({ scene, mode });
    this.stage.addChild(scene.container);
    await scene.enter();
    this.applyLayout(scene);
  }

  /** Replace top scene seamlessly: old stays visible during new scene's enter(),
   *  then is removed. Pass `fade` to crossfade the old scene out (alpha 1→0) to
   *  reveal the new scene behind it, instead of a hard cut. */
  async seamlessReplace(scene: Scene, fade?: SeamlessFade): Promise<void> {
    const oldEntry = this.stack[this.stack.length - 1];

    // Add new scene behind the old one so old stays visible during loading
    this.stack.push({ scene, mode: 'replace' });
    if (oldEntry) {
      const oldIdx = this.stage.getChildIndex(oldEntry.scene.container);
      this.stage.addChildAt(scene.container, oldIdx);
    } else {
      this.stage.addChild(scene.container);
    }

    // Enter new scene (loads assets) while old scene is still visible on top
    await scene.enter();
    this.applyLayout(scene);

    // Single crossfade of the old scene out to reveal the new one underneath, then remove it.
    // Use the explicit `fade` if a caller passed one (board-fight's per-transition fade); else
    // fall back to the default this.ticker + CROSSFADE_MS when the manager was built WITH a ticker
    // (the egg directors). With neither, the swap is an instant hard cut (alpha untouched) —
    // back-compat for managers constructed without a ticker (board-fight/clash-royal/etc.).
    if (oldEntry) {
      const f = fade ?? (this.ticker ? { ticker: this.ticker, ms: CROSSFADE_MS } : null);
      if (f) {
        const oldContainer = oldEntry.scene.container;
        const startAlpha = oldContainer.alpha;
        await tween(f.ticker, f.ms, (t) => {
          if (!oldContainer.destroyed) oldContainer.alpha = startAlpha * (1 - t);
        }, 1, easeInOutQuad);
      }
      await oldEntry.scene.exit();
      this.stage.removeChild(oldEntry.scene.container);
      // Remove old entry from stack (it's second-to-last now)
      const idx = this.stack.indexOf(oldEntry);
      if (idx >= 0) this.stack.splice(idx, 1);
    }
  }

  async pop(): Promise<void> {
    const entry = this.stack.pop();
    if (!entry) return;

    await entry.scene.exit();
    this.stage.removeChild(entry.scene.container);

    const prev = this.top;
    if (prev) {
      prev.scene.container.visible = true;
      prev.scene.resume();
    }
  }

  update(deltaMS: number): void {
    for (const entry of this.stack) {
      if (entry.scene.container.visible) {
        entry.scene.update(deltaMS);
      }
    }
  }

  layout(width: number, height: number, fillX?: number, fillW?: number, fillY?: number, fillH?: number): void {
    this.lastLayout = { width, height, fillX, fillW, fillY, fillH };
    for (const entry of this.stack) {
      entry.scene.layout(width, height, fillX, fillW, fillY, fillH);
    }
  }

  /** Re-apply the current layout to one freshly-mounted scene. */
  private applyLayout(scene: Scene): void {
    const l = this.lastLayout;
    if (l) {
      scene.layout(l.width, l.height, l.fillX, l.fillW, l.fillY, l.fillH);
    }
  }

  private get top(): StackEntry | undefined {
    return this.stack[this.stack.length - 1];
  }
}
