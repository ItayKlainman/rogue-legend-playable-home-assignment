# Egg-Crack Rarity-Tap Playable — Design

**Date:** 2026-05-27
**Branch base:** `egg-summon-playable`
**Status:** Approved for planning

## Goal

A new playable ad, derived from the existing `egg-summon` ad, that takes its
core inspiration from Brawl Stars' box/rarity opening. The hero interaction is a
**5-tap egg crack**: the player taps the egg five times; each tap (a) cracks the
shell visibly more, and (b) rolls the rarity up the ladder with slot-machine
suspense. The fifth tap shatters the egg and reveals the mythic pet. Everything
after the reveal reuses the existing funnel unchanged.

## What's new vs. egg-summon

The existing `egg-summon` opens with a single tap that auto-escalates through the
rarity ladder in one continuous shake build-up, then reveals. This playable
replaces **only that opening scene** with a discrete, player-driven 5-tap crack.
The reveal and the entire downstream funnel are reused.

## Decisions (from brainstorming)

1. **Rarity model — Brawl-Stars roll-up.** Each tap re-rolls the rarity with an
   upward trend (it can flicker/jump for suspense) but is guaranteed to land on
   **mythic** by tap 5. Not a flat predictable climb.
2. **Crack visual — generated stages from the real egg sprite.** Progressive
   crack frames are generated with nano-banana (Gemini image) from the real egg
   art, swapped as textures per tap. Light leaking through the cracks is baked
   **white** so it can be tinted per rarity at runtime.
3. **Post-egg flow — keep the full funnel.** Reveal → BoardRoll → Fight →
   ClaimReward → PickPet → EndCard, all reused as-is.
4. **Rarity UI — segmented bar at the bottom.** A 5-segment meter anchored low;
   each tap fills one segment and flashes the current tier's name + color, and
   the crack-glow tints to that same color. The meter fades out as the egg
   bursts (the COLLECT button later occupies the bottom).

## Rarity ladder

Five tiers, one per tap (drops `great` from the 6-tier internal ladder):

| Tap | Tier      | Tint (from `RARITY_TINT`) |
|-----|-----------|---------------------------|
| 1   | common    | `0xcccae8` lavender-grey  |
| 2   | rare      | `0x4fd9f4` cyan           |
| 3   | epic      | `0xd671fd` violet         |
| 4   | legendary | `0xffc600` gold           |
| 5   | mythic    | `0xfe4863` coral-red      |

The settled tier per tap trends up this ladder and is guaranteed mythic at tap 5.
The roll-up *flicker* (rapid cosmetic cycling before settling) is suspense only —
the filled-segment count is monotonic (= taps taken).

## Architecture

### New playable folder, reusing the funnel

`src/playables/egg-crack/` with its own `EggCrackDirector` and a new
`EggCrackScene`. The downstream scenes are **imported directly** from their
existing locations (the repo already cross-imports `EndCardScene` into
`egg-summon`):

- `BoardRollScene`, `FightScene`, `ClaimRewardScene`, `PickPetScene` ← `../egg-summon/scenes/`
- `EndCardScene` ← `../end_card/`
- `script.ts`, `rarity.ts`, `catalog.ts`, `audio.ts`, `fightConfig.ts` ← reused from `egg-summon` (import; do not fork) where unchanged.

`EggCrackDirector` mirrors `EggSummonDirector.runFlow()` exactly, swapping only
the opening scene (`EggCrackScene` in place of `EggSummonScene`). Both ads coexist
and build independently via `--type egg-crack`.

**Rejected alternatives:** (B) a variant flag inside `egg-summon` — couples two
shipping ads and muddies build/analytics; (C) full fork — large dead-copy.

### Shared reveal module

The reveal sequence (`showRevealScreen` → `showRevealCta`/COLLECT →
`playCollectEffect`, ~400 lines of frame-accurate choreography replaying
`SummonEgg_Open.anim`) is needed identically by both ads. Extract it from
`EggSummonScene` into a shared `src/playables/egg-summon/eggReveal.ts` module that
takes a container, the loaded egg/pet textures, the ticker, and layout geometry,
and drives the reveal + COLLECT, resolving when the player collects.

Both `EggSummonScene` and `EggCrackScene` call it. This touches the **shipped**
`egg-summon` ad, so the implementation must verify egg-summon still renders
pixel-identical (visual check at tall/design/wide per the aspect-ratio rule).

**Fallback if extraction is deemed too risky at implementation time:** copy the
reveal code into `EggCrackScene` instead (duplicated but isolates egg-summon). The
plan should treat extraction as the default and note this fallback.

## EggCrackScene — behavior

Reuses egg-summon's staging verbatim: purple stone-brick wall + arched niche,
summoning statue, green pad + front rim, four torches, the egg holder (glow +
egg body), and the FTUE hand pointer. Layout/geometry (`StageGeom`, the
`layout()` math, `drawBackground`) is reused; the egg sits a touch higher than in
egg-summon so the bottom meter has room.

State machine:

1. **Idle / waiting for tap.** Egg closed (crack stage 0), idle breathing pulse,
   CTA "TAP THE EGG!" near the top, hand pointer bobbing on the egg, empty meter
   at the bottom. A late auto-tap timer (idle safety net) advances a tap if the
   player stalls, so the ad never dead-ends.
