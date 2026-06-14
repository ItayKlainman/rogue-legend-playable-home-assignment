# skill-chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new playable ad type `skill-chain`: a 30–40s lightning-only power-fantasy. Hero plays 4 short fights; between fights the player picks one of 3 same-tier lightning variants (T1 → T2 → T3); by the final boss fight the screen is full of homing-bolt VFX that take ~5–7 volleys to kill the boss.

**Architecture:** New playable type at `src/playables/skill-chain/`. Reuses `FightEngine`, `FightScene`, the `chainLightning` skill VFX, Spine character, sfx, enemy & battle-bg catalog via direct `../board-fight/*` imports (established pattern from dice-blackjack). New code: `SkillChainDirector` (sequences scenes), `PickScene` (3-card UI), `ChainHud` (top-of-screen tier indicator), `HeroAuraLayer` (Container with per-tier glow attached to hero).

**Tech Stack:** TypeScript, PixiJS 8, `@esotericsoftware/spine-pixi-v8`, `@smoud/playable-sdk`, `@smoud/playable-scripts` (webpack-based). Tests: Node `--test` runner via `tsx`.

**Spec:** [docs/superpowers/specs/2026-05-19-skill-chain-design.md](../specs/2026-05-19-skill-chain-design.md)

---

## Discovery (during plan-writing, supersedes one spec note)

The spec listed a "configurable skill cast interval (~10-line change in `FightEngine`)" as a reuse risk. **This is not needed.** `FightEngine` is fully script-driven: it consumes a `FightStep[]` sequence and executes steps in order. "Spam" is achieved by authoring multiple `{ type: 'skill', side: 'player', actor: 0, skillId: 'chainLightning', damage: N }` steps with short `{ type: 'wait', ms: M }` gaps between them. The boss fight script in Task 7 demonstrates this.

Also: `chainLightning`'s VFX handler at `src/playables/board-fight/fight/skillVfx/chainLightning.ts` already auto-escalates when `state.skills` contains `thunderstorm` (adds splash) or `thunderGod` (mega effect). So unlocking T2/T3 only requires pushing the skill ID into `state.skills` — the VFX layer adapts automatically with zero changes needed.

---

## File structure

```
src/playables/skill-chain/
  index.ts                          # PlayableType adapter (Task 1)
  SkillChainDirector.ts             # Lifecycle owner; sequences scenes (Task 1, expanded in T5-T7)
  SkillChainScript.ts               # Arc config schema (Task 2)
  defaultScript.ts                  # The actual arc content (Task 2)
  config.ts                         # Tunables — boss HP, hero aura colors (Task 2)
  scenes/
    PickScene.ts                    # 3-card lightning-variant pick UI (Task 3)
  ui/
    ChainHud.ts                     # 3-slot ⚡ tier indicator (Task 8)
    HeroAuraLayer.ts                # Per-tier hero glow Container (Task 9)
  __tests__/
    run.mjs                         # Test runner (mirrors dice-blackjack pattern)
    setup.ts                        # Webpack asset import stubs
    defaultScript.test.ts           # Script structure validation (Task 2)
    PickScene.test.ts               # Variant→skill mapping logic (Task 3)
    ChainHud.test.ts                # Tier-state-to-visual logic (Task 8)
```

Modified files outside `skill-chain/`:
- `src/index.ts` — add `skill-chain` case to dev switch + prod `if` block (Task 1)
- `package.json` — add `test:skill-chain` script (Task 2)

No modifications to `board-fight/` code. No modifications to `FightEngine`.

---

## Task 1: Bootstrap playable type (skeleton renders to screen)

**Goal:** A working `skill-chain` PlayableType that, when selected via `?type=skill-chain`, runs and shows a blank PixiJS canvas with a "skill-chain loaded" debug label. No gameplay yet. Verifies registration plumbing.

**Files:**
- Create: `src/playables/skill-chain/index.ts`
- Create: `src/playables/skill-chain/SkillChainDirector.ts`
- Modify: `src/index.ts` (add case for `skill-chain` in dev switch + prod block)

- [ ] **Step 1: Create the PlayableType adapter**

Create `src/playables/skill-chain/index.ts`:

```ts
import type { PlayableType } from '@shared/PlayableType';
import { SkillChainDirector } from './SkillChainDirector';

interface SkillChainScript {
  // Will be expanded in Task 2.
  bootMarker: 'skill-chain';
}

const skillChain: PlayableType<SkillChainScript> = {
  name: 'skill-chain',

  async getScript() {
    return { bootMarker: 'skill-chain' };
  },

  create(width, height, script) {
    return new SkillChainDirector(width, height, script);
  },
};

export default skillChain;
```

- [ ] **Step 2: Create the minimal Director**

Create `src/playables/skill-chain/SkillChainDirector.ts`:

```ts
import { Application, Container, Text, TextStyle, Ticker } from 'pixi.js';
import { SceneManager } from '@shared/SceneManager';
import type { PlayableLifecycle } from '@shared/PlayableType';
import { alTrack } from '@shared/alAnalytics';

interface SkillChainScript {
  bootMarker: 'skill-chain';
}

export class SkillChainDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private width: number;
  private height: number;
  private script: SkillChainScript;

  constructor(width: number, height: number, script: SkillChainScript) {
    this.width = width;
    this.height = height;
    this.script = script;
    this.app = new Application();
    this.ticker = new Ticker();
    void this.init();
  }

  private async init(): Promise<void> {
    alTrack('LOADING');
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
    this.ticker.add(t => this.sceneManager.update(t.deltaMS));
    this.ticker.start();

    // Boot marker — replaced by real scenes in Task 5+.
    const label = new Text({
      text: `skill-chain loaded (${this.script.bootMarker})`,
      style: new TextStyle({ fill: 0xffffff, fontFamily: 'Arial', fontSize: 24 }),
    });
    label.anchor.set(0.5);
    label.position.set(this.width / 2, this.height / 2);
    this.app.stage.addChild(label);

    alTrack('LOADED');
    alTrack('DISPLAYED');
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.sceneManager?.layout(width, height);
  }

  pause(): void { this.ticker.stop(); }
  resume(): void { this.ticker.start(); }
  showEndCard(): void { /* implemented in Task 10 */ }
}
```

- [ ] **Step 3: Register in the router**

Modify `src/index.ts`. After the `case 'dice-blackjack':` line in the dev switch, add:

```ts
      case 'skill-chain':
        return (await import('./playables/skill-chain')).default;
```

After the `if (PLAYABLE_TYPE === 'dice-blackjack')` block in the production section, add:

```ts
  if (PLAYABLE_TYPE === 'skill-chain') {
    return (await import('./playables/skill-chain')).default;
  }
```

- [ ] **Step 4: Run dev server and verify smoke**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Expected: Dev server starts. Open `http://localhost:3000/?type=skill-chain`. Page shows "skill-chain loaded (skill-chain)" centered on a transparent canvas. TypePicker dropdown (top-left) shows `skill-chain` as an option.

If the build fails because `scripts/variant-build.js` looks for codegen — note that line 62 of that script has `else if (fs.existsSync(codegenPath))` — so missing codegen is fine. We don't need a codegen for skill-chain.

- [ ] **Step 5: Commit**

```bash
git add src/playables/skill-chain/ src/index.ts
git commit -m "$(cat <<'EOF'
skill-chain: bootstrap playable type + router registration

Empty Director renders a boot marker. Validates that the new type
loads via the dev TypePicker and the production PLAYABLE_TYPE switch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Define script types + default content + config

**Goal:** Define the typed `SkillChainScript` shape, write `defaultScript.ts` with all arc data (4 fights, 3 pick rounds, tunings), centralize tunables in `config.ts`, and add a structural test that locks the script's expected shape.

**Files:**
- Create: `src/playables/skill-chain/SkillChainScript.ts`
- Create: `src/playables/skill-chain/config.ts`
- Create: `src/playables/skill-chain/defaultScript.ts`
- Modify: `src/playables/skill-chain/index.ts` (use new types + defaultScript)
- Create: `src/playables/skill-chain/__tests__/run.mjs`
- Create: `src/playables/skill-chain/__tests__/setup.ts`
- Create: `src/playables/skill-chain/__tests__/defaultScript.test.ts`
- Modify: `package.json` (add `test:skill-chain` npm script)

- [ ] **Step 1: Define the script types**

Create `src/playables/skill-chain/SkillChainScript.ts`:

```ts
import type { SpineAssets, WeaponConfig } from '@shared/SpineCharacter';

