# Egg-Summon Playable — Phase 1 (Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one working "Hatch Your Beast" playable: open 3 eggs → pull a Mythic pet → pick it as fighter → one dice roll to the Boss Tile → win a boss fight with the pet → install end card. One hardcoded variant (`Sly → Luna → Glacidrake`, straight arc, Base hero + WarriorBlade, Skeleton King boss).

**Architecture:** New `egg-summon` playable type under `src/playables/egg-summon/`. An `EggSummonDirector` sequences scenes through `SceneManager`, awaiting each scene's `done` promise: `EggSummonScene → PickFighterScene → BoardRollScene → FightScene → end card`. It reuses `FightEngine`, `SpineCharacter`, and board-fight's committed catalog (boss/bg/weapon) as shared libraries, but defines its **own** hero + pet Spine bundles to avoid depending on board-fight's build-time artifacts. No codegen in Phase 1 — the script is hardcoded (Phase 2 adds the variant/codegen matrix).

**Tech Stack:** TypeScript, PixiJS 8, spine-pixi-v8, `@smoud/playable-sdk`, webpack (playable-scripts), sharp (asset compression), Playwright (e2e smoke).

**Spec:** `docs/superpowers/specs/2026-05-24-egg-summon-hatch-your-beast-design.md`

---

## Testing approach (read first)

This repo has **no unit-test harness** (no Jest/Vitest). Playable logic is PIXI/Spine + Spine animation; it is verified by **(a)** a Playwright e2e smoke test that boots the playable and asserts the canvas mounts with no console errors, and **(b)** documented manual visual checks against the dev server. So "verify" steps in this plan mean *run the dev server / smoke test and confirm the described behavior visually* — not "write a failing unit test." Each task still ends with a commit.

**Dev server:** `npm run dev:variant -- --type egg-summon demo dev` serves at `http://localhost:3000` (confirm the port from the dev-server banner). Load `http://localhost:3000/?type=egg-summon`.

**Game asset source (already on disk):** `~/Desktop/pocket-client/.pocketroll-tmp/Assets/Gameplay/BattleSystem/Pets/<NN Rarity>/<Pet>/` — folder names contain spaces (e.g. `01 Common`), so quote paths in `cp`.

---

## File structure

```
src/playables/egg-summon/
  index.ts              # PlayableType<EggSummonScript>
  EggSummonDirector.ts  # PlayableLifecycle; owns Application + Ticker + SceneManager; sequences scenes
  script.ts             # EggSummonScript type + PHASE1_SCRIPT (hardcoded egg lineup + arc)
  catalog.ts            # egg-summon's OWN hero bundle (full Main_Character.json) + pet bundles + reveal sprites
  fightConfig.ts        # buildBossFight(): FightSceneConfig (hero + pet vs Skeleton King)
  scenes/
    EggSummonScene.ts   # 3 eggs, tap-to-open, rarity-escalation reveal
    PickFighterScene.ts # 3 pet icons, pick the mythic, fly to hero side
    BoardRollScene.ts   # single 2D dice roll → hero token hops to Boss Tile
    FightScene.ts       # wraps FightEngine; resolves done on victory; taps fire CTA
  rarity.ts             # RARITY_TINT map + reveal label text/colors
assets/egg-summon/
  pets/Sly.webp Luna.webp Glacidrake.webp           # reveal sprites (resized ~256px)
  spine/Glacidrake.{atlas,json,webp}                # fighter Spine battler
tests/
  egg-summon.spec.ts    # Playwright boot smoke test
```

Files that change together live together (all egg-summon scenes under one folder). The fight config is its own file because it's the largest data blob and Phase 2 will replace it with codegen output.

---

## Task 1: Scaffold the `egg-summon` type that boots to a placeholder and shows the end card

**Files:**
- Create: `src/playables/egg-summon/index.ts`
- Create: `src/playables/egg-summon/script.ts`
- Create: `src/playables/egg-summon/EggSummonDirector.ts`
- Create: `src/playables/egg-summon/scenes/EggSummonScene.ts` (placeholder for now)
- Modify: `src/index.ts` (register the type — dev switch + prod `if`)

- [ ] **Step 1: Create the script type + hardcoded Phase-1 config**

`src/playables/egg-summon/script.ts`:
```typescript
export type Rarity = 'common' | 'rare' | 'mythic';

export interface EggReveal {
  /** Egg glow tier (bronze/silver/gold maps to common/rare/mythic for Phase 1). */
  rarity: Rarity;
  /** Display name shown on reveal, e.g. "Glacidrake". */
  name: string;
  /** Pet id used to resolve reveal sprite + (for the fighter) the Spine bundle. */
  pet: 'sly' | 'luna' | 'glacidrake';
}

export interface EggSummonScript {
  eggs: EggReveal[];           // length 3, ascending rarity (straight arc)
  fighterIndex: number;        // which egg becomes the battling pet (the mythic)
}

export const PHASE1_SCRIPT: EggSummonScript = {
  eggs: [
    { rarity: 'common', name: 'Sly', pet: 'sly' },
    { rarity: 'rare', name: 'Luna', pet: 'luna' },
    { rarity: 'mythic', name: 'Glacidrake', pet: 'glacidrake' },
  ],
  fighterIndex: 2,
};
```

- [ ] **Step 2: Create a placeholder first scene** (full flow comes in later tasks)

`src/playables/egg-summon/scenes/EggSummonScene.ts`:
```typescript
import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { EggSummonScript } from '../script';

export class EggSummonScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;

  private resolveDone!: () => void;
  private ready = false;
  private bg!: Graphics;
  private label!: Text;

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    this.bg = new Graphics();
    this.container.addChild(this.bg);
    this.label = new Text({
      text: 'OPEN YOUR EGGS (placeholder — tap)',
      style: { fontFamily: 'Arial', fontSize: 32, fill: 0xffffff, align: 'center' },
    });
    this.label.anchor.set(0.5);
    this.container.addChild(this.label);

    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.on('pointerdown', () => this.resolveDone());

    this.ready = true;
    this.layout(this.width, this.height);
  }

  async exit(): Promise<void> { this.container.removeChildren(); }
  update(_deltaMS: number): void {}
  pause(): void {}
  resume(): void {}

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    if (!this.ready) return;
    this.bg.clear();
    this.bg.rect(0, 0, width, height).fill(0x141430);
    this.label.position.set(width / 2, height / 2);
    this.container.hitArea = { contains: () => true };
  }
}
```

