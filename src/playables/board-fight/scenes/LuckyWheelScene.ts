import { Assets, Container, Graphics, Sprite, Text, TextStyle, Ticker } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { Scene } from '@shared/Scene';
import type { PlayerState, StatDelta } from '../PlayerState';
import type { SkillConfig, Rarity } from '../skills';
import { RARITY_COLORS } from '../skills';
import { tween, delay } from '@shared/tween';
import { AnimationCurve } from '@shared/animationCurve';
import * as sfx from '../sfx';
import { luckyWheelSfx } from '../sfx-luckyWheel';
import monkData from 'assets/tiles/monk.webp';
import wheelBgData from 'assets/tiles/wheel_bg.webp';

// Soft full-screen tint behind the wheel scene (Unity's actual modal is a smaller
// 621×1346 panel that's mostly hidden behind the BG; we keep a faint screen tint).
const DIM_ALPHA = 0.25;

const SEGMENT_COUNT = 12;
const SPIN_DURATION_MS = 3000;
const MIN_FULL_SPINS = 3;
const LANDING_HOLD_MS = 1000;

// Unity layout (1080×1920 reference). WheelContainer 950×950, anchored at canvas
// center with anchoredPos (0, +100) in Unity Y-up = PIXI (0, -100) above viewport center.
// Monk 300×300 with bottom-center pivot at WheelContainer-local Unity (0, -100) → PIXI (0, +100).
//
// **The 12 segments form a SQUARE RING (4×4 grid's outer 12 cells), NOT a circle.**
// They sit on top of the BG's stone-tile platform. Positions extracted directly from
// `WiseMonk_LuckyWheelHUD.prefab`'s prefab-instance overrides:
//
//   Reward # | Unity anchored (x, y) from top-left | PIXI local (relative to wheel center)
//   ---------|-------------------------------------|--------------------------------------
//      1     | (91.9,  -125.9)                     | (-383.1, -349.1)  top-left interior
//      2     | (296.8, -125.9)                     | (-178.2, -349.1)  top
//      3     | (500.0, -125.9)                     | ( 25.0, -349.1)   top
//      4     | (703.2, -125.9)                     | ( 228.2, -349.1)  top-right interior
//      5     | (703.2, -324.5)                     | ( 228.2, -150.5)  right
//      6     | (703.2, -523.4)                     | ( 228.2,   48.4)  right
//      7     | (703.2, -722.4)                     | ( 228.2,  247.4)  bottom-right
//      8     | (500.0, -722.4)                     | ( 25.0,  247.4)   bottom
//      9     | (296.8, -722.4)                     | (-178.2,  247.4)  bottom
//     10     | (91.9,  -722.4)                     | (-383.1,  247.4)  bottom-left
//     11     | (91.9,  -523.4)                     | (-383.1,   48.4)  left
//     12     | (91.9,  -324.5)                     | (-383.1, -150.5)  left
//
// Segments are ordered clockwise from the top-left interior tile. Spin advances by +1.
const WHEEL_BOX = 950;
const ICON_BOX = 89;
const MONK_SIZE = 300;

// PIXI-local segment positions relative to wheel container center.
// Calibrated so each segment sits on top of the corresponding stone tile in the BG's
// 4×4 platform (Monk_BG.jpg). Unity's prefab values would be appropriate for a BG
// rendered at 1652×2443 — but our BG is rendered at refScale=1.55 (1240×1919) to fit
// the 1080×1920 viewport, so the tile spacing is narrower. These values place all 12
// segments on the 12 outer tiles of the 4×4 grid.
const SEGMENT_POSITIONS: Array<[number, number]> = [
  [-276, -273], // 0 — top-left
  [ -90, -273], // 1 — top
  [  96, -273], // 2 — top
  [ 282, -273], // 3 — top-right
  [ 282,  -93], // 4 — right
  [ 282,   87], // 5 — right
  [ 282,  266], // 6 — bottom-right
  [  96,  266], // 7 — bottom
  [ -90,  266], // 8 — bottom
  [-276,  266], // 9 — bottom-left
  [-276,   87], // 10 — left
  [-276,  -93], // 11 — left
];

// Monk: anchored at WheelContainer center with bottom-center pivot, anchoredPos (0, -100) Unity → PIXI (0, +100)
const MONK_Y = 100;

// Monk_Chat: Unity anchor=(0.5, 1) top-center, anchoredPos (18.5, -344), pivot (0.525, -1.86).
// Resolving the pivot offset: visible rect center lands at WheelContainer-local Unity (3.5, +506)
// = PIXI (3.5, -506) — well above the top row of segments.
const CHAT_X = 3.5;
const CHAT_Y = -506;
const CHAT_W = 540;
const CHAT_H = 140;
const FOOTER_Y_FROM_BOTTOM = 180;

