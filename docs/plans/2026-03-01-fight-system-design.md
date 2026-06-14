# Fight System Design — Orchestrated Combat

## Goal

Replace the current FightScene shell (idle characters + timer) with a fully choreographed combat system. Every beat is scripted via config: who attacks, what damage numbers show, when skills fire, when enemies die. It looks like a real fight but is a precisely directed sequence.

## Design Principles

- **Orchestrated, not simulated** — no real damage calc, no RNG combat. The config defines what happens.
- **Flat step list** — no round structure. Each step plays sequentially, giving full creative control over pacing.
- **Adaptive skills** — skill steps resolve to whatever the player actually learned. The VFX adapts, total damage stays close to config value.
- **Light randomness** — damage numbers jitter ±15%, some steps can shuffle order within a group. Keeps replays feeling fresh.
- **Unique skill VFX** — each skill has its own visual handler, not a generic tinted flash.

## Config Shape

### ActorConfig

```ts
interface SpineAssetBundle {
  atlasRaw: string;
  jsonRaw: string;
  pngData: string;
}

interface ActorConfig {
  spine: SpineAssetBundle;
  skin?: string;
  maxHp: number;
  hp?: number;              // defaults to maxHp if omitted
  maxRage?: number;         // if set, shows a rage bar (hero only)
  melee?: boolean;          // if true, attacks default to melee approach (per-step overrides)
  position?: number;        // layout slot within its side (0=front, 1=back...)
  weaponEnchant?: string;   // optional skill ID — adds persistent glow to weapon (e.g. 'iceWeapon')
}
```

**Note:** The `role` (hero/pet/enemy) is derived from which array the actor lives in — `players[0]` is always the hero, `players[1+]` are pets, `enemies[*]` are enemies. No explicit `role` field needed.

**Hero auto-inherit:** For `players[0]` (the hero), `hp` and `maxHp` default from `PlayerState` if omitted from the config. The config can still override for scripted scenarios. `weaponEnchant` resolves against `PlayerState.skills` at runtime.

### FightSceneConfig

```ts
interface FightSceneConfig {
  players: ActorConfig[];   // [0]=hero, [1+]=pets
  enemies: ActorConfig[];   // [0]=front, [1+]=back
  damageVariance?: number;  // default 0.15 (±15%)
  steps: FightStep[];
  onVictory?: {
    labelText?: string;       // default "VICTORY!"
    holdMs?: number;          // how long to hold before resolving done (default 1500ms)
  };
}
```

### FightStep (discriminated union)

```ts
type AttackCategory = 'basic' | 'combo' | 'counter' | 'rage';

type FightStep =
  | { type: 'attack'; side: 'player' | 'enemy';  // which side the actor belongs to (required)
      actor: number; target: number;
      targetSide?: 'player' | 'enemy';  // default: opposite of side
      category?: AttackCategory;         // default: 'basic'
      damage?: number; crit?: boolean; melee?: boolean;  // melee inherits from ActorConfig if omitted
      return?: boolean;                  // default true; set false to stay at target (for combo chains)
      dodge?: boolean;                   // target dodges — no damage, sidestep anim + "Dodge!" text
      dramatic?: boolean;                // screen darkening for dramatic attacks (rage, ultimates)
      rageFill?: number;                 // add this much rage to actor's rage bar
      hpChanges?: number[];              // indexed into target-side array
      group?: string; }
  | { type: 'skill'; side: 'player' | 'enemy';
      actor: number; target?: number;
      targetSide?: 'player' | 'enemy';
      skillId?: string;                  // specific skill, OR:
      usePlayerSkill?: true;             // pick from player's learned skills
      damage?: number; crit?: boolean;
      dramatic?: boolean;
      hpChanges?: number[];
      group?: string; }
  | { type: 'status'; target: number;
      side?: 'player' | 'enemy';         // default: enemy
      effect: string;                    // 'burn' | 'freeze' | 'poison' | 'bleed' | etc.
      stacks: number;                    // 0 = remove effect
      loopVfx?: string; }               // optional looping VFX on the actor (e.g. freeze tint, burn particles)
  | { type: 'die'; actor: number;
      side?: 'player' | 'enemy'; }       // default: enemy
  | { type: 'wait'; ms: number; }
  | { type: 'label'; text: string;
      actor?: number;                    // if set, floats above this actor; otherwise screen center
      side?: 'player' | 'enemy'; }       // which side the actor is on
```

