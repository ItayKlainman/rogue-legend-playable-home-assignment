// BoardStatsBar — thin layout coordinator over per-HUD modules.
//
// Each HUD (XP / ATK / Coin) is its own class (under hud/) that owns its
// asset import. BoardStatsBar takes the HUD constructor classes via
// `sceneClasses` (codegen-injected) and instantiates only those the variant
// actually needs — so HUDs the variant doesn't use, and their bundled
// asset imports, drop out via webpack tree-shaking.
//
// Public API forwards to whichever HUDs were constructed; calls to a missing
// HUD throw a clear error (means codegen failed to detect the feature).
import { Container, Texture } from 'pixi.js';
import type { PlayableSceneClasses } from './PlayableDirector';
import type { XpHud } from './hud/XpHud';
import type { AtkHud } from './hud/AtkHud';
import type { CoinHud } from './hud/CoinHud';

export interface BoardStatsConfig {
  showXp?: boolean;
  atkDisplay?: 'bar' | 'overhead';
  /** When true (xp-fly mode), render ATK before XP so the XP bar is the
   *  rightmost element and can expand toward the logo without overlapping
   *  the ATK pill. */
  xpFlyMode?: boolean;
  showCoins?: boolean;
}

export class BoardStatsBar {
  readonly container: Container;
  private config: BoardStatsConfig;
  private sceneClasses: PlayableSceneClasses;
  private ready = false;

  // Each HUD is instantiated only when its feature flag is set AND codegen
  // has provided its class. Missing class with feature flag set throws in
  // init() — that's a codegen detection bug, not a runtime config issue.
  private xpHud?: XpHud;
  private atkHud?: AtkHud;
  private coinHud?: CoinHud;

  constructor(config: BoardStatsConfig, sceneClasses: PlayableSceneClasses) {
    this.config = config;
    this.sceneClasses = sceneClasses;
    this.container = new Container();
  }

  async init(): Promise<void> {
    const GAP = 10;

    if (this.config.showXp) {
      const Cls = this.requireHud('XpHud', 'showXp');
      this.xpHud = new Cls();
      await this.xpHud.init();
    }
    if (this.config.atkDisplay === 'bar') {
      const Cls = this.requireHud('AtkHud', 'atkDisplay=bar');
      this.atkHud = new Cls();
      await this.atkHud.init();
    }
    if (this.config.showCoins) {
      const Cls = this.requireHud('CoinHud', 'showCoins');
      this.coinHud = new Cls();
      await this.coinHud.init();
    }

    // Layout left-to-right. xpFlyMode swaps XP/ATK so XP sits on the right
    // and can expand toward the top-right logo without crossing the ATK pill.
    const ordered = this.config.xpFlyMode
      ? [this.atkHud, this.xpHud, this.coinHud]
      : [this.xpHud, this.atkHud, this.coinHud];

    let xOffset = 0;
    for (const hud of ordered) {
      if (!hud) continue;
      hud.container.x = xOffset;
      this.container.addChild(hud.container);
      xOffset += hud.width + GAP;
    }

    this.ready = true;
  }

  layout(_w: number, _h: number): void {
    if (!this.ready) return;
    this.container.x = 16;
    this.container.y = 24;
  }

  update(deltaMS: number): void {
    if (!this.ready) return;
    this.xpHud?.update(deltaMS);
    this.atkHud?.update(deltaMS);
    this.coinHud?.update(deltaMS);
  }

  // ── XP forwards ────────────────────────────────────────────────────────
  pulseXp(): void { this.xpHud?.pulse(); }
  setXpFill(ratio: number): void { this.xpHud?.setFill(ratio); }
  addXpFill(delta: number): void { this.xpHud?.addFill(delta); }
  getCurrentXpRatio(): number { return this.xpHud?.getCurrentRatio() ?? 0; }
  snapXpToTarget(): void { this.xpHud?.snapToTarget(); }
  getXpBarWidth(): number { return this.xpHud?.getBarWidth() ?? 0; }
  animateXpBarWidth(target: number, dur: number): void { this.xpHud?.animateBarWidth(target, dur); }
  resetXpBarWidth(dur: number): void { this.xpHud?.resetBarWidth(dur); }

  getXpBarLeftScreenX(): number {
    if (!this.xpHud) return this.container.x;
    return this.container.x + this.xpHud.getBarLeftLocalX();
  }

  getXpPillPosition(): { x: number; y: number } {
    if (!this.xpHud) return { x: 0, y: 0 };
    const local = this.xpHud.getBarCenterLocal();
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  getXpIconCenterScreenPosition(): { x: number; y: number } {
    if (!this.xpHud) return { x: this.container.x, y: this.container.y };
    const local = this.xpHud.getIconCenterLocal();
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  /** Loaded icon textures — let BoardScene spawn flying-icon sprites without
   *  re-importing the asset. Returns undefined if the HUD isn't enabled. */
  getXpIconTexture(): Texture | undefined { return this.xpHud?.getIconTexture(); }
  getCoinIconTexture(): Texture | undefined { return this.coinHud?.getIconTexture(); }

  // ── ATK forwards ───────────────────────────────────────────────────────
  initAtk(value: number): void { this.atkHud?.init_(value); }
  setAtk(value: number): void { this.atkHud?.set(value); }

  // ── Coin forwards ──────────────────────────────────────────────────────
  initCoins(value: number): void { this.coinHud?.init_(value); }
  setCoins(value: number): void { this.coinHud?.set(value); }
  addCoinDelta(delta: number): void { this.coinHud?.addDelta(delta); }

  getCoinPillPosition(): { x: number; y: number } {
    if (!this.coinHud) return { x: 0, y: 0 };
    const local = this.coinHud.getPillCenterLocal();
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  getCoinIconCenterScreenPosition(): { x: number; y: number } {
    if (!this.coinHud) return { x: this.container.x, y: this.container.y };
    const local = this.coinHud.getIconCenterLocal();
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  private requireHud<K extends 'XpHud' | 'AtkHud' | 'CoinHud'>(
    key: K,
    feature: string,
  ): NonNullable<PlayableSceneClasses[K]> {
    const Cls = this.sceneClasses[key];
    if (!Cls) {
      throw new Error(`BoardStatsBar: ${feature} set but sceneClasses.${key} missing — codegen forgot to include it.`);
    }
    return Cls as NonNullable<PlayableSceneClasses[K]>;
  }
}
