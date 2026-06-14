# Clash-Royal Forced-Lose Variant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a build-selectable forced-LOSE outcome where the hero dies in a "so close" reversal during the spammy finale, ending in a Defeat overlay (TRY AGAIN winnable-retry + DOWNLOAD), while the WIN variant is unchanged and the pipeline emits both `clash-royal_win_*` and `clash-royal_lose_*`.

**Architecture:** A `cfg.outcome` flag (default `'win'`). The lose fight is identical to the win until the killing-blow instant; then the boss is forced to a sliver and survives, a lethal counter drains the hero to 0 (`Die` anim), and the controller latches `defeat`. The director shows a `DefeatScene` (UI by a dispatched frontend-design agent); TRY AGAIN tears down and re-mounts the combat in win mode (no onboarding); DOWNLOAD installs. Two build artifacts via `variants/*.variant.js` + a `PLAYABLE_VARIANT` build define.

**Tech Stack:** TypeScript, PIXI v8, @smoud/playable-sdk + playable-scripts, node:test, Playwright (headless swiftshader), sharp.

**Spec:** `docs/superpowers/specs/2026-05-27-clash-royal-lose-variant-design.md` — read it first; it carries the red-team resolutions this plan implements.

**Conventions:** Shared branch `feature/clash-royal` — scoped `git add <paths>` only, never `-A`. Keep `npx tsc --noEmit 2>&1 | grep -c clash-royal` == 4. `npm run check:textures` green. `npm run test:clash-royal` all green. Validate every visual change with Playwright screenshots (memory: screenshot-validate). Subagents dispatched with model `opus`.

---

## Task 1: Build scaffolding — two outcome artifacts (HARD GATE — do this first)

Per red-team C1, the batch builder cannot emit two clash-royal artifacts today. Prove it can before any gameplay work.

**Files:**
- Create: `src/playables/clash-royal/variants/win.variant.js`
- Create: `src/playables/clash-royal/variants/lose.variant.js`
- Modify: `scripts/build-parallel-worker.js` (inject `PLAYABLE_VARIANT` define)
- Modify: `src/playables/clash-royal/index.ts` (`getScript` reads the variant → outcome)
- Modify: `src/playables/clash-royal/config.ts` (add optional `outcome`)

- [ ] **Step 1: Add the optional config field.** In `config.ts`, add to the `ClashConfig` interface (near `gateFightUntilFirstPick`):

```ts
  /** Build-selected outcome. 'win' (default) = current rigged win; 'lose' = "so close" forced loss.
   *  Optional so existing config literals/tests stay valid; code treats absent as 'win'. */
  outcome?: 'win' | 'lose';
```
Do NOT set it in `DEFAULT_CONFIG` (absent ⇒ 'win'); the build injects it via `getScript`.

- [ ] **Step 2: Create the two variant marker files.** For clash-royal (not board-fight) the variant.js is only a discovery marker for `build-all.js discoverVariants`; the outcome is carried by the injected `PLAYABLE_VARIANT` define.

`win.variant.js`:
```js
// clash-royal WIN variant — the rigged victory (current behavior). Marker file: build-all.js
// discovers *.variant.js; the outcome is injected via the PLAYABLE_VARIANT build define and
// read in src/playables/clash-royal/index.ts getScript().
module.exports = { outcome: 'win' };
```
`lose.variant.js`:
```js
// clash-royal LOSE variant — "so close" forced loss. See win.variant.js for the mechanism.
module.exports = { outcome: 'lose' };
```

- [ ] **Step 3: Inject `PLAYABLE_VARIANT` in the parallel worker.** In `scripts/build-parallel-worker.js`, immediately after the line `sdkOptions.defines.PLAYABLE_TYPE = JSON.stringify(type);`, add:

```js
    // Inject the variant name so playables can build-select behavior (clash-royal outcome).
    // Already declared in src/declarations.d.ts; dev path injects it via variant-build.js.
    sdkOptions.defines.PLAYABLE_VARIANT = JSON.stringify(variant);
```

