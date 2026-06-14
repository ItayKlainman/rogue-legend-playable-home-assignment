# Egg Reward → Pick One of Two Pets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After claiming the egg reward, the player chooses one of two new pets (Sly/Luna) on a juicy pick screen, then continues to the end card.

**Architecture:** A new `PickPetScene` (adapted from the unused `PickFighterScene`) shows two rarity-framed pet tiles with heavy juice (entrance bounce, sparkles, and a flash/shockwave/confetti/checkmark payoff on pick + sound). Its pure layout/selection logic lives in `pickPetLayout.ts` and is unit-tested with `node --test`. The director inserts the scene between the claim scene and the end card.

**Tech Stack:** TypeScript, PIXI.js v8, `@smoud/playable-scripts` (webpack), `node:test`, Playwright (verification).

---

### Task 1: Pure pick-pet layout/selection module (TDD)

**Files:**
- Create: `src/playables/egg-summon/scenes/pickPetLayout.ts`
- Test: `src/playables/egg-summon/scenes/pickPetLayout.test.ts`

(`tsconfig.json` already has `allowImportingTsExtensions: true` from prior work.)

- [ ] **Step 1: Write the failing test**

Create `src/playables/egg-summon/scenes/pickPetLayout.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPetTilePositions, pickPetTileSize, dimTargets } from './pickPetLayout.ts';

test('tile size is positive and scales down on narrow screens', () => {
  const wide = pickPetTileSize(1200, 2);
  const narrow = pickPetTileSize(360, 2);
  assert.ok(narrow > 0);
  assert.ok(narrow < wide);
});

test('two tiles are centred horizontally and share a y', () => {
  const pos = pickPetTilePositions(2, 400, 800);
  assert.equal(pos.length, 2);
  assert.ok(Math.abs((pos[0].x + pos[1].x) / 2 - 200) < 0.001); // centred on width/2
  assert.ok(pos[0].x < pos[1].x);
  assert.equal(pos[0].y, pos[1].y);
});

test('dimTargets returns every index except the chosen one', () => {
  assert.deepEqual(dimTargets(0, 2), [1]);
  assert.deepEqual(dimTargets(1, 2), [0]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test src/playables/egg-summon/scenes/pickPetLayout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure module**

Create `src/playables/egg-summon/scenes/pickPetLayout.ts`:
```ts
// Pure layout/selection helpers for the pick-pet screen. NO PIXI/asset imports,
// so this is unit-testable under `node --test` (type-stripped TS).

export interface TilePos { x: number; y: number; }

const MAX_GAP = 200;
const TILE_Y_FRAC = 0.56;

/** Horizontal spacing between tile centres. */
function gapFor(width: number, count: number): number {
  return Math.min(width / (count + 1), MAX_GAP);
}

/** Square tile side length. */
export function pickPetTileSize(width: number, count: number): number {
  return gapFor(width, count) * 0.92;
}

/** Centre positions for `count` tiles, evenly spaced and centred horizontally. */
export function pickPetTilePositions(count: number, width: number, height: number): TilePos[] {
  const gap = gapFor(width, count);
  const y = height * TILE_Y_FRAC;
  const out: TilePos[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x: width / 2 + (i - (count - 1) / 2) * gap, y });
  }
  return out;
}

/** Indices to dim on selection — everything except the chosen tile. */
export function dimTargets(chosenIndex: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (i !== chosenIndex) out.push(i);
  return out;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test src/playables/egg-summon/scenes/pickPetLayout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/playables/egg-summon/scenes/pickPetLayout.ts src/playables/egg-summon/scenes/pickPetLayout.test.ts
git commit -m "egg-summon: pure pick-pet layout/selection module + tests"
```

---

### Task 2: PickPetScene (juicy two-pet pick screen)

**Files:**
- Create: `src/playables/egg-summon/scenes/PickPetScene.ts`

Context for the implementer:
- `Scene` interface (`@shared/Scene`): `{ container: Container; done: Promise<void>; enter(); exit(); update(deltaMS); pause(); resume(); layout(w,h); }`.
- `@shared/tween` exports `tween(ticker, durationMs, fn)` → Promise; `@shared/easing` exports `easeOutBack`.
- `@shared/autoSizeText` exports `autoSizeText({text, style, maxWidth, maxHeight, minPx, maxPx})` → `Text`.
- `@shared/gameFont` exports `GAME_FONT_STACK`.
- `../rarity` exports `RARITY_TINT: Record<Rarity, number>`.
- `../catalog` exports `loadRevealTexture(pet)` → `Promise<Texture>` and `loadUiTexture(key)` where keys include `'tileFrame'` and `'hand'`.
- `../script` exports `EggReveal`, `EggSummonScript` (`{ eggs: EggReveal[]; fighterIndex: number }`).
- `../audio` exports `buttonTap(vol?)`, `collect(vol?)`, `summonReveal(vol?)`.
- The egg glow disc asset is `assets/egg-summon/egg/glow.webp`.

- [ ] **Step 1: Create the scene file**

Create `src/playables/egg-summon/scenes/PickPetScene.ts`:
```ts
import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeOutBack } from '@shared/easing';
import { autoSizeText } from '@shared/autoSizeText';
import { GAME_FONT_STACK } from '@shared/gameFont';
import { RARITY_TINT } from '../rarity';
import { loadRevealTexture, loadUiTexture } from '../catalog';
import type { EggReveal, EggSummonScript } from '../script';
import * as audio from '../audio';
import { pickPetTilePositions, pickPetTileSize, dimTargets } from './pickPetLayout';
import glowData from 'assets/egg-summon/egg/glow.webp';