/**
 * The arc is a fixed sequence: hookFight → 3 × (pick → fight) → boss → end card.
 * Each fight is described as a FightSpec; the Director compiles it into a
 * FightSceneConfig at runtime using the shared FightEngine catalog.
 */
export interface SkillChainScript {
  initialState: InitialPlayerState;
  hookFight: FightSpec;
  rounds: RoundSpec[]; // length = 3
}

export interface InitialPlayerState {
  hp: number;
  maxHp: number;
  atk: number;
  weapon: string;
  weaponConfig: WeaponConfig | null;
  heroSkin: string;
}

export interface FightSpec {
  bg: 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'stage6' | 'stage7';
  enemies: EnemySpec[];
  /** When true: hero must NOT cast skills (basic attacks only). Used by hookFight. */
  basicOnly?: boolean;
  /** When true: pre-fight VS intro screen. */
  bossFight?: boolean;
  /** Number of player skill casts in the script. The Director compiles this into
   *  FightStepSkill[] steps with short `wait` gaps when skills are available. */
  skillVolleys: number;
  /** Damage per skill volley (split across enemies internally by chainLightning). */
  damagePerVolley: number;
}

export interface EnemySpec {
  /** Enemy ID matching a catalog entry in board-fight/catalog/enemies/. */
  id: 'skeleton' | 'skeletonCommander' | 'skeletonArcher' | 'skeletonKing';
  hp: number;
  maxHp: number;
}

export interface RoundSpec {
  tier: 1 | 2 | 3;
  /** The skill ID granted regardless of which card the player taps (all 3 cards map to this). */
  grantSkill: 'chainLightning' | 'thunderstorm' | 'thunderGod';
  /** Visual variants shown on the 3 pick cards. */
  cardVariants: [PickCardVariant, PickCardVariant, PickCardVariant];
  fight: FightSpec;
}

export interface PickCardVariant {
  name: string;     // e.g. "Chain Bolt", "Fork Bolt", "Heavenly Strike"
  iconId: string;   // resolved to a webpack-imported image in Task 3
}
```

- [ ] **Step 2: Centralize tunables in config.ts**

Create `src/playables/skill-chain/config.ts`:

```ts
/** Tunables for the skill-chain playable. Adjust here, no other files. */
export const CONFIG = {
  /** Hero stats at game start. */
  hero: {
    hp: 200,
    maxHp: 200,
    atk: 50,
  },
  /** Total ad target. Drives QA expectations. */
  targetLengthMs: 35_000,
  /** Pick UI auto-advance if the player doesn't tap. */
  pickAutoAdvanceMs: 5_000,
  /** Pick UI card reveal animation duration. */
  pickRevealMs: 600,
  /** Wait between two skill steps in the boss fight (the "spam" cadence). */
  bossVolleyGapMs: 350,
  /** Standard fight skill-step gap. */
  standardVolleyGapMs: 900,
  /** Hero aura colors per unlocked tier (hex). T0 = no aura. */
  auraColors: {
    t0: null as number | null,
    t1: 0x4a8cff, // soft blue
    t2: 0x66e0ff, // cyan
    t3: 0xffffff, // blinding white
  },
  /** Slow-mo factor and duration applied to the boss death moment. */
  bossDeathSlowMo: { factor: 0.35, durationMs: 300 },
} as const;
```

- [ ] **Step 3: Write the default script**

Create `src/playables/skill-chain/defaultScript.ts`:

```ts
import type { SkillChainScript } from './SkillChainScript';
import { CONFIG } from './config';

export const DEFAULT_SCRIPT: SkillChainScript = {
  initialState: {
    hp: CONFIG.hero.hp,
    maxHp: CONFIG.hero.maxHp,
    atk: CONFIG.hero.atk,
    weapon: 'warriorBlade',
    weaponConfig: null,
    heroSkin: 'base',
  },
  hookFight: {
    bg: 'stage1',
    enemies: [{ id: 'skeleton', hp: 40, maxHp: 40 }],
    basicOnly: true,
    skillVolleys: 0,
    damagePerVolley: 0,
  },
  rounds: [
    {
      tier: 1,
      grantSkill: 'chainLightning',
      cardVariants: [
        { name: 'Chain Bolt',      iconId: 'lightning_a' },
        { name: 'Fork Bolt',       iconId: 'lightning_b' },
        { name: 'Heavenly Strike', iconId: 'lightning_c' },
      ],
      fight: {
        bg: 'stage1',
        enemies: [{ id: 'skeletonCommander', hp: 120, maxHp: 120 }],
        skillVolleys: 3,
        damagePerVolley: 50,
      },
    },
    {
      tier: 2,
      grantSkill: 'thunderstorm',
      cardVariants: [
        { name: 'Storm Cloud', iconId: 'lightning_a' },
        { name: 'Spark Burst', iconId: 'lightning_b' },
        { name: 'Tempest',     iconId: 'lightning_c' },
      ],
      fight: {
        bg: 'stage1',
        enemies: [
          { id: 'skeletonArcher', hp: 90, maxHp: 90 },
          { id: 'skeleton',       hp: 90, maxHp: 90 },
        ],
        skillVolleys: 4,
        damagePerVolley: 55,
      },
    },
    {
      tier: 3,
      grantSkill: 'thunderGod',
      cardVariants: [
        { name: 'Mega Bolt',    iconId: 'lightning_a' },
        { name: 'Zeus Wrath',   iconId: 'lightning_b' },
        { name: 'Thunder Crown', iconId: 'lightning_c' },
      ],
      fight: {
        bg: 'stage1',
        enemies: [{ id: 'skeletonKing', hp: 380, maxHp: 380 }],
        bossFight: true,
        skillVolleys: 7,
        damagePerVolley: 60,
      },
    },
  ],
};
```

The boss HP (380) is sized so 7 volleys of ~55 damage each (`damagePerVolley` × `livingEnemies` factor) finish it — visualizes 5–7 volleys before death. We will tune the exact number in Task 12 (build verification) once we can watch a real run.

- [ ] **Step 4: Wire the new types into the adapter**

Replace `src/playables/skill-chain/index.ts` body with:

```ts
import type { PlayableType } from '@shared/PlayableType';
import { SkillChainDirector } from './SkillChainDirector';
import { DEFAULT_SCRIPT } from './defaultScript';
import type { SkillChainScript } from './SkillChainScript';

const skillChain: PlayableType<SkillChainScript> = {
  name: 'skill-chain',
  async getScript() {
    return DEFAULT_SCRIPT;
  },
  create(width, height, script) {
    return new SkillChainDirector(width, height, script);
  },
};

export default skillChain;
```

Also update the import in `SkillChainDirector.ts` — replace the local `interface SkillChainScript { bootMarker: 'skill-chain' }` with `import type { SkillChainScript } from './SkillChainScript';`. Adjust the boot-marker label to show `script.rounds.length` instead of `script.bootMarker` (so the marker proves the real script loaded):

```ts
const label = new Text({
  text: `skill-chain: ${script.rounds.length} rounds`,
  style: new TextStyle({ fill: 0xffffff, fontFamily: 'Arial', fontSize: 24 }),
});
```

- [ ] **Step 5: Write a failing structural test**

Create `src/playables/skill-chain/__tests__/setup.ts`:

```ts
// Stub webpack asset imports so tsx-loaded TypeScript can import the production
// modules without resolving real .png/.atlas/.webp/.mp3 paths.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./setup-loader.mjs', pathToFileURL(import.meta.url));
```

Create `src/playables/skill-chain/__tests__/setup-loader.mjs`:

```js
// Resolver hook: intercept asset imports and return empty string defaults.
const EXTENSIONS = ['.png', '.webp', '.jpg', '.atlas', '.json', '.mp3', '.css'];

export async function resolve(specifier, context, nextResolve) {
  if (EXTENSIONS.some(ext => specifier.endsWith(ext))) {
    return { url: 'data:text/javascript,export default "";', shortCircuit: true, format: 'module' };
  }
  return nextResolve(specifier, context);
}
```

Create `src/playables/skill-chain/__tests__/defaultScript.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCRIPT } from '../defaultScript';