- [ ] **Step 4: Read the variant in clash-royal `getScript`.** Replace `index.ts` `getScript`:

```ts
  async getScript() {
    // PLAYABLE_VARIANT is the variant filename ('win' | 'lose' for clash-royal, 'demo' fallback).
    const variant = typeof PLAYABLE_VARIANT === 'string' ? PLAYABLE_VARIANT : 'win';
    const outcome: 'win' | 'lose' = variant === 'lose' ? 'lose' : 'win';
    return { ...DEFAULT_CONFIG, outcome };
  },
```

- [ ] **Step 5: HARD GATE — build and verify two artifacts.**

Run: `node scripts/build-all.js --type clash-royal --network applovin`
Expected: `Build complete: 2 succeeded, 0 failed` and two files exist:
```bash
ls -1 dist/AppLovin/clash-royal/*.html | sed -E 's#.*/##'
```
Expected: a `clash-royal_win_*_AL.html` AND a `clash-royal_lose_*_AL.html`, each ≤ 5 MB (`wc -c`). Confirm the `demo` name is gone.

- [ ] **Step 6: Regression-check other playables still build.**

Run: `node scripts/build-all.js --type end_card --network applovin` and `--type board-fight --network applovin`
Expected: both still `succeeded` (the `PLAYABLE_VARIANT` injection is additive; dice-blackjack/board-fight read it already or ignore it).

- [ ] **Step 7: Verify `outcome` is actually baked in.** Grep each built HTML for a unique token proving the define flowed (the minified bundle will contain the string literal):
```bash
grep -c '"lose"' dist/AppLovin/clash-royal/clash-royal_lose_*_AL.html
```
Expected: ≥ 1 in the lose build. (Sanity only; the E2E in Task 9 is authoritative.)

- [ ] **Step 8: Commit.**
```bash
git add src/playables/clash-royal/variants/win.variant.js src/playables/clash-royal/variants/lose.variant.js scripts/build-parallel-worker.js src/playables/clash-royal/index.ts src/playables/clash-royal/config.ts
git commit -m "build(clash-royal): outcome variants (win/lose) via PLAYABLE_VARIANT define"
```

---

## Task 2: RigDirector — defeat resolution (force sliver + lethal hero blow)

**Files:**
- Modify: `src/playables/clash-royal/combat/RigDirector.ts`
- Test: `src/playables/clash-royal/__tests__/RigDirector.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `RigDirector.test.ts`:

```ts
test('resolveHeroDeath forces the boss to a sliver and drains the hero to 0 (defeat)', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); // RigDirector.test already imports DEFAULT_CONFIG
  const rig = new RigDirector(cfg, mulberry32(1));
  const out = rig.resolveHeroDeath();
  assert.equal(rig.heroCurrentHp(), 0, 'hero drained to 0 (floor overridden)');
  assert.ok(rig.currentHp(0) > 0, 'boss SURVIVES (not killed)');
  assert.ok(rig.currentHp(0) <= cfg.enemies[0].maxHp * 0.08, 'boss forced to a sliver for "so close"');
  assert.equal(rig.isDefeat(), true);
  assert.equal(rig.isVictory(), false, 'defeat is not victory');
  assert.equal(out.heroHpBefore >= 0, true);
});
```
(If `RigDirector.test.ts` lacks `mulberry32`/`DEFAULT_CONFIG` imports, add them: `import { mulberry32 } from '../rng'; import { DEFAULT_CONFIG } from '../config';`.)

- [ ] **Step 2: Run it — expect FAIL.**
Run: `node --import tsx --import src/playables/clash-royal/__tests__/setup.ts --test src/playables/clash-royal/__tests__/RigDirector.test.ts`
Expected: FAIL — `rig.resolveHeroDeath is not a function`.

- [ ] **Step 3: Implement.** In `RigDirector.ts` add a field `private defeat = false;`, a getter `isDefeat(): boolean { return this.defeat; }`, and the method:

```ts
/** Lose-variant climax: force the boss to a visible sliver (so the "so close" is guaranteed for
 *  ANY deck/seed — see red-team M2), then drain the hero to 0, OVERRIDING SAT_MIN_HERO_HP. The
 *  boss is NOT killed. Returns the pre-death hero HP for the bridge's drain tween. */
