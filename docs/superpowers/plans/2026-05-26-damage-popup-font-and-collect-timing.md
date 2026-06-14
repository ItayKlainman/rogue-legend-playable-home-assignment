# Damage Popup Font + COLLECT Timing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give floating damage numbers a chunky Lilita One font + punchier design (tested), and make the COLLECT button appear sooner after the egg reveal.

**Architecture:** Extract damage-number styling/layout into a pure, dependency-free module (`damageNumberStyle.ts`) that is unit-tested with `node --test` (Node 26 strips TS types). A separate `damageFont.ts` embeds Lilita One (base64, offline) and registers it via FontFace, mirroring the existing `gameFont.ts`. `DamageNumber.ts` becomes a thin PIXI shell over the tested pure logic. The COLLECT change is a single timing constant in `EggSummonScene.ts`.

**Tech Stack:** TypeScript, PIXI.js v8, `@smoud/playable-scripts` (webpack, base64-inlines assets), `node:test`, Playwright (verification).

---

### Task 1: Pure damage-number style/layout module (TDD)

**Files:**
- Modify: `tsconfig.json` (allow `.ts` import specifiers so colocated TS tests pass tsc)
- Create: `src/playables/board-fight/fight/damageNumberStyle.ts`
- Test: `src/playables/board-fight/fight/damageNumberStyle.test.ts`

- [ ] **Step 1: Allow `.ts` import extensions in tsconfig**

Edit `tsconfig.json` `compilerOptions`, add after `"noEmit": true,`:

```json
    "allowImportingTsExtensions": true,
```

(Only the test file uses a `.ts` specifier; webpack/runtime code imports without extension and is unaffected.)

- [ ] **Step 2: Write the failing test**

Create `src/playables/board-fight/fight/damageNumberStyle.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  damageNumberStyle, damageStackOffsetY, DAMAGE_BASE_SIZE, DAMAGE_CRIT_SCALE,
} from './damageNumberStyle.ts';

test('normal hit keeps the given colour, base size, scale 1', () => {
  const s = damageNumberStyle({ color: 0x44aaff });
  assert.equal(s.fontSize, DAMAGE_BASE_SIZE);
  assert.equal(s.fill, 0x44aaff);
  assert.equal(s.scale, 1);
});

test('crit recolours to gold, larger scale, thicker stroke', () => {
  const s = damageNumberStyle({ color: 0x44aaff, crit: true });
  assert.equal(s.scale, DAMAGE_CRIT_SCALE);
  assert.notEqual(s.fill, 0x44aaff);
  assert.ok(s.strokeWidth >= 6);
});

test('missing colour defaults to white', () => {
  assert.equal(damageNumberStyle({}).fill, 0xffffff);
});

test('stack offset rises with active count then caps at MAX_STACK', () => {
  const a = damageStackOffsetY(0);
  const b = damageStackOffsetY(1);
  assert.ok(b < a);                         // higher up the screen
  assert.equal(damageStackOffsetY(5), damageStackOffsetY(2));   // capped
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `node --test src/playables/board-fight/fight/damageNumberStyle.test.ts`
Expected: FAIL — cannot find module `./damageNumberStyle.ts`.

- [ ] **Step 4: Implement the pure module**

Create `src/playables/board-fight/fight/damageNumberStyle.ts`:

```ts
// Pure styling/layout helpers for floating damage numbers. NO PIXI or asset
// imports, so the logic is unit-testable under `node --test` (type-stripped TS).

export interface DamageStyleOpts {
  /** Resolved fill colour for a normal hit (crits override to gold). */
  color?: number;
  crit?: boolean;
}

export interface DamageStyle {
  fontSize: number;
  fill: number;
  strokeColor: number;
  strokeWidth: number;
  shadowAlpha: number;
  shadowBlur: number;
  shadowDistance: number;
  /** Pop / settle target scale. */
  scale: number;
}

export const DAMAGE_BASE_SIZE = 36;
export const DAMAGE_CRIT_SCALE = 1.4;
const CRIT_FILL = 0xffe25a;     // hot gold — crits pop in a distinct colour
const STROKE_COLOR = 0x301c06;  // dark warm outline (reads better than pure black)

