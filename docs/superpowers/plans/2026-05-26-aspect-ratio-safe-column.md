# Aspect-Ratio Support (Portrait Safe-Column) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make egg-summon look like the phone portrait layout on every aspect ratio (phone/iPad/landscape) — content clamped to a centered portrait column at native size, backgrounds filling the margins (no bars).

**Architecture:** A pure `safeContentSize(vw,vh,maxAspect)` clamps the content width to a portrait column and centers it. The director mounts all scenes in a `world` container offset by that amount (no scaling → content is pixel-identical to the phone). Scenes lay content out to the clamped `(cw,ch)` (their existing fraction math, unchanged) and draw their background across the full viewport via optional `fillX/fillW` layout params. The `SceneManager` remembers the current layout and re-applies it whenever a scene mounts.

**Tech Stack:** TypeScript, PIXI.js v8, `@smoud/playable-sdk`, `node:test`, Playwright.

---

### Task 1: Pure `safeContentSize` helper (TDD)

**Files:**
- Create: `src/shared/safeArea.ts`
- Test: `src/shared/safeArea.test.ts`

(`tsconfig.json` already has `allowImportingTsExtensions: true`.)

- [ ] **Step 1: Write the failing test** — create `src/shared/safeArea.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeContentSize } from './safeArea.ts';

const MAX = 0.62;

test('phone (narrow portrait) is untouched: full width, no offset', () => {
  const r = safeContentSize(414, 896, MAX);          // aspect 0.46 < MAX
  assert.equal(r.cw, 414);
  assert.equal(r.ch, 896);
  assert.equal(r.offsetX, 0);
});

test('iPad (4:3) clamps width to a centred portrait column', () => {
  const r = safeContentSize(768, 1024, MAX);          // aspect 0.75 > MAX
  assert.equal(r.ch, 1024);
  assert.ok(Math.abs(r.cw - 1024 * MAX) < 0.001);     // cw = ch * MAX
  assert.ok(Math.abs(r.offsetX - (768 - r.cw) / 2) < 0.001);
  assert.ok(r.offsetX > 0);
});

test('landscape clamps to a narrow column with a large offset', () => {
  const r = safeContentSize(1280, 720, MAX);
  assert.ok(Math.abs(r.cw - 720 * MAX) < 0.001);
  assert.ok(r.cw < 1280);
  assert.ok(r.offsetX > 300);
});
```

- [ ] **Step 2: Run it, confirm it fails** — `node --test src/shared/safeArea.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/shared/safeArea.ts`:
```ts
// Pure layout math for clamping content to a centred portrait column so the
// playable always presents the phone layout (any aspect ratio). NO imports →
// unit-testable under `node --test`.

export interface SafeContent {
  /** Content (column) width — equals viewport width on phones. */
  cw: number;
  /** Content height — always the full viewport height. */
  ch: number;
  /** Horizontal offset to centre the content column (0 on phones). */
  offsetX: number;
}

/** Clamp the content to a portrait column no wider than `maxAspect * height`,
 *  centred horizontally. On portrait phones (aspect <= maxAspect) it returns the
 *  full viewport unchanged. */
export function safeContentSize(viewportW: number, viewportH: number, maxAspect: number): SafeContent {
  const cw = Math.min(viewportW, viewportH * maxAspect);
  const ch = viewportH;
  const offsetX = (viewportW - cw) / 2;
  return { cw, ch, offsetX };
}

/** The portrait-column aspect cap. Phones (<= ~0.56) pass through untouched;
 *  iPad (~0.75) and landscape clamp to this. */
export const MAX_PORTRAIT_ASPECT = 0.62;
```

- [ ] **Step 4: Run, confirm pass** — `node --test src/shared/safeArea.test.ts` → 3 pass.

- [ ] **Step 5: Commit**
```bash
git add src/shared/safeArea.ts src/shared/safeArea.test.ts
git commit -m "shared: pure safeContentSize helper for portrait-column clamping + tests"
```

---

### Task 2: Foundation wiring — Scene/SceneManager/Director (the core fix)

**Files:**
- Modify: `src/shared/Scene.ts`
- Modify: `src/shared/SceneManager.ts`
- Modify: `src/playables/egg-summon/EggSummonDirector.ts`

- [ ] **Step 1: Widen the `Scene.layout` signature** — in `src/shared/Scene.ts`, change the `layout` line to:
```ts
  layout(width: number, height: number, fillX?: number, fillW?: number): void;
```
(Optional trailing params — existing 2-arg implementations still satisfy the interface.)

