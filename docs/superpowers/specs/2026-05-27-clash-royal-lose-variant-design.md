# Clash-Royal — Forced-Lose Variant ("So Close" Reversal)

**Date:** 2026-05-27
**Status:** Design (approved, pre-plan)
**Playable:** `src/playables/clash-royal/`

## Goal

Add a second, build-selectable **outcome** for the clash-royal playable: a **forced LOSE** in which the
hero dies during the spammy finale, made to feel real via a "so close" reversal. The existing **WIN**
variant is unchanged. The build pipeline outputs **both** artifacts (`clash-royal_win_*` and
`clash-royal_lose_*`).

Non-goals: changing the win fight, the balance, the onboarding, or the analytics taxonomy.

## Player experience

| Variant | Flow |
|---|---|
| **win** (current) | fight → spammy finale → boss dies → existing Play Now end card |
| **lose** | fight (identical to win) → spammy finale, boss whittled to a sliver → **boss survives and lands a devastating counter → hero HP drains to 0 → hero death** → **Defeat overlay** (dark tint + **TRY AGAIN** + **DOWNLOAD NOW**) |

**TRY AGAIN** → re-runs the fight in **win mode** (the satisfying win + standard end card).
**DOWNLOAD NOW** → store install (`safeInstall()`).

So the lose build contains both outcomes: lose first, then a winnable retry.

## Core mechanic: climax divergence

The lose fight is **byte-identical to the win** until the killing-blow instant. The win path whittles the
boss to `floor+1` under the finale barrage, holds it past `minMs`, then the next deck-fire consumes the
`finisher` beat → victory (see `CombatController.step` finale/victory gate + `RigDirector.resolveCast`'s
`holdFinisher`). In lose mode, at that **same instant**, instead of latching victory:

1. The boss **survives** (finisher NOT consumed; boss stays at its sliver — the visible "so close").
2. A scripted **lethal boss blow** drains the hero from its current HP to **0**, overriding the
   `SAT_MIN_HERO_HP` survival floor (lose-only).
3. The hero plays a **death/fall** beat (+ big red hit number + screen shake); the controller latches
   **defeat** (a new terminal state distinct from `victory`).
4. `CombatScene.done` resolves carrying `outcome: 'defeat'`; the director shows the Defeat overlay.

Because the fight is identical until that instant, "so close" is genuine and free — the boss is visibly at
a sliver and the player was mid-spam.

## Components & touchpoints

1. **`config.ts`** — add `outcome: 'win' | 'lose'` to `ClashConfig` + `DEFAULT_CONFIG.outcome = 'win'`
   (default preserves current behavior + all tests). The build injects `'lose'` for the lose artifact.
2. **`RigDirector`** — lose-only lethal resolution: a method (e.g. `resolveHeroDeath()`) that sets
   `heroHp = 0` ignoring `SAT_MIN_HERO_HP`, and a `isDefeat()` flag. Win path untouched (the floor + the
   never-die invariant still hold when `outcome==='win'`).
3. **`CombatController`** — at the finale-kill moment, branch on `cfg.outcome`:
   - `win`: existing victory latch (unchanged).
   - `lose`: fire the lethal blow (via `fx` — big enemy hit on the hero), `tweenHpHero(0)`, latch
     `defeat`. The boss is NOT killed. Guard re-entry like `finaleStarted`. Expose `isDefeat()`.
   The defeat must occur **during the finale barrage** (boss below `finaleAccel.hpFracThreshold`, past
   `minMs`) so it lands in the spammy stretch.
4. **`CombatScene`** — render the death: drain the hero HP bar to 0, play the hero death/fall + a "big
   hit" reaction, brief hold, then resolve `done` with the outcome. `done` changes from `Promise<void>`
   to `Promise<{ outcome: 'win' | 'defeat' }>` (or a getter the director reads).
5. **`CombatFx` / `FightActor`** — a hero-death visual. **Risk:** confirm the `Main_Character` spine has a
   death/hurt animation; if not, fall back to a tween (tint-to-red + slump/fade + shake).
6. **`DefeatScene`** (new) — dark tint scrim over a frozen final frame + **TRY AGAIN** and **DOWNLOAD NOW**
   buttons. **The overlay + buttons are designed by a dispatched `frontend-design` UI agent** (polished,
   on-theme; uses the Components/ library where it fits). Wiring: TRY AGAIN → director re-mounts the
   combat in win mode; DOWNLOAD NOW → `safeInstall()`.
