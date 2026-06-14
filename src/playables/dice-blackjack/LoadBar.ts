import { Assets, Container, Graphics, NineSliceSprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import { makeNineSlice } from '@shared/nineSlice';
import { easeOutBack, easeOutQuad } from '@shared/easing';
import barTextureUrl from 'assets/dice-blackjack/Slider_Basic02_Bg.png';

// Bar labels + score + popups all use Luckiest Guy — the cartoon-display
// font bundled by BlackjackScene's fonts.css. Falls back to Impact / Arial
// Black on platforms where the woff2 didn't load.
const GAME_FONT_STACK = '"Luckiest Guy", Impact, "Arial Black", sans-serif';

const LABEL_STYLE = new TextStyle({
  fill: 0xffffff,
  fontFamily: GAME_FONT_STACK,
  fontSize: 38,
  letterSpacing: 1.5,
  stroke: { color: 0x181008, width: 7, join: 'round' },
});

const SCORE_STYLE_BASE = {
  fill: 0xffffff,
  fontFamily: GAME_FONT_STACK,
  fontSize: 36,
  letterSpacing: 1,
  stroke: { color: 0x181008, width: 7, join: 'round' },
} as const;

const POPUP_STYLE_BASE = {
  fill: 0xffffff,
  fontFamily: GAME_FONT_STACK,
  fontSize: 46,
  letterSpacing: 1.5,
  stroke: { color: 0x181008, width: 8, join: 'round' },
} as const;

const FILL_BLACKJACK = 0xffe17a;
const FILL_OVER = 0xe44848;
const BG_TINT = 0x2d2d36;
const BORDER_COLOR = 0x000000;
const BORDER_WIDTH = 3;

// 9-slice borders pulled from Unity .meta for Slider_Basic02_Bg.png.
const BORDER = { left: 12, bottom: 14, right: 13, top: 29 } as const;

// Timings
const FILL_ANIM_MS = 460;
const SQUASH_DURATION_MS = 240;
const POPUP_DURATION_MS = 900;
const PULSE_DURATION_MS = 520;
const BUST_SHAKE_MS = 320;
const SPARKLE_LIFE_MS = 700;
const SPARKLE_COUNT = 10;

/** Returns a green→orange gradient colour for a 0..1 fill ratio. */
function fillColorFor(ratio: number): number {
  const r0 = 0x4a, g0 = 0xdb, b0 = 0x5a;
  const r1 = 0xff, g1 = 0x9b, b1 = 0x3a;
  const t = Math.max(0, Math.min(ratio, 1));
  return (
    (Math.round(r0 + (r1 - r0) * t) << 16) |
    (Math.round(g0 + (g1 - g0) * t) << 8) |
    Math.round(b0 + (b1 - b0) * t)
  );
}

interface Sparkle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;   // 0..1 remaining
  size: number;
}

interface FloatingPopup {
  text: Text;
  elapsed: number;
}

/**
 * Game-UI style score bar with juice.
 *
 *  - 9-slice background + gradient-tinted fill (mask-driven width)
 *  - Counter ticks digit-by-digit alongside the fill tween
 *  - "+N" popup floats up from the bar center on score change
 *  - White spark particles burst from the fill edge
 *  - Squash on impact (notifyImpact) — dice hitting the bar reads physical
 *  - Gold pulse at exactly maxScore (BLACKJACK)
 *  - Red shake on bust
 */
export class LoadBar extends Container {
  private border!: Graphics;
  private bg: NineSliceSprite | null = null;
  private fill: NineSliceSprite | null = null;
  private fillMask: Graphics | null = null;
  private highlight!: Graphics;
  private innerShadow!: Graphics;
  /** Wrapper that holds the scalable bar visuals — squash + pulse animate this. */
  private barGroup = new Container();
  /** Layer for popups + sparkles, sits above the bar so it isn't clipped by the border. */
  private fxLayer = new Container();

  private readonly nameLabel: Text;
  private readonly scoreText: Text;

  private readonly barWidth: number;
  private readonly barHeight: number;
  private readonly maxScore: number;

  private currentScore = 0;
  private previousScore = 0;
  private displayedRatio = 0;
  private displayedScore = 0;
  private animFromRatio = 0;
  private animToRatio = 0;
  private animFromScore = 0;
  private animToScore = 0;
  private animElapsed = 0;
  private animActive = false;

