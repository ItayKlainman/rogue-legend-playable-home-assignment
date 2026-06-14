import { Assets, BlurFilter, Container, Graphics, Sprite, Text, TextStyle, Rectangle } from 'pixi.js';
import type { LogoOverlayHandle } from './LogoOverlay';
import { safeInstall } from '../mraidInstall';
import titleLineData from 'assets/UI/Title_LineTopBottom_04_Line.webp';

export interface PromoOverlayConfig {
  code: string;
  mode: 'instant' | 'countdown';
  countdownSec?: number;
  rewardName?: string;
  rewardImage?: string;
}

const MARGIN = 8;
const CROSSFADE_MS = 400;
const LABEL_SIZE = 14;
const CODE_SIZE = 24;

export async function createPromoOverlay(
  config: PromoOverlayConfig,
): Promise<LogoOverlayHandle> {
  const wrapper = new Container();
  wrapper.eventMode = 'static';
  wrapper.cursor = 'pointer';
  wrapper.on('pointerdown', () => {
    safeInstall();
  });

  const content = new Container();
  wrapper.addChild(content);

  // Decorative line ornaments (one above, one below, bottom flipped)
  const lineTex = await Assets.load(titleLineData);
  const lineTop = new Sprite(lineTex);
  lineTop.anchor.set(0.5, 0.5);
  lineTop.tint = 0xf5c842;
  const lineBottom = new Sprite(lineTex);
  lineBottom.anchor.set(0.5, 0.5);
  lineBottom.tint = 0xf5c842;
  // ── Glow background behind everything ──

  const glow = new Graphics();
  glow.filters = [new BlurFilter({ strength: 12 })];
  content.addChild(glow);

  content.addChild(lineTop);
  content.addChild(lineBottom);

  // ── Reward image (optional, shown to the left of text) ──
  let rewardContainer: Container | null = null;
  const IMG_SIZE = 46;
  if (config.rewardImage) {
    const imgTex = await Assets.load(config.rewardImage);

    rewardContainer = new Container();
    rewardContainer.pivot.set(IMG_SIZE / 2, IMG_SIZE / 2);

    const imgSprite = new Sprite(imgTex);
    imgSprite.width = IMG_SIZE;
    imgSprite.height = IMG_SIZE;
    rewardContainer.addChild(imgSprite);

    content.addChild(rewardContainer);
  }

  let lastWidth = 0;
  let lastYOffset = 0;
  let hidden = false;
  let maxTextW = 0;

  function updateGlow(): void {
    const maxW = Math.max(labelText.width, codeText.width);
    const totalH = LABEL_SIZE + 4 + CODE_SIZE;
    const padX = 30;
    const padY = 16;
    glow.clear();
    glow.ellipse(0, totalH / 2, maxW / 2 + padX, totalH / 2 + padY);
    glow.fill({ color: 0x000000, alpha: 0.6 });
  }

  // ── Promo code texts (always created, may start invisible) ──

  const labelStyle = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: LABEL_SIZE,
    fontWeight: 'bold',
    fill: 0xffffff,
  });
  const labelText = new Text({ text: 'USE CODE', style: labelStyle });
  labelText.anchor.set(0.5, 0);

  const codeStyle = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: CODE_SIZE,
    fontWeight: 'bold',
    fill: 0xffd700,
  });
  const codeText = new Text({ text: config.code.toUpperCase(), style: codeStyle });
  codeText.anchor.set(0.5, 0);

  // ── Countdown text (only for countdown mode) ──

  let rewardNameText: Text | null = null;
  let countdownText: Text | null = null;
  let countdownElapsed = 0;
  let countdownDone = false;
  let crossfadeElapsed = 0;
  let crossfading = false;
  const countdownSec = Math.max(1, config.countdownSec ?? 1);

  if (config.mode === 'countdown') {
    const rewardStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: CODE_SIZE,
      fontWeight: 'bold',
      fill: 0xffd700,
    });
    rewardNameText = new Text({
      text: (config.rewardName ?? '').toUpperCase(),
      style: rewardStyle,
    });
    rewardNameText.anchor.set(0.5, 0);
    content.addChild(rewardNameText);

    const countdownStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: LABEL_SIZE,
      fontWeight: 'bold',
      fill: 0xffffff,
    });
    const remaining = countdownSec;
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    countdownText = new Text({
      text: `GIVEAWAY IN ${mins}:${String(secs).padStart(2, '0')}`,
      style: countdownStyle,
    });
    countdownText.anchor.set(0.5, 0);
    content.addChild(countdownText);

    // Promo texts start hidden
    labelText.alpha = 0;
    codeText.alpha = 0;
  }

  content.addChild(labelText);
  content.addChild(codeText);

  // ── Layout ──

  function positionElements(): void {
    const imgOffset = rewardContainer ? (IMG_SIZE / 2) : 0;

    if (rewardNameText && countdownText && !countdownDone) {
      rewardNameText.x = imgOffset;
      rewardNameText.y = 0;
      countdownText.x = imgOffset;
      countdownText.y = CODE_SIZE + 4;
    }

    // Stack label + code vertically; shift closer to image
    const promoW = Math.max(labelText.width, codeText.width);
    const promoShift = rewardContainer ? -(maxTextW - promoW) / 2 + 4 : 0;
    labelText.x = imgOffset + promoShift;
    labelText.y = 4;
    codeText.x = imgOffset + promoShift;
    codeText.y = LABEL_SIZE + 5;

    const totalH = LABEL_SIZE + 4 + CODE_SIZE;
    let textW = Math.max(labelText.width, codeText.width);
    if (rewardNameText) {
      textW = Math.max(textW, rewardNameText.width);
    }
    if (countdownText) {
      textW = Math.max(textW, countdownText.width);
    }
    // Remember the widest text seen so layout doesn't jump after countdown
    if (textW > maxTextW) {
      maxTextW = textW;
    }

    if (rewardContainer) {
      rewardContainer.x = -maxTextW / 2;
      rewardContainer.y = totalH / 2 + 4;
    }
    const maxW = maxTextW + (rewardContainer ? IMG_SIZE : 0);

    // Scale lines uniformly to match text width, preserve aspect ratio
    const pad = 40;
    const lineScale = (maxW + pad * 2) / lineTex.width;
    lineTop.scale.set(lineScale, lineScale);
    lineBottom.scale.set(lineScale, -lineScale);
    lineTop.x = 0;
    lineTop.y = -7;
    lineBottom.x = 0;
    lineBottom.y = totalH + 10;

    content.pivot.set(0, totalH / 2);

    // Position content so it sits in the top-right with margin
    content.x = lastWidth - MARGIN - maxW / 2;
    content.y = MARGIN + totalH / 2 + lastYOffset + 20;

    updateGlow();

    // hitArea on wrapper for tap targets
    const hitW = Math.max(maxW + pad * 2 + 16, 44);
    const hitH = Math.max(totalH + pad + 16, 44);
    const hitX = lastWidth - MARGIN - maxW - pad - 8;
    const hitY = MARGIN + lastYOffset - 8;
    wrapper.hitArea = new Rectangle(hitX, hitY, hitW, hitH);
  }

  function layout(width: number, _height: number, yOffset = 0): void {
    lastWidth = width;
    lastYOffset = yOffset;
    positionElements();
  }

  // ── Update (pulse + countdown) ──

  function update(dt: number): void {
    if (config.mode !== 'countdown' || countdownDone) {
      return;
    }

    // Countdown tick
    countdownElapsed += dt;
    const remaining = Math.ceil(countdownSec - countdownElapsed / 1000);

    if (remaining > 0 && countdownText) {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      countdownText.text = `GIVEAWAY IN ${mins}:${String(secs).padStart(2, '0')}`;
    } else if (!crossfading) {
      // Start crossfade
      crossfading = true;
      crossfadeElapsed = 0;

      if (hidden) {
        // Skip animation, just swap
        countdownDone = true;
        if (rewardNameText) {
          rewardNameText.destroy();
          rewardNameText = null;
        }
        if (countdownText) {
          countdownText.destroy();
          countdownText = null;
        }
        labelText.alpha = 1;
        codeText.alpha = 1;
        positionElements();
        return;
      }
    }

    if (crossfading) {
      crossfadeElapsed += dt;
      const t = Math.min(crossfadeElapsed / CROSSFADE_MS, 1);

      if (rewardNameText) {
        rewardNameText.alpha = 1 - t;
      }
      if (countdownText) {
        countdownText.alpha = 1 - t;
      }
      labelText.alpha = t;
      codeText.alpha = t;

      if (t >= 1) {
        countdownDone = true;
        crossfading = false;
        if (rewardNameText) {
          rewardNameText.destroy();
          rewardNameText = null;
        }
        if (countdownText) {
          countdownText.destroy();
          countdownText = null;
        }
        positionElements();
      }
    }
  }

  return {
    container: wrapper,
    show() {
      wrapper.visible = true;
      hidden = false;
    },
    hide() {
      wrapper.visible = false;
      hidden = true;
    },
    layout,
    update,
    destroy() {
      wrapper.destroy({ children: true });
    },
  };
}
