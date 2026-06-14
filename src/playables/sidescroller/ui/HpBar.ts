import { Container, Graphics, Text } from 'pixi.js';

export class HpBar {
  readonly container = new Container();

  private barBg: Graphics;
  private barFill: Graphics;
  private label: Text;
  private maxHp: number;
  private barWidth = 200;
  private barHeight = 16;

  constructor(maxHp: number) {
    this.maxHp = maxHp;

    this.barBg = new Graphics();
    this.barBg.roundRect(0, 0, this.barWidth, this.barHeight, 4).fill(0x333333);
    this.barBg.roundRect(0, 0, this.barWidth, this.barHeight, 4).stroke({ color: 0x666666, width: 1 });
    this.container.addChild(this.barBg);

    this.barFill = new Graphics();
    this.drawFill(1);
    this.container.addChild(this.barFill);

    this.label = new Text({
      text: 'HP',
      style: {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: 'bold',
      },
    });
    this.label.anchor.set(0, 0.5);
    this.label.position.set(-30, this.barHeight / 2);
    this.container.addChild(this.label);
  }

  update(currentHp: number): void {
    const ratio = Math.max(0, currentHp / this.maxHp);
    this.drawFill(ratio);
  }

  layout(width: number): void {
    this.container.position.set(50, 20);
  }

  private drawFill(ratio: number): void {
    this.barFill.clear();
    const fillWidth = this.barWidth * ratio;

    if (fillWidth > 0) {
      const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
      this.barFill.roundRect(0, 0, fillWidth, this.barHeight, 4).fill(color);
    }
  }
}