resolveHeroDeath(): { heroHpBefore: number } {
  const before = this.heroHp;
  const bossMax = this.cfg.enemies[0].maxHp;
  if (this.enemyHp[0] > bossMax * 0.05) this.enemyHp[0] = Math.max(1, Math.round(bossMax * 0.03));
  this.dangerActive = false;
  this.dangerKind = null;
  this.heroHp = 0; // lethal — intentionally below SAT_MIN_HERO_HP (lose-only path)
  this.defeat = true;
  return { heroHpBefore: before };
}
```

- [ ] **Step 4: Run it — expect PASS** (same command). Then run the full RigDirector file — all green.

- [ ] **Step 5: Commit.**
```bash
git add src/playables/clash-royal/combat/RigDirector.ts src/playables/clash-royal/__tests__/RigDirector.test.ts
git commit -m "feat(clash-royal): RigDirector.resolveHeroDeath (lose climax — boss sliver + hero to 0)"
```

---

## Task 3: CombatController — lose hook, defeat latch, sim freeze

Per red-team M1: keep the finisher held forever in lose mode; replace BOTH the natural-kill path and the `pastMax` backstop with the defeat sequence; add `isDefeat()`; freeze the sim on defeat.

**Files:**
- Modify: `src/playables/clash-royal/combat/CombatController.ts`
- Modify: `src/playables/clash-royal/__tests__/CombatController.test.ts` (add `outcome` to `makeController` opts)
- Add to the `CombatFxBridge` interface: `heroDeath(heroHpBefore: number): void;`

- [ ] **Step 1: Extend the fx bridge + test harness.** In `CombatController.ts` add to `CombatFxBridge`:
```ts
  /** Lose-variant: the boss's lethal counter — big red hit on the hero + screen shake, then the
   *  hero plays its Die anim and settles (NO full fade). Drives the hero HP-bar drain to 0. */
  heroDeath(heroHpBefore: number): void;
```
In `CombatController.test.ts` `makeFx()`, add `heroDeath: () => { rec.heroDeaths = (rec.heroDeaths ?? 0) + 1; },` and a `heroDeaths: 0` field on `rec`. In `makeController` opts add `outcome?: 'win' | 'lose'` and set `c.outcome = opts?.outcome;` (absent ⇒ win).

- [ ] **Step 2: Write the failing tests.** Add to `CombatController.test.ts`:
```ts
test('lose outcome: hero dies at the finale, boss survives, defeat (not victory)', () => {
  const { ctrl, fx } = makeController({ startCoins: 50, regen: 50, coinMax: 200, outcome: 'lose' });
  ctrl.beginOnboarding();
  let t = 0; while (!ctrl.isDefeat() && !ctrl.isVictory() && t < 90000) { ctrl.step(100); t += 100; const a = ctrl.affordableSlots(); if (a.length) ctrl.tapSlot(a[0]); }
  assert.equal(ctrl.isDefeat(), true, 'reaches defeat');
  assert.equal(ctrl.isVictory(), false, 'never victory in lose mode');
  assert.equal(ctrl.heroHp(), 0, 'hero died');
  assert.ok(ctrl.currentEnemyHp(0) > 0, 'boss survived (not killed)');
  assert.ok(t >= 17000, 'defeat lands past minMs (during the finale)');
  assert.equal(fx.heroDeaths, 1, 'death announced exactly once');
});