- [ ] **Step 2: SceneManager remembers + re-applies layout, forwards fill params** — in `src/shared/SceneManager.ts`:

Add a field near the other privates:
```ts
  private lastLayout: { width: number; height: number; fillX?: number; fillW?: number } | null = null;
```

Replace the `layout(...)` method with:
```ts
  layout(width: number, height: number, fillX?: number, fillW?: number): void {
    this.lastLayout = { width, height, fillX, fillW };
    for (const entry of this.stack) {
      entry.scene.layout(width, height, fillX, fillW);
    }
  }

  /** Re-apply the current layout to one freshly-mounted scene. */
  private applyLayout(scene: Scene): void {
    if (this.lastLayout) {
      scene.layout(this.lastLayout.width, this.lastLayout.height, this.lastLayout.fillX, this.lastLayout.fillW);
    }
  }
```

In `push(...)`, immediately after `await scene.enter();` add:
```ts
    this.applyLayout(scene);
```

In `seamlessReplace(...)`, immediately after `await scene.enter();` (before the crossfade) add:
```ts
    this.applyLayout(scene);
```

- [ ] **Step 3: Director mounts scenes in a clamped `world` container** — in `src/playables/egg-summon/EggSummonDirector.ts`:

Add imports:
```ts
import { Application, Container, Ticker } from 'pixi.js';
import { safeContentSize, MAX_PORTRAIT_ASPECT } from '@shared/safeArea';
```
(Update the existing `import { Application, Ticker } from 'pixi.js';` to include `Container`.)

Add fields next to `private sceneManager!: SceneManager;`:
```ts
  private world!: Container;
  private cw = 0;
  private ch = 0;
```

In `init()`, replace:
```ts
    this.sceneManager = new SceneManager(this.app.stage, this.ticker);
```
with:
```ts
    this.world = new Container();
    this.app.stage.addChild(this.world);
    this.sceneManager = new SceneManager(this.world, this.ticker);
    this.applyViewport();   // sets cw/ch + world offset for the initial size
```

Add this method (next to `resize`):
```ts
  /** Clamp content to a centred portrait column and offset the world so the
   *  whole experience always reads as the phone layout, with backgrounds filling
   *  the margins. */
  private applyViewport(): void {
    const { cw, ch, offsetX } = safeContentSize(this.width, this.height, MAX_PORTRAIT_ASPECT);
    this.cw = cw; this.ch = ch;
    this.world.position.set(offsetX, 0);
    this.sceneManager?.layout(cw, ch, -offsetX, this.width);
  }
```

Replace `resize(...)`:
```ts
  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.app.renderer.resize(width, height);
    this.applyViewport();
  }
```

- [ ] **Step 4: Construct scenes with the clamped size** — in `runFlow()` and anywhere scenes are `new`-ed (`EggSummonScene`, `BoardRollScene`, `FightScene`, `ClaimRewardScene`, `PickPetScene`, `EndCardScene`), replace `this.width, this.height` with `this.cw, this.ch`. For example:
```ts
      const egg = new EggSummonScene(this.script, this.ticker, this.cw, this.ch);
      ...
      const board = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch);
      ...
      const fight = new FightScene(this.ticker, this.cw, this.ch);
      ...
      const claim = new ClaimRewardScene(this.ticker, this.cw, this.ch);
      ...
      const pick = new PickPetScene(this.script, this.ticker, this.cw, this.ch);
      ...
      const endCard = new EndCardScene({ splashImage, logoImage }, this.cw, this.ch);
```
(The `SceneManager` re-applies the exact layout after each `enter()` via Step 2, so resize and mount are both covered.)

- [ ] **Step 5: Typecheck + build + publish**
```bash
npx tsc --noEmit 2>&1 | grep -iE "Scene.ts|SceneManager|EggSummonDirector|safeArea" || echo OK
PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2
cd dist && f=$(ls -t egg-summon_*.html | head -1) && cp "$f" index.html && cp "$f" v2.html && cd ..
```
Expected: `OK`, `Build successful!`.

- [ ] **Step 6: Playwright check (controller verifies)** — load `?start=fight` and `?start=claim` at iPad (768×1024) and landscape (1280×720). Confirm the content is now a centered portrait column with the **hand/characters in their correct phone positions** (the core bug fixed). Margins will be empty/dark until Task 3–4; that's expected here.

- [ ] **Step 7: Commit**
```bash
git add src/shared/Scene.ts src/shared/SceneManager.ts src/playables/egg-summon/EggSummonDirector.ts
git commit -m "egg-summon: clamp content to a centred portrait column on all aspect ratios"
```