  // Effect state
  private squashElapsed = SQUASH_DURATION_MS;     // sentinel: finished
  private pulseElapsed = PULSE_DURATION_MS;
  private bustShakeElapsed = BUST_SHAKE_MS;
  private bustShakeMagnitude = 0;
  // When score > maxScore the "23/21" readout pulses to keep the bust feeling
  // present for the player. Stays active until score drops back in range.
  private bustTextActive = false;
  private bustTextElapsed = 0;
  private barBaseX = 0;
  private popups: FloatingPopup[] = [];
  private sparkles: Sparkle[] = [];

  private ready: Promise<void>;

  // Held so dispose() can detach our per-frame handler from the shared,
  // long-lived ticker. Without this, the bound listener keeps firing against
  // detached display objects after the scene exits and throws — which kills
  // the ticker for everyone (e.g. the board-fight Director ticker).
  private readonly ticker: Ticker;
  private readonly tickHandler: (t: Ticker) => void;

  constructor(opts: { label: string; maxScore: number; width: number; height: number; ticker: Ticker }) {
    super();
    this.barWidth = opts.width;
    this.barHeight = opts.height;
    this.maxScore = opts.maxScore;

    this.addChild(this.barGroup);
    this.addChild(this.fxLayer);

    this.nameLabel = new Text({ text: opts.label, style: LABEL_STYLE });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.position.set(opts.width / 2, -8);
    this.addChild(this.nameLabel);

    this.scoreText = new Text({ text: `0 / ${opts.maxScore}`, style: new TextStyle({ ...SCORE_STYLE_BASE }) });
    this.scoreText.anchor.set(0.5, 0);
    this.scoreText.position.set(opts.width / 2, opts.height + 6);
    this.addChild(this.scoreText);

    this.ticker = opts.ticker;
    this.tickHandler = (t) => this.tick(t.deltaMS);
    this.ticker.add(this.tickHandler);

    this.ready = this.buildBar();
  }

  /** Detach the per-frame handler from the shared ticker and destroy visuals. */
  dispose(): void {
    this.ticker.remove(this.tickHandler);
    this.destroy({ children: true });
  }

  private async buildBar(): Promise<void> {
    const tex = await Assets.load<Texture>(barTextureUrl);

    this.bg = makeNineSlice({ texture: tex, border: BORDER, width: this.barWidth, height: this.barHeight });
    this.bg.tint = BG_TINT;
    this.barGroup.addChild(this.bg);

    this.fill = makeNineSlice({ texture: tex, border: BORDER, width: this.barWidth, height: this.barHeight });
    this.fill.tint = fillColorFor(0);
    this.barGroup.addChild(this.fill);

    this.fillMask = new Graphics();
    this.barGroup.addChild(this.fillMask);
    this.fill.mask = this.fillMask;

    this.highlight = new Graphics();
    this.highlight.roundRect(BORDER_WIDTH, BORDER_WIDTH, this.barWidth - BORDER_WIDTH * 2, this.barHeight * 0.42, this.barHeight * 0.32);
    this.highlight.fill({ color: 0xffffff, alpha: 0.16 });
    this.barGroup.addChild(this.highlight);

    this.innerShadow = new Graphics();
    this.innerShadow.roundRect(BORDER_WIDTH, this.barHeight * 0.6, this.barWidth - BORDER_WIDTH * 2, this.barHeight * 0.4 - BORDER_WIDTH, this.barHeight * 0.28);
    this.innerShadow.fill({ color: 0x000000, alpha: 0.22 });
    this.barGroup.addChild(this.innerShadow);

    this.border = new Graphics();
    this.border.roundRect(0, 0, this.barWidth, this.barHeight, this.barHeight * 0.42);
    this.border.stroke({ color: BORDER_COLOR, width: BORDER_WIDTH });
    this.barGroup.addChild(this.border);

    // Pivot the bar group at its own center so squash/pulse scale from the middle.
    this.barGroup.pivot.set(this.barWidth / 2, this.barHeight / 2);
    this.barGroup.position.set(this.barWidth / 2, this.barHeight / 2);
    this.barBaseX = this.barWidth / 2;

    this.drawMask(0);
    this.startFillTween();
  }

