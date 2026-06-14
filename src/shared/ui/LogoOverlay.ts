import { Assets, Container, Sprite } from 'pixi.js';
import logoData from 'assets/UI/LOGO_rogue legend_.webp';
import { safeInstall } from '../mraidInstall';

const MARGIN = 8;
const TARGET_HEIGHT = 60;
const PULSE_AMP = 0.05;
const PULSE_SPEED = Math.PI; // full cycle ≈ 2s

export interface LogoOverlayHandle {
  readonly container: Container;
  show(): void;
  hide(): void;
  layout(width: number, height: number, yOffset?: number): void;
  update(dt: number): void;
  destroy(): void;
}

export async function createLogoOverlay(): Promise<LogoOverlayHandle> {
  const texture = await Assets.load(logoData);
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 0.5); // center anchor for pulse scaling
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  sprite.on('pointerdown', () => {
    safeInstall();
  });

  const wrapper = new Container();
  wrapper.addChild(sprite);

  const baseScale = TARGET_HEIGHT / texture.height;
  sprite.scale.set(baseScale);
  const scaledW = texture.width * baseScale;
  const scaledH = texture.height * baseScale;
  let elapsed = 0;

  function layout(width: number, _height?: number, yOffset = 0): void {
    sprite.x = width - MARGIN - scaledW / 2;
    sprite.y = MARGIN + scaledH / 2 + yOffset;
  }

  function update(dt: number): void {
    elapsed += dt;
    const s = baseScale * (1 + PULSE_AMP * Math.sin(elapsed / 1000 * PULSE_SPEED));
    sprite.scale.set(s);
  }

  return {
    container: wrapper,
    show() { wrapper.visible = true; },
    hide() { wrapper.visible = false; },
    layout,
    update,
    destroy() { wrapper.destroy({ children: true }); },
  };
}