test('DEFAULT_SCRIPT has exactly 3 rounds (T1, T2, T3)', () => {
  assert.equal(DEFAULT_SCRIPT.rounds.length, 3);
  assert.equal(DEFAULT_SCRIPT.rounds[0].tier, 1);
  assert.equal(DEFAULT_SCRIPT.rounds[1].tier, 2);
  assert.equal(DEFAULT_SCRIPT.rounds[2].tier, 3);
});

test('rounds grant lightning chain skills in tier order', () => {
  assert.equal(DEFAULT_SCRIPT.rounds[0].grantSkill, 'chainLightning');
  assert.equal(DEFAULT_SCRIPT.rounds[1].grantSkill, 'thunderstorm');
  assert.equal(DEFAULT_SCRIPT.rounds[2].grantSkill, 'thunderGod');
});

test('hookFight is basic-only (no skills)', () => {
  assert.equal(DEFAULT_SCRIPT.hookFight.basicOnly, true);
  assert.equal(DEFAULT_SCRIPT.hookFight.skillVolleys, 0);
});

test('boss fight is final round, uses skeletonKing, has bossFight flag', () => {
  const boss = DEFAULT_SCRIPT.rounds[2].fight;
  assert.equal(boss.bossFight, true);
  assert.equal(boss.enemies.length, 1);
  assert.equal(boss.enemies[0].id, 'skeletonKing');
});

test('every round has exactly 3 card variants', () => {
  for (const round of DEFAULT_SCRIPT.rounds) {
    assert.equal(round.cardVariants.length, 3);
  }
});

test('boss has more skill volleys than any earlier fight (escalation)', () => {
  const boss = DEFAULT_SCRIPT.rounds[2].fight;
  for (let i = 0; i < 2; i++) {
    assert.ok(boss.skillVolleys > DEFAULT_SCRIPT.rounds[i].fight.skillVolleys,
      `boss volleys (${boss.skillVolleys}) should exceed round ${i + 1} (${DEFAULT_SCRIPT.rounds[i].fight.skillVolleys})`);
  }
});
```

Create `src/playables/skill-chain/__tests__/run.mjs`:

```js
#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');

const result = spawnSync(
  'node',
  [
    '--import', 'tsx',
    '--import', resolve(__dirname, 'setup.ts'),
    '--test',
    resolve(__dirname, 'defaultScript.test.ts'),
  ],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
);

process.exit(result.status ?? 1);
```

- [ ] **Step 6: Add npm test script + run tests**

Modify `package.json` — add to the `scripts` block (next to `test:dice-blackjack`):

```json
    "test:skill-chain": "node src/playables/skill-chain/__tests__/run.mjs",
```

Run: `npm run test:skill-chain`
Expected: All 6 tests pass.

- [ ] **Step 7: Re-verify the dev boot marker shows real script**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Open: `http://localhost:3000/?type=skill-chain`
Expected: Label now reads "skill-chain: 3 rounds".

- [ ] **Step 8: Commit**

```bash
git add src/playables/skill-chain/ package.json
git commit -m "$(cat <<'EOF'
skill-chain: define script types + default content + structural tests

Adds SkillChainScript types, the canonical DEFAULT_SCRIPT (3 rounds,
T1/T2/T3 lightning, skeletonKing boss), centralizes tunables in
config.ts, and locks the expected shape with 6 structural tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: PickScene — 3-card lightning-variant UI

**Goal:** A `PickScene` that displays 3 cards (each showing a variant name + lightning icon + tier rarity badge), waits for the player to tap one, then resolves its `done` promise with the index of the picked card. Includes the auto-advance fallback (Task 2 config: 5000ms).

**Files:**
- Create: `src/playables/skill-chain/scenes/PickScene.ts`
- Create: `src/playables/skill-chain/__tests__/PickScene.test.ts`
- Modify: `src/playables/skill-chain/__tests__/run.mjs` (add the new test file)

- [ ] **Step 1: Write the failing test**

Create `src/playables/skill-chain/__tests__/PickScene.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variantToRarityColor, tierToRarityName } from '../scenes/PickScene';

test('tierToRarityName maps T1→common, T2→legendary, T3→mythic', () => {
  assert.equal(tierToRarityName(1), 'common');
  assert.equal(tierToRarityName(2), 'legendary');
  assert.equal(tierToRarityName(3), 'mythic');
});

test('variantToRarityColor returns the canonical rarity hex per tier', () => {
  // Match board-fight's RARITY_COLORS map.
  assert.equal(variantToRarityColor(1), 0x888888); // common — grey
  assert.equal(variantToRarityColor(2), 0xff9a3c); // legendary — orange
  assert.equal(variantToRarityColor(3), 0xe04c4c); // mythic — red
});
```

Add `resolve(__dirname, 'PickScene.test.ts'),` to the test list in `run.mjs`.

Run: `npm run test:skill-chain`
Expected: FAIL — PickScene module does not export the helpers yet.

- [ ] **Step 2: Implement the PickScene module**

Create `src/playables/skill-chain/scenes/PickScene.ts`:

```ts
import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PickCardVariant } from '../SkillChainScript';
import { CONFIG } from '../config';

/** Single source of truth for tier→rarity vocab. Kept exported for tests. */
export function tierToRarityName(tier: 1 | 2 | 3): 'common' | 'legendary' | 'mythic' {
  if (tier === 1) return 'common';
  if (tier === 2) return 'legendary';
  return 'mythic';
}

/** Canonical hex colors per tier — mirrors board-fight/skills.ts RARITY_COLORS.
 *  Hardcoded here (rather than imported) so PickScene has no runtime dependency
 *  on a board-fight catalog module that pulls in spritesheets. */
export function variantToRarityColor(tier: 1 | 2 | 3): number {
  if (tier === 1) return 0x888888;
  if (tier === 2) return 0xff9a3c;
  return 0xe04c4c;
}

export interface PickSceneConfig {
  tier: 1 | 2 | 3;
  variants: [PickCardVariant, PickCardVariant, PickCardVariant];
}

const CARD_WIDTH_FRAC = 0.78;
const CARD_HEIGHT = 96;
const CARD_GAP = 14;

export class PickScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: (pickedIndex: number) => void;

  /** Set after the user picks (or auto-advance fires). Read by the Director
   *  to decide which card variant name to display in the chain HUD. */
  pickedIndex: number = -1;

  private cards: Container[] = [];
  private autoAdvanceElapsed = 0;
  private autoAdvanceMs: number;

  constructor(private cfg: PickSceneConfig, _ticker: Ticker, private width: number, private height: number) {
    this.container = new Container();
    this.autoAdvanceMs = CONFIG.pickAutoAdvanceMs;
    this.done = new Promise(resolve => {
      this.resolveDone = (i: number) => { this.pickedIndex = i; resolve(); };
    });
  }

  async enter(): Promise<void> {
    // Dim full-screen background
    const dim = new Graphics();
    dim.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.65 });
    this.container.addChild(dim);

    // Title
    const rarityColor = variantToRarityColor(this.cfg.tier);
    const rarityName = tierToRarityName(this.cfg.tier).toUpperCase();
    const title = new Text({
      text: `CHOOSE A ${rarityName} SKILL`,
      style: new TextStyle({
        fill: 0xffffff, fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 28, stroke: { color: 0x000000, width: 4 },
      }),
    });
    title.anchor.set(0.5);
    title.position.set(this.width / 2, this.height * 0.22);
    this.container.addChild(title);

    // Cards
    const cardW = this.width * CARD_WIDTH_FRAC;
    const totalH = CARD_HEIGHT * 3 + CARD_GAP * 2;
    const startY = this.height / 2 - totalH / 2;
    for (let i = 0; i < 3; i++) {
      const card = this.buildCard(this.cfg.variants[i], rarityColor, cardW);
      card.position.set(this.width / 2 - cardW / 2, startY + i * (CARD_HEIGHT + CARD_GAP));
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.on('pointertap', () => this.pick(i));
      this.cards.push(card);
      this.container.addChild(card);
    }
  }

  async exit(): Promise<void> {
    for (const c of this.cards) c.removeAllListeners();
    this.container.destroy({ children: true });
  }

  update(deltaMS: number): void {
    if (this.pickedIndex !== -1) return; // already picked
    this.autoAdvanceElapsed += deltaMS;
    if (this.autoAdvanceElapsed >= this.autoAdvanceMs) {
      this.pick(1); // center card
    }
  }

  pause(): void {}
  resume(): void {}
  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    // Pragmatic relayout: rebuild on resize. PickScene is on-screen for ≤5s,
    // a real resize during that window is vanishingly rare in ad contexts.
    // If it happens we re-enter the build path with current dims.
  }

  private pick(index: number): void {
    if (this.pickedIndex !== -1) return;
    this.resolveDone(index);
  }

  private buildCard(variant: PickCardVariant, accentColor: number, cardW: number): Container {
    const card = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, CARD_HEIGHT, 12)
      .fill({ color: 0x1a1f2c })
      .stroke({ color: accentColor, width: 3 });
    card.addChild(bg);

    // Left accent stripe
    const stripe = new Graphics();
    stripe.rect(0, 0, 8, CARD_HEIGHT).fill({ color: accentColor });
    card.addChild(stripe);

    // Variant name
    const name = new Text({
      text: variant.name,
      style: new TextStyle({
        fill: 0xffffff, fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 24, stroke: { color: 0x000000, width: 3 },
      }),
    });
    name.anchor.set(0, 0.5);
    name.position.set(28, CARD_HEIGHT / 2);
    card.addChild(name);
    return card;
  }
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npm run test:skill-chain`
Expected: All 8 tests pass (6 from Task 2 + 2 new).

- [ ] **Step 4: Commit**

```bash
git add src/playables/skill-chain/scenes/PickScene.ts src/playables/skill-chain/__tests__/PickScene.test.ts src/playables/skill-chain/__tests__/run.mjs
git commit -m "$(cat <<'EOF'
skill-chain: PickScene with 3-variant lightning cards + auto-advance

