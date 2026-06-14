# Clash-Royal — "Simple 3" Parallel Execution Brief (turnkey)

**Date:** 2026-05-31 · **Status:** decisions LOCKED, ready to execute in a FRESH conversation.
**Scope:** the three simplest ad iterations — **#2 (3-of-a-kind celebrate)**, **#3 (store CTA at peak moments)**, **#4 (top boss HP bar)** — built **in parallel git worktrees**, **one PR each off `main`**.
Full per-item context (files, risks, reuses) is in the companion roadmap: `docs/superpowers/plans/2026-05-31-clash-royal-iterations-roadmap.md`.
The two harder iterations — **#1 (no-text damage onboarding)** and **#5 (waves)** — are NOT in this batch; they're interactive (brainstorm / red-team) and run sequentially later, each in its own conversation.

> Read this brief, the roadmap, and the memory `project-clash-royal-iterations`, then execute. Decisions below are already made — do NOT re-ask them. Defaults are intentional; only revisit on screenshot evidence.

---

## Locked decisions (do not re-litigate)

### #2 — Celebrate collecting 3 of the same skill · S · in-place
- **Signal:** an **enhanced MergeBurst + a rising audio chime/sting** on the 2→3 merge. Bigger than the normal merge burst, reusing existing particle + sfx primitives.
- **Intensity:** **stepping-stone**, NOT climax — must NOT read as "you're maxed" (stack=**4** is the real cap). Leave clear visual headroom for the cap moment.
- **Assets:** reuse existing star/sparkle assets + the sfx pool (powerUp/rise chimes) — compose, don't author new art.

### #3 — Pop the app STORE at peak moments · S–M · in-place
- **"shop" = the app store / install CTA, NOT a game shop.**
- **Behavior:** **auto-redirect to the store** at the trigger (via `safeInstall()`), **paired with the existing win-on-return resume** so a bounce-back continues the fight.
- **Trigger:** **after a spammy skill volley** — when the player rapid-fires a burst of skills (the "engaged and having fun" moment). Detect a burst of casts within a short window.
- **Cooldown/cap:** apply a **cooldown + max-count** so it fires at most a small number of times and never nags.
- **Terminal CTA:** **keep** the existing end-card / defeat CTA as the terminal regardless — this mid-fight redirect is additive.

### #4 — Boss HP bar prominently at top · M · NEW variant
- **Variant:** a **single outcome-agnostic `topbar` variant** (works for win or lose — no topbar-win/topbar-lose split).
- **Style:** **distinct + prominent**, **top-center**, **mobile-safe** (must not collide/occlude the existing battle/enemy actor bars on narrow screens). Reuse `board-fight/HpBar.ts` unchanged.

---

## Parallel-worktree orchestration (the flow)

These three are **independent branches off `main`** and never stack — perfect for parallel worktrees.

**1. Create three worktrees off `main`** (the repo already uses `.claude/worktrees/`):
```bash
git worktree add .claude/worktrees/cr-iter2-3ofakind  -b feature/cr-iter2-3ofakind  main
git worktree add .claude/worktrees/cr-iter3-store-cta  -b feature/cr-iter3-store-cta main
git worktree add .claude/worktrees/cr-iter4-topbar     -b feature/cr-iter4-topbar    main
```

**2. Dispatch one opus subagent per worktree, in parallel** (memory: subagents use `model: "opus"`). Each subagent works ONLY inside its worktree path, implements its iteration per the locked decisions above + the roadmap's "Files/Approach/Reuses", and runs its verification tier before reporting back. Give each agent: the worktree absolute path, this brief's locked decisions for its iteration, and the relevant roadmap section.

**3. Orchestrator reviews each agent's screenshots** (screenshot validation is MANDATORY for every visual change — memory `feedback-screenshot-validate-visual-changes`). Re-run Tier 2 once per branch pre-PR if visual.

**4. One PR per branch into `main`** (Bitbucket — `gh` does NOT work here; use the push-output PR link / Bitbucket PR-create URL). NEVER force-push; never `git add -A` (scope each add). Commit footer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**5. Clean up** (memory `feedback-agents-clean-up-and-no-leaks`): kill any dev servers the agents started, delete temp screenshots/scratch, remove dead code, and `git worktree remove` each worktree once its PR is open. Monitor agents — a subagent at 0% CPU is hung; intervene, don't let it leak tokens.

