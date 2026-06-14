import { Container, Graphics, Sprite, Text, Assets } from 'pixi.js';
import { formatNumber } from '@shared/utils';
import atkIconData from 'assets/UI/ATK_Base_Stat.webp';

const ATK_BAR_W = 60;
const ATK_BAR_H = 18;
const ATK_BORDER = 2;
const ATK_RADIUS = 4;
const ATK_ICON_SIZE = 34;
const ICON_PADDING_LEFT = 15;

export class AtkHud {
  readonly container: Container;
  private atkBg!: Graphics;
  private atkText!: Text;
  private atkPunchTime = -1;

  constructor() {
    this.container = new Container();
  }

  get width(): number {
    return ATK_ICON_SIZE / 2 + ATK_BAR_W;
  }

  async init(): Promise<void> {
    const tex = await Assets.load(atkIconData);
    const icon = new Sprite(tex);
    icon.anchor.set(0.5, 0.5);
    icon.width = ATK_ICON_SIZE;
    icon.height = ATK_ICON_SIZE;
    icon.x = ICON_PADDING_LEFT;
    icon.y = 0;

    const barOffsetX = ATK_ICON_SIZE / 2;
    this.atkBg = new Graphics();
    this.atkBg.x = barOffsetX;
    this.atkBg.y = -ATK_BAR_H / 2;
    this.drawBar();

    this.atkText = new Text({
      text: '0',
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    this.atkText.anchor.set(0.5, 0.5);
    this.atkText.x = barOffsetX + ATK_BAR_W / 2;
    this.atkText.y = 0;

    this.container.addChild(this.atkBg, this.atkText, icon);
  }

  update(deltaMS: number): void {
    if (this.atkPunchTime < 0) return;
    this.atkPunchTime += deltaMS;
    const PUNCH_DURATION = 200;
    if (this.atkPunchTime >= PUNCH_DURATION) {
      this.atkPunchTime = -1;
      this.container.scale.set(1);
    } else {
      const t = this.atkPunchTime / PUNCH_DURATION;
      const s = t < 0.5 ? 1 + 0.2 * (t / 0.5) : 1.2 - 0.2 * ((t - 0.5) / 0.5);
      this.container.scale.set(s);
    }
  }

  init_(value: number): void { this.atkText.text = formatNumber(value); }

  set(value: number): void {
    this.atkText.text = formatNumber(value);
    this.atkPunchTime = 0;
  }

  private drawBar(): void {
    this.atkBg.clear();
    this.atkBg.roundRect(0, 0, ATK_BAR_W, ATK_BAR_H, ATK_RADIUS)
      .fill({ color: 0x1a1a2e })
      .stroke({ color: 0x333355, width: ATK_BORDER });
  }
}
