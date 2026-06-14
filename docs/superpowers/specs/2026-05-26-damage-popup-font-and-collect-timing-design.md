# Damage Popup Font + COLLECT Timing — Design

**Date:** 2026-05-26
**Playable:** egg-summon

Two focused changes to the egg-summon playable.

## Task A — Damage popups: Lilita One + cooler design

**Problem:** Damage numbers (`src/playables/board-fight/fight/DamageNumber.ts`) render in plain
`Arial`, which looks generic next to the game's chunky Titan One UI and doesn't feel impactful.

**Goal:** Give the floating damage numbers a cool, fitting, punchy look using **Lilita One**
(Google Fonts) — a chunky rounded display font that complements the game's aesthetic.

### Font embedding (offline-safe)
The playable ships as a single self-contained HTML (assets inlined as base64), so the font
**must be embedded**, not fetched from Google.

- Add the Lilita One font file under `assets/` (TTF/woff), imported so webpack inlines it as a
  base64 data URL — same mechanism as the existing Titan One game font.
- Add a `loadDamageFont()` loader mirroring `src/shared/gameFont.ts` `loadGameFont()` (register
  the `@font-face`, await `document.fonts.load`). Call it before the fight scene first renders
  (alongside `loadGameFont()` in the director), so PIXI measures/renders glyphs correctly.
- Expose a `DAMAGE_FONT_STACK` constant (e.g. `'"Lilita One", Arial, sans-serif'`).

### Design / styling
- Apply `DAMAGE_FONT_STACK` to both the damage number and the optional prefix label.
- Punchier look: larger base size (~36), thicker dark stroke (~4–5) for contrast against the
  battle background, a subtle drop shadow for depth.
- **Crits:** bigger pop (~×1.4), a hotter fill (gold/white), keep the `!` suffix, slightly
  stronger over-pop on the scale-in.
- Keep the existing per-element colors (ice/lightning/fire/poison/…).

### Sizing & positioning
- Retune `baseSize`, stroke width, `FLOAT_DISTANCE`, horizontal jitter and the stack offset so
  the heavier font reads cleanly and stacked numbers don't overlap.

### Testability (TDD)
- Extract a **pure function** `damageNumberStyle(opts)` returning the resolved style values
  (`fontFamily`, `fontSize`, `fill`, `stroke`, `dropShadow`, `scale`) for normal vs crit vs
  element, plus a small layout helper for the start offset / stack offset.
- Unit-test these pure functions with `node --test` (already used by the repo) — no PIXI
  renderer needed. The PIXI `Text` creation stays a thin shell that consumes the tested output.

### Verification
- Playwright screenshots of the fight showing normal and crit damage numbers; iterate on the
  look (size/stroke/shadow/colors).

## Task B — COLLECT appears faster after the egg breaks

**Problem:** After the dragon reveal there's a hold before the green COLLECT button appears
(`EggSummonScene.ts`, currently `await tween(this.ticker, 1000, …)` before `showRevealCta()`),
so the CTA feels slow to arrive.

**Goal:** Make COLLECT pop in sooner after the reveal lands.

- Reduce the post-reveal hold from ~1000ms to ~500ms (keep the button's own scale-in pop).
- Verify the timing with Playwright screenshots.

## Out of scope
- Changing the reveal/board/claim fonts (only the damage popups get Lilita One).
- Other playables (board-fight, sidescroller) — the damage-style change lives in shared
  `DamageNumber`, but the visual retune is validated against egg-summon.
