# Scene Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the playable into a scene-based architecture with a scripted director, enabling multiple scene types (board, fight, level-up) to be composed into variant playable ads.

**Architecture:** A `PlayableDirector` reads a `PlayableScript` (ordered array of scene steps with per-scene configs) and drives a `SceneManager` that pushes/pops scenes. All scenes implement a common `Scene` interface. Player state (HP, ATK, skills, weapon) persists across scenes. Board logic extracted from `Game.ts` into `BoardScene`.

**Tech Stack:** PixiJS 8, TypeScript, Spine, playable-scripts webpack toolchain.

---

## Context

**Current state:** `Game.ts` is a monolith that creates the PixiJS app, board, hero, roll button, and runs the movement state machine. It directly references `board1Config`.

**Target state:** `PlayableDirector` owns the PixiJS app and ticker. A `SceneManager` manages a stack of `Scene` objects. `BoardScene` contains all board-specific logic extracted from `Game.ts`. A `PlayableScript` config drives which scenes play in what order.

**No test framework** in this project. Verification is `npx tsc --noEmit` + visual check via `npm run dev`.

---

### Task 1: Create foundation types

**Files:**
- Create: `src/Scene.ts`
- Create: `src/PlayerState.ts`

**Step 1: Create `src/Scene.ts`**

```typescript
import type { Container } from 'pixi.js';

export interface Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  enter(): Promise<void>;
  exit(): Promise<void>;
  update(deltaMS: number): void;
  pause(): void;
  resume(): void;
  layout(width: number, height: number): void;
}
```

**Step 2: Create `src/PlayerState.ts`**

```typescript
export type SkillId = string;
export type WeaponId = string;

export interface PlayerState {
  hp: number;
  maxHp: number;
  atk: number;
  skills: SkillId[];
  weapon: WeaponId;
  boardTileIndex: number;
}
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors (new files, nothing imports them yet).

**Step 4: Commit**

```bash
git add src/Scene.ts src/PlayerState.ts
git commit -m "feat: add Scene interface and PlayerState type"
```

---

### Task 2: Create SceneManager

**Files:**
- Create: `src/SceneManager.ts`

**Step 1: Create `src/SceneManager.ts`**

```typescript
import type { Container } from 'pixi.js';
import type { Scene } from './Scene';

interface StackEntry {
  scene: Scene;
  mode: 'replace' | 'overlay';
}

export class SceneManager {
  private stack: StackEntry[] = [];
  private stage: Container;

  constructor(stage: Container) {
    this.stage = stage;
  }

  async push(scene: Scene, mode: 'replace' | 'overlay'): Promise<void> {
    const prev = this.top;
    if (prev) {
      prev.scene.pause();
      if (mode === 'replace') {
        prev.scene.container.visible = false;
      }
    }

    this.stack.push({ scene, mode });
    this.stage.addChild(scene.container);
    await scene.enter();
  }

  async pop(): Promise<void> {
    const entry = this.stack.pop();
    if (!entry) return;

    await entry.scene.exit();
    this.stage.removeChild(entry.scene.container);

    const prev = this.top;
    if (prev) {
      prev.scene.container.visible = true;
      prev.scene.resume();
    }
  }

  update(deltaMS: number): void {
    for (const entry of this.stack) {
      if (entry.scene.container.visible) {
        entry.scene.update(deltaMS);
      }
    }
  }

  layout(width: number, height: number): void {
    for (const entry of this.stack) {
      entry.scene.layout(width, height);
    }
  }

