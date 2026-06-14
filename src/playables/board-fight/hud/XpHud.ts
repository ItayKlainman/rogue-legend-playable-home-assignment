import { Container, Graphics, Sprite, Texture, Assets } from 'pixi.js';
import expIconData from 'assets/UI/EXP.webp';

const XP_BAR_W_DEFAULT = 46;
const XP_BAR_H = 18;
const XP_BORDER = 2;
const XP_RADIUS = 4;
const XP_ICON_SIZE = 34;
const ICON_PADDING_LEFT = 10;

export class XpHud {
  readonly container: Container;
  private xpTrack!: Graphics;
  private xpFill!: Graphics;
  private xpCurrentRatio = 0;
  private xpTargetRatio = 0;
  private xpBarWidth = XP_BAR_W_DEFAULT;
  private xpWidthTween: { from: number; to: number; elapsed: number; duration: number } | null = null;
  private xpPulseTime = -1;
  private iconTex!: Texture;
  /** Last drawn values — skip GPU geometry upload if neither changed enough
   *  to be visible (1 logical pixel of fill width). XP fly fires 10–22
   *  landings in 1.5 s, each triggering the lerp + per-frame update. */
  private lastDrawnWidth = -1;
  private lastDrawnFillW = -1;

  constructor() {
    this.container = new Container();
  }

  /** Loaded icon texture — exposed so BoardScene can spawn flying sprites
   *  without re-importing the asset. */
  getIconTexture(): Texture { return this.iconTex; }

  /** Total horizontal space this HUD takes — used by BoardStatsBar to lay out
   *  siblings in sequence. */
  get width(): number {
    return XP_ICON_SIZE / 2 + this.xpBarWidth;
  }

  async init(): Promise<void> {
    this.iconTex = await Assets.load(expIconData);
    const icon = new Sprite(this.iconTex);
    icon.anchor.set(0.5, 0.5);
    icon.width = XP_ICON_SIZE;
    icon.height = XP_ICON_SIZE;
    icon.x = ICON_PADDING_LEFT;
    icon.y = 0;

    const barOffsetX = XP_ICON_SIZE / 2;
    this.xpTrack = new Graphics();
    this.xpFill = new Graphics();
    this.xpTrack.x = barOffsetX;
    this.xpFill.x = barOffsetX;
    this.xpTrack.y = -XP_BAR_H / 2;
    this.xpFill.y = -XP_BAR_H / 2;
    this.container.addChild(this.xpTrack, this.xpFill, icon);
    this.drawXpBar();
  }

  update(deltaMS: number): void {
    let dirty = false;

    // XP bar width tween — track geometry depends on width
    if (this.xpWidthTween) {
      this.xpWidthTween.elapsed += deltaMS;
      const t = Math.min(1, this.xpWidthTween.elapsed / this.xpWidthTween.duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.xpBarWidth = this.xpWidthTween.from + (this.xpWidthTween.to - this.xpWidthTween.from) * e;
      if (t >= 1) {
        this.xpBarWidth = this.xpWidthTween.to;
        this.xpWidthTween = null;
      }
      dirty = true;
    }

    // XP lerp — fill ratio only
    if (Math.abs(this.xpCurrentRatio - this.xpTargetRatio) > 0.001) {
      this.xpCurrentRatio += (this.xpTargetRatio - this.xpCurrentRatio) * 0.1;
      if (Math.abs(this.xpCurrentRatio - this.xpTargetRatio) < 0.001) {
        this.xpCurrentRatio = this.xpTargetRatio;
      }
      dirty = true;
    }

    if (dirty) this.drawXpBar();

    // XP bar pulse animation
    if (this.xpPulseTime >= 0) {
      this.xpPulseTime += deltaMS;
      const PULSE_DURATION = 150;
      if (this.xpPulseTime >= PULSE_DURATION) {
        this.xpPulseTime = -1;
        this.container.scale.set(1);
      } else {
        const t = this.xpPulseTime / PULSE_DURATION;
        const s = t < 0.5 ? 1 + 0.2 * (t / 0.5) : 1.2 - 0.2 * ((t - 0.5) / 0.5);
        this.container.scale.set(s);
      }
    }
  }

  pulse(): void { this.xpPulseTime = 0; }

  setFill(ratio: number): void { this.xpTargetRatio = Math.min(1, Math.max(0, ratio)); }

  addFill(delta: number): void {
    this.xpTargetRatio = Math.min(1, Math.max(0, this.xpTargetRatio + delta));
    this.xpCurrentRatio = this.xpTargetRatio;
    this.drawXpBar();
  }

  getCurrentRatio(): number { return this.xpTargetRatio; }

  snapToTarget(): void {
    this.xpCurrentRatio = this.xpTargetRatio;
    this.drawXpBar();
  }

  getBarWidth(): number { return this.xpBarWidth; }

  /** Local-X of the bar's left edge (right of the icon). Add the parent
   *  container's screen position for absolute coords. */
  getBarLeftLocalX(): number { return this.container.x + XP_ICON_SIZE / 2; }

  /** Local position of the bar's center, used as a fly-target. */
  getBarCenterLocal(): { x: number; y: number } {
    return { x: this.container.x + XP_ICON_SIZE / 2 + this.xpBarWidth / 2, y: 0 };
  }

  /** Local position of the icon's center. */
  getIconCenterLocal(): { x: number; y: number } {
    return { x: this.container.x + ICON_PADDING_LEFT, y: 0 };
  }

  animateBarWidth(targetWidth: number, durationMs: number): void {
    this.xpWidthTween = {
      from: this.xpBarWidth,
      to: Math.max(XP_BAR_W_DEFAULT, targetWidth),
      elapsed: 0,
      duration: Math.max(1, durationMs),
    };
  }

  resetBarWidth(durationMs: number): void {
    this.xpWidthTween = {
      from: this.xpBarWidth,
      to: XP_BAR_W_DEFAULT,
      elapsed: 0,
      duration: Math.max(1, durationMs),
    };
  }

  private drawXpBar(): void {
    const w = this.xpBarWidth;
    const h = XP_BAR_H;
    const b = XP_BORDER;
    const r = XP_RADIUS;

    // Track geometry only depends on width — skip if unchanged.
    if (Math.abs(w - this.lastDrawnWidth) >= 0.5) {
      this.xpTrack.clear();
      this.xpTrack.roundRect(0, 0, w, h, r)
        .fill({ color: 0x1a1a2e })
        .stroke({ color: 0x333355, width: b });
      this.lastDrawnWidth = w;
    }

    // Fill geometry depends on width × ratio. Skip when the resulting fill
    // width hasn't moved by at least 1 logical pixel (the user can't see it).
    const innerW = w - b * 2;
    const fillW = this.xpCurrentRatio > 0 ? Math.max(0, innerW * this.xpCurrentRatio) : 0;
    if (Math.abs(fillW - this.lastDrawnFillW) >= 1) {
      this.xpFill.clear();
      if (fillW > 0) {
        const fillR = Math.max(0, r - 1);
        this.xpFill.roundRect(b, b, fillW, h - b * 2, fillR)
          .fill({ color: 0x44cc66 });
      }
      this.lastDrawnFillW = fillW;
    }
  }
}
