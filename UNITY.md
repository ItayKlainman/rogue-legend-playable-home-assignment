# UNITY.md — Unity Codebase Reference (Read-Only)

> All `pocketroll/…` paths below are relative to the real-game checkout at `~/Desktop/RougeLegend/pocketroll/`.

The `pocketroll/` Unity project is **reference only** — you read it to understand game logic when building the playable simulation. Don't modify it.

## Game Flow

```
Bootstrap → Loading → Lobby → Tournament (gameplay)
```
`GameManager` (singleton) drives `GameState`: `Starting → Idling → Moving → InEvent → Finished`

Players roll dice → `BoardToken` moves along tiles → tile triggers event (battle/shop/minigame).

## Key File Locations

| What | Where |
|---|---|
| Game loop | `Assets/Gameplay/Core/Scripts/GameManager.cs` |
| Battle | `Assets/Gameplay/BattleSystem/Core/Scripts/` |
| Board/Tiles | `Assets/Gameplay/Board/`, `Assets/Gameplay/Tiles/` |
| Heroes | `Assets/Heroes/` |
| Game modes | `Assets/Gameplay/GameModes/` |
| Scene names | `Assets/Scripts/Utils/SceneNames.cs` |

## Key Classes

- `GameManager` — central coordinator, singleton
- `BattleManager` — starts/ends battles, `StartBattle(BattleEncounterData)` → `Task<BattleResult>`
- `Battler` — combat entity with `BattlerStats`, `BattlerSkills`, `BattleAction` references
- `BattleAction` (ScriptableObject) — one attack: damage, target type, status effects, animation
- `BattleEffect` — data-driven skill effect with `SkillEffectTriggerCondition` list
- `GameBoard` — board manager, events `PassedByTile` / `LandedOnTile`
- `Tile` (abstract) — base tile with UnityEvents for Init/Landed/PassedBy

## Stat Enum

`BaseMaxHP, MaxHPMult, HP, Rage, MaxRage, BaseATK, ATKMult, BaseDEF, DEFMult, DamageReduction, CritChance, CritDamageMult, ComboChance, CounterChance, DodgeRate, Shield, ParryRate, ParryMult`

## Game Modes

`Main, Tower, StarChallenge, GemDungeon, PetDungeon, DungeonDive, EliteLevel, EliteStarChallenge`

## Code Conventions (for reading)

- Async: UniTask (`Cysharp.Threading.Tasks`), not coroutines
- Logging: `PLogger` (not `Debug.Log`)
- Singletons: `SingletonMonoBehaviour<T>`
- Polymorphic inspector: `[SerializeReference, AbstractList]`
- Quantum (multiplayer sim): `.qtn` files → codegen → `Assets/QuantumUser/Simulation/Generated/`
