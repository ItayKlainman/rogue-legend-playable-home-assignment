# Clash-Royal Ad — Iteration Roadmap & Execution Flow

**Date:** 2026-05-31 · **Status:** scoped, ready to execute in a FRESH conversation (one idea at a time).
Difficulty scored by a read-only fan-out that grounded each idea in the actual code (`scope-ad-iterations` workflow).

> Execute each idea in its OWN conversation. Start by resolving its **Open questions**, then follow its **Claude Code flow**. Use the **tiered verification** below — do NOT run the slow full E2E on every edit.

## Difficulty order (easiest → hardest)
1. **#2 Celebrate 3-of-a-kind** — S (3), in-place
2. **#3 Pop the app STORE at peak moments** — S–M (4), in-place *(re-scoped: "shop" = the app store / install CTA, NOT a game shop)*
3. **#4 Boss HP bar at top** — M (5), NEW variant
4. **#1 No-text damage onboarding** — M (5), in-place
5. **#5 Waves (minions → boss)** — M (5) but HIGH risk, NEW variant

---

## #2 — Celebrate collecting 3 of the same skill  · S (3) · in-place
**What:** when a skill reaches stack=3 (the 2→3 merge), fire an extra celebration on top of the existing merge burst.
**Files:** `ui/SkillQueue.ts` (`merge()` ~L276, after `tile.stack += 1`), `ui/MergeBurst.ts`, optional `combat/CombatFx.ts` (flash/vignette precedent), `audio/sfx.ts` (sting).
**Approach:** detect `newStack === 3` in `merge()` → spawn an enhanced MergeBurst (or flash + audio sting). Purely cosmetic UI; no controller/rig/model changes.
**Reuses:** MergeBurst, UnlockBurst/StarFillAnim patterns, CombatFx flash/vignette, sfx pool (powerUp/rise chimes).
**Risks:** "celebration" is vague — pick ONE concrete signal; don't make stack=3 feel like the cap (stack=4 is max).
**Variant:** no. **Verification tier:** 1 (screenshot the stack=3 moment) — no unit tests for UI anim.
**Open questions:** (a) which signal — bigger burst / flash / audio sting / combo? (b) "major stepping stone" not "you're maxed" intensity? (c) reuse existing star/sparkle assets or compose from primitives?
**Claude Code flow:** answer (a)–(c) → **single `frontend-design`/`components` subagent** implements + screenshot-validates. No spec/plan needed (small).

## #4 — Boss HP bar prominently at top  · M (5) · NEW variant
**What:** a build variant that renders a prominent top-anchored boss HP bar.
**Files:** `variants/topbar.variant.js` (NEW), `index.ts` (getScript), `config.ts` (`topBossHpBar?` flag), `scenes/CombatScene.ts` (instantiate/layout/update/destroy a 2nd HpBar), reuse `board-fight/HpBar.ts` (no change).
**Approach:** variant flag → in `enter()` instantiate a 2nd `HpBar` for `enemies[0]`, position top-center (~85% width), `setHp(boss.hp)` each frame, destroy on exit. No rig/controller changes.
**Reuses:** the battle-tested `HpBar` class; the proven win/lose `.variant.js` + `PLAYABLE_VARIANT` build pipeline.
**Risks:** mobile layout collision (occluding battle/enemy bars); variant naming (outcome-agnostic vs win/lose combos).
**Variant:** YES. **Verification tier:** 1 (screenshot the topbar variant, narrow + wide) + confirm `build-all.js` discovers `topbar.variant.js`.
**Open questions:** (a) outcome-agnostic, or topbar-win/topbar-lose combos? (b) bar dimensions/position/style (match actor bars or distinct)? (c) flag in DEFAULT_CONFIG vs variant-only? (d) mobile behavior?
**Claude Code flow:** decide variant-naming + style (a)–(d) → **subagent-driven** (variant wiring mirrors win/lose; HpBar reuse) → screenshot + variant-build check.

