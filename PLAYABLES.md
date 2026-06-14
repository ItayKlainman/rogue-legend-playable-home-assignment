# PLAYABLES.md — Playable Ad Development Reference

## Overview

`pocketroll-playables/` produces self-contained HTML5 playable ads. The repo supports **multiple playable types** — each type is a self-contained mini-project under `src/playables/` that shares common infrastructure from `src/shared/`.

Output: **single HTML file**, all assets base64-inlined, **≤ 5 MB**, MRAID 2.0.

### Playable Types

| Type | Description | Location |
|------|-------------|----------|
| `board-fight` | RPG board game with dice rolling, fights, level-ups | `src/playables/board-fight/` |
| `clash-royal` | Coin/skill auto-battler with a finisher; `win` + `lose` variants | `src/playables/clash-royal/` |
| `dice-blackjack` | Dice + blackjack combo game | `src/playables/dice-blackjack/` |
| `egg-summon` | Summon egg → escalating reveal → board + auto-fight | `src/playables/egg-summon/` |
| `egg-crack` | Tap-to-crack egg with rarity reveal | `src/playables/egg-crack/` |
| `egg-escalate` | Two-fight escalation + boss-landing CTA | `src/playables/egg-escalate/` |
| `sidescroller` | Survivor-style: joystick move, auto-fire, enemy waves, XP/level-up skill picks | `src/playables/sidescroller/` |
| `end_card` | Splash screen with Play Now CTA | `src/playables/end_card/` |
| `_template` | Starter template for new types | `src/playables/_template/` |

## Architecture

The repo has three zones:

- **`src/shared/`** — Generic infrastructure: Scene interface, SceneManager, SpineCharacter, SpriteEffect, analytics, MRAID, easing utils, UI overlays. Any playable type can import these via `@shared/`.
- **`src/playables/<type>/`** — Each playable type is self-contained with its own director, scenes, and state. Types implement the `PlayableType` interface from `@shared/PlayableType`.
- **`src/index.ts`** — Thin router that loads the right type based on the `PLAYABLE_TYPE` build define.

### PlayableType Interface

Every playable type exports a default implementing this interface:

```ts
interface PlayableType<TScript = unknown> {
  readonly name: string;
  getScript(): Promise<TScript>;
  create(width: number, height: number, script: TScript): PlayableLifecycle;
}

interface PlayableLifecycle {
  resize(width: number, height: number): void;
  pause(): void;
  resume(): void;
  showEndCard(): void;
}
```

### Creating a New Playable Type

1. Copy `src/playables/_template/` to `src/playables/my-type/`
2. Customize the files (rename classes, add scenes, import shared utilities)
3. Add an `if (PLAYABLE_TYPE === 'my-type')` block in `src/index.ts`
4. Run: `npm run dev:variant -- --type my-type demo dev`

Assets: put type-specific assets in `assets/<type-name>/`. The webpack `assets` alias resolves to the root `assets/` folder, so `import x from 'assets/my-type/foo.png'` works without config changes.

Spine is optional — if your type doesn't import `@shared/SpineCharacter`, the Spine runtime won't be bundled.

## Board-Fight Game Concept

The board-fight playable simulates an RPG board game:
1. **Board phase** — character walks the tile path by rolling a dice
2. **Combat phase** — landing on an enemy tile triggers a fight scene
3. **Progression** — character gains XP, levels up, gets new equipment

Must support many **variants** (different boards, enemies, biomes). Architecture is config-driven: each board variant lives in one self-contained file.

## Scene Architecture

Everything is scripted — a `PlayableScript` defines the exact sequence of scenes, dice rolls, fight rounds, etc.

### Core types

- **`PlayableScript`** — `{ initialState, board?, rolls?, events: PlayableEvent[], allSkills }`
- **`PlayableEvent`** — discriminated union: `fight | weaponReward | levelup`, each with typed config
- **`PlayerState`** — `{ hp, maxHp, atk, skills[], weapon, weaponConfig, boardTileIndex }` — mutable, shared across scenes
- **`Scene` interface** — `container`, `done` (Promise), `enter()`, `exit()`, `update()`, `pause()`, `resume()`, `layout()`

