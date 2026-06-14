# Game Design — Playable Variants

## Design Philosophy

- **Power fantasy is #1** — player feels overpowered. Big damage, flashy skills, dramatic finishers.
- **Suspense** — create "about to lose" moments, then comeback with crits/dodge/rage.
- **Combos are probabilistic** — don't give combos every fight, they should feel like a bonus.
- **Fast pacing** — keep everything snappy, don't let the player get bored.
- **A/B test everything** — create multiple variants to see what works, with different weapons and heroes.

## Two Playable Types

- **Board**: board + dice + fights + events. Default roll patterns by board:
  - `board: 'board1'`, `rolls: [8, 9, 8, 7]`
  - `board: 'board2'`, `rolls: [8, 9, 11, 10]`
  - `board: 'board3'`, `rolls: [8, 6, 9, 10]`
- **Fights-only**: `showFightProgress: true`, no board/rolls — sequential fights with progress bar

## Fight Pacing (Suspense → Comeback)

**Regular fight:**
1. Player attacks strong (power fantasy intro) — basic, optional combo, skill
2. Enemies hit back hard (suspense) — HP drops, optional dodge for tension relief, Player health close to dying
3. Player comeback (climax) — crits, skills, rage + dramatic + crit finisher

**Boss fight:**
1. Explosive opener — basic → combo chain → skill
2. Boss rages (suspense peak) — dodge, dramatic rage hit, big damage, Player health super low
3. Player rally — combo → skill → epic rage finisher with dramatic + crit

## Round Sequencing Rules

- **Order**: player basic → combo → skill → enemy attacks
- **Combo**: only after basic with `return: false`. Not every fight or every time.
- **Rage**: only when `rageFill` accumulates to full (100)
- **Die**: immediately after the lethal attack
- **`return: false`**: on all mid-chain attacks; omit on last to walk home
- **Dodge**: `dodge: true` — great for tension relief
- **Dramatic**: `dramatic: true` — screen darkening, use on rage attacks only

## Available IDs

**Enemies (don't mix stages in a single fight):**
- Stage 1: `skeleton`, `skeletonKing`(boss), `slime`, `skeletonArcher`, `skeletonCommander`, `skeletonMage`, `wolf`
- Stage 2: `goblinGrunt`, `goblinHunter`, `goblinMage`, `goblinBalista`, `goblinEngineer`
- Stage 3: `caveSpider`, `redShroom`, `stoneElemental`(boss), `ancientConstruct`, `redSlime`
- Stage 4: `dragonBoss`(boss), `snowSpider`, `trollCultist`, `trollWarrior`, `yeti`
- Stage 5: `anubis`(boss), `bastet`, `desertHornet`, `mummyGeneral`, `mummyWarrior`
- Stage 6: `banshee`, `bossTree`(boss), `ghostKnight`, `livingTree`
- Stage 7: `deadSailor`, `fishMonster`, `kraken`(boss), `pirateCaptain`(boss), `siren`

**Battle BGs:** `stage1`(default), `stage2`–`stage7`
**Heroes:** `base`, `corvus`, `fireWizard`, `kasumi`, `lance`, `vlad`
**Weapons:** `warriorBlade`, `ninjaKatana`, `crystalHammer`, `deadeyeBlade`, `duelistSpear`, `emberStaff`, `glacialHammer`, `natureStaff`, `plagueBlade`, `radiantHammer`, `serratedEdge`, `stormStaff`, `vampiricEdge`
**Skills:** `chainLightning`, `thunderstorm`, `thunderGod`, `fireballBarrage`, `flameStrike`, `meteorStorm`, `shurikenFlurry`, `fumaShuriken`, `deadlyStars`, `berserk`
**Stats:** `stats: { showXp: true, showAtk: true }` — optional HUD config

## Ending Types

Two ending event types, each with a different image:
- **`nextChapter`** — uses `end_banner.webp` (the "next chapter" banner). For variants where the story continues.
- **`gameEnd`** — uses `splash screen 2.webp` (the splash screen). For variants where the game ends definitively.

## Event Chain Pacing

Easy fight → levelup → hard fight (player health reach 30%) → weapon reward → super hard fight (player health reach 15%) → hero reward → levelups → boss (player health reach 5%) → gameEnd/nextChapter

## Size Budget (5 MB limit)

- Board + 3 enemy types + default bg: ~4.5 MB (demo baseline)
- Each extra enemy type: +50–200 KB
- Each extra battle bg: +100–200 KB
- Board + 3 enemies + 1 extra bg (stage4): ~5.2 MB — slightly over
- Fights-only with 6 enemy types + 3 bgs: ~5.8 MB — needs compression to fit
- `logoOverlay: true` to show floating logo, omit to disable

## Animation Compatibility

Not all enemies have `Idle` — some use `Idle_Full`/`Idle_Loop` (e.g. dragonBoss). The engine handles fallbacks automatically via `ANIM_IDLE`, `ANIM_HIT`, `ANIM_DEATH` chains.

## Build Checklist (Multiple Variants)

1. Create `src/playables/board-fight/variants/<name>.variant.js`
2. `npm run codegen -- <name>`
3. `npm run build:variant -- <name> build applovin`
4. Or build all: `npm run build:all`
8. Restore `src/index.ts` to `demo.generated` and re-run codegen/strip for demo

## Output Folder Structure

Builds are organised by ad provider and platform:

```
dist/
  AppLovin/
    iOS/
      rogueVictory.html
      rogueDefeat.html
      ...
    Android/
      rogueVictory.html
      ...
  Google/
    iOS/
      rogueVictory.html
      ...
    Android/
      rogueVictory.html
      ...
```

- Each provider may have different size limits, MRAID versions, or SDK requirements — build accordingly.
- AppLovin hard limit: **5 MB** per file.
