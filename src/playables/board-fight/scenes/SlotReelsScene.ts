import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PlayerState, StatDelta } from '../PlayerState';
import { tween, delay } from '@shared/tween';
import { easeOutQuad } from '@shared/easing';
import * as sfx from '../sfx';
import { slotsSfx } from '../sfx-slots';

import slotsBgData from 'assets/tiles/luckyTreasure_bg.webp';
import slotGenieData from 'assets/tiles/slot_genie.webp';

import hpIconData from 'assets/UI/HP_Base_Stat.webp';
import atkIconData from 'assets/UI/ATK_Base_Stat.webp';
import defIconData from 'assets/UI/DEF_Base_Stat.webp';
import coinIconData from 'assets/UI/Coin.webp';
import skillIconData from 'assets/Skills/skill_Lightning_Shot.webp';

// ───────────────────────── Unity-faithful constants ─────────────────────────
// Reference resolution (matches LuckyWheelScene + FightScene convention).
const REF_W = 1080;
const REF_H = 1920;

// Per-cell layout — matches LuckyTreasure_Slot.prefab (200×300 cell, 150×150 icons).
const REEL_W = 200;
const REEL_H = 300;
const ICON_SIZE = 150;
const REEL_GAP = 10;
const ICON_PITCH = 192;            // BottomIcon.y travel per tick (Unity-faithful)

// Slots group — matches Unity Slots container (640×223, masked) at canvas-center y=-22 (Unity y-up).
const SLOTS_GROUP_W = 640;
const SLOTS_GROUP_H = 223;
const SLOTS_OFFSET_Y_UNITY = -22;  // PIXI y = cy + 22 * vScale

// Tick timing — extracted from .anim files (60 fps, 5-frame Start/Loop ticks).
const TICK_DURATION_MS = (1000 * 5) / 60;            // ≈ 83.33 ms per Loop tick
const END_TICK_DURATIONS_MS = [150, 233, 317, 583];   // 4 decelerating End ticks
const END_TICK_COUNT = END_TICK_DURATIONS_MS.length;

// Reel coordination — Unity awaits `(i+1)*0.4s` AFTER each Spin call → cumulative 0/400/1200 ms.
const REEL_STAGGER_CUMULATIVE_MS = [0, 400, 1200];
const NUM_REELS = 3;

// Loop length — Unity's HUD prefab overrides _minNumOfSpins to 4 on each slot instance.
const MIN_LOOP_TICKS = 4;

// Audio — Unity SlotReelUI._tickSemitones + per-reel pan from PlayTickSound switch.
const TICK_SEMITONES = [-5, 0, 2, 5, 7];
const REEL_PANS = [-0.5, 0, +0.5];

// Win punch — Unity SlotReelUI.PlayWinAnimation: scale 1→1.25 (0.5s) → hold 1s → 1.25→1 (0.5s).
const WIN_PUNCH_SCALE = 1.25;
const WIN_PUNCH_RAMP_MS = 500;
const WIN_PUNCH_HOLD_MS = 1000;

// Post-spin hold so player reads result before scene exits.
const RESULT_HOLD_MS = 1500;

// Colors — sampled from Unity prefab YAML.
const DIM_OVERLAY_ALPHA = 0.90;
const SLOT_BG_COLOR = 0xFAD9AF;          // Unity rgb(0.98, 0.859, 0.686)
const VIGNETTE_COLOR = 0x3D1F14;         // Unity rgb(0.239, 0.122, 0.078)
const BORDER_COLOR = 0xD6704A;           // Unity rgb(0.843, 0.439, 0.290)
const SLOTS_TRACK_COLOR = 0x000000;      // black sliced backing behind reels
const HEADER_YELLOW = 0xFFC600;
const SPIN_GOLD = 0xFFC600;              // Unity DEFAULT_GOLD — same as LuckyWheel SPIN button
const SPIN_GOLD_PRESSED = 0x6e6e76;      // neutral gray when pressed/disabled
const SPIN_BTN_STROKE = 0x4a3010;
const SPIN_BTN_STROKE_PRESSED = 0x3a3a40;
// Entry animations (mirrors Unity Fade_In.anim + Scale_In.anim).
const ENTRY_FADE_MS = 167;
const ENTRY_SCALE_MS = 167;

// SPIN button dimensions (matches LuckyWheelScene's button — Unity Spin_Button 400×145).
const SPIN_BTN_W = 400;
const SPIN_BTN_H = 145;
const SPIN_BTN_R = 26;                   // rounded-rect, not pill — matches Unity prefab
const SPIN_BTN_BOTTOM_OFFSET = 180;      // px from viewport bottom in scaled space

