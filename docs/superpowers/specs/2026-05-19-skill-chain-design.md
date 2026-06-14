# skill-chain — Playable Ad Design

**Date:** 2026-05-19
**Working name:** `skill-chain` (PlayableType: `skill-chain`)
**Target length:** 30–40s

## 1. Pitch

A pure power-fantasy playable ad. Player picks lightning skills three times; each pick visibly compounds the previous one. By the boss fight, the screen is filled with homing bolts, splash electricity, and mega-VFX raining on the boss — but the boss is tuned to survive ~5–7 skill volleys so the player can *enjoy* the spam, not one-shot through it.

Anchored on the live RougeLegend skill system (`chainLightning → thunderstorm → thunderGod`) so install retention stays consistent.

## 2. Loop

| Beat | Time | What happens |
|---|---|---|
| Hook fight | 0–4s | Cold-open: hero swings at a weak enemy, basic-attack kill. No skills. Establishes the world. |
| Pick 1 (T1) | 4–7s | 3 lightning-variant cards. Player taps one → all 3 unlock `chainLightning`. Faint blue aura. |
| Fight 1 | 7–13s | Mid-tier enemy. Auto-casts `chainLightning` every ~2.5s. Homing bolts. |
| Pick 2 (T2) | 13–16s | 3 cards at legendary tier (variants of `thunderstorm`). Splash-electricity ability added. Cyan aura. |
| Fight 2 | 16–23s | Tougher enemy (or 2 enemies). T1+T2 chain auto-fires every ~2.0s. HUD shows ⚡⚡ link. |
| Pick 3 (T3) | 23–26s | 3 cards at mythic tier (variants of `thunderGod`). Screen pulses. White aura. |
| Boss fight | 26–37s | `skeletonKing`. Tuned HP, ~5–7 volleys to kill. Auto-cast every ~1.2s. Mega-bolt, splash, screen shake. 300ms slow-mo on lethal hit. |
| CTA | 37s+ | End card → `sdk.install()`. |

## 3. Visual escalation system

Four layered systems that compound per tier:

**Homing bolts (the "spam")** — Reuse `chainLightning` VFX as base.
- T1: 2 bolts/cast, visibly arc (curve) from hero to target
- T2: 4 bolts/cast + splash electricity (existing `thunderstorm` chain)
- T3: mega-bolt replaces base + bolts/splash continue underneath = visible bolt rain

**Hero aura — per-tier evolution:**

| Tier | Aura |
|---|---|
| T0 (hook) | none |
| T1 | faint blue particle ring at feet |
| T2 | cyan electricity crackles around silhouette |
| T3 | blinding white-cyan glow; stray bolts arc off the hero between casts |

**HUD chain-link indicator** — 3-slot ⚡ bar at top of screen. Each pick lights a slot. After T3, the bar pulses continuously.

**Final boss tuning (no one-shot):**
- HP calibrated so ~5–7 volleys are required = 7–9s of full-spam visual feast
- Skill cast interval: ~1.2s (vs ~3s in normal board-fight cadence)
- Kill moment: 300ms slow-mo on final bolt → mega-explosion → coin shower → CTA

**Player input on boss fight:** auto-spam (watch only). Tap-to-cast is out of scope for v1.

## 4. Architecture

New playable type at `src/playables/skill-chain/`. Reuses board-fight's combat code via direct `../board-fight/*` imports (the established pattern dice-blackjack already uses).

```
skill-chain/
  index.ts                # PlayableType adapter — registers with src/index.ts router
  SkillChainDirector.ts   # Lifecycle owner; sequences the arc
  SkillChainScript.ts     # Arc config schema (fights, picks, boss, timings)
  defaultScript.ts        # The actual content (enemies, skeletonKing, timings)
  scenes/
    IntroFightScene.ts    # Thin wrapper over FightScene; "basic-only mode" (skills disabled)
    PickScene.ts          # 3-card pick UI — bespoke lightning variants + tier framing
    BossFightScene.ts     # FightScene wrapper; overrides castInterval=1.2s
  ui/
    ChainHud.ts           # 3-slot top-screen ⚡ indicator
    HeroAuraLayer.ts      # Tier-driven Container with particles, attached to hero
  config.ts               # Tunables — boss HP, spam rate, aura colors per tier
```

### Reuse map

