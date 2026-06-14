import { Assets, Container, Graphics, Sprite, Text, TextStyle, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PlayerState, StatDelta } from '../PlayerState';
import { tween, delay } from '@shared/tween';
import { easeOutBack, easeOutQuad } from '@shared/easing';
import * as sfx from '../sfx';
import shopBgAData from 'assets/tiles/shop_bg_a.webp';
// Co-located: Power_Down.mp3 is only used here and in StatChangePopup, both
// codegen-gated, so it stays out of variants that don't reach those scenes.
import powerDownData from 'assets/Audio/Power_Down.mp3';
import shopBgBData from 'assets/tiles/shop_bg_b.webp';
import shopShelvesAData from 'assets/tiles/shop_shelves_a.webp';
import shopShelvesBData from 'assets/tiles/shop_shelves_b.webp';
import shopMerchantAData from 'assets/tiles/shop_merchant_a.webp';
import shopMerchantBData from 'assets/tiles/shop_merchant_b.webp';
import coinIconData from 'assets/UI/Coin.webp';

const FADE_IN_MS = 250;
const CARD_INTRO_MS = 350;
const CARD_INTRO_STAGGER_MS = 80;
const CARD_PRESS_MS = 100;

export interface ShopItem {
  kind: 'skill' | 'stat' | 'heal';
  /** Display label, e.g. "Fireball", "Max HP +20%", "Heal 30%". */
  label: string;
  /** Optional description below label. */
  description?: string;
  price: number;
  /** Effect applied on purchase. */
  effect: { coins?: number; hpPct?: number; atkPct?: number; skill?: string };
}

export interface ShopSceneConfig {
  /** Visual style. Default 'normal'. */
  style?: 'normal' | 'blackMarket';
  /** Items to offer. Up to 3. Subsequent rerolls regenerate from `rerollItems` if provided. */
  items: ShopItem[];
  /** Pool of items to draw fresh cards from on reroll. If omitted, reroll re-uses same items. */
  rerollItems?: ShopItem[];
  /** Base reroll price. Default 50. */
  baseRerollPrice?: number;
  /** Reroll price increment per use. Default 25. */
  rerollPriceIncrease?: number;
}

interface CardView {
  container: Container;
  bg: Graphics;
  iconContainer: Container;
  iconBg: Graphics;
  labelText: Text;
  descText: Text;
  priceText: Text;
  priceCoinIcon: Sprite;
  item: ShopItem;
  soldOut: boolean;
  /** Set true during the press animation to lock out double-clicks. */
  processing: boolean;
  baseScale: number;
}