// Shine sweep on the SPIN button — same pattern as LuckyWheelScene + RollButton.
const SPIN_SHINE_CYCLE_MS = 2200;
const SPIN_SHINE_SWEEP_MS = 500;
const SPIN_SHINE_TILT = -Math.PI / 7;

// Genie target size (Unity prefab: 373.7 × 368.6, anchored bottom-center).
const GENIE_TARGET_H = 374;

// 5 reward symbols. Order matches the Unity .asset's PossibleRewards (5 entries, uniform weight).
type SymbolKey = 'HP' | 'ATK' | 'DEF' | 'COIN' | 'SKILL';
interface SymbolDef {
  key: SymbolKey;
  iconUrl: string;
}
const SYMBOLS: SymbolDef[] = [
  { key: 'HP',    iconUrl: hpIconData },
  { key: 'ATK',   iconUrl: atkIconData },
  { key: 'DEF',   iconUrl: defIconData },
  { key: 'COIN',  iconUrl: coinIconData },
  { key: 'SKILL', iconUrl: skillIconData },
];
const SYMBOL_COUNT = SYMBOLS.length;

// ───────────────────────── Public types ─────────────────────────

export interface SlotReelsSceneConfig {
  /** RewardLevel: 1 (consolation) / 2 (mid) / 3 (jackpot). Default 2. Determines how many reels match. */
  rewardLevel?: 1 | 2 | 3;
  /** Reward to apply after spin completes. */
  reward?: { coins?: number; hpPct?: number; atkPct?: number; skill?: string };
  /** Optional explicit winning symbol — either the numeric index (0..4) or the key name.
   *  If unset, the symbol is derived from the `reward` keys (e.g. coins → COIN). */
  winningSymbol?: number | SymbolKey;
}

interface ReelVisual {
  /** Outer 200×300 cell — child of `slotsGroup`. */
  container: Container;
  /** Mask container clipping the icons to the visible window. */
  iconWindow: Container;
  /** Bottom icon — animated `y: 0 → +ICON_PITCH` per tick. */
  bottomIcon: Sprite;
  /** Top icon — child of bottomIcon at local y = -ICON_PITCH (above center in PIXI). */
  upperIcon: Sprite;
  /** Base scale factor (ICON_SIZE / texture.width). All icons are 512×512 so this is constant per build. */
  baseScale: number;
  /** Currently displayed bottom symbol index — used to compute `distance` to target. */
  bottomSymbolIdx: number;
  /** Currently staged upper symbol index. */
  upperSymbolIdx: number;
  /** Final result symbol once spun. */
  resultSymbol: number;
  isWinning: boolean;
  finished: boolean;
}

// ───────────────────────── Scene ─────────────────────────