### Flow

1. `PlayableDirector` reads the script, creates `SceneManager` on the PixiJS stage
2. Board scene runs continuously; on tile landing, director pushes the next event as an overlay
3. `replace` mode hides previous scene; `overlay` keeps it visible underneath
4. Board position persists in `PlayerState.boardTileIndex` between board scene visits

### Board rolls

`PlayableScript.rolls: (number | null)[]` — length = number of rolls. `null` = random 2d6, number = scripted total. `RollButton.setNextRoll()` splits totals into valid die faces. Default roll patterns: board1 `[8, 9, 8, 7]`, board2 `[8, 9, 11, 10]`, board3 `[8, 6, 9, 10]`.

## Board Architecture

Each board = one config file in `src/playables/board-fight/board/`. Board config referenced from `PlayableScript.board`.

```
src/playables/board-fight/board/BoardConfig.ts   ← shared interfaces (TileCoord, BoardConfig)
src/playables/board-fight/board/board1.ts        ← Board1Asset.webp config + 40 tile coords
```

`BoardConfig` fields:
- `boardImageData` — webpack-imported base64 data URL (`.webp`)
- `boardScale` — uniform source→screen scale factor
- `focalPoint` — source-image coordinate to center on screen (responsive)
- `boardCenter` — center of the board in source coords (camera pull target)
- `tiles[]` — source-image coords, counter-clockwise, index 0 = start tile
- `cornerTiles?[]` — tile indices that get larger highlights

Board centering (responsive — works at any screen size):
```ts
boardSprite.x = width/2  - focalPoint.x * boardScale
boardSprite.y = height/2 - focalPoint.y * boardScale
```

Tile→screen conversion always uses the **live** `boardSprite.x/y` position, not a static offset.

## Reference Links
- PixiJS 8 docs: https://pixijs.com/8.x/guides/getting-started/intro
- Spine-PixiJS runtime: https://en.esotericsoftware.com/spine-pixi
- playable-sdk: https://github.com/smoudjs/playable-sdk
- playable-scripts: https://github.com/smoudjs/playable-scripts
- AppLovin test tool: https://p.applov.in/playablePreview?create=1

## Tech Stack

| Layer | Package |
|---|---|
| Renderer | `pixi.js` v8 (WebGL/WebGPU) |
| Spine animation | `@esotericsoftware/spine-pixi-v8@~4.2` |
| Ad SDK | `@smoud/playable-sdk` |
| Build tool | `@smoud/playable-scripts` (devDep, Webpack-based) |
| Language | TypeScript |

## Project Structure

```
pocketroll-playables/
  src/
    index.html            # shell — NO <meta viewport>, injected automatically
    index.ts              # entry: router that loads the active playable type
    index.css
    declarations.d.ts     # module declarations + PLAYABLE_TYPE global

    shared/               # generic infrastructure (import via @shared/*)
      PlayableType.ts     # PlayableType + PlayableLifecycle interfaces
      Scene.ts            # Scene interface all scenes implement
      SceneManager.ts     # push/pop scene stack (replace/overlay modes)
      SpineCharacter.ts   # Spine loading, animations, weapon attachment, physics
      SpriteEffect.ts     # reusable grid spritesheet animation
      alAnalytics.ts      # AppLovin event tracking
      mraidInstall.ts     # MRAID CTA wrapper
      utils.ts            # easing functions
      ui/
        LogoOverlay.ts    # CTA button overlay
        PromoOverlay.ts   # promo overlay panel

    dev/                  # shared dev-only tooling
      TypePicker.ts       # dev dropdown to switch between playable types (?type= URL param)

    playables/
      board-fight/        # RPG board+fight playable type
        index.ts          # PlayableType adapter (wraps PlayableDirector)
        PlayableDirector.ts
        PlayerState.ts
        scenes/           # BoardScene, FightScene, LevelUpScene, WeaponRewardScene, etc.
        fight/            # FightEngine, FightStep, FightActor, skill VFX
        board/            # Board, BoardConfig, board1-7
        catalog/          # heroes, enemies, weapons, skills, battleBgs
        variants/         # .variant.js configs + .generated.ts output
        scripts/
          codegen.js      # variant codegen: .variant.js → .generated.ts
        dev/
          VariantPicker.ts # dev dropdown to switch board-fight variants
        ...               # HpBar, RollButton, CloudLayer, sfx, skills, etc.

      end_card/           # splash screen + Play Now CTA
        index.ts
        EndCardDirector.ts
        EndCardScene.ts

      _template/          # starter template — copy to create a new type
        index.ts
        MyDirector.ts
        MyScene.ts

  scripts/
    variant-build.js      # build wrapper: --type flag, codegen, skin strip, dev server
    build-all.js          # parallel multi-variant builder (--type flag)
    build-parallel-worker.js # webpack worker (type-aware)
    variant-watcher.js    # file watcher: re-runs codegen on .variant.js changes
    strip-spine-skins.js  # remove unused Spine skins (board-fight only)
    strip-spine-enemies.js # remove unused enemy anims (board-fight only)
    analyze-build.js      # bundle size analysis
  assets/                 # shared assets (Spine, backgrounds, UI, audio, VFX)
  refs/                   # Unity game screenshots
  build.json              # app/version/store URL config + PLAYABLE_TYPE default
  package.json
  tsconfig.json           # @shared/* path alias
```