### Actor referencing

- **`side`** field on `attack` and `skill` steps identifies which array the `actor` belongs to (`'player'` → `players[]`, `'enemy'` → `enemies[]`).
- **`actor`** is the index within that side's array.
- **`target`** indexes into the **opposite** side by default. Override with `targetSide` for same-side targeting (e.g. pet heals hero).
- **`melee`** on a step inherits from the actor's `ActorConfig.melee` if omitted. Per-step value overrides.

### Damage / HP inference

Both `damage` and `hpChanges` are optional. The engine infers the missing one:

| damage | hpChanges | Behavior |
|--------|-----------|----------|
| set    | omitted   | HP auto-decremented by damage amount |
| omitted| set       | Damage number = delta from current HP to new HP |
| set    | set       | Both used as-is (full manual control) |
| omitted| omitted   | Visual-only step (animation plays, no numbers) |

When `dodge: true`, `damage`, `hpChanges`, `crit`, and `rageFill` are ignored.

### Dead actor handling

The engine tracks a `dead` flag per actor. Steps targeting a dead actor are **skipped silently** (with a console warning in dev mode). This prevents config ordering mistakes from crashing the engine.

### Example config

```ts
const fightConfig: FightSceneConfig = {
  players: [
    { spine: heroBundle, skin: 'Base', maxRage: 100, melee: true },  // hp from PlayerState
    { spine: fireSpiritBundle, maxHp: 1200 },
  ],
  enemies: [
    { spine: skeletonBundle, skin: 'default', maxHp: 3000 },
    { spine: spiderBundle, maxHp: 1500 },
  ],
  damageVariance: 0.15,
  steps: [
    // Hero attacks skeleton, stays at target for combo chain
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 500, return: false, rageFill: 30 },
    // Combo attack — hero is already at enemy, hits again, then returns
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 300, category: 'combo' },
    // Hero's learned skill fires
    { type: 'skill', side: 'player', actor: 0, usePlayerSkill: true, target: 0, damage: 200 },
    // Pet attacks spider
    { type: 'attack', side: 'player', actor: 1, target: 1, damage: 150 },
    // Skeleton attacks hero, hero dodges
    { type: 'attack', side: 'enemy', actor: 0, target: 0, dodge: true },
    // Skeleton attacks hero again, this time hits
    { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 120 },
    // Apply freeze to skeleton from ice weapon proc
    { type: 'status', target: 0, effect: 'freeze', stacks: 2, loopVfx: 'freezeTint' },
    // Spider dies
    { type: 'die', actor: 1 },
    // Hero rage attack — dramatic screen darkening
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 800, category: 'rage', dramatic: true, crit: true },
    // Skeleton dies
    { type: 'die', actor: 0 },
  ],
  onVictory: { labelText: 'VICTORY!', holdMs: 1500 },
};
```

## Execution Engine

### FightEngine class

```
FightEngine
  ├─ players: FightActor[]      (SpineCharacter + HpBar + RageBar + runtime state)
  ├─ enemies: FightActor[]
  ├─ state: PlayerState          (for skill resolution, hero HP sync)
  ├─ config: FightSceneConfig
  ├─ skillIconBar: SkillIconBar  (learned skill icons)
  └─ run(): Promise<void>
```

### Lifecycle