export class SlotReelsScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: SlotReelsSceneConfig;
  // PlayerState is read by sibling scenes; SlotReelsScene only writes via applyStatDelta.
  // Field is reassigned via constructor for signature parity even if not read internally.
  private state!: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private applyStatDelta: (delta: StatDelta) => StatDelta;

  private ready = false;
  private spinning = false;
  private finished = false;
  private disposed = false;

  // Per-reel tick counter (independent semitone cycle per reel — matches Unity).
  private tickCounter: number[] = [0, 0, 0];

  private currentVScale = 1;

  // Cached symbol textures — eager-loaded in enter() so swaps in the spin loop are sync.
  private symbolTextures: Texture[] = [];

  // Display tree.
  // Root-level (anchored to viewport edges, scaled individually):
  private bgFlat!: Graphics;
  private bgSprite!: Sprite;
  private dimOverlay!: Graphics;
  private headerText!: Text;
  private spinButton!: Container;
  private spinButtonBg!: Graphics;
  private spinButtonText!: Text;
  private spinShineContainer!: Container;
  private spinShineMask!: Graphics;
  private spinShineBar!: Graphics;
  private spinShineElapsed = 0;
  private spinButtonPressed = false;
  // Scene-unit (mirrors LuckyWheel's `wheelContainer`): everything within scales as one
  // unit by `vScale`; children live in unscaled scene-local coords.
  private sceneUnit!: Container;
  private genieContainer!: Container;
  private genieSprite!: Sprite;
  private chatBubble!: Container;
  private chatBubbleBg!: Graphics;
  private chatBubbleText!: Text;
  private slotsGroup!: Container;
  private slotsBackdrop!: Graphics;
  private slotsBorder!: Graphics;
  private slotsGradientTop!: Graphics;
  private slotsGradientBot!: Graphics;
  private slotsMask!: Graphics;
  private reels: ReelVisual[] = [];

  constructor(
    config: SlotReelsSceneConfig,
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
    // Eager-load all 5 symbol textures + BG + genie so the spin loop never awaits.
    const [bgTex, genieTex, ...iconTexes] = await Promise.all([
      Assets.load(slotsBgData),
      Assets.load(slotGenieData),
      ...SYMBOLS.map(s => Assets.load(s.iconUrl)),
    ]);
    this.symbolTextures = iconTexes as Texture[];
    if (this.disposed) return;

    // Flat fill behind BG sprite — covers any gap at extreme aspect ratios so the
    // previous scene never shows through. Same pattern as LuckyWheelScene.
    this.bgFlat = new Graphics();
    this.container.addChild(this.bgFlat);

    // BG painting
    this.bgSprite = new Sprite(bgTex as Texture);
    this.bgSprite.anchor.set(0.5);
    this.container.addChild(this.bgSprite);

    // Dim overlay disabled — kept as a stub field so layout/entry code stays simple.
    // (Unity uses 90% black, but it hides the BG painting in our setup.)
    this.dimOverlay = new Graphics();
    this.dimOverlay.visible = false;

    // Header banner — yellow "Lucky Treasure" near top.
    this.headerText = new Text({
      text: 'Lucky Treasure',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 60,
        fontWeight: 'bold',
        fill: HEADER_YELLOW,
        stroke: { color: 0x4a3010, width: 6, join: 'round' },
      }),
    });
    this.headerText.anchor.set(0.5);
    this.container.addChild(this.headerText);

    // Scene unit — single master container that holds everything in the "scene area"
    // (genie, chat, slots, arrows). It scales as one unit by vScale, mirroring
    // LuckyWheelScene's `wheelContainer` pattern. Children use unscaled scene-local coords.
    this.sceneUnit = new Container();
    this.sceneUnit.scale.set(0); // scale-in via entry anim
    this.container.addChild(this.sceneUnit);

    // Genie character (anchored to its bottom-center pivot).
    this.genieContainer = new Container();
    this.genieSprite = new Sprite(genieTex as Texture);
    this.genieSprite.anchor.set(0.5, 1);
    const genieScale = GENIE_TARGET_H / ((genieTex as Texture).height || GENIE_TARGET_H);
    this.genieSprite.scale.set(genieScale);
    this.genieContainer.addChild(this.genieSprite);
    this.sceneUnit.addChild(this.genieContainer);

    // Chat bubble (above genie, "start" line by default).
    this.chatBubble = this.buildChatBubble('Match three to win!');
    this.sceneUnit.addChild(this.chatBubble);

    // Slots group — wraps backdrop, reels, gradients, border.
    this.slotsGroup = new Container();
    this.sceneUnit.addChild(this.slotsGroup);

    this.slotsBackdrop = new Graphics();
    this.slotsGroup.addChild(this.slotsBackdrop);

    // Build 3 reels.
    for (let i = 0; i < NUM_REELS; i++) {
      const reel = this.buildReel();
      this.slotsGroup.addChild(reel.container);
      this.reels.push(reel);
    }

    // Top + bottom dark gradients (fade icons as they enter/exit the visible window).
    this.slotsGradientTop = new Graphics();
    this.slotsGradientBot = new Graphics();
    this.slotsGroup.addChild(this.slotsGradientTop);
    this.slotsGroup.addChild(this.slotsGradientBot);

    // Sliced border frame around the reel group.
    this.slotsBorder = new Graphics();
    this.slotsGroup.addChild(this.slotsBorder);

    // Mask clips reels + gradients to the SLOTS_GROUP_W × SLOTS_GROUP_H window.
    this.slotsMask = new Graphics();
    this.slotsGroup.addChild(this.slotsMask);
    this.slotsGroup.mask = this.slotsMask;

