import { Assets, Container, Graphics, Sprite, Text, TextStyle, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { SkillConfig } from './skillTypes';
import { RARITY_COLORS } from './skillTypes';
import { SpineCharacter } from '@shared/SpineCharacter';
import { sfx } from '../sfx';
import { CoachHand } from '../ui/CoachHand';

import { heroBundle } from '../catalog/hero';
import glowRaysData from 'assets/UI/GlowRays.webp';

// Back-out overshoot easing for the banner pop.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export interface LevelUpPlayerState {
  heroSkin: string;
  weaponConfig: null;
  skills: string[];
}

const DIM_ALPHA = 0.85;
const BANNER_COLOR = 0xF5C842;
const BANNER_ARROW_COLOR = 0xD4A830;

const CARD_STAGGER_DELAY = 80;
const CARD_ANIM_DURATION = 150;
const CARD_OVERSHOOT = 1.08;

const CIRCLE_ACTIVE_COLOR = 0xE8783A;
const CIRCLE_PENDING_COLOR = 0x8B7BA8;
const CARD_EXIT_MS = 150;

export interface LevelUpSceneConfig {
  skills: SkillConfig[][];
  layout?: 'vertical' | 'horizontal';
  showCoach?: boolean;
  onSkillPicked?: () => void;
}

interface CardElements {
  card: Container;
  bg: Graphics;
  badge: Container;
  badgeBg: Graphics;
  badgeText: Text;
  iconBorder: Graphics;
  iconSprite: Sprite | null;
  iconSprite2: Sprite | null;
  iconPlaceholder: Graphics | null;
  nameText: Text;
  descText: Text;
  accentBar: Graphics;
  shineMask: Graphics | null;
  shineStrip: Graphics | null;
  tierDots: Graphics | null;
  tierDotPulse: Graphics | null;
  hitOverlay: Graphics;
  skill: SkillConfig;
}