- [ ] **Step 3: Create the director that sequences scenes and shows the end card**

`src/playables/egg-summon/EggSummonDirector.ts`:
```typescript
import { Application, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from '@shared/SceneManager';
import { safeInstall } from '@shared/mraidInstall';
import type { PlayableLifecycle } from '@shared/PlayableType';
import type { EggSummonScript } from './script';
import { EggSummonScene } from './scenes/EggSummonScene';

export class EggSummonDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;

  constructor(
    private width: number,
    private height: number,
    private script: EggSummonScript,
  ) {
    this.app = new Application();
    this.ticker = new Ticker();
    this.init();
  }

  private async init(): Promise<void> {
    await this.app.init({
      width: this.width, height: this.height,
      backgroundAlpha: 0, antialias: true,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);
    this.sceneManager = new SceneManager(this.app.stage);
    this.ticker.add((t) => this.sceneManager.update(t.deltaMS));
    this.ticker.start();
    sdk.start();
    void this.runFlow();
  }

  private async runFlow(): Promise<void> {
    const egg = new EggSummonScene(this.script, this.ticker, this.width, this.height);
    await this.sceneManager.push(egg, 'replace');
    await egg.done;
    // Subsequent scenes (Pick, BoardRoll, Fight) are wired in later tasks.
    this.showEndCard();
  }

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.app.renderer.resize(width, height);
    this.sceneManager?.layout(width, height);
  }
  pause(): void { this.ticker.stop(); }
  resume(): void { this.ticker.start(); }

  showEndCard(): void {
    // Placeholder until Task 7 wires the real end card; tap to install.
    this.app.canvas.addEventListener('pointerdown', () => safeInstall(), { once: true });
  }
}
```

- [ ] **Step 4: Create the type entry point**

`src/playables/egg-summon/index.ts`:
```typescript
import type { PlayableType } from '@shared/PlayableType';
import { EggSummonDirector } from './EggSummonDirector';
import { PHASE1_SCRIPT, type EggSummonScript } from './script';

const eggSummonType: PlayableType<EggSummonScript> = {
  name: 'egg-summon',
  async getScript() { return PHASE1_SCRIPT; },
  create(width, height, script) { return new EggSummonDirector(width, height, script); },
};

export default eggSummonType;
```

- [ ] **Step 5: Register the type in `src/index.ts`**

In the `__DEV__` switch (after the `case 'sidescroller':` block), add:
```typescript
      case 'egg-summon':
        return (await import('./playables/egg-summon')).default;
```
In the production block (after the `if (PLAYABLE_TYPE === 'sidescroller')` block), add:
```typescript
  if (PLAYABLE_TYPE === 'egg-summon') {
    return (await import('./playables/egg-summon')).default;
  }
```

- [ ] **Step 6: Run the dev server and verify it boots**

Run: `npm run dev:variant -- --type egg-summon demo dev`
Open: `http://localhost:3000/?type=egg-summon`
Expected: dark blue screen with "OPEN YOUR EGGS (placeholder — tap)". Tapping the screen leaves the placeholder visible (end card not built yet). No errors in the browser console. The TypePicker dropdown (top-left) lists `egg-summon`.

- [ ] **Step 7: Write the Playwright boot smoke test**

`tests/egg-summon.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test('egg-summon boots without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000/?type=egg-summon');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2000);

  expect(errors, errors.join('\n')).toEqual([]);
});
```

- [ ] **Step 8: Run the smoke test** (dev server must be running)

Run: `npx playwright test tests/egg-summon.spec.ts --project=chromium`
Expected: 1 passed.

- [ ] **Step 9: Commit**

```bash
git add src/playables/egg-summon src/index.ts tests/egg-summon.spec.ts
git commit -m "feat(egg-summon): scaffold playable type with placeholder scene + boot smoke test"
```

---

## Task 2: Import pet assets + define egg-summon's own hero/pet/boss catalog

**Files:**
- Create: `assets/egg-summon/pets/{Sly,Luna,Glacidrake}.webp`
- Create: `assets/egg-summon/spine/Glacidrake.{atlas,json,webp}`
- Create: `src/playables/egg-summon/catalog.ts`
- Create: `src/playables/egg-summon/rarity.ts`

- [ ] **Step 1: Copy raw pet assets from the game repo**

```bash
cd /Users/idohoresh/Desktop/pocket-playable
mkdir -p assets/egg-summon/pets assets/egg-summon/spine
SRC="$HOME/Desktop/pocket-client/.pocketroll-tmp/Assets/Gameplay/BattleSystem/Pets"
cp "$SRC/01 Common/Sly/Sly_Sprite.png"          assets/egg-summon/pets/Sly.png
cp "$SRC/03 Rare/Luna/Luna_Sprite.png"          assets/egg-summon/pets/Luna.png
cp "$SRC/06 Mythic/Glacidrake/Glacidrake_Sprite.png" assets/egg-summon/pets/Glacidrake.png
# Fighter Spine (full json is fine — pet has only 3 anims):
cp "$SRC/06 Mythic/Glacidrake/Glacidrake.json"      assets/egg-summon/spine/Glacidrake.json
cp "$SRC/06 Mythic/Glacidrake/Glacidrake.atlas.txt" assets/egg-summon/spine/Glacidrake.atlas
cp "$SRC/06 Mythic/Glacidrake/Glacidrake.png"       assets/egg-summon/spine/Glacidrake.png
```