Implements the pick UI: dim overlay, tiered rarity-colored cards
(common/legendary/mythic), pointer-tap handler, and 5s center-card
auto-advance fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Director scaffolding — PlayerState, SceneManager wiring

**Goal:** Replace the boot-marker Text in `SkillChainDirector` with a real run loop: construct PlayerState from `script.initialState`, set up SceneManager, push a placeholder `PickScene` for round 0, and verify the pick scene tap resolves and prints to console.

**Files:**
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`

- [ ] **Step 1: Rewrite Director init to push a PickScene**

Replace the `init()` method's stage-label block with PickScene wiring. Update `SkillChainDirector.ts`:

```ts
import { Application, Ticker } from 'pixi.js';
import { SceneManager } from '@shared/SceneManager';
import type { PlayableLifecycle } from '@shared/PlayableType';
import { alTrack } from '@shared/alAnalytics';
import type { PlayerState } from '../board-fight/PlayerState';
import type { SkillChainScript } from './SkillChainScript';
import { PickScene } from './scenes/PickScene';

export class SkillChainDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private width: number;
  private height: number;
  private script: SkillChainScript;
  private state!: PlayerState;

  constructor(width: number, height: number, script: SkillChainScript) {
    this.width = width;
    this.height = height;
    this.script = script;
    this.app = new Application();
    this.ticker = new Ticker();
    void this.init();
  }

  private async init(): Promise<void> {
    alTrack('LOADING');
    await this.app.init({
      width: this.width, height: this.height, backgroundAlpha: 0,
      antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);
    this.sceneManager = new SceneManager(this.app.stage);
    this.ticker.add(t => this.sceneManager.update(t.deltaMS));
    this.ticker.start();
    this.state = this.buildPlayerState();

    alTrack('LOADED');
    alTrack('DISPLAYED');

    await this.runArc();
  }

  private buildPlayerState(): PlayerState {
    const init = this.script.initialState;
    return {
      hp: init.hp, maxHp: init.maxHp, atk: init.atk,
      skills: [],
      weapon: init.weapon, weaponConfig: init.weaponConfig, heroSkin: init.heroSkin,
      boardTileIndex: 0,
    };
  }

  /** Smoke-only for Task 4. Real arc is filled in Tasks 5-7. */
  private async runArc(): Promise<void> {
    const round = this.script.rounds[0];
    const pick = new PickScene({ tier: round.tier, variants: round.cardVariants }, this.ticker, this.width, this.height);
    await this.sceneManager.push(pick, 'replace');
    await pick.done;
    console.log(`[skill-chain] picked variant index = ${pick.pickedIndex}`);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.sceneManager?.layout(width, height);
  }
  pause(): void { this.ticker.stop(); }
  resume(): void { this.ticker.start(); }
  showEndCard(): void { /* Task 10 */ }
}
```

- [ ] **Step 2: Run dev server and verify pick**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Open: `http://localhost:3000/?type=skill-chain`
Expected: Pick screen renders — 3 grey-bordered cards "Chain Bolt / Fork Bolt / Heavenly Strike". Open DevTools console. Tap any card → console logs `[skill-chain] picked variant index = N`. Don't tap → 5 seconds later, auto-advance fires, console logs index 1.

- [ ] **Step 3: Commit**

```bash
git add src/playables/skill-chain/SkillChainDirector.ts
git commit -m "$(cat <<'EOF'
skill-chain: Director wires PickScene + PlayerState (smoke)

Round-0 PickScene now renders end-to-end; player tap (or 5s auto-
advance) resolves the scene's `done` promise. Real arc sequencing
follows in Task 5+.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Hook fight (basic-only, no skills)

**Goal:** Insert the 4-second hook fight before the first pick. Hero swings basic attack at a single `skeleton` and kills it; no skills are cast. Validates that we can configure and run a `FightScene` from `skill-chain`.

**Files:**
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`
- Create: `src/playables/skill-chain/compileFight.ts` (helper that compiles `FightSpec` → `FightSceneConfig`)
- Create: `src/playables/skill-chain/__tests__/compileFight.test.ts`
- Modify: `src/playables/skill-chain/__tests__/run.mjs`

- [ ] **Step 1: Write failing test for the compiler**

Create `src/playables/skill-chain/__tests__/compileFight.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFightSteps } from '../compileFight';
import { DEFAULT_SCRIPT } from '../defaultScript';

test('hookFight produces only attack steps (no skill steps)', () => {
  const steps = buildFightSteps(DEFAULT_SCRIPT.hookFight);
  const skillCount = steps.filter(s => s.type === 'skill').length;
  assert.equal(skillCount, 0);
  const attackCount = steps.filter(s => s.type === 'attack').length;
  assert.ok(attackCount > 0, 'expected at least one basic attack step');
});

test('round 1 fight produces exactly 3 skill steps (matches skillVolleys=3)', () => {
  const steps = buildFightSteps(DEFAULT_SCRIPT.rounds[0].fight);
  const skillSteps = steps.filter(s => s.type === 'skill');
  assert.equal(skillSteps.length, 3);
});

test('boss fight produces 7 skill steps (matches skillVolleys=7)', () => {
  const boss = DEFAULT_SCRIPT.rounds[2].fight;
  const steps = buildFightSteps(boss);
  const skillSteps = steps.filter(s => s.type === 'skill');
  assert.equal(skillSteps.length, 7);
});

test('boss fight inter-skill wait < standard wait (spam cadence)', () => {
  const stdSteps = buildFightSteps(DEFAULT_SCRIPT.rounds[0].fight);
  const stdWait = stdSteps.find(s => s.type === 'wait');
  const bossSteps = buildFightSteps(DEFAULT_SCRIPT.rounds[2].fight);
  const bossWait = bossSteps.find(s => s.type === 'wait');
  assert.ok(stdWait && bossWait);
  assert.ok((bossWait as any).ms < (stdWait as any).ms,
    `expected boss wait (${(bossWait as any).ms}ms) < standard (${(stdWait as any).ms}ms)`);
});
```

Add `resolve(__dirname, 'compileFight.test.ts'),` to the test list in `run.mjs`.

Run: `npm run test:skill-chain`
Expected: FAIL — `compileFight` module not found.

- [ ] **Step 2: Implement compileFight**

Create `src/playables/skill-chain/compileFight.ts`:

