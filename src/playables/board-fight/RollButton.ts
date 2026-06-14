import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import * as sfx from './sfx';
import { DOT_PATTERNS } from './dicePips';

export interface RollButtonAssets {
  button: string;
  back: string;
  front: string;
}

export type DiceMode = '2d' | '3d';

// 2D dice rendering constants (used only in '2d' mode)
const DIE_SIZE = 160;
const DIE_CORNER = 18;
const DOT_RADIUS = 13;
const DOT_SPREAD = 40;
const DIE_GAP = 24;
const ROLL_FACE_INTERVAL = 60;
const DIE1_SETTLE_MS = 300;
const DIE2_SETTLE_MS = 325;

const SHINE_CYCLE_MS = 2200;
const SHINE_SWEEP_MS = 400;
const SHINE_TILT = -Math.PI / 7;
const BUTTON_REENABLE_MS = 120;

// Idle-pulse on the red button sprite (opt-in via setPulsing).
// Phase is driven externally via setPulsePhase() so the pulse can sync with
// another animation (e.g. the FTUE hand bob in BoardScene).
const PULSE_AMP = 0.02;

// Map DOT_PATTERNS (unit coords −1/0/1) to pixel coords for 2D dice.
function drawDieFace(g: Graphics, value: number): void {
  g.clear();
  g.roundRect(-DIE_SIZE / 2, -DIE_SIZE / 2, DIE_SIZE, DIE_SIZE, DIE_CORNER)
    .fill({ color: 0xffffff })
    .stroke({ color: 0x000000, width: 3 });
  for (const dot of DOT_PATTERNS[value]) {
    g.circle(dot.x * DOT_SPREAD, dot.y * DOT_SPREAD, DOT_RADIUS).fill({ color: 0x000000 });
  }
}

