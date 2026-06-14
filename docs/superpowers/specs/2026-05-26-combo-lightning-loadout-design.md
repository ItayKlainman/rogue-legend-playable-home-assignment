# Design: Pre-loaded lightning build in the combo-variant fights

Date: 2026-05-26
Status: Approved + red-teamed (3 Opus agents vs. live code). Corrections baked in below.

## Red-team corrections baked into this spec

An adversarial review against the live code confirmed the engine plumbing
(codegen passthrough, `state.skills` init, dual-direction `allSkills` injection,
skill-bar render, `useAllPlayerSkills` firing once in mega+splash form, asset
bundling) is **correct**. It found the **fight authoring** was wrong as first
drafted. Corrections, now folded into the design:

- **Lightning damage is split PER-ENEMY, not pooled.** `skillVfx/chainLightning.ts:82-89`
  gives each living enemy `step.damage / livingEnemies` (then ÷ `COUNT=6` bolts).
  The first draft's `damage ≈ 200000` across 3 skeletons = ~66k each nominal,
  ~57k at −15% variance < 60k HP → skeletons survive then snap-die on the `die`
  step (looks broken). **Fix:** size for the per-enemy floor. A single wipe of 3×
  60000-HP skeletons needs `(damage/3)·0.85 ≥ 60000` → `damage ≥ 211765`; use
  **`damage: 270000`** (per-enemy ≈90k nominal / ≈76.5k at −15%, clean visible 0;
  over-damage is safe — HP clamps at 0).
- **3 enemies must have explicit `xFrac`/`yFrac`.** Auto-stagger
  (`FightEngine.layoutActors`, ENEMY_X_FRAC + i·CHAR_STAGGER_X = 0.72/0.80/0.88)
  bunches all three at the right edge — ~78% sprite overlap and the third clips
  off-canvas. **Fix:** explicit per-enemy `xFrac`/`yFrac` with depth-staggered
  `yFrac`, modeled on the battle-tested `deadSailorSwarm`
  (`m7_fight_victory_splash.variant.js`), spread a touch wider for the wider
  skeleton sprite. Final fracs dev-verified via Playwright screenshot and nudged.
- **The step is `type: 'skill'` with a `useAllPlayerSkills: true` *property*** —
  there is NO `type: 'useAllPlayerSkills'`. Codegen passes a wrong type through
  silently and it would never fire at runtime. Exact shape pinned below.
- **`die` steps come AFTER the lightning step; lightning targets a living enemy.**
  `isTargetDead` (`FightEngine.ts:1269-1276`) skips the WHOLE step if `step.target`
  is dead — a `die` before the multi-target wipe (or a dead `target`) would
  silently skip the wipe. Do not add a `group` key to these steps (group-shuffle
  could reorder a `die` ahead of the cast).
- **All 6 combo variants DO run the `skeletonIntro` fight** (verified in all six
  `.variant.js`). The combo *plan's* original "Direction A = board→blackjack→endCard
  (no fight)" is stale; the shipped `bj_after_board_*` fight before the blackjack.
  So the loadout applies to all 6 and is never dead weight.
- **Size gate has thin absolute headroom.** Current combo AppLovin bundle =
  4.676 MB vs the 5 MB cap (~332 KB headroom). Adding the two icons (~40 KB
  base64-inlined) → ≈4.714 MB (~287 KB headroom). It fits, but the gate is a real
  pass/fail — no room for any stray import to sneak in.
- **Build/verify commands pinned** (see §3) — `variant-build.js` does NOT
  variant-tag board-fight filenames; use `build-all.js --type board-fight --filter
  bj_` and a manual `ls -la` size check (`verify-builds.js` only globs
  dice-blackjack).

## Context

The repo ships HTML5 playable ads for *PocketRoll*. The `board-fight` playable
is the core board→roll→fight loop and has a full combat **skill** system
(`fight/skillVfx/*`, `dynamicSkillSelection.ts`, the in-fight skill bar in
`scenes/FightScene.ts`). The lightning family is three tiers — `chainLightning`
(T1), `thunderstorm` (T2), `thunderGod` (T3) — all rendered by a single VFX
handler (`fight/skillVfx/chainLightning.ts`) that upgrades its visuals (normal
bolt → mega `lazer_yellow` bolt + `Electricity_Splash` per hit) based on which
of the three the player owns (`playerState.skills`).

The six **Board × Blackjack combo variants** stitch `dice-blackjack` into
`board-fight`:
- **Cold blackjack board** (`bj_cold_open_{fair,winRigged,loseRigged}`):
  blackjack cold-opens full-screen → board → one scripted spin lands on a fight
  tile → `skeletonIntro` fight → blackjack end card.
- **Board-first blackjack** (`bj_after_board_{fair,winRigged,loseRigged}`):
  board → spin to fight tile → `skeletonIntro` fight → spin to bj tile →
  blackjack → end card.

