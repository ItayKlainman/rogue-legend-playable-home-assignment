import { Container, Graphics, Text } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import type { Scene } from '@shared/Scene';

export class MyScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;

  private bg!: Graphics;
  private label!: Text;
  private ready = false;
  private resolveDone!: () => void;
  private width: number;
  private height: number;
  private message: string;

  constructor(message: string, width: number, height: number) {
    this.message = message;
    this.width = width;
    this.height = height;
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  async enter(): Promise<void> {
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.label = new Text({
      text: this.message,
      style: {
        fontFamily: 'Arial',
        fontSize: 36,
        fill: 0xffffff,
        align: 'center',
      },
    });
    this.label.anchor.set(0.5);
    this.container.addChild(this.label);

    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.on('pointerdown', () => {
      sdk.install();
    });

    this.layout(this.width, this.height);
    this.ready = true;
  }

  async exit(): Promise<void> {
    this.container.removeChildren();
  }

  update(_deltaMS: number): void {
    if (!this.ready) {
      return;
    }
  }

  pause(): void {}
  resume(): void {}

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) {
      return;
    }
    this.bg.clear();
    this.bg.rect(0, 0, width, height).fill(0x1a1a2e);
    this.label.position.set(width / 2, height / 2);
    this.container.hitArea = { contains: () => true };
  }
}