## Debug Scene Selector

Add `?scene=<name>` to the dev server URL to jump directly to any scene:

```
http://localhost:3000?scene=board        # board with 99 rolls
http://localhost:3000?scene=fight        # fight overlay (30s duration)
http://localhost:3000?scene=weaponReward  # weapon reward overlay
http://localhost:3000?scene=levelup      # level-up skill selection
```

No param = normal demo flow. Implementation: `src/playables/board-fight/variants/debug.ts` reads the URL param.

## Codegen / Variants

Playable scripts use a **two-file pattern**: a human-editable `.variant.js` config with string IDs, and a generated `.generated.ts` with resolved imports.

```bash
npm run codegen -- demo                # reads demo.variant.js → writes demo.generated.ts
npm run codegen -- --all               # codegen all variants, active = demo
npm run codegen -- --all rogueVictory  # codegen all, active = rogueVictory
```

**Variant config** (`demo.variant.js`): plain JS module exporting `initialState`, `board`, `rolls`, `allSkills` (string IDs), `fights` (keyed by name, enemies use string IDs), and `events` (reference fights/weapons/skills by string ID). Levelup events accept both flat (`skills: ['a','b','c']` → single round) and nested (`skills: [['a','b','c'], ['d','e','f']]` → multi-round) formats. Ending events use different images: `nextChapter` uses `end_banner.webp`, `gameEnd` uses `splash screen 2.webp`.

**Generated output** (`demo.generated.ts`): `@generated` header, resolved catalog imports, typed `FightSceneConfig` constants, and exported `PlayableScript`. Do not hand-edit.

**Active variant**: codegen also writes `_active.generated.ts` — a one-line re-export of the chosen variant. `index.ts` imports from this file for the production path.

**Catalog** (`src/playables/board-fight/catalog/`): each entity has its own module that bundles asset imports + config:
- `heroes.ts` — `heroBundle: SpineAssets`
- `enemies/<name>.ts` — `<name>Bundle: SpineAssets`
- `weapons/<name>.ts` — `WEAPON_NAME: WeaponConfig` (+ optional UI sprite export)
- `skills/<name>.ts` — `SKILL_NAME: SkillConfig` (imports icon + VFX handler)

**Adding a new entity**: create the catalog module, add an entry to `REGISTRY` in `src/playables/board-fight/scripts/codegen.js`, re-run codegen.

### CTA Triggers

Optional `ctaTriggers` field on the variant config fires `safeInstall()` (open the app store) at specific gameplay checkpoints. The player's tap does its normal thing in addition — gameplay continues underneath the store overlay, so closing the store returns the player to the same in-progress run.

```js
ctaTriggers: [
  { on: 'levelUpChoice', n: 3 }, // 3rd skill the player picks (across all events/rounds)
]
```

