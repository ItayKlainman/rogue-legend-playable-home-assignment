# Board-Fight BG Flavors + Landscape-Responsive Ad UI — Design

**Date:** 2026-05-31 · **Playable:** board-fight (+ a shared helper consumed by clash-royal) · **Status:** design red-teamed (findings folded in), pending user review
**Branch:** `feature/bf-bg-flavors` (isolated worktree off `main`) · **Foundation PR → `main`**

## Goal

Ship **fight-only (board-less) win + lose builds, one per available fight background**, swapping the background **and that stage's enemies**, with the **ad-layer UI made landscape-responsive** on top of the fight rendering (which already adapts to landscape). The landscape logic and the background "flavors" become **shared** so the clash-royal iterations use the same logic — clash-royal's adoption is a **sequenced follow-up** so we never edit clash-royal files while its iteration agents are live.

### In scope
- A shared responsive helper in `src/shared/` (the "same logic"), modeled on clash-royal's proven viewport handling.
- Exposing the 8 battle backgrounds as a shared, reusable catalog ("bg flavors ready to use") via a `src/shared/battleBgs/` re-export.
- board-fight fight-only `victory`/`defeat` variants across the backgrounds (reuse the 6 existing; add the **2 missing** — stage2 + plain stage7).
- Making the **ad-UI that renders in fight-only mode** correct in landscape (the overlay scenes + `FightProgressBarH`); adopting the shared helper so orientation changes relayout.
- Builds: the **passing** backgrounds (up to 8) × {win, lose} across all 4 networks, `asaf_`-prefixed to Desktop.

### Explicitly OUT of scope (hard guards)
- **Do NOT touch `FightEngine` actor layout / enemy scaling / positioning.** Enemy **proportions** (`scale`/`defaultScale`) and **hitboxes** (`xFrac`/`yFrac`/`melee` + lunge) must stay byte-identical — that layer is already landscape-tuned (overscan-to-cover-every-aspect + `isLandscape` branches). The enemy swap is **data-only** (reuse already-tuned per-stage rosters).
- No board phase (these are fight-only ads).
- clash-royal code edits happen in the follow-up PR, **after** the iteration worktrees merge.

## Grounding facts (verified against current code)
- **8 fight backgrounds**, all cataloged in `src/playables/board-fight/catalog/battleBgs/`: `stage1`..`stage7` + `stage7Island`. **`stage7` (`Stage7/BattleBG.webp`) and `stage7Island` (`Stage7/IslandView.webp`) are two distinct files** — `stage7Island` is used by m7; the plain `stage7` BattleBG is currently imported by **no** variant.
- **Fight-only victory+defeat pairs already exist for 6 backgrounds** (red-team-confirmed): m1→stage1, m3→stage3, m4→stage4, m5→stage5, m6→stage6, m7→**stage7Island**. **Exactly 2 are missing** to reach all 8: **stage2** (no `m2_fight_*` exists; natural roster = the goblins already used by `m2_board_*`, `catalog/enemies/stage2/`) and **plain stage7** (`BattleBG.webp`, unused; sea/pirate roster in `catalog/enemies/stage7/`).
- **Win/lose is authoring, not a flag** (`FightEngine` runs scripted `steps[]` then calls `playVictory()` UNCONDITIONALLY at `FightEngine.ts:310`; "defeat" = authored final-boss steps ending in `{type:'die',side:'player',actor:0}` + a `nextChapter` ending with `victoryText:'DEFEAT'`/`buttonText:'Try Again!'`). Enemy `maxHp`/damage are **cosmetic** (HP-bar fill only) — **swapping enemies cannot flip the outcome.** Reuse this exact pattern.
- **Steps target enemies by ACTOR INDEX + count** (`getActor`/`isTargetDead`, `FightEngine.ts:282-285,1390-1412`). So an enemy swap is only safe if it **preserves the enemy count and per-index roles** the `steps[]` expect; otherwise steps silently no-op and the choreography breaks. (This is the one real way a "data-only" swap can break a fight.)
- **Enemy proportions are bundle-driven, not variant/board-driven:** `layoutActors` resolves scale as `config.scale ?? spine.defaultScale ?? charScale` (`FightEngine.ts:370,389`); fight enemy entries carry no `scale`, so size = the bundle's `defaultScale` and travels with a verbatim roster copy. `xFrac`/`yFrac`/`melee` live in the entry. No position depends on the background. Residual risk: a different sprite's art-bounds at the same `defaultScale` + hand-tuned `xFrac/yFrac` can mis-space/overlap → **per-ad screenshot validation is mandatory.**
- **board-fight responsiveness today:** `FightEngine` handles landscape for the *fight*; `PlayableDirector.resize` only receives the SDK resize (no `window`/`orientationchange`/`visualViewport` listener). Several overlay scenes already branch on `isLandscape` (`GameEndScene`, `NextChapterScene`, `LevelUpScene`, …); the HUD (`hud/AtkHud|CoinHud|XpHud`) + `ui/SpinButton` do **not**.
- **clash-royal responsiveness** = the pattern to share: `resize`+`orientationchange` listener (`CombatDirector.ts:151-158`) → `readViewport()` (visualViewport-aware, `:274-284`) → `renderer.resize` + `sceneManager.layout`. `src/shared/safeArea.ts` already exports `fitViewport()` (contain+center+fill-region math).
- **Build:** `scripts/build-all.js` auto-discovers every `variants/*.variant.js`; codegen runs per variant (the `*.generated.ts` are gitignored); per-network output names embed the variant basename.