```ts
import type { FightStep } from '../board-fight/fight/FightStep';
import type { FightSpec } from './SkillChainScript';
import { CONFIG } from './config';

/**
 * Compile a high-level FightSpec into the low-level FightStep[] consumed by
 * FightEngine. The arc shape:
 *   - For each enemy: one player basic attack that lethal-kills it
 *     UNLESS `skillVolleys > 0`, in which case the killing blow is the LAST
 *     skill volley (so the visual finale is a bolt, not a sword swing).
 *   - skillVolleys × { skill, wait } steps before the basic finisher.
 *   - Inter-skill wait: bossVolleyGapMs for bossFight, otherwise standardVolleyGapMs.
 */
export function buildFightSteps(spec: FightSpec): FightStep[] {
  const steps: FightStep[] = [];
  const gapMs = spec.bossFight ? CONFIG.bossVolleyGapMs : CONFIG.standardVolleyGapMs;

  for (let v = 0; v < spec.skillVolleys; v++) {
    steps.push({
      type: 'skill',
      side: 'player',
      actor: 0,
      skillId: 'chainLightning',
      damage: spec.damagePerVolley,
    });
    if (v < spec.skillVolleys - 1) {
      steps.push({ type: 'wait', ms: gapMs });
    }
  }

  if (spec.basicOnly || spec.skillVolleys === 0) {
    // Basic attack finisher for each enemy.
    for (let i = 0; i < spec.enemies.length; i++) {
      steps.push({
        type: 'attack',
        side: 'player',
        actor: 0,
        target: i,
        category: 'basic',
        melee: true,
        damage: spec.enemies[i].hp + 5, // overkill so the step is the killer
      });
      steps.push({ type: 'die', side: 'enemy', actor: i });
    }
  } else {
    // After the last volley, push die-steps for any remaining enemies.
    // The last skill's `damage` is already authored to be lethal in the script.
    for (let i = 0; i < spec.enemies.length; i++) {
      steps.push({ type: 'die', side: 'enemy', actor: i });
    }
  }

  return steps;
}
```

Run: `npm run test:skill-chain`
Expected: All 12 tests pass.

- [ ] **Step 3: Wire FightScene into the Director — run the hook fight**

Modify `SkillChainDirector.ts`. Add imports:

```ts
import { FightScene } from '../board-fight/scenes/FightScene';
import type { FightSceneConfig } from '../board-fight/fight/FightStep';
import { heroBundle } from '../board-fight/catalog/heroes';
import { skeletonBundle } from '../board-fight/catalog/enemies/stage1/skeleton';
import { skeletonCommanderBundle } from '../board-fight/catalog/enemies/stage1/skeletonCommander';
import { skeletonArcherBundle } from '../board-fight/catalog/enemies/stage1/skeletonArcher';
import { skeletonKingBundle } from '../board-fight/catalog/enemies/stage1/skeletonKing';
import stage1Bg from 'assets/Backgrounds/battle1.webp';
import { buildFightSteps } from './compileFight';
import type { FightSpec, EnemySpec } from './SkillChainScript';
```

> **Note:** Before writing this code, verify the bundle exports + the stage1 BG path by inspecting `src/playables/board-fight/catalog/enemies/stage1/<file>.ts` and `src/playables/board-fight/catalog/battleBgs/stage1.ts`. Adjust the `import stage1Bg from …` line to mirror what `battleBgs/stage1.ts` re-exports (it may be wrapped in a module object — in that case import it from there instead).

Add a helper to map `EnemySpec.id` → bundle:

```ts
private enemyBundle(id: EnemySpec['id']) {
  if (id === 'skeleton') return skeletonBundle;
  if (id === 'skeletonCommander') return skeletonCommanderBundle;
  if (id === 'skeletonArcher') return skeletonArcherBundle;
  return skeletonKingBundle;
}

private compileFightConfig(spec: FightSpec): FightSceneConfig {
  return {
    players: [{ spine: heroBundle, maxHp: this.state.maxHp, hp: this.state.hp, melee: true }],
    enemies: spec.enemies.map(e => ({ spine: this.enemyBundle(e.id), maxHp: e.maxHp, hp: e.hp })),
    background: stage1Bg,
    steps: buildFightSteps(spec),
    bossFight: spec.bossFight ?? false,
  };
}

private async runFight(spec: FightSpec): Promise<void> {
  const cfg = this.compileFightConfig(spec);
  const scene = new FightScene(cfg, this.state, this.ticker, this.width, this.height);
  await this.sceneManager.push(scene, 'replace');
  await scene.done;
}
```

Replace `runArc()`:

```ts
private async runArc(): Promise<void> {
  await this.runFight(this.script.hookFight);
  // Pick + later fights wired in Tasks 6-7.
  const round0 = this.script.rounds[0];
  const pick = new PickScene({ tier: round0.tier, variants: round0.cardVariants }, this.ticker, this.width, this.height);
  await this.sceneManager.push(pick, 'replace');
  await pick.done;
  console.log(`[skill-chain] picked variant index = ${pick.pickedIndex}`);
}
```

- [ ] **Step 4: Run dev server, verify hook fight plays**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Open: `http://localhost:3000/?type=skill-chain`
Expected sequence:
1. Battle background loads (stage1).
2. Hero + 1 skeleton slide in from off-screen.
3. Hero performs one melee swing → skeleton dies → "VICTORY!" label.
4. Pick screen appears.

If the hero is missing or the BG fails to load: check the import paths flagged in Step 3's note. Common cause is the `stage1Bg` path — it must match the actual webpack `import` that `battleBgs/stage1.ts` uses.

- [ ] **Step 5: Commit**

```bash
git add src/playables/skill-chain/
git commit -m "$(cat <<'EOF'
skill-chain: hook fight + FightSpec→FightStep compiler

buildFightSteps() translates the high-level fight spec into the
script-driven FightStep[] consumed by FightEngine. Hook fight (basic-
only) now plays before the first pick. Compiler is covered by 4
structural tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Round 1 + Round 2 — pick unlocks skill, fight uses it

**Goal:** After each pick, the Director pushes the granted skill ID into `state.skills`, then runs the round's fight. T1 fights show `chainLightning` VFX; T2 fights auto-add splash electricity (chainLightning handler reads `state.skills`).

**Files:**
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`

- [ ] **Step 1: Generalize runArc to loop over rounds 0 and 1**

Replace `runArc()`:

```ts
private async runArc(): Promise<void> {
  await this.runFight(this.script.hookFight);
  for (let r = 0; r < 2; r++) {
    const round = this.script.rounds[r];
    await this.runPick(round.tier, round.cardVariants);
    this.state.skills.push(round.grantSkill);
    await this.runFight(round.fight);
  }
  // Round 2 (boss) wired in Task 7.
}

private async runPick(tier: 1 | 2 | 3, variants: SkillChainScript['rounds'][number]['cardVariants']): Promise<void> {
  const pick = new PickScene({ tier, variants }, this.ticker, this.width, this.height);
  await this.sceneManager.push(pick, 'replace');
  await pick.done;
}
```

The `SkillChainScript` import is already present; you may need to widen it to include the rounds-derived type or just use `import type { PickCardVariant }` and the tuple type directly.

- [ ] **Step 2: Run dev, watch hookFight → pick1 → fight1 → pick2 → fight2**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Open: `http://localhost:3000/?type=skill-chain`
Expected sequence:
1. Hook fight: hero kills skeleton (basic attack).
2. Pick 1: 3 grey-bordered cards. Tap one.
3. Fight 1: `skeletonCommander` enters. Hero auto-casts `chainLightning` 3 times — small blue bolts hit the enemy with a slight delay between volleys. Enemy dies.
4. Pick 2: 3 orange-bordered cards. Tap one.
5. Fight 2: `skeletonArcher + skeleton` enter. Hero casts `chainLightning` 4 times — each cast now adds **splash electricity** sprites on hit (because `state.skills` now contains `thunderstorm`). Enemies die.

If the splash doesn't appear in fight 2: in DevTools console, type `__debugHero` — should print a Spine instance. Then check that `state.skills` has been updated. The fastest check is to add a temporary `console.log('skills:', this.state.skills)` line right before `this.runFight(round.fight)`.

- [ ] **Step 3: Commit**