---

### Task 3: Solid-background scenes fill the margins

**Files:**
- Modify: `src/playables/egg-summon/scenes/EggSummonScene.ts`
- Modify: `src/playables/egg-summon/scenes/ClaimRewardScene.ts`
- Modify: `src/playables/egg-summon/scenes/PickPetScene.ts`

Pattern: a scene's `layout(width, height, fillX = 0, fillW = width)` draws its background rect at `(fillX, 0, fillW, height)` instead of `(0, 0, width, height)`. Content positioning stays unchanged.

- [ ] **Step 1: EggSummonScene main + reveal backgrounds**

In `src/playables/egg-summon/scenes/EggSummonScene.ts`, change the `layout` signature to accept fill params. Find the layout method signature `layout(width: number, height: number)` (or `layout(w, h)`) and add `, fillX = 0, fillW = width` (matching its param names). Then:
- Line ~819 main bg: change `g.rect(0, 0, w, h).fill(0x241d3a);` → `g.rect(fillX, 0, fillW, h).fill(0x241d3a);`
- Line ~735 reveal bg (inside `layoutRevealBg`): the reveal overlay background should also span the fill rect. Change `this.revealBg.clear().rect(0, 0, w, h).fill(0x2a2440);` → `this.revealBg.clear().rect(fillX, 0, fillW, h).fill(0x2a2440);`. If `layoutRevealBg` doesn't receive `fillX/fillW`, pass them in (store `this.fillX`/`this.fillW` in `layout` and read them in `layoutRevealBg`).

Add fields if needed:
```ts
  private fillX = 0;
  private fillW = 0;
```
and in `layout` set `this.fillX = fillX; this.fillW = fillW;` so helper methods (reveal bg) can read them.

- [ ] **Step 2: ClaimRewardScene background + implement layout()**

In `src/playables/egg-summon/scenes/ClaimRewardScene.ts`:
- Add fields `private fillX = 0; private fillW = 0;` near the other privates.
- The bg is created in `enter()` at line ~62: `const bg = new Graphics().rect(0, 0, w, h).fill(0x171028);`. Store it as a field `this.bgRect = bg;` (add `private bgRect!: Graphics;`).
- Replace the currently-empty `layout()` body with:
```ts
  layout(width: number, height: number, fillX = 0, fillW = width): void {
    this.width = width; this.height = height;
    this.fillX = fillX; this.fillW = fillW;
    if (this.bgRect && !this.bgRect.destroyed) {
      this.bgRect.clear().rect(fillX, 0, fillW, height).fill(0x171028);
    }
  }
```
- Also draw the initial bg across the fill rect at creation isn't required (layout runs right after enter via SceneManager), but to be safe leave the `enter()` bg as-is; `layout()` will redraw it to the fill rect.

- [ ] **Step 3: PickPetScene background**

In `src/playables/egg-summon/scenes/PickPetScene.ts`:
- Change `layout(width: number, height: number): void {` → `layout(width: number, height: number, fillX = 0, fillW = width): void {`
- Line ~255: change `this.bg.clear().rect(0, 0, width, height).fill(BG_COLOR);` → `this.bg.clear().rect(fillX, 0, fillW, height).fill(BG_COLOR);`

- [ ] **Step 4: Typecheck + build + publish**
```bash
npx tsc --noEmit 2>&1 | grep -iE "EggSummonScene|ClaimRewardScene|PickPetScene" || echo OK
PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2
cd dist && f=$(ls -t egg-summon_*.html | head -1) && cp "$f" index.html && cp "$f" v2.html && cd ..
```
Expected: `OK`, `Build successful!`.

- [ ] **Step 5: Commit**
```bash
git add src/playables/egg-summon/scenes/EggSummonScene.ts src/playables/egg-summon/scenes/ClaimRewardScene.ts src/playables/egg-summon/scenes/PickPetScene.ts
git commit -m "egg-summon: solid-bg scenes fill the margins on wide aspect ratios"
```

---

### Task 4: Image-background scenes fill the margins

**Files:**
- Modify: `src/playables/egg-summon/scenes/FightScene.ts`
- Modify: `src/playables/end_card/EndCardScene.ts`
- Modify: `src/playables/egg-summon/scenes/BoardRollScene.ts`

Read each scene's current `layout()` first. Pattern: accept `fillX = 0, fillW = width`; the dim overlay / cover-image / backdrop should span the full fill rect (`fillX`-relative) so the margins are covered by the scene's own art, not left empty.