Each trigger fires at most once per run. `n` is counter-based: it counts occurrences of `on` across the whole playable, regardless of how level-ups are split into events or rounds. Multiple triggers are allowed — `[{ n: 1 }, { n: 3 }]` would fire on both the 1st and 3rd pick.

**Currently supported `on` values:** `'levelUpChoice'`.

**Adding a new trigger kind:** extend the `CtaTrigger` union in `src/playables/board-fight/ctaTriggers.ts`, then call `this.notifyCheckpoint('<kind>')` from the relevant scene (or director) at the moment that should count. The director's dispatcher (`PlayableDirector.notifyCheckpoint`) handles the rest.

## Dev Mode Switching

In dev mode, two levels of switching are available:

### Playable Type Switching
- **URL param**: `localhost:3000?type=end_card` — loads that playable type
- **Dropdown**: TypePicker (top-left corner) auto-discovers all types from `src/playables/*/index.ts`
- Switching types clears variant and scene params

### Variant Switching (within a type)
- **URL param**: `localhost:3000?variant=rogueVictory` — loads that board-fight variant
- **Dropdown**: VariantPicker (bottom-left corner) auto-discovers all `.generated.ts` files for the active type
- **Hot reload**: editing a `.variant.js` file triggers automatic codegen → webpack HMR

Both pickers and dynamic imports are gated behind `__DEV__` — zero production impact.

**File watcher** (`scripts/variant-watcher.js`): runs alongside the dev server (board-fight only), watches `*.variant.js` for changes, and re-runs codegen automatically.

## LevelUpScene

Full-screen overlay with hero Spine + 3 interactive skill cards. Supports multi-round picking.

**UI structure:** dim overlay → hero (left, Spine-animated with weapon) → "POWER UP!" banner with arrow notches → "Select a Skill to learn!" subtitle → progress circles (multi-round only) → 3 skill cards stacked vertically.

**Skill cards:** accent bar (rarity-colored) → icon (or placeholder) → rarity badge overlapping icon top → name + word-wrapped description → info "?" circle. Cards are clickable — selection adds skill ID to `PlayerState.skills[]`.

**Multi-round picking:** Config accepts an array of rounds: `skills: [[A,B,C], [D,E,F], ...]`. After picking a skill, cards scale down (150ms easeInQuad), progress circles update (orange = completed/current, muted purple = pending), then new cards stagger in. Single-round configs (`skills: [[A,B,C]]`) hide the circles — fully backward compatible.

**Rarity colors** defined in `skills.ts` → `RARITY_COLORS` map: `common` (grey), `legendary` (orange), `mythic` (red). Each has badge, accent, cardBg, cardBorder.

**Responsive layout:** scales all elements relative to `Math.min(width, height)`. Cards auto-scale down if total height exceeds available space.

**Config:** `LevelUpSceneConfig = { skills: [SkillConfig, SkillConfig, SkillConfig][] }` — array of rounds, each with 3 skills.

## Skill System

10 skills in 3 family builds + 1 misc. Higher-tier skills are passive upgrades — the T1 VFX handler checks `playerState.skills` for family members and auto-chains.

| Family | T1 (common) | T2 (legendary) | T3 (mythic) |
|---|---|---|---|
| Lightning | `chainLightning` — 2 bolts on all enemies | `thunderstorm` — adds electricity splash | `thunderGod` — replaces bolts with mega bolt |
| Fire | `fireballBarrage` — 2 fireballs on random enemies | `flameStrike` — adds flame burst on hit | `meteorStorm` — adds meteor after flame |
| Shuriken | `shurikenFlurry` — 3 shurikens (6 with T3) | `fumaShuriken` — adds fuma at all enemies | `deadlyStars` — doubles shuriken count |
| _(none)_ | | `berserk` — 1.4x scale during melee | |

`SkillConfig` has `family?: string` and `tier?: number` fields. Level-up cards show tier dots (3 circles, filled = tier).

