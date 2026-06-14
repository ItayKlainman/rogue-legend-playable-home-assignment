# Egg-Escalate Two-Fight + Boss-Land CTA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `egg-escalate` playable variant: dice roll → win vs 2 small enemies → collect Boneclaw (egg reveal) → dice roll → land on boss (store opens) → boss fight with hero + Glacidrake + Boneclaw → claim → end card.

**Architecture:** Approach A — parameterize the existing `egg-summon` `FightScene` and `BoardRollScene` so one implementation drives both fights and both rolls, then add a new `egg-escalate/` director that composes the beats. Boneclaw is extracted from the main client (`pocket-client`) via the existing Spine pipeline. The boss-land CTA fires `safeInstall()` via an `onBossLand` callback passed into `BoardRollScene` (no board-fight `CtaTrigger` machinery — the egg directors don't use it).

**Tech Stack:** TypeScript, PIXI.js, @esotericsoftware/spine-pixi (via `SpineCharacter`), webpack variant build (`scripts/variant-build.js`), Vitest-style tests (existing `*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-05-27-egg-escalate-two-fight-cta-design.md`

---

## Reference reading (do this before Task 4)

These existing files are the patterns to copy. Read them before writing the new variant:
- `src/playables/egg-summon/EggSummonDirector.ts` — director shape, analytics funnel, `runFlow()`, viewport.
- `src/playables/egg-summon/fightConfig.ts` — `buildBossFight()` structure (players/enemies/steps).
- `src/playables/egg-summon/catalog.ts` — `GLACIDRAKE_BUNDLE`, `loadRevealTexture`, egg art loaders.
- `src/playables/egg-summon/scenes/ClaimRewardScene.ts` and `PickPetScene.ts` — how `eggReveal` / reveal sprites are used (for the reward beat).
- `src/playables/egg-summon/index.ts` and `src/index.ts` — type registration.
- `src/playables/board-fight/catalog/enemies/stage1/{slime,wolf,skeletonKing}.ts` — enemy bundles.
- `scripts/strip-spine-json.js`, `scripts/resize-spine-atlas.js` — Spine size pipeline.

---

## File Structure

**New (`src/playables/egg-escalate/`):**
- `index.ts` — registers the variant (`PlayableType`).
- `script.ts` — `EggEscalateScript` (pets, enemies, board destinations).
- `catalog.ts` — adds `BONECLAW_BUNDLE`; re-exports shared loaders/bundles.
- `fightConfig.ts` — `buildSmallFight()` and `buildBossFight()`.
- `EggEscalateDirector.ts` — composes the 6-beat flow + analytics + `onBossLand` → `safeInstall()`.
- `scenes/EggRewardScene.ts` — egg-crack reveal of Boneclaw (reuses shared egg/reveal art).

**New assets:**
- `assets/egg-escalate/spine/Boneclaw.{atlas,json,webp}`

**Modified (shared, behavior-preserving for egg-summon):**
- `src/playables/egg-summon/scenes/FightScene.ts` — constructor takes a `FightSceneConfig`.
- `src/playables/egg-summon/scenes/BoardRollScene.ts` — constructor takes `BoardRollOptions`.
- `src/playables/egg-summon/EggSummonDirector.ts` — pass explicit config/options to the two scenes.
- `src/index.ts` — add `egg-escalate` to dev switch + prod `if`.
- `src/dev/TypePicker.ts` — add `egg-escalate` to the dropdown (if it hard-codes the list).

---

## Task 1: Extract & commit Boneclaw Spine assets

**Files:**
- Create: `assets/egg-escalate/spine/Boneclaw.json`
- Create: `assets/egg-escalate/spine/Boneclaw.atlas`
- Create: `assets/egg-escalate/spine/Boneclaw.webp`

Source (main client):
`/Users/idohoresh/Desktop/pocket-client/.pocketroll-tmp/Assets/Gameplay/BattleSystem/Pets/06 Mythic/Boneclaw/Boneclaw.{json,atlas.txt,png}`
(verified anims: `Idle`, `Move`, `Basic_Attack`; skins: `BoneClaw`, `BoneClaw_Evolution`; source PNG 5.3 MB.)

- [ ] **Step 1: Copy raw source into the playable repo**

```bash
SRC="/Users/idohoresh/Desktop/pocket-client/.pocketroll-tmp/Assets/Gameplay/BattleSystem/Pets/06 Mythic/Boneclaw"
mkdir -p assets/egg-escalate/spine
cp "$SRC/Boneclaw.json" assets/egg-escalate/spine/Boneclaw.json
cp "$SRC/Boneclaw.atlas.txt" assets/egg-escalate/spine/Boneclaw.atlas
cp "$SRC/Boneclaw.png" assets/egg-escalate/spine/Boneclaw.src.png
```

- [ ] **Step 2: Inspect how Glacidrake was sized, then shrink Boneclaw the same way**

The committed Glacidrake webp is ~137 KB. Reproduce that: downscale the PNG and the atlas coordinates together so they stay consistent, then encode webp.

Run (read the script's flags first; mirror the Glacidrake invocation recorded in `lessons.md` if present):
```bash
node scripts/resize-spine-atlas.js \
  --atlas assets/egg-escalate/spine/Boneclaw.atlas \
  --image assets/egg-escalate/spine/Boneclaw.src.png \
  --out assets/egg-escalate/spine/Boneclaw.webp
```
If `resize-spine-atlas.js` doesn't take these exact flags, run `node scripts/resize-spine-atlas.js --help` (or read its top comment) and adapt. The required outcome: a `Boneclaw.webp` whose dimensions match the (possibly downscaled) atlas coordinates, comparable in size to Glacidrake's ~137 KB.

- [ ] **Step 3: Strip unused skins from the JSON (keep only `BoneClaw`)**

```bash
node scripts/strip-spine-json.js \
  --in assets/egg-escalate/spine/Boneclaw.json \
  --keep-skin BoneClaw \
  --out assets/egg-escalate/spine/Boneclaw.json
```
(Adapt flags to the script's real interface — read its header. Goal: drop `BoneClaw_Evolution` and any unused attachments to cut JSON size, keeping anims `Idle`/`Move`/`Basic_Attack`.)

- [ ] **Step 4: Verify the three files load as a Spine rig**

Run:
```bash
ls -lh assets/egg-escalate/spine/
node -e "const a=require('fs').readFileSync('assets/egg-escalate/spine/Boneclaw.atlas','utf8'); console.log('atlas page:', a.split('\n')[0]); const j=JSON.parse(require('fs').readFileSync('assets/egg-escalate/spine/Boneclaw.json','utf8')); console.log('anims:', Object.keys(j.animations), 'skins:', (j.skins||[]).map(s=>s.name||s));"
```
Expected: atlas first line is `Boneclaw.webp`; anims include `Idle`, `Move`, `Basic_Attack`; skins is `['BoneClaw']`. Total dir size ≲ 400 KB.

- [ ] **Step 5: Remove the temp PNG and commit**

```bash
rm -f assets/egg-escalate/spine/Boneclaw.src.png
git add assets/egg-escalate/spine/
git commit -m "feat(egg-escalate): extract + shrink Boneclaw battle-pet Spine"
```

---

## Task 2: Parameterize `FightScene` to accept a config

**Files:**
- Modify: `src/playables/egg-summon/scenes/FightScene.ts:6` (drop direct `buildBossFight` import) and `:74-79` (constructor + `enter`)
- Modify: `src/playables/egg-summon/EggSummonDirector.ts:95` (pass `buildBossFight()`)

This is a pure refactor: egg-summon's behavior must be unchanged (it now passes the same config explicitly).

- [ ] **Step 1: Change the import to the type only**

In `FightScene.ts`, replace line 6:
```ts
import { buildBossFight } from '../fightConfig';
```
with:
```ts
import type { FightSceneConfig } from '../../board-fight/fight/FightStep';
```

- [ ] **Step 2: Accept the config in the constructor**

Replace the constructor (line 74):
```ts
  constructor(private ticker: Ticker, private width: number, private height: number) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }
```
with:
```ts
  constructor(
    private config: FightSceneConfig,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }
```

- [ ] **Step 3: Use the injected config in `enter()`**

In `enter()` (line 79), replace:
```ts
    const config = buildBossFight();
```
with:
```ts
    const config = this.config;
```

- [ ] **Step 4: Update egg-summon's caller**

In `EggSummonDirector.ts`, add the import at the top (near the other `egg-summon` imports):
```ts
import { buildBossFight } from './fightConfig';
```
Then change the `FightScene` construction (line ~95) from:
```ts
      const fight = new FightScene(this.ticker, this.cw, this.ch);
```
to:
```ts
      const fight = new FightScene(buildBossFight(), this.ticker, this.cw, this.ch);
```

- [ ] **Step 5: Type-check, then verify egg-summon is unchanged in dev**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

Then run the dev server and load egg-summon; confirm the boss fight still plays exactly as before:
```bash
npm run dev   # then open the URL with ?type=egg-summon
```
Expected: identical boss fight (hero + Glacidrake vs Skeleton King).

- [ ] **Step 6: Commit**

```bash
git add src/playables/egg-summon/scenes/FightScene.ts src/playables/egg-summon/EggSummonDirector.ts
git commit -m "refactor(egg-summon): FightScene takes an injected FightSceneConfig"
```

---

## Task 3: Parameterize `BoardRollScene` (destination + boss-land callback)

**Files:**
- Modify: `src/playables/egg-summon/scenes/BoardRollScene.ts` (constructor, `HOPS`, boss marker, hop resolve)
- Modify: `src/playables/egg-summon/EggSummonDirector.ts:88` (pass options)

Today the scene hard-codes `HOPS = 4`, always shows the Skeleton King boss marker, and always treats the destination as the boss tile. Make those options. egg-summon keeps its current look by passing `{ hops: 4, showBossMarker: true }`.

- [ ] **Step 1: Define the options type and accept it**

At the top of `BoardRollScene.ts` (after imports), add:
```ts
export interface BoardRollOptions {
  /** Tiles the hero hops this roll (default 4). */
  hops?: number;
  /** Show the Skeleton King boss marker on the destination tile (default true). */
  showBossMarker?: boolean;
  /** Fired once, the instant the hero's final hop lands on the destination tile. */
  onLand?: () => void;
}
```

Replace the constructor (line 82):
```ts
  constructor(
    private renderer: Renderer,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }
```
with:
```ts
  constructor(
    private renderer: Renderer,
    private ticker: Ticker,
    private width: number,
    private height: number,
    private opts: BoardRollOptions = {},
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }
```

- [ ] **Step 2: Drive the hop count from options**

Replace the module constant usage. Where `HOPS` is read for the roll/hop, use the instance value. Add a getter near the top of the class body:
```ts
  private get hops(): number { return this.opts.hops ?? HOPS; }
```
Then replace the three `HOPS` references inside methods:
- `this.rollButton.setNextRoll(HOPS);` → `this.rollButton.setNextRoll(this.hops);`
- `await this.hopTo(HOPS);` → `await this.hopTo(this.hops);`
- in `bossTileIndex()`: `(START_TILE + dir * HOPS + n * HOPS) % n` → `(START_TILE + dir * this.hops + n * this.hops) % n`

(Leave the `const HOPS = 4` as the default.)

- [ ] **Step 3: Gate the boss marker on the option**

In `enter()`, wrap the boss-marker block (the `try { this.boss = await SpineCharacter.create('boardBoss', ...) ...}`) so it only runs when `this.opts.showBossMarker ?? true` is true:
```ts
    if (this.opts.showBossMarker ?? true) {
      try {
        this.boss = await SpineCharacter.create('boardBoss', skeletonKingBundle, this.ticker);
        // ... existing boss-marker setup unchanged ...
      } catch {
        this.boss = undefined;
      }
    }
```
Also guard `syncBossToTile` calls so they no-op when `this.boss` is undefined (it already references `this.boss` — confirm it early-returns if `this.boss` is falsy; if not, add `if (!this.boss) return;` at the top of `syncBossToTile`).

- [ ] **Step 4: Fire `onLand` when the final hop settles**

In `enter()`'s roll sequence, immediately after `await this.hopTo(this.hops);` and before `this.resolveDone();`, add:
```ts
    this.opts.onLand?.();
```

- [ ] **Step 5: Update egg-summon's caller to preserve current behavior**

In `EggSummonDirector.ts` line ~88, change:
```ts
      const board = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch);
```
to:
```ts
      const board = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch, {
        hops: 4, showBossMarker: true,
      });
```

- [ ] **Step 6: Type-check and verify egg-summon unchanged**

Run:
```bash
npx tsc --noEmit && npm run dev   # open ?type=egg-summon
```
Expected: no type errors; egg-summon board roll → boss fight identical to before (boss marker present, 4 hops).

- [ ] **Step 7: Commit**

```bash
git add src/playables/egg-summon/scenes/BoardRollScene.ts src/playables/egg-summon/EggSummonDirector.ts
git commit -m "refactor(egg-summon): BoardRollScene takes hops/marker/onLand options"
```

---

## Task 4: egg-escalate `script.ts` + `catalog.ts`

**Files:**
- Create: `src/playables/egg-escalate/script.ts`
- Create: `src/playables/egg-escalate/catalog.ts`

- [ ] **Step 1: Write the script**

Create `src/playables/egg-escalate/script.ts`:
```ts
// Escalating two-fight flow: small fight (hero + Glacidrake) → collect Boneclaw
// → boss fight (hero + Glacidrake + Boneclaw). Pets are real battle-pet Spines.
export interface EggEscalateScript {
  /** Reward pet revealed after the first fight, shown on the reveal banner. */
  rewardPetName: string;
}

export const ESCALATE_SCRIPT: EggEscalateScript = {
  rewardPetName: 'Boneclaw',
};
```

- [ ] **Step 2: Write the catalog (Boneclaw bundle + shared re-exports)**

Create `src/playables/egg-escalate/catalog.ts`:
```ts
import type { SpineAssets } from '@shared/SpineCharacter';
import boneclawAtlasRaw from 'assets/egg-escalate/spine/Boneclaw.atlas';
import boneclawJsonRaw from 'assets/egg-escalate/spine/Boneclaw.json';
import boneclawPngData from 'assets/egg-escalate/spine/Boneclaw.webp';

// Reuse the hero, Glacidrake, egg art, and reveal/ui loaders from egg-summon.
export {
  HERO_BASE_BUNDLE, HERO_BASE_SKIN, GLACIDRAKE_BUNDLE,
  loadEggArt, loadUiTexture, EGG_ART, UI_ART,
} from '../egg-summon/catalog';

// Collected reward pet: Boneclaw (Mythic). Anims: Idle, Move, Basic_Attack.
export const BONECLAW_BUNDLE: SpineAssets = {
  atlasRaw: boneclawAtlasRaw,
  jsonRaw: boneclawJsonRaw,
  pngData: boneclawPngData,
  defaultScale: 0.026,   // tuned later next to Glacidrake (Task 8)
};
export const BONECLAW_SKIN = 'BoneClaw';
```

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors (asset module declarations for `.atlas/.json/.webp` already exist — see `src/declarations.d.ts`). If `.atlas` import errors, confirm the existing pattern in `egg-summon/catalog.ts` (it imports `*.atlas` the same way) and match it.

- [ ] **Step 4: Commit**

```bash
git add src/playables/egg-escalate/script.ts src/playables/egg-escalate/catalog.ts
git commit -m "feat(egg-escalate): script + catalog with Boneclaw bundle"
```

---

## Task 5: egg-escalate `fightConfig.ts` (small fight + 3-actor boss)

**Files:**
- Create: `src/playables/egg-escalate/fightConfig.ts`

Model on `egg-summon/fightConfig.ts`. The small fight is a fast, easy win vs 2 stage-1 enemies; the boss adds Boneclaw as a third player actor.

- [ ] **Step 1: Write the small fight (hero + Glacidrake vs Slime + Wolf)**

Create `src/playables/egg-escalate/fightConfig.ts`:
```ts
import type { FightSceneConfig } from '../board-fight/fight/FightStep';
import { slimeBundle } from '../board-fight/catalog/enemies/stage1/slime';
import { wolfBundle } from '../board-fight/catalog/enemies/stage1/wolf';
import { skeletonKingBundle } from '../board-fight/catalog/enemies/stage1/skeletonKing';
import battleBgStage1 from '../board-fight/catalog/battleBgs/stage1';
import {
  HERO_BASE_BUNDLE, HERO_BASE_SKIN, GLACIDRAKE_BUNDLE,
  BONECLAW_BUNDLE, BONECLAW_SKIN,
} from './catalog';
// Skill VFX side-effect imports (same set egg-summon registers).
import '../egg-summon/iceSkillVfx';        // frostBreath + glacialStrike
import '../egg-summon/lightShurikenVfx';   // shurikenThrow
import '../board-fight/fight/skillVfx/chainLightning';

// First battle: a quick, decisive win so the player feels strong before the boss.
export function buildSmallFight(): FightSceneConfig {
  return {
    background: battleBgStage1,
    bossFight: false,
    characterScale: 0.12,
    players: [
      { spine: HERO_BASE_BUNDLE, skin: HERO_BASE_SKIN, maxHp: 200000, hp: 200000, maxRage: 100, melee: true, xFrac: 0.27, yFrac: 0.80 },
      { spine: GLACIDRAKE_BUNDLE, skin: 'Glacidrake', maxHp: 100000, melee: true, scale: 0.026, xFrac: 0.08, yFrac: 0.96 },
    ],
    enemies: [
      { spine: slimeBundle, skin: 'default', maxHp: 40000, melee: true, xFrac: 0.78, yFrac: 0.78 },
      { spine: wolfBundle, skin: 'default', maxHp: 50000, melee: true, xFrac: 0.90, yFrac: 0.88 },
    ],
    steps: [
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 45000, melee: true, rageFill: 25 },
      { type: 'wait', ms: 300 },
      { type: 'skill', side: 'player', actor: 1, skillId: 'frostBreath', target: 1, damage: 60000 },
      { type: 'die', actor: 1 },
      { type: 'wait', ms: 250 },
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 50000, melee: true, category: 'combo', crit: true, dramatic: true },
      { type: 'die', actor: 0 },
    ],
    onVictory: { labelText: 'VICTORY!', holdMs: 250 },
  };
}
```

> Note: confirm the enemy `skin` value (`'default'` vs a named skin) by checking each bundle's JSON `skins` — match what `egg-summon`/`board-fight` use for stage-1 enemies. Confirm `target` indices refer to the `enemies[]` array (slime=0, wolf=1) per `FightStep` semantics; adjust if the engine targets differently.

- [ ] **Step 2: Add the boss fight (hero + Glacidrake + Boneclaw vs Skeleton King)**

Append to `fightConfig.ts`:
```ts
// Boss battle: the collected Boneclaw joins Glacidrake + hero against the boss.
export function buildBossFight(): FightSceneConfig {
  return {
    background: battleBgStage1,
    bossFight: true,
    characterScale: 0.12,
    players: [
      { spine: HERO_BASE_BUNDLE, skin: HERO_BASE_SKIN, maxHp: 200000, hp: 200000, maxRage: 100, melee: true, xFrac: 0.27, yFrac: 0.80 },
      { spine: GLACIDRAKE_BUNDLE, skin: 'Glacidrake', maxHp: 100000, melee: true, scale: 0.026, xFrac: 0.08, yFrac: 0.96 },
      { spine: BONECLAW_BUNDLE, skin: BONECLAW_SKIN, maxHp: 100000, melee: true, scale: BONECLAW_BUNDLE.defaultScale, xFrac: 0.16, yFrac: 0.90 },
    ],
    enemies: [
      { spine: skeletonKingBundle, skin: 'default', maxHp: 320000, melee: true, maxRage: 100, xFrac: 0.82, yFrac: 0.85 },
    ],
    steps: [
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 20 },
      { type: 'wait', ms: 400 },
      { type: 'skill', side: 'player', actor: 1, skillId: 'frostBreath', target: 0, damage: 30000 },
      { type: 'wait', ms: 400 },
      // Boneclaw melee beat (it has only Idle/Move/Basic_Attack — use melee, not a skill VFX).
      { type: 'attack', side: 'player', actor: 2, target: 0, damage: 30000, melee: true, dramatic: true },
      { type: 'wait', ms: 400 },
      { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 70000, category: 'rage', dramatic: true },
      { type: 'vignette', on: true },
      { type: 'wait', ms: 400 },
      { type: 'skill', side: 'player', actor: 0, skillId: 'chainLightning', target: 0, damage: 35000 },
      { type: 'wait', ms: 400 },
      { type: 'skill', side: 'player', actor: 1, skillId: 'glacialStrike', target: 0, damage: 45000, dramatic: true, crit: true },
      { type: 'wait', ms: 300 },
      { type: 'attack', side: 'player', actor: 2, target: 0, damage: 40000, melee: true, category: 'combo', crit: true },
      { type: 'wait', ms: 300 },
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 60000, melee: true, category: 'combo', crit: true, dramatic: true },
      { type: 'die', actor: 0 },
      { type: 'vignette', on: false },
    ],
    onVictory: { labelText: 'VICTORY!', holdMs: 250 },
  };
}
```

> Note: total player damage must leave the boss alive until the hero's finisher (last `attack` + `die`). Sum the player damage and tune `maxHp` (320000) so the final hero blow is lethal but the prior beats are not — eyeball in Task 8 and adjust.

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. If `ActorConfig` rejects `hp`/`scale`/`xFrac` keys, open `src/playables/board-fight/fight/FightStep.ts` `ActorConfig` and match egg-summon's exact field names.

- [ ] **Step 4: Commit**

```bash
git add src/playables/egg-escalate/fightConfig.ts
git commit -m "feat(egg-escalate): small-fight + 3-actor boss fight configs"
```

---

## Task 6: `EggRewardScene` — Boneclaw egg reveal

**Files:**
- Create: `src/playables/egg-escalate/scenes/EggRewardScene.ts`

Reuse the egg/reveal art and the existing reveal motion. **Read `ClaimRewardScene.ts` and `PickPetScene.ts` first** to copy how they load egg art (`loadEggArt`), play the crack/burst, and show a reveal banner — match that API exactly rather than inventing one.

- [ ] **Step 1: Write the scene skeleton (Scene interface + done promise)**

Create `src/playables/egg-escalate/scenes/EggRewardScene.ts`:
```ts
import { Container, Sprite, Ticker, Texture } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { SpineCharacter } from '@shared/SpineCharacter';
import { loadEggArt } from '../catalog';
import { BONECLAW_BUNDLE, BONECLAW_SKIN } from '../catalog';

/**
 * Victory egg drops and cracks open into the collected pet (Boneclaw), which is
 * the reward that joins the team for the boss fight. Motion mirrors the
 * egg-summon reveal (see ClaimRewardScene / eggReveal).
 */
export class EggRewardScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private pet?: SpineCharacter;

  constructor(private ticker: Ticker, private width: number, private height: number) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    const egg = await loadEggArt();
    // Build the egg → crack → burst sequence exactly as ClaimRewardScene does,
    // then create the Boneclaw rig and play its Idle as the reveal:
    this.pet = await SpineCharacter.create('rewardPet', BONECLAW_BUNDLE, this.ticker);
    if (this.pet.spine.skeleton.data.findSkin?.(BONECLAW_SKIN)) {
      this.pet.spine.skeleton.setSkinByName(BONECLAW_SKIN);
      this.pet.spine.skeleton.setSlotsToSetupPose();
    }
    this.pet.play('Idle', true);
    this.container.addChild(this.pet.spine);
    // TODO-IN-IMPL: position/scale + banner per ClaimRewardScene; auto-advance.
  }

  layout(designW: number, designH: number, fillX: number, fillW: number, fillY: number, fillH: number): void {
    if (!this.pet) return;
    this.pet.spine.position.set(fillX + fillW / 2, fillY + fillH * 0.55);
    const s = BONECLAW_BUNDLE.defaultScale ?? 0.026;
    this.pet.spine.scale.set(s);
  }

  update(_dtMs: number): void {}

  // Auto-advance after a short reveal hold (the director awaits `done`).
  exit(): void { this.pet?.destroy?.(); }
}
```

> The `// TODO-IN-IMPL` marker must be resolved during implementation by copying the concrete reveal sequence (egg sprite swap → burst particles → banner text "Boneclaw" → hold → `this.resolveDone()`) from `ClaimRewardScene.ts`. Do not leave it as a comment in the committed code; replace it with the real reveal + a timed `resolveDone()`.

- [ ] **Step 2: Resolve the reveal + auto-advance**

Match `ClaimRewardScene`'s pattern: after the burst + banner, schedule `this.resolveDone()` (e.g. via a timer added in `enter()` or counted down in `update()`), and use the reveal banner with `script.rewardPetName`. Confirm against the real `Scene` interface in `src/shared/Scene.ts` (method names: `enter`, `layout`, `update`, `exit` — adjust if different).

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/playables/egg-escalate/scenes/EggRewardScene.ts
git commit -m "feat(egg-escalate): Boneclaw egg-reward reveal scene"
```

---

## Task 7: `EggEscalateDirector` — compose the flow + CTA + analytics

**Files:**
- Create: `src/playables/egg-escalate/EggEscalateDirector.ts`
- Create: `src/playables/egg-escalate/index.ts`

Copy `EggSummonDirector.ts` wholesale, then change `runFlow()` to the 6-beat sequence and add the boss-land CTA.

- [ ] **Step 1: Copy the director and rename**

```bash
cp src/playables/egg-summon/EggSummonDirector.ts src/playables/egg-escalate/EggEscalateDirector.ts
```
In the new file: rename the class `EggSummonDirector` → `EggEscalateDirector`; change the script type import/param to `EggEscalateScript` from `./script`; keep `init()`, `resize()`, `applyViewport()`, `pause()`, `resume()` identical.

- [ ] **Step 2: Add imports for the new beats**

At the top of `EggEscalateDirector.ts`, ensure these imports (paths relative to the new file):
```ts
import { FightScene } from '../egg-summon/scenes/FightScene';
import { BoardRollScene } from '../egg-summon/scenes/BoardRollScene';
import { ClaimRewardScene } from '../egg-summon/scenes/ClaimRewardScene';
import { EggRewardScene } from './scenes/EggRewardScene';
import { EndCardScene } from '../end_card/EndCardScene';
import { buildSmallFight, buildBossFight } from './fightConfig';
import { safeInstall } from '@shared/mraidInstall';
import type { EggEscalateScript } from './script';
```
(Remove egg-summon-only imports that are no longer used: `EggSummonScene`, `PickPetScene`, `buildBossFight` from egg-summon's fightConfig, etc.)

- [ ] **Step 3: Replace `runFlow()` with the escalation sequence**

```ts
  private async runFlow(): Promise<void> {
    audio.playBoardMusic(sdk.volume);

    // 1. First roll → small-enemies tile (no boss marker).
    const roll1 = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch, {
      hops: 3, showBossMarker: false,
    });
    await this.sceneManager.push(roll1, 'replace');
    await roll1.done;

    // 2. Easy win vs 2 small enemies.
    audio.playFightMusic(sdk.volume);
    const small = new FightScene(buildSmallFight(), this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(small);
    await small.done;
    alTrack('CHALLENGE_PASS_25');

    // 3. Collect Boneclaw (egg reveal).
    audio.playBoardMusic(sdk.volume);
    const reward = new EggRewardScene(this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(reward);
    await reward.done;
    alTrack('CHALLENGE_PASS_50');

    // 4. Second roll → BOSS tile. The store opens the instant we land.
    let ctaFired = false;
    const roll2 = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch, {
      hops: 4, showBossMarker: true,
      onLand: () => { if (!ctaFired) { ctaFired = true; alTrack('CHALLENGE_PASS_75'); safeInstall(); } },
    });
    await this.sceneManager.seamlessReplace(roll2);
    await roll2.done;

    // 5. Boss fight (plays if the user dismissed the store and returned).
    audio.playFightMusic(sdk.volume);
    const boss = new FightScene(buildBossFight(), this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(boss);
    await boss.done;

    // 6. Claim → end card.
    audio.playBoardMusic(sdk.volume);
    const claim = new ClaimRewardScene(this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(claim);
    await claim.done;

    sdk.finish();
    const endCard = new EndCardScene({ splashImage, logoImage }, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(endCard);
  }
```

> Note: `ClaimRewardScene`'s constructor signature must match (`(ticker, cw, ch)` per egg-summon). If it requires the script, pass what egg-summon passes. If `ClaimRewardScene` is tightly coupled to egg-summon's reward, either reuse it as-is or skip it and go straight to the end card — decide in Task 8 by eye.

- [ ] **Step 4: Write `index.ts`**

Create `src/playables/egg-escalate/index.ts`:
```ts
import type { PlayableType } from '@shared/PlayableType';
import { EggEscalateDirector } from './EggEscalateDirector';
import { ESCALATE_SCRIPT, type EggEscalateScript } from './script';

const eggEscalateType: PlayableType<EggEscalateScript> = {
  name: 'egg-escalate',
  async getScript() { return ESCALATE_SCRIPT; },
  create(width, height, script) { return new EggEscalateDirector(width, height, script); },
};

export default eggEscalateType;
```

- [ ] **Step 5: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/playables/egg-escalate/EggEscalateDirector.ts src/playables/egg-escalate/index.ts
git commit -m "feat(egg-escalate): director composing the two-fight + boss-land CTA flow"
```

---

## Task 8: Register the type, then live-verify and tune

**Files:**
- Modify: `src/index.ts` (dev switch + prod `if`)
- Modify: `src/dev/TypePicker.ts` (if it hard-codes the type list)

- [ ] **Step 1: Register in `src/index.ts`**

In the dev `switch` (after the `egg-crack` case):
```ts
      case 'egg-escalate':
        return (await import('./playables/egg-escalate')).default;
```
In the production section (after the `egg-crack` `if`):
```ts
  if (PLAYABLE_TYPE === 'egg-escalate') {
    return (await import('./playables/egg-escalate')).default;
  }
```

- [ ] **Step 2: Add to the dev TypePicker dropdown**

Open `src/dev/TypePicker.ts`; if it lists types explicitly, add `'egg-escalate'`. (If it derives the list dynamically, no change needed.)

- [ ] **Step 3: Type-check and run the full flow in dev**

Run:
```bash
npx tsc --noEmit && npm run dev   # open ?type=egg-escalate
```
Walk the whole flow and confirm:
- roll 1 (no boss marker, 3 hops) → small fight → fast win
- Boneclaw egg reveal plays and reads as a "collect"
- roll 2 (boss marker, 4 hops) → on land, the store/install fires once (in preview, the nav fallback opens; verify it does not fire twice)
- boss fight plays with hero + Glacidrake + **Boneclaw** all visibly fighting
- claim → end card

- [ ] **Step 4: Tune by eye (scales, positions, pacing, damage)**

Adjust in small cycles with the dev server live:
- `BONECLAW_BUNDLE.defaultScale` + boss/reward `xFrac/yFrac` so Boneclaw sits correctly next to Glacidrake and the hero.
- boss `enemies[0].maxHp` so the hero's final blow is the kill (not earlier).
- small-fight damage so it ends in ~3 beats.
- `EggRewardScene` reveal hold + banner.

- [ ] **Step 5: Verify aspect ratios and build size**

Check every scene at tall / design / wide; backgrounds must cover the full fill rect (no bars). Then:
```bash
npm run build:variant   # or the egg-escalate build invocation; confirm output
ls -lh dist/            # confirm the egg-escalate bundle is < 5 MB
```
Expected: all scenes cover the fill rect; build < 5 MB.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/dev/TypePicker.ts src/playables/egg-escalate/
git commit -m "feat(egg-escalate): register variant; tuned scales/pacing/CTA"
```

---

## Self-review notes (coverage vs spec)

- Flow (roll → small fight → collect → roll → boss-land CTA → boss → claim → end card): Tasks 5–7.
- Real assets only / Boneclaw extraction: Task 1.
- Approach A parameterization (FightScene, BoardRollScene), egg-summon preserved: Tasks 2–3.
- Boss-land `safeInstall()` once: Task 7 Step 3 (`ctaFired` guard) + Task 8 Step 3 verify.
- Analytics funnel (25/50/75): Task 7 Step 3.
- Build-size + aspect-ratio risks: Task 8 Step 5.
- Deviation from spec: CTA uses an `onLand` callback + direct `safeInstall()` instead of board-fight's `CtaTrigger`/`notifyCheckpoint` (the egg directors don't use that system). Same observable behavior, less coupling.