// Unity rarity colors (ColorMapperPresets.asset → ColorSet_2 mapping)
const RARITY_COLOR: Record<string, number> = {
  common: 0xCCCAE9,
  rare: 0x4FD9F4,
  legendary: 0xFFC600,
  mythic: 0xFE4863,
  great: 0xC5E53C,
  epic: 0xD572FD,
};
const DEFAULT_GOLD = 0xFFC600;

// Unity tick semitones: ascending C-major scale (cycles per advance that actually plays a tick)
const TICK_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12];

// SPIN button dimensions (matches Unity Spin_Button 350×145 at 1080×1920 reference scale).
const SPIN_BTN_W = 400;
const SPIN_BTN_H = 145;
const SPIN_BTN_R = 26;

// Shine sweep on the SPIN button — same pattern as RollButton.
const SPIN_SHINE_CYCLE_MS = 2200;
const SPIN_SHINE_SWEEP_MS = 500;
const SPIN_SHINE_TILT = -Math.PI / 7;

export interface LuckyWheelSceneConfig {
  /** Skill IDs that fill the wheel (typically 12). */
  prizes: string[];
  /** Index of the prize the wheel will land on (deterministic for variant scripting).
   *  Resolved AFTER the prize shuffle, so this index points into the rendered ring. */
  winningIndex?: number;
  /** Skill ID the wheel should land on. Friendlier alternative to `winningIndex`.
   *  If both are set, `winningSkill` wins. The skill must appear in `prizes`. */
  winningSkill?: string;
}

interface SegmentVisual {
  /** Outer fixed-position container — never scales. Anchored on the ring. */
  root: Container;
  /** Inner container that scales 1.0 ↔ 1.2 on glow toggle. Holds the icon + glow + VFX. */
  inner: Container;
  iconHolder: Container;
  iconSprite?: Sprite;
  iconFallback?: Text;
  selectedFrame: Graphics;    // Yellow square outline with GlowFilter (replaces circular glow)
  pulseVfx: Graphics;         // scale 0 by default — animated on win 0→1.1→1.0
  circleVfx: Graphics;        // scale 1 by default — animated 1→0 collapse on win
  raysVfx: Graphics;          // 8-pointed star — rotated 0→90° + scaleY whip on win
  receivedOverlay: Graphics;  // black 50% — shown after received (AFTER the 1s hold)
  baseColor: number;
  hasBeenReceived: boolean;
  skillId: string;
  rarity: Rarity;
}