function randomFace(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export class RollButton {
  readonly container: Container;
  private buttonSprite!: Sprite;
  private btnTargetY = 0;
  private enabled = true;
  private onRoll: (die1: number, die2: number) => void;
  private mode: DiceMode;

  // 2D dice visuals (null in 3D mode)
  private diceContainer: Container | null = null;
  private die1Gfx: Graphics | null = null;
  private die2Gfx: Graphics | null = null;

  // Shine sweep on the red button
  private shineContainer!: Container;
  private shineBar!: Graphics;
  private shineSweepRange = 0;
  private shineCenterX = 0;
  private shineElapsed = 0;

  // Roll state
  private rolling = false;
  private rollElapsed = 0;
  private lastSwapTime = 0;
  private die1Final = 1;
  private die2Final = 1;
  private die1Settled = false;
  private die2Settled = false;
  private dismissing = false;
  private dismissProgress = 0;
  private reenableTimer = 0;
  private nextScriptedTotal: number | null = null;
  private pulsing = false;
  private pulsePhase = 0; // radians, driven externally via setPulsePhase

  private constructor(onRoll: (die1: number, die2: number) => void, mode: DiceMode) {
    this.container = new Container();
    this.onRoll = onRoll;
    this.mode = mode;
  }

  static async create(
    assets: RollButtonAssets,
    onRoll: (die1: number, die2: number) => void,
    mode: DiceMode = '2d',
  ): Promise<RollButton> {
    const btn = new RollButton(onRoll, mode);
    await btn.setup(assets);
    return btn;
  }

  private async setup(assets: RollButtonAssets): Promise<void> {
    const [btnTex, backTex, frontTex] = await Promise.all([
      Assets.load(assets.button),
      Assets.load(assets.back),
      Assets.load(assets.front),
    ]);

    const back = new Sprite(backTex);
    back.anchor.set(0.5, 0.88);

    const front = new Sprite(frontTex);
    front.anchor.set(0.5, 0.5);
    front.y = 100;

    const btn = new Sprite(btnTex);
    btn.anchor.set(0.48, 0.92);
    this.buttonSprite = btn;

    // Dice visuals (2D mode only)
    if (this.mode === '2d') {
      this.diceContainer = new Container();
      this.diceContainer.visible = false;
      this.die1Gfx = new Graphics();
      this.die1Gfx.x = -(DIE_SIZE / 2 + DIE_GAP / 2);
      this.die2Gfx = new Graphics();
      this.die2Gfx.x = DIE_SIZE / 2 + DIE_GAP / 2;
      drawDieFace(this.die1Gfx, 1);
      drawDieFace(this.die2Gfx, 1);
      this.diceContainer.addChild(this.die1Gfx, this.die2Gfx);
    }

    // Shine sweep — masked to the button shape.
    this.shineContainer = new Container();
    const shineMask = new Sprite(btnTex);
    shineMask.anchor.set(0.48, 0.92);

    const centerX = btnTex.width * (0.5 - 0.48);
    const centerY = btnTex.height * (0.5 - 0.92);
    const shineH = btnTex.height * 1.8;

    this.shineBar = new Graphics()
      .rect(-40, -shineH / 2, 80, shineH)
      .fill({ color: 0xffffff, alpha: 0.25 });
    this.shineBar.rotation = SHINE_TILT;
    this.shineBar.y = centerY;

    this.shineContainer.addChild(shineMask, this.shineBar);
    this.shineContainer.mask = shineMask;
    this.shineCenterX = centerX;
    this.shineSweepRange = btnTex.width * 1.3;

    const children: Container[] = [back, btn, this.shineContainer, front];
    if (this.diceContainer) children.push(this.diceContainer);
    this.container.addChild(...children);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.on('pointerdown', () => this.roll());
  }

  private roll(): void {
    if (!this.enabled) return;

    if (this.nextScriptedTotal != null) {
      const total = this.nextScriptedTotal;
      const min1 = Math.max(1, total - 6);
      const max1 = Math.min(6, total - 1);
      this.die1Final = min1 + Math.floor(Math.random() * (max1 - min1 + 1));
      this.die2Final = total - this.die1Final;
      this.nextScriptedTotal = null;
    } else {
      this.die1Final = randomFace();
      this.die2Final = randomFace();
    }

    sfx.buttonClick();

    if (this.mode === '2d') {
      // Schedule vibration from user-gesture context (required by some WebViews)
      setTimeout(() => { try { navigator?.vibrate?.(40); } catch { /* unsupported */ } }, DIE2_SETTLE_MS);
      this.rolling = true;
      this.rollElapsed = 0;
      this.lastSwapTime = 0;
      this.die1Settled = false;
      this.die2Settled = false;
      if (this.diceContainer) {
        this.diceContainer.visible = true;
        this.diceContainer.scale.set(1);
      }
      this.dismissing = false;
      this.dismissProgress = 0;
    } else {
      // 3D mode: BoardScene/BoardDice owns the animation and SFX; button just sinks.
      this.rolling = true;
    }

    this.btnTargetY = 90;
    this.enabled = false;

    this.onRoll(this.die1Final, this.die2Final);
  }

  /** Called by BoardScene when dice have settled. */
  finishRoll(): void {
    if (this.mode === '2d') {
      this.dismissing = true;
      this.dismissProgress = 0;
      this.btnTargetY = 0;
      // 2D mode re-enables inside the dismiss animation (update() loop).
    } else {
      this.rolling = false;
      this.btnTargetY = 0;
      this.reenableTimer = BUTTON_REENABLE_MS;
    }
  }

  setNextRoll(total: number | null): void {
    this.nextScriptedTotal = total;
  }

  /** Enable/disable the idle-pulse on the red button sprite. */
  setPulsing(active: boolean): void {
    if (active === this.pulsing) return;
    this.pulsing = active;
    this.pulsePhase = 0;
    if (!active) this.buttonSprite.scale.set(1);
  }

  /** Drive the pulse phase externally (e.g. sync to FTUE hand bob). Radians. */
  setPulsePhase(phase: number): void {
    this.pulsePhase = phase;
  }

  update(deltaMS: number): void {
    // Button press/release animation
    const diff = this.btnTargetY - this.buttonSprite.y;
    if (Math.abs(diff) < 0.5) {
      this.buttonSprite.y = this.btnTargetY;
    } else {
      this.buttonSprite.y += diff * 0.75;
    }

    // Re-enable input after rise delay (3D mode)
    if (this.reenableTimer > 0) {
      this.reenableTimer -= deltaMS;
      if (this.reenableTimer <= 0) {
        this.reenableTimer = 0;
        this.enabled = true;
      }
    }

    // Idle pulse on the red button — only when enabled and not rolling.
    if (this.pulsing && this.enabled && !this.rolling && !this.dismissing) {
      const s = 1 - Math.sin(this.pulsePhase) * PULSE_AMP;
      this.buttonSprite.scale.set(s);
    } else if (this.buttonSprite.scale.x !== 1) {
      this.buttonSprite.scale.set(1);
    }

    // Shine sweep — follows button press, hidden while rolling/dismissing.
    this.shineContainer.y = this.buttonSprite.y;
    if (this.enabled && !this.rolling && !this.dismissing) {
      this.shineElapsed += deltaMS;
      const cyclePos = this.shineElapsed % SHINE_CYCLE_MS;
      if (cyclePos < SHINE_SWEEP_MS) {
        const t = cyclePos / SHINE_SWEEP_MS;
        this.shineBar.x = this.shineCenterX - this.shineSweepRange / 2 + this.shineSweepRange * t;
        this.shineBar.visible = true;
      } else {
        this.shineBar.visible = false;
      }
    } else {
      this.shineBar.visible = false;
    }

    if (this.mode !== '2d') return;

    // 2D dice dismiss animation
    if (this.dismissing) {
      this.dismissProgress += deltaMS / 150;
      if (this.dismissProgress >= 1) {
        this.dismissing = false;
        if (this.diceContainer) {
          this.diceContainer.visible = false;
          this.diceContainer.scale.set(1);
        }
        this.enabled = true;
      } else {
        const s = 1 - this.dismissProgress;
        if (this.diceContainer) this.diceContainer.scale.set(s);
      }
    }

    // 2D dice roll animation
    if (!this.rolling) return;

    this.rollElapsed += deltaMS;

    const shouldSwap = this.rollElapsed - this.lastSwapTime >= ROLL_FACE_INTERVAL;

    if (!this.die1Settled && this.die1Gfx) {
      if (this.rollElapsed >= DIE1_SETTLE_MS) {
        drawDieFace(this.die1Gfx, this.die1Final);
        this.die1Settled = true;
      } else if (shouldSwap) {
        drawDieFace(this.die1Gfx, randomFace());
      }
    }

    if (!this.die2Settled && this.die2Gfx) {
      if (this.rollElapsed >= DIE2_SETTLE_MS) {
        drawDieFace(this.die2Gfx, this.die2Final);
        this.die2Settled = true;
      } else if (shouldSwap) {
        drawDieFace(this.die2Gfx, randomFace());
      }
    }

    if (shouldSwap) this.lastSwapTime = this.rollElapsed;

    if (this.die1Settled && this.die2Settled) {
      this.rolling = false;
    }
  }

  layout(screenWidth: number, screenHeight: number): void {
    const shortSide = Math.min(screenWidth, screenHeight);
    const vScale = shortSide >= 390 ? 1 : shortSide / 390;
    const scale = 0.31 * vScale;
    this.container.scale.set(scale);
    this.container.x = screenWidth / 2;
    this.container.y = screenHeight - 50 * scale;

    // Position 2D dice at top of screen (in container-local coords)
    if (this.diceContainer) {
      const containerScreenY = screenHeight - 50 * scale;
      this.diceContainer.y = (80 - containerScreenY) / scale;
    }
  }
}