  private get top(): StackEntry | undefined {
    return this.stack[this.stack.length - 1];
  }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/SceneManager.ts
git commit -m "feat: add SceneManager with push/pop scene stack"
```

---

### Task 3: Move board files to `board/` subfolder

**Files:**
- Move: `src/Board.ts` → `src/board/Board.ts`
- Move: `src/boards/BoardConfig.ts` → `src/board/BoardConfig.ts`
- Move: `src/boards/board1.ts` → `src/board/board1.ts`
- Modify: `src/board/Board.ts` (update import path)
- Modify: `src/Game.ts` (update import paths)
- Delete: `src/boards/` directory

Moving files and updating imports. The `assets/` webpack alias is absolute so asset imports don't change.

**Step 1: Create `src/board/` directory and move files**

```bash
mkdir -p src/board
git mv src/Board.ts src/board/Board.ts
git mv src/boards/BoardConfig.ts src/board/BoardConfig.ts
git mv src/boards/board1.ts src/board/board1.ts
rmdir src/boards
```

**Step 2: Update import in `src/board/Board.ts`**

Change line 2:
```typescript
// OLD:
import type { BoardConfig, TileCoord } from './boards/BoardConfig';
// NEW:
import type { BoardConfig, TileCoord } from './BoardConfig';
```

**Step 3: Update imports in `src/Game.ts`**

Change line 4:
```typescript
// OLD:
import type { BoardConfig } from './boards/BoardConfig';
// NEW:
import type { BoardConfig } from './board/BoardConfig';
```

Change line 5:
```typescript
// OLD:
import { Board } from './Board';
// NEW:
import { Board } from './board/Board';
```

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move board files to board/ subfolder"
```

---

### Task 4: Add scripted roll support to RollButton

**Files:**
- Modify: `src/RollButton.ts`

Small backwards-compatible change. Add a `setNextRoll(total)` method. When set, `roll()` uses the scripted total to determine die faces instead of random. When not set (null), behavior is unchanged.

**Step 1: Add property and method to `RollButton` class**

Add after line 68 (`private dismissProgress = 0;`):
```typescript
  private nextScriptedTotal: number | null = null;
```

Add public method after `finishRoll()` (after line 145):
```typescript
  setNextRoll(total: number | null): void {
    this.nextScriptedTotal = total;
  }
```

**Step 2: Update `roll()` to use scripted total**

Replace lines 122-123:
```typescript
    this.die1Final = randomFace();
    this.die2Final = randomFace();
```

With:
```typescript
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
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors. Existing behavior unchanged (nextScriptedTotal defaults to null).

**Step 4: Commit**

```bash
git add src/RollButton.ts
git commit -m "feat: add scripted roll support to RollButton"
```

---

### Task 5: Create BoardScene, PlayableDirector, demo script, update index.ts

This is the big swap. All files are created/modified together because they depend on each other.

**Files:**
- Create: `src/scenes/BoardScene.ts`
- Create: `src/PlayableDirector.ts`
- Create: `src/scripts/demo.ts`
- Modify: `src/index.ts`
- Delete: `src/Game.ts`

**Step 1: Create `src/scenes/BoardScene.ts`**

This is the board logic extracted from `Game.ts`. The scene implements the `Scene` interface, reads rolls from config, and resolves `done` when all rolls are consumed.

```typescript
import { Container, Ticker } from 'pixi.js';
import type { Scene } from '../Scene';
import type { PlayerState } from '../PlayerState';
import type { BoardConfig } from '../board/BoardConfig';
import { Board } from '../board/Board';
import { SpineCharacter } from '../SpineCharacter';
import type { WeaponConfig } from '../SpineCharacter';
import { RollButton } from '../RollButton';

import heroAtlasRaw from 'assets/Main_Character.atlas';
import heroJsonRaw from 'assets/Main_Character.json';
import heroPngData from 'assets/Main_Character.png';
import swordData from 'assets/WarriorBlade.png';
import rollButtonData from 'assets/RollButton.png';
import rollButtonBackData from 'assets/RollButton_Back.png';
import rollButtonFrontData from 'assets/RollButton_Front.png';
import glowData from 'assets/highlight_4.png';

export interface BoardSceneConfig {
  rolls: (number | null)[];
}

const HOP_DURATION = 0.25;
const HOP_HEIGHT = 50;
const ZOOM_OUT = 0.9;

const WARRIORS_BLADE: WeaponConfig = {
  spriteData: swordData,
  position: { x: 2.16, y: 0.36 },
  rotation: -39.7,
  scale: 1.25,
};

export class BoardScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: BoardSceneConfig;
  private boardConfig: BoardConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;

  private board!: Board;
  private hero!: SpineCharacter;
  private rollButton!: RollButton;

  // Movement
  private currentTileIndex: number;
  private isMoving = false;
  private moveProgress = 0;
  private moveFrom = { x: 0, y: 0 };
  private moveTo = { x: 0, y: 0 };
  private remainingHops = 0;
  private rollIndex = 0;

