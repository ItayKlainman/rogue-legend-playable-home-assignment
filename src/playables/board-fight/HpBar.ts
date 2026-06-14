import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { formatNumber } from '@shared/utils';

const BAR_BG_COLOR = 0x1a1a2e;
const BAR_FILL_COLOR = 0xcc2222;
const BAR_BORDER_COLOR = 0x333355;
const BAR_BORDER_WIDTH = 2;
const BAR_CORNER_RADIUS = 4;

export class HpBar {
  readonly container: Container;
  private bg: Graphics;
  private fill: Graphics;
  private label: Text;
  private current: number;
  private max: number;
  private barWidth = 100;
  private barHeight = 16;

  constructor(current: number, max: number) {
    this.current = current;
    this.max = max;
    this.container = new Container();

    this.bg = new Graphics();
    this.fill = new Graphics();
    this.label = new Text({
      text: formatNumber(current),
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    this.label.anchor.set(0.5, 1); // bottom-anchored, sits above bar

    this.container.addChild(this.bg, this.fill, this.label);
  }

  private lastLabel = '';

  setHp(current: number): void {
    this.current = Math.max(0, Math.min(current, this.max));
    this.drawFill();
    this.updateLabel();
  }

  layout(centerX: number, y: number, width: number, height: number): void {
    this.barWidth = width;
    this.barHeight = height;
    this.container.x = centerX - width / 2;
    this.container.y = y;
    this.label.style.fontSize = 16;
    this.label.x = width / 2;
    this.label.y = 7;
    this.drawBg();
    this.drawFill();
    this.updateLabel();
  }

  /** Static background + border — only redrawn on layout, not per HP tick. */
  private drawBg(): void {
    this.bg.clear();
    this.bg.roundRect(0, 0, this.barWidth, this.barHeight, BAR_CORNER_RADIUS)
      .fill({ color: BAR_BG_COLOR })
      .stroke({ color: BAR_BORDER_COLOR, width: BAR_BORDER_WIDTH });
  }

  /** Fill — redrawn per HP tick. */
  private drawFill(): void {
    const ratio = this.max > 0 ? this.current / this.max : 0;
    this.fill.clear();
    if (ratio > 0) {
      const fillW = Math.max(0, (this.barWidth - BAR_BORDER_WIDTH * 2) * ratio);
      this.fill.roundRect(
        BAR_BORDER_WIDTH, BAR_BORDER_WIDTH,
        fillW, this.barHeight - BAR_BORDER_WIDTH * 2,
        Math.max(0, BAR_CORNER_RADIUS - 1),
      ).fill({ color: BAR_FILL_COLOR });
    }
  }

  /** Text — only re-render when the formatted string changes. Each
   *  Text mutation rebuilds the glyph atlas, which is expensive on iOS. */
  private updateLabel(): void {
    const next = formatNumber(this.current);
    if (next !== this.lastLabel) {
      this.label.text = next;
      this.lastLabel = next;
    }
  }
}