- [ ] **Step 2: Resize reveal sprites (they're ~4 MB PNGs) and convert everything to webp**

```bash
cd /Users/idohoresh/Desktop/pocket-playable
# Reveal sprites only need to be small icons — resize to 320px wide, then webp:
node -e "const s=require('sharp');(async()=>{for(const p of ['Sly','Luna','Glacidrake']){await s('assets/egg-summon/pets/'+p+'.png').resize({width:320}).webp({quality:80}).toFile('assets/egg-summon/pets/'+p+'.webp');}})()"
# Fighter Spine atlas page → webp at the atlas's native size:
node -e "require('sharp')('assets/egg-summon/spine/Glacidrake.png').webp({quality:75}).toFile('assets/egg-summon/spine/Glacidrake.webp').then(()=>console.log('ok'))"
# Remove the source PNGs so they aren't bundled:
rm assets/egg-summon/pets/*.png assets/egg-summon/spine/Glacidrake.png
ls -la assets/egg-summon/pets assets/egg-summon/spine
```
Expected: only `.webp` files in `pets/`, and `Glacidrake.{atlas,json,webp}` in `spine/`. Note the Glacidrake.webp size (should be well under 1 MB; if over, Task 7 resizes the atlas).

> **Gotcha (from `lessons.md`):** webpack resolves the literal `.webp` path — the PNG→webp conversion is NOT automatic. Generate the `.webp` before importing it, or you get `Module not found`.

- [ ] **Step 3: Define rarity tints + reveal styling**

`src/playables/egg-summon/rarity.ts`:
```typescript
import type { Rarity } from './script';

/** Egg glow + reveal flash tint per tier. Bronze/silver/gold for the three eggs;
 *  the full escalation ladder is used by the mythic egg's build-up animation. */
export const RARITY_TINT: Record<string, number> = {
  common: 0x9aa0a6,   // grey
  great: 0x5fd35f,    // green
  rare: 0x3d7dff,     // blue
  epic: 0xb14dff,     // purple
  legendary: 0xffa028,// orange
  mythic: 0xff3b3b,   // red
};

/** Ascending ladder the mythic egg shakes through (mirrors the game's LootBoxPetEggAnimation). */
export const RARITY_LADDER = ['common', 'great', 'rare', 'epic', 'legendary', 'mythic'] as const;

export const REVEAL_LABEL: Record<Rarity, string> = {
  common: 'COMMON',
  rare: 'RARE',
  mythic: 'MYTHIC!!!',
};

/** Egg base color shown before opening (bronze/silver/gold). */
export const EGG_BASE_TINT: Record<Rarity, number> = {
  common: 0xcd7f32, // bronze
  rare: 0xc0c0c0,   // silver
  mythic: 0xffd24a, // gold
};
```

- [ ] **Step 4: Define the egg-summon catalog (own hero bundle + pet bundles + reveal sprites)**

`src/playables/egg-summon/catalog.ts`:
```typescript
import { Assets, Texture } from 'pixi.js';
import type { SpineAssets } from '@shared/SpineCharacter';

// --- Hero: egg-summon's OWN bundle. Imports the COMMITTED full Main_Character.json
//     (NOT Main_Character.build.json, which is gitignored + produced only by a board-fight build). ---
import heroAtlasRaw from 'assets/Spine/Main_Character.atlas';
import heroJsonRaw from 'assets/Spine/Main_Character.json';
import heroPngData from 'assets/Spine/Main_Character.webp';

export const HERO_BASE_BUNDLE: SpineAssets = {
  atlasRaw: heroAtlasRaw,
  jsonRaw: heroJsonRaw,
  pngData: heroPngData,
  defaultScale: 0.12,
};
export const HERO_BASE_SKIN = 'Base';

// --- Fighter pet Spine: Glacidrake (anims: Idle, Move, Basic_Attack) ---
import glacidrakeAtlasRaw from 'assets/egg-summon/spine/Glacidrake.atlas';
import glacidrakeJsonRaw from 'assets/egg-summon/spine/Glacidrake.json';
import glacidrakePngData from 'assets/egg-summon/spine/Glacidrake.webp';

export const GLACIDRAKE_BUNDLE: SpineAssets = {
  atlasRaw: glacidrakeAtlasRaw,
  jsonRaw: glacidrakeJsonRaw,
  pngData: glacidrakePngData,
  defaultScale: 0.14,
};

// --- Reveal sprites (static art for all three pets) ---
import slySprite from 'assets/egg-summon/pets/Sly.webp';
import lunaSprite from 'assets/egg-summon/pets/Luna.webp';
import glacidrakeSprite from 'assets/egg-summon/pets/Glacidrake.webp';

const REVEAL_SPRITE_DATA: Record<string, string> = {
  sly: slySprite, luna: lunaSprite, glacidrake: glacidrakeSprite,
};

/** Load a pet's reveal sprite as a Texture. */
export async function loadRevealTexture(pet: string): Promise<Texture> {
  return Assets.load(REVEAL_SPRITE_DATA[pet]);
}
```

- [ ] **Step 5: Verify it still compiles + boots** (imports resolve)

Run (dev server from Task 1, or restart): `npm run dev:variant -- --type egg-summon demo dev`
Open `http://localhost:3000/?type=egg-summon`. Expected: the placeholder still loads, no `Module not found` errors. (Catalog isn't used by a scene yet — this step only proves the asset imports resolve.) To force the imports into the bundle for this check, temporarily add `import './catalog';` to `EggSummonScene.ts`, verify, then remove it.

- [ ] **Step 6: Commit**

```bash
git add assets/egg-summon src/playables/egg-summon/catalog.ts src/playables/egg-summon/rarity.ts
git commit -m "feat(egg-summon): import pet reveal sprites + Glacidrake Spine; own hero/pet catalog"
```

---

## Task 3: Build the EggSummonScene (3 eggs, tap-to-open, rarity-escalation reveal)

**Files:**
- Modify: `src/playables/egg-summon/scenes/EggSummonScene.ts` (replace placeholder)

The scene shows a hero portrait area at top and 3 eggs centered. Each egg is procedural (`Graphics` ellipse + tinted glow), so no egg art is needed. Tapping the lit egg: shakes (escalating through the rarity ladder up to the egg's tier, mirroring the game's `LootBoxPetEggAnimation`), cracks, then reveals the pet's static sprite with a particle burst + flash. After the third (mythic) egg reveals, `done` resolves. A hand-pointer pulses on the next tappable egg.

- [ ] **Step 1: Replace EggSummonScene with the full implementation**

`src/playables/egg-summon/scenes/EggSummonScene.ts`:
```typescript
import { Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeOutBack, easeOutQuad, punch } from '@shared/easing';
import { ParticleEmitter } from '@shared/particleEmitter';
import type { EggSummonScript } from '../script';
import { EGG_BASE_TINT, RARITY_LADDER, RARITY_TINT, REVEAL_LABEL } from '../rarity';
import { loadRevealTexture } from '../catalog';

interface EggView {
  root: Container;
  glow: Graphics;
  body: Graphics;
  pet?: Sprite;
  opened: boolean;
}

export class EggSummonScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private ready = false;
  private bg!: Graphics;
  private title!: Text;
  private pointer!: Graphics;
  private eggs: EggView[] = [];
  private petTex: Texture[] = [];
  private nextEgg = 0;
  private busy = false;
  private emitter!: ParticleEmitter;
  private particleTex!: Texture;
  private elapsed = 0;

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    this.petTex = await Promise.all(this.script.eggs.map((e) => loadRevealTexture(e.pet)));

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.title = new Text({
      text: 'OPEN YOUR EGGS',
      style: { fontFamily: 'Arial', fontWeight: '900', fontSize: 48, fill: 0xffffff, stroke: { color: 0x000000, width: 6 } },
    });
    this.title.anchor.set(0.5);
    this.container.addChild(this.title);

    for (let i = 0; i < this.script.eggs.length; i++) {
      const root = new Container();
      const glow = new Graphics();
      const body = new Graphics();
      root.addChild(glow, body);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointerdown', () => this.openEgg(i));
      this.container.addChild(root);
      this.eggs.push({ root, glow, body, opened: false });
    }

    this.pointer = new Graphics();
    this.pointer.moveTo(0, 0).lineTo(-14, -28).lineTo(14, -28).closePath().fill(0xffffff);
    this.container.addChild(this.pointer);

    // 1x1 white texture for particle bursts (tinted per-burst).
    const g = new Graphics().rect(0, 0, 8, 8).fill(0xffffff);
    this.particleTex = this.ticker ? Texture.WHITE : Texture.WHITE;
    g.destroy();
    this.emitter = new ParticleEmitter(this.ticker);
    this.container.addChild(this.emitter as unknown as Container ?? new Container());

    this.ready = true;
    this.layout(this.width, this.height);
  }

  private async openEgg(i: number): Promise<void> {
    const view = this.eggs[i];
    if (this.busy || view.opened || i !== this.nextEgg) return;
    this.busy = true;
    this.pointer.visible = false;

    const egg = this.script.eggs[i];
    const targetTier = RARITY_LADDER.indexOf(egg.rarity as (typeof RARITY_LADDER)[number]);

    // Shake, escalating through each rarity tier up to the egg's rarity.
    for (let tier = 0; tier <= targetTier; tier++) {
      const mag = 6 + tier * 5;
      view.glow.tint = RARITY_TINT[RARITY_LADDER[tier]];
      await tween(this.ticker, 220, (t) => {
        view.body.x = punch(mag, 6, t);
        const s = 1 + 0.06 * Math.sin(t * Math.PI);
        view.body.scale.set(s);
      });
      view.body.x = 0; view.body.scale.set(1);
    }

    // Crack + reveal: flash, hide egg body, pop the pet sprite in with a burst.
    view.glow.tint = RARITY_TINT[egg.rarity];
    const flash = new Graphics().rect(0, 0, this.width, this.height).fill(0xffffff);
    flash.alpha = 0;
    this.container.addChild(flash);
    await tween(this.ticker, 120, (t) => { flash.alpha = Math.sin(t * Math.PI) * 0.85; });
    flash.destroy();

    view.body.visible = false;
    const pet = new Sprite(this.petTex[i]);
    pet.anchor.set(0.5, 1);
    pet.scale.set(0);
    view.root.addChild(pet);
    view.pet = pet;
    this.layoutEgg(i);

    this.emitter.burst({
      texture: this.particleTex, count: egg.rarity === 'mythic' ? 80 : 30,
      origin: { x: view.root.x, y: view.root.y }, innerR: 10, outerR: 40,
      speedMin: 200, speedMax: 600, lifetimeMin: 0.4, lifetimeMax: 0.9,
      scaleMin: 0.5, scaleMax: 1.5, scaleEnd: 0, alphaStart: 1, alphaEnd: 0,
      tint: RARITY_TINT[egg.rarity],
    });

    await tween(this.ticker, 420, (t) => { pet.scale.set(easeOutBack(t) * 0.9); });

    const label = new Text({
      text: REVEAL_LABEL[egg.rarity],
      style: { fontFamily: 'Arial', fontWeight: '900', fontSize: egg.rarity === 'mythic' ? 56 : 36, fill: RARITY_TINT[egg.rarity], stroke: { color: 0x000000, width: 6 } },
    });
    label.anchor.set(0.5);
    label.position.set(view.root.x, view.root.y - 180);
    this.container.addChild(label);
    await tween(this.ticker, 500, (t) => { label.alpha = 1 - easeOutQuad(Math.max(0, (t - 0.6) / 0.4)); });

    view.opened = true;
    this.busy = false;
    this.nextEgg++;

    if (this.nextEgg >= this.eggs.length) {
      await tween(this.ticker, 400, () => {});
      this.resolveDone();
    } else {
      this.pointer.visible = true;
      this.layout(this.width, this.height);
    }
  }

  async exit(): Promise<void> { this.emitter?.destroy(); this.container.removeChildren(); }
  update(deltaMS: number): void { this.elapsed += deltaMS; if (this.pointer) this.pointer.alpha = 0.5 + 0.5 * Math.abs(Math.sin(this.elapsed / 300)); }
  pause(): void {} resume(): void {}

  private layoutEgg(i: number): void {
    const view = this.eggs[i];
    const n = this.eggs.length;
    const gap = Math.min(this.width / (n + 1), 180);
    const x = this.width / 2 + (i - (n - 1) / 2) * gap;
    const y = this.height * 0.55;
    view.root.position.set(x, y);
    const r = gap * 0.32;
    view.glow.clear().circle(0, 0, r * 1.8).fill({ color: 0xffffff, alpha: 0.35 });
    view.glow.tint = RARITY_TINT[this.script.eggs[i].rarity] ?? 0xffffff;
    view.body.clear().ellipse(0, 0, r, r * 1.3).fill(EGG_BASE_TINT[this.script.eggs[i].rarity]);
    view.body.ellipse(-r * 0.35, -r * 0.5, r * 0.18, r * 0.3).fill({ color: 0xffffff, alpha: 0.6 });
    if (view.pet) { view.pet.position.set(0, r * 1.3); view.pet.height = r * 3; view.pet.scale.x = view.pet.scale.y; }
  }

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    if (!this.ready) return;
    this.bg.clear().rect(0, 0, width, height).fill(0x141430);
    this.title.position.set(width / 2, height * 0.18);
    for (let i = 0; i < this.eggs.length; i++) this.layoutEgg(i);
    const next = this.eggs[this.nextEgg];
    this.pointer.visible = !!next && !this.busy;
    if (next) this.pointer.position.set(next.root.x + 30, next.root.y + 40);
    this.container.hitArea = { contains: () => true };
  }
}
```

> Note: `ParticleEmitter`'s container wiring — confirm whether `ParticleEmitter` exposes a `.container`/`.view` to add to the stage (the explore notes show `constructor(ticker)` + `burst()` + `destroy()`). If it self-attaches via a passed parent, adjust the `addChild` line accordingly when implementing. Use `Texture.WHITE` for particles (already used above).

- [ ] **Step 2: Verify the egg-open flow visually**

Run the dev server, load `?type=egg-summon`. Expected: title "OPEN YOUR EGGS"; three eggs (bronze/silver/gold) with a pulsing pointer on egg 1. Tapping egg 1 shakes once → "COMMON" + Sly sprite. Egg 2 → "RARE" + Luna. Egg 3 shakes escalating through tiers → big flash → "MYTHIC!!!" + Glacidrake + heavy burst. After egg 3, it advances to the placeholder end card.

- [ ] **Step 3: Run the smoke test**

Run: `npx playwright test tests/egg-summon.spec.ts --project=chromium`
Expected: 1 passed (no console errors during boot).

- [ ] **Step 4: Commit**

```bash
git add src/playables/egg-summon/scenes/EggSummonScene.ts
git commit -m "feat(egg-summon): 3-egg gacha scene with rarity-escalation reveal"
```

---

## Task 4: Build the PickFighterScene (3 pet icons → pick the mythic → fly to hero side)

**Files:**
- Create: `src/playables/egg-summon/scenes/PickFighterScene.ts`
- Modify: `src/playables/egg-summon/EggSummonDirector.ts` (insert between egg + end card)

- [ ] **Step 1: Create PickFighterScene**

`src/playables/egg-summon/scenes/PickFighterScene.ts`:
```typescript
import { Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeInOutQuad } from '@shared/easing';
import type { EggSummonScript } from '../script';
import { RARITY_TINT } from '../rarity';
import { loadRevealTexture } from '../catalog';

export class PickFighterScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private ready = false;
  private bg!: Graphics;
  private title!: Text;
  private icons: Container[] = [];
  private petTex: Texture[] = [];
  private busy = false;
  private elapsed = 0;
  private glowFor = -1;

  constructor(
    private script: EggSummonScript,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
    this.glowFor = script.fighterIndex;
  }

  async enter(): Promise<void> {
    this.petTex = await Promise.all(this.script.eggs.map((e) => loadRevealTexture(e.pet)));
    this.bg = new Graphics();
    this.container.addChild(this.bg);
    this.title = new Text({
      text: 'PICK YOUR FIGHTER',
      style: { fontFamily: 'Arial', fontWeight: '900', fontSize: 44, fill: 0xffffff, stroke: { color: 0x000000, width: 6 } },
    });
    this.title.anchor.set(0.5);
    this.container.addChild(this.title);

    for (let i = 0; i < this.script.eggs.length; i++) {
      const c = new Container();
      const ring = new Graphics();
      const pet = new Sprite(this.petTex[i]);
      pet.anchor.set(0.5);
      c.addChild(ring, pet);
      (c as Container & { _ring?: Graphics })._ring = ring;
      c.eventMode = 'static'; c.cursor = 'pointer';
      c.on('pointerdown', () => this.pick(i));
      this.container.addChild(c);
      this.icons.push(c);
    }
    this.ready = true;
    this.layout(this.width, this.height);
  }

  private async pick(i: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const chosen = this.icons[i];
    // Fly chosen icon toward hero side (lower-left), fade the others.
    const startX = chosen.x, startY = chosen.y;
    const targetX = this.width * 0.3, targetY = this.height * 0.7;
    this.icons.forEach((c, idx) => { if (idx !== i) tween(this.ticker, 250, (t) => { c.alpha = 1 - t; }); });
    await tween(this.ticker, 600, (t) => {
      const e = easeInOutQuad(t);
      chosen.position.set(startX + (targetX - startX) * e, startY + (targetY - startY) * e);
      chosen.scale.set(1 + 0.4 * Math.sin(t * Math.PI));
    });
    this.resolveDone();
  }

  async exit(): Promise<void> { this.container.removeChildren(); }
  update(deltaMS: number): void {
    this.elapsed += deltaMS;
    if (this.glowFor >= 0 && this.icons[this.glowFor]) {
      const ring = (this.icons[this.glowFor] as Container & { _ring?: Graphics })._ring;
      if (ring) ring.alpha = 0.5 + 0.5 * Math.abs(Math.sin(this.elapsed / 300));
    }
  }
  pause(): void {} resume(): void {}

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    if (!this.ready) return;
    this.bg.clear().rect(0, 0, width, height).fill(0x141430);
    this.title.position.set(width / 2, height * 0.2);
    const n = this.icons.length;
    const gap = Math.min(width / (n + 1), 190);
    for (let i = 0; i < n; i++) {
      const c = this.icons[i];
      c.position.set(width / 2 + (i - (n - 1) / 2) * gap, height * 0.6);
      const pet = c.children[1] as Sprite;
      pet.height = gap * 0.7; pet.scale.x = pet.scale.y;
      const ring = (c as Container & { _ring?: Graphics })._ring!;
      const r = gap * 0.42;
      const isHero = i === this.glowFor;
      ring.clear().circle(0, 0, r).fill({ color: RARITY_TINT[this.script.eggs[i].rarity], alpha: isHero ? 0.4 : 0.15 });
      ring.alpha = isHero ? 0.8 : 0.4;
    }
    this.container.hitArea = { contains: () => true };
  }
}
```

- [ ] **Step 2: Wire PickFighterScene into the director**

In `EggSummonDirector.ts`, replace the body of `runFlow()` between the egg scene and `showEndCard()`:
```typescript
  private async runFlow(): Promise<void> {
    const egg = new EggSummonScene(this.script, this.ticker, this.width, this.height);
    await this.sceneManager.push(egg, 'replace');
    await egg.done;

    const pick = new PickFighterScene(this.script, this.ticker, this.width, this.height);
    await this.sceneManager.push(pick, 'replace');
    await pick.done;

    this.showEndCard();
  }
```
Add the import at the top: `import { PickFighterScene } from './scenes/PickFighterScene';`

- [ ] **Step 3: Verify** — dev server, `?type=egg-summon`. After the mythic reveal, the pick screen shows 3 pet icons with the mythic glowing; tapping it flies the icon toward the hero side, then advances to the placeholder end card.

- [ ] **Step 4: Smoke test + commit**

```bash
npx playwright test tests/egg-summon.spec.ts --project=chromium
git add src/playables/egg-summon
git commit -m "feat(egg-summon): pick-fighter scene + director wiring"
```

---

## Task 5: Build the FightScene (FightEngine: hero + pet vs Skeleton King)

**Files:**
- Create: `src/playables/egg-summon/fightConfig.ts`
- Create: `src/playables/egg-summon/scenes/FightScene.ts`
- Modify: `src/playables/board-fight/fight/FightEngine.ts` (add `Basic_Attack` to attack fallback lists — only if needed)
- Modify: `src/playables/egg-summon/EggSummonDirector.ts`

> **Pet animation constraint:** the pet Spine has only `Idle`, `Move`, `Basic_Attack` — no hit/death. The fight steps below ensure **the boss only ever targets the hero (actor 0)**, so the pet never needs a hit/death animation. The pet only performs `category: 'basic'` melee attacks.

- [ ] **Step 1: Confirm the engine's `basic` attack fallback includes `Basic_Attack`**

Read `src/playables/board-fight/fight/FightEngine.ts:54-83` (the attack timing categories). Find the `basic` category's `animWithFallbacks` array. If `'Basic_Attack'` is not present, add it so the pet's attack animates:
```typescript
// in the 'basic' category animWithFallbacks array, ensure it includes 'Basic_Attack':
animWithFallbacks: ['Attack', 'Basic_Attack', 'Attack_Melee', 'Attack1', 'Attack_1'],
```
If `'Basic_Attack'` is already in the list, skip this edit. (The hero uses `'Attack'`; this only adds a fallback, so it cannot regress existing enemies/hero.)

- [ ] **Step 2: Build the boss fight config**

`src/playables/egg-summon/fightConfig.ts`:
```typescript
import type { FightSceneConfig } from '@/playables/board-fight/fight/FightStep';
import { skeletonKingBundle } from '@/playables/board-fight/catalog/enemies/stage1/skeletonKing';
import battleBgStage1 from '@/playables/board-fight/catalog/battleBgs/stage1';
import { HERO_BASE_BUNDLE, HERO_BASE_SKIN, GLACIDRAKE_BUNDLE } from './catalog';

// Boss pacing (GameDesign): explosive opener → boss rage/suspense → rally → finisher.
// IMPORTANT: every enemy 'attack' targets actor 0 (hero) only — the pet (actor 1) is never hit.
export function buildBossFight(): FightSceneConfig {
  return {
    background: battleBgStage1,
    bossFight: true,
    characterScale: 0.12,
    players: [
      { spine: HERO_BASE_BUNDLE, skin: HERO_BASE_SKIN, maxHp: 200000, hp: 200000, maxRage: 100, melee: true, xFrac: 0.22, yFrac: 0.82 },
      { spine: GLACIDRAKE_BUNDLE, maxHp: 100000, melee: true, scale: 0.16, xFrac: 0.36, yFrac: 0.9 },
    ],
    enemies: [
      { spine: skeletonKingBundle, skin: 'default', maxHp: 280000, melee: true, maxRage: 100, xFrac: 0.82, yFrac: 0.85 },
    ],
    steps: [
      // Opener — hero + pet hammer the boss
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 40000, melee: true, rageFill: 20, return: false },
      { type: 'attack', side: 'player', actor: 1, target: 0, damage: 35000, melee: true, category: 'combo', return: false },
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 38000, melee: true, category: 'combo', crit: true, rageFill: 20 },
      // Boss rages (suspense) — targets the HERO only
      { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 70000, category: 'rage', dramatic: true, rageFill: 0 },
      { type: 'vignette', on: true },
      // Rally — pet + hero comeback
      { type: 'attack', side: 'player', actor: 1, target: 0, damage: 45000, melee: true, return: false },
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 50000, melee: true, category: 'combo', crit: true, rageFill: 20, return: false },
      { type: 'attack', side: 'enemy', actor: 0, target: 0, dodge: true },
      // Epic finisher
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 120000, melee: true, category: 'rage', dramatic: true, crit: true },
      { type: 'die', actor: 0 },
      { type: 'vignette', on: false },
    ],
    onVictory: { labelText: 'VICTORY!' },
  };
}
```
> Tune damage so the boss's `maxHp` is exhausted exactly at the `die` step (sum of player damage on `target:0` ≈ boss maxHp). Adjust numbers during Step 4's visual check so the boss dies on the final rage hit.

- [ ] **Step 3: Create FightScene wrapping FightEngine**

`src/playables/egg-summon/scenes/FightScene.ts`:
```typescript
import { Container, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { FightEngine } from '@/playables/board-fight/fight/FightEngine';
import type { PlayerState } from '@/playables/board-fight/PlayerState';
import { WARRIORS_BLADE } from '@/playables/board-fight/catalog/weapons/warriorBlade';
import { buildBossFight } from '../fightConfig';

export class FightScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private engine?: FightEngine;
  private battleArea = new Container();

  constructor(private ticker: Ticker, private width: number, private height: number) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    this.container.addChild(this.battleArea);
    const config = { ...buildBossFight(), allSkills: [] };
    const state: PlayerState = {
      hp: 200000, maxHp: 200000, atk: 50000, coins: 0,
      skills: [], weapon: 'warriorBlade', weaponConfig: WARRIORS_BLADE,
      heroSkin: 'Base', boardTileIndex: 0,
    };
    const battleH = this.height * 0.55;
    this.engine = new FightEngine(config, state, this.ticker, this.battleArea, this.width, battleH);
    await this.engine.init();
    void this.engine.run().then(() => this.resolveDone());
  }

  async exit(): Promise<void> { this.engine?.destroyActors(); this.container.removeChildren(); }
  update(_deltaMS: number): void {}
  pause(): void {} resume(): void {}

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    // Engine lays out actors against battleH; re-init layout if needed via layoutActors.
    (this.engine as unknown as { layoutActors?: () => void })?.layoutActors?.();
  }
}
```
> Confirm the import paths/aliases: this repo uses `@shared/*` and (per generated files) `../catalog/...`. From `egg-summon/scenes/`, board-fight modules are reachable via the `@/playables/board-fight/...` alias if configured, otherwise use a relative path (`../../board-fight/...`). Check `tsconfig.json` `paths` and webpack alias; use whichever the codebase already uses for cross-playable imports, falling back to relative paths.

- [ ] **Step 4: Wire FightScene into the director (before the end card)**

In `EggSummonDirector.ts` `runFlow()`, after `await pick.done;` and before `this.showEndCard();`:
```typescript
    const fight = new FightScene(this.ticker, this.width, this.height);
    await this.sceneManager.push(fight, 'replace');
    await fight.done;
```
Add import: `import { FightScene } from './scenes/FightScene';`

- [ ] **Step 5: Verify the fight** — dev server, `?type=egg-summon`. After pick, the boss arena loads: hero (with WarriorBlade) + Glacidrake on the left, Skeleton King on the right. Hero and dragon attack, boss rages at the hero, comeback, boss dies on the finisher, "VICTORY!" shows, then advances to the placeholder end card. Confirm the dragon plays its `Basic_Attack`/`Idle` and is never hit. Tune `fightConfig.ts` damage until the boss dies exactly on the final hit.

- [ ] **Step 6: Smoke test + commit**

```bash
npx playwright test tests/egg-summon.spec.ts --project=chromium
git add src/playables/egg-summon src/playables/board-fight/fight/FightEngine.ts
git commit -m "feat(egg-summon): boss FightScene with hero + Glacidrake pet vs Skeleton King"
```

---

## Task 6: Insert the board dice-roll beat (single roll → hero hops to Boss Tile)

**Files:**
- Create: `src/playables/egg-summon/scenes/BoardRollScene.ts`
- Modify: `src/playables/egg-summon/EggSummonDirector.ts`

This is the brief authentic board glimpse (script secs 13–15). To keep Phase 1 self-contained, it's a **minimal scripted strip**: the stage-1 battle background dimmed, a short row of tiles with a Boss Tile at the end, a 2D dice roll via the standalone `RollButton`, and the hero token (a Sprite or the hero Spine doing `Idle`) hopping tile-to-tile to the Boss Tile. Then `done` resolves into the fight.

- [ ] **Step 1: Create BoardRollScene**

`src/playables/egg-summon/scenes/BoardRollScene.ts`:
```typescript
import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { punch } from '@shared/easing';

const TILES = 4;          // hero hops 4 tiles to the Boss Tile
const HOP_MS = 180;

export class BoardRollScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private ready = false;
  private bg!: Graphics;
  private tiles: Graphics[] = [];
  private hero!: Graphics;
  private banner!: Text;
  private started = false;

  constructor(private ticker: Ticker, private width: number, private height: number) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    this.bg = new Graphics();
    this.container.addChild(this.bg);
    for (let i = 0; i < TILES + 1; i++) {
      const t = new Graphics();
      this.container.addChild(t);
      this.tiles.push(t);
    }
    this.hero = new Graphics();
    this.container.addChild(this.hero);
    this.banner = new Text({ text: '', style: { fontFamily: 'Arial', fontWeight: '900', fontSize: 48, fill: 0xffd24a, stroke: { color: 0x000000, width: 6 } } });
    this.banner.anchor.set(0.5);
    this.container.addChild(this.banner);
    this.ready = true;
    this.layout(this.width, this.height);
    void this.runRoll();
  }

  private tileX(i: number): number {
    const margin = this.width * 0.12;
    const span = this.width - margin * 2;
    return margin + (span / TILES) * i;
  }

  private async runRoll(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Simple auto dice "roll" feedback: shake the start tile, show the rolled number.
    this.banner.text = 'ROLL!';
    await tween(this.ticker, 500, (t) => { this.hero.x = this.tileX(0) + punch(8, 5, t); });
    this.hero.x = this.tileX(0);
    // Hop hero to the Boss Tile, one tile at a time.
    for (let i = 1; i <= TILES; i++) {
      const fromX = this.tileX(i - 1), toX = this.tileX(i);
      await tween(this.ticker, HOP_MS, (t) => {
        this.hero.x = fromX + (toX - fromX) * t;
        this.hero.y = this.height * 0.55 - Math.sin(t * Math.PI) * 40;
      });
      this.hero.y = this.height * 0.55;
    }
    this.banner.text = 'BOSS!';
    await tween(this.ticker, 600, () => {});
    this.resolveDone();
  }

  async exit(): Promise<void> { this.container.removeChildren(); }
  update(_deltaMS: number): void {}
  pause(): void {} resume(): void {}

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    if (!this.ready) return;
    this.bg.clear().rect(0, 0, width, height).fill(0x0e2a1a);
    const y = height * 0.55;
    for (let i = 0; i < this.tiles.length; i++) {
      const isBoss = i === TILES;
      this.tiles[i].clear().roundRect(-34, -34, 68, 68, 12).fill(isBoss ? 0x8a1f1f : 0x2f6f4f).stroke({ color: 0xffffff, width: 3 });
      this.tiles[i].position.set(this.tileX(i), y);
    }
    this.hero.clear().circle(0, 0, 20).fill(0x4d9bff).stroke({ color: 0xffffff, width: 3 });
    if (!this.started) this.hero.position.set(this.tileX(0), y);
    this.banner.position.set(width / 2, height * 0.3);
    this.container.hitArea = { contains: () => true };
  }
}
```

> This is intentionally a lightweight stand-in for Phase 1 (it conveys "dice → hop → boss" in ~2 s). Phase 3 can upgrade it to the real `RollButton` 2D dice + hero Spine token if play-test data shows the board glimpse needs more fidelity. Keeping it procedural avoids pulling the full board machinery and its assets into the slice.

- [ ] **Step 2: Wire BoardRollScene between pick and fight**

In `EggSummonDirector.ts` `runFlow()`, between `await pick.done;` and the fight:
```typescript
    const board = new BoardRollScene(this.ticker, this.width, this.height);
    await this.sceneManager.push(board, 'replace');
    await board.done;
```
Add import: `import { BoardRollScene } from './scenes/BoardRollScene';`

- [ ] **Step 3: Verify** — full flow now runs egg → pick → board roll (hops to BOSS! tile) → fight → placeholder end card.

- [ ] **Step 4: Smoke test + commit**

```bash
npx playwright test tests/egg-summon.spec.ts --project=chromium
git add src/playables/egg-summon
git commit -m "feat(egg-summon): board dice-roll beat (hop to Boss Tile) before the fight"
```

---

## Task 7: Real end card + CTA + size check + production build

**Files:**
- Modify: `src/playables/egg-summon/EggSummonDirector.ts` (real end card + CTA on pick)
- Modify: `src/playables/egg-summon/scenes/PickFighterScene.ts` (fire CTA on pick)

- [ ] **Step 1: Add a CTA hook fired when the fighter is picked**

The repo's CTA pattern fires `safeInstall()` at a gameplay checkpoint while play continues underneath. Add a callback to `PickFighterScene` and call it on pick. In `PickFighterScene.ts`:
- Add a constructor param `private onCta?: () => void`.
- In `pick(i)`, after `this.busy = true;`, call `this.onCta?.();`.

- [ ] **Step 2: Build the real end card in the director**

In `EggSummonDirector.ts`, import the end card pieces and replace `showEndCard()` with one that constructs the real card. Reuse `end_card`'s scene. Read `src/playables/end_card/EndCardScene.ts` for its exact constructor/props, then:
```typescript
import { safeInstall } from '@shared/mraidInstall';
// ... construct EndCardScene with splash + logo assets (see end_card/index.ts EndCardScript),
// push it via this.sceneManager, and route its button to safeInstall().
```
Pass the CTA into the pick scene:
```typescript
    const pick = new PickFighterScene(this.script, this.ticker, this.width, this.height, () => safeInstall());
```
The end card's splash/logo assets already exist for the `end_card` type — reuse those imports (`splash screen 2.webp` / logo) so no new art is needed.

- [ ] **Step 3: Verify the full 22 s flow + CTA** — dev server, `?type=egg-summon`. Confirm: tapping the mythic fighter both flies it to the hero *and* opens the store (CTA), play continues; after victory the real end card shows with an INSTALL button that calls `safeInstall()`.

- [ ] **Step 4: Production build + size check**

Run: `npm run build:variant -- --type egg-summon demo build`
Then inspect the output HTML size (the build prints it; or `ls -la dist/**/egg-summon*` / the configured output). Expected: a single HTML under the **5 MB AppLovin cap**.
If over 5 MB: shrink the Glacidrake atlas with `node scripts/resize-spine-atlas.js assets/egg-summon/spine/Glacidrake.atlas 0.6` (re-run the webp step), and/or lower the hero/boss to stripped JSON. Re-build and re-check.

- [ ] **Step 5: Final smoke test + commit**

```bash
npx playwright test tests/egg-summon.spec.ts --project=chromium
git add src/playables/egg-summon
git commit -m "feat(egg-summon): real end card + pick-fighter CTA; production build under 5MB"
```

- [ ] **Step 6: Record a lesson** (per repo convention in `lessons.md`)

Append a short entry to `lessons.md` capturing the two non-obvious facts discovered: (1) pet Spines export only `Idle`/`Move`/`Basic_Attack` (no hit/death) → boss must target the hero only; (2) a new playable type must define its own hero bundle from the committed `Main_Character.json`, not board-fight's gitignored `Main_Character.build.json`. Commit:
```bash
git add lessons.md
git commit -m "docs(lessons): pet Spine anim set + hero bundle decoupling for new types"
```

---

## Out of scope for Phase 1 (becomes Phase 2 / Phase 3 plans)

- **Phase 2:** `egg-summon/scripts/codegen.js` + the `.variant.js` schema + `catalog/pets/` registry; reproduce the Phase-1 playable purely from config.
- **Phase 3:** the variant matrix (multiple pet lineups × straight/frustration arcs × heroes), `build:all --type egg-summon`, fire-breath/skill VFX for the pet, and (if play-tested as worth it) upgrading `BoardRollScene` to real `RollButton` dice + hero Spine token.

---

## Self-review notes

- **Spec coverage:** egg gacha + rarity escalation (T3), pick fighter (T4), board roll (T6), pet-assisted boss fight (T5), end card + CTA (T7), real assets + size budget (T2/T7), new type architecture (T1). Frustration arc + matrix + codegen are explicitly deferred to Phase 2/3 per the spec's phasing.
- **Risk closure:** egg art → procedural (T3, no external art needed); pet anim set → boss-targets-hero rule + `Basic_Attack` fallback (T5); hero build-artifact coupling → own hero bundle from committed json (T2); board reuse weight → minimal procedural strip (T6).
- **Type consistency:** `EggSummonScript`/`EggReveal`/`Rarity` defined in `script.ts` and used everywhere; `RARITY_TINT`/`RARITY_LADDER`/`REVEAL_LABEL`/`EGG_BASE_TINT` defined in `rarity.ts`; `HERO_BASE_BUNDLE`/`GLACIDRAKE_BUNDLE`/`loadRevealTexture` in `catalog.ts`; `buildBossFight()` in `fightConfig.ts`; `FightSceneConfig`/`ActorConfig`/`FightStep`/`FightEngine`/`PlayerState` reused from board-fight with verified signatures.
- **Verification model:** Playwright boot smoke + dev-server visual checks (no unit harness exists), honestly reflected in every task.