test('lose outcome with a damage-less deck still reaches defeat by the backstop (boss never wins)', () => {
  const { ctrl } = makeController({ startCoins: 0, regen: 0, outcome: 'lose' });
  let t = 0; while (!ctrl.isDefeat() && !ctrl.isVictory() && t < 60000) { ctrl.step(100); t += 100; }
  assert.equal(ctrl.isDefeat(), true);
  assert.equal(ctrl.isVictory(), false, 'MAX backstop must NOT produce a win in a lose build');
});

test('win outcome (default) is unaffected — still reaches victory, never defeat', () => {
  const { ctrl } = makeController(); ctrl.beginOnboarding();
  let t = 0; while (!ctrl.isVictory() && t < 90000) { ctrl.step(100); t += 100; const a = ctrl.affordableSlots(); if (a.length) ctrl.tapSlot(a[0]); }
  assert.equal(ctrl.isVictory(), true);
  assert.equal(ctrl.isDefeat(), false);
});
```

- [ ] **Step 3: Run — expect FAIL** (`ctrl.isDefeat is not a function`).
Run: `node --import tsx --import src/playables/clash-royal/__tests__/setup.ts --test src/playables/clash-royal/__tests__/CombatController.test.ts`

- [ ] **Step 4: Implement.** In `CombatController.ts`:
  - Add fields: `private defeat = false; private defeatStarted = false;` and getter `isDefeat(): boolean { return this.defeat; }`.
  - Add `private get lose(): boolean { return this.cfg.outcome === 'lose'; }`.
  - In `step()`, the victory early-return becomes: `if (this.victory || this.defeat) return;`.
  - Where `pastMin` is computed, force the finisher held forever in lose mode at the `resolveCast` call: change `holdFinisher: !pastMin` to `holdFinisher: this.lose || !pastMin`.
  - Replace the natural-kill latch block (`if (outcome.kills && this.rig.isVictory() && pastMin && !this.finaleStarted)`) so that in lose mode, once `pastMin` AND the rig is at the finisher beat (`this.rig.atFinisherBeat()`) and below the finale threshold, it calls `this.triggerDefeat()` and `break`s instead. In win mode, unchanged.
  - Replace the `pastMax` backstop branch: in lose mode call `this.triggerDefeat()` instead of `this.fireFinale()`.
  - Add:
```ts
private triggerDefeat(): void {
  if (this.defeatStarted) return;
  this.defeatStarted = true;
  const { heroHpBefore } = this.rig.resolveHeroDeath();
  this.fx.heroDeath(heroHpBefore);
  this.defeat = true; // latched; step() now early-returns (sim frozen during the death hold)
}
```
  - Guard: in lose mode the deck loop must not consume the finisher (the `holdFinisher` change already prevents the kill); ensure no path sets `this.victory` when `this.lose`.

- [ ] **Step 5: Run — expect PASS** (the 3 new tests + the whole file green; the 142 existing tests unaffected because `outcome` defaults to win and `makeController`/`makeHealHoldController` leave it absent).

- [ ] **Step 6: Run the full clash-royal suite + tsc.**
Run: `npm run test:clash-royal` → all pass. `npx tsc --noEmit 2>&1 | grep -c clash-royal` → 4.

- [ ] **Step 7: Commit.**
```bash
git add src/playables/clash-royal/combat/CombatController.ts src/playables/clash-royal/__tests__/CombatController.test.ts
git commit -m "feat(clash-royal): controller lose hook — defeat latch, finisher held, backstop replaced"
```

---

## Task 4: CombatFx.heroDeath + CombatScene defeat render + done outcome

**Files:**
- Modify: `src/playables/clash-royal/combat/CombatFx.ts` (add `heroDeath`)
- Modify: `src/playables/clash-royal/scenes/CombatScene.ts` (defeat hold + done outcome + bridge)

- [ ] **Step 1: Add `CombatFx.heroDeath`.** Implement the bridge method: play the front enemy's attack lunge toward the hero, show a big red hit number on the hero (`showDamage('self', -1, heroHpBefore, false)` styled as the crit/big-hit, reuse `Crit`/red number), trigger a screen shake (reuse the existing shake used on impacts if present; else a short container offset tween on `this.battleArea`), then after a fixed ~350ms delay play the hero actor's `Die` animation (`hero.character.spine.state.setAnimation(0, 'Die', false)`) and hold it (do NOT fade alpha to 0 — the hero slumps and stays). Sequence on fixed timers (the enemy attack clip has no spine event — see the Dodge comment in `CombatFx.enemyAttack`).

- [ ] **Step 2: CombatScene — defeat hold + done outcome.** In `CombatScene.ts`:
  - Add `private outcomeResult: 'win' | 'defeat' = 'win';` and a getter `result(): 'win' | 'defeat' { return this.outcomeResult; }`.
  - In `update()`, add a defeat branch parallel to the victory branch: `if (controller.isDefeat() && !this.doneResolved)` → accumulate a `DEFEAT_HOLD_MS` (const = 1400; ≥ `Die` length + settle) then `this.outcomeResult = 'defeat'; this.resolveDone();` once.
  - The CombatFxBridge passed to the controller already maps to `CombatFx`; add `heroDeath: (hp) => this.fx.heroDeath(hp)` to the bridge wiring.
  - `done` stays `Promise<void>`; the director reads `scene.result()` after `done` resolves (red-team C4).

- [ ] **Step 3: Screenshot-validate the death (MANDATORY).** Build the lose artifact and Playwright-drive it (active picks) to the death; capture the death frame (hero `Die` + boss at sliver + big red number) and the ~1s after. Save to `/var/tmp`, view, confirm it reads as a real death (not a vanish/bug). Adjust timing/shake if it reads fake. (Use the established headless-swiftshader + sharp harness pattern; the lose build has no `__clashRoyal` bridge in prod, so drive by waiting + tapping the slot screen-coords, OR add a temporary `?outcome=lose` dev-server run which DOES have the bridge.)

- [ ] **Step 4: Commit.**
```bash
git add src/playables/clash-royal/combat/CombatFx.ts src/playables/clash-royal/scenes/CombatScene.ts
git commit -m "feat(clash-royal): hero-death sequence (Die anim + counter-blow) + scene defeat hold"
```

---

## Task 5: DefeatScene overlay (UI by frontend-design agent)

**Files:**
- Create: `src/playables/clash-royal/scenes/DefeatScene.ts`

- [ ] **Step 1: Define the integration contract** (so the UI agent has a precise boundary). `DefeatScene implements Scene`, constructor `(width, height, opts: { onTryAgain: () => void; onDownload: () => void })`. On `enter()`: `sdk.finish()` (red-team C2 — makes DOWNLOAD's store-open synchronous) and `alTrack('ENDCARD_SHOWN')`; do NOT call `sdk.start()`. Renders a dark tint scrim over the frozen final frame + two buttons: **TRY AGAIN** → `opts.onTryAgain()`, **DOWNLOAD NOW** → `opts.onDownload()`. Standard `Scene` methods (`exit`, `update`, `layout`, `pause`, `resume`).

- [ ] **Step 2: Dispatch the frontend-design UI agent.** Use the Agent tool (model `opts: opus`) with `superpowers:frontend-design` knowledge to design + implement the overlay visuals INSIDE `DefeatScene.ts` against the contract above: a polished, on-theme defeat panel (dark red/black tint, "DEFEAT" / "SO CLOSE!" headline, the two buttons using the Components/ library where it fits — see the `components` skill + `EndCardScene`/`convexButton` for the button idiom). The agent MUST: load textures via `Assets.load` (never `Texture.from(importedUrl)` — see memory PIXI texture loading); keep the two callbacks wired exactly as named; screenshot-validate the overlay (Playwright). Give the agent the contract, the spec path, and the convexButton/Components references.

- [ ] **Step 3: Verify the agent's output** — tint + both buttons render, callbacks fire (temporary console.log on tap), `check:textures` green, tsc clash-royal still 4. Screenshot the overlay.

- [ ] **Step 4: Commit.**
```bash
git add src/playables/clash-royal/scenes/DefeatScene.ts
git commit -m "feat(clash-royal): DefeatScene overlay (tint + TRY AGAIN / DOWNLOAD, UI agent)"
```

---

## Task 6: CombatDirector — outcome branch, retry teardown/remount, dev override

Per red-team C2/C3/C4 + m3/m4.

**Files:**
- Modify: `src/playables/clash-royal/CombatDirector.ts`

- [ ] **Step 1: Branch on `done`.** Replace `void this.scene.done.then(() => { this.gameFinished = true; this.showEndCard(); })` with a handler that reads `this.scene.result()`:
  - `'win'` → `this.gameFinished = true; this.showEndCard();` (unchanged).
  - `'defeat'` → `this.showDefeat();` (do NOT set `gameFinished` — red-team C2, keeps `sdk.on('finish')→showEndCard()` a no-op).

- [ ] **Step 2: `showDefeat()`.** Mount `new DefeatScene(this.width, this.height, { onTryAgain: () => this.retryAsWin(), onDownload: () => safeInstall() })` via `this.sceneManager.push(defeat, 'replace')`. Import `safeInstall` from `@shared/mraidInstall`.

- [ ] **Step 3: `retryAsWin()` — explicit teardown + remount (red-team C3/C4/m4).**
  - `await this.defeatScene?.exit();` and `await this.scene.exit();` (call `exit()` explicitly — `push('replace')` does NOT, so do it here to stop the dead scene's `CombatFx`/`ImpactFx` ticker handlers + free Spine/VRAM + drop the `__clashRoyal` bridge).
  - Reset `this.endCardShown = false; this.gameFinished = false;`.
  - Build a win-mode, no-onboarding config: `const retryCfg = { ...this.script, outcome: 'win' as const, gateFightUntilFirstPick: false };`.
  - `this.scene = new CombatScene(retryCfg, this.ticker, this.width, this.height);` `await this.sceneManager.push(this.scene, 'replace');`
  - Re-subscribe: `void this.scene.done.then(() => { if (this.scene.result() === 'win') { this.gameFinished = true; this.showEndCard(); } });`
  - (CombatScene must suppress the onboarding overlay when `gateFightUntilFirstPick===false`; verify it already does, else add a guard so the retry skips the tutorial.)

- [ ] **Step 4: `?outcome=` DEV override.** In `init()`, `__DEV__`-gated only (red-team m3 — NOT prod-readable like `?perf`): `if (__DEV__) { const o = new URLSearchParams(location.search).get('outcome'); if (o === 'lose' || o === 'win') this.script = { ...this.script, outcome: o }; }`.

- [ ] **Step 5: Leak check after retry.** Add a temporary assertion/log of the director ticker's listener count before and after a retry (or count active `CombatFx` instances); confirm it returns to baseline (no double-pumping scene). Remove the temp log after confirming.

- [ ] **Step 6: tsc + tests.** `npx tsc --noEmit 2>&1 | grep -c clash-royal` → 4. `npm run test:clash-royal` → green.

- [ ] **Step 7: Commit.**
```bash
git add src/playables/clash-royal/CombatDirector.ts src/playables/clash-royal/scenes/CombatScene.ts
git commit -m "feat(clash-royal): director outcome branch + winnable retry remount + dev ?outcome"
```

---

## Task 7: Batch sim — lose invariants

**Files:**
- Modify: `src/playables/clash-royal/__tests__/_batchsim.ts`

- [ ] **Step 1: Add a lose pass.** Add a third pattern run that builds `cfg` with `outcome:'lose'` (keep `gateFightUntilFirstPick=false` like the existing sim) and asserts, across all seeds + a damage-less deck: `isDefeat()` true, `isVictory()` false, hero HP 0 at the end, `bossHp(0) ∈ [1, 0.08·maxHp]` (sliver), and the defeat lands `≥ minMs`. Reuse the existing `simulate` harness shape; add a `outcome` param.

- [ ] **Step 2: Run.**
Run: `node --import tsx --import src/playables/clash-royal/__tests__/setup.ts src/playables/clash-royal/__tests__/_batchsim.ts`
Expected: existing win invariants still `✅ ALL INVARIANTS HOLD`, AND the lose pass reports 100% defeat / boss-survives / sliver.

- [ ] **Step 3: Commit.**
```bash
git add src/playables/clash-royal/__tests__/_batchsim.ts
git commit -m "test(clash-royal): batch-sim lose invariants (defeat, boss sliver survives, no win)"
```

---

## Task 8: E2E validation — full lose flow + builds

**Files:**
- Create (kept harness): `tests/pw/clash-royal-lose-flow-shot.mjs`

- [ ] **Step 1: Dev-server E2E (has the `__clashRoyal` bridge).** Spawn `playable-scripts dev --port 3011`, load `?type=clash-royal&outcome=lose`. Drive to defeat (tap affordable slots). Assert via the bridge: `isDefeat`/`result`==='defeat' (expose a read on the bridge if needed), boss alive, hero HP 0. Screenshot: death frame, Defeat overlay (tint + both buttons). Then tap TRY AGAIN → assert a fresh fight runs and reaches WIN → standard end card screenshot. Then (separate run) tap DOWNLOAD → assert `window.__al` contains `CTA_CLICKED` and a store-open fired synchronously (stub `window.open`/`mraid.open`, assert called in the tap turn — red-team C2).

- [ ] **Step 2: Built-artifact smoke.** Serve `dist/AppLovin/clash-royal/clash-royal_lose_*_AL.html` via `file://`; confirm it loads with zero `pageerror`, runs to the death + Defeat overlay (drive by slot screen-coords, no bridge in prod). Confirm the WIN artifact still wins.

