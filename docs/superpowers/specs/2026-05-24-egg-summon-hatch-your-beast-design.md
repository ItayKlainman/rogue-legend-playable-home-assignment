# Egg-Summon Playable — "Hatch Your Beast" — Design

**Date:** 2026-05-24
**Status:** Approved (design); pending implementation plan
**Type:** New playable type (`egg-summon`)

## Summary

A 22-second playable ad built around PocketRoll's real **pet egg summon** mechanic.
The player opens three eggs (gacha dopamine), pulls a Mythic pet on the third, picks
it as their fighter, takes one dice roll to a Boss Tile, and wins a boss fight with the
pet fighting alongside the hero — then an install end card.

The ad is implemented as a **new playable type** (`egg-summon`) with its own variant +
codegen system, so we can ship a matrix of versions (pet lineup × reveal arc × hero) for
A/B testing. It reuses the existing `FightEngine`, `SpineCharacter`, `EndCardScene`,
`SceneManager`, and board components as shared libraries.

## Grounding: how the real game works (verified in the PocketRoll source)

This is authentic to the actual game, not the original ad-script's invented terms:

- **Eggs are real.** Pets are summoned from tiered pet eggs (`pets.egg.1`–`pets.egg.15`,
  unlocked by summon count). The real `LootBoxPetEggAnimation` open sequence is a
  **rarity build-up**: for a pet of rarity `R`, the egg shakes + shifts color + plays a
  louder sound through *each* tier `Common → … → R`. A Mythic pull literally escalates
  Common→Great→Rare→Epic→Legendary→Mythic on one egg. We mirror this.
- **Rarity ladder:** `Common, Great, Rare, Epic, Legendary, Mythic` (Mythics also have an
  evolved form, e.g. Glacidrake → Scalifrost).
- **Pets fight alongside the hero.** There is a real `PetBattler` with HP/ATK/DEF and
  battle skills. The playable's `FightEngine` already models this: `players[0]` = hero,
  `players[1+]` = pets. No engine change needed to put a pet in the fight.
- **The script's "wolf / bear / dragon" are wrong.** `Wolf` is a Stage-1 *enemy*; there is
  no bear. The real "beasts" are the 24 pets. The mapping we use:
  - Common: `sly` (Sly), `zorg` (Zorg)
  - Great: `spottail` (Spottail), `hoot` (Hoot)
  - Rare: `luna` (Luna), `geck` (Geck)
  - Epic: `cryo`, `shellbyte`, `buzzli`, `emberin`, `zap`, `ravyonix`
  - Legendary: `castlepod`, `frostpaw`, `noctibun`, `pyrehorn`, `shroomurk`, `voltrix`
  - Mythic: `blazewing`→Pyronix, `boneclaw`→Ribrazor, `flux`→Ampereon,
    `glacidrake`→Scalifrost (frost dragon), `neklaw`→Klawtana, `spore`→Infestox
- **Each pet folder ships both** a Spine (`<Pet>.json` + `.atlas.txt` + `.png`) and a static
  `<Pet>_Sprite.png` (plus `<Pet>_Evolved_Sprite.png`). Source path:
  `Assets/Gameplay/BattleSystem/Pets/<NN Rarity>/<Pet>/` in the PocketRoll repo
  (locally checked out at `~/Desktop/pocket-client/.pocketroll-tmp`).

## Flow & timeline (22s)

| Sec | Beat | Interaction | Implementation |
|---|---|---|---|
| 0–2 | 3 eggs (bronze/silver/gold glow), hero portrait above | "OPEN YOUR EGGS" + hand pointer on egg 1 | `EggSummonScene` |
| 2–4 | Tap egg 1 → shake → crack → **Common** pet reveal | "COMMON" flash | `EggSummonScene` |
| 4–6 | Tap egg 2 → **Rare** pet reveal (frustration arc: Common again) | "RARE" flash | `EggSummonScene` |
| 6–9 | Tap egg 3 → rarity escalation → **Mythic** pet reveal, screen-shake, rays, confetti | "MYTHIC!!!" | `EggSummonScene` |
| 9–11 | 3 pet icons at bottom, mythic glows brightest | "PICK YOUR FIGHTER" + pointer | `PickFighterScene` |
| 11–13 | Tap mythic pet → flies to hero's side → transition | "READY!" | `PickFighterScene` → board |
| 13–15 | Dice auto-rolls, hero hops to Boss Tile | "BOSS!" | reuse board components, 1 scripted roll |
| 15–20 | Auto boss fight: hero sword + **pet attacks**, boss dies in explosion | damage numbers + "VICTORY" | reuse `FightEngine` |
| 20–22 | End card: hero + pet pose, INSTALL NOW, 4.9★ | tap = store | reuse `EndCardScene` |

## Architecture

New `src/playables/egg-summon/`:

- Created via the documented new-type path: copy `_template/`, add an
  `if (PLAYABLE_TYPE === 'egg-summon')` block in `src/index.ts`, put type assets under
  `assets/egg-summon/`.
- **Owns:** `EggSummonScene`, `PickFighterScene`, an `EggSummonDirector`, a `codegen.js`,
  and a `catalog/pets/<id>.ts` module set.
- **Reuses (as shared libraries):** `@shared/SceneManager`, `@shared/SpineCharacter`,
  `FightEngine` + fight UI from `board-fight/fight/`, board components for the single-roll
  beat, and `EndCardScene`.
- Spine runtime is bundled because we import `SpineCharacter`.

### Scenes

