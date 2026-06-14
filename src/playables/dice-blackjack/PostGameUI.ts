// Coin reward badge + Claim/Challenge button pair shown after a round win.
//
// Visuals mirror the live Unity game (pocketroll BattleDice_HUD):
//   - Coin badge sits TOP-LEFT (out of the way of the GAMBLER bar/label).
//   - Claim + Challenge buttons replace ROLL/STAND in the bottom button slot
//     (Roll/Stand hide while these are visible).
//   - Buttons are chunky octagonal shapes (Layer Lab "Convex Rectangle" style
//     used by the live game's Generic_Button prefab; we draw it procedurally
//     to avoid adding another texture asset).
//
// All elements live in REF coords (720×1280) inside the parent uiRoot so they
// scale with the rest of the playable UI. Visibility is driven from the
// BlackjackScene listener.

import { Container, Graphics, NineSliceSprite, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import { tween } from '@shared/tween';
import { easeOutQuad, easeOutBack } from '@shared/easing';
import { formatCoins, COIN_HUD_COLORS, COIN_HUD_TIMING } from './CoinHud';
import { REF_W } from './layout';
import type { NineSliceBorders } from '../end_card/buttons9slice';
// Single source of truth for the convex "Layer Lab" button — shared with the
// end-card Play-Now CTA so there is exactly ONE definition of the slice/tints/font.
import { GAME_FONT_STACK, CONVEX_TINTS, makeConvexSlice } from '../end_card/convexButton';

// ── Coin badge constants ──────────────────────────────────────────────────

const BADGE_X = 28;
const BADGE_Y = 28;
const BADGE_PADDING_X = 22;
const BADGE_PADDING_Y = 6;
const BADGE_ICON_SIZE = 48;
const BADGE_ICON_GAP = 10;

const BADGE_TEXT_STYLE = new TextStyle({
  fill: COIN_HUD_COLORS.goldTint,
  fontFamily: GAME_FONT_STACK,
  fontSize: 40,
  letterSpacing: 1.2,
  stroke: { color: COIN_HUD_COLORS.textStroke, width: 5, join: 'round' },
});

// ── Button constants ─────────────────────────────────────────────────────
// Live game's Generic_Button SizeDelta = 250×120, octagonal "Convex Rectangle"
// shape. Sit symmetrically about the screen center at Y = Roll/Stand button Y.

const BUTTON_W = 260;
const BUTTON_H = 140;
const BUTTON_HALF_GAP = 165;       // distance from screen-center to each button center
const BUTTON_COIN_SIZE = 38;       // sub-label coin icon
const BUTTON_COIN_GAP = 6;         // gap between coin and sub-label text
const BUTTON_PRESS_DEPTH = 8;      // how far the face slides down on tap
const BUTTON_GLOW_INSET = 4;       // glow sprite extends this far past the button on each side

const BUTTON_LABEL_STYLE = new TextStyle({
  fill: 0xffffff,
  fontFamily: GAME_FONT_STACK,
  fontSize: 42,
  letterSpacing: 1.6,
  stroke: { color: 0x181008, width: 7, join: 'round' },
  align: 'center',
});

const BUTTON_SUB_STYLE = new TextStyle({
  fill: 0xfff6dc,
  fontFamily: GAME_FONT_STACK,
  fontSize: 26,
  letterSpacing: 1.2,
  stroke: { color: 0x181008, width: 4, join: 'round' },
});

// Tint palette lives in ../end_card/convexButton (CONVEX_TINTS): claim = CONVEX_TINTS.cta,
// challenge = CONVEX_TINTS.challenge. Shared so the end-card CTA matches these buttons.

// "+N" win popup — pulses above the dealer's head on each round win.
const WIN_POPUP_LIFETIME_MS = 1400;
const WIN_POPUP_RISE_PX = 90;
const WIN_POPUP_STYLE = new TextStyle({
  fill: COIN_HUD_COLORS.goldTint,
  fontFamily: GAME_FONT_STACK,
  fontSize: 92,
  letterSpacing: 2,
  stroke: { color: 0x1a1006, width: 11, join: 'round' },
});

// ── Component ──────────────────────────────────────────────────────────────

export interface PostGameUIOptions {
  ticker: Ticker;
  coinTexture: Texture;
  /** Layer Lab Convex Rectangle texture (shared between CLAIM + DOUBLE, tinted at runtime). */
  buttonTexture: Texture;
  buttonBorder: NineSliceBorders;
  onClaim: () => void;
  onChallenge: () => void;
}

export class PostGameUI extends Container {
  private ticker: Ticker;
  private readonly handlers: { onClaim: () => void; onChallenge: () => void };

  // Top-left coin badge
  private coinBadge!: Container;
  private coinBadgePill!: Graphics;
  private coinBadgeIcon!: Sprite;
  private coinBadgeText!: Text;
  private displayedCoins = 0;

  // PostGame button row
  private buttonsRow!: Container;
  private claimButton!: Container;
  private claimFace!: Container;
  private claimLabel!: Text;
  private claimSubLabel!: Text;
  private claimSubCoin!: Sprite;
  private challengeButton!: Container;
  private challengeFace!: Container;
  private challengeLabel!: Text;
  private challengeSubLabel!: Text;
  private challengeSubCoin!: Sprite;
  private coinTexture!: Texture;
  private buttonTexture!: Texture;
  private buttonBorder!: NineSliceBorders;

  // "+N" win popup (parented to this; positioned by scene over the dealer)
  private winPopupLayer!: Container;
  private winPopupLife = 0;
  private winPopupText: Text | null = null;
  private winPopupAnchorX = REF_W / 2;
  private winPopupAnchorY = 600;
  // Held so destroy() can detach the win-popup updater from the shared,
  // long-lived ticker (else it fires against detached objects after exit).
  private winPopupHandler: ((t: Ticker) => void) | null = null;

  // Challenge button breathing
  private breatheElapsed = 0;
  private breatheHandler: ((t: Ticker) => void) | null = null;

  // Cached button row Y — applied via applyLayout from the scene's computeLayout.
  private buttonRowY = 1140;

  constructor(opts: PostGameUIOptions) {
    super();
    this.ticker = opts.ticker;
    this.handlers = { onClaim: opts.onClaim, onChallenge: opts.onChallenge };
    this.coinTexture = opts.coinTexture;
    this.buttonTexture = opts.buttonTexture;
    this.buttonBorder = opts.buttonBorder;
    this.buildCoinBadge(opts.coinTexture);
    this.buildButtons();
    this.buildWinPopupLayer();
    // Initial state: badge hidden until first win; buttons hidden until PostGame.
    this.coinBadge.alpha = 0;
    this.buttonsRow.alpha = 0;
    this.buttonsRow.eventMode = 'none';
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Animate the coin counter from displayed → target. If nextRoundCoins !== null,
   * also show the Claim/Challenge buttons after the count-up. If null (last round),
   * stay quiet — the scene will auto-claim immediately after this resolves.
   */
  async countUpTo(target: number, nextRoundCoins: number | null): Promise<void> {
    if (this.coinBadge.alpha < 1) {
      void tween(this.ticker, COIN_HUD_TIMING.appearMs, t => {
        this.coinBadge.alpha = t;
      }, 1, easeOutQuad);
    }
    const delta = target - this.displayedCoins;
    if (delta > 0) {
      this.spawnWinPopup(`+${formatCoins(delta)}`);
    }
    const startedAt = this.displayedCoins;
    await tween(this.ticker, COIN_HUD_TIMING.countUpMs, t => {
      const v = startedAt + (target - startedAt) * t;
      this.displayedCoins = v;
      this.coinBadgeText.text = formatCoins(v);
      this.relayoutCoinBadge();
    }, 1, easeOutQuad);
    this.displayedCoins = target;
    this.coinBadgeText.text = formatCoins(target);
    this.relayoutCoinBadge();
    if (nextRoundCoins !== null) {
      this.updateButtonLabels(target, nextRoundCoins);
      this.showButtons();
    }
  }

  /** Drain to 0 on lose-all. Hides buttons first so the player can't claim through it. */
  async drainToZero(): Promise<void> {
    this.hideButtons();
    const from = this.displayedCoins;
    if (from <= 0) return;
    await tween(this.ticker, COIN_HUD_TIMING.drainMs, t => {
      const v = from * (1 - t);
      this.displayedCoins = v;
      this.coinBadgeText.text = formatCoins(v);
      this.relayoutCoinBadge();
    }, 1, easeOutQuad);
    this.displayedCoins = 0;
    this.coinBadgeText.text = formatCoins(0);
    this.relayoutCoinBadge();
  }

  /** Snap the coin counter to a value with no animation (used after auto-claim). */
  setCoinsImmediate(amount: number): void {
    this.displayedCoins = amount;
    this.coinBadgeText.text = formatCoins(amount);
    this.relayoutCoinBadge();
  }

  /** Reveal Claim/Challenge with a small slide-up + bounce, start the breathing pulse. */
  showButtons(): void {
    this.buttonsRow.eventMode = 'static';
    this.claimButton.eventMode = 'static';
    this.challengeButton.eventMode = 'static';
    const baseY = this.buttonRowY;
    void tween(this.ticker, 320, t => {
      this.buttonsRow.alpha = t;
      this.buttonsRow.y = baseY + 30 * (1 - t);
    }, 1, easeOutBack);
    this.startBreathing();
  }

  hideButtons(): void {
    this.buttonsRow.alpha = 0;
    this.buttonsRow.eventMode = 'none';
    this.claimButton.eventMode = 'none';
    this.challengeButton.eventMode = 'none';
    this.stopBreathing();
  }

  /**
   * Position the row of Claim/Challenge buttons. The scene passes Roll/Stand's
   * baseline Y so the swap is perfect — pixel-identical slot.
   */
  applyLayout(buttonRowY: number, dealerHeadY: number): void {
    this.buttonRowY = buttonRowY;
    this.coinBadge.position.set(BADGE_X, BADGE_Y);
    this.buttonsRow.position.set(REF_W / 2, buttonRowY);
    this.claimButton.position.set(-BUTTON_HALF_GAP, 0);
    this.challengeButton.position.set(BUTTON_HALF_GAP, 0);
    this.winPopupAnchorX = REF_W / 2;
    this.winPopupAnchorY = dealerHeadY;
    this.relayoutCoinBadge();
  }

  // ── Builders ─────────────────────────────────────────────────────────────

  private buildCoinBadge(coinTexture: Texture): void {
    this.coinBadge = new Container();
    this.coinBadgePill = new Graphics();
    this.coinBadge.addChild(this.coinBadgePill);
    this.coinBadgeIcon = new Sprite(coinTexture);
    this.coinBadgeIcon.anchor.set(0.5);
    this.coinBadgeIcon.width = BADGE_ICON_SIZE;
    this.coinBadgeIcon.height = BADGE_ICON_SIZE;
    this.coinBadge.addChild(this.coinBadgeIcon);
    this.coinBadgeText = new Text({ text: formatCoins(0), style: BADGE_TEXT_STYLE });
    this.coinBadgeText.anchor.set(0, 0.5);
    this.coinBadge.addChild(this.coinBadgeText);
    this.addChild(this.coinBadge);
  }

  private buildButtons(): void {
    this.buttonsRow = new Container();
    this.claimButton = this.makeButton('claim');
    this.challengeButton = this.makeButton('challenge');
    this.claimButton.on('pointertap', () => this.handlers.onClaim());
    this.challengeButton.on('pointertap', () => this.handlers.onChallenge());
    this.buttonsRow.addChild(this.claimButton);
    this.buttonsRow.addChild(this.challengeButton);
    this.addChild(this.buttonsRow);
  }

  private buildWinPopupLayer(): void {
    this.winPopupLayer = new Container();
    this.addChild(this.winPopupLayer);
    this.winPopupHandler = (t: Ticker) => this.updateWinPopup(t.deltaMS);
    this.ticker.add(this.winPopupHandler);
  }

  /**
   * Build a CLAIM or DOUBLE button using the Layer Lab "Convex Rectangle"
   * 9-slice texture (extracted from Unity, tinted at runtime). Layer order
   * back-to-front:
   *
   *   1. Glow halo (DOUBLE only) — cyan-tinted texture, slightly oversized,
   *      sits behind the pocket so it reads as a backlit rim.
   *   2. Pocket — dark-tinted texture, STATIC. The recess the face sits in.
   *   3. Face Container — what the user reads; holds the bright-tinted face
   *      sprite + label + sub-row. SLIDES DOWN on press so the pocket above
   *      becomes visible (selling the 3D "button pressed into socket" feel).
   *
   * The press is driven by translating the face only — no scaling, no Graphics
   * redraw. This matches the Pencil mockup at design/buttons.pen.
   */
  private makeButton(kind: 'claim' | 'challenge'): Container {
    const root = new Container();
    root.eventMode = 'none';
    root.cursor = 'pointer';

    const tints = kind === 'claim' ? CONVEX_TINTS.cta : CONVEX_TINTS.challenge;

    if (kind === 'challenge') {
      const glow = this.makeSlicedSprite(BUTTON_W + BUTTON_GLOW_INSET * 2, BUTTON_H + BUTTON_GLOW_INSET * 2);
      glow.tint = CONVEX_TINTS.challenge.glow;
      glow.alpha = 0.55;
      glow.position.set(-BUTTON_W / 2 - BUTTON_GLOW_INSET, -BUTTON_H / 2 - BUTTON_GLOW_INSET);
      root.addChild(glow);
    }

    const pocket = this.makeSlicedSprite(BUTTON_W, BUTTON_H);
    pocket.tint = tints.pocket;
    pocket.position.set(-BUTTON_W / 2, -BUTTON_H / 2);
    root.addChild(pocket);

    const face = new Container();
    root.addChild(face);

    const faceSprite = this.makeSlicedSprite(BUTTON_W, BUTTON_H);
    faceSprite.tint = tints.face;
    faceSprite.position.set(-BUTTON_W / 2, -BUTTON_H / 2);
    face.addChild(faceSprite);

    const label = new Text({
      text: kind === 'claim' ? 'CLAIM' : 'DOUBLE!',
      style: BUTTON_LABEL_STYLE,
    });
    label.anchor.set(0.5);
    label.position.set(0, -22);
    face.addChild(label);

    const sub = new Text({
      text: kind === 'claim' ? '+0' : '→ 160',
      style: BUTTON_SUB_STYLE,
    });
    sub.anchor.set(0, 0.5);
    face.addChild(sub);

    const coinIcon = new Sprite(this.coinTexture);
    coinIcon.anchor.set(0.5);
    coinIcon.width = BUTTON_COIN_SIZE;
    coinIcon.height = BUTTON_COIN_SIZE;
    face.addChild(coinIcon);

    if (kind === 'claim') {
      this.claimFace = face;
      this.claimLabel = label;
      this.claimSubLabel = sub;
      this.claimSubCoin = coinIcon;
    } else {
      this.challengeFace = face;
      this.challengeLabel = label;
      this.challengeSubLabel = sub;
      this.challengeSubCoin = coinIcon;
    }
    this.relayoutSubGroup(kind);

    // Press feedback — slide the face down into the pocket. Hover keeps the
    // tiny grow so desktop testing still gets a clear hover state; pointerdown
    // forces scale back to 1 so the press is a pure translation (no jiggle).
    root.on('pointerover', () => { if (this.buttonsRow.alpha === 1) face.scale.set(1.04); });
    root.on('pointerout', () => { face.scale.set(1); face.y = 0; });
    root.on('pointerdown', () => { face.scale.set(1); face.y = BUTTON_PRESS_DEPTH; });
    root.on('pointerupoutside', () => { face.scale.set(1); face.y = 0; });
    root.on('pointerup', () => { face.y = 0; });
    root.on('pointercancel', () => { face.scale.set(1); face.y = 0; });
    return root;
  }

  /** Create a NineSliceSprite at the given size from the shared button texture. */
  private makeSlicedSprite(w: number, h: number): NineSliceSprite {
    return makeConvexSlice(this.buttonTexture, this.buttonBorder, w, h);
  }

  private updateButtonLabels(currentAccumulated: number, nextReward: number): void {
    this.claimSubLabel.text = `+${formatCoins(currentAccumulated)}`;
    this.challengeSubLabel.text = `→ ${formatCoins(nextReward)}`;
    this.relayoutSubGroup('claim');
    this.relayoutSubGroup('challenge');
  }

  /** Center the coin+text group horizontally on the button at y=22. */
  private relayoutSubGroup(kind: 'claim' | 'challenge'): void {
    const coin = kind === 'claim' ? this.claimSubCoin : this.challengeSubCoin;
    const text = kind === 'claim' ? this.claimSubLabel : this.challengeSubLabel;
    const totalW = BUTTON_COIN_SIZE + BUTTON_COIN_GAP + text.width;
    const startX = -totalW / 2;
    coin.position.set(startX + BUTTON_COIN_SIZE / 2, 22);
    text.position.set(startX + BUTTON_COIN_SIZE + BUTTON_COIN_GAP, 22);
  }

  // ── Coin badge relayout (size grows with text length) ────────────────────

  private relayoutCoinBadge(): void {
    const textW = this.coinBadgeText.width;
    const innerW = BADGE_ICON_SIZE + BADGE_ICON_GAP + textW;
    const totalW = innerW + BADGE_PADDING_X * 2;
    const totalH = BADGE_ICON_SIZE + BADGE_PADDING_Y * 2;
    this.coinBadgePill.clear();
    this.coinBadgePill.roundRect(0, 0, totalW, totalH, totalH / 2);
    this.coinBadgePill.fill({ color: COIN_HUD_COLORS.pillBg, alpha: COIN_HUD_COLORS.pillBgAlpha });
    this.coinBadgePill.stroke({ color: COIN_HUD_COLORS.goldTint, width: 3, alignment: 1, alpha: 0.7 });
    const iconX = BADGE_PADDING_X + BADGE_ICON_SIZE / 2;
    const iconY = totalH / 2;
    this.coinBadgeIcon.position.set(iconX, iconY);
    this.coinBadgeText.position.set(iconX + BADGE_ICON_SIZE / 2 + BADGE_ICON_GAP, iconY);
  }

  // ── "+N" win popup ───────────────────────────────────────────────────────

  private spawnWinPopup(text: string): void {
    if (this.winPopupText) {
      this.winPopupLayer.removeChild(this.winPopupText);
      this.winPopupText.destroy();
    }
    this.winPopupText = new Text({ text, style: WIN_POPUP_STYLE });
    this.winPopupText.anchor.set(0.5);
    this.winPopupText.position.set(this.winPopupAnchorX, this.winPopupAnchorY);
    this.winPopupText.scale.set(0.6);
    this.winPopupLayer.addChild(this.winPopupText);
    this.winPopupLife = WIN_POPUP_LIFETIME_MS;
  }

  private updateWinPopup(deltaMS: number): void {
    try {
    if (!this.winPopupText || this.winPopupLife <= 0) return;
    this.winPopupLife -= deltaMS;
    const u = 1 - this.winPopupLife / WIN_POPUP_LIFETIME_MS;     // 0 → 1
    // Quick scale-in for the first 18% of life, then settle.
    const popPhase = Math.min(1, u / 0.18);
    const popScale = 0.6 + 0.6 * popPhase - 0.15 * Math.max(0, (popPhase - 0.7) / 0.3);
    this.winPopupText.scale.set(popScale);
    // Rise upward + fade out in the last 40%.
    this.winPopupText.y = this.winPopupAnchorY - WIN_POPUP_RISE_PX * u;
    this.winPopupText.alpha = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
    if (this.winPopupLife <= 0) {
      this.winPopupLayer.removeChild(this.winPopupText);
      this.winPopupText.destroy();
      this.winPopupText = null;
    }
    } catch {
      // Scene torn down mid-frame — never let a stray tick kill the shared ticker.
    }
  }

  // ── Challenge button breathing pulse ─────────────────────────────────────

  private startBreathing(): void {
    if (this.breatheHandler) return;
    this.breatheElapsed = 0;
    const PERIOD_MS = 850;
    this.breatheHandler = (t: Ticker) => {
      this.breatheElapsed += t.deltaMS;
      const phase = (this.breatheElapsed / PERIOD_MS) * Math.PI * 2;
      // Subtle ±4% pulse on the challenge button only — draws the eye to the
      // dopamine button without fighting the existing STAND-button pulse.
      const s = 1 + Math.sin(phase) * 0.04;
      this.challengeButton.scale.set(s);
    };
    this.ticker.add(this.breatheHandler);
  }

  private stopBreathing(): void {
    if (this.breatheHandler) {
      this.ticker.remove(this.breatheHandler);
      this.breatheHandler = null;
    }
    this.challengeButton.scale.set(1);
  }

  destroy(): void {
    this.stopBreathing();
    if (this.winPopupHandler) {
      this.ticker.remove(this.winPopupHandler);
      this.winPopupHandler = null;
    }
    super.destroy({ children: true });
  }
}

