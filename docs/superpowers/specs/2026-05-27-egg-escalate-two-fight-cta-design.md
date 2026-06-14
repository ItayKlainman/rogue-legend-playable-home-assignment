# Egg-Escalate — Two-Fight Escalation Playable (CEO concept)

**Date:** 2026-05-27
**Branch target:** new `egg-escalate` variant (parallel to `egg-summon`)
**Status:** design approved, pending spec review

## Origin

The CEO proposed testing a battle flow that is *not* a single boss fight, but an
escalation: fight 2 small enemies first, collect another pet, roll the dice
again, then reach the boss — and at the moment you land on the boss, the ad
bounces the player to the store. If the player declines the store and returns,
they get to play the boss fight.

This is the classic "build tension, cut to the store at peak anticipation"
playable technique. We build it as a **new variant** so the existing single-fight
`egg-summon` ad stays intact for A/B testing.

## Goals

- A complete, shippable playable variant that runs the escalating flow.
- 100% real-game assets — no invented enemies, pets, or art. Pull additional
  real battle pets from the main client (`pocket-client`) using the existing
  Spine pipeline.
- Reuse `egg-summon`'s scenes by parameterizing them, so there is one fight and
  one board implementation, not duplicates.
- Stay within the per-network build budget (<5 MB).

## Non-goals

- No changes to `egg-summon`'s observable behavior (it keeps passing its own
  config to the now-parameterized shared scenes).
- No new combat mechanics — the FightEngine, board, dice, claim, and end card
  are reused as-is.
- No second *invented* anything; every actor is a committed real asset.

## Flow

```
EggEscalateDirector.runFlow()

  1. BoardRollScene  (destination = First-Battle tile)
        hero + Glacidrake shown on the board; dice auto-rolls;
        hero hops to a tile guarded by 2 small enemies.
                              │
  2. FightScene  (buildSmallFight)
        hero + Glacidrake  vs  2 weak stage-1 enemies (e.g. Slime + Wolf)
        → fast, decisive win (VICTORY!). The player feels strong.
                              │  CHALLENGE_PASS_25
  3. Egg reward → pet collect  (reuse egg-crack / EggReveal)
        a victory egg drops and cracks open into BONECLAW (mythic),
        the "collected" pet that now joins the team.
                              │  CHALLENGE_PASS_50
  4. BoardRollScene  (destination = Boss tile)
        now hero + Glacidrake + Boneclaw on the board; dice auto-rolls;
        hero hops to the Boss Tile.
                              │  ◀── on boss-land: notifyCheckpoint('bossLand')
                              │       → safeInstall() opens the store
                              │       CHALLENGE_PASS_75
  5. FightScene  (buildBossFight)
        hero + Glacidrake + Boneclaw  vs  Skeleton King.
        Plays only if the user dismissed the store and returned.
                              │
  6. ClaimRewardScene → EndCardScene   (reused as-is)   → sdk.finish()
```

### Key beats

- **Store opens between the second roll and the boss fight** — the literal CEO
  ask: "bounces you to the store when you land on the boss; if you insist on
  returning, you see the boss fight." The fight is the fallback, not skipped.
- **First fight is a genuine easy win** — 2 weak enemies overpowered by hero +
  pet, so the escalation to the boss raises real stakes.
- **The collected pet is the payoff** — Boneclaw is revealed via the existing
  egg-crack/reveal juice, then visibly fights the boss alongside Glacidrake.

## Party / asset resolution

Constraint discovered during design: in the playable bundle only **Glacidrake**
was a fight-capable pet Spine; Sly/Luna were imported as static sprites only.
The main client (`pocket-client`) holds a full 24-pet battle roster
(`Assets/Gameplay/BattleSystem/Pets/`, Common→Mythic), each with the same Spine
layout as Glacidrake (`<Name>.json` + `<Name>.atlas.txt` + `<Name>.png` + skill
configs).

- **Starter pet:** Glacidrake (already committed; first fight + boss).
- **Collected/reward pet:** **Boneclaw** (Mythic). Verified anims:
  `Idle`, `Move`, `Basic_Attack` — exactly what the FightEngine drives. Skins:
  `BoneClaw`, `BoneClaw_Evolution` (use base `BoneClaw`).
- **Boss fight party:** hero + Glacidrake + Boneclaw vs Skeleton King (stage 1).
- **Small-fight enemies:** 2 committed stage-1 enemy bundles (Slime + Wolf
  recommended; both already in the catalog).