// SPIN button — same gold rounded-rect with shine sweep as LuckyWheelScene.
    this.spinButton = new Container();
    this.spinButtonBg = new Graphics();
    this.spinButton.addChild(this.spinButtonBg);

    // Shine sweep — masked to the button shape.
    this.spinShineContainer = new Container();
    this.spinShineMask = new Graphics();
    this.spinShineBar = new Graphics();
    this.spinShineBar.rotation = SPIN_SHINE_TILT;
    this.spinShineContainer.addChild(this.spinShineMask, this.spinShineBar);
    this.spinShineContainer.mask = this.spinShineMask;
    this.spinButton.addChild(this.spinShineContainer);

    this.spinButtonText = new Text({
      text: 'SPIN!',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 44,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x4a3010, width: 5, join: 'round' },
      }),
    });
    this.spinButtonText.anchor.set(0.5);
    this.spinButton.addChild(this.spinButtonText);

    this.spinButton.eventMode = 'static';
    this.spinButton.cursor = 'pointer';
    this.spinButton.on('pointerdown', () => {
      if (this.spinning || this.finished || this.disposed) return;
      // Set guards SYNCHRONOUSLY before any async work so a double-click can't slip through.
      this.spinning = true;
      this.spinButton.eventMode = 'none';
      this.spinButton.cursor = 'default';
      sfx.buttonClick();
      void this.startSpin();
    });
    this.container.addChild(this.spinButton);

    this.layoutAll();
    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);

    // Entry animations — fade dim 0→1 + scale slotsGroup 0→1.05→1 over 167ms.
    void this.playEnterAnimations();
  }

  async exit(): Promise<void> {
    this.disposed = true;
  }

  update(deltaMS: number): void {
    if (!this.ready || this.disposed) return;

    // Shine sweep on the SPIN button — masked diagonal bar that sweeps across the
    // button every SPIN_SHINE_CYCLE_MS, hidden once spinning/finished. Same pattern
    // as LuckyWheelScene + RollButton.
    if (this.spinShineBar) {
      if (!this.spinning && !this.finished) {
        this.spinShineElapsed += deltaMS;
        const cyclePos = this.spinShineElapsed % SPIN_SHINE_CYCLE_MS;
        if (cyclePos < SPIN_SHINE_SWEEP_MS) {
          const t = cyclePos / SPIN_SHINE_SWEEP_MS;
          const range = (SPIN_BTN_W + 60) * this.currentVScale;
          this.spinShineBar.x = -range / 2 + range * t;
          this.spinShineBar.visible = true;
        } else {
          this.spinShineBar.visible = false;
        }
      } else {
        this.spinShineBar.visible = false;
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
    this.layoutAll();
  }

  // ───────────────────────── Build helpers ─────────────────────────

  private buildReel(): ReelVisual {
    const container = new Container();

    // Cream cell BG.
    const bg = new Graphics();
    bg.rect(-REEL_W / 2, -REEL_H / 2, REEL_W, REEL_H).fill({ color: SLOT_BG_COLOR });
    container.addChild(bg);

    // Per-cell vignettes (top + bottom dark inner shadows).
    const vTop = new Graphics();
    vTop.rect(-REEL_W / 2, -REEL_H / 2, REEL_W, 50).fill({ color: VIGNETTE_COLOR, alpha: 0.55 });
    container.addChild(vTop);
    const vBot = new Graphics();
    vBot.rect(-REEL_W / 2, REEL_H / 2 - 50, REEL_W, 50).fill({ color: VIGNETTE_COLOR, alpha: 0.55 });
    container.addChild(vBot);

    // Icon window — clipped to cell width × SLOTS_GROUP_H to hide off-screen icons.
    const iconWindow = new Container();
    container.addChild(iconWindow);

    // Pick random starting symbols.
    const startBottom = Math.floor(Math.random() * SYMBOL_COUNT);
    const startUpper = (startBottom + 1) % SYMBOL_COUNT;

    // All icons are 512×512 — compute base scale once so we can multiply against it
    // for the win-punch (instead of using `.width = ICON_SIZE` which is overwritten by `scale.set`).
    const tex = this.symbolTextures[startBottom];
    const baseScale = ICON_SIZE / (tex.width || ICON_SIZE);

    // Bottom icon (parent — animated on y).
    const bottomIcon = new Sprite(this.symbolTextures[startBottom]);
    bottomIcon.anchor.set(0.5);
    bottomIcon.scale.set(baseScale);
    bottomIcon.x = 0;
    bottomIcon.y = 0;
    iconWindow.addChild(bottomIcon);

    // Upper icon (child of bottom — at y = -ICON_PITCH in PIXI = above center).
    // Note: upperIcon's localPosition y is in *parent local coords*, NOT scaled coords —
    // so we keep ICON_PITCH at the unscaled value (192px) since bottomIcon's scale also scales children.
    // To keep upperIcon visually exactly one pitch above bottomIcon in WORLD space, divide by baseScale.
    const upperIcon = new Sprite(this.symbolTextures[startUpper]);
    upperIcon.anchor.set(0.5);
    upperIcon.x = 0;
    upperIcon.y = -ICON_PITCH / baseScale;  // child y is in bottomIcon's unscaled local space
    bottomIcon.addChild(upperIcon);

    // Per-cell border (Unity-faithful sliced orange frame).
    const border = new Graphics();
    border.rect(-REEL_W / 2, -REEL_H / 2, REEL_W, REEL_H)
      .stroke({ color: BORDER_COLOR, width: 6, alignment: 0.5 });
    container.addChild(border);

    return {
      container,
      iconWindow,
      bottomIcon,
      upperIcon,
      baseScale,
      bottomSymbolIdx: startBottom,
      upperSymbolIdx: startUpper,
      resultSymbol: -1,
      isWinning: false,
      finished: false,
    };
  }

  private buildChatBubble(initialText: string): Container {
    const c = new Container();

    const bg = new Graphics();
    const w = 540;
    const h = 140;
    // Bubble body
    bg.roundRect(-w / 2, -h / 2, w, h, 28)
      .fill({ color: 0xfff6e1 })
      .stroke({ color: 0x4a3010, width: 3 });
    // Tail pointing DOWN at the genie below.
    bg.moveTo(-18, h / 2 - 1).lineTo(0, h / 2 + 28).lineTo(18, h / 2 - 1).closePath()
      .fill({ color: 0xfff6e1 }).stroke({ color: 0x4a3010, width: 3 });
    this.chatBubbleBg = bg;
    c.addChild(bg);

    this.chatBubbleText = new Text({
      text: initialText,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 36,
        fontWeight: 'bold',
        fill: 0x4a3010,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: w - 40,
      }),
    });
    this.chatBubbleText.anchor.set(0.5);
    c.addChild(this.chatBubbleText);
    return c;
  }