**Key files** (all under `src/playables/board-fight/`):
- `skills.ts` — `SkillConfig` type (with `family`/`tier`), `RARITY_COLORS`
- `fight/skillVfx/registry.ts` — `registerSkillVfx()`, `SkillVfxContext`
- `fight/skillVfx/{chainLightning,fireballBarrage,shurikenFlurry}.ts` — VFX handlers (only T1 skills register handlers)
- `fight/skillVfx/sharedAssets.ts` — shared spritesheet imports
- `fight/FightEngine.ts` — `onBeforeMelee`/`onAfterMelee` hooks (berserk), `tween()` is public

**Skill bar:** Left-anchored grid (5 columns) below battle. Icons pulse via `ctx.pulse()`.

**Multi-hit pattern:** Staggered launches with `Promise.all`, dead-target check per projectile.

**Berserk:** Wired in `FightScene` via `onBeforeMelee`/`onAfterMelee` — scales player spine 1.4x over 200ms.

**Adding a new skill:** create `catalog/skills/<id>.ts`, optionally create VFX handler in `skillVfx/`, add to `REGISTRY.skills` in `src/playables/board-fight/scripts/codegen.js`, re-run codegen.

## Build Commands (run from `pocketroll-playables/`)

```bash
npm install

# Board-fight (default type)
npm run dev                                                    # dev server + watcher
npm run dev:variant -- rogueVictory dev                       # dev with specific variant
npm run build                                                  # production build (demo)
npm run build:variant -- rogueVictory build applovin           # production build specific variant
npm run build:all                                              # build all board-fight variants

# Other playable types
npm run dev:variant -- --type end_card demo dev                # dev server for end_card
npm run build:variant -- --type end_card demo build            # production build end_card
npm run build:all -- --type end_card                           # build all end_card variants
```

**Dev mode**: runs codegen (if the type has one), starts file watcher (board-fight only) + dev server. For board-fight, copies full `Main_Character.json` (all skins).

**Production build**: runs codegen + skin stripping (board-fight) or just webpack (other types). Board-fight uses `Main_Character.build.json` with only needed skins.

**`--type` flag**: defaults to `board-fight` when omitted. All existing commands work unchanged.

## Output Folder Structure

Place each built HTML into `dist/<Provider>/<Platform>/`:

```
dist/
  AppLovin/
    iOS/
    Android/
  Google/
    iOS/
    Android/
```

Each provider/platform combination may have different size limits or SDK requirements. AppLovin hard limit: **5 MB**. See `GameDesign.md` for the full build checklist.

## build.json

```json
{
  "app": "pocketroll",
  "name": "ConceptName",
  "version": "v1",
  "language": "en",
  "filename": "{app}_{name}_{version}_{date}_{language}_{network}",
  "googlePlayUrl": "https://play.google.com/store/apps/details?id=...",
  "appStoreUrl": "https://apps.apple.com/app/id...",
  "defines": { "PLAYABLE_TYPE": "\"board-fight\"" }
}
```

## Auto-Injected Global Defines

`__DEV__`, `PLAYABLE_TYPE`, `AD_NETWORK`, `AD_PROTOCOL`, `GOOGLE_PLAY_URL`, `APP_STORE_URL`, `BUILD_HASH`, `APP`, `NAME`, `VERSION`, `LANGUAGE`, `ORIENTATION`

```ts
if (__DEV__) { /* dev-only */ }
if (PLAYABLE_TYPE === 'board-fight') { /* type-specific */ }
if (AD_NETWORK === 'applovin') { /* network-specific */ }
```

---

## SDK Lifecycle (`@smoud/playable-sdk`)

```ts
import { sdk } from '@smoud/playable-sdk';

// 1. Init first — callback receives container dimensions
sdk.init((width, height) => { new PlayableDirector(width, height, script); });

// 2. Bind events
sdk.on('resize',   (w, h)  => game.resize(w, h));
sdk.on('pause',    ()      => game.pause());
sdk.on('resume',   ()      => game.resume());
sdk.on('volume',   (level) => audio.setVolume(level));
sdk.on('finish',   ()      => game.showEndScreen());
sdk.on('retry',    ()      => game.reset());
sdk.on('interaction', (count) => { /* track engagement */ });

// 3. Call after all assets loaded
sdk.start();

// 4. CTA — ALWAYS sdk.install(), never window.open()
ctaButton.onclick = () => sdk.install();

// 5. Optional: mark gameplay done
sdk.finish();
```