  constructor(
    config: BoardSceneConfig,
    boardConfig: BoardConfig,
    state: PlayerState,
    ticker: Ticker,
    width: number,
    height: number,
  ) {
    this.container = new Container();
    this.config = config;
    this.boardConfig = boardConfig;
    this.state = state;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.currentTileIndex = state.boardTileIndex;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    this.board = await Board.create(this.boardConfig, this.width, this.height);
    this.container.addChild(this.board.sprite);

    this.hero = await SpineCharacter.create('hero',
      { atlasRaw: heroAtlasRaw, jsonRaw: heroJsonRaw, pngData: heroPngData },
      this.ticker,
      { skin: 'Base', animation: 'Idle' },
    );
    this.hero.facingLeft = true;
    this.syncHeroToTile();
    this.container.addChild(this.hero.spine);
    await this.hero.equipWeapon(WARRIORS_BLADE);

    this.rollButton = await RollButton.create(
      { button: rollButtonData, back: rollButtonBackData, front: rollButtonFrontData },
      (die1, die2) => this.onDiceRolled(die1 + die2),
    );
    this.rollButton.layout(this.width, this.height);
    this.container.addChild(this.rollButton.container);

    this.board.focusOnTile(this.currentTileIndex);
    this.board.snapCamera();
    this.board.drawDebugMarkers();

    this.prepareNextRoll();
  }

  async exit(): Promise<void> {
    // Cleanup handled by container removal
  }

  update(deltaMS: number): void {
    this.updateMovement(deltaMS);
    this.syncHeroToTile();
    this.rollButton.update(deltaMS);
    this.board.update();
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
    if (this.board) this.board.layout(width, height);
    if (this.rollButton) this.rollButton.layout(width, height);
  }

  // --- Scripted rolls ---

  private prepareNextRoll(): void {
    if (this.rollIndex < this.config.rolls.length) {
      this.rollButton.setNextRoll(this.config.rolls[this.rollIndex]);
    }
  }

  // --- Movement ---

  private async onDiceRolled(total: number): Promise<void> {
    const tiles = this.board.tiles;
    const path: number[] = [];
    let idx = this.currentTileIndex;
    for (let i = 0; i < total; i++) {
      idx = (idx - 1 + tiles.length) % tiles.length;
      path.push(idx);
    }

    await this.board.showHighlights(path, glowData);
    this.remainingHops = total - 1;
    this.startHop();
  }

  private startHop(): void {
    const tiles = this.board.tiles;
    const fromTile = tiles[this.currentTileIndex];
    this.moveFrom.x = fromTile.x;
    this.moveFrom.y = fromTile.y;

    this.currentTileIndex = (this.currentTileIndex - 1 + tiles.length) % tiles.length;
    const toTile = tiles[this.currentTileIndex];
    this.moveTo.x = toTile.x;
    this.moveTo.y = toTile.y;

    this.moveProgress = 0;
    this.isMoving = true;
    this.board.setZoom(ZOOM_OUT);
    this.hero.facingLeft = this.moveTo.x < this.moveFrom.x;
    this.hero.play('Idle');
  }

  private updateMovement(deltaMS: number): void {
    if (!this.isMoving) return;

    this.moveProgress += (deltaMS / 1000) / HOP_DURATION;
    if (this.moveProgress >= 1) {
      this.moveProgress = 1;
      this.isMoving = false;
      this.board.removeHighlight(this.currentTileIndex);

      if (this.remainingHops > 0) {
        this.remainingHops--;
        this.startHop();
      } else {
        this.hero.play('Idle');
        this.board.setZoom(1);
        this.board.clearHighlights();
        this.rollButton.finishRoll();
        this.rollIndex++;

        if (this.rollIndex < this.config.rolls.length) {
          this.prepareNextRoll();
        } else {
          this.state.boardTileIndex = this.currentTileIndex;
          this.resolveDone();
        }
      }
    }

    const eased = this.moveProgress;
    const sx = this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * eased;
    const sy = this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * eased;
    const jumpArc = -4 * HOP_HEIGHT * (eased - 0.5) * (eased - 0.5) + HOP_HEIGHT;
    const screenPos = this.board.tileToScreen({ x: sx, y: sy - jumpArc });
    const prevX = this.hero.spine.x;
    const prevY = this.hero.spine.y;
    this.hero.spine.x = screenPos.x;
    this.hero.spine.y = screenPos.y;
    const scaleX = this.hero.spine.scale.x;
    const scaleY = this.hero.spine.scale.y;
    this.hero.physicsTranslate((screenPos.x - prevX) / scaleX, (screenPos.y - prevY) / scaleY);
    this.board.focusOnTile(this.currentTileIndex);
  }

