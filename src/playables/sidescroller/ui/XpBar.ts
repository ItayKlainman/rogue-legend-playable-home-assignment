import { Container, Graphics, Text } from 'pixi.js';

export class XpBar {
  readonly container = new Container();

  private barBg: Graphics;
  private barFill: Graphics;
  private label: Text;
  private barWidth = 200;
  private barHeight = 12;

  constructor() {
    this.barBg = new Graphics();
    this.barBg.roundRect(0, 0, this.barWidth, this.barHeight, 4).fill(0x333333);
    this.barBg.roundRect(0, 0, this.barWidth, this.barHeight, 4).stroke({ color: 0x666666, width: 1 });
    this.container.addChild(this.barBg);

    this.barFill = new Graphics();
    this.container.addChild(this.barFill);

    this.label = new Text({
      text: 'XP',
      style: {
        fontFamily: 'Arial',
        fontSize: 11,
        fill: 0xffdd44,
        fontWeight: 'bold',
      },
    });
    this.label.anchor.set(0, 0.5);
    this.label.position.set(-28, this.barHeight / 2);
    this.container.addChild(this.label);
  }

  get globalBarX(): number {
    return this.container.getGlobalPosition().x;
  }

  get globalBarY(): number {
    return this.container.getGlobalPosition().y + this.barHeight / 2;
  }

  update(currentXp: number, maxXp: number): void {
    const ratio = Math.max(0, Math.min(1, currentXp / maxXp));
    this.drawFill(ratio);
  }

  layout(width: number): void {
    this.container.position.set(50, 42);
  }

  private drawFill(ratio: number): void {
    this.barFill.clear();
    const fillWidth = this.barWidth * ratio;

    if (fillWidth > 0) {
      this.barFill.roundRect(0, 0, fillWidth, this.barHeight, 4).fill(0xffcc00);
    }
  }
}
