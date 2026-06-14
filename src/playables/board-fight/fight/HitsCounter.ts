import { Container, Text, TextStyle } from 'pixi.js';

const FONT_SIZE = 22;
const MARGIN = 16;
const MARGIN_TOP = 48;
const LABEL_COLOR = 0xffffff;
const NUMBER_COLOR = 0xffcc33;
const STROKE_COLOR = 0x000000;
const STROKE_WIDTH = 3;
const PULSE_MS = 220;
const PULSE_PEAK = 1.55;

type Tween = (durationMs: number, fn: (t: number) => void) => Promise<void>;

export class HitsCounter {
  readonly container: Container;
  private label: Text;
  private number: Text;
  private count = 0;
  private pulseToken = 0;
  private tween: Tween;

  constructor(tween: Tween) {
    this.tween = tween;
    this.container = new Container();

    const labelStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: FONT_SIZE,
      fontWeight: 'bold',
      fill: LABEL_COLOR,
      stroke: { color: STROKE_COLOR, width: STROKE_WIDTH },
    });
    const numberStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: FONT_SIZE,
      fontWeight: 'bold',
      fill: NUMBER_COLOR,
      stroke: { color: STROKE_COLOR, width: STROKE_WIDTH },
    });

    this.label = new Text({ text: 'Hits: ', style: labelStyle });
    this.number = new Text({ text: '0', style: numberStyle });

    this.container.addChild(this.label, this.number);
    this.positionChildren();
  }

  increment(): void {
    this.count++;
    this.number.text = String(this.count);
    this.number.scale.set(1);
    this.positionChildren();
    this.runPulse();
  }

  /** Snap count to 0 and cancel any in-flight pulse. Container stays visible. */
  resetCount(): void {
    this.count = 0;
    this.number.text = '0';
    this.positionChildren();
    this.pulseToken++;
    this.number.scale.set(1);
  }

  /** Full wipe — debug-loop only. */
  reset(): void {
    this.count = 0;
    this.number.text = '0';
    this.pulseToken++;
    this.number.scale.set(1);
    this.positionChildren();
  }

  layout(screenW: number, _screenH: number): void {
    this.container.position.set(MARGIN, MARGIN_TOP);
    void screenW;
    this.positionChildren();
  }

  private positionChildren(): void {
    this.label.position.set(0, 0);
    this.number.pivot.set(this.number.width / 2, this.number.height / 2);
    this.number.position.set(this.label.width + this.number.width / 2, this.number.height / 2);
  }

  private async runPulse(): Promise<void> {
    this.pulseToken++;
    const token = this.pulseToken;
    await this.tween(PULSE_MS, (t) => {
      if (token !== this.pulseToken) return;
      const s = Math.sin(t * Math.PI);
      this.number.scale.set(1 + (PULSE_PEAK - 1) * s);
    });
    if (token === this.pulseToken) {
      this.number.scale.set(1);
    }
  }
}