2. **On each tap (1–5):**
   - `audio.eggCrack(...)` with pitch climbing per tap.
   - Advance the egg-body texture to the next crack stage (1→4; tap 5 → full break).
   - A short squash/shake bump (reuse egg-summon's shake curve, compressed).
   - **Rarity roll-up:** the meter's "active" segment flickers through a few tiers
     then settles on this tap's tier; fill one segment permanently; pop the tier
     word in its color; tint the crack-glow + a small ray/burst to that tier.
   - Reset the idle auto-tap timer.
3. **Tap 5 — break.** Final crack stage → egg vanishes → hand off to the shared
   reveal module (mythic Glacidrake). Meter fades out. Reveal → COLLECT → resolve
   `done` → director advances to BoardRoll.

## Rarity roll-up logic (pure, testable)

A pure module `rollup.ts` exposing:

```
rarityForTap(tapIndex: 0..4): Tier          // common,rare,epic,legendary,mythic — mythic at 4
flickerSequence(tapIndex): Tier[]            // short cosmetic cycle that settles on rarityForTap
```

`rarityForTap` is deterministic and monotonic (tap i → ladder[i]); the flicker is
a bounded list (e.g. 4–6 quick frames) ending on the settled tier. Unit-tested
(`rollup.test.ts`) alongside the existing `pickPetLayout.test.ts` pattern:
guaranteed mythic at tap 5, monotonic settle, flicker always ends on the settled
tier.

## Rarity bar component

`RarityBar` — a small self-contained unit (own file) drawing 5 segments with
PIXI `Graphics`, each segment tinted from `RARITY_TINT` when filled and a dark
neutral (`0x2a2440`) when empty, inside a rounded dark frame. Exposes
`fill(segmentIndex, tier)` (fills + glows a segment) and a tier-word banner above
it reusing the already-loaded `rarityBanner` texture (tinted per tier). Anchored
at the bottom of the scene; `layout()` positions it relative to the layout unit.
Fades out (alpha tween) when the egg bursts.

## Crack-asset pipeline

Source frames generated with nano-banana from the real `Pets_Summon_Icon.png`,
delivered at `assets/egg-summon/egg/cracks/Egg_Stage1.png … Egg_Stage4.png`
(1024×1024). Stage 0 (closed) = existing `egg_closed`; full break = existing
`egg_open`. White light is baked into the leaking cracks (stages 3–4).

**Known issue (verified):** the generated PNGs are 3-channel RGB with **no alpha**
— nano-banana baked a literal gray/white checkerboard as the "transparent"
background instead of exporting transparency. Removal via a global color key is
unsafe (would eat the egg's white highlights / crack-light).

**Solution (validated on stages 1 & 4):** a **border flood-fill** that clears only
background-connected neutral-gray pixels (`|R-G|,|G-B|,|R-B| ≤ 10` and `≥150`),
stopping at the navy outline. This cleanly removes the checkerboard while
preserving interior whites and stage-4's external light rays (PoC confirmed both
the easy hairline frame and the hard shatter frame come out clean).

- Pipeline: flood-fill bg removal → **crop all four to a shared bounding box**
  (by the navy-outline extent) so they swap without jitter → downscale → run
  `scripts/compress-assets.js` → `.webp`.
- Output `crack_1.webp … crack_4.webp` (alongside the source `cracks/` PNGs or in
  egg-crack's own asset dir), loaded via a `loadCrackArt()` catalog helper.
- The crack PNGs bake **white** seams only (no color). Rarity color is added at
  runtime by a separate tinted glow/ray overlay placed over the egg (the crack
  body texture stays its natural cream + white seams; only the overlay glow/ray
  sprites are tinted), so the lit seams read as the current tier color. This is
  exactly how egg-summon already tints glow/burst/rays.

## Analytics & audio

- **Analytics:** mirror `EggSummonDirector`'s funnel exactly — `alTrack('LOADING')`
  / `'LOADED'` / `'DISPLAYED'` in init; `CHALLENGE_PASS_25` after the egg reveal,
  `_50` after BoardRoll, `_75` after the fight win. (Per-network CTA routing and
  the preview-gated nav fallback stay as in the existing build.)
- **Audio:** reuse `egg-summon/audio.ts` (board music, fight music, `eggCrack`,
  `summonReveal`, `collect`, `buttonTap`, volume handling) unchanged.

## Build

- `--type egg-crack` builds this ad; `build.json` default stays `board-fight`.
- Keep all playables compilable (the dev bundle imports every playable via
  `require.context`).
- Per-network builds as per the existing rule (`--network applovin/unity/google/moloco`).
- Stay under the 5 MB budget — the 4 crack webps are small; reusing egg-summon
  assets adds no new heavy bundles.

## Testing

- **Unit:** `rollup.test.ts` (rarity settle is monotonic, guaranteed mythic at
  tap 5, flicker ends on settled tier). Reuse the existing vitest/jest setup the
  other `.test.ts` files use.
- **Manual / visual (per aspect-ratio rule):** verify the egg-crack scene and the
  reused reveal at tall / design / wide; verify the bottom meter never collides
  with the egg or the later COLLECT button; verify the egg crack stages swap
  without jitter; verify `egg-summon` still renders pixel-identical after the
  reveal-module extraction.

## Risks

- **Reveal extraction touching shipped egg-summon** — mitigated by the
  pixel-identical verification gate and the copy-in fallback.
- **Crack-frame alignment jitter** — mitigated by shared-bounding-box crop in the
  asset pipeline.
- **Game-fidelity** — the crack stages are a *new* mechanic (the real game only
  shakes), so they are an intentional, approved invention; everything else
  (palette, reveal, staging, audio) stays extracted-from-real per lessons.md.

## Out of scope

- Changing any downstream scene (BoardRoll/Fight/Claim/PickPet/EndCard).
- New pets/fighters — the reveal stays the mythic Glacidrake.
- Player choosing the rarity outcome — it is always guaranteed mythic.
