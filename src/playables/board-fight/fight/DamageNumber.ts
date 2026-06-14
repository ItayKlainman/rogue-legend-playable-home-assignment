import { Container, Text, TextStyle, Ticker } from 'pixi.js';
import type { FightActor } from './FightActor';
import { formatNumber } from '@shared/utils';
import { DAMAGE_FONT_STACK } from '@shared/damageFont';
import { damageNumberStyle, damageStackOffsetY } from './damageNumberStyle';

const FLOAT_DISTANCE = 72;
const FLOAT_DURATION_MS = 500;
const FADE_START = 0.6; // fraction of duration where fade begins
const SCALE_DURATION_MS = 100;

// Element colors
const ELEMENT_COLORS: Record<string, number> = {
  physical: 0xffffff,
  ice: 0x44aaff,
  lightning: 0xffee44,
  shuriken: 0xcccccc,
  fire: 0xff8833,
  poison: 0x44cc44,
};

export interface DamageNumberOpts {
  color?: number;
  crit?: boolean;
  label?: string;     // prefix like "Ice!" shown above the number
  element?: string;    // key into ELEMENT_COLORS
}

/** Manages floating damage numbers on the battle area. */
export class DamageNumber {
  private parent: Container;
  private ticker: Ticker;
  private activeCount = 0;

  constructor(parent: Container, ticker: Ticker) {
    this.parent = parent;
    this.ticker = ticker;
  }

  show(target: FightActor, amount: number, opts?: DamageNumberOpts): void {
    const color = opts?.color ?? (opts?.element ? ELEMENT_COLORS[opts.element] ?? 0xffffff : 0xffffff);
    const isCrit = opts?.crit ?? false;

    const text = isCrit ? `-${formatNumber(amount)}!` : `-${formatNumber(amount)}`;
    const st = damageNumberStyle({ color, crit: isCrit });
    const scale = st.scale;

    const label = new Text({
      text,
      style: new TextStyle({
        fontFamily: DAMAGE_FONT_STACK,
        fontSize: st.fontSize,
        fill: st.fill,
        stroke: { color: st.strokeColor, width: st.strokeWidth },
        dropShadow: { color: 0x000000, alpha: st.shadowAlpha, blur: st.shadowBlur, angle: Math.PI / 2, distance: st.shadowDistance },
      }),
    });
    label.anchor.set(0.5, 0.5);

    // Position at target with random horizontal jitter and stack offset
    const jitterX = (Math.random() - 0.5) * 40;
    const startX = target.character.spine.x + jitterX;
    const startY = target.character.spine.y + damageStackOffsetY(this.activeCount);
    label.position.set(startX, startY);
    label.scale.set(0);

    // Add prefix label if provided
    if (opts?.label) {
      const prefixLabel = new Text({
        text: opts.label,
        style: new TextStyle({
          fontFamily: DAMAGE_FONT_STACK,
          fontSize: st.fontSize * 0.7,
          fill: st.fill,
          stroke: { color: st.strokeColor, width: 3 },
        }),
      });
      prefixLabel.anchor.set(0.5, 1);
      prefixLabel.position.set(0, -st.fontSize * 0.6);
      label.addChild(prefixLabel);
    }

    this.parent.addChild(label);
    this.activeCount++;

    // Animate: scale in (elastic) → float up → fade out
    let elapsed = 0;
    const totalDuration = FLOAT_DURATION_MS;
    const handler = (ticker: { deltaMS: number }) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / totalDuration);

      // Scale: quick elastic pop
      if (elapsed < SCALE_DURATION_MS) {
        const st = elapsed / SCALE_DURATION_MS;
        const elastic = st < 0.6 ? st / 0.6 * 1.15 * scale : (1.15 - (st - 0.6) / 0.4 * 0.15) * scale;
        label.scale.set(elastic);
      } else {
        label.scale.set(scale);
      }

      // Float up
      label.y = startY - t * FLOAT_DISTANCE;

      // Fade out in last portion
      if (t > FADE_START) {
        label.alpha = 1 - (t - FADE_START) / (1 - FADE_START);
      }

      if (t >= 1) {
        // Accessing ticker from parent — use internal approach
        label.destroy();
        this.activeCount = Math.max(0, this.activeCount - 1);
        return true; // signal removal — handled by caller
      }
      return false;
    };

    // Use ticker-based animation so it respects pause and stops on scene teardown
    const onTick = (t: Ticker) => {
      const done = handler({ deltaMS: t.deltaMS });
      if (done) this.ticker.remove(onTick);
    };
    this.ticker.add(onTick);
  }
}