1. **`prepareSteps()`** — runs once before the fight loop:
   - Auto-inherit hero HP/maxHP from PlayerState if omitted
   - Resolve `weaponEnchant` against PlayerState.skills
   - Shuffle steps within the same `group` tag
   - Resolve `usePlayerSkill: true` → pick a skill from `PlayerState.skills` (if no skills, skip the step)
   - Apply `damageVariance` (±N% jitter on all damage values)
   - Auto-calculate missing `damage` or `hpChanges` values

2. **Battle intro** — all actors slide in from their side (player side from left, enemies from right). 150ms per actor with 100ms stagger delay.

3. **`run()`** — async loop, processes steps sequentially:
   ```ts
   async run(): Promise<void> {
     const steps = this.prepareSteps();
     await this.playIntro();
     for (const step of steps) {
       if (this.isTargetDead(step)) continue;  // skip dead actor steps
       await this.executeStep(step);
     }
     await this.playVictory();
   }
   ```

4. **`executeStep()`** — dispatches to the correct handler:
   ```ts
   async executeStep(step: FightStep): Promise<void> {
     switch (step.type) {
       case 'attack': await this.playAttack(step); break;
       case 'skill':  await this.playSkill(step);  break;
       case 'status': await this.playStatus(step);  break;
       case 'die':    await this.playDeath(step);   break;
       case 'wait':   await this.delay(step.ms);    break;
       case 'label':  await this.showLabel(step);   break;
     }
   }
   ```

5. **`playVictory()`** — after all steps complete:
   - Show victory label (default "VICTORY!"), scale in with overshoot
   - Hold for `onVictory.holdMs` (default 1500ms)
   - Fade out battle area (~300ms)
   - Resolve `done`

### playAttack flow (~600-800ms)

1. If `dramatic: true` → fade in screen darkening overlay (~500ms)
2. Show category label above actor if combo/counter/rage ("Combo!", "Counter!", "Rage!")
3. If `dodge: true` → target sidestep animation + "Dodge!" text, skip damage, return early
4. Resolve `melee` (per-step or from ActorConfig). If melee → tween actor toward target (~150ms), play walk animation during tween
5. Play Spine attack animation on actor (varies by category: basic/combo/counter/rage)
6. At hit frame → hit flash on target (white tint 150ms) + floating damage number + screen shake
7. Tween target HP bar to new value (~300ms)
8. If `rageFill` set → tween actor's rage bar up; if rage == maxRage, bar flashes
9. If `category === 'rage'` → discharge rage bar to 0
10. If `return !== false` → tween actor back to position (~150ms)
11. If `dramatic: true` → fade out darkening overlay (~250ms)

### playSkill flow (variable duration)