**PARALLEL PORT GOTCHA (important):** the Playwright/screenshot/harness scripts each spawn their OWN dev server on a HARDCODED port (live dev `3000`, `clash-royal-flow-invariants.mjs` `3025`, `clash-royal-lose-flow-shot.mjs` `3015`, playthrough `3013`) — there is no env/CLI port override in the `.mjs` files. So **Tier-0 (tsc + unit + batch-sim) is fully parallel-safe across all 3 worktrees, but the dev-server-backed visual steps are NOT** — two agents booting the same script at once collide on the port. Mitigation: either **stagger** the Tier-1 screenshot/harness runs (one server-backed verification at a time), or have each agent screenshot against its own ad-hoc dev server on a **distinct port** (e.g. 3041/3042/3043) in its worktree. Let the heavy parallelism be the implementation + Tier-0; serialize (or port-isolate) only the screenshot step.

---

## Per-iteration build notes (paired with the roadmap)

### #2 (worktree: cr-iter2-3ofakind)
- **Files:** `ui/SkillQueue.ts` (`merge()` ~L276, right after `tile.stack += 1`), `ui/MergeBurst.ts`, `audio/sfx.ts` (chime), optional `combat/CombatFx.ts` (flash precedent — only if needed).
- **Do:** detect `newStack === 3` in `merge()` → fire the enhanced burst + chime. Cosmetic only — no controller/rig/model changes.
- **Verify:** **Tier 1** — screenshot the stack=3 moment (and confirm stack=4 still reads as the bigger cap). No new unit tests needed for UI anim. Flow: single `components`/`frontend-design` subagent, no spec/plan.

### #3 (worktree: cr-iter3-store-cta)
- **Files:** `combat/CombatController.ts` (detect spammy-volley in `step()`/cast callbacks; cooldown/max-count state), `CombatDirector.ts` (reuse `ctaToStoreThenWinOnReturn` / `armWinOnReturn`), `@shared/mraidInstall` (`safeInstall`), `@shared/alAnalytics` (`CTA_CLICKED`).
- **Do:** count casts within a short rolling window → on a "volley" threshold, fire the auto-redirect (`safeInstall()` + arm win-on-return), gated by cooldown + max-count. Do NOT pause the fight; do NOT break the terminal CTAs.
- **Verify:** **Tier 0** (analytics: `CTA_CLICKED` order + dedup — it's deduped, so multiple triggers won't multi-count; add a batch-sim/unit invariant for the volley detector + cooldown) + **Tier 1** (redirect fires on a volley at the right moment; win-on-return resumes; fight intact). Flow: short spec → subagent-driven-development.

### #4 (worktree: cr-iter4-topbar)
- **Files:** `variants/topbar.variant.js` (NEW), `index.ts` (getScript maps the variant), `config.ts` (`topBossHpBar?` flag, variant-only), `scenes/CombatScene.ts` (instantiate/layout/update/destroy a 2nd `HpBar` for `enemies[0]`, top-center), reuse `board-fight/HpBar.ts` (no change).
- **Do:** variant flag → in `enter()` build a 2nd `HpBar`, position top-center (~85% width), `setHp(boss.hp)` each frame, destroy on exit. No rig/controller changes.
- **Verify:** **Tier 1** — screenshot the `topbar` variant narrow + wide (confirm no collision with actor bars) + confirm `scripts/build-all.js` auto-discovers `topbar.variant.js`. Flow: subagent-driven (mirror the win/lose variant wiring).

---

## Verification tiers (don't run the slow full E2E on every edit)
- **Tier 0 — instant, every edit:** `npx tsc --noEmit | grep -c clash-royal` (baseline 4) · `npm run test:clash-royal` · batch-sim (`__tests__/_batchsim.ts`, 1000s of seeds in <1s). Add each iteration's new invariants here first.
- **Tier 1 — ~1 min, per visual change:** `node tests/pw/clash-royal-flow-invariants.mjs --fast` (1 aggressive seed, reuse running dev server) + targeted screenshots.
- **Tier 2 — ~10 min, PRE-PR only:** full `clash-royal-flow-invariants.mjs` (multi-seed + idle) + `clash-royal-lose-flow-shot.mjs` + prod-artifact smoke. Once per branch.
- Deterministic fixes need ONE pass — don't re-run 2–3× for "stability".

## Build / ship (only when shipping a variant — #4)
Variants auto-discover from `variants/*.variant.js`. All networks:
`node scripts/build-all.js --type clash-royal --network <applovin|unity|google|moloco>` (Moloco = single inlined HTML, FB-protocol CTA). Revert `build.json` after. Desktop deliverables start with `asaf_`.