Both directions run the **same `skeletonIntro` fight**, today a single skeleton
killed by basic-attack steps only. The authored `.variant.js` files even note
"skeletonIntro uses only basic attacks (no skill steps), so skills are never
consumed."

## Goal

The hero enters `skeletonIntro` in all 6 combo variants **already owning a full
lightning build** (`chainLightning` + `thunderstorm` + `thunderGod`). The
loadout is visible in the in-fight skill bar and fires automatically during the
fight via `useAllPlayerSkills` skill steps — rendering the upgraded **mega bolt +
electricity-splash** chain lightning across **three** skeletons. **No
LevelUpScene, no picking** — the build is pre-loaded, per explicit user
requirement ("the user shouldn't pick the skills, just have them loaded in the
fight").

## Key facts that gate the design (verified in code)

- **codegen hardcodes `skills: []`.** `src/playables/board-fight/scripts/codegen.js:825`
  emits `skills: []` into the generated `initialState`, ignoring any
  `initialState.skills` in the authored config. So pre-loading requires a codegen
  change — there is no authored-config path today.
- **The skill bar renders `state.skills ∩ allSkills`.** `FightScene.buildSkillBar`
  (`scenes/FightScene.ts:301-368`) maps each owned `state.skills` id through
  `allSkills` to get its `SkillConfig` (icon, rarity) and drops any id not found.
  So a loaded skill must be in **both** `initialState.skills` and `allSkills` to
  appear. Icons load via `Assets.load(skill.icon)` (the safe PIXI v8 path; no
  `Texture.from` blank-texture risk).
- **The heavy lightning VFX is already bundled.** Both combo variants already list
  `allSkills: ['chainLightning']`; `catalog/skills/chainLightning.ts`
  side-imports `fight/skillVfx/chainLightning.ts`, which **statically** imports
  the mega bolt (`lazer_yellow_SpriteSheet.webp`), the electricity splash
  (`Electricity_Splash_2_SpriteSheet.webp`), and `LightningBurst_1.webp`. So
  adding the full ladder adds essentially no asset weight — only the two extra
  skill-icon webps (`skill_Thunderstorm.webp`, `skill_Lightning_Shot.webp`).
- **`useAllPlayerSkills` step fires every owned+registered skill.**
  `FightEngine.playSkill` (`fight/FightEngine.ts:662-752`) replays the step once
  per owned skill that has a VFX handler. With the lightning build owned, the one
  registered handler (`chainLightning`) fires in its upgraded mega+splash form
  because `thunderGod`/`thunderstorm` are present in `state.skills`. T2/T3 have no
  separate handler by design — they are upgrade flags read inside the T1 handler.
- **`useAllPlayerSkills` hits all living enemies.** chainLightning fires `COUNT=6`
  bolts per living enemy, splitting `step.damage` across `6 × livingEnemies`.
  Multiple enemies = the chain visibly arcs across all of them.
- **Damage variance is ±15%** (`prepareSteps`), but actor death is driven by
  explicit `die` steps, not by HP hitting 0 — so scripted victory is
  deterministic regardless of variance.

## Changes

### 1. codegen — honor `initialState.skills` (the only engine change)

In `src/playables/board-fight/scripts/codegen.js`, change the `initialStateData`
build (line ~825) from:

```js
skills: [],
```

to a validated passthrough:

```js
skills: (config.initialState.skills ?? []).map(id => {
  lookup('skills', id);                 // hard-fail on unknown id (mirrors allSkills validation)
  if (!(config.allSkills ?? []).includes(id)) {
    console.error(`ERROR: initialState.skills "${id}" is not in allSkills (won't render in the skill bar)`);
    process.exit(1);
  }
  return id;
}),
```

(Exact placement/helper factoring decided in the plan; the contract is: validated
passthrough, two failure modes — unknown id, and id absent from `allSkills`.)

Standalone board-fight variants that omit `initialState.skills` keep `skills: []`
— no behavior change for any existing variant.

### 2. The 6 combo variant configs

Edit the authored `.variant.js` sources, then regenerate the `.generated.ts`:
`bj_cold_open_{fair,winRigged,loseRigged}.variant.js` and
`bj_after_board_{fair,winRigged,loseRigged}.variant.js`.

Per file:

- `allSkills: ['chainLightning', 'thunderstorm', 'thunderGod']`
- Add `initialState.skills: ['chainLightning', 'thunderstorm', 'thunderGod']`
- Replace `skeletonIntro` with the **3-skeleton lightning-wipe** fight below.
- Update the stale "uses only basic attacks / skills never consumed" comment
  block in each file.

The exact fight (identical in all 6 files; `xFrac`/`yFrac` are starting values to
be dev-verified via Playwright and nudged if any sprite clips/over-overlaps):

```js
skeletonIntro: {
  enemies: [
    { enemy: 'skeleton', skin: 'default', maxHp: 60000, melee: true, xFrac: 0.55, yFrac: 0.85 },
    { enemy: 'skeleton', skin: 'default', maxHp: 60000, melee: true, xFrac: 0.70, yFrac: 0.72 },
    { enemy: 'skeleton', skin: 'default', maxHp: 60000, melee: true, xFrac: 0.83, yFrac: 0.95 },
  ],
  steps: [
    // pacing + rage build (melee is flavor; lightning is the star)
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 22000, melee: true, rageFill: 30, return: false },
    { type: 'attack', side: 'player', actor: 0, target: 1, damage: 20000, melee: true, category: 'combo', rageFill: 30 },
    // one danger beat
    { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 9000 },
    // dramatic mega chain-lightning wipe — hits ALL living skeletons (per-enemy split)
    { type: 'skill',  side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, dramatic: true, damage: 270000 },
    { type: 'die', actor: 0 },
    { type: 'die', actor: 1 },
    { type: 'die', actor: 2 },
  ],
  onVictory: { labelText: 'VICTORY!' },
},
```

Why this is correct: the skill step's `damage` is split per living enemy
(270000 / 3 ≈ 90000 each nominal, ≈76.5k at −15%) — comfortably above each
60000-HP skeleton, so every skeleton visibly reaches 0 before its `die` step.
The lightning `target: 0` is alive when the step runs (melee only chipped enemies
0 and 1), so `isTargetDead` does not skip the wipe. `die` steps follow the cast.
No `group` key (would risk reordering). `skin: 'default'` + `enemy: 'skeleton'`
is REGISTRY-valid and already used by the current fight.

The board layout, rolls, tileFloats, leadingEvents, event chains, background, and
rig behavior are **unchanged** — only the fight contents and the two skill arrays
change.

### 3. Tests & verification

- **TDD (codegen — pure, subprocess-testable per the combo plan's TDD note):**
  add `__tests__/codegen.test.ts` cases:
  - a config with `initialState.skills: ['chainLightning']` (and that id in
    `allSkills`) emits `skills: ['chainLightning', ...]`-bearing `initialState`
    in the generated output;
  - an `initialState.skills` id missing from `allSkills` fails codegen
    (non-zero exit);
  - an `initialState.skills` id not in REGISTRY fails codegen.
  Red first, then implement the passthrough to green.
- **Fight wiring — dev-run-verified via Playwright** (not the Chrome extension):
  play through one cold-open and one after-board variant; confirm the skill bar
  shows three lightning icons, the mega bolt + electricity-splash VFX fires across
  the three skeletons, all three visibly reach 0 HP before dying, victory fires,
  and it chains to the next beat. Use the screenshot to nudge `xFrac`/`yFrac` if
  any skeleton overlaps too hard or clips off-canvas.
- **Regenerate + size gate (pinned commands):**
  - Regenerate all six: `npm run codegen <variant>` per variant (or via the
    build). Baseline `node src/playables/board-fight/scripts/codegen.js
    bj_cold_open_fair --skip-active` exits 0 and is the clean starting point.
  - Build: `node scripts/build-all.js --type board-fight --filter bj_`
    (variant-tags filenames; `variant-build.js` does not).
  - Size check: `ls -la dist/AppLovin/iOS/board-fight/board-fight_bj_*` — each
    AppLovin file must be ≤ 5,242,880 B (5 MB). Current ≈4.676 MB; expected
    ≈4.714 MB after the two icons (~287 KB headroom). `verify-builds.js` only
    globs dice-blackjack creatives, so check board-fight sizes by hand.

## Out of scope

- No LevelUpScene, no luckyWheel/shop/dialogue skill grants.
- No changes to the lightning VFX itself or other skill families.
- No changes to clash-royal or the standalone `dice-blackjack`/`board-fight`
  playables.
- No rig/blackjack/board/end-card behavior changes.

## Risks

- **codegen validation regressions:** the new subset/registry checks must not
  reject existing variants. Verified via grep that NO `.variant.js` sets an
  `initialState.skills` key today (the only `skills` hits are comments and
  `levelup` steps), so the subset/registry validation rejects nothing existing.
  Covered by the unchanged-default (`skills: []`) test path.
- **Fight balance reads wrong:** corrected — lightning `damage` is split per
  living enemy, so it is sized (270000) above the per-enemy −15% floor; explicit
  `die` ordering and Playwright spot-check confirm no "free death."
- **Size gate:** low risk (heavy VFX sheets already bundled — empirically
  confirmed present in the current AppLovin bundle), but headroom is thin
  (~287 KB post-edit) so it is a real pass/fail check, verified explicitly.
