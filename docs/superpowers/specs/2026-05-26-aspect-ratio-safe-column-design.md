# Aspect-Ratio Support — Portrait Safe-Column — Design

**Date:** 2026-05-26
**Playable:** egg-summon

Make the playable look correct on **every aspect ratio** (portrait phones, iPad ~4:3,
landscape) by always presenting the **phone portrait layout**, centered, with the scene
background filling the margins. On iPad/landscape today the hand points to the wrong place and
characters fall out of view because scenes position from the live `min(w,h)` / height; the fix
is to lay content out into a clamped portrait column so it stays pixel-identical to the phone.

## Requirement
- On a phone (current target), the result must be **identical to today** (no regression).
- On wider viewports (iPad, landscape), the content is the **same phone layout**, centered in a
  portrait column at native size — no element repositioning, no out-of-scope characters, no
  mis-aimed hand pointer.
- The margins are filled by each scene's background (**no black/empty bars**).

## Mechanism — clamp the content width, center it, fill the bg (no scaling)

Pure helper (`src/shared/safeArea.ts`):
```
safeContentSize(viewportW, viewportH, maxAspect) -> { cw, ch, offsetX }
  cw = min(viewportW, viewportH * maxAspect)
  ch = viewportH
  offsetX = (viewportW - cw) / 2
```
- `MAX_PORTRAIT_ASPECT = 0.62`. Phones (aspect ≤ 0.62) → `cw = viewportW`, `offsetX = 0`
  (**unchanged**). iPad (~0.75) / landscape (>1) → `cw` clamps to a centred portrait column.
- No vertical clamp (portrait content is height-driven; ultra-tall is a non-issue for ads).

Director (`EggSummonDirector`):
- `app.init` / `renderer.resize` use the **actual** viewport (the canvas fills the screen, so
  backgrounds can fill the margins).
- Add a `world: Container` on the stage; the `SceneManager` mounts scenes into `world`.
- On init + resize: compute `{ cw, ch, offsetX }`; set `world.position = (offsetX, 0)`,
  `world.scale = 1`; call `sceneManager.layout(cw, ch, fillX = -offsetX, fillW = viewportW)`.
  (No scaling → content is native-res and pixel-identical to the phone.)

Scene layout contract:
- `Scene.layout(width, height, fillX?, fillW?)` — **optional** trailing params (backward
  compatible; board-fight/sidescroller ignore them).
  - `width, height` = the clamped content column (`cw, ch`). Scenes position content exactly as
    now — their existing fraction math is untouched.
  - `fillX, fillW` = the background fill rect in content-local space (`fillX = -offsetX`,
    `fillW = viewportW`); a scene draws its background across `(fillX, 0, fillW, height)` so it
    covers the margins. When absent, default to `(0, 0, width, height)` (current behaviour).

## Per-scene changes (egg-summon)
For each scene, the only change is the **background** drawing to the fill rect instead of
`(0,0,w,h)`; content layout math stays as-is (it now runs on the clamped column):
- `EggSummonScene` — egg/reveal backdrop (the dark bg + paw pattern) covers the fill rect.
- `BoardRollScene` — the board image stays the centred column; a **cover/dark backfill** behind
  it fills the margins (the board art can't widen, so the margins get a darkened cover-scaled
  board or the board's ground color — reads intentional, not bars).
- `FightScene` — the battle background + dimmed board backdrop cover the fill rect.
- `ClaimRewardScene` — its bg rect + paw pattern cover the fill rect. (Also implement its
  currently-empty `layout()` so it re-lays on resize.)
- `PickPetScene` — its `BG_COLOR` rect covers the fill rect.
- `EndCardScene` — the splash cover-scales to the full viewport (drop the logo-only landscape
  branch; splash fills everywhere, button centred in the content column).

Plus `EggSummonDirector` (world container + clamp) and the shared `Scene` interface (optional
fill params) and `SceneManager.layout` (forward the fill params).

## Testability (TDD)
- `safeContentSize(vw, vh, maxAspect)` is pure → unit-tested: phone (offsetX 0, cw = vw), iPad
  (clamped cw < vw, centred), landscape (narrow column, large offset), and the boundary.

## Verification
- Playwright screenshots at four viewports — portrait phone (414×896), iPad (768×1024),
  landscape (1280×720), square (900×900) — through the whole flow (egg → board → fight → claim →
  pick → end). Confirm: phone unchanged; others show the centred phone layout with bg-filled
  margins, the hand aimed correctly, and no out-of-scope characters.

## Out of scope
- True landscape-optimized (rearranged) layouts — explicitly NOT doing this; the goal is "looks
  like the phone everywhere".
- board-fight / sidescroller playables — the clamp lives in the egg-summon director only
  (shared `Scene`/`SceneManager` changes are backward-compatible no-ops for them).
