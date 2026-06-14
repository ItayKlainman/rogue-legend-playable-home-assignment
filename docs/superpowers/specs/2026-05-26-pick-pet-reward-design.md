# Egg Reward → Pick One of Two Pets — Design

**Date:** 2026-05-26
**Playable:** egg-summon

Extend the post-fight reward: after claiming the egg, the player chooses one of **two new
pets**, with a juicy selection moment, then continues to the end card.

## Flow

```
Fight → ClaimRewardScene (egg + CLAIM) → [tap CLAIM] → PickPetScene (NEW) → EndCardScene
```

Currently the director goes `claim → endCard`. We insert `PickPetScene` between them.

## The 2 pets
- **Sly** and **Luna** — the two pet arts not used in the fight (only Glacidrake/Luna/Sly arts
  exist; Glacidrake was the hatched fighter). Shown in rarity-tinted frames with their names.
- Auto-pick fallback after ~6s of no input, so the ad never dead-ends.

## ClaimRewardScene change
- Tapping CLAIM resolves into the pick step instead of the end card (a one-line director
  change — the scene already resolves `done`).
- Add a quick **egg-open burst** as CLAIM is tapped (white flash + shards + gold rays out of
  the egg) so it reads as "the egg opens into pets". The existing scene crossfade then
  dissolves into the pick screen.

## PickPetScene (new, adapted from the unused `PickFighterScene`)
The existing `PickFighterScene` already implements tiles + checkmark + select-pop + dim-others
+ fly-out. We adapt it: 2 pets, the new title, and **heavy juice + sound**.

### Layout
- Title **"CHOOSE YOUR PET!"** at the top (Titan One game font, not Arial).
- Two pet tiles side by side, centred. Each: rarity-tinted frame sprite, pet icon, a soft
  rarity-coloured glow halo behind the pet, and the pet's name below.
- An FTUE hand hint that nudges between the two tiles.

### Entrance juice
- Title slams in with overshoot (easeOutBack).
- Tiles bounce in staggered with scale overshoot; sparkle stars twinkle around them; frames
  carry a subtle shimmer; tiles idle-bob continuously until picked.

### On pick (the payoff)
- **Sound:** a confirm sting — `audio.collect` (power-up "collected!") layered with
  `audio.buttonTap`; the chosen pet also triggers `audio.summonReveal`.
- **Full-screen white flash** + a brief scene shake.
- Chosen tile: **elastic scale pop with overshoot**, frame brightens, an expanding
  **shockwave ring**, and a **burst of gold star/confetti particles** sprayed outward.
- A **checkmark stamps** onto the chosen tile with its own pop.
- Chosen **pet bounces** with its rarity glow flaring; its **name pops** in.
- The other tile **desaturates (tint→grey), shrinks, and fades/slides away**.
- Brief celebratory hold (~600ms), then resolve → end card (crossfade handles the dissolve).

## Testability (TDD)
Extract a **pure** module `pickPetLayout.ts`:
- `pickPetTilePositions(count, width, height)` → array of `{x, y}` tile centres (2 tiles
  centred, responsive).
- `pickPetTileSize(width, height)` → tile side length.
- `dimTargets(chosenIndex, count)` → indices of the tiles to dim (everything except chosen).

Unit-test these with `node --test` (Node strips TS types). The PIXI scene is a thin shell:
particle/tween/sound juice lives in the scene and is verified via Playwright screenshots.

## Components / files
- New: `src/playables/egg-summon/scenes/PickPetScene.ts` (the juicy 2-pet pick scene).
- New: `src/playables/egg-summon/scenes/pickPetLayout.ts` (+ `.test.ts`) — pure layout/state.
- Modify: `src/playables/egg-summon/EggSummonDirector.ts` — insert PickPetScene between claim
  and end card.
- Reuse: `loadRevealTexture`, `loadUiTexture('tileFrame')`, `RARITY_TINT`, `makeStar` pattern,
  `audio.*`, `GAME_FONT_STACK`.

> The existing `PickFighterScene` stays as-is (or is superseded). PickPetScene is purpose-built
> for the 2-pet reward so we don't entangle the fighter-select assumptions.

## Verification
- Playwright screenshots: pick screen entrance, the choose effect (flash/burst/checkmark),
  the dimmed loser, and the transition to the end card.

## Out of scope
- The chosen pet does NOT change the end card (still the standard Play Now card).
- No new pet art (uses existing Sly/Luna).