**From `../board-fight/`** (cross-playable imports, same pattern as dice-blackjack):
- `FightEngine` + `FightScene` — combat loop & UI shell
- Skill VFX registry — `chainLightning`, `thunderstorm`, `thunderGod` handlers (auto-chain on equip)
- Enemy Spine bundles + battle BGs
- `sfx.ts` — WebAudio engine
- `SpineCharacter`, `HpBar`, `PlayerState` (or slim variant)

**From `@shared/`:**
- `Scene`, `SceneManager`, `PlayableType`, `PlayableLifecycle`
- `mraidInstall`, `alAnalytics`, `LogoOverlay`, end-card

### What is strictly new

1. `SkillChainDirector` — orchestrates the arc, no board logic
2. `PickScene` — single-round 3-card UI; bespoke art for lightning variants and tier badges
3. `ChainHud` — small top-screen 3-slot indicator showing which tiers are unlocked
4. `HeroAuraLayer` — Container behind hero, particles tinted by tier
5. One small touchpoint in `FightEngine`: configurable skill cast interval (a knob, ~10-line change — does not alter existing board-fight behavior, only exposes it)

### Reuse risks (validate during implementation)

- `FightEngine`'s skill cast interval may currently be hardcoded. Verify in `src/playables/board-fight/fight/FightEngine.ts` and add a config knob if needed.
- For bolts to *visibly arc* (homing curve) rather than fly straight, may need a minor tweak in `src/playables/board-fight/fight/skillVfx/chainLightning.ts`. Inspect during implementation.
- Hero aura attachment: easiest as a sibling Container, not a Spine slot object. Avoid disturbing the rig.

## 5. Pacing & tunables

Per-fight settings live in `config.ts`:

| Field | Hook fight | Fight 1 (T1) | Fight 2 (T2) | Boss (T3) |
|---|---|---|---|---|
| Duration target | 3–4s | 6–7s | 6–7s | 9–11s |
| Enemy | 1× `skeleton` | 1× `skeletonCommander` | 1× `skeletonArcher` + 1× `skeleton` | `skeletonKing` |
| Skill cast interval | n/a | ~2.5s | ~2.0s | **~1.2s** |
| Hero aura | none | blue ring | cyan crackle | white blinding |
| Camera shake | minor on hit | minor on skill | medium on chain | heavy + slow-mo on kill |

**Pick UI:**
- Visible duration: ~3s (1s reveal animation, then card-tap window)
- Auto-advance: if player hasn't tapped within 5s, auto-pick center card
- 3 lightning variants per tier — same actual skill mapped under the hood, distinct icons + names + rarity badge (common/legendary/mythic)

**Total ad length:** 30–40s (hook 4s + 3×(pick 3s + fight 7s) + boss 10s + CTA reveal ~3s)

## 6. Success criteria

1. Plays end-to-end on phone portrait viewports — iPhone SE (small) through Pixel 7 / iPhone 14 / Galaxy Fold (tall). No iPad / tablet support required.
2. ≤ 5 MB single HTML (AppLovin limit) — comfortably fits with 1 hero + 3 enemies + 1 BG
3. Final boss fight visibly shows ≥ 5 full skill volleys before the kill (no one-shot)
4. CTA fires via `sdk.install()` on end-card tap
5. Audio: BGM + lightning skill SFX (reused from board-fight `sfx.ts`) + win stinger; muted until first user gesture (iOS-safe)
6. Three ad-network builds produce valid output: AppLovin (MRAID 2.0), Unity, Google

## 7. Out of scope (deliberately deferred)

- Family choice (lightning + fire + shuriken variants) — viable A/B variant later, same architecture
- Tap-to-spam for boss fight — viable upgrade if engagement metrics warrant
- Multi-boss arc / chapter system — single boss only in v1
- Hero variants / character pick — single hero (`base`) in v1
- Variant build system within skill-chain — single `defaultScript.ts` only in v1

## 8. Dev/test commands (planned)

`demo` below is the canonical script name (a single `defaultScript.ts`), not a variant system. The build pipeline requires a variant arg, so we pass `demo` to satisfy it — same pattern dice-blackjack uses.

```bash
# Dev server
npm run dev:variant -- --type skill-chain demo dev

# Production builds (per ad network)
npm run build:variant -- --type skill-chain demo build applovin
npm run build:variant -- --type skill-chain demo build unity
npm run build:variant -- --type skill-chain demo build google
```
