# Mid-Fight LevelUp & WeaponReward Overlays

**Date:** 2026-03-04
**Goal:** Show LevelUp and WeaponReward scenes during a fight via scripted fight steps, pause the fight, update skills/weapons in the fight scene after the player's choice. Enables future no-board variants.

---

## 1. New Fight Step Types

Add two new step types to `FightStep`:

```typescript
| { type: 'levelup';       config?: LevelUpSceneConfig }
| { type: 'weaponReward';  config: WeaponRewardSceneConfig }
```

Interleaved in the fight steps array alongside attack/skill/die steps.

### FightEngine behavior

When `executeStep()` encounters a `levelup` or `weaponReward` step:

1. **Freeze** all Spine actors (`autoUpdate = false`)
2. **Emit** `onMidFightOverlay(step)` callback with the step config
3. **Await** the returned Promise (blocks the step loop)
4. On resolve, **unfreeze** actors and continue to the next step

FightEngine has no scene knowledge — it yields control via callback and waits.

### Existing post-fight flow unchanged

The `PlayableDirector` event chain (`PlayableScript.events`) continues to work as-is. Post-fight levelup/weaponReward events are a separate, coexisting path.

---

## 2. FightScene Overlay Handling

When FightScene receives `onMidFightOverlay`:

1. **Dim** — add semi-transparent black sprite (`0x000000`, alpha `0.85`) over the fight container
2. **Push overlay** — `SceneManager.push(scene, 'overlay')` with `LevelUpScene` or `WeaponRewardScene`
3. **Await** `scene.done` — overlay resolves when player selects
4. **Pop** — SceneManager pops the overlay, remove dim layer
5. **Hot-reload** the fight scene:
   - **Skill bar**: destroy and rebuild from `state.skills` (reuse existing `buildSkillBar()`)
   - **Weapon**: call `hero.equipWeapon(state.weaponConfig)` (safe to call repeatedly)
   - **Stats**: update ATK display if present
6. **Resolve** the callback Promise — FightEngine resumes

LevelUpScene and WeaponRewardScene are reused as-is — they already update PlayerState and resolve `done`.

---

## 3. Dynamic Skill Selection

Mid-fight `levelup` steps support both explicit and dynamic skill selection:

```javascript
// Explicit — skills specified in variant
{ type: 'levelup', skills: [['chainLightning', 'fireballBarrage', 'shurikenFlurry']] }

// Dynamic — computed at runtime from player state
{ type: 'levelup' }
```

When `config.skills` is omitted, FightScene calls `computeLevelUpSkills(state, allSkills)` from `src/dynamicSkillSelection.ts` — identical logic to PlayableDirector's dynamic level-ups.

FightScene needs access to `allSkills` from the PlayableScript. Thread via `FightSceneConfig` or pass during construction.

---

## 4. Codegen / Variant Authoring

In `.variant.js` files, mid-fight overlays are authored as steps:

```javascript
steps: [
  { type: 'attack', attacker: 'player', target: 'enemy0', anim: 'Regular_Attack_Melee', damage: 50 },
  { type: 'attack', attacker: 'enemy0', target: 'player', anim: 'Attack', damage: 20 },
  // Mid-fight level up
  { type: 'levelup', skills: [['chainLightning', 'fireballBarrage', 'shurikenFlurry']] },
  // Now use the new skill
  { type: 'attack', attacker: 'player', target: 'enemy0', skill: 'chainLightning', damage: 80 },
  // Mid-fight weapon reward
  { type: 'weaponReward', weapon: 'katana', atkBoost: 10 },
  // Continue with new weapon
  { type: 'attack', attacker: 'player', target: 'enemy0', anim: 'Regular_Attack_Melee', damage: 70 },
]
```

Codegen resolves string IDs via `REGISTRY` (existing pattern). Levelup skill arrays wrapped to `SkillConfig[][]` for multi-round support.

---

## 5. Files to Modify

| File | Change |
|---|---|
| `src/fight/FightStep.ts` | Add `levelup` and `weaponReward` step types |
| `src/fight/FightEngine.ts` | Handle new steps: freeze actors, emit callback, await, unfreeze |
| `src/scenes/FightScene.ts` | Wire `onMidFightOverlay` callback: dim, push overlay, hot-reload on return |
| `src/fight/FightSceneConfig.ts` | Add optional `allSkills` field (for dynamic levelups) |
| `scripts/codegen.js` | Resolve levelup/weaponReward step configs from string IDs |

No changes to: `LevelUpScene`, `WeaponRewardScene`, `PlayableDirector`, `SceneManager`, `BoardScene`.

---

## 6. Future: No-Board Variant

With mid-fight overlays, a no-board variant becomes a single `PlayableScript` with:
- No `board` config
- One or more fights in `events`, each containing levelup/weaponReward steps inline
- The entire game plays out inside fight scenes

This is a future concern — no code needed now beyond the step support above.