const BG_COLOR = 0x231f2d;     // game pet-screen dark purple
const CHECK_COLOR = 0xc5e53c;  // Green_2 selected indicator
const AUTO_PICK_MS = 6000;

interface PetTile {
  root: Container;
  halo: Sprite;
  frame: Sprite;
  icon: Sprite;
  name: Text;
  check: Graphics;
  sparkles: { g: Graphics; phase: number }[];
  baseScale: number;
}

/** Reward step: the egg opens into two new pets; the player picks one (juicy),
 *  then the flow continues to the end card. */
export class PickPetScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private ready = false;
  private busy = false;
  private elapsed = 0;
  private bg!: Graphics;
  private title!: Text;
  private hand!: Sprite;
  private tiles: PetTile[] = [];
  private pets: EggReveal[];

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((r) => { this.resolveDone = r; });
    // The two NEW pets = the eggs that did NOT become the fighter.
    this.pets = this.script.eggs.filter((_, i) => i !== this.script.fighterIndex);
  }

  async enter(): Promise<void> {
    const [petTex, tileTex, handTex, glowTex] = await Promise.all([
      Promise.all(this.pets.map((p) => loadRevealTexture(p.pet))),
      loadUiTexture('tileFrame'),
      loadUiTexture('hand'),
      Assets.load(glowData),
    ]);

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.title = this.makeTitle();
    this.container.addChild(this.title);

    for (let i = 0; i < this.pets.length; i++) {
      const root = new Container();
      const tint = RARITY_TINT[this.pets[i].rarity];

      const halo = new Sprite(glowTex);
      halo.anchor.set(0.5); halo.tint = tint; halo.blendMode = 'add'; halo.alpha = 0.5;

      const frame = new Sprite(tileTex);
      frame.anchor.set(0.5); frame.tint = tint;

      const icon = new Sprite(petTex[i]);
      icon.anchor.set(0.5);

      const name = new Text({
        text: this.pets[i].name,
        style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fontSize: 26, fill: 0xffffff, stroke: { color: 0x000000, width: 5 } },
      });
      name.anchor.set(0.5, 0);

      const check = new Graphics();
      check.visible = false;

      const sparkles: { g: Graphics; phase: number }[] = [];
      for (let s = 0; s < 5; s++) {
        const star = this.makeStar(6);
        star.blendMode = 'add';
        sparkles.push({ g: star, phase: (s / 5) * Math.PI * 2 });
      }

      root.addChild(halo, frame, icon, name, check, ...sparkles.map((s) => s.g));
      root.eventMode = 'static'; root.cursor = 'pointer';
      root.on('pointerdown', () => void this.pick(i));
      this.container.addChild(root);
      this.tiles.push({ root, halo, frame, icon, name, check, sparkles, baseScale: 1 });
    }

    this.hand = new Sprite(handTex);
    this.hand.anchor.set(0.381, 0.039);
    this.container.addChild(this.hand);

    this.ready = true;
    this.layout(this.width, this.height);

    // Juicy entrance: title slam + tiles bounce in (overshoot).
    this.title.scale.set(0);
    void tween(this.ticker, 320, (t) => { if (!this.title.destroyed) this.title.scale.set(easeOutBack(Math.min(1, t * 1.2))); })
      .then(() => { if (!this.title.destroyed) this.title.scale.set(1); });
    for (const tile of this.tiles) {
      tile.root.scale.set(0);
      void tween(this.ticker, 420, (t) => { if (!tile.root.destroyed) tile.root.scale.set(easeOutBack(t) * tile.baseScale); })
        .then(() => { if (!tile.root.destroyed) tile.root.scale.set(tile.baseScale); });
    }

    // Auto-pick fallback so the ad never dead-ends.
    void tween(this.ticker, AUTO_PICK_MS, () => {}).then(() => { if (!this.busy) void this.pick(0); });
  }

  private makeTitle(): Text {
    const t = autoSizeText({
      text: 'CHOOSE YOUR PET!',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fill: 0xffe066, stroke: { color: 0x000000, width: 7 } },
      maxWidth: this.width * 0.92, maxHeight: this.height * 0.1, minPx: 22, maxPx: 64,
    });
    t.anchor.set(0.5);
    return t;
  }

  private makeStar(outer: number): Graphics {
    const inner = outer * 0.4;
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new Graphics().poly(pts).fill(0xffe27a);
  }

  private drawCheck(g: Graphics, side: number): void {
    g.clear();
    const s = side * 0.22, ox = side * 0.35, oy = -side * 0.35;
    g.moveTo(ox - s * 0.5, oy + s * 0.1).lineTo(ox - s * 0.15, oy + s * 0.5).lineTo(ox + s * 0.5, oy - s * 0.4)
      .stroke({ color: CHECK_COLOR, width: Math.max(3, s * 0.2), cap: 'round', join: 'round' });
  }

  private async pick(i: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hand.visible = false;

    const chosen = this.tiles[i];
    const side = pickPetTileSize(this.width, this.tiles.length);

    // Sound: confirm sting + pet reveal.
    audio.buttonTap(0.9);
    audio.collect(1);
    audio.summonReveal(1);

    // Full-screen white flash.
    const flash = new Graphics().rect(0, 0, this.width, this.height).fill(0xffffff);
    flash.alpha = 0;
    this.container.addChild(flash);
    void tween(this.ticker, 280, (t) => { if (!flash.destroyed) flash.alpha = (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7) * 0.8; })
      .then(() => { if (!flash.destroyed) flash.destroy(); });

    // Checkmark + halo flare on the chosen tile.
    chosen.check.visible = true;
    chosen.halo.alpha = 0.95;

    // Dim the losers: desaturate, shrink, fade.
    for (const idx of dimTargets(i, this.tiles.length)) {
      const v = this.tiles[idx];
      const bs = v.baseScale;
      void tween(this.ticker, 360, (t) => {
        if (v.root.destroyed) return;
        v.root.alpha = 1 - t * 0.75;
        v.root.scale.set(bs * (1 - t * 0.25));
        v.frame.tint = 0x888888;
      });
    }

    // Shockwave ring out of the chosen tile.
    const ring = new Graphics().circle(0, 0, side * 0.4).stroke({ color: 0xffffff, width: 6, alpha: 0.9 });
    ring.position.copyFrom(chosen.root.position); ring.blendMode = 'add';
    this.container.addChild(ring);
    void tween(this.ticker, 420, (t) => { if (ring.destroyed) return; ring.scale.set(0.6 + t * 1.8); ring.alpha = (1 - t) * 0.9; })
      .then(() => { if (!ring.destroyed) ring.destroy(); });

    // Confetti/star burst from the chosen tile.
    for (let k = 0; k < 16; k++) {
      const st = this.makeStar(side * (0.04 + Math.random() * 0.03));
      st.blendMode = 'add';
      st.position.copyFrom(chosen.root.position);
      this.container.addChild(st);
      const ang = Math.random() * Math.PI * 2, sp = side * (0.5 + Math.random() * 0.7);
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
      void tween(this.ticker, 600 + Math.random() * 300, (t) => {
        if (st.destroyed) return;
        st.x = chosen.root.x + vx * t;
        st.y = chosen.root.y + vy * t + side * 0.6 * t * t;
        st.rotation += 0.2; st.alpha = 1 - t * t;
      }).then(() => { if (!st.destroyed) st.destroy(); });
    }

    // Elastic pop on the chosen tile.
    const bs = chosen.baseScale;
    await tween(this.ticker, 420, (t) => {
      if (chosen.root.destroyed) return;
      chosen.root.scale.set(bs * (1 + 0.35 * Math.sin(Math.min(1, t) * Math.PI)));
    });
    if (!chosen.root.destroyed) chosen.root.scale.set(bs);

    // Celebratory hold, then resolve → end card (the scene crossfade dissolves out).
    await tween(this.ticker, 600, () => {});
    this.resolveDone();
  }

  update(deltaMS: number): void {
    if (!this.ready || this.busy) return;
    this.elapsed += deltaMS;
    for (const tile of this.tiles) {
      if (tile.root.destroyed) continue;
      tile.halo.alpha = 0.4 + 0.2 * Math.abs(Math.sin(this.elapsed / 420));
      for (const s of tile.sparkles) {
        if (s.g.destroyed) continue;
        s.g.alpha = 0.4 + 0.6 * Math.abs(Math.sin(this.elapsed / 260 + s.phase));
        s.g.scale.set(0.8 + 0.4 * Math.abs(Math.sin(this.elapsed / 300 + s.phase)));
      }
    }
    // Hand nudges between the two tiles.
    if (this.hand.visible && this.tiles.length >= 2) {
      const p = (Math.sin(this.elapsed / 700) + 1) / 2;
      const a = this.tiles[0].root.position, b = this.tiles[1].root.position;
      const side = pickPetTileSize(this.width, this.tiles.length);
      this.hand.position.set(a.x + (b.x - a.x) * p, a.y + side * 0.55 + 24);
    }
  }

  pause(): void {}
  resume(): void {}

  async exit(): Promise<void> { this.container.destroy({ children: true }); }

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    if (!this.ready) return;
    this.bg.clear().rect(0, 0, width, height).fill(BG_COLOR);
    this.title.position.set(width / 2, height * 0.2);

    const positions = pickPetTilePositions(this.tiles.length, width, height);
    const side = pickPetTileSize(width, this.tiles.length);
    for (let i = 0; i < this.tiles.length; i++) {
      const v = this.tiles[i];
      v.root.position.set(positions[i].x, positions[i].y);
      v.frame.width = side; v.frame.height = side;
      v.halo.width = v.halo.height = side * 1.5;
      v.halo.position.set(0, -side * 0.05);
      const iconSize = side * 0.7;
      v.icon.height = iconSize; v.icon.scale.x = v.icon.scale.y;
      v.icon.position.set(0, -side * 0.05);
      v.name.style.fontSize = Math.max(16, side * 0.16);
      v.name.position.set(0, side * 0.5 + 6);
      this.drawCheck(v.check, side);
      v.sparkles.forEach((s, k) => {
        const a = (k / v.sparkles.length) * Math.PI * 2;
        s.g.position.set(Math.cos(a) * side * 0.55, Math.sin(a) * side * 0.55 - side * 0.05);
      });
    }
    this.hand.height = Math.min(width, height) * 0.2; this.hand.scale.x = this.hand.scale.y;
    this.container.hitArea = { contains: () => true };
  }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit 2>&1 | grep -iE "PickPetScene|pickPetLayout" || echo OK` → expect `OK`
Run: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2` → expect `Build successful!`
(Pre-existing tsc errors elsewhere are expected; only PickPetScene/pickPetLayout matter.)