```bash
git add src/playables/skill-chain/SkillChainDirector.ts
git commit -m "$(cat <<'EOF'
skill-chain: rounds 1+2 (T1 chainLightning, T2 +thunderstorm splash)

Director now loops pick→grantSkill→fight for the first two rounds.
chainLightning VFX auto-detects thunderstorm in state.skills and
adds electricity-splash on hit (existing board-fight behavior, no
new VFX code).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Round 3 (boss) + spam cadence

**Goal:** After the second fight, run round 3: pick 3 (mythic-red T3), grant `thunderGod`, then the boss fight. Boss is `skeletonKing` with `bossFight: true` (triggers the VS intro). Hero spams 7 skill volleys at 350ms cadence; the chainLightning handler now uses the **mega bolt** effect (because `state.skills` includes `thunderGod`).

**Files:**
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`

- [ ] **Step 1: Extend runArc to all 3 rounds**

Change the loop bound from `r < 2` to `r < this.script.rounds.length`:

```ts
for (let r = 0; r < this.script.rounds.length; r++) {
  const round = this.script.rounds[r];
  await this.runPick(round.tier, round.cardVariants);
  this.state.skills.push(round.grantSkill);
  await this.runFight(round.fight);
}
console.log('[skill-chain] arc complete');
```

- [ ] **Step 2: Run dev, verify boss fight plays at spam cadence**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Expected (after 2 prior rounds):
1. Pick 3: 3 red-bordered cards. Tap.
2. VS intro: blue/red diagonal screen with hero + skeletonKing crash in. "VS" text slams. 600ms hold.
3. Boss fight: `skeletonKing` faces hero. Within ~7 seconds, the hero casts the mega-bolt VFX (`thunderGod`) 7 times in rapid succession — bolts AND splash AND mega flash compound. King dies. "VICTORY!".
4. Console logs `[skill-chain] arc complete`.

Verify the boss takes ~5–7 volleys to die — count the volleys visually. If it dies in 2-3, lower `damagePerVolley` in `defaultScript.ts` round 2. If it survives all 7, raise it or lower `enemies[0].hp`.

- [ ] **Step 3: Commit**

```bash
git add src/playables/skill-chain/SkillChainDirector.ts
git commit -m "$(cat <<'EOF'
skill-chain: round 3 boss (skeletonKing) at spam cadence

Final round: thunderGod unlocks mega-bolt VFX via chainLightning's
playerState.skills check. 7 skill steps at 350ms gap = spammy bolt
rain that takes ~5-7 volleys to drop the boss.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ChainHud — 3-slot tier indicator

**Goal:** A small UI overlay at the top of the screen showing 3 ⚡ slots. Slot N lights up (filled + colored) when `state.skills` contains the tier-N skill. After T3 unlock, the whole bar pulses.

**Files:**
- Create: `src/playables/skill-chain/ui/ChainHud.ts`
- Create: `src/playables/skill-chain/__tests__/ChainHud.test.ts`
- Modify: `src/playables/skill-chain/__tests__/run.mjs`
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`

- [ ] **Step 1: Write failing test for the tier-state helper**

Create `src/playables/skill-chain/__tests__/ChainHud.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlockedTiers } from '../ui/ChainHud';

test('unlockedTiers returns 0 when no lightning skills', () => {
  assert.equal(unlockedTiers([]), 0);
  assert.equal(unlockedTiers(['fireballBarrage']), 0);
});

test('unlockedTiers returns 1 with only chainLightning', () => {
  assert.equal(unlockedTiers(['chainLightning']), 1);
});

test('unlockedTiers returns 2 with chainLightning+thunderstorm', () => {
  assert.equal(unlockedTiers(['chainLightning', 'thunderstorm']), 2);
});

test('unlockedTiers returns 3 with the full chain', () => {
  assert.equal(unlockedTiers(['chainLightning', 'thunderstorm', 'thunderGod']), 3);
});

test('unlockedTiers is order-insensitive', () => {
  assert.equal(unlockedTiers(['thunderGod', 'chainLightning', 'thunderstorm']), 3);
});
```

Add `resolve(__dirname, 'ChainHud.test.ts'),` to the test list in `run.mjs`.

Run: `npm run test:skill-chain`
Expected: FAIL — `ChainHud` module not found.

- [ ] **Step 2: Implement ChainHud**

Create `src/playables/skill-chain/ui/ChainHud.ts`:

```ts
import { Container, Graphics, Ticker } from 'pixi.js';

const TIER_SKILLS = ['chainLightning', 'thunderstorm', 'thunderGod'] as const;

/** Pure helper — given a list of skill IDs, return the highest unlocked tier (0-3). */
export function unlockedTiers(skills: readonly string[]): 0 | 1 | 2 | 3 {
  let max: 0 | 1 | 2 | 3 = 0;
  if (skills.includes(TIER_SKILLS[0])) max = 1;
  if (skills.includes(TIER_SKILLS[1])) max = 2;
  if (skills.includes(TIER_SKILLS[2])) max = 3;
  return max;
}

const SLOT_SIZE = 36;
const SLOT_GAP = 10;
const TIER_COLORS = [0x888888, 0xff9a3c, 0xe04c4c] as const;
const PULSE_PERIOD_MS = 600;

export class ChainHud {
  readonly container: Container;
  private slots: Graphics[] = [];
  private width = 0;
  private currentTiers: 0 | 1 | 2 | 3 = 0;
  private pulseT = 0;

  constructor(private ticker: Ticker) {
    this.container = new Container();
    for (let i = 0; i < 3; i++) {
      const slot = new Graphics();
      this.container.addChild(slot);
      this.slots.push(slot);
    }
    this.draw();
    this.ticker.add(this.tick);
  }

  layout(width: number, _height: number): void {
    this.width = width;
    const totalW = SLOT_SIZE * 3 + SLOT_GAP * 2;
    const startX = width / 2 - totalW / 2;
    for (let i = 0; i < 3; i++) {
      this.slots[i].position.set(startX + i * (SLOT_SIZE + SLOT_GAP), 18);
    }
  }

  /** Call whenever state.skills changes. */
  setTiers(unlocked: 0 | 1 | 2 | 3): void {
    this.currentTiers = unlocked;
    this.draw();
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.container.destroy({ children: true });
  }

  private tick = (t: Ticker): void => {
    if (this.currentTiers < 3) return;
    this.pulseT = (this.pulseT + t.deltaMS) % PULSE_PERIOD_MS;
    const phase = Math.sin((this.pulseT / PULSE_PERIOD_MS) * Math.PI * 2);
    const scale = 1 + 0.08 * phase;
    this.container.scale.set(scale);
  };

  private draw(): void {
    for (let i = 0; i < 3; i++) {
      const slot = this.slots[i];
      slot.clear();
      const unlocked = i < this.currentTiers;
      const color = unlocked ? TIER_COLORS[i] : 0x333333;
      slot.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 6).fill({ color, alpha: unlocked ? 1 : 0.5 });
      slot.stroke({ color: 0xffffff, width: 2, alpha: unlocked ? 1 : 0.4 });
    }
  }
}
```

Run: `npm run test:skill-chain`
Expected: All 17 tests pass.

- [ ] **Step 3: Mount ChainHud in the Director**

Modify `SkillChainDirector.ts`. Add the import:

```ts
import { ChainHud } from './ui/ChainHud';
import { unlockedTiers } from './ui/ChainHud';
```

In `init()`, after `this.state = this.buildPlayerState();`:

```ts
this.chainHud = new ChainHud(this.ticker);
this.app.stage.addChild(this.chainHud.container);
this.chainHud.layout(this.width, this.height);
```

Add field: `private chainHud!: ChainHud;`

In `resize()`, after the existing relayout lines:

```ts
this.chainHud?.layout(width, height);
```

In `runArc()`, after each `this.state.skills.push(...)`:

```ts
this.chainHud.setTiers(unlockedTiers(this.state.skills));
```

- [ ] **Step 4: Run dev, verify HUD lights tier-by-tier**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Expected:
- During hook fight: 3 dark/empty slots at top of screen.
- After pick 1: first slot turns grey-filled.
- After pick 2: first two slots filled (grey, then orange).
- After pick 3: all 3 filled (grey, orange, red) — entire HUD pulses gently.