- [ ] **Step 3: Commit the harness.**
```bash
git add tests/pw/clash-royal-lose-flow-shot.mjs
git commit -m "test(clash-royal): Playwright lose-flow E2E (death, defeat overlay, retry-win, download)"
```

---

## Task 9: Final gate + ship builds

- [ ] **Step 1: Full gate.** `npm run test:clash-royal` (all green) · `npx tsc --noEmit 2>&1 | grep -c clash-royal` (==4) · `npm run check:textures` (green) · batch sim (win + lose invariants hold).
- [ ] **Step 2: Build both artifacts.** `node scripts/build-all.js --type clash-royal --network applovin` → `clash-royal_win_*` + `clash-royal_lose_*`, each ≤ 5 MB.
- [ ] **Step 3: Report** the two artifact paths + a screenshot of each outcome's terminal screen (win end card; defeat overlay). Offer to deploy to the Cloudflare tunnel.

---

## File Structure Summary

| File | Responsibility |
|---|---|
| `config.ts` | `outcome?` flag (optional, default win) |
| `variants/{win,lose}.variant.js` | build discovery markers |
| `scripts/build-parallel-worker.js` | inject `PLAYABLE_VARIANT` define |
| `index.ts` | map variant → `outcome` in `getScript` |
| `RigDirector.ts` | `resolveHeroDeath()` + `isDefeat()` (sliver + hero→0) |
| `CombatController.ts` | lose hook, `defeat` latch, finisher held, backstop replaced, `heroDeath` bridge |
| `CombatFx.ts` | `heroDeath()` visual (counter-blow + `Die` + shake) |
| `CombatScene.ts` | defeat hold + `result()` getter + retry onboarding skip |
| `DefeatScene.ts` (new) | tint overlay + TRY AGAIN / DOWNLOAD (UI agent); `sdk.finish()` on mount |
| `CombatDirector.ts` | outcome branch, retry teardown/remount, `?outcome` dev gate |
| `_batchsim.ts` | lose invariants |
| `tests/pw/clash-royal-lose-flow-shot.mjs` | E2E |

