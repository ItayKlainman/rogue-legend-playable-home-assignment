import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import * as sfx from '../sfx';

// Mirrors LuckyWheelScene + SlotReelsScene's gold rounded-rect SPIN button. Extracted
// so BlackjackScene can stamp 4 buttons (Roll/Stand/Claim/Challenge) without duplicating
// the shine-sweep + pressed-state logic four times.
//
// Sizes are reference values at 1080×1920; pass `vScale` from the parent's `layoutAll`
// to bake at the right pixel size. The button does NOT use `container.scale` — the
// background redraws itself at scaled width/height so stroke widths stay crisp.

const SPIN_GOLD = 0xFFC600;
const SPIN_GOLD_PRESSED = 0x6e6e76;
const SPIN_BTN_STROKE = 0x4a3010;
const SPIN_BTN_STROKE_PRESSED = 0x3a3a40;

const SPIN_SHINE_CYCLE_MS = 2200;
const SPIN_SHINE_SWEEP_MS = 500;
const SPIN_SHINE_TILT = -Math.PI / 7;

export interface SpinButtonOptions {
  /** Reference width at vScale=1 (Unity 1080×1920). */
  width?: number;
  /** Reference height at vScale=1. */
  height?: number;
  /** Reference corner radius at vScale=1. */
  radius?: number;
  /** Initial label text (e.g., "ROLL", "STAND"). */
  label?: string;
  /** Reference label font size at vScale=1. */
  fontSize?: number;
  /** Idle fill color (default Unity gold). */
  fillColor?: number;
  /** Pressed/disabled fill color. */
  pressedColor?: number;
  /** Click handler. Plays buttonClick SFX before invoking. */
  onClick?: () => void;
  /** Disable shine sweep (for secondary actions). */
  noShine?: boolean;
}

export class SpinButton {
  readonly container: Container;
  private bg: Graphics;
  private label: Text;
  private shineMask?: Graphics;
  private shineBar?: Graphics;
  private shineElapsed = 0;

  private refW: number;
  private refH: number;
  private refR: number;
  private refFontSize: number;
  private fillColor: number;
  private pressedColor: number;
  private noShine: boolean;

  private currentVScale = 1;
  private pressed = false;
  private interactive = true;
  /** Button hidden — stops the shine sweep too. */
  private hidden = false;

  constructor(opts: SpinButtonOptions = {}) {
    this.refW = opts.width ?? 400;
    this.refH = opts.height ?? 145;
    this.refR = opts.radius ?? 26;
    this.refFontSize = opts.fontSize ?? 44;
    this.fillColor = opts.fillColor ?? SPIN_GOLD;
    this.pressedColor = opts.pressedColor ?? SPIN_GOLD_PRESSED;
    this.noShine = !!opts.noShine;

    this.container = new Container();
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    if (!this.noShine) {
      const shineContainer = new Container();
      this.shineMask = new Graphics();
      this.shineBar = new Graphics();
      this.shineBar.rotation = SPIN_SHINE_TILT;
      shineContainer.addChild(this.shineMask, this.shineBar);
      shineContainer.mask = this.shineMask;
      this.container.addChild(shineContainer);
    }

    this.label = new Text({
      text: opts.label ?? 'SPIN!',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: this.refFontSize,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: SPIN_BTN_STROKE, width: 5, join: 'round' },
      }),
    });
    this.label.anchor.set(0.5);
    this.container.addChild(this.label);

    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    if (opts.onClick) {
      this.container.on('pointerdown', () => {
        if (!this.interactive || this.hidden) return;
        sfx.buttonClick();
        opts.onClick!();
      });
    }

    this.draw();
  }

  /** Re-bake the button at the supplied viewport scale. Call from `layoutAll()`. */
  layout(vScale: number): void {
    this.currentVScale = vScale;
    this.draw();
    this.label.style.fontSize = Math.max(20, this.refFontSize * vScale);
  }

  /** Toggle pressed/disabled visual + interaction. */
  setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.draw();
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    this.container.eventMode = on ? 'static' : 'none';
    this.container.cursor = on ? 'pointer' : 'default';
  }

  setLabel(text: string): void {
    this.label.text = text;
  }

  /** Hide button (keeps it in the tree but invisible + non-interactive). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.container.visible = !hidden;
    if (hidden) this.setInteractive(false);
  }

  /** Step the shine sweep. Call from `update(deltaMS)` while the button is idle. */
  update(deltaMS: number): void {
    if (!this.shineBar || this.hidden || this.pressed || !this.interactive) {
      if (this.shineBar) this.shineBar.visible = false;
      return;
    }
    this.shineElapsed += deltaMS;
    const cyclePos = this.shineElapsed % SPIN_SHINE_CYCLE_MS;
    if (cyclePos < SPIN_SHINE_SWEEP_MS) {
      const t = cyclePos / SPIN_SHINE_SWEEP_MS;
      const range = (this.refW + 60) * this.currentVScale;
      this.shineBar.x = -range / 2 + range * t;
      this.shineBar.visible = true;
    } else {
      this.shineBar.visible = false;
    }
  }

  private draw(): void {
    const s = this.currentVScale;
    const w = this.refW * s;
    const h = this.refH * s;
    const r = this.refR * s;
    const fill = this.pressed ? this.pressedColor : this.fillColor;
    const stroke = this.pressed ? SPIN_BTN_STROKE_PRESSED : SPIN_BTN_STROKE;

    this.bg.clear();
    this.bg.roundRect(-w / 2, -h / 2, w, h, r)
      .fill({ color: fill })
      .stroke({ color: stroke, width: 4 });

    if (this.shineMask && this.shineBar) {
      this.shineMask.clear();
      this.shineMask.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0xffffff });
      const barW = 60 * s;
      const barH = h * 2.6;
      this.shineBar.clear();
      this.shineBar
        .rect(-barW / 2, -barH / 2, barW, barH)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }
  }
}