## Design

### A. Shared responsive helper (`src/shared/`)
A small module — the single source of truth both playables use. API (pure where possible, so unit-testable under `node --test` like `safeArea.ts`):
- `readViewport(): { width, height }` — visualViewport-aware (falls back to `innerWidth/Height`); lifted verbatim from clash-royal's `readViewport` (`CombatDirector.ts:274-284`).
- `installViewportListener(onChange: (w, h) => void): () => void` — adds `resize` + `orientationchange` (and optionally `visualViewport` resize) listeners that call `onChange(readViewport())`; returns a cleanup that removes them. Mirrors `CombatDirector.ts:151-158`.
- Reuse the existing `safeArea.fitViewport()` for any ad-UI element that must contain/center/fill in landscape.

board-fight's `PlayableDirector` adopts `installViewportListener` (it has none today) and routes to its existing `resize()`. clash-royal later swaps its inline listener for this helper (follow-up).

### B. Shared bg-flavor catalog (re-export, NOT a move)
**Do NOT physically move the catalog** — the red-team showed a move would force-regenerate all 239 board-variant `import battleBgStageN from '../catalog/battleBgs/...'` lines AND break the hand-written cross-imports in `egg-summon/fightConfig.ts` + `egg-escalate/fightConfig.ts` (`../board-fight/catalog/battleBgs/stage1`), plus `DialogueScene.ts` / `debug.ts`. Instead, leave `board-fight/catalog/battleBgs/*` in place and add a thin **`src/shared/battleBgs/index.ts` that re-exports** the 8 modules under stable keys. clash-royal (and any playable) imports the flavors from `@shared/battleBgs`; board-fight's codegen lookup is untouched. **Honor the PIXI v8 texture rule: `Assets.load(data)` before use** (see `lessons.md` / `check:textures`; `check-texture-loading.js` already scans `src/shared`). Zero generated-file churn, no cross-package breakage.