- [ ] **Step 1: FightScene** — change `layout(width, height)` → `layout(width, height, fillX = 0, fillW = width)`. Then:
  - The dim overlay (line ~292 `this.dimOverlay.clear().rect(0, 0, width, height)...`) → `rect(fillX, 0, fillW, height)`.
  - The battle background sprite (`bgSprite`) and the dimmed board backdrop (`bd`, positioned at `width/2, height*0.72`) are cover-scaled: recompute their cover scale against `fillW` (not `width`) and center them at `fillX + fillW/2` so they bleed into the margins. Find where `bgSprite`/`bd` scale + position are set in `layout()` and replace the cover width `width` with `fillW` and the center x `width/2` with `fillX + fillW/2`.
  - The trapezoid `battleMask` (line ~310) should also span the fill width: replace its `width`-based x coords with `fillX` (left) and `fillX + fillW` (right). Keep `battleH` as-is.

- [ ] **Step 2: EndCardScene** — replace the portrait/landscape split so the splash covers the full fill rect everywhere (drop the logo-only landscape branch):
  - Change `layout(width, height)` → `layout(width, height, fillX = 0, fillW = width)`.
  - In `layoutScene()` (which reads `this.width`/`this.height`), store `this.fillX = fillX; this.fillW = fillW;` (add the fields) and call it.
  - Replace the `isLandscape` branching for `hitArea`/`bgSprite`/`logoSprite` with: always show `bgSprite` (splash), hide `logoSprite`. Cover-scale the splash against the full fill rect: `coverScale = Math.max(fillW / texW, (height + 50) / texH)`, `bgSprite.position.set(fillX + fillW / 2, -50)`. The hit area covers `(fillX, 0, fillW, height)`. The button stays centered at `width / 2` (content column center) and `buttonY = height * 0.88`.

- [ ] **Step 3: BoardRollScene** — the board image + camera frame to the content column `(width,height)` (unchanged, so the board looks like the phone). Add a margin backfill behind the board:
  - Change `layout(width, height)` → `layout(width, height, fillX = 0, fillW = width)`.
  - In `enter()`, before `this.container.addChild(this.board.sprite)`, create a backfill and add it first so it sits behind everything:
```ts
    this.marginFill = new Graphics();
    this.container.addChildAt(this.marginFill, 0);
```
    (add `private marginFill!: Graphics;`). In `layout()`, draw it across the fill rect with the board's ambient dark tone so the margins read as an intentional vignette, not bars:
```ts
    if (this.marginFill && !this.marginFill.destroyed) {
      this.marginFill.clear().rect(fillX, 0, fillW, height).fill(0x12100f);
    }
```
  - (If a richer fill is wanted later, swap the rect for a cover-scaled darkened board sprite; the dark rect is the v1 that guarantees no bars and reads intentionally.)

- [ ] **Step 4: Typecheck + build + publish**
```bash
npx tsc --noEmit 2>&1 | grep -iE "FightScene|EndCardScene|BoardRollScene" || echo OK
PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2
cd dist && f=$(ls -t egg-summon_*.html | head -1) && cp "$f" index.html && cp "$f" v2.html && cd ..
```
Expected: `OK`, `Build successful!`.

- [ ] **Step 5: Commit**
```bash
git add src/playables/egg-summon/scenes/FightScene.ts src/playables/end_card/EndCardScene.ts src/playables/egg-summon/scenes/BoardRollScene.ts
git commit -m "egg-summon: image-bg scenes fill the margins on wide aspect ratios"
```

---

### Task 5: Full-flow verification at four aspect ratios (controller)

Drive the whole flow with Playwright at: **portrait phone 414×896**, **iPad 768×1024**, **landscape 1280×720**, **square 900×900**. For each, screenshot egg reveal, board, fight, claim, pick-pet, and end card. Confirm:
- **Portrait phone is unchanged** vs. before (no regression).
- iPad/landscape/square: content is the centered phone layout, the **hand points correctly**, **no characters out of view**, and the **margins are filled** by each scene's bg (no bars).

Fix any scene whose margins still show empty/black by extending its bg to the fill rect (same pattern). No commit needed beyond Tasks 3–4 unless a fix is required.

---

## Notes
- `MAX_PORTRAIT_ASPECT = 0.62` keeps all phones (aspect ≤ ~0.56) on the untouched full-viewport path; only iPad/landscape clamp.
- Shared `Scene`/`SceneManager` changes are backward-compatible (optional params); board-fight/sidescroller are unaffected (their director doesn't offset a world).
