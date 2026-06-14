import { Container, Graphics, Sprite, Text, Texture, Assets } from 'pixi.js';
import { formatNumber } from '@shared/utils';
import coinIconData from 'assets/UI/Coin.webp';

const COIN_BAR_W = 72;
const COIN_BAR_H = 18;
const COIN_BORDER = 2;
const COIN_RADIUS = 4;
const COIN_ICON_SIZE = 34;
const ICON_PADDING_LEFT = 15;

export class CoinHud {
  readonly container: Container;
  private coinBg!: Graphics;
  private coinText!: Text;
  private coinPunchTime = -1;
  /** Source of truth for the displayed coin number. Lags behind `state.coins`
   *  during a fly animation: addDelta() ticks it up as sprites arrive. */
  private displayedValue = 0;
  private iconTex!: Texture;

  constructor() {
    this.container = new Container();
  }

  /** Loaded icon texture — exposed so BoardScene can spawn flying coin
   *  sprites without re-importing the asset. */
  getIconTexture(): Texture { return this.iconTex; }

  get width(): number {
    return COIN_ICON_SIZE / 2 + COIN_BAR_W;
  }

  async init(): Promise<void> {
    this.iconTex = await Assets.load(coinIconData);
    const icon = new Sprite(this.iconTex);
    icon.anchor.set(0.5, 0.5);
    icon.width = COIN_ICON_SIZE;
    icon.height = COIN_ICON_SIZE;
    icon.x = ICON_PADDING_LEFT;
    icon.y = 0;

    const barOffsetX = COIN_ICON_SIZE / 2;
    this.coinBg = new Graphics();
    this.coinBg.x = barOffsetX;
    this.coinBg.y = -COIN_BAR_H / 2;
    this.drawBar();

    this.coinText = new Text({
      text: '0',
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    this.coinText.anchor.set(0.5, 0.5);
    this.coinText.x = barOffsetX + COIN_BAR_W / 2;
    this.coinText.y = 0;

    this.container.addChild(this.coinBg, this.coinText, icon);
  }

  update(deltaMS: number): void {
    if (this.coinPunchTime < 0) return;
    this.coinPunchTime += deltaMS;
    const PUNCH_DURATION = 200;
    if (this.coinPunchTime >= PUNCH_DURATION) {
      this.coinPunchTime = -1;
      this.container.scale.set(1);
    } else {
      const t = this.coinPunchTime / PUNCH_DURATION;
      const s = t < 0.5 ? 1 + 0.2 * (t / 0.5) : 1.2 - 0.2 * ((t - 0.5) / 0.5);
      this.container.scale.set(s);
    }
  }

  init_(value: number): void {
    this.displayedValue = value;
    this.coinText.text = formatNumber(value);
  }

  set(value: number): void {
    this.displayedValue = value;
    this.coinText.text = formatNumber(value);
    this.coinPunchTime = 0;
  }

  /** Increment the displayed value by `delta` and trigger a brief pulse.
   *  Used by playCoinFly so the HUD ramps up as flying coin sprites land.
   *  Display is always rounded to an integer — float drift between arrivals
   *  is corrected at the end of the fly via set(state.coins). */
  addDelta(delta: number): void {
    this.displayedValue = Math.max(0, this.displayedValue + delta);
    this.coinText.text = formatNumber(Math.round(this.displayedValue));
    if (this.coinPunchTime < 0) this.coinPunchTime = 0;
  }

  /** Local position of the bar's center. */
  getPillCenterLocal(): { x: number; y: number } {
    return { x: this.container.x + COIN_ICON_SIZE / 2 + COIN_BAR_W / 2, y: 0 };
  }

  /** Local position of the icon's center. */
  getIconCenterLocal(): { x: number; y: number } {
    return { x: this.container.x + ICON_PADDING_LEFT, y: 0 };
  }

  private drawBar(): void {
    this.coinBg.clear();
    this.coinBg.roundRect(0, 0, COIN_BAR_W, COIN_BAR_H, COIN_RADIUS)
      .fill({ color: 0x1a1a2e })
      .stroke({ color: 0x333355, width: COIN_BORDER });
  }
}