- [ ] **Step 3: Commit**

```bash
git add src/playables/egg-summon/scenes/PickPetScene.ts
git commit -m "egg-summon: juicy PickPetScene (choose 1 of 2 reward pets)"
```

---

### Task 3: Wire PickPetScene into the flow + verify

**Files:**
- Modify: `src/playables/egg-summon/EggSummonDirector.ts`

- [ ] **Step 1: Import the scene**

In `src/playables/egg-summon/EggSummonDirector.ts`, add after the `ClaimRewardScene` import:
```ts
import { PickPetScene } from './scenes/PickPetScene';
```

- [ ] **Step 2: Insert the pick step between claim and the end card**

Find this block in `runFlow()`:
```ts
    await claim.done;
    sdk.finish();
    const endCard = new EndCardScene({ splashImage, logoImage }, this.width, this.height);
    await this.sceneManager.seamlessReplace(endCard);
```
Replace it with:
```ts
    await claim.done;
    // The claimed egg opens into two new pets — the player picks one (juicy).
    const pick = new PickPetScene(this.script, this.ticker, this.width, this.height);
    await this.sceneManager.seamlessReplace(pick);
    await pick.done;
    sdk.finish();
    const endCard = new EndCardScene({ splashImage, logoImage }, this.width, this.height);
    await this.sceneManager.seamlessReplace(endCard);
```