  /** Update the score. Triggers fill tween, popup, sparkles, and outcome FX. */
  setScore(score: number): void {
    this.previousScore = this.currentScore;
    this.currentScore = score;
    void this.ready.then(() => {
      this.startFillTween();
      const delta = score - this.previousScore;
      if (delta > 0) this.spawnPopup(delta);
      if (delta > 0 && score <= this.maxScore) this.spawnSparkles(score / this.maxScore);
      if (score === this.maxScore) this.startPulse();
      if (score > this.maxScore) {
        this.startBustShake();
        this.bustTextActive = true;
        this.bustTextElapsed = 0;
      } else {
        // Soft-reset path: score went BACK into range (e.g. resetOnFirstBust)
        // — silence the bust pulse and snap the score text back to normal.
        this.bustTextActive = false;
        if (this.scoreText) this.scoreText.scale.set(1);
      }
    });
  }

  /** Dice landed in the bar — trigger a quick vertical squash. */
  notifyImpact(): void {
    void this.ready.then(() => {
      this.squashElapsed = 0;
    });
  }

  private startFillTween(): void {
    const over = this.currentScore > this.maxScore;
    const ratio = Math.max(0, Math.min(this.currentScore / this.maxScore, 1));
    const isBlackjack = this.currentScore === this.maxScore && this.maxScore > 0;

    if (this.fill) {
      if (over) this.fill.tint = FILL_OVER;
      else if (isBlackjack) this.fill.tint = FILL_BLACKJACK;
      else this.fill.tint = fillColorFor(ratio);
    }

    // Counter + bar tween from previous → current. Stays in sync visually.
    this.animFromRatio = this.displayedRatio;
    this.animToRatio = over ? 1 : ratio;
    this.animFromScore = this.displayedScore;
    this.animToScore = this.currentScore;
    this.animElapsed = 0;
    this.animActive = true;
  }

  private updateScoreText(displayedScore: number, isOver: boolean, isBlackjack: boolean): void {
    if (isOver) {
      // Show the actual bust readout (e.g. "23 / 21") in alarm-red. A
      // per-frame pulse in tick() keeps it feeling "live" until the round
      // resolves.
      this.scoreText.text = `${displayedScore} / ${this.maxScore}`;
      this.scoreText.style = new TextStyle({ ...SCORE_STYLE_BASE, fill: 0xff3a3a });
    } else if (isBlackjack) {
      this.scoreText.text = `${displayedScore} / ${this.maxScore}`;
      this.scoreText.style = new TextStyle({ ...SCORE_STYLE_BASE, fill: 0xffe17a });
    } else {
      this.scoreText.text = `${displayedScore} / ${this.maxScore}`;
      this.scoreText.style = new TextStyle({ ...SCORE_STYLE_BASE, fill: 0xffffff });
    }
  }

  private startPulse(): void {
    this.pulseElapsed = 0;
  }

  private startBustShake(): void {
    this.bustShakeElapsed = 0;
    this.bustShakeMagnitude = 12;
  }

  private spawnPopup(delta: number): void {
    const isBlackjack = this.currentScore === this.maxScore;
    const isBust = this.currentScore > this.maxScore;
    const fillColor = isBust ? 0xff5555 : isBlackjack ? 0xffe17a : fillColorFor(this.currentScore / this.maxScore);
    const text = new Text({
      text: `+${delta}`,
      style: new TextStyle({ ...POPUP_STYLE_BASE, fill: fillColor }),
    });
    text.anchor.set(0.5);
    text.position.set(this.barWidth / 2, this.barHeight / 2);
    text.scale.set(0);
    this.fxLayer.addChild(text);
    this.popups.push({ text, elapsed: 0 });
  }