export class ShopScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: ShopSceneConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private applyStatDelta: (delta: StatDelta) => StatDelta;
  private ready = false;

  // Resolved configuration
  private style: 'normal' | 'blackMarket' = 'normal';
  private baseRerollPrice = 50;
  private rerollPriceIncrease = 25;
  private rerollsMade = 0;
  private currentItems: ShopItem[] = [];

  // Visuals
  private bgSprite!: Sprite;
  private shelvesSprite!: Sprite;
  private merchantSprite!: Sprite;
  private cardLayer!: Container;
  private cards: CardView[] = [];
  private rerollButton!: Container;
  private rerollButtonBg!: Graphics;
  private rerollButtonText!: Text;
  private rerollCoinIcon!: Sprite;
  private exitButton!: Container;
  private exitButtonBg!: Graphics;
  private exitButtonText!: Text;
  private coinHud!: Container;
  private coinHudBg!: Graphics;
  private coinHudText!: Text;
  private coinHudIcon!: Sprite;

  // Cached textures
  private coinIconTexture: any = null;

  // Animation state
  private animElapsed = 0;
  private fadingOut = false;
  private fadeOutElapsed = 0;
  private lastDisplayedCoins = -1;
  /** Lock during reroll intro animation to prevent stacking. */
  private rerolling = false;

  constructor(
    config: ShopSceneConfig,
    state: PlayerState,
    ticker: Ticker,
    width: number,
    height: number,
    applyStatDelta: (delta: StatDelta) => StatDelta,
  ) {
    this.container = new Container();
    this.config = config;
    this.state = state;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.applyStatDelta = applyStatDelta;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    this.style = this.config.style ?? 'normal';
    this.baseRerollPrice = this.config.baseRerollPrice ?? 50;
    this.rerollPriceIncrease = this.config.rerollPriceIncrease ?? 25;
    this.currentItems = (this.config.items ?? []).slice(0, 3);

    // Pick assets per style
    const isBlack = this.style === 'blackMarket';
    const bgData = isBlack ? shopBgBData : shopBgAData;
    const shelvesData = isBlack ? shopShelvesBData : shopShelvesAData;
    const merchantData = isBlack ? shopMerchantBData : shopMerchantAData;

    // Load all in parallel
    const [bgTex, shelvesTex, merchantTex, coinTex] = await Promise.all([
      Assets.load(bgData),
      Assets.load(shelvesData),
      Assets.load(merchantData),
      Assets.load(coinIconData),
    ]);
    this.coinIconTexture = coinTex;

    // Background — centered, scaled-cover
    this.bgSprite = new Sprite(bgTex);
    this.bgSprite.anchor.set(0.5);
    this.container.addChild(this.bgSprite);

    // Shelves — top-left
    this.shelvesSprite = new Sprite(shelvesTex);
    this.shelvesSprite.anchor.set(0, 0);
    this.container.addChild(this.shelvesSprite);

    // Merchant — left middle
    this.merchantSprite = new Sprite(merchantTex);
    this.merchantSprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.merchantSprite);

    // Card layer
    this.cardLayer = new Container();
    this.container.addChild(this.cardLayer);

    // Build cards
    this.buildCards();

    // Reroll button
    this.rerollButton = new Container();
    this.rerollButtonBg = new Graphics();
    this.rerollButton.addChild(this.rerollButtonBg);
    this.rerollButtonText = new Text({
      text: 'REROLL  ',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 4, join: 'round' },
      }),
    });
    this.rerollButtonText.anchor.set(0.5);
    this.rerollButton.addChild(this.rerollButtonText);
    this.rerollCoinIcon = new Sprite(coinTex);
    this.rerollCoinIcon.anchor.set(0.5);
    this.rerollButton.addChild(this.rerollCoinIcon);
    this.rerollButton.eventMode = 'static';
    this.rerollButton.cursor = 'pointer';
    this.rerollButton.on('pointerdown', () => this.onRerollClick());
    this.container.addChild(this.rerollButton);

    // Exit button
    this.exitButton = new Container();
    this.exitButtonBg = new Graphics();
    this.exitButton.addChild(this.exitButtonBg);
    this.exitButtonText = new Text({
      text: 'EXIT',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 3, join: 'round' },
      }),
    });
    this.exitButtonText.anchor.set(0.5);
    this.exitButton.addChild(this.exitButtonText);
    this.exitButton.eventMode = 'static';
    this.exitButton.cursor = 'pointer';
    this.exitButton.on('pointerdown', () => this.onExitClick());
    this.container.addChild(this.exitButton);

    // Coin HUD top-right
    this.coinHud = new Container();
    this.coinHudBg = new Graphics();
    this.coinHud.addChild(this.coinHudBg);
    this.coinHudIcon = new Sprite(coinTex);
    this.coinHudIcon.anchor.set(0.5);
    this.coinHud.addChild(this.coinHudIcon);
    this.coinHudText = new Text({
      text: String(this.state.coins ?? 0),
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 3, join: 'round' },
      }),
    });
    this.coinHudText.anchor.set(0, 0.5);
    this.coinHud.addChild(this.coinHudText);
    this.container.addChild(this.coinHud);

    this.layoutScene();
    this.refreshPriceColors();
    this.updateRerollButton();
    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);
    this.animElapsed = 0;

    // Fade in
    this.container.alpha = 0;
    tween(this.ticker, FADE_IN_MS, t => { this.container.alpha = t; });

    // Card intro animation (staggered easeOutBack)
    this.playCardIntros();
  }

  async exit(): Promise<void> {}

  update(_deltaMS: number): void {
    if (!this.ready) return;

    // Live coin counter — re-read every frame
    const coins = this.state.coins ?? 0;
    if (coins !== this.lastDisplayedCoins) {
      this.lastDisplayedCoins = coins;
      this.coinHudText.text = String(coins);
      this.refreshPriceColors();
      this.updateRerollButton();
      this.layoutCoinHud();
    }
  }

  pause(): void {
    this.container.interactiveChildren = false;
  }

  resume(): void {
    this.container.interactiveChildren = true;
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) return;
    this.layoutScene();
  }

  // ---------- Card building ----------

  private buildCards(): void {
    // Clear any existing
    for (const c of this.cards) {
      this.cardLayer.removeChild(c.container);
      c.container.destroy({ children: true });
    }
    this.cards = [];

    for (const item of this.currentItems) {
      const cv = this.createCardView(item);
      this.cardLayer.addChild(cv.container);
      this.cards.push(cv);
    }
  }

  private createCardView(item: ShopItem): CardView {
    const container = new Container();
    const bg = new Graphics();
    container.addChild(bg);

    // Icon (placeholder colored square, kind-coded)
    const iconContainer = new Container();
    const iconBg = new Graphics();
    iconContainer.addChild(iconBg);
    container.addChild(iconContainer);

    const labelText = new Text({
      text: item.label,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 3, join: 'round' },
      }),
    });
    labelText.anchor.set(0, 0);
    container.addChild(labelText);

    const descText = new Text({
      text: item.description ?? '',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fill: 0xf0e8c8,
        wordWrap: true,
        wordWrapWidth: 140,
      }),
    });
    descText.anchor.set(0, 0);
    container.addChild(descText);

    const priceText = new Text({
      text: String(item.price),
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 3, join: 'round' },
      }),
    });
    priceText.anchor.set(1, 0.5);
    container.addChild(priceText);

    const priceCoinIcon = new Sprite(this.coinIconTexture);
    priceCoinIcon.anchor.set(0.5);
    container.addChild(priceCoinIcon);

    const cv: CardView = {
      container,
      bg,
      iconContainer,
      iconBg,
      labelText,
      descText,
      priceText,
      priceCoinIcon,
      item,
      soldOut: false,
      processing: false,
      baseScale: 1,
    };

    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.on('pointerdown', () => this.onCardClick(cv));

    return cv;
  }

  // ---------- Logic ----------

  private getRerollPrice(): number {
    return this.baseRerollPrice + this.rerollPriceIncrease * this.rerollsMade;
  }

  private async onCardClick(cv: CardView): Promise<void> {
    if (this.fadingOut || cv.soldOut || cv.processing) return;
    // Lock immediately so a fast double-tap during the press animation can't
    // trigger a second purchase before the first completes (Code-review #17).
    cv.processing = true;

    // Press animation: scale to 0.9 then back
    const baseScale = cv.baseScale;
    await tween(this.ticker, CARD_PRESS_MS, t => {
      const s = baseScale * (1 - 0.1 * t);
      cv.container.scale.set(s);
    }, 1, easeOutQuad);
    await tween(this.ticker, CARD_PRESS_MS, t => {
      const s = baseScale * (0.9 + 0.1 * t);
      cv.container.scale.set(s);
    }, 1, easeOutQuad);
    cv.container.scale.set(baseScale);

    const coins = this.state.coins ?? 0;
    if (coins < cv.item.price) {
      sfx.play(powerDownData, 1);
      cv.processing = false;
      return;
    }

    // Affordable — buy
    sfx.buttonClick();
    sfx.rewardReceived();

    // Deduct coins
    this.applyStatDelta({ coins: -cv.item.price });

    // Apply effect
    const eff = cv.item.effect ?? {};
    const delta: StatDelta = {};
    if (eff.coins != null) delta.coins = eff.coins;
    if (eff.hpPct != null) delta.hpPct = eff.hpPct;
    if (eff.atkPct != null) delta.atkPct = eff.atkPct;
    if (eff.skill != null) delta.skill = eff.skill;
    if (Object.keys(delta).length > 0) {
      this.applyStatDelta(delta);
    }

    // Mark sold-out: dim 50% + remove click handler
    cv.soldOut = true;
    cv.container.alpha = 0.5;
    cv.container.eventMode = 'none';
    cv.container.cursor = 'default';

    this.refreshPriceColors();
    this.updateRerollButton();
  }

  private async onRerollClick(): Promise<void> {
    if (this.fadingOut || this.rerolling) return;
    const price = this.getRerollPrice();
    const coins = this.state.coins ?? 0;
    if (coins < price) {
      sfx.play(powerDownData, 1);
      return;
    }

    // Lock to prevent rapid re-tap from charging multiple rerolls during intro animation.
    this.rerolling = true;

    sfx.buttonClick();
    this.applyStatDelta({ coins: -price });
    this.rerollsMade++;

    // Regenerate cards from rerollItems pool (or original items)
    const pool = this.config.rerollItems ?? this.config.items ?? [];
    const fresh = this.pickFromPool(pool, 3);
    this.currentItems = fresh;

    this.buildCards();
    this.layoutScene();
    this.refreshPriceColors();
    this.updateRerollButton();
    await this.playCardIntros();
    this.rerolling = false;
  }

  private pickFromPool(pool: ShopItem[], count: number): ShopItem[] {
    if (pool.length === 0) return [];
    const picked: ShopItem[] = [];
    const available = pool.slice();
    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length);
      picked.push(available[idx]);
      available.splice(idx, 1);
    }
    // If pool too small, allow repeats
    while (picked.length < count && pool.length > 0) {
      picked.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return picked;
  }

  private async onExitClick(): Promise<void> {
    if (this.fadingOut) return;
    this.fadingOut = true;
    sfx.buttonClick();
    await tween(this.ticker, FADE_IN_MS, t => { this.container.alpha = 1 - t; });
    this.resolveDone();
  }

  private refreshPriceColors(): void {
    const coins = this.state.coins ?? 0;
    for (const cv of this.cards) {
      if (cv.soldOut) continue;
      const affordable = coins >= cv.item.price;
      cv.priceText.style.fill = affordable ? 0xffffff : 0xff4d64;
    }
  }

  private updateRerollButton(): void {
    const price = this.getRerollPrice();
    this.rerollButtonText.text = `REROLL  ${price}`;
    const coins = this.state.coins ?? 0;
    const affordable = coins >= price;
    // Re-draw button bg with correct color
    if (this.rerollButtonBg) {
      const col = affordable ? 0xd4a437 : 0xb33a4a;
      const stroke = affordable ? 0x6b4f12 : 0x5c1922;
      const w = Math.max(this.rerollButtonText.width + 60, 180);
      const h = this.rerollButtonText.style.fontSize as number * 1.8;
      this.rerollButtonBg.clear();
      this.rerollButtonBg.roundRect(-w / 2, -h / 2, w, h, h / 4)
        .fill({ color: col })
        .stroke({ color: stroke, width: 3 });
      // Coin icon at right end of label
      const iconSize = (this.rerollButtonText.style.fontSize as number) * 0.9;
      this.rerollCoinIcon.scale.set(iconSize / Math.max(this.rerollCoinIcon.texture.width, this.rerollCoinIcon.texture.height));
      this.rerollCoinIcon.position.set(this.rerollButtonText.width / 2 + 4, 0);
    }
  }

  // ---------- Layout ----------

  private layoutScene(): void {
    const w = this.width;
    const h = this.height;
    const vScale = Math.min(w / 1080, h / 1920);

    // Background — scaled with vScale (matches the rest of the scene). Cover-fit would
    // zoom the BG independently of merchant/shelves/cards which all use Math.min(w,h) ratios.
    const bgTex = this.bgSprite.texture;
    const refScale = Math.max(1080 / bgTex.width, 1920 / bgTex.height);
    this.bgSprite.scale.set(refScale * vScale);
    this.bgSprite.position.set(w / 2, h / 2);

    // Shelves — top-left, scaled to ~50% of width
    const shelvesTex = this.shelvesSprite.texture;
    const shelvesW = Math.min(w * 0.5, 360);
    const shelvesScale = shelvesW / shelvesTex.width;
    this.shelvesSprite.scale.set(shelvesScale);
    this.shelvesSprite.position.set(8, 8);

    // Merchant — ~250x250, left middle
    const merchantTex = this.merchantSprite.texture;
    const merchantSize = Math.min(250, Math.min(w, h) * 0.4);
    const merchantScale = merchantSize / Math.max(merchantTex.width, merchantTex.height);
    this.merchantSprite.scale.set(merchantScale);
    const merchantX = merchantSize / 2 + 12;
    const merchantY = h / 2;
    this.merchantSprite.position.set(merchantX, merchantY);

    // Cards: vertical stack on right, OR side-by-side on landscape if room.
    // Sizes scale linearly with viewport (matches LuckyWheelScene/FightScene convention).
    const isLandscape = w > h;
    const cardW = 220 * Math.max(0.65, vScale);
    const cardH = 90 * Math.max(0.65, vScale);
    const cardGap = 14 * Math.max(0.65, vScale);

    let cardLeftX: number;
    let cardTopY: number;
    let cardsHorizontal = false;

    if (isLandscape && w >= 800) {
      // Side-by-side along the bottom
      cardsHorizontal = true;
      const total = this.cards.length * cardW + Math.max(0, this.cards.length - 1) * cardGap;
      cardLeftX = (w - total) / 2;
      cardTopY = h * 0.5;
    } else {
      // Vertical stack on right
      cardsHorizontal = false;
      cardLeftX = w - cardW - 16;
      const totalH = this.cards.length * cardH + Math.max(0, this.cards.length - 1) * cardGap;
      cardTopY = (h - totalH) / 2;
    }

    for (let i = 0; i < this.cards.length; i++) {
      const cv = this.cards[i];
      const x = cardsHorizontal
        ? cardLeftX + i * (cardW + cardGap)
        : cardLeftX;
      const y = cardsHorizontal
        ? cardTopY
        : cardTopY + i * (cardH + cardGap);
      this.layoutCard(cv, x, y, cardW, cardH);
    }

    // Reroll button — bottom-center-ish
    const rerollFont = Math.max(18, Math.min(w, h) * 0.04);
    this.rerollButtonText.style.fontSize = rerollFont;
    this.updateRerollButton();
    const rerollX = isLandscape ? w * 0.5 : w * 0.35;
    const rerollY = h - 40;
    this.rerollButton.position.set(rerollX, rerollY);

    // Exit button bottom-right
    const exitFont = Math.max(16, Math.min(w, h) * 0.035);
    this.exitButtonText.style.fontSize = exitFont;
    const exitW = Math.max(this.exitButtonText.width + 40, 90);
    const exitH = exitFont * 2;
    this.exitButtonBg.clear();
    this.exitButtonBg.roundRect(-exitW / 2, -exitH / 2, exitW, exitH, exitH / 4)
      .fill({ color: 0x444444, alpha: 0.9 })
      .stroke({ color: 0x000000, width: 2 });
    this.exitButton.position.set(w - exitW / 2 - 12, rerollY);

    // Coin HUD top-right
    this.layoutCoinHud();
  }

  private layoutCard(cv: CardView, x: number, y: number, w: number, h: number): void {
    cv.baseScale = 1;
    // Pivot at center for consistent scale animation
    cv.container.pivot.set(w / 2, h / 2);
    cv.container.position.set(x + w / 2, y + h / 2);

    // Card background — tan #ABA165
    cv.bg.clear();
    cv.bg.roundRect(0, 0, w, h, 12)
      .fill({ color: 0xaba165 })
      .stroke({ color: 0xffffff, width: 2 });

    // Icon top-left (50x50)
    const iconSize = 50;
    const iconColor = cv.item.kind === 'skill'
      ? 0x5a8cff
      : cv.item.kind === 'heal'
        ? 0x55cc66
        : 0xcc7755;
    cv.iconBg.clear();
    cv.iconBg.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 8)
      .fill({ color: iconColor })
      .stroke({ color: 0x222222, width: 2 });
    cv.iconContainer.position.set(8 + iconSize / 2, 8 + iconSize / 2);

    // Label text: top-right of icon
    const labelFont = 18;
    cv.labelText.style.fontSize = labelFont;
    cv.labelText.position.set(8 + iconSize + 8, 6);

    // Description below label
    const descFont = 12;
    cv.descText.style.fontSize = descFont;
    cv.descText.style.wordWrapWidth = w - (iconSize + 24);
    cv.descText.position.set(8 + iconSize + 8, 6 + labelFont + 4);

    // Price text + coin icon, bottom-right
    const priceFont = 18;
    cv.priceText.style.fontSize = priceFont;
    const coinSize = priceFont * 1.1;
    const coinTex = cv.priceCoinIcon.texture;
    cv.priceCoinIcon.scale.set(coinSize / Math.max(coinTex.width, coinTex.height));
    // Position: coin on far right, price text to its left
    const priceY = h - 14;
    cv.priceCoinIcon.position.set(w - 10 - coinSize / 2, priceY);
    cv.priceText.position.set(w - 10 - coinSize - 4, priceY);
  }

  private layoutCoinHud(): void {
    const w = this.width;
    const fontSize = 22;
    this.coinHudText.style.fontSize = fontSize;
    const padding = 10;
    const iconSize = fontSize * 1.2;
    const coinTex = this.coinHudIcon.texture;
    this.coinHudIcon.scale.set(iconSize / Math.max(coinTex.width, coinTex.height));

    const textW = this.coinHudText.width;
    const innerW = iconSize + 6 + textW;
    const hudW = innerW + padding * 2;
    const hudH = Math.max(iconSize, fontSize) + padding;

    this.coinHudBg.clear();
    this.coinHudBg.roundRect(0, 0, hudW, hudH, hudH / 3)
      .fill({ color: 0x000000, alpha: 0.55 })
      .stroke({ color: 0xffffff, width: 2 });

    this.coinHudIcon.position.set(padding + iconSize / 2, hudH / 2);
    this.coinHudText.position.set(padding + iconSize + 6, hudH / 2);

    this.coinHud.position.set(w - hudW - 10, 10);
  }

  // ---------- Card intro animations ----------

  /** Stagger card entrance animations using ticker-driven delay (NOT setTimeout —
   *  setTimeout fires after scene exit and would touch destroyed containers). */
  private async playCardIntros(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.cards.length; i++) {
      const cv = this.cards[i];
      const delayMs = i * CARD_INTRO_STAGGER_MS;
      const startScale = 0.5;
      cv.container.scale.set(startScale);
      cv.container.alpha = 0;
      promises.push((async () => {
        if (delayMs > 0) await delay(this.ticker, delayMs);
        if (this.fadingOut) return;
        await tween(this.ticker, CARD_INTRO_MS, t => {
          const s = startScale + (1 - startScale) * easeOutBack(t);
          cv.container.scale.set(s);
          cv.container.alpha = t;
        });
      })());
    }
    await Promise.all(promises);
  }
}
