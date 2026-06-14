# Architecture Audit & Backlog — pocketroll-playables

**Date:** 2026-05-31 · Read-only 5-agent audit of the monorepo (scalability / canonical flow-wiring / shared-infra coupling / verification robustness / agent-legibility).

## Scores
| Dimension | Score | Verdict |
|---|---|---|
| Agent-legibility | 7/10 | Well-documented framework; large monolith files + inconsistent per-playable docs are emerging risks. |
| Canonical flow-wiring | 6.5/10 | Shared singletons mostly in place; end-card path forked in 2 playables. |
| Scalability (add playable/variant) | 6/10 | Variants auto-discover; adding a *playable* needs manual dual-edit + board-fight-special-cased build. |
| Verification robustness | 5/10 | clash-royal excellently covered; shared modules + other playables under-tested. |
| Shared-infra coupling | 4/10 | Core game classes + shared UI live inside playable dirs; cross-playable imports. **Lowest — top priority.** |

## Merge decision
**No true pre-push blockers for clash-royal.** It's complete, all 6 suites pass, tsc adds no new errors, 162/162 builds succeed, and the `origin/main` merge is verified. The items below are **debt/follow-ups**, best done as their own PRs off the merged `main` (they touch board-fight + egg, so bundling them into the clash-royal PR would balloon scope + risk). Recommendation: **PR clash-royal now; schedule the refactor below.**

## Prioritized backlog (follow-up work, off merged main)

### P1 — Decouple shared infra (the scalability blocker)
- **Extract `FightActor` + `HitEffect` (+ `ActorConfig`) → `src/shared/`.** They live in `board-fight/fight/` but clash-royal imports them directly and egg-summon will need them. This is what blocks clean composition of new combat playables.
- **Move `convexButton.ts` + `buttons9slice.ts` → `src/shared/ui/`.** They're in `end_card/` but used by clash-royal (DefeatScene) + dice-blackjack — a playable reaching into another playable's internals.
- **Unify `HpBar`** (two impls: `board-fight/HpBar.ts` vs `sidescroller/ui/HpBar.ts`, different signatures) → one `src/shared/ui/HpBar`.
- **Move `board-fight/sfx` (audio engine) → shared** — already imported by dice-blackjack + egg-summon as a de-facto shared util.
- **Shared weapon/asset registry** — clash-royal + egg-summon import `WARRIORS_BLADE` from `board-fight/catalog/weapons`; egg-escalate imports from egg-crack/egg-summon. Promote to a shared registry; stop playable→playable imports.

### P1 — Test the shared code everyone depends on (and that just changed)
- **Unit-test `alAnalytics`** (early-event queue + hook polling + dedup — *just changed this session, currently only ad-hoc verified*), **`mraidInstall`** (safeInstall + AD_NETWORK/mraid gating), **`SceneManager`** (push/overlay/seamlessReplace — only 2 tests today). A shared-code change should be caught by tests across all consumers; today it isn't.
- **Generalize the flow-invariant harness** beyond clash-royal, or add light flow E2E for egg-escalate/egg-summon/sidescroller (1,400–2,400 LOC each, ~zero automated coverage). board-fight/dice-blackjack PW tests are shallow diagnostics, not behavioral invariants.

### P2 — Scalability ergonomics
- **Single playable registry** — `src/index.ts` duplicates the playable list in a dev `switch` AND prod `if`s that must stay in sync. Replace with one `const PLAYABLES = {...}` driving both.
- **Generalize the build pipeline** — `build-all.js` special-cases board-fight (`prepareBoardFightVariant`, the `_fight_` filter); `variant-watcher.js` hardcodes the board-fight variants path (other types lose HMR). Make these per-type-pluggable / configurable.
- **`scripts/new-playable.js NAME`** — scaffold from `_template` + auto-edit the registry, so adding a playable is one command (today it's a manual checklist).

### P2 — Canonical end card
- **Migrate board-fight + sidescroller to the shared `EndCardScene`** (each has its own ~234-line `GameEndScene` with a plain-Graphics button vs the canonical convex CTA). Consolidate to one end-card path (parameterize the button style if needed).

### P3 — Legibility / hygiene
- Split monolith modules: `FightEngine.ts` (1579 LOC / 173 methods), `PlayableDirector.ts` (938), `BoardScene` (1199), `BlackjackScene` (1109), `CombatFx` (~1290), `LevelUpScene` (930).
- Add a root `README.md` per playable (only dice-blackjack has a file-map today).
- Naming consistency: `PlayableDirector` (board-fight) vs `CombatDirector` (clash-royal) — same role, different name.
- Fix `egg-crack/index.ts` type annotation (`EggSummonScript` → an egg-crack-specific type) — **pre-existing on main, egg-team's, not clash-royal.**
- `_template/MyScene.ts` calls `sdk.install()` directly — change to `safeInstall()` so the template models the safe pattern.

## Housekeeping (this branch, optional, non-blocking)
- `tests/pw/clash-royal-retry-idle-shot.mjs` (untracked, leftover from an agent) — likely redundant with the flow-invariants RETRY flow; commit or delete.
- `.claude/worktrees/main-showcase` worktree + untracked `Reskins/` and the 2 non-clash plan docs are the *other session's* — leave them.