### SDK Events

| Event | Params | Use |
|---|---|---|
| `init` | — | DOM ready |
| `ready` | — | Container ready (post-init) |
| `start` | — | Gameplay started |
| `resize` | `w, h` | Relayout |
| `pause` / `resume` | — | Pause/resume gameplay |
| `volume` | `0–1` | Audio |
| `finish` | — | Show end screen |
| `retry` | — | Reset game |
| `interaction` | `count` | Analytics |
| `install` | — | Track conversion |

### SDK Properties

`sdk.maxWidth`, `sdk.maxHeight`, `sdk.isLandscape`, `sdk.isPaused`, `sdk.isFinished`, `sdk.volume`, `sdk.interactions`

---

## PixiJS 8

WebGL/WebGPU 2D engine. Key features: scene graph (Container hierarchy), asset loading via `PIXI.Assets`, interactive events, text, filters/masks, blend modes.

```ts
const app = new PIXI.Application();
await app.init({ width: 800, height: 600 });
document.body.appendChild(app.canvas);

// Asset loading
PIXI.Assets.add({ alias: 'hero', src: 'assets/hero.png' });
await PIXI.Assets.load('hero');
const sprite = PIXI.Sprite.from('hero');
app.stage.addChild(sprite);
```

---

## Spine Integration (`spine-pixi-v8`)

**Critical rule: runtime `major.minor` MUST match Spine Editor export version.**
Current: `@esotericsoftware/spine-pixi-v8@~4.2` → requires Spine Editor 4.2.x exports.

### Load & Instantiate

```ts
import { Spine } from '@esotericsoftware/spine-pixi-v8';

// Load
PIXI.Assets.add({ alias: 'heroData',  src: 'assets/hero.skel' }); // prefer .skel over .json (smaller, faster)
PIXI.Assets.add({ alias: 'heroAtlas', src: 'assets/hero.atlas' });
await PIXI.Assets.load(['heroData', 'heroAtlas']);
// atlas .png pages load transparently

// Instantiate — v4.2 uses Spine.from()
const hero = Spine.from({ skeleton: 'heroData', atlas: 'heroAtlas' });
app.stage.addChild(hero);
// v4.3+ uses: new Spine({ skeleton: 'heroData', atlas: 'heroAtlas' })
```

### Webpack Bundled Assets (No HTTP — Required for playable-scripts)

`playable-scripts` webpack only serves `dist/`, so Spine assets **cannot** be loaded via URL at runtime.
Import them directly in TypeScript — webpack bundles them into the JS:

```ts
// src/declarations.d.ts — REQUIRED for TypeScript
declare module '*.atlas' { const content: string; export default content; }
declare module '*.json'  { const content: string; export default content; }
declare module '*.png'   { const content: string; export default content; } // base64 data URL
```

```ts
import { Spine, SpineTexture } from '@esotericsoftware/spine-pixi-v8';
import { TextureAtlas } from '@esotericsoftware/spine-core';

// webpack rules: .atlas/.json → asset/source (raw string); .png → asset/inline (base64)
import heroAtlasRaw from 'assets/Main_Character.atlas';
import heroJsonRaw  from 'assets/Main_Character.json';
import heroPngData  from 'assets/Main_Character.png';

// 1. Load PNG from base64 data URL (no HTTP)
const pngTexture = await Assets.load(heroPngData);

// 2. Build TextureAtlas manually and attach texture
const atlas = new TextureAtlas(heroAtlasRaw);
for (const page of atlas.pages) {
  page.setTexture(SpineTexture.from(pngTexture.source));
}

// 3. Pre-populate Assets cache — Spine.from() reads from here
Assets.cache.set('heroAtlas', atlas);
Assets.cache.set('heroData',  JSON.parse(heroJsonRaw)); // must be parsed JS object

// 4. Instantiate as normal
const hero = Spine.from({ skeleton: 'heroData', atlas: 'heroAtlas', ticker });
```