/** Honors the persistent `spinButtonPressed` flag so layoutAll() can redraw
   *  without flipping color back to idle. Size scales with viewport (vScale). */
  private drawSpinButton(pressed?: boolean, vScale?: number): void {
    if (pressed != null) this.spinButtonPressed = pressed;
    const s = vScale ?? this.currentVScale;
    const w = SPIN_BTN_W * s;
    const h = SPIN_BTN_H * s;
    const r = SPIN_BTN_R * s;
    const fill = this.spinButtonPressed ? SPIN_GOLD_PRESSED : SPIN_GOLD;
    const stroke = this.spinButtonPressed ? SPIN_BTN_STROKE_PRESSED : SPIN_BTN_STROKE;
    this.spinButtonBg.clear();
    this.spinButtonBg.roundRect(-w / 2, -h / 2, w, h, r)
      .fill({ color: fill })
      .stroke({ color: stroke, width: 4 });

    // Redraw shine mask (matches button shape) + shine bar (sized to button).
    if (this.spinShineMask && this.spinShineBar) {
      this.spinShineMask.clear();
      this.spinShineMask.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0xffffff });
      const barW = 60 * s;
      const barH = h * 2.6;
      this.spinShineBar.clear();
      this.spinShineBar
        .rect(-barW / 2, -barH / 2, barW, barH)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }
  }

  private drawSlotsBackdrop(): void {
    // Full backdrop rect of the masked window.
    this.slotsBackdrop.clear();
    this.slotsBackdrop.rect(-SLOTS_GROUP_W / 2, -SLOTS_GROUP_H / 2, SLOTS_GROUP_W, SLOTS_GROUP_H)
      .fill({ color: SLOTS_TRACK_COLOR });
  }

  private drawSlotsBorder(): void {
    this.slotsBorder.clear();
    this.slotsBorder.rect(-SLOTS_GROUP_W / 2 - 6, -SLOTS_GROUP_H / 2 - 6, SLOTS_GROUP_W + 12, SLOTS_GROUP_H + 12)
      .stroke({ color: BORDER_COLOR, width: 10, alignment: 0.5 });
  }

  private drawSlotsGradients(): void {
    // Top gradient — 8-stripe approximation (cheap fallback for v8 Graphics).
    const stripes = 8;
    const stripeH = 60;
    this.slotsGradientTop.clear();
    for (let i = 0; i < stripes; i++) {
      const a = 1 - i / stripes;
      this.slotsGradientTop.rect(
        -SLOTS_GROUP_W / 2,
        -SLOTS_GROUP_H / 2 + i * (stripeH / stripes),
        SLOTS_GROUP_W,
        stripeH / stripes,
      ).fill({ color: VIGNETTE_COLOR, alpha: a * 0.85 });
    }

    this.slotsGradientBot.clear();
    for (let i = 0; i < stripes; i++) {
      const a = i / stripes;
      this.slotsGradientBot.rect(
        -SLOTS_GROUP_W / 2,
        SLOTS_GROUP_H / 2 - stripeH + i * (stripeH / stripes),
        SLOTS_GROUP_W,
        stripeH / stripes,
      ).fill({ color: VIGNETTE_COLOR, alpha: a * 0.85 });
    }
  }

  private drawSlotsMask(): void {
    this.slotsMask.clear();
    this.slotsMask.rect(-SLOTS_GROUP_W / 2, -SLOTS_GROUP_H / 2, SLOTS_GROUP_W, SLOTS_GROUP_H)
      .fill({ color: 0xffffff });
  }

  // ───────────────────────── Layout ─────────────────────────

  private layoutAll(): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const vScale = Math.min(this.width / REF_W, this.height / REF_H);
    this.currentVScale = vScale;

    // BG flat fill behind the painted BG sprite — covers any gap at extreme aspect ratios
    // so the previous scene (board) never shows through. Same pattern as LuckyWheelScene.bgFlat.
    this.bgFlat.clear();
    this.bgFlat.rect(0, 0, this.width, this.height).fill({ color: 0x2a1b14 });

    // BG painted sprite: pure linear scaling — matches every other UI element via vScale,
    // with a 1.2× extra zoom so the art fills more of the screen.
    // Unity anchored at canvas-center with offset (0, +45) y-up = PIXI -45 y-down.
    if (this.bgSprite && this.bgSprite.texture) {
      this.bgSprite.x = cx;
      this.bgSprite.y = cy - 45 * vScale;
      const tw = this.bgSprite.texture.width || 1;
      const th = this.bgSprite.texture.height || 1;
      const refScale = Math.max(REF_W / tw, REF_H / th);
      const BG_EXTRA_ZOOM = 1.2;
      this.bgSprite.scale.set(refScale * BG_EXTRA_ZOOM * vScale);
    }

    // Dim overlay intentionally not redrawn (visible=false; see enter()).

    // Header banner (root-level — anchored to top of viewport).
    this.headerText.x = cx;
    this.headerText.y = 80 * vScale + 60;
    this.headerText.style.fontSize = Math.max(28, 64 * vScale);

    // Scene unit — single master container, positioned at scene anchor (canvas-center
    // shifted slightly to fit portrait), scaled as one unit by vScale. Children below
    // use unscaled scene-local coords. Mirrors LuckyWheelScene's `wheelContainer`.
    this.sceneUnit.x = cx;
    this.sceneUnit.y = cy;
    if (!this.spinning) {
      this.sceneUnit.scale.set(vScale);
    }
    (this.sceneUnit as Container & { __targetScale?: number }).__targetScale = vScale;

    // ── Scene-unit children (unscaled local coords; scene-center is local 0,0) ──

    // Genie: Unity (+168, +481) y-up. Pull genie further down so it fits in portrait.
    this.genieContainer.x = 168;
    this.genieContainer.y = -220;
    this.genieContainer.scale.set(1);

    // Chat bubble — above genie's visible head.
    this.chatBubble.x = this.genieContainer.x - 120;
    this.chatBubble.y = this.genieContainer.y - GENIE_TARGET_H - 40;
    this.chatBubble.scale.set(1);

    // Slots group — Unity (0, -22) y-up = scene-local (0, +22).
    this.slotsGroup.x = 0;
    this.slotsGroup.y = SLOTS_OFFSET_Y_UNITY * -1;
    this.slotsGroup.scale.set(1);

    // Reels inside slotsGroup (centers x = -210, 0, +210 for 200×300 + 10 gap).
    for (let i = 0; i < this.reels.length; i++) {
      const r = this.reels[i];
      r.container.x = (i - 1) * (REEL_W + REEL_GAP);
      r.container.y = 0;
    }

    this.drawSlotsBackdrop();
    this.drawSlotsGradients();
    this.drawSlotsBorder();
    this.drawSlotsMask();

