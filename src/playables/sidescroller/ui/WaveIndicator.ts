import { Container, Text } from 'pixi.js';

export class WaveIndicator {
  readonly container = new Container();

  private label: Text;
  private totalWaves: number;

  constructor(totalWaves: number) {
    this.totalWaves = totalWaves;

    this.label = new Text({
      text: totalWaves > 0 ? 'Wave 1/' + totalWaves : '',
      style: {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xffffff,
        fontWeight: 'bold',
        dropShadow: {
          color: 0x000000,
          blur: 2,
          distance: 1,
        },
      },
    });
    this.label.anchor.set(1, 0);
    this.container.addChild(this.label);
  }

  update(currentWave: number): void {
    if (this.totalWaves > 0) {
      const display = Math.min(currentWave, this.totalWaves);
      this.label.text = `Wave ${display}/${this.totalWaves}`;
    }
  }

  layout(width: number): void {
    this.label.position.set(width - 20, 20);
  }
}