export class LevelUpScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: LevelUpSceneConfig;
  private state: LevelUpPlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private ready = false;

  private dimOverlay!: Graphics;
  private heroClip!: Container;
  private heroClipMask!: Graphics;
  private glowSprite!: Sprite;
  private hero!: SpineCharacter;
  private bannerContainer!: Container;
  private bannerBg!: Graphics;
  private bannerText!: Text;
  private subtitleText!: Text;
  private cardsContainer!: Container;
  private animElapsed = 0;

  private totalRounds: number = 1;
  private currentRound = 0;
  private roundCards: CardElements[][] = [];
  private circleContainer!: Container;
  private circles: Graphics[] = [];
  private circleTexts: Text[] = [];
  private swapPhase: 'idle' | 'exiting' | 'entering' = 'idle';
  private swapElapsed = 0;
  private coach: CoachHand | null = null;
  private promptText!: Text;
  private coachTargets: { x: number; y: number }[] = [];
  private cardsBottomY = 0;

  private get cards(): CardElements[] {
    return this.roundCards[this.currentRound] ?? [];
  }

  constructor(
    config: LevelUpSceneConfig,
    state: LevelUpPlayerState,
    ticker: Ticker,
    width: number,
    height: number,
  ) {
    this.container = new Container();
    this.config = config;
    this.state = state;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.totalRounds = config.skills.length;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    sfx.levelUp();

    this.dimOverlay = new Graphics();
    this.drawDimOverlay();
    this.container.addChild(this.dimOverlay);

    this.heroClip = new Container();
    this.heroClipMask = new Graphics();
    this.heroClip.mask = this.heroClipMask;
    this.container.addChild(this.heroClip);
    this.container.addChild(this.heroClipMask);

    const glowTexture = await Assets.load(glowRaysData);
    this.glowSprite = new Sprite(glowTexture);
    this.glowSprite.anchor.set(0.5);
    this.glowSprite.tint = 0xffdd44;
    this.glowSprite.alpha = 0.7;
    this.heroClip.addChild(this.glowSprite);

    this.hero = await SpineCharacter.create('levelUpHero',
      heroBundle,
      this.ticker,
      { skin: this.state.heroSkin, animation: 'Idle' },
    );
    this.hero.facingLeft = false;
    this.heroClip.addChild(this.hero.spine);

    this.bannerContainer = new Container();
    this.bannerBg = new Graphics();
    this.bannerContainer.addChild(this.bannerBg);

    this.bannerText = new Text({
      text: 'POWER UP!',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    this.bannerText.anchor.set(0.5);
    this.bannerContainer.addChild(this.bannerText);
    this.container.addChild(this.bannerContainer);

    this.subtitleText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        dropShadow: {
          color: 0x000000,
          blur: 4,
          distance: 2,
          angle: Math.PI / 4,
        },
      }),
    });
    this.subtitleText.anchor.set(0.5);
    this.container.addChild(this.subtitleText);

    // Gentle "Choose an upgrade!" nudge below the cards (kept subtle, not eye-catching).
    this.promptText = new Text({
      text: 'Choose an upgrade!',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        dropShadow: { color: 0x000000, blur: 4, distance: 2, angle: Math.PI / 4 },
      }),
    });
    this.promptText.anchor.set(0.5);
    this.promptText.alpha = 0.7;
    this.container.addChild(this.promptText);

    this.circleContainer = new Container();

    if (this.totalRounds > 1) {
      this.buildCircles();
      this.container.addChild(this.circleContainer);
    }

    this.cardsContainer = new Container();
    this.container.addChild(this.cardsContainer);

    const iconLoads: Promise<unknown>[] = [];

    for (const round of this.config.skills) {
      for (const skill of round) {
        if (skill.icon) {
          iconLoads.push(Assets.load(skill.icon));
        }
      }
    }
    await Promise.all(iconLoads);

    for (let r = 0; r < this.totalRounds; r++) {
      const roundSkills = this.config.skills[r];
      const roundCardList: CardElements[] = [];

      for (let i = 0; i < roundSkills.length; i++) {
        const card = await this.buildCard(roundSkills[i], i);
        roundCardList.push(card);
      }

      this.roundCards.push(roundCardList);
    }

    for (const c of this.roundCards[0]) {
      this.cardsContainer.addChild(c.card);
    }

    this.layoutAll();

    for (const c of this.cards) {
      c.card.scale.set(0);
      c.card.visible = false;
    }

    this.bannerContainer.scale.set(0); // punch-in (driven in update)

    if (this.config.showCoach) {
      await CoachHand.preload();
      this.coach = new CoachHand();
      this.container.addChild(this.coach);
      this.pointCoachAtFirstCard();
    }

    this.animElapsed = 0;
    this.ready = true;
  }

  async exit(): Promise<void> {}

  update(deltaMS: number): void {
    if (!this.ready) {
      return;
    }

    // Banner punch-in (overshoot) + coach-hand tap pulse.
    const bannerT = Math.min(1, this.animElapsed / 240);
    this.bannerContainer.scale.set(easeOutBack(bannerT));
    this.coach?.update(deltaMS);

    // Subtle breathe on the "Choose an upgrade!" prompt — present, not loud.
    this.promptText.alpha = 0.62 + 0.12 * Math.sin(this.animElapsed * 0.004);

    if (this.swapPhase === 'exiting') {
      this.swapElapsed += deltaMS;
      const t = Math.min(this.swapElapsed / CARD_EXIT_MS, 1);
      const ease = t * t;
      const s = 1 - ease;

      for (const c of this.roundCards[this.currentRound]) {
        c.card.scale.set(s);
      }

      if (t >= 1) {
        for (const c of this.roundCards[this.currentRound]) {
          this.cardsContainer.removeChild(c.card);
        }

        this.currentRound++;
        this.updateCircleColors();

        for (const c of this.cards) {
          c.card.scale.set(0);
          c.card.visible = false;
          this.cardsContainer.addChild(c.card);
        }

        this.layoutAll();
        this.swapPhase = 'entering';
        this.animElapsed = 0;
      }

      return;
    }

    if (this.swapPhase === 'entering') {
      this.swapPhase = 'idle';
    }

    this.animElapsed += deltaMS;
    const cardCount = this.cards.length;
    const totalDuration = CARD_STAGGER_DELAY * (cardCount - 1) + CARD_ANIM_DURATION;

    if (this.animElapsed < totalDuration) {
      for (let i = 0; i < cardCount; i++) {
        const start = i * CARD_STAGGER_DELAY;
        const t = (this.animElapsed - start) / CARD_ANIM_DURATION;

        if (t <= 0) {
          continue;
        }

        this.cards[i].card.visible = true;

        if (t >= 1) {
          this.cards[i].card.scale.set(1);
        } else {
          const s = 1 - (1 - t) * (1 - t);
          const scale = s * CARD_OVERSHOOT - (s * (CARD_OVERSHOOT - 1)) * s;
          this.cards[i].card.scale.set(scale);
        }
      }
    }

    const pulseAlpha = 0.65 + 0.35 * Math.sin(this.animElapsed * 0.004);

    for (const c of this.cards) {
      if (c.tierDotPulse) {
        c.tierDotPulse.alpha = pulseAlpha;
      }
    }

    this.glowSprite.rotation += deltaMS * 0.00015;

    const SHINE_PERIOD = 2000;
    const SHINE_DURATION = 600;
    const phase = (this.animElapsed % SHINE_PERIOD) / SHINE_DURATION;

    for (const c of this.cards) {
      if (!c.shineStrip) {
        continue;
      }

      if (phase > 1) {
        c.shineStrip.visible = false;
      } else {
        c.shineStrip.visible = true;
        const cardW = c.bg.width;
        c.shineStrip.x = -cardW * 0.3 + phase * cardW * 1.6;
      }
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

    if (!this.ready) {
      return;
    }

    this.drawDimOverlay();
    this.layoutAll();
    this.pointCoachAtFirstCard();
  }

  private pointCoachAtFirstCard(): void {
    if (!this.coach || this.coachTargets.length === 0) {
      return;
    }

    this.coach.pointAtMany(this.coachTargets);
  }

  private drawDimOverlay(): void {
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: DIM_ALPHA });
  }

  private buildCircles(): void {
    const ref = Math.min(this.width, this.height);
    const diam = ref * 0.05;
    const r = diam / 2;
    const gap = diam * 0.4;
    const totalW = this.totalRounds * diam + (this.totalRounds - 1) * gap;
    const startX = -totalW / 2 + r;

    for (let i = 0; i < this.totalRounds; i++) {
      const g = new Graphics();
      const color = i === 0 ? CIRCLE_ACTIVE_COLOR : CIRCLE_PENDING_COLOR;
      g.circle(0, 0, r).fill({ color });
      g.position.set(startX + i * (diam + gap), 0);

      if (i > 0) {
        g.alpha = 0.6;
      }

      this.circleContainer.addChild(g);
      this.circles.push(g);

      const numText = new Text({
        text: String(i + 1),
        style: new TextStyle({
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          fill: 0xffffff,
          fontSize: diam * 0.55,
        }),
      });
      numText.anchor.set(0.5);
      numText.position.set(startX + i * (diam + gap), 0);

      if (i > 0) {
        numText.alpha = 0.6;
      }

      this.circleContainer.addChild(numText);
      this.circleTexts.push(numText);
    }
  }

  private updateCircleColors(): void {
    const ref = Math.min(this.width, this.height);
    const r = ref * 0.05 / 2;

    for (let i = 0; i < this.circles.length; i++) {
      const g = this.circles[i];
      g.clear();
      const color = i <= this.currentRound ? CIRCLE_ACTIVE_COLOR : CIRCLE_PENDING_COLOR;
      g.circle(0, 0, r).fill({ color });
      const isActive = i <= this.currentRound;
      g.alpha = isActive ? 1 : 0.6;
      this.circleTexts[i].alpha = isActive ? 1 : 0.6;
    }
  }

  private async buildCard(skill: SkillConfig, _index: number): Promise<CardElements> {
    const colors = RARITY_COLORS[skill.rarity];
    const card = new Container();

    const bg = new Graphics();
    card.addChild(bg);

    const accentBar = new Graphics();
    card.addChild(accentBar);

    const iconBorder = new Graphics();
    card.addChild(iconBorder);

    let iconSprite: Sprite | null = null;
    let iconSprite2: Sprite | null = null;
    let iconPlaceholder: Graphics | null = null;

    if (skill.icon) {
      const tex = await Assets.load(skill.icon);
      iconSprite = new Sprite(tex);
      iconSprite.anchor.set(0.5);
      card.addChild(iconSprite);
    } else {
      iconPlaceholder = new Graphics();
      card.addChild(iconPlaceholder);
    }

    const badge = new Container();
    const badgeBg = new Graphics();
    badge.addChild(badgeBg);

    const rarityLabel = skill.rarity.charAt(0).toUpperCase() + skill.rarity.slice(1);
    const badgeText = new Text({
      text: rarityLabel,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        fontSize: 12,
      }),
    });
    badgeText.anchor.set(0.5);
    badge.addChild(badgeText);
    card.addChild(badge);

    const nameText = new Text({
      text: skill.name,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 3, join: 'round' },
      }),
    });
    card.addChild(nameText);

    const descText = new Text({
      text: skill.description,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontWeight: '900',
        fill: 0x444444,
        wordWrap: true,
      }),
    });
    card.addChild(descText);

    let shineMask: Graphics | null = null;
    let shineStrip: Graphics | null = null;

    if (skill.rarity === 'mythic') {
      shineMask = new Graphics();
      shineStrip = new Graphics();
      shineStrip.mask = shineMask;
      card.addChild(shineMask);
      card.addChild(shineStrip);
    }

    let tierDots: Graphics | null = null;
    let tierDotPulse: Graphics | null = null;

    if (skill.family && skill.tier) {
      tierDots = new Graphics();
      card.addChild(tierDots);
      tierDotPulse = new Graphics();
      card.addChild(tierDotPulse);
    }

    const hitOverlay = new Graphics();
    hitOverlay.eventMode = 'static';
    hitOverlay.cursor = 'pointer';
    hitOverlay.on('pointerdown', () => {
      if (this.swapPhase !== 'idle') {
        return;
      }

      this.coach?.hide();
      sfx.buttonClick();
      this.state.skills.push(skill.id);
      this.config.onSkillPicked?.();

      if (this.currentRound < this.totalRounds - 1) {
        this.swapPhase = 'exiting';
        this.swapElapsed = 0;
      } else {
        this.resolveDone();
      }
    });
    card.addChild(hitOverlay);

    return {
      card, bg, badge, badgeBg, badgeText, iconBorder,
      iconSprite, iconSprite2, iconPlaceholder, nameText, descText,
      accentBar, shineMask, shineStrip, tierDots, tierDotPulse, hitOverlay, skill,
    };
  }

  private layoutAll(): void {
    const cx = this.width / 2;
    const ref = Math.min(this.width, this.height);
    const isLandscape = this.width > this.height;

    const bannerW = this.width * 0.85;
    const bannerH = ref * 0.065;
    const bannerY = this.height * (isLandscape ? 0.38 : 0.27);

    const heroScale = ref / 2300;
    const heroY = bannerY + bannerH * 0.7;
    this.hero.spine.scale.set(heroScale);
    this.hero.spine.position.set(cx, heroY);

    const clipBottom = bannerY - bannerH * 0.3;
    this.heroClipMask.clear();
    this.heroClipMask.rect(0, 0, this.width, clipBottom).fill({ color: 0xffffff });

    const glowCenterY = heroY - heroScale * 350;
    const glowSize = ref * 0.6;
    const glowTexSize = Math.max(this.glowSprite.texture.width, this.glowSprite.texture.height);
    this.glowSprite.scale.set(glowSize / glowTexSize);
    this.glowSprite.position.set(cx, glowCenterY);
    const arrowW = bannerH * 0.6;

    this.bannerBg.clear();
    this.bannerBg.roundRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 4)
      .fill({ color: BANNER_COLOR });
    this.bannerBg.poly([
      -bannerW / 2 - arrowW, 0,
      -bannerW / 2, -bannerH / 2,
      -bannerW / 2, bannerH / 2,
    ]).fill({ color: BANNER_ARROW_COLOR });
    this.bannerBg.poly([
      bannerW / 2 + arrowW, 0,
      bannerW / 2, -bannerH / 2,
      bannerW / 2, bannerH / 2,
    ]).fill({ color: BANNER_ARROW_COLOR });

    const bannerFontSize = Math.max(18, ref * 0.05);
    this.bannerText.style.fontSize = bannerFontSize;
    (this.bannerText.style as TextStyle).stroke = { color: 0x000000, width: Math.max(2, bannerFontSize * 0.1) };
    this.bannerText.position.set(0, 0);
    this.bannerContainer.position.set(cx, bannerY);

    this.subtitleText.visible = false;

    const circleDiam = ref * 0.05;
    this.circleContainer.visible = !isLandscape;
    const belowBannerY = bannerY + bannerH / 2 + ref * 0.02;
    let cardsStartY: number;

    if (isLandscape) {
      cardsStartY = bannerY + bannerH / 2 + 8;
    } else if (this.totalRounds > 1) {
      const circleRowY = belowBannerY + circleDiam * 0.8;
      this.circleContainer.position.set(cx, circleRowY);
      this.relayoutCircles();
      cardsStartY = circleRowY + circleDiam * 1.5;
    } else {
      cardsStartY = belowBannerY + ref * 0.03;
    }

    const currentCards = this.cards;
    const useHorizontal = this.config.layout === 'horizontal' || (this.config.layout !== 'vertical' && isLandscape);

    if (useHorizontal) {
      this.layoutCardsHorizontal(currentCards, cardsStartY);
    } else {
      this.layoutCardsVertical(currentCards, cardsStartY);
    }

    const promptFont = Math.max(13, ref * 0.032);
    this.promptText.style.fontSize = promptFont;
    this.promptText.position.set(cx, Math.min(this.cardsBottomY + ref * 0.05, this.height - ref * 0.04));
  }

  private layoutCardsVertical(currentCards: CardElements[], cardsStartY: number): void {
    const cardW = this.width * 0.82;
    const cardH = 100;
    const iconSize = 72;
    const cardPadding = 8;
    const nameFontSize = 20;
    const descFontSize = 12;
    const badgeFontSize = 11;
    const cornerR = 8;
    const cardGap = 25;

    let yOffset = 0;

    for (let i = 0; i < currentCards.length; i++) {
      const c = currentCards[i];
      const colors = RARITY_COLORS[c.skill.rarity];

      c.bg.clear();
      c.bg.roundRect(0, 0, cardW, cardH, cornerR)
        .fill({ color: colors.cardBg })
        .stroke({ color: 0x000000, width: 1.5 });

      const iconX = cardPadding;
      const iconY = (cardH - iconSize) / 2 - 8;
      c.iconBorder.clear();
      const iconBorderW = 3.5;
      const iconOutW = 1.5;
      const iconTotalW = iconBorderW + iconOutW;
      c.iconBorder.roundRect(iconX - iconTotalW, iconY - iconTotalW, iconSize + iconTotalW * 2, iconSize + iconTotalW * 2, 8)
        .fill({ color: 0x000000 });
      c.iconBorder.roundRect(iconX - iconBorderW, iconY - iconBorderW, iconSize + iconBorderW * 2, iconSize + iconBorderW * 2, 7)
        .fill({ color: colors.skillBorder });
      c.iconBorder.roundRect(iconX, iconY, iconSize, iconSize, 6)
        .fill({ color: colors.skillBg });

      if (c.iconSprite) {
        const tex = c.iconSprite.texture;
        const iconScale = (iconSize * 0.8) / Math.max(tex.width, tex.height);
        c.iconSprite.scale.set(iconScale);
        c.iconSprite.position.set(iconX + iconSize / 2, iconY + iconSize / 2);
      } else if (c.iconPlaceholder) {
        c.iconPlaceholder.clear();
        const inset = iconSize * 0.15;
        c.iconPlaceholder.roundRect(
          iconX + inset, iconY + inset,
          iconSize - inset * 2, iconSize - inset * 2, 4,
        ).fill({ color: colors.accent, alpha: 0.3 });
      }

      if (c.tierDots && c.tierDotPulse && c.skill.family && c.skill.tier) {
        c.tierDots.clear();
        c.tierDotPulse.clear();
        const dotR = 4;
        const dotGap = 3;
        const totalDots = 3;
        const totalDotsW = totalDots * dotR * 2 + (totalDots - 1) * dotGap;
        const dotStartX = iconX + iconSize / 2 - totalDotsW / 2 + dotR;
        const dotY = iconY + iconSize + dotR + 8;
        const lastFilled = c.skill.tier - 1;

        for (let d = 0; d < totalDots; d++) {
          const dx = dotStartX + d * (dotR * 2 + dotGap);

          if (d < c.skill.tier) {
            if (d === lastFilled) {
              c.tierDots.circle(dx, dotY, dotR).fill({ color: 0x1a1a3e }).stroke({ color: 0x000000, width: 1 });
              c.tierDotPulse.circle(dx, dotY, dotR).fill({ color: BANNER_COLOR });
            } else {
              c.tierDots.circle(dx, dotY, dotR).fill({ color: BANNER_COLOR }).stroke({ color: 0x000000, width: 1 });
            }
          } else {
            c.tierDots.circle(dx, dotY, dotR).fill({ color: 0x1a1a3e }).stroke({ color: 0x000000, width: 1 });
          }
        }
      }

      const badgePadH = badgeFontSize * 0.4;
      const badgePadW = badgeFontSize * 0.8;
      c.badgeText.style.fontSize = badgeFontSize;
      const badgeW = c.badgeText.width + badgePadW * 2;
      const badgeH = badgeFontSize + badgePadH * 2;
      c.badgeBg.clear();
      const badgeBorderW = 1.5;
      const badgeOutW = 1;
      const badgeTotalW = badgeBorderW + badgeOutW;
      c.badgeBg.roundRect(-badgeW / 2 - badgeTotalW, -badgeH / 2 - badgeTotalW, badgeW + badgeTotalW * 2, badgeH + badgeTotalW * 2, 6)
        .fill({ color: 0x000000 });
      c.badgeBg.roundRect(-badgeW / 2 - badgeBorderW, -badgeH / 2 - badgeBorderW, badgeW + badgeBorderW * 2, badgeH + badgeBorderW * 2, 5)
        .fill({ color: colors.skillBorder });
      c.badgeBg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 4)
        .fill({ color: colors.badge });
      c.badgeText.position.set(0, 0);
      c.badge.position.set(iconX + iconSize / 2, iconY - badgeH * 0.15);

      const bandX = iconX + iconSize + cardPadding;
      const stripH = nameFontSize + 6;
      c.accentBar.clear();
      c.accentBar
        .roundRect(0, 0, cardW, stripH, cornerR)
        .fill({ color: colors.skillBg })
        .stroke({ color: 0x000000, width: 1.5 });

      c.nameText.anchor.set(0, 0);
      c.nameText.style.fontSize = nameFontSize;
      c.nameText.position.set(bandX + cardPadding, (stripH - nameFontSize) / 2 - 4);

      c.descText.visible = true;
      c.descText.style.fontSize = descFontSize;
      c.descText.style.wordWrapWidth = cardW - bandX - cardPadding * 2;
      c.descText.position.set(bandX + cardPadding, stripH + cardPadding - 4);

      if (c.shineMask && c.shineStrip) {
        c.shineMask.clear();
        c.shineMask.roundRect(0, 0, cardW, cardH, cornerR).fill({ color: 0xffffff });
        const stripW = cardW * 0.15;
        c.shineStrip.clear();
        c.shineStrip.poly([
          0, 0,
          stripW, 0,
          stripW - cardH * 0.4, cardH,
          -cardH * 0.4, cardH,
        ]).fill({ color: 0xffffff, alpha: 0.25 });
      }

      c.hitOverlay.clear();
      c.hitOverlay.rect(0, 0, cardW, cardH).fill({ color: 0x000000, alpha: 0.001 });

      c.card.pivot.set(cardW / 2, cardH / 2);
      c.card.position.set(this.width / 2, yOffset + cardH / 2);

      yOffset += cardH + cardGap;
    }

    this.cardsContainer.position.set(0, cardsStartY);

    const lastCard = currentCards[currentCards.length - 1];
    this.cardsBottomY = cardsStartY + (lastCard?.card.position.y ?? 0) + cardH / 2;
    // Coach points at the LOWER part of each card so the fingertip never covers the icon.
    this.coachTargets = currentCards.map(c => ({
      x: c.card.position.x,
      y: cardsStartY + c.card.position.y + cardH * 0.28,
    }));
  }

  private layoutCardsHorizontal(currentCards: CardElements[], cardsStartY: number): void {
    const cardCount = currentCards.length;
    const ref = Math.min(this.width, this.height);
    const cardGap = Math.max(4, ref * 0.025);
    const cardPadding = Math.max(4, ref * 0.02);
    const cornerR = Math.max(4, ref * 0.018);

    const totalGap = (cardCount - 1) * cardGap;
    const margin = this.width * 0.03;
    const cardW = Math.min(175, (this.width - margin * 2 - totalGap) / cardCount);

    const iconSize = Math.min(115, cardW * 0.72);
    const nameFontSize = Math.max(9, cardW * 0.08);
    const badgeFontSize = Math.max(7, cardW * 0.06);

    const nameStripH = nameFontSize + 8;
    const iconTopPad = Math.max(14, iconSize * 0.2);
    const tierDotsH = Math.max(14, iconSize * 0.2);
    const bottomPad = Math.max(6, iconSize * 0.1);
    const cardH = nameStripH + iconTopPad + iconSize + tierDotsH + bottomPad;

    const totalW = cardCount * cardW + totalGap;
    const startX = (this.width - totalW) / 2;

    for (let i = 0; i < currentCards.length; i++) {
      const c = currentCards[i];
      const colors = RARITY_COLORS[c.skill.rarity];

      c.bg.clear();
      c.bg.roundRect(0, 0, cardW, cardH, cornerR)
        .fill({ color: colors.cardBg })
        .stroke({ color: 0x000000, width: 1.5 });

      const iconX = (cardW - iconSize) / 2;
      const iconY = nameStripH + iconTopPad;
      c.iconBorder.clear();
      const iconBorderW = 3;
      const iconOutW = 1.5;
      const iconTotalW = iconBorderW + iconOutW;
      c.iconBorder.roundRect(iconX - iconTotalW, iconY - iconTotalW, iconSize + iconTotalW * 2, iconSize + iconTotalW * 2, 8)
        .fill({ color: 0x000000 });
      c.iconBorder.roundRect(iconX - iconBorderW, iconY - iconBorderW, iconSize + iconBorderW * 2, iconSize + iconBorderW * 2, 7)
        .fill({ color: colors.skillBorder });
      c.iconBorder.roundRect(iconX, iconY, iconSize, iconSize, 6)
        .fill({ color: colors.skillBg });

      if (c.iconSprite) {
        const tex = c.iconSprite.texture;
        const iconScale = (iconSize * 0.8) / Math.max(tex.width, tex.height);
        c.iconSprite.scale.set(iconScale);
        c.iconSprite.position.set(iconX + iconSize / 2, iconY + iconSize / 2);
      } else if (c.iconPlaceholder) {
        c.iconPlaceholder.clear();
        const inset = iconSize * 0.15;
        c.iconPlaceholder.roundRect(
          iconX + inset, iconY + inset,
          iconSize - inset * 2, iconSize - inset * 2, 4,
        ).fill({ color: colors.accent, alpha: 0.3 });
      }

      if (c.tierDots && c.tierDotPulse && c.skill.family && c.skill.tier) {
        c.tierDots.clear();
        c.tierDotPulse.clear();
        const dotR = Math.max(3, iconSize * 0.048);
        const dotGap2 = Math.max(2, iconSize * 0.035);
        const totalDots = 3;
        const totalDotsW = totalDots * dotR * 2 + (totalDots - 1) * dotGap2;
        const dotStartX = cardW / 2 - totalDotsW / 2 + dotR;
        const dotY = iconY + iconSize + dotR + Math.max(6, iconSize * 0.1);
        const lastFilled = c.skill.tier - 1;

        for (let d = 0; d < totalDots; d++) {
          const dx = dotStartX + d * (dotR * 2 + dotGap2);

          if (d < c.skill.tier) {
            if (d === lastFilled) {
              c.tierDots.circle(dx, dotY, dotR).fill({ color: 0x1a1a3e }).stroke({ color: 0x000000, width: 1 });
              c.tierDotPulse.circle(dx, dotY, dotR).fill({ color: BANNER_COLOR });
            } else {
              c.tierDots.circle(dx, dotY, dotR).fill({ color: BANNER_COLOR }).stroke({ color: 0x000000, width: 1 });
            }
          } else {
            c.tierDots.circle(dx, dotY, dotR).fill({ color: 0x1a1a3e }).stroke({ color: 0x000000, width: 1 });
          }
        }
      }

      const badgePadH = badgeFontSize * 0.35;
      const badgePadW = badgeFontSize * 0.6;
      c.badgeText.style.fontSize = badgeFontSize;
      const badgeW = c.badgeText.width + badgePadW * 2;
      const badgeH = badgeFontSize + badgePadH * 2;
      c.badgeBg.clear();
      const badgeBorderW = 1.5;
      const badgeOutW = 1;
      const badgeTotalW = badgeBorderW + badgeOutW;
      c.badgeBg.roundRect(-badgeW / 2 - badgeTotalW, -badgeH / 2 - badgeTotalW, badgeW + badgeTotalW * 2, badgeH + badgeTotalW * 2, 5)
        .fill({ color: 0x000000 });
      c.badgeBg.roundRect(-badgeW / 2 - badgeBorderW, -badgeH / 2 - badgeBorderW, badgeW + badgeBorderW * 2, badgeH + badgeBorderW * 2, 4)
        .fill({ color: colors.skillBorder });
      c.badgeBg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 3)
        .fill({ color: colors.badge });
      c.badgeText.position.set(0, 0);
      c.badge.position.set(cardW / 2, iconY - badgeH * 0.15);

      c.accentBar.clear();
      c.accentBar
        .roundRect(0, 0, cardW, nameStripH, cornerR)
        .fill({ color: colors.skillBg })
        .stroke({ color: 0x000000, width: 1.5 });

      c.nameText.style.fontSize = nameFontSize;
      c.nameText.anchor.set(0.5, 0);
      c.nameText.position.set(cardW / 2, (nameStripH - nameFontSize) / 2 - 3);

      c.descText.visible = false;

      if (c.shineMask && c.shineStrip) {
        c.shineMask.clear();
        c.shineMask.roundRect(0, 0, cardW, cardH, cornerR).fill({ color: 0xffffff });
        const stripW = cardW * 0.2;
        c.shineStrip.clear();
        c.shineStrip.poly([
          0, 0,
          stripW, 0,
          stripW - cardH * 0.3, cardH,
          -cardH * 0.3, cardH,
        ]).fill({ color: 0xffffff, alpha: 0.25 });
      }

      c.hitOverlay.clear();
      c.hitOverlay.rect(0, 0, cardW, cardH).fill({ color: 0x000000, alpha: 0.001 });

      c.card.pivot.set(cardW / 2, cardH / 2);
      const xPos = startX + i * (cardW + cardGap) + cardW / 2;
      c.card.position.set(xPos, cardH / 2);
    }

    const containerY = cardsStartY + (this.width > this.height ? 0 : ref * 0.06);
    this.cardsContainer.position.set(0, containerY);

    this.cardsBottomY = containerY + cardH;
    // Coach points at the LOWER part of each card so the fingertip never covers the icon.
    this.coachTargets = currentCards.map(c => ({
      x: c.card.position.x,
      y: containerY + c.card.position.y + cardH * 0.28,
    }));
  }

  private relayoutCircles(): void {
    const ref = Math.min(this.width, this.height);
    const diam = ref * 0.05;
    const r = diam / 2;
    const gap = diam * 0.4;
    const totalW = this.totalRounds * diam + (this.totalRounds - 1) * gap;
    const startX = -totalW / 2 + r;
    const fontSize = diam * 0.55;

    for (let i = 0; i < this.circles.length; i++) {
      const g = this.circles[i];
      const color = i <= this.currentRound ? CIRCLE_ACTIVE_COLOR : CIRCLE_PENDING_COLOR;
      g.clear();
      g.circle(0, 0, r).fill({ color });
      g.position.set(startX + i * (diam + gap), 0);
      const isActive = i <= this.currentRound;
      g.alpha = isActive ? 1 : 0.6;

      const numText = this.circleTexts[i];
      numText.style.fontSize = fontSize;
      numText.position.set(startX + i * (diam + gap), 0);
      numText.alpha = isActive ? 1 : 0.6;
    }
  }
}
