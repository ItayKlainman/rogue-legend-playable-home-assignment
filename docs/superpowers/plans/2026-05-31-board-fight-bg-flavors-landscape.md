# Board-Fight BG Flavors + Landscape-Responsive Ad UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship board-fight fight-only (board-less) win+lose ad variants — one per available battle background, swapping background + that stage's enemies — with the ad-UI made landscape-responsive via a shared viewport helper, and the backgrounds exposed as a shared catalog.

**Architecture:** A small `src/shared/viewport.ts` (extracted from clash-royal's proven `readViewport` + window-listener pattern) is adopted by board-fight's `PlayableDirector` so orientation/chrome changes relayout the ad UI. The 8 battle backgrounds are exposed via a `src/shared/battleBgs/` re-export (NOT a move — a move would regenerate 239 imports and break egg-summon/egg-escalate). New fight variants are derived from existing files so the enemy roster ↔ `steps[]` actor-index coupling is preserved. clash-royal's adoption of the shared helper is a separate follow-up plan (after the iterations merge).

**Tech Stack:** TypeScript, PixiJS v8, `@smoud/playable-sdk`, `node --test` + `tsx` (NOT Jest/Vitest), Playwright (screenshots), board-fight codegen (`scripts/codegen.js`).

**Spec:** `docs/superpowers/specs/2026-05-31-board-fight-bg-flavors-landscape-design.md` (red-teamed).

**Hard guards (from the spec):**
- Never touch `FightEngine` actor layout / enemy scaling. Enemy swaps are **data-only**, derived from a file whose roster already matches its `steps[]` (preserve enemy COUNT + per-index roles).
- **Drop-if-broken:** any stage that can't render cleanly (missing asset/roster, mismatched steps, bad in landscape) is dropped + reported, never shipped hacked.
- `tsx` cannot resolve `assets/*` imports → modules that import assets are NOT unit-testable (verify those via build + screenshot, per `lessons.md`).

---

## File structure

| File | Responsibility | New/Mod |
|---|---|---|
| `src/shared/viewport.ts` | `readViewport()` (visualViewport-aware) + `installViewportListener()` | NEW |
| `src/shared/viewport.test.ts` | Unit tests for the helper (pure parts + listener wiring) | NEW |
| `src/shared/__tests__/run.mjs` | Add `viewport.test.ts` to the `--test` file list | MOD |
| `src/shared/battleBgs/index.ts` | Re-export the 8 board-fight battleBgs under stable keys | NEW |
| `src/playables/board-fight/PlayableDirector.ts` | Install the shared viewport listener; guard `resize()` against unchanged dims | MOD |
| `src/playables/board-fight/FightProgressBarH.ts` | Cap + center the progress bar in landscape | MOD |
| `src/playables/board-fight/variants/m2_fight_victory_splash.variant.js` | stage2 (goblin) fight-only WIN | NEW |
| `src/playables/board-fight/variants/m2_fight_defeat_splash.variant.js` | stage2 (goblin) fight-only LOSE | NEW |
| `src/playables/board-fight/variants/m7plain_fight_victory_splash.variant.js` | plain stage7 (`BattleBG.webp`) fight-only WIN | NEW |
| `src/playables/board-fight/variants/m7plain_fight_defeat_splash.variant.js` | plain stage7 fight-only LOSE | NEW |
| `tests/pw/board-fight-bg-shot.mjs` | Screenshot a variant in portrait + landscape | NEW |

---

## Task 1: Shared viewport helper (`src/shared/viewport.ts`) — TDD

**Files:**
- Create: `src/shared/viewport.ts`
- Test: `src/shared/viewport.test.ts`
- Modify: `src/shared/__tests__/run.mjs`

- [ ] **Step 1: Write the failing test** — Create `src/shared/viewport.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readViewport, installViewportListener } from './viewport.ts';

function withWindow(win: unknown, fn: () => void): void {
  const g = globalThis as { window?: unknown };
  const prev = g.window;
  g.window = win;
  try { fn(); } finally { g.window = prev; }
}

test('readViewport prefers visualViewport (rounded)', () => {
  withWindow({ innerWidth: 999, innerHeight: 999, visualViewport: { width: 410.6, height: 880.2 } }, () => {
    assert.deepEqual(readViewport(), { width: 411, height: 880 });
  });
});

test('readViewport falls back to innerWidth/innerHeight when no visualViewport', () => {
  withWindow({ innerWidth: 414, innerHeight: 896, visualViewport: undefined }, () => {
    assert.deepEqual(readViewport(), { width: 414, height: 896 });
  });
});

test('readViewport returns zeros outside the DOM', () => {
  withWindow(undefined, () => {
    assert.deepEqual(readViewport(), { width: 0, height: 0 });
  });
});

test('installViewportListener registers, fires onChange, and cleans up', () => {
  const events: Record<string, Array<() => void>> = {};
  const win = {
    innerWidth: 800, innerHeight: 400, visualViewport: undefined,
    addEventListener: (t: string, h: () => void) => { (events[t] ||= []).push(h); },
    removeEventListener: (t: string, h: () => void) => { events[t] = (events[t] || []).filter((x) => x !== h); },
  };
  withWindow(win, () => {
    let got: { w: number; h: number } | null = null;
    const cleanup = installViewportListener((w, h) => { got = { w, h }; });
    assert.equal(events['resize']?.length, 1);
    assert.equal(events['orientationchange']?.length, 1);
    events['resize'][0]();                         // simulate a resize event
    assert.deepEqual(got, { w: 800, h: 400 });
    cleanup();
    assert.equal(events['resize'].length, 0);
    assert.equal(events['orientationchange'].length, 0);
  });
});
```

- [ ] **Step 2: Wire the test into the runner** — In `src/shared/__tests__/run.mjs`, change the `--test` invocation to also run the new file:

```js
const result = spawnSync(
  'node',
  ['--import', 'tsx', '--import', SETUP, '--test',
    resolve(__dirname, 'SceneManager.test.ts'),
    resolve(__dirname, '../viewport.test.ts')],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
);
```

(Note: `safeArea.test.ts` is a pre-existing ORPHAN — `run.mjs` never ran it. Per surgical-changes, leave it; just flagging it for the user.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:shared`
Expected: FAIL — `Cannot find module './viewport.ts'` (or "readViewport is not a function").

- [ ] **Step 4: Implement `src/shared/viewport.ts`**

```ts
// Shared viewport helper. Reads the TRUE viewport (visualViewport-aware, so we don't
// render behind iOS browser chrome) and reacts to orientation / chrome changes the
// SDK resize can miss. Lifted from clash-royal's CombatDirector pattern so board-fight
// and clash-royal share one responsive logic. readViewport() reads globals only (no
// asset imports) → unit-testable under `node --test`.

export interface Viewport { width: number; height: number; }

/** True viewport size; prefers visualViewport, falls back to innerWidth/Height.
 *  Returns zeros in non-DOM (test/SSR) contexts. */
export function readViewport(): Viewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const vv = window.visualViewport;
  return {
    width: vv ? Math.round(vv.width) : window.innerWidth,
    height: vv ? Math.round(vv.height) : window.innerHeight,
  };
}

/** Call `onChange(width, height)` on resize / orientationchange / visualViewport resize.
 *  Returns a cleanup that removes every listener. No-op outside the DOM. */
export function installViewportListener(onChange: (width: number, height: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (): void => { const { width, height } = readViewport(); onChange(width, height); };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
  window.visualViewport?.addEventListener('resize', handler);
  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
    window.visualViewport?.removeEventListener('resize', handler);
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:shared`
Expected: PASS (SceneManager tests + the 4 new viewport tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/viewport.ts src/shared/viewport.test.ts src/shared/__tests__/run.mjs
git commit -m "feat(shared): viewport helper (readViewport + installViewportListener)"
```

---

## Task 2: Shared battleBgs re-export (`src/shared/battleBgs/index.ts`)

**Files:**
- Create: `src/shared/battleBgs/index.ts`

- [ ] **Step 1: Create the re-export** — re-export the 8 existing board-fight catalog modules (do NOT move them):

```ts
// Shared access to the board-fight battle backgrounds ("bg flavors") so any fight
// playable can use them. Thin re-export — the source modules stay in board-fight's
// catalog so its codegen lookup + the egg-summon/egg-escalate cross-imports keep working.
// PIXI v8: callers MUST `Assets.load(data)` before use (see lessons.md / check:textures).
export { default as stage1 } from '../../playables/board-fight/catalog/battleBgs/stage1';
export { default as stage2 } from '../../playables/board-fight/catalog/battleBgs/stage2';
export { default as stage3 } from '../../playables/board-fight/catalog/battleBgs/stage3';
export { default as stage4 } from '../../playables/board-fight/catalog/battleBgs/stage4';
export { default as stage5 } from '../../playables/board-fight/catalog/battleBgs/stage5';
export { default as stage6 } from '../../playables/board-fight/catalog/battleBgs/stage6';
export { default as stage7 } from '../../playables/board-fight/catalog/battleBgs/stage7';
export { default as stage7Island } from '../../playables/board-fight/catalog/battleBgs/stage7Island';
```

- [ ] **Step 2: Verify it type-checks** (no unit test — it imports assets, dev-run-only)

Run: `npx tsc --noEmit 2>&1 | grep -E "shared/battleBgs" | head`
Expected: no errors referencing `shared/battleBgs`.

- [ ] **Step 3: Verify the texture guard still passes**

Run: `npm run check:textures`
Expected: PASS (re-export adds no `Texture.from` offender; `src/shared` is in scan scope).

- [ ] **Step 4: Commit**

```bash
git add src/shared/battleBgs/index.ts
git commit -m "feat(shared): re-export battleBgs flavors for cross-playable use"
```

---

## Task 3: board-fight adopts the viewport listener + resize guard

**Files:**
- Modify: `src/playables/board-fight/PlayableDirector.ts` (import; private field; install in `init()` after `this.sceneManager = new SceneManager(...)` ~line 360; guard `resize()` ~line 924)

- [ ] **Step 1: Add the import** — near the other `@shared` imports at the top of `PlayableDirector.ts`:

```ts
import { installViewportListener } from '@shared/viewport';
```

- [ ] **Step 2: Add a cleanup field** — alongside the other private fields (near `private width: number;`):

```ts
  private removeViewportListener: (() => void) | null = null;
```

- [ ] **Step 3: Install the listener in `init()`** — immediately AFTER `this.sceneManager = new SceneManager(this.app.stage);`:

```ts
    // Relayout on orientation / browser-chrome changes the SDK resize can miss
    // (shared with clash-royal). Guarded resize() below makes redundant fires cheap.
    this.removeViewportListener = installViewportListener((w, h) => this.resize(w, h));
```

- [ ] **Step 4: Guard `resize()` against unchanged dimensions** — make the body:

```ts
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.sceneManager?.layout(width, height);
    const logoYOffset = this.script.showFightProgress ? 30 : 0;
    this.logoOverlay?.layout(width, height, logoYOffset);
  }
```

(The `removeViewportListener` is stored for a future teardown hook; board-fight has no destroy lifecycle today, and the ad is single-shot — the listener lives for the ad's lifetime, matching clash-royal. Do NOT invent a destroy path.)

- [ ] **Step 5: Type-check** — capture the board-fight baseline error count FIRST, then confirm no increase.

Run: `npx tsc --noEmit 2>&1 | grep -c "playables/board-fight"`
Expected: same count as before this task (record the baseline at task start; must not increase).

- [ ] **Step 6: Commit**

```bash
git add src/playables/board-fight/PlayableDirector.ts
git commit -m "feat(board-fight): relayout on orientation change via shared viewport listener"
```

---

## Task 4: FightProgressBarH landscape reflow + the screenshot harness

**Files:**
- Modify: `src/playables/board-fight/FightProgressBarH.ts` (the `layout(screenW, screenH)` method)
- Create: `tests/pw/board-fight-bg-shot.mjs`

- [ ] **Step 1: Cap + center the bar in landscape** — replace the first lines of `layout()` (the `margin`/`w`/`this.container.x` setup) with:

```ts
  layout(screenW: number, screenH: number): void {
    if (!this.ready) return;

    const margin = 60;
    const h = 12;
    const y = 16;
    // Portrait: full width minus margins. Landscape: cap width and center so the bar
    // doesn't stretch into a thin line across a wide viewport.
    const landscape = screenW > screenH;
    const w = landscape ? Math.min(screenW - margin * 2, 560) : screenW - margin * 2;
    const x = landscape ? Math.round((screenW - w) / 2) : margin;

    this.barX = x;
    this.barY = y;
    this.barW = w;
    this.barH = h;

    this.container.x = x;
    this.container.y = y;
```

(Leave the rest of `layout()` — icon distribution over `w`, `this.draw()` — unchanged.)

- [ ] **Step 2: Create the screenshot harness** `tests/pw/board-fight-bg-shot.mjs` (reused by Tasks 5–7). Model on the existing `tests/pw/*.mjs`. It serves ONE already-built variant URL and shoots portrait + landscape:

```js
// Screenshot a board-fight variant in portrait + landscape.
// Usage: node tests/pw/board-fight-bg-shot.mjs <dev-url> <out-prefix>
//   e.g. node tests/pw/board-fight-bg-shot.mjs http://localhost:3051/ /tmp/bf-m2-win
import { chromium } from 'playwright';

const URL = process.argv[2];
const OUT = process.argv[3];
if (!URL || !OUT) { console.error('usage: <dev-url> <out-prefix>'); process.exit(2); }

const SIZES = [{ tag: 'portrait', w: 390, h: 844 }, { tag: 'landscape', w: 844, h: 390 }];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
let failed = false;
for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);                 // let the fight render a few beats
  const hasCanvas = await page.$('canvas');
  if (!hasCanvas) { console.error(`[${s.tag}] NO CANVAS`); failed = true; }
  if (errors.length) { console.error(`[${s.tag}] console errors:`, errors.slice(0, 5)); failed = true; }
  await page.screenshot({ path: `${OUT}-${s.tag}.png` });
  console.log(`[${s.tag}] shot -> ${OUT}-${s.tag}.png`);
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Smoke the harness against an EXISTING variant** (proves the bar reflows + the harness works before authoring new variants). Serve `m1_fight_victory_splash` on a free port (3051) and shoot:

```bash
# terminal A (serve one variant; board-fight is the default type):
PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type board-fight m1_fight_victory_splash dev
# (note the printed port; if not 3000, use it below. 3000 is free — the iteration agents avoid it.)
# terminal B:
node tests/pw/board-fight-bg-shot.mjs http://localhost:3000/ /tmp/bf-m1-win
git checkout build.json   # variant-build rewrites it — NEVER commit it
```

Expected: exit 0; `/tmp/bf-m1-win-portrait.png` + `-landscape.png` written; in landscape the progress bar is centered + capped (not a full-width thin line). Kill the dev server when done.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | grep -c "playables/board-fight"   # no increase vs baseline
git add src/playables/board-fight/FightProgressBarH.ts tests/pw/board-fight-bg-shot.mjs
git commit -m "feat(board-fight): landscape reflow for FightProgressBarH + screenshot harness"
```

---

## Task 5: Plain-stage7 fight variants (copy m7 fight, swap background)

**Why first (before m2):** lowest *implementation* risk — identical roster + steps, only the `background` string changes, so the actor-index coupling is trivially preserved. **But note (red-team):** plain `stage7` (`BattleBG.webp`) has never been rendered in-engine by any shipped variant — its composition with the bottom-anchored bg sprite + battle-area crop is UNVERIFIED, so this is the **most likely drop candidate**. The Step 4 screenshots are the real test; if it looks wrong, drop it (the m7 island variant already covers stage-7 visually).

**Files:**
- Create: `src/playables/board-fight/variants/m7plain_fight_victory_splash.variant.js` (from `m7_fight_victory_splash.variant.js`)
- Create: `src/playables/board-fight/variants/m7plain_fight_defeat_splash.variant.js` (from `m7_fight_defeat_splash.variant.js`)

- [ ] **Step 1: Copy + swap background (victory)**

```bash
cp src/playables/board-fight/variants/m7_fight_victory_splash.variant.js \
   src/playables/board-fight/variants/m7plain_fight_victory_splash.variant.js
```
Then in the new file: replace EVERY `background: 'stage7Island'` with `background: 'stage7'`, and update the two header comment lines (the description + the `Run: ... codegen.js m7_fight_victory_splash` line) to say `m7plain_fight_victory_splash`. Change NOTHING else (roster, steps, rewards, ending stay identical).

- [ ] **Step 2: Copy + swap background (defeat)** — same as Step 1 for `m7_fight_defeat_splash.variant.js` → `m7plain_fight_defeat_splash.variant.js`.

- [ ] **Step 3: Codegen both + type-check**

```bash
node src/playables/board-fight/scripts/codegen.js m7plain_fight_victory_splash --skip-active
node src/playables/board-fight/scripts/codegen.js m7plain_fight_defeat_splash --skip-active
npx tsc --noEmit 2>&1 | grep -c "playables/board-fight"   # no increase vs baseline
```
Expected: both generate; no new tsc errors.

- [ ] **Step 4: Screenshot win + lose, both orientations** (serve each, shoot, kill, revert build.json)

```bash
PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type board-fight m7plain_fight_victory_splash dev
node tests/pw/board-fight-bg-shot.mjs http://localhost:3000/ /tmp/bf-s7plain-win   # then Ctrl-C the server
PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type board-fight m7plain_fight_defeat_splash dev
node tests/pw/board-fight-bg-shot.mjs http://localhost:3000/ /tmp/bf-s7plain-lose  # then Ctrl-C the server
git checkout build.json
```
Verify in the 4 PNGs: stage7 `BattleBG.webp` covers in both orientations, enemies un-distorted + not overlapping, ad-UI laid out, win shows victory / lose shows DEFEAT. **If broken and not fixable without hacks → delete both files, record "stage7-plain dropped: <reason>", skip to Task 6.**

- [ ] **Step 5: Commit**

```bash
git add src/playables/board-fight/variants/m7plain_fight_victory_splash.variant.js \
        src/playables/board-fight/variants/m7plain_fight_defeat_splash.variant.js
git commit -m "feat(board-fight): plain-stage7 fight-only win/lose variants"
```

---

## Task 6: stage2 fight variants (transform m2_board via the board→fight recipe)

**The recipe** (derived by diffing `m1_board_victory_splash` vs `m1_fight_victory_splash`). Applied to `m2_board_{victory,defeat}_splash.variant.js`:

- **Remove** top-level fields: `hitsCounter: true`, `xpFlyAfterFights: true`, `board: 'board2'`, the whole `rolls: [...]`, `use3dDice: true`, `pulseRollButton: true`, `centerEnemy: ...`, the whole `tileFloats: {...}`.
- **Add** top-level: `showFightProgress: true` (place where `board:` was).
- **Inside `fights`**: remove any `{ type: 'vignette', on: true|false }` steps.
- **In `events`**: prepend `{ type: 'levelup', layout: 'horizontal' }`; add `layout: 'horizontal'` to every existing `{ type: 'levelup' }`; remove `discovery: true` from the `weaponReward`/`heroReward` events.
- **Keep identical**: `initialState`, `allSkills`, the entire `fights` block (stage2 backgrounds + goblin roster + all `steps[]`), `stats`, `dynamicLevelUp`. This preserves the roster↔steps actor-index coupling (the swap-safety guard).

**Files:**
- Create: `src/playables/board-fight/variants/m2_fight_victory_splash.variant.js` (from `m2_board_victory_splash.variant.js`)
- Create: `src/playables/board-fight/variants/m2_fight_defeat_splash.variant.js` (from `m2_board_defeat_splash.variant.js`)

- [ ] **Step 1: Create m2 fight WIN** — `cp m2_board_victory_splash.variant.js → m2_fight_victory_splash.variant.js`, apply the recipe above, and update the header comment + `Run: ... codegen.js` line to `m2_fight_victory_splash`. **Cross-check against `m1_fight_victory_splash.variant.js` as the reference shape** (same top-level fields, same events skeleton).

- [ ] **Step 2: Create m2 fight LOSE** — `cp m2_board_defeat_splash.variant.js → m2_fight_defeat_splash.variant.js`, apply the SAME recipe, update headers. The victory/defeat difference is already baked into the source files' final-boss steps + ending — preserve it.

- [ ] **Step 3: Codegen both + type-check**

```bash
node src/playables/board-fight/scripts/codegen.js m2_fight_victory_splash --skip-active
node src/playables/board-fight/scripts/codegen.js m2_fight_defeat_splash --skip-active
npx tsc --noEmit 2>&1 | grep -c "playables/board-fight"   # no increase vs baseline
```
Expected: both generate; no new tsc errors. (If codegen errors on a field, the recipe left an incompatible field — re-check against `m1_fight_*`.)

- [ ] **Step 4: Screenshot win + lose, both orientations** (same flow as Task 5 Step 4, prefixes `/tmp/bf-s2-win` / `/tmp/bf-s2-lose`). Verify stage2 covers, goblins un-distorted, ad-UI ok, outcomes correct, **no progress-bar/board leftovers** (board fully stripped). **Drop both + record reason if unfixable.**

- [ ] **Step 5: Commit**

```bash
git add src/playables/board-fight/variants/m2_fight_victory_splash.variant.js \
        src/playables/board-fight/variants/m2_fight_defeat_splash.variant.js
git commit -m "feat(board-fight): stage2 (goblin) fight-only win/lose variants"
```

---

## Task 7: Full screenshot matrix + drop-if-broken sweep

**Files:** none (verification only).

- [ ] **Step 1: Screenshot the 6 PRE-EXISTING fight pairs in BOTH orientations** (they're inheriting the new landscape listener + bar reflow — confirm no regression). Variants: `m1/m3/m4/m5/m6/m7 _fight_{victory,defeat}_splash`. For each: serve, shoot portrait+landscape, kill, `git checkout build.json`.

- [ ] **Step 2: Assemble the pass/drop ledger** — for all candidates (the 6 existing + up to 4 new from Tasks 5–6 = up to 8 backgrounds × {win,lose}), record PASS/DROP with reason. A stage PASSES only if: bg covers both orientations, enemies un-distorted + non-overlapping, ad-UI laid out, win→victory / lose→DEFEAT. Anything else → DROP + reason.

- [ ] **Step 3: Run the logic gate**

Run: `npm run verify`
Expected: exit 0 (textures + all 6 unit suites incl. the new viewport tests).

- [ ] **Step 4: Commit the ledger** (as a short note in the PR description / a comment — no code).

---

## Task 8: Build the passing deliverables (all networks → Desktop)

**Files:** none (build only).

- [ ] **Step 1: Build each PASSING variant for all 4 networks** — ⚠️ **do NOT use `build-all.js`**: `scripts/build-all.js:81` EXPLICITLY EXCLUDES every board-fight variant whose filename contains `_fight_`, so it would build **nothing new** (and silently succeed). Build each passing fight variant EXPLICITLY with `variant-build.js`, which is not subject to that filter (network arg is lowercase):

```bash
# Replace the list with ONLY the variants that PASSED Task 7:
for v in m2_fight_victory_splash m2_fight_defeat_splash m7plain_fight_victory_splash m7plain_fight_defeat_splash; do
  for n in applovin unity google moloco; do
    node scripts/variant-build.js --type board-fight "$v" build "$n"
  done
done
git checkout build.json   # variant-build rewrites it — NEVER commit it
```

- [ ] **Step 1b: CONFIRM the artifacts actually exist** (a missing file = a silent skip):
```bash
for n in AppLovin Unity Google Moloco; do echo "== $n =="; ls dist/$n/ | grep -E "m2_fight|m7plain_fight"; done
```
Expected: every passing variant present in every network dir. If any is missing, investigate before shipping — `npm run verify` (Task 7) is logic-only and will NOT catch a missing build.

- [ ] **Step 2: Copy the passing win+lose builds to Desktop, `asaf_`-prefixed**, per [[feedback-build-deliverable-naming]] (AppLovin/Unity/Google/Moloco). Confirm each raw HTML is < 5,242,880 B (`stat -f%z`, not `ls -lh`).

- [ ] **Step 3: Report** the final deliverable set + any dropped stages with reasons.

---

## Out of scope (separate follow-up plan)
**clash-royal migration to the shared helper** (replace its inline `windowResizeHandler`/`readViewport` with `@shared/viewport`, behavior-preserving) happens in its OWN plan AFTER the iteration branches (`cr-iter*`) merge to `main` — to avoid editing `CombatDirector`/`CombatScene` under (now-finished, but unmerged) iteration work.

## Self-review notes
- **Spec coverage:** shared helper (T1) ✓, bg re-export (T2) ✓, board-fight adoption (T3) ✓, ad-UI landscape (T3 listener + T4 progress bar; HUDs confirmed dead → no task, per spec) ✓, 8-background win/lose (T5 stage7-plain + T6 stage2 + 6 existing verified in T7) ✓, drop-if-broken (T5/T6/T7) ✓, enemy guard (T5 copy-only, T6 derive-from-matching-source) ✓, builds (T8) ✓, clash-royal deferred ✓.
- **Test-bucketing (honest):** only `src/shared/viewport.ts` is unit-testable (T1). Everything else is asset-importing / integration → verified by tsc + Playwright screenshots (per `lessons.md`).
- **Type consistency:** `readViewport()`/`installViewportListener()` names match across T1/T3; `showFightProgress` matches the existing `PlayableDirector.resize` usage.
