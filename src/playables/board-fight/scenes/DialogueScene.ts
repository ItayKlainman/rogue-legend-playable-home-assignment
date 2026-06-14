import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PlayerState, StatDelta } from '../PlayerState';
import { SpineCharacter } from '@shared/SpineCharacter';
import { heroBundle } from '../catalog/heroes';
import bonfireData from 'assets/tiles/bonfire.webp';
import flameData from 'assets/tiles/flame.webp';
import hpHealIconData from 'assets/UI/HP_Heal_Stat.webp';
import atkBaseIconData from 'assets/UI/ATK_Base_Stat.webp';
import coinIconData from 'assets/UI/Coin.webp';
import dialogueTrainIconData from 'assets/UI/dialogue_train_icon.png';
import battleBgStage1Data from '../catalog/battleBgs/stage1';
import * as sfx from '../sfx';
import { easeOutQuad } from '@shared/utils';

// Battle area layout (matches FightScene + RewardDiscoveryScene)
const BATTLE_AREA_RATIO = 0.55;
const BATTLE_SKEW = 0.025;
const REF_SHORT_SIDE = 390;
function viewportScale(w: number, h: number): number {
  const shortSide = Math.min(w, h);
  return shortSide >= REF_SHORT_SIDE ? 1 : shortSide / REF_SHORT_SIDE;
}

// Layout ratios within battle area (mirrors RewardDiscoveryScene)
const HERO_X_RATIO = 0.27;
const HERO_Y_RATIO = 0.75;
const NPC_X_RATIO = 0.72;
const NPC_Y_RATIO = 0.45;

// NPC float animation
const BOB_AMPLITUDE = 8;
const BOB_PERIOD_MS = 1500;

// Animation timing (ms)
const FADE_IN_MS = 200;
const NPC_APPEAR_DELAY = 100;
const NPC_APPEAR_MS = 350;
const TITLE_APPEAR_DELAY = 250;
const TITLE_APPEAR_MS = 200;
const BODY_APPEAR_DELAY = 350;
const BODY_APPEAR_MS = 200;
const BUTTONS_APPEAR_DELAY = 450;
const BUTTONS_APPEAR_MS = 200;
const BUTTON_STAGGER_MS = 80;
const FADE_OUT_MS = 150;

// Shine sweep
const SHINE_PERIOD = 2000;
const SHINE_DURATION = 600;

export interface DialogueOptionOutcome {
  applyDelta?: { hp?: number; hpPct?: number; atk?: number; atkPct?: number; coins?: number; skill?: string };
}

export interface DialogueOption {
  /** Button label, e.g. "Rest", "Train". */
  label: string;
  /** Optional sub-text below the label (outcome hint). */
  resultText?: string;
  /** Optional tint override for the button inner fill. Default: cream (0xfff1d7). */
  tint?: number;
  /** Webpack-imported asset URL for the centered icon (top of card). If omitted,
   *  the icon is auto-inferred from the first outcome's stat (HP→heart, ATK→sword,
   *  coins→coin). */
  icon?: string;
  /** Outcomes applied on click. */
  outcomes: DialogueOptionOutcome[];
}

export interface DialogueSceneConfig {
  /** Headline text rendered below the battle area, e.g. "A Moment To Rest". */
  title: string;
  /** Body paragraph above the choice buttons. Optional. */
  body?: string;
  /** Variant's current battleBg sprite URL (webpack-imported). Injected by Director from lastFightBg. */
  background?: string;
  /** Floating NPC sprite URL on the right side (webpack-imported). Optional. */
  prop?: string;
  /** 1 or 2 choice options. If empty, shows a single "Continue" button. */
  options?: DialogueOption[];
}

interface ChoiceButton {
  container: Container;
  bg: Graphics;
  iconSprite: Sprite | null;
  label: Text;
  result: Text | null;
  shineMask: Graphics;
  shineStrip: Graphics;
  tint: number;
  resultColor: number;
  width: number;
  height: number;
  baseY: number;
  appearDelay: number;
}