export class LuckyWheelScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: LuckyWheelSceneConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private allSkills: SkillConfig[];
  private applyStatDelta: (delta: StatDelta) => StatDelta;

  private ready = false;
  private spinning = false;
  private finished = false;
  private disposed = false;

  private bgSprite?: Sprite;
  private bgFlat!: Graphics;
  private dimOverlay!: Graphics;
  private wheelContainer!: Container;
  private monkAnimT = 0; // 0..1 idle breathing animation phase
  private currentVScale = 1; // cached for re-drawing the SPIN button on press
  private segments: SegmentVisual[] = [];
  private monkSprite!: Container;
  private chatBubble!: Container;
  private chatBubbleText!: Text;
  private footerText!: Text;
  private spinButton!: Container;
  private spinButtonBg!: Graphics;
  private spinButtonText!: Text;
  private spinShineContainer!: Container;
  private spinShineMask!: Graphics;
  private spinShineBar!: Graphics;
  private spinShineElapsed = 0;
  private spinButtonPressed = false;

  private currentIndex = 0;
  private targetIndex = 0;

  // Curve from Unity prefab: 2-key Hermite, slopes 3.168 (out at t=0) → 0.024 (in at t=1)
  private curve = new AnimationCurve([
    { time: 0, value: 0, inSlope: 3.1680882, outSlope: 3.1680882 },
    { time: 1, value: 1, inSlope: 0.023883233, outSlope: 0.023883233 },
  ]);

  constructor(
    config: LuckyWheelSceneConfig,
    state: PlayerState,
    ticker: Ticker,
    width: number,
    height: number,
    allSkills: SkillConfig[],
    applyStatDelta: (delta: StatDelta) => StatDelta,
  ) {
    this.container = new Container();
    // Shuffle prizes so the visual order is randomized (variants list them
    // grouped by rarity for readability, but on the wheel itself they should
    // feel scattered). Re-resolve winningIndex to follow the same skill.
    this.config = this.shufflePrizes(config);
    this.state = state;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.allSkills = allSkills;
    this.applyStatDelta = applyStatDelta;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    // ── 1. Background layer (Monk_BG.jpg cover-fit) ─────────────────────
    this.bgFlat = new Graphics();
    this.container.addChild(this.bgFlat);
    try {
      const bgTex = await Assets.load(wheelBgData);
      this.bgSprite = new Sprite(bgTex);
      this.bgSprite.anchor.set(0.5);
      this.container.addChild(this.bgSprite);
    } catch {
      this.bgSprite = undefined;
    }

    // Soft viewport tint (low alpha — preserve forest BG vibrancy).
    this.dimOverlay = new Graphics();
    this.dimOverlay.alpha = 0;
    this.container.addChild(this.dimOverlay);

    // ── 2. WheelContainer (auto Scale_In: 0→1.05→1.0 over 0.167s) ──────
    this.wheelContainer = new Container();
    this.wheelContainer.scale.set(0);
    this.container.addChild(this.wheelContainer);

    // ── 3. Build 12 segments laid out on the SQUARE 4×4-grid ring ──────
    await this.buildSegments();

    // ── 4. Monk: Unity uses bottom-center pivot, anchoredPos (0, -100) Unity = PIXI (0, +100).
    //          So the monk's BOTTOM rests at PIXI Y=+100 (which is screen viewport center).
    this.monkSprite = new Container();
    try {
      const monkTex = await Assets.load(monkData);
      const m = new Sprite(monkTex);
      m.anchor.set(0.5, 1.0); // bottom-center pivot per Unity
      const tw = m.texture.width || 1;
      const th = m.texture.height || 1;
      const scale = MONK_SIZE / Math.max(tw, th);
      m.scale.set(scale);
      this.monkSprite.addChild(m);
    } catch {
      const fallback = new Graphics();
      fallback.circle(0, -MONK_SIZE / 2, MONK_SIZE / 2).fill({ color: 0x8a5a2b }).stroke({ color: 0x4a3010, width: 4 });
      this.monkSprite.addChild(fallback);
    }
    this.wheelContainer.addChild(this.monkSprite);

    // ── 5. Monk_Chat bubble — Unity shows it active above the wheel with descriptive text
    this.chatBubble = this.buildChatBubble();
    this.wheelContainer.addChild(this.chatBubble);

    // ── 6. Footer text below the wheel (Unity-exact copy) ──────────────
    this.footerText = new Text({
      text: 'Meditate to learn a skill',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 38,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x4a3010, width: 6, join: 'round' },
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 800,
      }),
    });
    this.footerText.anchor.set(0.5, 0.5);
    this.container.addChild(this.footerText);

    // ── 7. SPIN button anchored at viewport bottom ──────────────────────
    this.spinButton = new Container();
    this.spinButtonBg = new Graphics();
    this.drawSpinButton(false);
    this.spinButton.addChild(this.spinButtonBg);

    // Shine sweep — masked to the button shape (mirrors RollButton's approach).
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
      sfx.buttonClick();
      void this.startSpin();
    });
    this.container.addChild(this.spinButton);

    this.layoutAll();

    // ── 8. Play entry animations (dim fade-in + container scale-in) ────
    void this.playEnterAnimations();

    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);
  }

  async exit(): Promise<void> {
    this.disposed = true;
  }

  update(deltaMS: number): void {
    if (!this.ready || this.disposed) return;
    // Monk breathing animation (Unity NPC_Generic_Idle.anim, 2s cycle)
    // scale x: 1 → 0.95 → 1.0; scale y: 1 → 1.05 → 1.0  (ping-pong)
    this.monkAnimT = (this.monkAnimT + deltaMS / 2000) % 1;
    const phase = this.monkAnimT < 0.5
      ? this.monkAnimT * 2          // 0 → 1
      : (1 - this.monkAnimT) * 2;   // 1 → 0
    if (this.monkSprite) {
      this.monkSprite.scale.set(1 + (0.95 - 1) * phase, 1 + (1.05 - 1) * phase);
    }

    // SPIN button shine sweep — hidden while spinning/finished, visible while idle.
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

  pause(): void { this.container.interactiveChildren = false; }
  resume(): void { this.container.interactiveChildren = true; }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) return;
    this.layoutAll();
  }

  // ───────────────────────── Build helpers ─────────────────────────

  private async buildSegments(): Promise<void> {
    const skillById = new Map(this.allSkills.map(s => [s.id, s]));
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const skillId = this.config.prizes[i] ?? '';
      const skill = skillById.get(skillId);
      const rarity: Rarity = skill?.rarity ?? 'common';
      const baseColor = RARITY_COLOR[rarity] ?? DEFAULT_GOLD;

      const root = new Container();
      const inner = new Container(); // scales 1.0 ↔ 1.2 on glow
      const iconHolder = new Container();
      root.addChild(inner);

      // ── Skill icon frame (LevelUp-style) ──────────────────────────
      // Mirrors LevelUpScene's iconBorder: outer black → rarity-tinted skillBorder
      // → skillBg fill. Same proportions as level-up cards (3.5px rarity border,
      // 1.5px black outline) so skills look identical across screens.
      const SLOT_SIZE = 100;
      const colors = RARITY_COLORS[rarity] ?? RARITY_COLORS.common;
      const borderW = 4;
      const outW = 1.8;
      const totalW = borderW + outW;
      const slotFrame = new Graphics();
      slotFrame.roundRect(-SLOT_SIZE / 2 - totalW, -SLOT_SIZE / 2 - totalW, SLOT_SIZE + totalW * 2, SLOT_SIZE + totalW * 2, 9)
        .fill({ color: 0x000000 });
      slotFrame.roundRect(-SLOT_SIZE / 2 - borderW, -SLOT_SIZE / 2 - borderW, SLOT_SIZE + borderW * 2, SLOT_SIZE + borderW * 2, 8)
        .fill({ color: colors.skillBorder });
      slotFrame.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 7)
        .fill({ color: colors.skillBg });
      inner.addChild(slotFrame);

      // Selected frame: bright yellow square outline matching slot shape, with a
      // GlowFilter halo for the highlight effect (replaces the old circle glow).
      const selectedFrame = new Graphics();
      selectedFrame
        .roundRect(-SLOT_SIZE / 2 - borderW, -SLOT_SIZE / 2 - borderW, SLOT_SIZE + borderW * 2, SLOT_SIZE + borderW * 2, 8)
        .stroke({ color: 0xFFD93B, width: 5, alignment: 0.5 });
      selectedFrame.filters = [new GlowFilter({
        color: 0xFFD93B,
        distance: 18,
        outerStrength: 4,
        innerStrength: 0,
        quality: 0.5,
      })];
      selectedFrame.visible = false;
      inner.addChild(selectedFrame);

      // Pulse VFX (always in hierarchy, scale 0 default; animates on win)
      const pulseVfx = new Graphics();
      pulseVfx.circle(0, 0, ICON_BOX * 0.95).fill({ color: baseColor, alpha: 0.45 });
      pulseVfx.scale.set(0);
      inner.addChild(pulseVfx);

      // Circle VFX (always in hierarchy, scale 1 default; collapses 1→0 on win)
      const circleVfx = new Graphics();
      circleVfx.circle(0, 0, ICON_BOX * 0.6).fill({ color: baseColor, alpha: 0.35 });
      circleVfx.scale.set(0);
      inner.addChild(circleVfx);

      // Rays VFX (always in hierarchy, scale 0 default; rotates + Y-whips on win)
      const raysVfx = new Graphics();
      this.drawRays(raysVfx, baseColor, ICON_BOX * 1.0);
      raysVfx.scale.set(0);
      inner.addChild(raysVfx);

      // Skill icon — sized to ~80% of frame (matches LevelUp icon proportion)
      const iconRenderSize = SLOT_SIZE * 0.8;
      let iconSprite: Sprite | undefined;
      let iconFallback: Text | undefined;
      if (skill?.icon) {
        try {
          const tex = await Assets.load(skill.icon);
          const sp = new Sprite(tex);
          sp.anchor.set(0.5);
          const tw = sp.texture.width || 1;
          const th = sp.texture.height || 1;
          const scale = iconRenderSize / Math.max(tw, th);
          sp.scale.set(scale);
          iconSprite = sp;
          iconHolder.addChild(sp);
        } catch {
          iconFallback = this.makeFallbackText(skillId, baseColor);
          iconHolder.addChild(iconFallback);
        }
      } else {
        iconFallback = this.makeFallbackText(skillId, baseColor);
        iconHolder.addChild(iconFallback);
      }
      inner.addChild(iconHolder);

      // Received overlay — covers the full slot, shown AFTER the hold completes
      const receivedOverlay = new Graphics();
      receivedOverlay.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 7)
        .fill({ color: 0x000000, alpha: 0.55 });
      receivedOverlay.visible = false;
      inner.addChild(receivedOverlay);

      this.wheelContainer.addChild(root);

      this.segments.push({
        root, inner, iconHolder, iconSprite, iconFallback,
        selectedFrame, pulseVfx, circleVfx, raysVfx, receivedOverlay,
        baseColor, hasBeenReceived: false, skillId, rarity,
      });
    }

    // Initial highlight on segment 0 (Unity does this at sequence start)
    this.setGlow(0, true);
    this.currentIndex = 0;
  }

  private makeFallbackText(skillId: string, color: number): Text {
    const id = skillId || '?';
    const t = new Text({
      text: id.charAt(0).toUpperCase(),
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 44,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: this.darken(color, 0.4), width: 4, join: 'round' },
      }),
    });
    t.anchor.set(0.5);
    return t;
  }

  private buildChatBubble(): Container {
    const c = new Container();
    const bg = new Graphics();
    // Bubble body
    bg.roundRect(-CHAT_W / 2, -CHAT_H / 2, CHAT_W, CHAT_H, 28)
      .fill({ color: 0xfff6e1 })
      .stroke({ color: 0x4a3010, width: 3 });
    // Tail pointing DOWN at the monk (chat sits above monk)
    bg.moveTo(-18, CHAT_H / 2 - 1).lineTo(0, CHAT_H / 2 + 28).lineTo(18, CHAT_H / 2 - 1).closePath()
      .fill({ color: 0xfff6e1 }).stroke({ color: 0x4a3010, width: 3 });
    c.addChild(bg);

    this.chatBubbleText = new Text({
      text: 'Spin to learn a skill!',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 38,
        fontWeight: 'bold',
        fill: 0x4a3010,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: CHAT_W - 40,
      }),
    });
    this.chatBubbleText.anchor.set(0.5);
    c.addChild(this.chatBubbleText);
    return c;
  }

  private drawRays(g: Graphics, color: number, radius: number): void {
    const points: number[] = [];
    const inner = radius * 0.35;
    const outer = radius;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      points.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    g.poly(points).fill({ color, alpha: 0.85 });
  }

  private shufflePrizes(cfg: LuckyWheelSceneConfig): LuckyWheelSceneConfig {
    const prizes = cfg.prizes.slice();
    // Capture the winning skill's identity *before* shuffling so we can
    // re-locate it afterwards.
    let winningSkillId: string | undefined;
    if (cfg.winningIndex != null) {
      const wi = ((cfg.winningIndex % prizes.length) + prizes.length) % prizes.length;
      winningSkillId = prizes[wi];
    }
    // Fisher–Yates shuffle.
    for (let i = prizes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
    }
    let winningIndex = cfg.winningIndex;
    if (winningSkillId != null) {
      const idx = prizes.indexOf(winningSkillId);
      if (idx >= 0) winningIndex = idx;
    }
    return { ...cfg, prizes, winningIndex };
  }

  private darken(color: number, factor: number): number {
    const r = Math.floor(((color >> 16) & 0xff) * factor);
    const g = Math.floor(((color >> 8) & 0xff) * factor);
    const b = Math.floor((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  // ───────────────────────── Layout ─────────────────────────

  private layoutAll(): void {
    // Linear ratio-based scale anchored to Unity's 1080×1920 PORTRAIT reference.
    // Use min ratio across both dimensions so the wheel + modal fit any orientation
    // (portrait OR landscape) without breaking. Matches FightScene's behavior of scaling
    // proportionally with the viewport.
    const vScale = Math.min(this.width / 1080, this.height / 1920);
    this.currentVScale = vScale;

    // Background — flat fill behind, then BG sprite scaled with vScale (matches the
    // wheel/modal scaling instead of cover-fit which zooms the BG independently).
    this.bgFlat.clear();
    this.bgFlat.rect(0, 0, this.width, this.height).fill({ color: 0x2a1b14 });
    if (this.bgSprite) {
      this.bgSprite.x = this.width / 2;
      this.bgSprite.y = this.height / 2;
      const tw = this.bgSprite.texture.width || 1;
      const th = this.bgSprite.texture.height || 1;
      // Reference: cover-fit on 1080×1920 portrait. Then scale linearly with vScale.
      // Pure linear scaling: matches every other UI element via vScale, with a 1.2× extra
      // zoom so the BG art fills more of the screen. The flat fill (this.bgFlat) behind
      // covers any gaps at extreme aspect ratios so the previous scene never shows through.
      const refScale = Math.max(1080 / tw, 1920 / th);
      const BG_EXTRA_ZOOM = 1.2;
      this.bgSprite.scale.set(refScale * BG_EXTRA_ZOOM * vScale);
    }

    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: DIM_ALPHA });

    const cx = this.width / 2;
    const cy = this.height / 2;

    // (Modal panel removed — segments now sit directly on the BG's 4×4 stone platform)

    // Don't overwrite scale during entry animation. Layout stashes target scale on the container.
    if (this.wheelContainer.scale.x > 0.01) {
      this.wheelContainer.scale.set(vScale);
    }
    (this.wheelContainer as Container & { __targetScale?: number }).__targetScale = vScale;

    // WheelContainer at Unity (0, +100) Unity-Y-up = PIXI (cx, cy - 100*scale)
    this.wheelContainer.x = cx;
    this.wheelContainer.y = cy - 100 * vScale;

    // Position 12 segments at Unity-extracted SQUARE-RING coordinates (4×4 outer cells).
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const [x, y] = SEGMENT_POSITIONS[i];
      const seg = this.segments[i];
      seg.root.x = x;
      seg.root.y = y;
    }

    // Monk: anchored at WheelContainer center, bottom at PIXI Y=+100 (= viewport center on screen)
    this.monkSprite.x = 0;
    this.monkSprite.y = MONK_Y;

    // Chat bubble: visible center at PIXI (3.5, -506) — above the top row of segments.
    this.chatBubble.x = CHAT_X;
    this.chatBubble.y = CHAT_Y;

    // Footer text below the wheel (in screen-space, viewport-relative).
    const footerY = this.wheelContainer.y + (WHEEL_BOX / 2) * vScale + 30 * vScale;
    this.footerText.x = cx;
    this.footerText.y = Math.min(footerY, this.height - 160 * vScale);
    this.footerText.style.fontSize = Math.max(20, 38 * vScale);

    // SPIN button anchored near bottom of viewport (scales with viewport).
    this.spinButton.x = cx;
    this.spinButton.y = this.height - FOOTER_Y_FROM_BOTTOM * vScale;
    this.drawSpinButton(undefined, vScale); // honors pressed flag, no color flip on resize
    this.spinButtonText.style.fontSize = Math.max(24, 44 * vScale);
  }

  /** Honors the persistent `spinButtonPressed` flag so layoutAll() can redraw
   *  without flipping color back to idle. Size scales with viewport (vScale). */
  private drawSpinButton(pressed?: boolean, vScale?: number): void {
    if (pressed != null) this.spinButtonPressed = pressed;
    const s = vScale ?? this.currentVScale;
    const w = SPIN_BTN_W * s;
    const h = SPIN_BTN_H * s;
    const r = SPIN_BTN_R * s;
    // Pressed/disabled state = neutral gray; idle = Unity gold.
    const fill = this.spinButtonPressed ? 0x6e6e76 : DEFAULT_GOLD;
    const stroke = this.spinButtonPressed ? 0x3a3a40 : 0x4a3010;
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

  // ───────────────────────── Entry animations ─────────────────────────

  private async playEnterAnimations(): Promise<void> {
    const targetScale = (this.wheelContainer as Container & { __targetScale?: number }).__targetScale ?? 1;
    // Mirrors Unity's Fade_In.anim (CanvasGroup alpha 0→1 over 167ms) +
    // Scale_In.anim (0,0,0)→(1.05,1.05)→(1,1) over 167ms.
    void tween(this.ticker, 167, t => {
      this.dimOverlay.alpha = t;
    });
    await tween(this.ticker, 167, t => {
      // 0 → 1.05 over first half, then 1.05 → 1.0 over second half (overshoot settle)
      let factor: number;
      if (t < 0.5) {
        factor = (t / 0.5) * 1.05;
      } else {
        factor = 1.05 + ((t - 0.5) / 0.5) * (1.0 - 1.05);
      }
      this.wheelContainer.scale.set(targetScale * factor);
    });
    this.wheelContainer.scale.set(targetScale);
  }

  // ───────────────────────── Spin logic ─────────────────────────

  private setGlow(index: number, on: boolean): void {
    const seg = this.segments[index];
    if (!seg) return;
    seg.selectedFrame.visible = on;
    // Unity: parent localScale (1.2,1.2,1.2) on the Selected node.
    // Approximation: scale the inner segment container 1.0 ↔ 1.2.
    seg.inner.scale.set(on ? 1.2 : 1.0);
  }

  /**
   * Distance from `from` to `to` clockwise, skipping already-received slots
   * (matches Unity's GetDistanceToReward).
   */
  private cwDistance(from: number, to: number, count: number, segments: SegmentVisual[]): number {
    if (from === to) return 0;
    let steps = 0;
    let i = (from + 1) % count;
    while (i !== from) {
      if (!segments[i].hasBeenReceived) {
        steps++;
        if (i === to) return steps;
      }
      i = (i + 1) % count;
    }
    return steps;
  }

  private async startSpin(): Promise<void> {
    if (this.spinning || this.finished || this.disposed) return;
    this.spinning = true;

    this.drawSpinButton(true);
    this.spinButton.eventMode = 'none';
    this.spinButton.cursor = 'default';
    this.spinButtonText.text = 'Spinning...';
    this.chatBubbleText.text = '...';

    // Pick winning index. Priority: winningSkill (look up by ID) > winningIndex > random.
    let resolvedIndex: number | null = null;
    if (this.config.winningSkill != null) {
      const idx = this.segments.findIndex(s => s.skillId === this.config.winningSkill);
      if (idx >= 0) resolvedIndex = idx;
    }
    if (resolvedIndex == null && this.config.winningIndex != null) {
      resolvedIndex = ((this.config.winningIndex % SEGMENT_COUNT) + SEGMENT_COUNT) % SEGMENT_COUNT;
    }
    if (resolvedIndex != null) {
      this.targetIndex = resolvedIndex;
      // If target is already received (shouldn't happen on a fresh wheel), re-pick.
      if (this.segments[this.targetIndex]?.hasBeenReceived) {
        const available = this.segments.map((s, i) => (!s.hasBeenReceived ? i : -1)).filter(i => i >= 0);
        this.targetIndex = available[0] ?? 0;
      }
    } else {
      const available = this.segments
        .map((s, i) => (!s.hasBeenReceived ? i : -1))
        .filter(i => i >= 0);
      this.targetIndex = available[Math.floor(Math.random() * available.length)] ?? 0;
    }

    const receivedCount = this.segments.filter(s => s.hasBeenReceived).length;
    const distance = this.cwDistance(this.currentIndex, this.targetIndex, SEGMENT_COUNT, this.segments);
    const totalTicks = distance + MIN_FULL_SPINS * (SEGMENT_COUNT - receivedCount);

    let prevDelay = 0;
    let toneIdx = 0;

    // Unity's loop: `i` is preserved when a received slot is skipped (Unity does i--; continue).
    let i = 0;
    while (i < totalTicks) {
      if (this.disposed) return;
      // Skip-already-received: silently pass through without consuming an iteration
      if (this.segments[this.currentIndex].hasBeenReceived && i > 0) {
        this.setGlow(this.currentIndex, false);
        this.currentIndex = (this.currentIndex + 1) % SEGMENT_COUNT;
        // No i++ — match Unity's i-- + outer-loop i++ cancellation
        continue;
      }

      const u = (i + 1) / totalTicks;
      const t = 1 - this.curve.evaluate(1 - u);
      const currDelay = t * SPIN_DURATION_MS;
      const wait = Math.max(0, currDelay - prevDelay);
      if (wait > 0) await delay(this.ticker, wait);
      if (this.disposed) return;

      // Advance highlight one slot clockwise
      this.setGlow(this.currentIndex, false);
      this.currentIndex = (this.currentIndex + 1) % SEGMENT_COUNT;
      this.setGlow(this.currentIndex, true);

      // Tick SFX with chromatic pitch (skipped on the very last advance, per Unity)
      if (i + 1 < totalTicks) {
        const semitone = TICK_SEMITONES[toneIdx % TICK_SEMITONES.length];
        toneIdx++;
        const playbackRate = Math.pow(2, semitone / 12);
        luckyWheelSfx.tick(0.9, { playbackRate });
      }

      prevDelay = currDelay;
      i++;
    }

    // Land — skip any received slots forward
    while (this.segments[this.currentIndex].hasBeenReceived) {
      this.currentIndex = (this.currentIndex + 1) % SEGMENT_COUNT;
    }
    const landed = this.segments[this.currentIndex];
    landed.selectedFrame.visible = true;
    landed.inner.scale.set(1.2);

    // Win SFX (Unity: stopSound, no pitch shift)
    sfx.rewardReceived(1.0);

    // Win pulse — root squash-stretch + rays rotate 0→90° + scaleY whip + pulse 0→1.1→1 + circle 1→0
    await Promise.all([
      this.playLandedRootBounce(landed),
      this.playRaysAnimation(landed),
      this.playPulseAnimation(landed),
      this.playCircleVfxAnimation(landed),
    ]);

    if (this.disposed) return;

    // Hold the icon bright + glowing for 1s (Unity keeps the icon visible during the hold)
    await delay(this.ticker, LANDING_HOLD_MS);
    if (this.disposed) return;

    // Award AFTER the hold (Unity calls LearnSkill + ShowSkillReward after _wheel.SpinWheel returns)
    if (landed.skillId) {
      this.applyStatDelta({ skill: landed.skillId });
      this.chatBubbleText.text = 'A new skill!';
    }

    // Mark received AFTER the hold so the icon stays bright through the celebration
    landed.hasBeenReceived = true;
    landed.receivedOverlay.visible = true;

    this.finished = true;
    this.spinning = false;

    // Director handles scene transition — no fade-out here.
    this.resolveDone();
  }

  private async playLandedRootBounce(seg: SegmentVisual): Promise<void> {
    // Unity legacy clip: scale x: 1 → 0.9 (0.083s) → 1.1 (0.167s) → 1.0 (0.25s)
    //                   scale y: 1 → 1.073 (0.083s) → 1.1 (0.167s) → 1.0 (0.25s)
    await tween(this.ticker, 250, t => {
      let sx: number, sy: number;
      if (t < 0.333) {
        const u = t / 0.333;
        sx = 1 + (0.9 - 1) * u;
        sy = 1 + (1.073 - 1) * u;
      } else if (t < 0.667) {
        const u = (t - 0.333) / 0.334;
        sx = 0.9 + (1.1 - 0.9) * u;
        sy = 1.073 + (1.1 - 1.073) * u;
      } else {
        const u = (t - 0.667) / 0.333;
        sx = 1.1 + (1.0 - 1.1) * u;
        sy = 1.1 + (1.0 - 1.1) * u;
      }
      // Apply on root (the outer fixed-position container) so the squash is visible
      seg.root.scale.set(sx * 1, sy * 1);
    });
    seg.root.scale.set(1, 1);
  }

  private async playRaysAnimation(seg: SegmentVisual): Promise<void> {
    // Unity: rotation 0 → 90° over 0.333s, scaleY 1→10 (peak 0.083s) → 1 (0.333s), alpha 1→0 (0.333s)
    seg.raysVfx.scale.set(1, 1);
    seg.raysVfx.alpha = 1;
    seg.raysVfx.rotation = 0;
    await tween(this.ticker, 333, t => {
      seg.raysVfx.rotation = t * (Math.PI / 2);
      let sy: number;
      if (t < 0.25) {
        sy = 1 + (10 - 1) * (t / 0.25);
      } else {
        sy = 10 + (1 - 10) * ((t - 0.25) / 0.75);
      }
      seg.raysVfx.scale.set(1, sy);
      seg.raysVfx.alpha = 1 - t;
    });
    seg.raysVfx.alpha = 0;
    seg.raysVfx.scale.set(0);
  }

  private async playPulseAnimation(seg: SegmentVisual): Promise<void> {
    // Unity: scale 0 → 1.05 (0.083s) → 1.1 (0.167s peak) → 1.0 (0.25s settle); alpha 1→0 over 0.583s
    seg.pulseVfx.scale.set(0);
    seg.pulseVfx.alpha = 1;
    await Promise.all([
      tween(this.ticker, 250, t => {
        let s: number;
        if (t < 0.333) {
          // 0 → 1.05 over first 83ms (33% of 250ms)
          s = (t / 0.333) * 1.05;
        } else if (t < 0.667) {
          // 1.05 → 1.10 over next 84ms
          s = 1.05 + ((t - 0.333) / 0.334) * (1.10 - 1.05);
        } else {
          // 1.10 → 1.0 over last 83ms
          s = 1.10 + ((t - 0.667) / 0.333) * (1.0 - 1.10);
        }
        seg.pulseVfx.scale.set(s);
      }),
      tween(this.ticker, 583, t => {
        seg.pulseVfx.alpha = 1 - t;
      }),
    ]);
    seg.pulseVfx.scale.set(0);
    seg.pulseVfx.alpha = 0;
  }

  private async playCircleVfxAnimation(seg: SegmentVisual): Promise<void> {
    // Unity: scale starts at 1 and collapses to 0 over 0.167s; alpha 1→0 over 0.167s
    seg.circleVfx.scale.set(1);
    seg.circleVfx.alpha = 1;
    await tween(this.ticker, 167, t => {
      const s = 1 - t;
      seg.circleVfx.scale.set(s);
      seg.circleVfx.alpha = 1 - t;
    });
    seg.circleVfx.scale.set(0);
    seg.circleVfx.alpha = 0;
  }
}