### Constructor Options (`SpineFromOptions`)

| Option | Default | Description |
|---|---|---|
| `skeleton` | required | Asset alias for `.skel` / `.json` |
| `atlas` | required | Asset alias for `.atlas` |
| `scale` | `1` | Skeleton scale |
| `darkTint` | auto | Force dark-tint renderer |
| `autoUpdate` | `true` | Auto-advance animations via ticker |
| `boundsProvider` | dynamic | `SetupPoseBoundsProvider`, `SkinsAndAnimationBoundsProvider`, `AABBRectangleBoundsProvider` |
| `ticker` | `Ticker.shared` | Custom ticker for pause control |

### Animations

```ts
// setAnimation(track, name, loop)
hero.state.setAnimation(0, 'idle', true);

// addAnimation(track, name, loop, delay)
hero.state.addAnimation(0, 'attack', false, 0); // queued immediately after

// Mix durations
hero.state.data.setDefaultMix = 0.2;
hero.state.data.setMix('idle', 'attack', 0.1);

// Empty animations (mix to/from setup pose)
hero.state.setEmptyAnimation(0, 0.5);
hero.state.addEmptyAnimation(0, 0.5, 2);

// Clear
hero.state.clearTrack(0);
hero.state.clearTracks();

// Reset to setup pose
hero.skeleton.setupPose();
hero.skeleton.setupPoseSlots();
```

### TrackEntry (returned by set/addAnimation)

```ts
const entry = hero.state.setAnimation(0, 'walk', true);
entry.mixDuration = 0.4;
entry.reverse = true;
// WARNING: don't hold TrackEntry refs beyond immediate use — they are reused internally
```

### Events

```ts
hero.state.addListener({
  start:     (entry) => {},
  complete:  (entry) => {}, // loop completed
  end:       (entry) => {},
  dispose:   (entry) => {},
  interrupt: (entry) => {},
  event:     (entry, event) => {} // custom Spine event
});

// Or on a specific TrackEntry:
entry.listener = { event: (entry, ev) => {} };
```

### Pause via Custom Ticker

```ts
const ticker = new PIXI.Ticker();
const hero = Spine.from({ skeleton: 'heroData', atlas: 'heroAtlas', ticker });
ticker.stop();   // pause
ticker.start();  // resume
ticker.speed = 0.5; // slow motion
```

### Skins (mix-and-match)

```ts
import { Skin } from '@esotericsoftware/spine-pixi-v8';
const skin = new Skin('custom');
skin.addSkin(hero.skeleton.data.findSkin('body/base'));
skin.addSkin(hero.skeleton.data.findSkin('hair/brown'));
hero.skeleton.setSkin(skin);
hero.skeleton.setupPoseSlots(); // clear leftover attachments
```

### Slot Objects (attach Pixi containers to bones/slots)

```ts
const container = new PIXI.Container();
hero.addSlotObject('weapon-slot', container);
hero.removeSlotObject('weapon-slot');
const obj = hero.getSlotObject('weapon-slot');
hero.removeSlotObjects(); // remove all

// options: { followAttachmentTimeline: true } — sync visibility with attachment
```

**Important:** Wrap added objects in a Container — Spine auto-modifies transform/mask.

### Weapon Attachment Pattern (SpineCharacter.ts)

Weapons use `addSlotObject` to follow the Weapon bone automatically — no ticker code needed.

```ts
interface WeaponConfig {
  spriteData: string;                    // webpack import (base64 data URL)
  position: { x: number; y: number };    // Unity local position (auto-converted)
  rotation: number;                      // degrees (from Unity inspector)
  scale: number;                         // uniform scale
}

// Unity skeleton import scale = 0.01 → multiply position by 100
const UNITY_TO_SPINE = 100;

async equipWeapon(config: WeaponConfig) {
  if (this.weaponContainer) {
    this.hero.removeSlotObject(this.weaponSlot);
    this.weaponContainer.destroy({ children: true });
  }
  const sprite = new Sprite(await Assets.load(config.spriteData));
  sprite.anchor.set(0.5, 0.5);
  // Y-flip: addSlotObject uses -bone.b/-bone.d → negate Y position and rotation
  sprite.position.set(config.position.x * UNITY_TO_SPINE, -config.position.y * UNITY_TO_SPINE);
  sprite.rotation = -config.rotation * (Math.PI / 180);
  sprite.scale.set(config.scale);
  this.weaponContainer = new Container();
  this.weaponContainer.addChild(sprite);
  this.hero.addSlotObject('Sword_Hilt2', this.weaponContainer, { followAttachmentTimeline: false });
}
```