1. Resolve which skill to use (specific `skillId` or from player's pool)
2. Pulse the skill's icon in the skill icon bar
3. Look up skill's VFX handler in the registry
4. Call handler with `SkillVfxContext` — handler plays its custom visuals
5. Handler calls `showDamage()` and `tweenHp()` as needed
6. Multi-tick skills split `totalDamage` across hits

### playStatus flow (~400ms)

1. If `stacks > 0` → add/update status effect icon under target's HP bar
2. If `loopVfx` set → start looping visual on target (e.g. cyan tint for freeze, fire particles for burn)
3. If `stacks === 0` → remove icon + stop looping VFX, restore normal appearance

### playDeath flow (~800ms)

1. Play Spine death animation ("Dead" if available)
2. Fade out actor sprite over ~500ms
3. Mark actor as `dead`

### showLabel flow (~600ms)

1. If `actor` is set → text floats above that actor
2. Otherwise → text appears at screen center
3. Scale in with overshoot, hold briefly, fade out

## Skill VFX System

### Registration pattern

Each skill registers a handler function that receives a context object with all the utilities it needs.

```ts
type SkillVfxHandler = (ctx: SkillVfxContext) => Promise<void>;

interface SkillVfxContext {
  actor: FightActor;
  target?: FightActor;
  allEnemies: FightActor[];
  allPlayers: FightActor[];
  playerState: PlayerState;
  totalDamage: number;         // from config, after variance
  battleArea: Container;       // for spawning VFX sprites
  showDamage: (target: FightActor, amount: number, opts?: DamageNumberOpts) => void;
  tweenHp: (target: FightActor, newHp: number) => Promise<void>;
  delay: (ms: number) => Promise<void>;
}

interface DamageNumberOpts {
  color?: number;
  crit?: boolean;
  label?: string;   // prefix like "Ice!" shown above the number
}

const skillVfxRegistry = new Map<string, SkillVfxHandler>();
```

### usePlayerSkill resolution

When a step has `usePlayerSkill: true`:
1. Read `PlayerState.skills` for learned skill IDs
2. Filter to skills that have a registered VFX handler
3. Pick one (round-robin or random)
4. Call its handler with `totalDamage` from the config
5. The handler adapts its visual (e.g. shuriken fires 1 projectile, ice does 1 big hit + icicle proc) while keeping total damage close to the configured value
6. If player has no skills, skip the step silently

### Weapon enchantment

When `ActorConfig.weaponEnchant` is set (e.g. `'iceWeapon'`), the engine resolves it at fight start:
- If the player actually has that skill (or any enchant-type skill), add a persistent glow/particle effect on the weapon sprite for the entire fight
- Enchant is determined by `PlayerState.skills` — config just enables the feature

### Example skill handlers

**Ice Weapon** — icicle projectile + freeze chance:
```ts
registerSkillVfx('iceWeapon', async (ctx) => {
  // spawn icicle projectile from actor weapon tip to target
  // on hit: ice burst particles at target
  ctx.showDamage(ctx.target!, ctx.totalDamage, { color: 0x44aaff, label: 'Ice!' });
  await ctx.tweenHp(ctx.target!, /* computed */);
});
```

**Shuriken Throw** — single projectile with rotation:
```ts
registerSkillVfx('shurikenThrow', async (ctx) => {
  // spawn spinning shuriken sprite from actor to target
  // on arrival: hit flash + damage
  ctx.showDamage(ctx.target!, ctx.totalDamage, { color: 0xcccccc });
  await ctx.tweenHp(ctx.target!, /* computed */);
});
```

**Lightning Weapon** — bolt strike from above:
```ts
registerSkillVfx('lightningWeapon', async (ctx) => {
  // draw lightning bolt graphic from top of screen to target
  // brief screen flash white
  ctx.showDamage(ctx.target!, ctx.totalDamage, { color: 0xffee44, label: 'Bolt!' });
  await ctx.tweenHp(ctx.target!, /* computed */);
});
```

**Note:** Combo Mastery, Glass Cannon, and Ramping Power are passive stat-mod skills with no active VFX. Their impact shows through the config (more combo steps, bigger damage numbers, lower hero HP). They do not need VFX handlers.

## Visual Components

### 1. Floating Damage Numbers

- Spawn at target center, slight random horizontal offset to avoid overlap
- Scale from 0 → 1 with elastic ease (~100ms)
- **Magnitude scaling**: 0.6x–1.1x base scale proportional to damage relative to the fight's average damage
- Crits: additional 1.3x scale, "!" appended
- Float upward ~60px over 500ms
- Fade out during last 200ms
- Multiple simultaneous numbers stack +30px vertical offset each
- "-" prefix for damage, colored by element: white=physical, blue=ice, yellow=lightning, grey=shuriken, orange=fire, green=poison

### 2. HP Bar Tweening

Extends existing `HpBar` with `tweenTo(newHp, durationMs)`:
- Fill bar smoothly shrinks/grows over ~300ms
- "Damage trail" effect: old fill stays as darker color briefly, then catches up (~200ms delay)
- Number text counts down/up in sync

### 3. Rage Bar

Separate bar below the hero's HP bar (only shown if `maxRage` is set):
- Fills based on `rageFill` values on attack steps
- Glows/pulses when full (rage ready)
- Discharges to 0 when a `category: 'rage'` attack plays
- Colored distinctly (gold/orange fill)

### 4. Hit Effects

Automatic on every damage step:
- **White flash**: target tints white for ~150ms, then reverts
- **Screen shake**: 3px on normal hits, 6px on crits. Applied to battle container.
- Skill handlers add their own effects on top of these.

### 5. Screen Darkening

Triggered by `dramatic: true` on attack/skill steps:
- Dark overlay fades in behind the acting character (~500ms, 85% alpha)
- Attack plays over the darkened background
- Overlay fades out (~250ms)

### 6. Status Effect Icons

Row of small icons displayed under each actor's HP bar:
- Each icon shows the effect type + stack count
- Icons appear/update via `status` steps
- Optional looping VFX on the actor (freeze cyan tint, burn particles, poison green tint)
- Removed when stacks set to 0

### 7. Skill Icon Bar

Row of learned skill icons displayed at top of battle area:
- Populated from `PlayerState.skills` at fight start
- When a skill fires (via `skill` step), its icon does a punch-scale animation
- Provides player feedback about which skill activated

### 8. Dodge Animation

Triggered by `dodge: true` on attack steps:
- Target sidesteps (punch position ~30px perpendicular, 500ms)
- "Dodge!" text floats above target
- No damage applied, no HP change

## Layout

### Battle intro

All actors slide in from off-screen at fight start:
- Player side slides in from left, enemies from right
- 150ms per actor, 100ms stagger delay between actors
- Transitions from walk to idle animation on arrival

### Actor positioning

- **Player side** (left): hero at front (index 0), pets staggered behind/below
- **Enemy side** (right): enemies staggered by index, front to back
- Scale all actors relative to battle area height
- HP bars below each actor, rage bar below HP bar (hero only)
- Status effect icons below bars
- Skill icon bar at top of battle area
- Melee approach destination: target position minus fixed offset (~80px from attacker's perspective)

## Integration

### Migration from existing FightScene

1. Move the new `FightSceneConfig` into `src/fight/FightStep.ts`
2. Delete the old `FightSceneConfig` from `PlayableDirector.ts`
3. Update the `SceneStep` union type's `fight` variant to use the new config
4. `FightScene` creates `FightEngine` internally in `enter()`, calls `run()`, resolves `done` when engine finishes
5. Remove the `elapsed` / `DEFAULT_DURATION_MS` timer logic from the old FightScene
6. Update `PlayableDirector.onLanded` to construct the new config shape

### PlayerState

No new fields needed on `PlayerState`. The fight system reads:
- `hp`, `maxHp` — for hero HP auto-inherit
- `skills` — for `usePlayerSkill` resolution and weapon enchant
- `weaponConfig` — for weapon display on hero

Rage resets to 0 each fight (purely a per-fight visual mechanic).

## File Structure

```
src/
  fight/
    FightEngine.ts         # step loop, prepareSteps, executeStep, intro, victory, dead-skip
    FightActor.ts          # SpineCharacter + HpBar + RageBar + status icons + dead flag
    FightStep.ts           # type definitions (FightStep, FightSceneConfig, ActorConfig)
    DamageNumber.ts        # floating damage number component (magnitude scaling)
    HitEffect.ts           # white flash + screen shake + screen darkening
    RageBar.ts             # rage bar UI component (fill, glow, discharge)
    StatusIcon.ts          # status effect icon row component
    SkillIconBar.ts        # learned skill icon bar with pulse animation
    skillVfx/
      registry.ts          # skillVfxRegistry + registerSkillVfx + SkillVfxContext
      iceWeapon.ts         # icicle projectile handler
      shurikenThrow.ts     # spinning projectile handler
      lightningWeapon.ts   # bolt strike handler
  scenes/
    FightScene.ts          # updated: creates FightEngine, calls run(), resolves done
```