7. **`CombatDirector`** — on `done`: `win` → `EndCardScene` (current); `defeat` → `DefeatScene`. Implement
   **TRY AGAIN** by tearing down + re-instantiating `CombatScene` with `outcome: 'win'` (a clean reset:
   new controller, fresh Spine actors, audio intact, no leaks). Reads `?outcome=` URL override (dev A/B),
   mirroring the existing `?perf` flag handling.
8. **Build** — `build-all.js` outputs `clash-royal_win_*.html` + `clash-royal_lose_*.html`. Mechanism:
   inject the outcome as a build define (or a minimal clash-royal `variants/` entry) so each artifact is
   compiled with its `outcome`. **Risk/decision for the plan:** define-injection vs a `variants/` dir; how
   `build-all` discovers + names the two; keeping `--network` behavior.

## Analytics (lose path)

`CHALLENGE_PASS_25/50/75` still fire as the fight progresses (`challengeProgress` is enemy-HP based; the
boss is whittled the same way before death). On the lose path: `ENDCARD_SHOWN` fires when the **Defeat
overlay** mounts; `CTA_CLICKED` on **DOWNLOAD NOW**. The retry's win end card must not double-count
(`alTrack` dedupes, so each fires once). **Risk:** `sdk.finish()` timing — the win end card calls it on
mount to keep the CTA install inside the user gesture; on the lose path, decide whether the Defeat overlay
or only the eventual end card calls `finish()`, so TRY AGAIN's re-run + the win end card still open the
store synchronously on tap.

## Testing

- **TDD (unit):** rig/controller defeat path — lose mode latches `defeat` not `victory`; hero HP reaches 0;
  boss is NOT killed (survives at its sliver); defeat happens past `minMs` and below the finale threshold;
  `outcome==='win'` is byte-identical (existing 138 tests stay green; `makeController` defaults `outcome`
  to win). Add defeat-path tests mirroring the victory tests.
- **Batch sim:** extend `_batchsim.ts` with a `lose` outcome assertion set (hero dies, boss survives,
  defeat in the finale window) without breaking the win invariants.
- **E2E / screenshots (MANDATORY):** the death moment (hero falling, boss at a sliver), the Defeat overlay
  (tint + both buttons), TRY AGAIN → win → end card, DOWNLOAD → install gesture. Playwright via the dev
  bridge / built artifacts.
- `tsc` clash-royal stays at the 4-error baseline; `npm run check:textures` green; produced HTMLs ≤ 5MB.

## Risks / open questions (for red-team)

1. **Hero death animation** — does the hero spine ship a death/hurt clip? If not, the tween fallback must
   still read as a real death.
2. **TRY AGAIN full reset** — tearing down + rebuilding `CombatScene` (Spine physics/VRAM, ticker handlers,
   audio, the `__clashRoyal` dev bridge, window resize listeners) without leaks or double-mounts.
3. **`sdk.finish()` / install-gesture** ordering across defeat overlay → retry → win end card.
4. **Build mechanism** for two outcome artifacts (define vs variants dir; naming; network trees).
5. **"So close" guarantee** — the lethal blow must land while the boss is at its sliver in the finale, for
   every seed (interplay with `holdFinisher`, `minMs`, `finaleAccel`).
6. **Concurrent-session branch hygiene** — scoped commits only (shared `feature/clash-royal`).

## Red-team resolutions (2026-05-27)

Adversarial review grounded these into binding decisions:

**Build pipeline (C1 — the feature-sinker).** `build-all` discovers `variants/*.variant.js`; clash-royal
has none → it ships ONE `clash-royal_demo_*`. `build-parallel-worker.js` injects `PLAYABLE_TYPE` but NOT a
variant define (dice-blackjack proves the multi-variant rig is dev-only). **Decision:** add
`src/playables/clash-royal/variants/win.variant.js` + `lose.variant.js` (each exports its `outcome`);
teach `build-parallel-worker.js` to inject the variant's outcome as a build define (e.g. `CLASH_OUTCOME`);
clash-royal `getScript()` reads that define and returns `{...DEFAULT_CONFIG, outcome}`. Output names become
`clash-royal_win_*` / `clash-royal_lose_*` (the `demo` name goes away — note for any hosted-link refs).
**Hard gate:** the plan's FIRST verification is `node scripts/build-all.js --type clash-royal --network applovin`
emitting BOTH HTMLs with the correct outcome baked in, and no regression to other playables' builds. Build
this scaffolding before gameplay work.