---

## Plan red-team corrections (BINDING — override the tasks above)

A red-team simulated the mechanic (works; "so close" holds; win suite byte-identical) but found the
sequencing breaks compilation and two steps hid real work. Apply these:

**[C1] Implement `CombatFx.heroDeath` in the SAME commit that adds it to `CombatFxBridge` — before the
controller hook.** `CombatFx implements CombatFxBridge`, so adding the method to the interface without the
impl pushes clash-royal tsc to 5 and the suite won't load. **Reorder:** do Task 4's `CombatFx.heroDeath`
FIRST (new Task "3a"), in one commit with the interface addition, AND add a `heroDeath` stub to **all three**
`CombatFxBridge` object literals — `CombatController.test.ts` `makeFx` **and** `timing.test.ts:6` **and**
`_batchsim.ts:23` (`heroDeath: () => {}`). Only then do the controller hook (Task 3). Use the repo idiom for
the death anim: `tryPlay(this.hero, ANIM_DEATH, false)` where `ANIM_DEATH` already exists at
`CombatFx.ts:36` (`['Dead','Death','Die','Dying']`) — not a raw `setAnimation`.

**[C2] Gate onboarding on the flag (the plan's "verify it already does" is FALSE).** `CombatScene.enter()`
calls `this.buildOnboarding()` unconditionally (`CombatScene.ts:350`). Add a concrete step: wrap it
`if (this.cfg.gateFightUntilFirstPick) this.buildOnboarding();` so the win retry (`gateFightUntilFirstPick:false`)
skips the tutorial scrim/coach. (`updateOnboarding` already early-returns when `!this.tutorialLayer`; the
coach block at `CombatScene.ts:809` is behind `!this.firstPickDone` and a `this.coach` guard — confirm it
no-ops with no tutorial layer.)

**[M1] The lose trigger is a NEW branch, not a tweak of the natural-kill latch** (which is DEAD under
permanent `holdFinisher` — `outcome.kills` is always false). Right after `const outcome =
this.rig.resolveCast(skill, { holdFinisher: this.lose || !pastMin });`:
```ts
if (this.lose && pastMin && this.rig.atFinisherBeat()) { this.triggerDefeat(); break; }
```
**CRITICAL companion:** in the `pastMax` backstop branch, lose mode must call `this.triggerDefeat()` INSTEAD
of `this.fireFinale()`. Forgetting this swap makes `fireFinale()` set `victory=true` → a WIN in the lose
build (the single highest-leverage correctness bug). Do NOT weaken the `pastMin` guard (defeat must land
≥ minMs, in the finale) — [M2].

**[M3] Extend the dev bridge for the defeat state** (Task 5/8 E2E depends on it; it's not free). In
`installDevBridge` (`CombatScene.ts:367`), make the `state` getter also return `'defeat'` when
`controller.isDefeat()` (currently only `'endcard' | 'won' | 'combat'`). Add as an explicit step in the
scene task.

**Minor fixes:** baseline is **138** existing tests (not 142) — Task 3 → 141 after +3. Use
`ctrl.currentEnemyHp(0)` (not `bossHp(0)`) in Task 7. Task 1 Step 7 grep is sanity-only — a `0` result is
NOT a failure (terser may fold the literal); rely on the Task 8 E2E. Retry leak-check (Task 6 Step 5): wait
a few frames before sampling (a HitEffect shake handler can self-remove ~200ms after `exit()`); also note
`SceneManager.stack` grows ~2 entries per retry but the exited scenes' heavy resources are freed and their
`update()` no-ops — benign for the single expected retry.

**Verdict after these fixes:** GO.