1. **`EggSummonScene`** — 3 eggs + hero portrait + lobby VFX bg. Tap-to-open each egg with
   shake/crack/glow; rarity-escalation reveal mirroring `LootBoxPetEggAnimation`
   (shake + color-shift + escalating SFX through each tier up to the egg's rarity);
   per-rarity reveal text ("COMMON"/"RARE"/"MYTHIC!!!"), confetti + rays + screen-shake on
   Mythic. Reveal pets render as static `<Pet>_Sprite` art.
2. **`PickFighterScene`** — 3 pet icons along the bottom, mythic glowing brightest, pointer.
   On pick, the chosen pet flies to the hero's side and we transition out. Fires a
   `pickFighter` CTA checkpoint.
3. **Board beat** — reuse board-fight board components for a single scripted roll
   (`boardRoll.hops`) that hops the hero to the Boss Tile. Fallback if reuse is too heavy:
   a minimal scripted board strip (dice + a few tiles + boss tile).
4. **Fight** — reuse `FightEngine` with `players = [hero, chosenPet]`, `enemies = [boss]`.
   Fight steps follow GameDesign's boss pacing (explosive opener → boss rage/suspense →
   rally → epic finisher), with the pet contributing attacks.
5. **End card** — reuse `EndCardScene`: hero + pet pose, INSTALL NOW, 4.9★ badge.

## Variant schema (`<name>.variant.js`)

```js
module.exports = {
  hero: 'lance',
  weapon: 'warriorBlade',

  // Reveal arc is encoded by the egg list. "straight" = ascending rarity;
  // "frustration" = egg[1] is Common again before the Mythic payoff.
  eggs: [
    { rarity: 'common', pet: 'sly'  },
    { rarity: 'rare',   pet: 'luna' },
    { rarity: 'mythic', pet: 'glacidrake' },
  ],

  fighter: 'glacidrake',              // chosen pet → full Spine battler (must be one of eggs[].pet)

  boss: { enemy: 'skeletonKing', bg: 'stage1', maxHp: 220000 },
  boardRoll: { hops: 1 },             // one scripted roll to the Boss Tile
  fightSteps: [ /* hero+pet vs boss, GameDesign boss pacing */ ],

  ending: 'gameEnd',                  // 'gameEnd' (splash screen 2) | 'nextChapter' (end_banner)
  ctaTriggers: [{ on: 'pickFighter' }],
};
```

Codegen (`egg-summon/scripts/codegen.js`, mirroring board-fight) resolves the string IDs
(`hero`, `weapon`, `pet`, `fighter`, `boss.enemy`) against catalog bundles and emits a
typed `<name>.generated.ts` plus `_active.generated.ts`.

## Asset plan (all real game assets)

| Asset | Source | Treatment |
|---|---|---|
| Reveal pets (×3) | `<Pet>_Sprite.png` | copy → webp (static, cheap) |
| Chosen fighter pet | `<Pet>.json` + `.atlas.txt` + `.png` | `strip-spine` pipeline → webp Spine; new `catalog/pets/<id>.ts` |
| Boss enemy, battle bg, hero, weapon | already in `assets/` | reuse |
| Egg art | **not ready-made** (game egg is an Animator prefab) | a single egg sprite + procedural shake/crack/glow + rarity tint |
| SFX | playable's existing sfx slots | reuse; optionally export `SFX_Crack` / `Pet_Summon_*` |

**Size budget:** per built file ≈ 1 boss + 1 bg + 3 pet sprites + 1 pet Spine + hero +
weapon ≈ 3.5–4.5 MB, under the 5 MB AppLovin cap. Only the **chosen** pet is a Spine; the
other two reveal pets stay static to protect the budget.

## Variant matrix

`{pet-lineup} × {straight | frustration} × {hero+weapon}`.

- Pet lineups: multiple ascending Common→Rare→Mythic sets (e.g. `sly→luna→glacidrake`,
  `zorg→geck→blazewing`, `sly→luna→boneclaw`).
- Arcs: `straight` and `frustration` (egg 2 = Common again).
- Heroes: the supported set (`base`, `corvus`, `fireWizard`, `kasumi`, `lance`, `vlad`)
  with appropriate weapons.

Naming grammar: `<lineupTag>_<arc>_<hero>`, e.g. `dragon_straight_lance`,
`dragon_frustration_vlad`, `fire_straight_kasumi`. `build:all --type egg-summon` emits the
matrix into the provider/platform folder structure.

## Phasing

1. **Phase 1 — vertical slice.** Scaffold the `egg-summon` type, build `EggSummonScene` +
   `PickFighterScene`, and wire one **hardcoded** end-to-end variant
   (`sly → luna → glacidrake`, straight arc, `lance` + `warriorBlade`,
   `skeletonKing` boss, `gameEnd`). Goal: one working, reviewable playable.
2. **Phase 2 — config-driven.** Add `codegen.js` + the variant schema + `catalog/pets/`;
   reproduce the Phase-1 playable purely from a `.variant.js`.
3. **Phase 3 — matrix.** Author the lineup × arc × hero variants and `build:all`.

## Risks / open questions

- **Egg art** is the one asset not ready-made — needs a sprite sourced or created. Phase 1
  must resolve this (build a simple egg sprite + procedural FX).
- **Pet Spine animation names** — confirm pets expose Idle/Attack/Hit/Death tracks
  compatible with `FightActor` (the engine has fallback chains; verify in Phase 1).
- **Board reuse for a single roll** may pull in more board machinery than needed; fallback
  is a minimal scripted board strip.
- **`pickFighter` CTA checkpoint** is a new trigger kind — extend the `CtaTrigger` union and
  call `notifyCheckpoint('pickFighter')` from `PickFighterScene`.

## Out of scope

- Pet evolution animation (Mythic → evolved form) — show base Mythic only.
- Shards / summon-cost economy UI — the ad summons are free taps.
- Multi-fight board journeys — this ad is a single boss fight.
- Defeat variants — this ad is victory-only (install on a win).