**`sdk.finish()` / install gesture (C2).** The first `install()` while `!isFinished` defers the store open
out of the gesture (popup-blocked); the store only opens on a call after `isFinished` is true — that's why
`EndCardScene` pre-calls `sdk.finish()`. **Decision:** the **DefeatScene calls `sdk.finish()` on mount**
(so DOWNLOAD opens the store synchronously); **`CombatDirector` must NOT set `gameFinished=true` on the
defeat path** so the `sdk.on('finish')→showEndCard()` re-emit stays a no-op and the win end card never
mounts over the defeat screen. DefeatScene does NOT call `sdk.start()`. E2E asserts a synchronous store-open
on the first DOWNLOAD tap.

**Retry remount (C3/C4).** `SceneManager.push(_, 'replace')` only pauses + hides the previous scene; it
never calls `exit()`. A retry that stacks a fresh CombatScene over [DefeatScene over old CombatScene] leaves
the old scene's `CombatFx`/`ImpactFx` ticker handlers pumping (they're added to the director ticker, not
gated by container visibility) and orphans the `__clashRoyal` bridge. **Decision:** TRY AGAIN runs a bespoke
director teardown — explicitly `exit()` the DefeatScene AND the dead CombatScene, then mount a fresh
CombatScene (win mode); re-subscribe to the NEW scene's `done`; reset `endCardShown`/`gameFinished`. Do not
rely on `push('replace')` for the retry. Add a handler-count/leak check after retry. `CombatScene.done`
stays `Promise<void>`; the outcome is read via a `controller.isDefeat()`/scene getter at resolve time (not
threaded through the promise type).

**Lose hook point (M1).** Three victory latches exist: the in-loop natural killing-fire (deferred into
`playCast.onImpact`), the post-loop "boss dead before MIN" latch, and the `pastMax fireFinale()` backstop
(which force-kills everything). **Decision:** in lose mode keep `holdFinisher` permanently true (boss can
never be consumed); add a `defeatStarted` guard mirroring `finaleStarted`; the defeat sequence REPLACES both
the natural-kill path AND the `pastMax` backstop; the hero-death is sequenced/deferred like the deferred
victory so it lands after the boss's counter-blow, not mid-projectile.

**"So close" guarantee (M2/M5).** A damage-less deck can reach `maxMs` with the boss well above a sliver
(and `challengeProgress` would then cap below 0.75, so `CHALLENGE_PASS_75` wouldn't fire). **Decision:** in
lose mode, immediately before hero-death, force `enemyHp[0]` to `floor+1` so the boss is always at a visible
sliver. Batch-sim asserts at the defeat instant `bossHp(0) ∈ [1, smallFrac·maxHp]` across all seeds + a
damage-less deck.

**Hero-death visual (M3).** The runtime hero spine ships `Die` + `TakeHit` (no fake needed), but `CombatFx`
has no hero path and `killEnemy` fades alpha→0 (wrong for a hero). **Decision:** add `CombatFx.heroDeath()`
= boss lunge + a big red hit number on the hero + screen shake, THEN hero plays `Die` and settles (no full
alpha fade — the hero slumps and stays). Sequence on a fixed delay (the enemy-attack clip has no spine
event). MANDATORY Playwright screenshots of the death frame.

**Defeat latch + hold (M4).** `update()` resolves `done` only under `isVictory()`, and `step()` early-returns
on `victory`. **Decision:** add `controller.isDefeat()` (step early-returns on it too, freezing the sim during
the death hold) + a parallel defeat-hold branch in `CombatScene.update()` that resolves `done` after a
`DEFEAT_HOLD_MS` (≥ `Die` length + settle, likely > the 700ms `VICTORY_HOLD_MS`).

**Config field (m6).** Add `outcome?: 'win' | 'lose'` to `ClashConfig` as OPTIONAL; rig/controller treat it
as `cfg.outcome ?? 'win'`. Keeps every existing test config literal compiling (tsc clash-royal stays at 4).

**Dev override (m3).** `?outcome=` is `__DEV__`-gated (like dice-blackjack's `?variant=`), NOT prod-readable
like `?perf` — a shipped build must not let players flip the outcome.

**Retry skips onboarding (m4).** The win retry mounts with `gateFightUntilFirstPick=false` (and no onboarding
overlay) so it starts immediately — the player already learned the mechanic; re-showing the tutorial reads
as patronizing.

**Analytics note (m1).** `alAnalytics.fired` is module-global and persists across the retry, so the win
retry's end card contributes ZERO new funnel events (intended dedupe). The lose funnel = fight
`CHALLENGE_PASS_*` → `ENDCARD_SHOWN` on the DefeatScene → `CTA_CLICKED` on DOWNLOAD.