**Key slots** on Weapon bone (by draw order): `Sword_Hilt2` (16, behind body), `Wood2` (20), `Sword_Blade2` (22, in front).
Use early slots to render behind character, later slots to render in front.

### Physics (hair, cape, ponytail react to movement)

spine-pixi-v8 calls `skeleton.updateWorldTransform(Physics.update)` automatically. Physics constraints react when told about external position changes:

```ts
// Convert screen-space delta to skeleton-local space, then notify physics
const dx = newX - spine.x;
const dy = newY - spine.y;
skeleton.physicsTranslate(dx / spine.scale.x, dy / spine.scale.y);
```

This mirrors Unity's `ApplyTransformMovementToPhysics()` → `InverseTransformVector()` → `PhysicsTranslate()`.

**Note:** `@pixi/particle-emitter` does NOT support PixiJS v8. Use procedural effects or SpriteEffect instead.

### Coordinate Conversion

```ts
hero.pixiWorldCoordinatesToBone(point, bone); // pixi → skeleton
Spine.skeletonToPixiWorldCoordinates(point);   // skeleton → pixi
```

### Canvas Rendering Limitations

Canvas mode (not WebGL/WebGPU) **does NOT support**: slot objects, tint-black, blend modes.

### Asset Export Notes

- Prefer `.skel` (binary) over `.json` — smaller and faster
- MIME types: `.skel` → `application/octet-stream`, `.atlas` → `application/octet-stream`
- Multiple skeletons can share the same `SkeletonData` and atlas (saves memory)

---

## AppLovin Delivery Requirements

- **Format**: Single HTML, all assets base64/base122 inlined — no external requests
- **Max size**: 5 MB (strictly enforced — upload will be rejected if exceeded)
- **Protocol**: MRAID 2.0 (auto-applied by `playable-scripts build applovin`)
- **CTA**: `sdk.install()` only — maps to `mraid.open()`
- **Audio**: muted until first user interaction
- **Orientations**: portrait AND landscape both required
- **Test**: https://p.applov.in/playablePreview?create=1

## All Supported Networks

`preview`, `applovin`, `unity`, `google`, `ironsource`, `facebook`, `moloco`, `adcolony`, `mintegral`, `vungle`, `tapjoy`, `snapchat`, `tiktok`, `appreciate`, `chartboost`, `pangle`, `mytarget`, `liftoff`, `smadex`, `adikteev`, `bigabid`, `inmobi`

MRAID auto-applied for: AppLovin, ironSource, Unity, Appreciate, Snapchat, Chartboost, MyTarget, Liftoff, Adikteev, Bigabid, inMobi, AdColony.

## Size Optimisation

**Spine skin stripping is automated.** Production builds run `strip-spine-skins.js` for the target variant only — unused skins and animations are removed from `Main_Character.build.json`. Dev uses the full JSON.

```bash
node scripts/strip-spine-skins.js demo        # strip for one variant (reads from board-fight/variants/)
node scripts/strip-spine-skins.js --all       # keep union of all variants (dev)
```

Prefer `.skel` binary over `.json` for production — smaller and faster.

## index.html Template Rules

`HtmlWebpackPlugin` auto-injects the compiled script and viewport meta. The template must be a **bare shell**:
- NO `<link rel="stylesheet">` — import CSS in TypeScript: `import './index.css'`
- NO `<script>` tags — auto-injected by HtmlWebpackPlugin
- NO `<meta name="viewport">` — auto-injected by the build tool

```html
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Pocketroll</title></head>
  <body></body>
</html>
```

## Reference Template

PixiJS playable starter: https://github.com/smoudjs/playable-template-pixi