- [ ] **Step 5: Commit**

```bash
git add src/playables/skill-chain/ui/ChainHud.ts src/playables/skill-chain/__tests__/ChainHud.test.ts src/playables/skill-chain/__tests__/run.mjs src/playables/skill-chain/SkillChainDirector.ts
git commit -m "$(cat <<'EOF'
skill-chain: ChainHud — top-screen 3-slot tier indicator

Three slots fill in rarity-tier color (grey/orange/red) as the
player unlocks T1/T2/T3 skills. After T3 the whole bar pulses
continuously. Pure tier-detection helper covered by 5 tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: HeroAuraLayer — per-tier hero glow

**Goal:** A sibling `Container` placed behind the hero in the battle stage, rendering a radial glow whose color matches the highest unlocked tier (blue → cyan → white). The aura is attached during fight enter and removed on fight exit.

**Files:**
- Create: `src/playables/skill-chain/ui/HeroAuraLayer.ts`
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`

> **Note:** `FightScene` does not expose a hook for "got the hero spine, here you go" — the hero is created internally by `FightEngine.init()`. To attach the aura without forking `FightScene`, the easiest approach is: after `sceneManager.push(scene, 'replace')` and `await scene.done`, the aura was managed via a CONTAINER added to the SAME stage as the fight scene. Place the aura on `app.stage` at a position aligned with the hero's stage coordinates (player x ≈ width * 0.28, y ≈ battleH * 0.88; see `FightEngine` PLAYER_X_FRAC/CHARACTER_Y_FRAC constants). The aura is a radial gradient, not a Spine-bound effect, so absolute positioning is fine.

- [ ] **Step 1: Build the aura layer**

Create `src/playables/skill-chain/ui/HeroAuraLayer.ts`:

```ts
import { Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js';
import { CONFIG } from '../config';

/** Returns a 256×256 radial-gradient sprite tinted by hex color.
 *  Memoized texture so repeat tints reuse the same alpha mask. */
let gradientTexture: Texture | null = null;
function getGradient(): Texture {
  if (gradientTexture) return gradientTexture;
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  gradientTexture = Texture.from(canvas);
  return gradientTexture;
}

const BATTLE_AREA_RATIO = 0.55;
const PLAYER_X_FRAC = 0.28;
const CHARACTER_Y_FRAC = 0.88;
const PULSE_PERIOD_MS = 1000;

export class HeroAuraLayer {
  readonly container: Container;
  private sprite: Sprite;
  private currentTier: 0 | 1 | 2 | 3 = 0;
  private targetAlpha = 0;
  private pulseT = 0;

  constructor(private ticker: Ticker) {
    this.container = new Container();
    this.sprite = new Sprite(getGradient());
    this.sprite.anchor.set(0.5);
    this.sprite.alpha = 0;
    this.sprite.width = 280;
    this.sprite.height = 280;
    this.container.addChild(this.sprite);
    this.ticker.add(this.tick);
  }

  layout(width: number, height: number): void {
    const battleH = height * BATTLE_AREA_RATIO;
    this.sprite.position.set(width * PLAYER_X_FRAC, battleH * CHARACTER_Y_FRAC);
  }

  setTier(tier: 0 | 1 | 2 | 3): void {
    this.currentTier = tier;
    const colorKey = `t${tier}` as keyof typeof CONFIG.auraColors;
    const color = CONFIG.auraColors[colorKey];
    if (color == null) {
      this.targetAlpha = 0;
      return;
    }
    this.sprite.tint = color;
    this.targetAlpha = tier === 1 ? 0.45 : tier === 2 ? 0.7 : 0.95;
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.container.destroy({ children: true });
  }

  private tick = (t: Ticker): void => {
    // Smooth alpha ramp toward targetAlpha.
    const delta = (this.targetAlpha - this.sprite.alpha);
    this.sprite.alpha += delta * Math.min(1, t.deltaMS / 250);

    if (this.currentTier === 0) return;
    this.pulseT = (this.pulseT + t.deltaMS) % PULSE_PERIOD_MS;
    const phase = Math.sin((this.pulseT / PULSE_PERIOD_MS) * Math.PI * 2);
    const wobble = 1 + 0.08 * phase * this.currentTier; // larger pulse at higher tiers
    this.sprite.scale.set(wobble);
  };
}
```

- [ ] **Step 2: Mount in Director and update tier on each pick**

Modify `SkillChainDirector.ts`. Add the import:

```ts
import { HeroAuraLayer } from './ui/HeroAuraLayer';
```

Add field: `private auraLayer!: HeroAuraLayer;`

In `init()`, right after the ChainHud creation:

```ts
this.auraLayer = new HeroAuraLayer(this.ticker);
this.app.stage.addChildAt(this.auraLayer.container, 0); // below scenes
this.auraLayer.layout(this.width, this.height);
```

In `resize()`:

```ts
this.auraLayer?.layout(width, height);
```

In `runArc()`, after each `this.chainHud.setTiers(...)`:

```ts
this.auraLayer.setTier(unlockedTiers(this.state.skills));
```

- [ ] **Step 3: Run dev, verify aura escalates**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Expected:
- Hook fight: no aura under hero.
- After pick 1: soft blue glow appears beneath hero. Subtle pulse.
- After pick 2: glow shifts to cyan, larger pulse.
- After pick 3 / boss fight: blinding white glow around hero, strong pulse.

**Tuning note:** if the aura sits visibly above or below the hero's feet, adjust the `PLAYER_X_FRAC` / `CHARACTER_Y_FRAC` constants at the top of `HeroAuraLayer.ts` to match what `FightEngine.layoutActors()` is using at the time. The current values mirror `FightEngine`'s defaults; per-actor `xFrac`/`yFrac` overrides would shift this.

- [ ] **Step 4: Commit**

```bash
git add src/playables/skill-chain/ui/HeroAuraLayer.ts src/playables/skill-chain/SkillChainDirector.ts
git commit -m "$(cat <<'EOF'
skill-chain: HeroAuraLayer — per-tier glow under hero

Radial gradient sprite tinted by tier (blue/cyan/white), smoothly
ramps in alpha, pulses harder at higher tiers. Positioned to match
FightEngine's PLAYER_X_FRAC / CHARACTER_Y_FRAC defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: End card + CTA

**Goal:** After the boss fight resolves, show the shared `EndCardScene` (same splash image + logo as dice-blackjack). Tapping the end card calls `sdk.install()`. Wire `lifecycle.showEndCard()` to the same code path so `sdk.on('finish')` from `src/index.ts` works.

**Files:**
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`

- [ ] **Step 1: Wire end card in the Director**

Modify `SkillChainDirector.ts`. Add imports:

```ts
import { EndCardScene } from '../end_card/EndCardScene';
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';
```

Add fields:

```ts
private endCardShown = false;
private gameFinished = false;
```

After the for-loop in `runArc()`:

```ts
this.gameFinished = true;
this.showEndCard();
```

Replace `showEndCard()`:

```ts
showEndCard(): void {
  if (this.endCardShown) return;
  if (!this.gameFinished) return; // mirror dice-blackjack's gate
  this.endCardShown = true;
  const endCard = new EndCardScene({ splashImage, logoImage }, this.width, this.height);
  void this.sceneManager.push(endCard, 'replace');
}
```

- [ ] **Step 2: Run dev, verify end card + CTA**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Expected:
1. Play through to the boss fight.
2. After boss dies + VICTORY label, the end card mounts: splash background + RougeLegend logo + "Tap to Install" CTA (whatever `EndCardScene` renders).
3. Tap → in dev mode, sdk.install logs to console (no actual app store open).

If `EndCardScene`'s constructor signature differs from `({ splashImage, logoImage }, width, height)`: open `src/playables/end_card/EndCardScene.ts` and copy the actual exported constructor signature.

- [ ] **Step 3: Commit**