export function damageNumberStyle(opts: DamageStyleOpts): DamageStyle {
  const crit = opts.crit ?? false;
  return {
    fontSize: DAMAGE_BASE_SIZE,
    fill: crit ? CRIT_FILL : (opts.color ?? 0xffffff),
    strokeColor: STROKE_COLOR,
    strokeWidth: crit ? 6 : 5,
    shadowAlpha: 0.5,
    shadowBlur: 2,
    shadowDistance: 3,
    scale: crit ? DAMAGE_CRIT_SCALE : 1,
  };
}

const BASE_OFFSET_Y = -116;   // above the target's anchor
const STACK_OFFSET_Y = 22;
const MAX_STACK = 2;

/** Vertical offset (from the target anchor) for the Nth concurrent number, so
 *  stacked hits don't overlap. */
export function damageStackOffsetY(activeCount: number): number {
  return BASE_OFFSET_Y - Math.min(activeCount, MAX_STACK) * STACK_OFFSET_Y;
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `node --test src/playables/board-fight/fight/damageNumberStyle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Confirm tsc is clean for the new files**

Run: `npx tsc --noEmit 2>&1 | grep -iE "damageNumberStyle|tsconfig" || echo OK`
Expected: `OK` (no new errors).

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json src/playables/board-fight/fight/damageNumberStyle.ts src/playables/board-fight/fight/damageNumberStyle.test.ts
git commit -m "egg-summon: pure damage-number style/layout module + tests"
```

---

### Task 2: Embed Lilita One font + loader

**Files:**
- Create: `assets/Fonts/LilitaOne-Regular.ttf` (downloaded)
- Create: `src/shared/damageFont.ts`
- Modify: `src/playables/egg-summon/EggSummonDirector.ts` (load the font before scenes render)

- [ ] **Step 1: Download the font (Google Fonts, OFL)**

Run:
```bash
curl -sL -o assets/Fonts/LilitaOne-Regular.ttf "https://github.com/google/fonts/raw/main/ofl/lilitaone/LilitaOne-Regular.ttf"
file assets/Fonts/LilitaOne-Regular.ttf
```
Expected: `TrueType Font data` (~27K).

- [ ] **Step 2: Create the loader**

Create `src/shared/damageFont.ts`:

```ts
import fontUrl from 'assets/Fonts/LilitaOne-Regular.ttf';

// Damage-number font: Lilita One (Google Fonts, OFL). Bundled inline (base64
// data URL) and registered via the FontFace API, exactly like the Titan One
// game font in gameFont.ts.
export const DAMAGE_FONT = 'Lilita One';
export const DAMAGE_FONT_STACK = `"${DAMAGE_FONT}", Arial, sans-serif`;

let loadPromise: Promise<void> | null = null;

/** Load + register the damage font. Idempotent. Await before rendering fight
 *  text so PIXI measures glyphs with the real font. */
export function loadDamageFont(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    try {
      const face = new FontFace(DAMAGE_FONT, `url(${fontUrl})`);
      await face.load();
      document.fonts.add(face);
    } catch (e) {
      if (__DEV__) console.warn('[damageFont] load failed', e);
    }
  })();
  return loadPromise;
}
```

- [ ] **Step 3: Load it in the director alongside the game font**

In `src/playables/egg-summon/EggSummonDirector.ts`, add the import near the other `@shared` imports:

```ts
import { loadDamageFont } from '@shared/damageFont';
```

Then replace the existing line:

```ts
    await loadGameFont();
```

with:

```ts
    await Promise.all([loadGameFont(), loadDamageFont()]);
```

- [ ] **Step 4: Build to confirm the font inlines cleanly**

Run: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2`
Expected: `Build successful!`

- [ ] **Step 5: Commit**

```bash
git add assets/Fonts/LilitaOne-Regular.ttf src/shared/damageFont.ts src/playables/egg-summon/EggSummonDirector.ts
git commit -m "egg-summon: embed Lilita One font + loader for damage numbers"
```

---

### Task 3: Apply the font + design to DamageNumber, retune, verify

**Files:**
- Modify: `src/playables/board-fight/fight/DamageNumber.ts`

- [ ] **Step 1: Wire the pure style + font + drop shadow into the main number**

In `src/playables/board-fight/fight/DamageNumber.ts`:

Add imports at the top (after the existing imports):

```ts
import { DAMAGE_FONT_STACK } from '@shared/damageFont';
import { damageNumberStyle, damageStackOffsetY } from './damageNumberStyle';
```

Bump the float distance constant:

```ts
const FLOAT_DISTANCE = 72;
```

Replace the block from `const text = isCrit ...` through the `label.anchor.set(0.5, 0.5);` line with:

```ts
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
```

(Delete the old `const baseSize = 30;` and `const scale = isCrit ? 1.3 : 1;` lines — `st.fontSize` and `st.scale` replace them.)

- [ ] **Step 2: Use the tested stack offset for positioning**

Replace the `startY` line:

```ts
    const startY = target.character.spine.y - 110 - Math.min(this.activeCount, MAX_STACK) * STACK_OFFSET_Y;
```

with:

```ts
    const startY = target.character.spine.y + damageStackOffsetY(this.activeCount);
```

Then delete the now-unused module constants `STACK_OFFSET_Y` and `MAX_STACK` near the top of the file.

- [ ] **Step 3: Update the prefix label to the new font + size**

Replace the **entire** `if (opts?.label) { ... }` block (it references the now-deleted
`baseSize` in both the font size and the position) with:

```ts
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
```

(References `st`, defined in Step 1.)

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit 2>&1 | grep -iE "DamageNumber" || echo OK` → expect `OK`
Run: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2` → expect `Build successful!`

- [ ] **Step 5: Publish + Playwright screenshot the fight (normal + crit numbers)**

```bash
cd dist && f=$(ls -t egg-summon_*.html | head -1) && cp "$f" index.html && cp "$f" v2.html && cd ..
```
Drive `?start=fight` with Playwright (viewport 414×896), sampling frames every ~150ms for ~12s into `/tmp/dmg`, and read several frames that show damage numbers. Confirm: Lilita One is rendering, numbers are legible against the background, crits are gold/larger, stacked numbers don't overlap. Iterate on `DAMAGE_BASE_SIZE`, `strokeWidth`, shadow, `FLOAT_DISTANCE`, `CRIT_FILL` if needed (re-run Task 1 tests after any change to the pure module).

- [ ] **Step 6: Commit**

```bash
git add src/playables/board-fight/fight/DamageNumber.ts
git commit -m "egg-summon: damage numbers use Lilita One + punchier crit/shadow design"
```

---

### Task 4: COLLECT button appears faster after the reveal

**Files:**
- Modify: `src/playables/egg-summon/scenes/EggSummonScene.ts`

- [ ] **Step 1: Shorten the post-reveal hold**

In `src/playables/egg-summon/scenes/EggSummonScene.ts`, find the hold before `this.showRevealCta();`:

```ts
    await tween(this.ticker, 1000, () => {});   // let the dragon + stars land before the CTA
```

Change `1000` to `500`:

```ts
    await tween(this.ticker, 500, () => {});   // let the dragon + stars land, then COLLECT
```

- [ ] **Step 2: Build + publish**

Run: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2` → `Build successful!`
```bash
cd dist && f=$(ls -t egg-summon_*.html | head -1) && cp "$f" index.html && cp "$f" v2.html && cd ..
```

- [ ] **Step 3: Verify timing via Playwright**

Drive from start: tap the egg to open, then sample frames after the reveal lands; confirm COLLECT now appears ~0.5s after the dragon/name settle (sooner than before), still with its scale-in pop.

- [ ] **Step 4: Commit**

```bash
git add src/playables/egg-summon/scenes/EggSummonScene.ts
git commit -m "egg-summon: show COLLECT sooner after the reveal (1000ms -> 500ms)"
```

---

## Notes
- The damage-style change lives in shared `DamageNumber`, so board-fight/sidescroller inherit the new look; it's validated against egg-summon (the active playable).
- Crit damage in this fight is styling-only in the engine (damage value is unchanged); the gold crit colour + bigger scale are purely visual.