  private spawnSparkles(ratio: number): void {
    const x = Math.max(8, this.barWidth * ratio);
    const y = this.barHeight / 2;
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const g = new Graphics();
      const size = 3 + Math.random() * 3;
      g.circle(0, 0, size).fill({ color: 0xfff6c2 });
      g.position.set(x, y);
      this.fxLayer.addChild(g);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI; // mostly upward
      const speed = 0.18 + Math.random() * 0.22;
      this.sparkles.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size,
      });
    }
  }

  private drawMask(ratio: number): void {
    if (!this.fillMask) return;
    const filledWidth = this.barWidth * Math.max(0, Math.min(ratio, 1));
    this.fillMask.clear();
    this.fillMask.rect(0, 0, filledWidth, this.barHeight);
    this.fillMask.fill({ color: 0xffffff });
  }

  private tick(deltaMS: number): void {
    try {
    // 1) Fill + counter
    if (this.animActive) {
      this.animElapsed += deltaMS;
      const t = Math.min(this.animElapsed / FILL_ANIM_MS, 1);
      const e = easeOutQuad(t);
      this.displayedRatio = this.animFromRatio + (this.animToRatio - this.animFromRatio) * e;
      const lerped = this.animFromScore + (this.animToScore - this.animFromScore) * e;
      this.displayedScore = Math.round(lerped);
      this.drawMask(this.displayedRatio);
      const over = this.displayedScore > this.maxScore;
      const isBlackjack = this.displayedScore === this.maxScore && this.maxScore > 0;
      this.updateScoreText(this.displayedScore, over, isBlackjack);
      if (t >= 1) this.animActive = false;
    }

    // 2) Squash (vertical) + Pulse (uniform) compose via scale multiplication
    let sx = 1, sy = 1;
    if (this.squashElapsed < SQUASH_DURATION_MS) {
      this.squashElapsed += deltaMS;
      const u = Math.min(this.squashElapsed / SQUASH_DURATION_MS, 1);
      // Sharp dip then bounce-back: y goes 0.78 → 1.04 → 1.0
      const phase = u < 0.45 ? (u / 0.45) : 1 - ((u - 0.45) / 0.55) * 0.5;
      const squashY = 1 - 0.22 * (1 - Math.abs(u - 0.5) * 2);
      sy *= squashY;
      sx *= 1 + (1 - squashY) * 0.4; // horizontal stretch when vertical squashes
      void phase;
    }
    if (this.pulseElapsed < PULSE_DURATION_MS) {
      this.pulseElapsed += deltaMS;
      const u = Math.min(this.pulseElapsed / PULSE_DURATION_MS, 1);
      const e = easeOutBack(u);
      const pulse = 1 + 0.08 * Math.sin(e * Math.PI);
      sx *= pulse;
      sy *= pulse;
    }
    this.barGroup.scale.set(sx, sy);

    // 3) Bust shake (X jitter)
    if (this.bustShakeElapsed < BUST_SHAKE_MS) {
      this.bustShakeElapsed += deltaMS;
      const u = Math.min(this.bustShakeElapsed / BUST_SHAKE_MS, 1);
      const decay = 1 - u;
      const offset = (Math.random() - 0.5) * 2 * this.bustShakeMagnitude * decay;
      this.barGroup.position.x = this.barBaseX + offset;
    } else if (this.barGroup.position.x !== this.barBaseX) {
      this.barGroup.position.x = this.barBaseX;
    }

    // 3b) Bust score-text pulse — continuous breathing on "23 / 21" while
    // the player is over. ~1.6 Hz, peaks at 1.18× so the readout grabs the
    // eye against the static bars below it.
    if (this.bustTextActive && this.scoreText) {
      this.bustTextElapsed += deltaMS;
      const PERIOD_MS = 620;
      const phase = (this.bustTextElapsed / PERIOD_MS) * Math.PI * 2;
      const s = 1 + 0.18 * (0.5 + 0.5 * Math.sin(phase));   // 1.0 … 1.18
      this.scoreText.scale.set(s);
    }

    // 4) Popups — scale-pop in (0→1.2→1), float up, fade out
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.elapsed += deltaMS;
      const u = Math.min(p.elapsed / POPUP_DURATION_MS, 1);
      const inT = Math.min(u / 0.25, 1);
      const scaleIn = easeOutBack(inT);
      p.text.scale.set(scaleIn);
      p.text.position.y = this.barHeight / 2 - u * 70;
      p.text.alpha = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      if (u >= 1) {
        this.fxLayer.removeChild(p.text);
        p.text.destroy();
        this.popups.splice(i, 1);
      }
    }

    // 5) Sparkles — gravity + fade
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.life -= deltaMS / SPARKLE_LIFE_MS;
      s.vy += 0.0008 * deltaMS; // gravity (px/ms²)
      s.g.position.x += s.vx * deltaMS;
      s.g.position.y += s.vy * deltaMS;
      s.g.alpha = Math.max(0, s.life);
      if (s.life <= 0) {
        this.fxLayer.removeChild(s.g);
        s.g.destroy();
        this.sparkles.splice(i, 1);
      }
    }
    } catch {
      // Scene torn down mid-frame — a stray tick must never throw-kill the
      // shared ticker. dispose() will detach this handler on the next pass.
    }
  }
}