export class DialogueScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: DialogueSceneConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private applyStatDelta: (delta: StatDelta) => StatDelta;
  private ready = false;
  private chosen = false;

  // Display objects
  private dimOverlay!: Graphics;
  private battleArea!: Container;
  private battleMask!: Graphics;
  private bgFlat!: Graphics;
  private bgSprite: Sprite | null = null;
  private hero!: SpineCharacter;
  private npcSprite: Sprite | null = null;
  private bonfireSprite!: Sprite;
  // Unity's flame is a particle system that overlaps a 4-frame animated sprite
  // sheet with additive blending. Without that sheet on hand, we use a single
  // additively-blended flame.webp with gentle flicker — the additive blend itself
  // is what gives the "Unity-like" glow; the actual variety comes from sub-pixel
  // scale wobble rather than discrete frames.
  private flameSprite!: Sprite;
  private flameGlow!: Sprite;
  private titleText!: Text;
  private bodyText: Text | null = null;
  private buttons: ChoiceButton[] = [];

  // Animation state
  private animElapsed = 0;
  private fadingOut = false;
  private fadeOutElapsed = 0;
  private npcBaseScale = 1;
  private bonfireBaseScale = 1;
  private flameBaseScale = 1;
  private flameGlowBaseScale = 1;
  private campfireX = 0;
  private campfireH = 0;
  private npcBaseY = 0;
  private bonfireBaseY = 0;
  private flameBaseY = 0;
  private titleY = 0;
  private bodyY = 0;

  constructor(
    config: DialogueSceneConfig,
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
    // Dim overlay
    this.dimOverlay = new Graphics();
    this.dimOverlay.alpha = 0;
    this.drawDimOverlay();
    this.container.addChild(this.dimOverlay);

    // Battle area container with angled bottom mask
    this.battleArea = new Container();
    this.container.addChild(this.battleArea);
    this.battleMask = new Graphics();
    this.drawBattleMask();
    this.container.addChild(this.battleMask);
    this.battleArea.mask = this.battleMask;

    // Battle area: flat color rect (always-present floor) + battleBg sprite on top.
    // The flat fill guarantees the masked area never goes empty even if the bg load fails.
    this.bgFlat = new Graphics();
    this.battleArea.addChild(this.bgFlat);

    const bgUrl = this.config.background || battleBgStage1Data;
    try {
      const bgTexture = await Assets.load(bgUrl);
      this.bgSprite = new Sprite(bgTexture);
      this.bgSprite.anchor.set(0.5, 0.5);
      this.battleArea.addChild(this.bgSprite);
    } catch {
      // Flat fill remains as the only floor.
    }

    // Hero on the left side (current skin + weapon)
    this.hero = await SpineCharacter.create(
      'dialogueHero',
      heroBundle,
      this.ticker,
      { skin: this.state.heroSkin, animation: 'Idle' },
    );
    this.hero.facingLeft = false;
    this.battleArea.addChild(this.hero.spine);

    if (this.state.weaponConfig) {
      await this.hero.equipWeapon(this.state.weaponConfig);
    }

    // Optional NPC sprite (right-side foreground element)
    if (this.config.prop) {
      try {
        const tex: Texture = await Assets.load(this.config.prop);
        this.npcSprite = new Sprite(tex);
        this.npcSprite.anchor.set(0.5);
        this.npcSprite.scale.set(0);
        this.battleArea.addChild(this.npcSprite);
      } catch {
        // ignore prop load failure
      }
    }

    // ── Campfire (Unity-faithful: bonfire base + animated flame on top) ──
    // Soft warm glow underlay (additive blend) — replaces the ray rays. Sits behind
    // the bonfire so the firelight halo radiates onto the surrounding scene.
    const bonfireTex = await Assets.load(bonfireData);
    const flameTex = await Assets.load(flameData);

    this.flameGlow = new Sprite(flameTex);
    // Anchor near the bottom so most of the halo radiates upward and only a small
    // portion bleeds onto the logs (firelight rises; ground absorbs).
    this.flameGlow.anchor.set(0.5, 0.85);
    this.flameGlow.tint = 0xff9933;
    this.flameGlow.blendMode = 'add';
    this.flameGlow.alpha = 0;
    this.flameGlow.scale.set(0);
    this.battleArea.addChild(this.flameGlow);

    // Bonfire (logs at the base — anchored at bottom-center so scaling/jitter pivots at the ground)
    this.bonfireSprite = new Sprite(bonfireTex);
    this.bonfireSprite.anchor.set(0.5, 1.0);
    this.bonfireSprite.scale.set(0);
    this.battleArea.addChild(this.bonfireSprite);

    // Flame body — single additively-blended sprite (Unity uses additive blend on
    // its particle renderer; that's what gives flames their glow). Anchored bottom
    // so flicker pivots from the logs and the tip moves more than the base.
    this.flameSprite = new Sprite(flameTex);
    this.flameSprite.anchor.set(0.5, 1.0);
    this.flameSprite.blendMode = 'add';
    this.flameSprite.alpha = 0;
    this.flameSprite.scale.set(0);
    this.battleArea.addChild(this.flameSprite);

    // Title
    this.titleText = new Text({
      text: this.config.title,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: '900',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 6 },
        wordWrap: true,
        wordWrapWidth: this.width * 0.85,
        align: 'center',
      }),
    });
    this.titleText.anchor.set(0.5);
    this.titleText.alpha = 0;
    this.container.addChild(this.titleText);

    // Body (optional)
    if (this.config.body) {
      this.bodyText = new Text({
        text: this.config.body,
        style: new TextStyle({
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          fill: 0xffffff,
          stroke: { color: 0x222222, width: 4 },
          align: 'center',
          wordWrap: true,
          wordWrapWidth: this.width * 0.85,
        }),
      });
      this.bodyText.anchor.set(0.5);
      this.bodyText.alpha = 0;
      this.container.addChild(this.bodyText);
    }

    // Buttons
    const opts = this.config.options ?? [];
    const list: DialogueOption[] = opts.length === 0
      ? [{ label: 'Continue', outcomes: [] }]
      : opts;

    for (let i = 0; i < list.length; i++) {
      const btn = this.createButton(list[i], BUTTONS_APPEAR_DELAY + i * BUTTON_STAGGER_MS);
      this.buttons.push(btn);
      this.container.addChild(btn.container);
    }

    this.layoutScene();
    this.animElapsed = 0;
    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);
  }

  async exit(): Promise<void> {}

  update(deltaMS: number): void {
    if (!this.ready) return;

    if (this.fadingOut) {
      this.fadeOutElapsed += deltaMS;
      const t = Math.min(1, this.fadeOutElapsed / FADE_OUT_MS);
      this.container.alpha = 1 - t;
      if (t >= 1) this.resolveDone();
      return;
    }

    this.hero.updateWeaponGlow(deltaMS);
    this.animElapsed += deltaMS;

    // Phase 1: Dim overlay fade in
    if (this.animElapsed < FADE_IN_MS) {
      this.dimOverlay.alpha = (this.animElapsed / FADE_IN_MS) * 0.85;
    } else {
      this.dimOverlay.alpha = 0.85;
    }

    // Phase 2: bonfire + flame body + warm halo scale-in.
    const npcT = (this.animElapsed - NPC_APPEAR_DELAY) / NPC_APPEAR_MS;
    if (npcT > 0 && npcT <= 1) {
      const e = this.easeOutBack(npcT);
      if (this.npcSprite) this.npcSprite.scale.set(this.npcBaseScale * e);
      this.bonfireSprite.scale.set(this.bonfireBaseScale * e);
      this.flameSprite.scale.set(this.flameBaseScale * e);
      this.flameSprite.alpha = Math.min(1, npcT * 2);
      this.flameGlow.scale.set(this.flameGlowBaseScale * e);
      this.flameGlow.alpha = 0.55 * Math.min(1, npcT * 2);
    } else if (npcT > 1) {
      if (this.npcSprite) this.npcSprite.scale.set(this.npcBaseScale);
      this.bonfireSprite.scale.set(this.bonfireBaseScale);
      this.flameSprite.alpha = 1;
      this.flameGlow.alpha = 0.55;
    }

    // Phase 3: Title slide up + fade in
    const titleT = (this.animElapsed - TITLE_APPEAR_DELAY) / TITLE_APPEAR_MS;
    if (titleT > 0 && titleT <= 1) {
      const e = easeOutQuad(titleT);
      this.titleText.alpha = e;
      this.titleText.y = this.titleY + 15 * (1 - e);
    } else if (titleT > 1) {
      this.titleText.alpha = 1;
      this.titleText.y = this.titleY;
    }

    // Phase 4: Body slide up + fade in
    if (this.bodyText) {
      const bodyT = (this.animElapsed - BODY_APPEAR_DELAY) / BODY_APPEAR_MS;
      if (bodyT > 0 && bodyT <= 1) {
        const e = easeOutQuad(bodyT);
        this.bodyText.alpha = e;
        this.bodyText.y = this.bodyY + 15 * (1 - e);
      } else if (bodyT > 1) {
        this.bodyText.alpha = 1;
        this.bodyText.y = this.bodyY;
      }
    }

    // Phase 5: Buttons slide up (staggered). Buttons render fully opaque from frame 1
    // — fading the text in alongside the bg made the labels read as "hidden until shine
    // sweeps", so we only animate the slide and let the shine itself signal arrival.
    for (const btn of this.buttons) {
      const t = (this.animElapsed - btn.appearDelay) / BUTTONS_APPEAR_MS;
      btn.container.alpha = 1;
      if (t > 0 && t <= 1) {
        const e = easeOutQuad(t);
        btn.container.y = btn.baseY + 25 * (1 - e);
      } else if (t > 1) {
        btn.container.y = btn.baseY;
      } else {
        btn.container.y = btn.baseY + 25;
      }
    }

    // Flame body — gentle scale flicker on a single additively-blended sprite. The
    // additive blend is what makes it glow like Unity; the sin wobble is intentionally
    // small so the silhouette stays stable and doesn't "jump".
    if (npcT > 1) {
      const t = this.animElapsed;
      const flickerY = 1 + Math.sin(t * 0.007) * 0.03 + Math.sin(t * 0.013 + 1.1) * 0.015;
      const flickerX = 1 + Math.sin(t * 0.006 + 0.6) * 0.02;
      this.flameSprite.scale.set(this.flameBaseScale * flickerX, this.flameBaseScale * flickerY);
      // Subtle alpha pulse — additive blend means alpha modulates how much the
      // flame "burns into" the scene, mimicking the additive frame-cycling effect.
      this.flameSprite.alpha = 0.85 + Math.sin(t * 0.011) * 0.12;

      // Warm halo — slow breathe (lower frequencies, smaller amplitude).
      const glowPulse = 1 + Math.sin(t * 0.004) * 0.06;
      this.flameGlow.scale.set(this.flameGlowBaseScale * glowPulse);
      this.flameGlow.alpha = 0.42 + Math.sin(t * 0.006) * 0.10;
    }

    // Optional NPC sine bob (only when a prop sprite is present)
    if (this.npcSprite) {
      const bobOffset = BOB_AMPLITUDE * Math.sin(this.animElapsed * (2 * Math.PI / BOB_PERIOD_MS));
      this.npcSprite.y = this.npcBaseY + bobOffset;
    }

    // Button shine sweep (only after buttons are fully in)
    for (const btn of this.buttons) {
      if (this.animElapsed < btn.appearDelay + BUTTONS_APPEAR_MS) {
        btn.shineStrip.visible = false;
        continue;
      }
      const phase = (this.animElapsed % SHINE_PERIOD) / SHINE_DURATION;
      if (phase > 1) {
        btn.shineStrip.visible = false;
      } else {
        btn.shineStrip.visible = true;
        btn.shineStrip.x = -btn.width * 0.3 + phase * btn.width * 1.6;
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
    if (!this.ready) return;
    this.drawDimOverlay();
    this.drawBattleMask();
    this.layoutScene();
  }

  // ── Internals ──

  private drawDimOverlay(): void {
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000 });
  }

  private drawBattleMask(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    const skew = this.height * BATTLE_SKEW;
    this.battleMask.clear();
    this.battleMask.poly([
      0, 0, this.width, 0,
      this.width, battleH - skew,
      0, battleH + skew,
    ]).fill({ color: 0xffffff });
  }

  private layoutScene(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    const vScale = viewportScale(this.width, this.height);

    // Battle area scaling (matches FightScene)
    this.battleArea.scale.set(vScale);
    this.battleArea.pivot.set(this.width / 2, battleH / 2);
    this.battleArea.position.set(this.width / 2, battleH / 2);

    // Flat background fill (covers the entire battle area regardless of bg load)
    this.bgFlat.clear();
    this.bgFlat.rect(0, 0, this.width, battleH + this.height * BATTLE_SKEW)
      .fill({ color: 0x1a2238 });

    // Battle bg sprite — fixed 0.34 scale matches FightScene exactly. The battleArea
    // container (above) applies vScale on top, so BG scales WITH content rather than
    // being cover-fit to viewport (which would zoom the BG independently of the wheel).
    if (this.bgSprite) {
      this.bgSprite.scale.set(0.34);
      this.bgSprite.x = this.width / 2;
      this.bgSprite.y = battleH / 2;
    }

    // Hero (left side, standing on ground)
    this.hero.spine.scale.set(0.12);
    this.hero.spine.x = this.width * HERO_X_RATIO;
    this.hero.spine.y = battleH * HERO_Y_RATIO;

    // NPC (right side, floating)
    const npcX = this.width * NPC_X_RATIO;
    this.npcBaseY = battleH * NPC_Y_RATIO;

    if (this.npcSprite) {
      const tex = this.npcSprite.texture;
      const refSize = Math.min(battleH * 0.4, this.width * 0.3);
      this.npcBaseScale = refSize / Math.max(tex.width, tex.height);
      this.npcSprite.x = npcX;
      this.npcSprite.y = this.npcBaseY;
      if (this.animElapsed > NPC_APPEAR_DELAY + NPC_APPEAR_MS) {
        this.npcSprite.scale.set(this.npcBaseScale);
      }
    }

    // ── Campfire layout (Unity-faithful: bonfire base, flame on top, warm glow halo) ──
    // Bonfire is anchored at bottom-center, sized so its width is ~30% of the battle width.
    // The flame anchored at bottom-center, scaled 1.25x relative to the bonfire (Unity prefab),
    // and offset upward by ~30% of the bonfire's height so it sits ON the logs, not above them.
    const bonfireTex = this.bonfireSprite.texture;
    const flameTex = this.flameSprite.texture;
    const bonfireTargetW = Math.min(this.width * 0.18, battleH * 0.26);
    this.bonfireBaseScale = bonfireTargetW / bonfireTex.width;
    const bonfireH = bonfireTex.height * this.bonfireBaseScale;

    // Anchor the campfire on the right side, sitting at the "ground" plane (HERO_Y_RATIO).
    const campfireX = this.width * NPC_X_RATIO;
    const groundY = battleH * HERO_Y_RATIO;
    this.npcBaseY = groundY - bonfireH * 0.5; // used for optional npc bob anchor
    this.bonfireBaseY = groundY;
    this.campfireX = campfireX;
    this.campfireH = bonfireH;

    this.bonfireSprite.x = campfireX;
    this.bonfireSprite.y = this.bonfireBaseY;

    // Flame: scaled 1.25x (Unity prefab Flame_VFX scale). Its base nests into the
    // top of the log pile so the flame visibly grows out of the wood.
    this.flameBaseScale = this.bonfireBaseScale * 1.25;
    this.flameBaseY = groundY - bonfireH * 0.35;
    this.flameSprite.x = campfireX;
    this.flameSprite.y = this.flameBaseY;

    // Warm halo: large additive bloom, anchored near its bottom (set in enter()) so
    // it radiates almost entirely upward, with only a small portion bleeding onto
    // the upper logs. Centered roughly at the flame's mid-body.
    this.flameGlowBaseScale = (bonfireTargetW * 1.7) / flameTex.width;
    this.flameGlow.x = campfireX;
    this.flameGlow.y = groundY - bonfireH * 0.7;

    if (this.animElapsed > NPC_APPEAR_DELAY + NPC_APPEAR_MS) {
      this.bonfireSprite.scale.set(this.bonfireBaseScale);
      this.flameSprite.scale.set(this.flameBaseScale);
      this.flameGlow.scale.set(this.flameGlowBaseScale);
    }

    // ── Below battle area: title + body + buttons ──
    const isLandscape = this.width > this.height;
    const belowBattle = battleH + this.height * BATTLE_SKEW;
    const minDim = Math.min(this.width, this.height);

    // ── Buttons (bottom) — Unity-style square cards: icon centered, label on top
    //    third, outcome text below. Unity's Equipment_BG_Base frame: outer black
    //    → lavender ring (#CCCAE9) → lavender-grey inner fill (#8786AA), text white.
    // Buttons are fixed-size — they do NOT resize with viewport. Only positioning
    // recomputes (centering, stacked-vs-side-by-side) on viewport change.
    const count = this.buttons.length;
    const stacked = count === 2 && this.width < 480;
    const labelFontSize = 17;
    const resultFontSize = 11;
    const btnMargin = isLandscape ? 8 : 14;

    const btnW = 150;
    const btnH = 162;

    // Push buttons down — keep just enough margin from bottom edge for breathing room.
    const btnY = this.height - btnMargin - btnH / 2;

    for (let i = 0; i < count; i++) {
      const btn = this.buttons[i];
      btn.width = btnW;
      btn.height = btnH;

      // Equipment_BG_Base layered frame (lavender Unity look).
      const outerR = Math.min(18, btnW * 0.08);
      const borderW = Math.max(3, btnW * 0.018);
      const innerR = Math.max(5, outerR - borderW);
      const innerFill = btn.tint === 0xfff1d7 ? 0x8786AA : btn.tint; // honour explicit tint, default to Unity lavender-grey
      btn.bg.clear();
      btn.bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, outerR)
        .fill({ color: 0x000000 });
      btn.bg.roundRect(-btnW / 2 + 2, -btnH / 2 + 2, btnW - 4, btnH - 4, outerR - 1)
        .fill({ color: 0xCCCAE9 }); // Unity InnerBorder lavender
      btn.bg.roundRect(-btnW / 2 + 2 + borderW, -btnH / 2 + 2 + borderW, btnW - 4 - borderW * 2, btnH - 4 - borderW * 2, innerR)
        .fill({ color: innerFill }); // Unity Inner_BG lavender-grey

      btn.shineMask.clear();
      btn.shineMask.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, outerR)
        .fill({ color: 0xffffff });
      const stripW = btnW * 0.2;
      btn.shineStrip.clear();
      btn.shineStrip.poly([
        0, -btnH / 2,
        stripW, -btnH / 2,
        stripW - btnH * 0.4, btnH / 2,
        -btnH * 0.4, btnH / 2,
      ]).fill({ color: 0xffffff, alpha: 0.25 });

      // Layout: icon (top ~50%), label (around 70% down), result (bottom).
      const iconAreaTop = -btnH * 0.5 + btnH * 0.10; // small top inset
      const iconAreaBottom = -btnH * 0.5 + btnH * 0.55;
      const iconCenterY = (iconAreaTop + iconAreaBottom) / 2;
      const iconBudget = (iconAreaBottom - iconAreaTop) * 0.95;

      if (btn.iconSprite && btn.iconSprite.texture && btn.iconSprite.texture.width > 0) {
        const tw = btn.iconSprite.texture.width;
        const th = btn.iconSprite.texture.height;
        const scale = iconBudget / Math.max(tw, th);
        btn.iconSprite.scale.set(scale);
        btn.iconSprite.x = 0;
        btn.iconSprite.y = iconCenterY;
        btn.iconSprite.visible = true;
      } else if (btn.iconSprite) {
        btn.iconSprite.visible = false;
      }

      // Label: positioned at ~67% of card height (just below icon).
      btn.label.style.fontSize = labelFontSize;
      btn.label.style.wordWrapWidth = btnW * 0.85;
      const labelY = btn.result
        ? btnH * 0.5 - btnH * 0.32
        : btnH * 0.5 - btnH * 0.22;
      btn.label.position.set(0, labelY);

      if (btn.result) {
        btn.result.style.fontSize = resultFontSize;
        btn.result.style.wordWrapWidth = btnW * 0.9;
        btn.result.position.set(0, btnH * 0.5 - btnH * 0.13);
      }

      let bx: number;
      let by: number;
      if (count === 1) {
        bx = this.width / 2;
        by = btnY;
      } else if (stacked) {
        bx = this.width / 2;
        by = btnY - (btnH / 2 + 10) + i * (btnH + 20);
      } else {
        const gap = this.width * 0.04;
        const totalW = btnW * 2 + gap;
        const leftX = this.width / 2 - totalW / 2 + btnW / 2;
        bx = leftX + i * (btnW + gap);
        by = btnY;
      }

      btn.baseY = by;
      btn.container.position.set(bx, by);
    }

    const buttonsTop = stacked
      ? btnY - (btnH / 2 + 10) - btnH / 2
      : btnY - btnH / 2;

    // Title + body fit in space between bottom-of-battle and top-of-buttons
    const titleFontSize = Math.max(22, minDim * 0.06);
    this.titleText.style.fontSize = titleFontSize;
    (this.titleText.style as TextStyle).stroke = { color: 0x222222, width: Math.max(3, titleFontSize * 0.18) };
    this.titleText.style.wordWrapWidth = this.width * 0.85;

    let bodyH = 0;
    let bodyFontSize = 0;
    if (this.bodyText) {
      bodyFontSize = Math.max(16, minDim * 0.04);
      this.bodyText.style.fontSize = bodyFontSize;
      this.bodyText.style.wordWrapWidth = this.width * 0.85;
      bodyH = Math.max(this.bodyText.height, bodyFontSize * 1.4);
    }

    const titleH = Math.max(this.titleText.height, titleFontSize * 1.4);
    const totalTextH = titleH + (this.bodyText ? bodyH + 8 : 0);
    const textRegionTop = belowBattle + 12;
    const textRegionBottom = buttonsTop - 16;
    const textRegionH = Math.max(40, textRegionBottom - textRegionTop);
    const textBlockTop = textRegionTop + Math.max(0, (textRegionH - totalTextH) / 2);

    this.titleY = textBlockTop + titleH / 2;
    this.titleText.position.set(this.width / 2, this.titleY);
    if (this.bodyText) {
      this.bodyY = textBlockTop + titleH + 8 + bodyH / 2;
      this.bodyText.position.set(this.width / 2, this.bodyY);
    }
  }

  private createButton(opt: DialogueOption, appearDelay: number): ChoiceButton {
    const container = new Container();
    container.eventMode = 'static';
    container.cursor = 'pointer';

    const bg = new Graphics();
    container.addChild(bg);

    // Icon — Unity-style: centered authored sprite (per-option). Auto-fallback
    // from outcome stat when none is specified.
    const iconUrl = opt.icon ?? this.inferIconForOption(opt);
    let iconSprite: Sprite | null = null;
    if (iconUrl) {
      iconSprite = new Sprite();
      iconSprite.anchor.set(0.5);
      void Assets.load(iconUrl).then(tex => {
        if (iconSprite && !iconSprite.destroyed) {
          iconSprite.texture = tex;
          if (this.ready) this.layoutScene(); // re-layout once dims are known
        }
      });
      container.addChild(iconSprite);
    }

    // White text with dark stroke (matches Unity's TMP faceColor 0xFFFFFFFF).
    const label = new Text({
      text: opt.label,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 4, join: 'round' },
        align: 'center',
      }),
    });
    label.anchor.set(0.5);
    container.addChild(label);

    // Outcome text color hint: green for buffs, red for debuffs. Plain white
    // when mixed/unknown.
    const resultColor = this.inferResultColor(opt);
    let result: Text | null = null;
    if (opt.resultText) {
      result = new Text({
        text: opt.resultText,
        style: new TextStyle({
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          fill: resultColor,
          stroke: { color: 0x222222, width: 3, join: 'round' },
          align: 'center',
        }),
      });
      result.anchor.set(0.5);
      container.addChild(result);
    }

    const shineMask = new Graphics();
    const shineStrip = new Graphics();
    shineStrip.mask = shineMask;
    container.addChild(shineMask);
    container.addChild(shineStrip);

    const btn: ChoiceButton = {
      container, bg, iconSprite, label, result, shineMask, shineStrip,
      tint: opt.tint ?? 0xfff1d7,
      resultColor,
      width: 0, height: 0, baseY: 0, appearDelay,
    };

    container.on('pointerdown', () => {
      if (this.chosen || this.fadingOut) return;
      this.chosen = true;
      void this.handleClick(opt, btn);
    });

    return btn;
  }

  /** Pick a default icon based on the outcome's primary stat. */
  private inferIconForOption(opt: DialogueOption): string | undefined {
    for (const o of opt.outcomes) {
      const d = o.applyDelta;
      if (!d) continue;
      if (d.hp != null || d.hpPct != null) return hpHealIconData;
      if (d.atk != null || d.atkPct != null) return atkBaseIconData;
      if (d.coins != null) return coinIconData;
    }
    // Label-based fallback for the 'Train' button when no stat hint exists yet.
    if (/train|study|learn/i.test(opt.label)) return dialogueTrainIconData;
    if (/rest|sleep|heal/i.test(opt.label)) return hpHealIconData;
    return undefined;
  }

  /** Outcome text color: green for buffs, red for debuffs, brown for neutral. */
  private inferResultColor(opt: DialogueOption): number {
    let positive = 0, negative = 0;
    for (const o of opt.outcomes) {
      const d = o.applyDelta;
      if (!d) continue;
      const vals = [d.hp, d.hpPct, d.atk, d.atkPct, d.coins].filter(v => v != null) as number[];
      for (const v of vals) {
        if (v > 0) positive++;
        else if (v < 0) negative++;
      }
    }
    if (positive > 0 && negative === 0) return 0xAAFFAA; // green (Unity rich-text style)
    if (negative > 0 && positive === 0) return 0xFFAAAA; // red
    return 0xffffff; // white (neutral / mixed)
  }

  private async handleClick(opt: DialogueOption, btn: ChoiceButton): Promise<void> {
    sfx.buttonClick();

    for (const b of this.buttons) {
      b.container.eventMode = 'none';
      b.container.cursor = 'default';
    }

    for (const outcome of opt.outcomes) {
      if (outcome.applyDelta) {
        this.applyStatDelta(outcome.applyDelta);
      }
    }

    // Press feedback: quick pulse on selected button
    await this.tweenOnce(80, t => btn.container.scale.set(1 - 0.06 * t));
    await this.tweenOnce(80, t => btn.container.scale.set(0.94 + 0.06 * t));

    sfx.rewardReceived();

    this.fadingOut = true;
    this.fadeOutElapsed = 0;
  }

  private tweenOnce(durationMs: number, apply: (t: number) => void): Promise<void> {
    return new Promise(resolve => {
      let elapsed = 0;
      const tick = (dt: { deltaMS: number }) => {
        elapsed += dt.deltaMS;
        const t = Math.min(elapsed / durationMs, 1);
        apply(t);
        if (t >= 1) {
          this.ticker.remove(tick);
          resolve();
        }
      };
      this.ticker.add(tick);
    });
  }

  private easeOutBack(t: number): number {
    const c = 1.4;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
}