- [ ] **Step 3: Typecheck + build + publish**

Run: `npx tsc --noEmit 2>&1 | grep -iE "EggSummonDirector" || echo OK` → expect `OK`
Run: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo build 2>&1 | tail -2` → expect `Build successful!`
```bash
cd dist && f=$(ls -t egg-summon_*.html | head -1) && cp "$f" index.html && cp "$f" v2.html && cd ..
```

- [ ] **Step 4: Playwright verification (controller does this)**

Drive `?start=claim` with Playwright (414×896): wait for the claim scene, tap CLAIM (~`y=height*0.78`), then capture frames every ~150ms for ~5s into `/tmp/pickpet`. Confirm: the "CHOOSE YOUR PET!" screen appears with two tiles (Sly + Luna) bouncing in with sparkles; tapping a tile triggers the flash + shockwave + confetti + checkmark + pet pop, the other tile dims; then it transitions to the end card. Iterate on juice if needed.

- [ ] **Step 5: Commit**

```bash
git add src/playables/egg-summon/EggSummonDirector.ts
git commit -m "egg-summon: insert pick-a-pet reward step between claim and end card"
```

---

## Notes
- The egg-open "burst" the spec mentions is already provided by `ClaimRewardScene.claim()` (white flash + gold-sparkle burst) plus the scene crossfade into the pick screen; no extra work needed there.
- Auto-pick after 6s keeps the ad from dead-ending.
- The chosen pet does not alter the end card (still the standard Play Now card).