// SPIN button anchored near bottom of viewport (scales with viewport).
    this.spinButton.x = cx;
    this.spinButton.y = this.height - SPIN_BTN_BOTTOM_OFFSET * vScale;
    this.drawSpinButton(undefined, vScale); // honors pressed flag, no color flip on resize
    this.spinButtonText.style.fontSize = Math.max(24, 44 * vScale);
  }

  // ───────────────────────── Entry animations ─────────────────────────

  private async playEnterAnimations(): Promise<void> {
    const targetScale = (this.sceneUnit as Container & { __targetScale?: number }).__targetScale ?? 1;
    // Scale-in 0 → 1.05 → 1.0 over 167ms (mirrors Unity Scale_In.anim).
    await tween(this.ticker, ENTRY_SCALE_MS, t => {
      if (this.disposed) return;
      let factor: number;
      if (t < 0.5) factor = (t / 0.5) * 1.05;
      else factor = 1.05 + ((t - 0.5) / 0.5) * (1.0 - 1.05);
      this.sceneUnit.scale.set(targetScale * factor);
    });
    if (this.disposed) return;
    this.sceneUnit.scale.set(targetScale);
  }

  // ───────────────────────── Spin logic ─────────────────────────

  private resolveWinningSymbol(): number {
    const r = this.config.reward;
    const w = this.config.winningSymbol;
    if (w != null) {
      // Accept either numeric index or the key name.
      if (typeof w === 'string') {
        const idx = SYMBOLS.findIndex(s => s.key === w);
        if (idx >= 0) return idx;
      } else {
        return ((w % SYMBOL_COUNT) + SYMBOL_COUNT) % SYMBOL_COUNT;
      }
    }
    if (!r) return Math.floor(Math.random() * SYMBOL_COUNT);
    if (r.skill) return 4;             // SKILL
    if (r.coins) return 3;             // COIN
    if ((r.hpPct ?? 0) > 0) return 0;  // HP
    if ((r.atkPct ?? 0) > 0) return 1; // ATK
    return 2;                          // DEF (cosmetic — no stat backing)
  }

  private cyclicDistance(from: number, to: number): number {
    return ((to - from) % SYMBOL_COUNT + SYMBOL_COUNT) % SYMBOL_COUNT;
  }

  private async startSpin(): Promise<void> {
    this.drawSpinButton(true);
    this.spinButtonText.text = 'Spinning...';
    this.chatBubbleText.text = '...';

    const rewardLevel = (this.config.rewardLevel ?? 2) as 1 | 2 | 3;
    const winSymbol = this.resolveWinningSymbol();

    // Per-reel target. First `rewardLevel` reels match; rest pick a different (single fallback) symbol.
    const reelTargets: number[] = [];
    for (let i = 0; i < NUM_REELS; i++) {
      if (i < rewardLevel) {
        reelTargets.push(winSymbol);
      } else {
        // Pick any symbol != winSymbol.
        let s = Math.floor(Math.random() * SYMBOL_COUNT);
        if (s === winSymbol) s = (s + 1) % SYMBOL_COUNT;
        reelTargets.push(s);
      }
    }

    // Reset per-reel tick counters at spin start (mirrors Unity Setup()).
    this.tickCounter = [0, 0, 0];

    // Stagger reels via cumulative startDelay = [0, 400, 1200] ms; all run in parallel.
    const reelPromises: Promise<void>[] = [];
    for (let i = 0; i < NUM_REELS; i++) {
      reelPromises.push(this.runReel(this.reels[i], i, reelTargets[i], i < rewardLevel, REEL_STAGGER_CUMULATIVE_MS[i]));
    }
    await Promise.all(reelPromises);
    if (this.disposed) return;

    // Win punch on every reel (Unity SlotReelsSequence.cs:78-81 — fires regardless of match).
    this.chatBubbleText.text = rewardLevel === 3 ? 'JACKPOT!' : rewardLevel === 2 ? 'Big win!' : 'Nice!';
    await Promise.all(this.reels.map(r => this.playWinPunch(r)));
    if (this.disposed) return;

    await delay(this.ticker, RESULT_HOLD_MS);
    if (this.disposed) return;

    // Apply reward after the celebration so the icon stays bright while the player reads it.
    if (this.config.reward) {
      this.applyStatDelta({ ...this.config.reward });
    }

    this.finished = true;
    this.spinning = false;

    this.resolveDone();
  }

  /** Run one reel: Start tick (no swap) + (numOfSpins-1) Loop ticks (swap-before) + 4 End ticks (swap-before, decelerating). */
  private async runReel(
    reel: ReelVisual,
    slotIdx: number,
    targetSymbolIdx: number,
    isWinning: boolean,
    startDelayMs: number,
  ): Promise<void> {
    if (startDelayMs > 0) await delay(this.ticker, startDelayMs);
    if (this.disposed) return;

    // Compute total Spins (Unity formula).
    const distance = this.cyclicDistance(reel.bottomSymbolIdx, targetSymbolIdx);
    const numOfSpins = MIN_LOOP_TICKS * SYMBOL_COUNT - END_TICK_COUNT + distance; // 16..20
    const loopTicks = numOfSpins - 1;                                              // 15..19

    // Start tick — no swap. Plays one chromatic tick.
    this.playTickSfx(slotIdx);
    await this.runOneTick(reel, TICK_DURATION_MS, /*swapBefore*/ false);
    if (this.disposed) return;

    // Loop ticks — each preceded by a NextSprite snap (cyclic next).
    for (let k = 0; k < loopTicks; k++) {
      this.advanceCyclic(reel);
      this.playTickSfx(slotIdx);
      await this.runOneTick(reel, TICK_DURATION_MS, /*swapBefore*/ true);
      if (this.disposed) return;
    }

    // End ticks — pre-stage so after 4 swaps, upperIcon = target.
    const endQueue = this.buildEndQueue(reel, targetSymbolIdx);
    for (let k = 0; k < END_TICK_COUNT; k++) {
      this.swapTextures(reel, endQueue[k]);
      this.playTickSfx(slotIdx);
      await this.runOneTick(reel, END_TICK_DURATIONS_MS[k], /*swapBefore*/ true);
      if (this.disposed) return;
    }

    reel.finished = true;
    reel.resultSymbol = targetSymbolIdx;
    reel.isWinning = isWinning;

    // Per-Unity behavior: per-slot reward sound on match, otherwise stop sound.
    const pan = REEL_PANS[slotIdx];
    if (isWinning) {
      if (slotIdx === 0) slotsSfx.reward1(1.0, { pan });
      else if (slotIdx === 1) slotsSfx.reward2(1.0, { pan });
      else slotsSfx.reward3(1.0, { pan });
    } else {
      slotsSfx.stop(1.0, { pan });
    }
  }

  /** Tween bottomIcon.y: 0 → +ICON_PITCH (PIXI down). UpperIcon (child at -ICON_PITCH) ends at world y=0 (center). */
  private async runOneTick(reel: ReelVisual, durationMs: number, swapBefore: boolean): Promise<void> {
    if (swapBefore) {
      // Snap back to top before motion (textures already rotated by caller).
      reel.bottomIcon.y = 0;
    }
    await tween(this.ticker, durationMs, t => {
      if (this.disposed) return;
      reel.bottomIcon.y = ICON_PITCH * t;
    }, 1, easeOutQuad);
  }

  /** Advance reel by one cyclic step: bottomTex = upperTex; upperTex = next cyclic. */
  private advanceCyclic(reel: ReelVisual): void {
    const nextUpper = (reel.upperSymbolIdx + 1) % SYMBOL_COUNT;
    this.swapTextures(reel, nextUpper);
  }

  /** Snap bottomIcon back to y=0, set bottomTex = upperTex, set upperTex = newUpperIdx. */
  private swapTextures(reel: ReelVisual, newUpperIdx: number): void {
    reel.bottomIcon.y = 0;
    reel.bottomIcon.texture = this.symbolTextures[reel.upperSymbolIdx];
    reel.bottomSymbolIdx = reel.upperSymbolIdx;
    reel.upperIcon.texture = this.symbolTextures[newUpperIdx];
    reel.upperSymbolIdx = newUpperIdx;
  }

  /** Pre-compute the 4 End-clip swap targets so after the 4th swap, upperIcon = target.
   *  q[0..2] = random non-target symbols (visual variety); q[3] = target. */
  private buildEndQueue(reel: ReelVisual, target: number): number[] {
    const out: number[] = [];
    for (let k = 0; k < END_TICK_COUNT - 1; k++) {
      let s = Math.floor(Math.random() * SYMBOL_COUNT);
      // Avoid picking target for non-final positions (so the player doesn't see the
      // result symbol drift in early — keeps the reveal punchy).
      if (s === target) s = (s + 1) % SYMBOL_COUNT;
      out.push(s);
    }
    out.push(target);
    return out;
  }

  private playTickSfx(slotIdx: number): void {
    const semitone = TICK_SEMITONES[this.tickCounter[slotIdx]++ % TICK_SEMITONES.length];
    const playbackRate = Math.pow(2, semitone / 12);
    slotsSfx.tick(0.9, { playbackRate, pan: REEL_PANS[slotIdx] });
  }

  /** Win punch on every reel: scale UpperIcon (now at center) 1.0 → 1.25 → 1.0. */
  private async playWinPunch(reel: ReelVisual): Promise<void> {
    const target = reel.upperIcon;
    await tween(this.ticker, WIN_PUNCH_RAMP_MS, t => {
      if (this.disposed) return;
      target.scale.set(1 + (WIN_PUNCH_SCALE - 1) * t);
    }, 1, easeOutQuad);
    if (this.disposed) return;
    await delay(this.ticker, WIN_PUNCH_HOLD_MS);
    if (this.disposed) return;
    await tween(this.ticker, WIN_PUNCH_RAMP_MS, t => {
      if (this.disposed) return;
      target.scale.set(WIN_PUNCH_SCALE - (WIN_PUNCH_SCALE - 1) * t);
    }, 1, easeOutQuad);
    target.scale.set(1);
  }
}
