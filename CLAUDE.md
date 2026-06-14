# Working guidelines

## 1. Repo orientation

This is a **macOS** repo of self-contained **HTML5 playable ads** (PixiJS v8 + Spine,
`@smoud/playable-sdk`). It is **NOT** a Unity project — Unity exists only as a read-only
reference checkout for matching game fidelity.

**When to read what:**
- `lessons.md` — gotchas + the real-game source-of-truth path. **READ FIRST for any playable work.**
- `PLAYABLES.md` — architecture, SDK lifecycle, Spine API, build commands.
- `GameDesign.md` — valid enemy/hero/weapon/skill IDs + fight pacing.
- `TOOLS.md` — the **Windows / Unity** machine's MCP + tooling notes; does NOT apply to this macOS repo.
- `docs/superpowers/plans/` — active plans/specs (clash-royal iteration roadmap + execution brief live here).

**Real game (read-only reference):** `~/Desktop/RougeLegend/pocketroll/` (its `Assets/` is authoritative
for art/animation/configs). `UNITY.md` + `ASSET_PATHS.md` paths are relative to it.

**Core flows (these are the entry points — don't re-improvise them):**
- `npm run dev` — dev server (default playable). `npm run dev:variant -- --type <t> demo dev` — a specific type.
- `npm run verify` — the **pre-PR logic gate** (always runnable): textures + all 6 unit harnesses, one command.
  After `build:all`, `npm run verify:builds` checks artifacts are < 5 MB (currently dice-blackjack only — see backlog).
- `npm run check:textures` — guard against blank PIXI textures (run before importing new webp).
- `npm run test:<type>` — a single playable's unit harness (shared/board-fight/clash-royal/dice-blackjack/end-card/components).
- `npm run build:all` — build every variant; per-network: `node scripts/build-all.js --type <t> --network <applovin|unity|google|moloco>`.
- Visual correctness has NO unit coverage — verify it with the Playwright screenshot scripts in `tests/pw/`.

**Git (always):** never `git add -A`/`.` — always scoped `git add <paths>`, then `git show --stat`.
**Never commit `build.json`** — the dev server rewrites it (`PLAYABLE_TYPE`); `git checkout build.json` before committing.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.