### C. board-fight fight-only win/lose × 8 backgrounds
- Reuse the 6 existing fight-only `victory`/`defeat` pairs as-is (stage1/3/4/5/6/stage7Island).
- **Author the 2 missing pairs**: `m2_fight_victory/defeat` (stage2, goblin roster) and a plain-`stage7` fight pair (sea/pirate roster). Build each by **copying the nearest existing fight variant** and swapping `background:` + the matching stage's enemy roster.
- **Enemy-swap safety rule (hard):** the swapped roster must **match the source fight's enemy COUNT and per-index role layout** so the existing `steps[]` keep targeting valid actors. The cleanest path is to base each new fight on the SAME stage's existing `_board_` fight (which already pairs that bg's roster with steps authored for it) rather than grafting a foreign roster onto unrelated steps. If counts can't match, the `steps[]` are re-authored to the new roster — never left mismatched.
- Win vs lose differ ONLY in the final boss `steps[]` (player vs boss `die`) + the `nextChapter` ending fields (the established pattern).
- Net: 8 × {victory, defeat} = **16 fight-only variants → 16 builds.**

### D. board-fight ad-UI landscape pass (narrowed by red-team)
- Adopt the shared viewport listener (A) in `PlayableDirector` so `orientationchange`/`visualViewport`/chrome changes reliably trigger `resize → sceneManager.layout` (today board-fight relayouts only on the SDK resize, which can miss these). **Guard `resize` against an unchanged `(w,h)`** to avoid double-relayout thrash.
- **Only these render in fight-only mode** and thus need landscape correctness: `FightProgressBarH`, `LevelUpScene`, `WeaponRewardScene`, `HeroRewardScene`, `GameEndScene`. The overlay scenes **already branch on `isLandscape`** — verify they look right. The real gap is `FightProgressBarH` (stretches to `screenW-120`, no landscape reflow → a long thin top bar on wide viewports — give it a sane landscape width/placement).
- **Do NOT touch** `AtkHud`/`XpHud`/`CoinHud` / `ui/SpinButton` — red-team confirmed they're **dead in fight-only mode** (mounted only via `BoardStatsBar`, which only `BoardScene` creates; no board → never built). Pre-existing dead inclusions in codegen's `sceneClasses`; per repo rules, leave them (noted, not deleted).
- **Touch only the ad-UI layer** — never `FightEngine` actor layout (its in-fight HP/rage bars + victory label already center on `this.width` and are landscape-safe).

### E. clash-royal migration (FOLLOW-UP PR, post-iterations)
Replace clash-royal's inline `windowResizeHandler`/`readViewport` with the shared helper (behavior-preserving) and wire bg-flavor use if desired. Sequenced after the iteration worktrees (`cr-iter*`) merge, to avoid editing `CombatDirector`/`CombatScene` under live agents. End state: both playables on the shared logic.

## Sequencing & concurrency
1. **This foundation PR** (branch `feature/bf-bg-flavors`): A + B + C + D. Touches **only** `src/shared/**` and `src/playables/board-fight/**` (no codegen-path change — B is a re-export). Zero clash-royal files → no collision with the iterations.
2. Land to `main`. Iteration worktrees `git merge origin/main` to inherit A + B.
3. **clash-royal follow-up PR** (E) after iterations land.

## Testing & verification
- **Tier 0:** `npx tsc --noEmit`; `npm run test:shared` (+ a new **unit test for the shared helper's pure parts**, `safeArea`-style); `npm run verify`. board-fight build resolves all 8 backgrounds.
- **Tier 1/2 (visual, MANDATORY):** Playwright screenshots **in BOTH orientations (portrait + landscape)** for representative backgrounds, **win and lose** — confirming (a) background covers correctly, (b) **enemy proportions + positions unchanged vs baseline**, (c) ad-UI overlays laid out correctly in landscape, (d) win ends in victory / lose ends in defeat (no cross-over).
- **Red-team (per standing preference):** the design has had one opus red-team pass (findings folded in). Red-team the **plan** too before implementation — for game-logic failures (a roster whose count/index breaks the steps, a sprite that mis-spaces at the authored fracs, a defeat that resolves as a win, a background that doesn't cover in landscape, the viewport listener double-firing/leaking) — and independently verify every subagent finding before trusting it.

## Deliverables / build
The **passing** backgrounds (up to 8) × {win, lose}, all 4 networks (`node scripts/build-all.js --type board-fight --network <applovin|unity|google|moloco>`), `asaf_`-prefixed to Desktop. Report any dropped stages + why. Revert `build.json` after.

## Drop-if-broken policy (per the user)
**The 8 backgrounds are a target, not a mandate.** A background ships **only if** it yields a clean, correct fight: assets present, the enemy roster matches the `steps[]` actor layout, it covers in both orientations, win ends in victory / lose ends in defeat, and Playwright screenshots (portrait + landscape, win + lose) pass. **Any stage that's problematic or incomplete — e.g. the island fight missing a roster/asset, or a roster that can't be made to match the steps without hacks — is DROPPED and reported, never shipped broken or force-fitted.** Final deliverable = however many of the 8 pass cleanly (each as a win+lose pair).

## Risks
- **Actor-count/index mismatch** (top *correctness* risk) — a swapped roster whose count/roles don't match the fight's `steps[]` silently breaks the choreography. Mitigated by basing each new fight on the SAME stage's existing `_board_` fight (roster already authored to its steps) and screenshot-verifying the whole fight; if it can't be made clean, **drop the stage**.
- **Per-roster sprite spacing/overlap** — proportions are code-safe (bundle `defaultScale`), but hand-tuned `xFrac/yFrac` may mis-space a different sprite. Mitigated by per-ad both-orientation screenshots; drop if it can't look right.
- **bg-flavor exposure** — resolved by a `src/shared/battleBgs/` **re-export** (NOT a move), avoiding the 239-import regeneration + egg-summon/egg-escalate cross-import breakage the red-team found.
- **Landscape ad-UI** — small surface (overlays already handle `isLandscape`; main fix is `FightProgressBarH`); use `fitViewport`/existing precedents.
- **Concurrency** — foundation is additive + disjoint from clash-royal; the clash-royal migration is deferred to a follow-up.