## #1 — No-text onboarding: hero takes damage + finger until first pick  · M (5) · in-place
**What:** drop the explanatory text card; hero takes damage and doesn't attack until the first pick; keep the finger + pulsing card.
**Files:** `scenes/CombatScene.ts` (`buildOnboarding()` — skip the text card; keep scrim/spotlight/coach), `config.ts` (early-damage config), `combat/CombatController.ts` (combat gate; early scare injection), `combat/RigDirector.ts` (early damage apply).
**Approach:** conditionally skip the tutorial text card; inject an early scare/damage on entry (reuse `scare.earlyHpFrac=0.50`); hero melee/deck-fire already hold while `combatLive=false` (no change), unlock on first pick (manual or idle auto-pick).
**Reuses:** spotlight-pulse + CoachHand, `combatLive` gate, scare plumbing (`fx.scare`/`fx.showDamage`/hp tweens), IdleClock.
**Risks:** scare-injection TIMING (must fire after fx ready / first `step()`); E2E hero-HP-at-frame-0 assertions may need updating (hero won't start at 900); lose mode suppresses scares (`outcome!=='lose'` guard) — keep the early-damage path consistent with that.
**Variant:** no (config/sequence; orthogonal to win/lose). **Verification tier:** 0 (unit: hero HP dips, melee/deck hold until pick) + 1 (screenshot: no text card; flow-invariants for the gate + no-revive).
**Open questions:** (a) opening damage = auto-scare (dip+recover) or a cosmetic HIT? (b) keep title/body in config (conditional render) or delete? (c) hero first swing after pick = normal chip or a beat of 0-dmg? (d) deck initial-cast timing on unlock?
**Claude Code flow:** **brainstorm** (a)–(d) → short **spec** → **subagent-driven-development** (config → render gate → early-damage injection → gates). Update the flow-invariants + lose-flow harnesses for the new opening HP.

## #5 — Waves: small enemies first, then boss + more  · M (5) HIGH-RISK · NEW variant
**What:** fight only minions first; after they die, the boss spawns with more enemies.
**Files:** `config.ts` (`waves` field), `combat/RigDirector.ts` (dynamic enemy/beat insertion — `insertWave()`), `scenes/CombatScene.ts` (spawn FightActors mid-fight + relayout), `combat/CombatFx.ts`, `variants/waves.variant.js` (NEW), `__tests__/_batchsim.ts`.
**Approach:** config-driven waves (enemies + beats + trigger); on the kill that clears wave-1, splice wave-2 enemies+beats into the rig and spawn their actors; keep beat-pointer/finisher/scare invariants intact.
**Reuses:** generic `targetIndex` beat indexing, `FightActor.create()` async pooling, round-robin enemy-attack picker, variant discovery.
**Risks (the reason it's high-risk):** beat-pointer sequencing on splice; scare-milestone realignment for the new boss; **finisher beat assumes a single final kill** — multiple boss enemies break it; async actor-spawn vs already-mutated `enemyHp` (desync); HP-bar relayout jitter; coin/deck-cap pacing tuned for the current arc.
**Variant:** YES. **Verification tier:** 0 (batch-sim is CRITICAL — wave invariants: every enemy dies, no infinite loop, `isVictory()` once, beatPtr never rewinds, finisher still works across 500+ seeds) + 2 (flow E2E: enemies appear in order, layout after spawn, scares fire right).
**Open questions:** (a) trigger = "all wave-1 minions dead" or "N kills"? (b) wave-2 = single boss or boss+minions (drives finisher + scare logic)? (c) carry deck/coins seamlessly or a "Wave 2" transition beat? (d) reuse skeletonWarrior/King assets or new enemy types (catalog.ts + Spine paths)?
**Claude Code flow:** **brainstorm → spec → red-team the spec** (the beat-pointer/finisher/scare risks are exactly red-team territory) → **writing-plans → subagent-driven-development**. Lean hardest on the batch-sim wave invariants.

## #3 — Pop the app STORE (install CTA) at peak-engagement moments  · S–M (4) · in-place
**What (re-scoped per the user):** "shop" = the **app store / install CTA**, NOT a game shop. Surface the store at exciting mid-battle moments (pace increase / after spammy-skill volleys / boss low) — a conversion experiment beyond the terminal end-card / defeat CTA. This is MUCH simpler than the modal-shop the raw scoping assumed: **no pause, no game-shop modal** — it reuses the store-open we already built.
**Files:** `combat/CombatController.ts` (moment triggers: finaleAccel threshold, `onEnemyKilled`, boss-HP threshold), `scenes/CombatScene.ts` (optional light non-blocking "tap to install" prompt/banner + trigger wiring), `@shared/mraidInstall` (`safeInstall`), `@shared/alAnalytics` (`CTA_CLICKED`).
**Approach:** detect the interesting moments in `step()`/callbacks → fire `safeInstall()` (reuses the proven store-open + `CTA_CLICKED` + the `sdk.finish()` synchronous-open path from the lose CTAs) OR show a non-blocking tappable store prompt that calls `safeInstall()` on tap. Add a cooldown/max-count so it doesn't nag. Do NOT pause the fight or build a game shop.
**Reuses:** `safeInstall()` (store open + `CTA_CLICKED`), the **CTA→store→win-on-return** pattern already built for the lose card (`CombatDirector.ctaToStoreThenWinOnReturn`/`armWinOnReturn`), the analytics funnel (CTA_CLICKED is deduped — multiple prompts won't multi-count), the moment signals (finaleAccel, `onEnemyKilled`, rig boss-HP).
**Risks:** a full auto-redirect mid-fight is disruptive — prefer a **non-blocking tappable prompt** (or only redirect on explicit tap); frequency/cooldown to avoid nagging; must not break the terminal win/lose CTAs; if it auto-redirects, pair with the win-on-return resume so a bounce-back continues the fight.
**Variant:** no. **Verification tier:** 0 (analytics: `CTA_CLICKED` order + dedup) + 1 (prompt appears at the right moments; store-open fires on tap; fight not broken).
**Open questions:** (a) full auto-redirect to store, or a non-blocking "tap to install" prompt/banner the player can ignore? (b) exact trigger moments — finale start / each spammy volley / boss < X% / minion kill? (c) cooldown / max-count so it doesn't nag? (d) overlay non-blocking (fight keeps running) — confirm NOT a pause? (e) keep the end-card/defeat CTA as the terminal regardless?
**Claude Code flow:** **brainstorm the UX** (a)–(e) → short spec → **subagent-driven-development** (trigger hooks + `safeInstall`/prompt; reuse the win-on-return wiring) → analytics verify (Tier 0) + screenshots. No red-team/pause-desync needed — it's a CTA-trigger, not a fight-state modal.

---

## Tiered verification (use this — don't run the slow full E2E on every edit)
The flow-invariants harness runs under **swiftshader (software GL)** driving **real-time** fights (~40s/idle run) — a full pass is 6–15 min. Reserve it.

- **Tier 0 — instant, every edit:** `npx tsc --noEmit | grep -c clash-royal` (baseline 4) · `npm run test:<suite>` · `node --import tsx --import .../__tests__/setup.ts .../__tests__/_batchsim.ts` (1000s of seeds, numeric/logic invariants in <1s). **Most correctness lives here** — add new invariants here first.
- **Tier 1 — fast smoke, ~1 min, per visual change:** `node tests/pw/clash-royal-flow-invariants.mjs --fast` (1 seed, aggressive cadence only, reuse running dev server) + targeted screenshots.
- **Tier 2 — full, ~10 min, PRE-MERGE only:** `node tests/pw/clash-royal-flow-invariants.mjs` (multi-seed + idle) + `clash-royal-lose-flow-shot.mjs` + prod-artifact smoke. Run ONCE before shipping.

**Rules:** don't re-run a harness 2–3× for "stability" unless a fix is genuinely timing-dependent (deterministic fixes need one pass). Per-item, add the idea's specific invariants to Tier 0 (batch-sim) and Tier 1 (flow-invariants) so regressions are caught cheaply.

## Build / ship (per [[project-clash-royal-playable]])
Variants auto-discover from `variants/*.variant.js`. Build all networks: `node scripts/build-all.js --type clash-royal --network <applovin|unity|google|moloco>` (Moloco = single inlined HTML, FB-protocol CTA). Revert `build.json` after. Deliverables to Desktop start with `asaf_`.