  private syncHeroToTile(): void {
    if (this.isMoving) return;
    const tile = this.board.tiles[this.currentTileIndex];
    const pos = this.board.tileToScreen(tile);
    this.hero.spine.x = pos.x;
    this.hero.spine.y = pos.y;
    const tileSize = 130 * this.board.effectiveScale;
    const s = tileSize / 700;
    this.hero.spine.scale.set(this.hero.facingLeft ? -s : s, s);
  }
}
```

**Step 2: Create `src/PlayableDirector.ts`**

```typescript
import { Application, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from './SceneManager';
import type { Scene } from './Scene';
import type { PlayerState } from './PlayerState';
import type { BoardConfig } from './board/BoardConfig';
import { BoardScene } from './scenes/BoardScene';
import type { BoardSceneConfig } from './scenes/BoardScene';

export interface FightSceneConfig {
  // future
}

export interface LevelUpSceneConfig {
  // future
}

export type SceneStep =
  | { scene: 'board';   mode: 'replace'; config: BoardSceneConfig }
  | { scene: 'fight';   mode: 'replace'; config: FightSceneConfig }
  | { scene: 'levelup'; mode: 'overlay'; config: LevelUpSceneConfig };

export interface PlayableScript {
  initialState: PlayerState;
  board?: BoardConfig;
  steps: SceneStep[];
}

export class PlayableDirector {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private state: PlayerState;
  private script: PlayableScript;
  private width: number;
  private height: number;

  constructor(width: number, height: number, script: PlayableScript) {
    this.width = width;
    this.height = height;
    this.script = script;
    this.state = { ...script.initialState, skills: [...script.initialState.skills] };
    this.ticker = new Ticker();
    this.app = new Application();
    this.init();
  }

  private async init(): Promise<void> {
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);

    this.sceneManager = new SceneManager(this.app.stage);

    this.ticker.add((t) => {
      this.sceneManager.update(t.deltaMS);
    });
    this.ticker.start();
    sdk.start();

    this.runScript();
  }

  private async runScript(): Promise<void> {
    for (const step of this.script.steps) {
      const scene = this.createScene(step);
      await this.sceneManager.push(scene, step.mode);
      await scene.done;
      await this.sceneManager.pop();
    }
  }

  private createScene(step: SceneStep): Scene {
    switch (step.scene) {
      case 'board':
        if (!this.script.board) throw new Error('Board step requires board config in script');
        return new BoardScene(
          step.config, this.script.board, this.state,
          this.ticker, this.width, this.height,
        );
      case 'fight':
        throw new Error('FightScene not implemented');
      case 'levelup':
        throw new Error('LevelUpScene not implemented');
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.sceneManager?.layout(width, height);
  }

  pause(): void { this.ticker.stop(); }
  resume(): void { this.ticker.start(); }
  showEndCard(): void { /* no-op */ }
}
```

**Step 3: Create `src/scripts/demo.ts`**

```typescript
import { board1Config } from '../board/board1';
import type { PlayableScript } from '../PlayableDirector';

export const demoScript: PlayableScript = {
  initialState: {
    hp: 100,
    maxHp: 100,
    atk: 25,
    skills: [],
    weapon: 'WarriorBlade',
    boardTileIndex: 0,
  },
  board: board1Config,
  steps: [
    { scene: 'board', mode: 'replace', config: { rolls: Array(99).fill(null) } },
  ],
};
```

**Step 4: Update `src/index.ts`**

Replace entire contents with:

```typescript
import { sdk } from '@smoud/playable-sdk';
import { PlayableDirector } from './PlayableDirector';
import { demoScript } from './scripts/demo';
import './index.css';

let director: PlayableDirector;

sdk.init((width, height) => {
  director = new PlayableDirector(width, height, demoScript);
});

sdk.on('resize', (w: number, h: number) => director?.resize(w, h));
sdk.on('pause',  () => director?.pause());
sdk.on('resume', () => director?.resume());
sdk.on('finish', () => director?.showEndCard());
```

**Step 5: Delete `src/Game.ts`**

```bash
rm src/Game.ts
```

**Step 6: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 7: Verify visually**

Kill any existing dev server on port 3000, then:
Run: `npm run dev`
Expected: Board loads, hero idles on tile 0, roll button works, dice animate, hero hops, camera follows. Identical to previous behavior.

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: extract scene architecture from Game.ts

- PlayableDirector drives SceneManager with PlayableScript config
- BoardScene contains all board logic (movement, hero, dice, highlights)
- RollButton supports scripted roll totals via setNextRoll()
- demo.ts script replicates current behavior with 99 random rolls
- Game.ts deleted, replaced by PlayableDirector + BoardScene"
```