### Asset pipeline (Boneclaw)

Mirror how Glacidrake was brought in:
1. Copy Boneclaw `.json` / `.atlas.txt` (→ `.atlas`) / `.png` from the client.
2. Run the Spine strip/resize scripts (`scripts/strip-spine-json.js`,
   `scripts/resize-spine-atlas.js`) to shrink the 5.3 MB source PNG to a small
   webp (Glacidrake landed at ~137 KB / ~135 KB json).
3. Commit to `assets/egg-escalate/spine/Boneclaw.{atlas,json,webp}`.
4. Confirm the per-network build stays <5 MB.

## Architecture — Approach A (parameterize shared scenes)

### New files (`src/playables/egg-escalate/`)

- `EggEscalateDirector.ts` — composes the 6-beat flow above; owns the analytics
  funnel and the `bossLand` checkpoint → `safeInstall()`. Modeled on
  `EggSummonDirector`.
- `script.ts` — variant script (starter = Glacidrake, reward = Boneclaw, enemy
  sets, board destinations).
- `fightConfig.ts` — `buildSmallFight()` (hero + Glacidrake vs 2 stage-1
  enemies, `bossFight: false`, short step list, easy win) and `buildBossFight()`
  (hero + Glacidrake + Boneclaw vs Skeleton King; extends the egg-summon boss
  step list with a third actor and Boneclaw skill beats).
- `catalog.ts` — adds `BONECLAW_BUNDLE` (`SpineAssets`); re-exports shared loaders.
- `index.ts` — registers the variant for `--type egg-escalate`.

### Parameterized shared scenes (surgical, behavior-preserving)

- `FightScene` — constructor takes a `FightSceneConfig` instead of importing
  `buildBossFight` directly. `egg-summon` updated to pass `buildBossFight()`
  explicitly so its behavior is unchanged.
- `BoardRollScene` — constructor takes `{ destinationTile, enemyPreview,
  onBossLand? }` (and the party to display on the board) so the same scene
  drives both the first-battle roll and the boss roll. `egg-summon` updated to
  pass its current boss-tile config.

### CTA trigger

Extend the `CtaTrigger` union in `board-fight/ctaTriggers.ts`:

```ts
export type CtaTrigger =
  | { on: 'levelUpChoice'; n: number }
  | { on: 'bossLand' };
```

`BoardRollScene` calls `director.notifyCheckpoint('bossLand')` when the major
hop settles on the Boss Tile (boss roll only). The director maps that to
`safeInstall()` (fires at most once). The end card keeps its own CTA button.
`safeInstall()` nav fallback stays gated to preview builds (existing rule).

### Reused as-is

egg-crack / `EggReveal` (Boneclaw reveal), `ClaimRewardScene`, `EndCardScene`,
`FightEngine`, `RollButton`, `BoardDice`, `Board`, all stage-1 enemy bundles.

## Analytics funnel

| Event | Moment |
|-------|--------|
| `LOADING` / `LOADED` / `DISPLAYED` | director init (unchanged) |
| `CHALLENGE_PASS_25` | won the first (small-enemies) fight |
| `CHALLENGE_PASS_50` | collected the Boneclaw egg-pet |
| `CHALLENGE_PASS_75` | landed on the boss (CTA fires) / boss fight reached |
| `sdk.finish()` | boss resolved → end card |

## Testing

- Pure-logic units (any new layout/sequence helpers) get unit tests, following
  the existing `rollup.test.ts` / `rarityBarLayout.test.ts` pattern.
- The flow is verified live in the dev server (`npm run dev:variant`) and tuned
  by eye across many small cycles.
- Verify every scene at tall / design / wide aspect ratios; scene backgrounds
  must cover the full fill rect (`fillX,fillY,fillW,fillH`), no bars.
- Verify `bossLand` → `safeInstall()` fires exactly once and the boss fight
  plays on return; confirm per-network build stays <5 MB.

## Risks / open items

- **Build size:** adding Boneclaw (~+0.3 MB after resize) plus the longer flow
  must stay under 5 MB/network — check after extraction.
- **Boneclaw scale/anchor:** tune `defaultScale` and board/fight placement so it
  reads well next to Glacidrake (eyeball in dev server).
- **Boss step pacing:** the 3-actor boss step list must stay readable; reuse the
  egg-summon pacing (waits between beats) and add Boneclaw beats sparingly.