```bash
git add src/playables/skill-chain/SkillChainDirector.ts
git commit -m "$(cat <<'EOF'
skill-chain: end card + CTA on arc completion

Mirrors dice-blackjack's gameFinished gate so spurious SDK 'finish'
events during the arc don't pre-mount the end card. End card itself
is the shared EndCardScene with the live-game splash + logo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Audio — BGM + lightning SFX

**Goal:** Play the existing board-fight BGM during the arc, ducking under SDK volume. The lightning skill SFX is already fired internally by `chainLightning.ts` via the shared `sfx` module — verify it plays. Add a one-off win stinger after the boss dies. Mute until first user gesture (iOS-safe).

**Files:**
- Modify: `src/playables/skill-chain/SkillChainDirector.ts`

- [ ] **Step 1: Inspect what board-fight's sfx module exports**

Read `src/playables/board-fight/sfx.ts` (top ~40 lines). Note the available functions: there should be at least `playMusic`, `pauseMusic`, `resumeMusic`, `setMusicVolume`, and per-event functions like `swordHit`, `death`, `damage`, etc. The lightning-burst SFX is already triggered inside `chainLightning.ts` if it calls into this module. If not, we don't add one — the existing electricity sprite + flash overlay carry the audio-visual punch.

- [ ] **Step 2: Wire BGM in the Director**

Modify `SkillChainDirector.ts`. Add imports:

```ts
import { playMusic, pauseMusic, resumeMusic, setMusicVolume } from '../board-fight/sfx';
import musicData from 'assets/Audio/Level1_Compressed_Theme.mp3';
```

In `init()`, after the canvas is attached but before `await this.runArc()`:

```ts
playMusic(musicData, 0.5);
```

In `pause()`:

```ts
pause(): void {
  this.ticker.stop();
  pauseMusic();
}

resume(): void {
  this.ticker.start();
  resumeMusic();
}
```

If `playMusic`'s actual signature differs (it might take just the data URL and a separate `setMusicVolume` call after), inspect the sfx module and adapt the two-line call to match.

- [ ] **Step 3: Bridge SDK volume**

In `init()`, after `playMusic(...)`:

```ts
// Mirror the SDK volume into BGM gain.
const initialVol = (window as any)?.sdk?.volume ?? 0.6;
setMusicVolume(Math.min(initialVol, 0.6));
```

The SDK's `volume` event is wired in `src/index.ts` via `sdk.on('volume', …)` — but the existing router doesn't forward it. For now, the initial volume is enough; a follow-up could add a `setVolume` method on `PlayableLifecycle` similar to BlackjackDirector and have `src/index.ts` forward `sdk.on('volume')` to it.

- [ ] **Step 4: Run dev, verify audio**

Run: `npm run dev:variant -- --type skill-chain demo dev`
Expected:
- Tap once on the page to give it a user gesture (browser autoplay guard).
- BGM starts playing from the hook fight onward.
- During fights, hear sword swings on basic attacks and lightning flashes/electricity zaps on skill casts.
- Pause via DevTools (or letting the SDK fire pause) silences the music.

- [ ] **Step 5: Commit**

```bash
git add src/playables/skill-chain/SkillChainDirector.ts
git commit -m "$(cat <<'EOF'
skill-chain: BGM via shared sfx module + pause/resume bridge

Plays the live-game Level1 theme through board-fight's sfx engine
(WebAudio, iOS-safe). Skill SFX rides on the existing chainLightning
handler. CTA stinger left as a future polish item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Build verification — all 3 ad networks, size check, viewport sweep

**Goal:** Produce production HTML bundles for AppLovin, Unity, and Google. Verify each is under 5 MB. Manually open each in a browser at 3 viewport sizes (iPhone SE 375×667, iPhone 14 390×844, Pixel 7 412×915) and confirm the arc plays end-to-end. Tune boss HP if it consistently dies in fewer than 5 volleys or survives all 7.

**Files:**
- Modify: `src/playables/skill-chain/defaultScript.ts` (only if tuning is needed)

- [ ] **Step 1: Build for AppLovin**

Run: `npm run build:variant -- --type skill-chain demo build applovin`
Expected: Compilation succeeds; produces `dist/AppLovin/<filename>.html`.

Check size:
```bash
ls -lh dist/AppLovin/*.html | grep skill-chain
```
Expected: size < 5 MB. If over, the largest contributor is typically the hero Spine PNG — but skill-chain reuses what board-fight already ships, so the size should mirror a minimal board-fight variant (~3-4 MB).

- [ ] **Step 2: Build for Unity + Google**

```bash
npm run build:variant -- --type skill-chain demo build unity
npm run build:variant -- --type skill-chain demo build google
```
Expected: Both succeed; produce equivalent HTML files in `dist/Unity/` and `dist/Google/`.

- [ ] **Step 3: Manual viewport sweep**

Open each built HTML in Chrome DevTools device-mode at:
- iPhone SE — 375 × 667
- iPhone 14 — 390 × 844
- Pixel 7 — 412 × 915

For each: refresh, tap to start audio, watch the arc to completion. Verify:
- No clipped UI (HUD, pick cards, end card)
- Hero aura sits under the hero (not floating)
- Boss fight visibly shows ≥ 5 skill volleys before kill

- [ ] **Step 4: Tune boss HP if needed**

If the boss died in fewer than 5 volleys: raise `enemies[0].hp` and `enemies[0].maxHp` in `defaultScript.ts` round 2 by +20% increments.
If it survived all 7: lower it by 10%.
After tuning, re-run Step 1 and confirm.

Commit any tuning change:

```bash
git add src/playables/skill-chain/defaultScript.ts
git commit -m "$(cat <<'EOF'
skill-chain: tune boss HP after playtest sweep

Adjusts skeletonKing HP so the boss visibly takes ~5-7 volleys
across iPhone SE / iPhone 14 / Pixel 7 viewports.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Final test pass**

Run: `npm run test:skill-chain`
Expected: All 17 tests pass.

- [ ] **Step 6: PR-ready state**

Print the final summary:
```bash
git log --oneline main..HEAD
ls -lh dist/AppLovin/*.html dist/Unity/*.html dist/Google/*.html | grep skill-chain
```
Expected: ~12 commits on top of main; 3 HTML files all under 5 MB.

---

## Plan self-review

1. **Spec coverage:**
   - Pitch + loop → Tasks 5, 6, 7 implement the fight sequence; Tasks 3, 4 implement the picks.
   - Visual escalation (homing bolts, hero aura, chain HUD, boss tuning) → Task 7 (boss spam), Task 8 (HUD), Task 9 (aura), Task 12 (boss HP tuning). Auto-spam (watch only) is the default for FightEngine.
   - Architecture (`src/playables/skill-chain/` reusing board-fight via `../`) → established in Tasks 1, 5; matches spec.
   - Pacing & tunables → Task 2 (`config.ts`).
   - Success criteria → Task 12 (build + viewport sweep + size); Tasks 11 (audio).
   - Out of scope items (family choice, tap-to-spam, multi-boss, hero variants, variant build system) → no tasks; correct.

2. **Placeholder scan:** No TBD/TODO. Audio task notes "verify in sfx.ts" but that's an inspection step with a concrete fallback ("we don't add one"). Aura tuning note in Task 9 is a verification step, not a placeholder.

3. **Type consistency:**
   - `unlockedTiers` returns `0 | 1 | 2 | 3` — used consistently in Tasks 8, 9.
   - `SkillChainScript.rounds[number].tier` is `1 | 2 | 3` — `PickScene` and helpers expect the same.
   - `EnemySpec.id` literal union matches `enemyBundle()` switch in Task 5.

No issues to fix.

---

## Risks & open questions surfaced during plan-writing

1. **`stage1Bg` import path** — Task 5 imports `assets/Backgrounds/battle1.webp` based on the spec's mention. The actual webpack-importable path lives in `src/playables/board-fight/catalog/battleBgs/stage1.ts`. The Task 5 note instructs to re-export from that module if the direct path differs.

2. **`EndCardScene` constructor signature** — Task 10 assumes `({ splashImage, logoImage }, width, height)` from dice-blackjack's usage. The Task 10 note has a fallback if signatures don't match.

3. **`playMusic` API** — Task 11 assumes a `playMusic(data, volume)` signature. If `sfx.ts` only exports `setMusicVolume`/`pauseMusic`/`resumeMusic` and the music start is automatic on `setMusicVolume`, adapt accordingly.

4. **Boss HP tuning** — first-pass numbers (380 HP, 60 dmg × 7 volleys) are estimates; final tuning happens in Task 12 with eyes on a real run.

None of these block the plan; each has an inline fallback path.
