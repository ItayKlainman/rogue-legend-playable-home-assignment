# Board Stats Bar — Design

## Overview

Add ATK and XP stat displays to the board scene, matching the Unity game's top-of-screen stats. Each stat is optional and toggleable via config.

## Stats

### ATK Stat
- Sword icon (`ATK_Base_Stat.png`) + white bold number (e.g. "51.6k")
- Reads from `state.atk`
- Updates on board `resume()` after weapon reward (with scale-punch animation)

### XP Bar
- EXP icon (`EXP.png`) + small horizontal fill bar (green fill on dark track)
- Fill controlled per-fight via `xpFill: 0.0-1.0` on fight events (cumulative)
- After fight ends: 5-8 EXP icon sprites fly from screen center toward XP pill, bar fills on arrival

## Visual Design
- No background strip — icons/text float over board with drop shadows
- Positioned at top of screen, horizontal row, left-aligned
- Stats only render if enabled in config

## Config Shape

```ts
interface BoardStatsConfig {
  showXp?: boolean;
  showAtk?: boolean;
}
```

Fight events gain optional `xpFill`:
```js
{ type: 'fight', fight: 'slime', xpFill: 0.35 }
```

## XP Flying Icons Animation
1. Fight ends, overlay pops back to board
2. Spawn 5-8 small EXP icons at screen center
3. Staggered fly toward XP pill (~50ms apart, fast arc)
4. On arrival: icon fades, bar fill tweens up
5. Total ~600ms

## ATK Update Animation
- On resume after weapon reward: ATK number updates, scale 1 -> 1.3 -> 1 over 200ms
