# Skill System Design

## Overview

Replace the 6 placeholder skills with 6 real skills featuring actual sprite icons, animated VFX, and proper integration into the levelup cards and fight scene UI.

## Skills

| Skill | ID | Rarity | Icon Source | Description |
|---|---|---|---|---|
| Shuriken Mayhem | `shurikenMayhem` | Common | `Skills/Sprites/Shuriken.png` | Become the shuriken master! |
| Fireball Mayhem | `fireballMayhem` | Common | `Skills/Sprites/Deadly_Fireball.png` | Become the fire master! |
| Lightning Bolt | `lightningBolt` | Common | `Skills/Sprites/Bolt.png` | Become the lightning master! |
| Fuma Fire Shuriken | `fumaFireShuriken` | Mythic | `BattleAnimations/Textures/Deadly Shuriken.png` | Fuma Fire shuriken mayhem! |
| Mega Bolt | `megaBolt` | Mythic | `Skills/Sprites/Lightning_Shot.png` | Mega bolt mayhem! |
| Meteor Explosion | `meteorExplosion` | Mythic | `Skills/Sprites/Meteor.png` | Meteor mayhem! |

## Assets

### Skill Icons (levelup cards + fight skill bar)
All copied to `pocketroll-playables/assets/`:
- `skill_Shuriken.png` — from `Skills/Sprites/Shuriken.png`
- `skill_Deadly_Fireball.png` — from `Skills/Sprites/Deadly_Fireball.png`
- `skill_Bolt.png` — from `Skills/Sprites/Bolt.png`
- `skill_DeadlyShuriken.png` — from `BattleAnimations/Textures/Deadly Shuriken.png`
- `skill_Lightning_Shot.png` — from `Skills/Sprites/Lightning_Shot.png`
- `skill_Meteor.png` — from `Skills/Sprites/Meteor.png`

### Spritesheets (VFX animations)
- `Fireball_2_loop_SpriteSheet.png` — 2x2 grid, 4 frames (fireball projectile loop)
- `LightningBurst_1.png` — 6 columns x 6 rows, 36 frames of 512x256 (lightning strike)
- `lazer_yellow_SpriteSheet.png` — 4x4 grid, 16 frames (mega bolt laser)
- `explosion_5_SpriteSheet.png` — 4x2 grid, 8 frames (meteor explosion impact)

### Projectile Sprites
- Shuriken projectile: reuse `skill_Shuriken.png` icon
- Deadly Shuriken projectile: reuse `skill_DeadlyShuriken.png` icon

## VFX Behavior

### Shuriken Mayhem (5 projectiles → hit)
1. Loop 5 times with ~100ms gap between each
2. Spawn shuriken sprite above player (staggered Y offset per iteration)
3. Spin via rotation, tween x/y from player to enemy over ~200ms
4. On arrival: destroy sprite, `flash(target)`, `shake(3)`, `showDamage(target, totalDamage/5)`, `tweenHp()`

### Fireball Mayhem (3 animated projectiles → hit)
1. Loop 3 times with ~120ms gap
2. Spawn `SpriteEffect` (Fireball_2_loop, looping) above player
3. Tween from player to enemy over ~250ms
4. On arrival: destroy anim, `flash(target)`, `shake(4)`, `showDamage(target, totalDamage/3)`, `tweenHp()`

### Lightning Bolt (3 strikes from above)
1. Loop 3 times with ~150ms gap
2. Spawn `SpriteEffect` (LightningBurst_1, plays once) centered on enemy
3. Brief white screen flash overlay
4. `flash(target)`, `shake(4)`, `showDamage(target, totalDamage/3)`, `tweenHp()`

### Fuma Fire Shuriken (1 big projectile → hit)
1. Spawn large Deadly Shuriken sprite + fire overlay (Fireball_2_loop looping as child)
2. Spin the shuriken, tween from above player to enemy over ~350ms
3. On arrival: destroy, screen flash, `flash(target)`, `shake(6)`, `showDamage(target, totalDamage)`, `tweenHp()`

### Mega Bolt (1 big strike from above)
1. Spawn large `SpriteEffect` (lazer_yellow, plays once) above enemy
2. Screen flash
3. `flash(target)`, `shake(7)`, `showDamage(target, totalDamage)`, `tweenHp()`

### Meteor Explosion (1 big projectile → explosion)
1. Spawn large `SpriteEffect` (Fireball_2_loop, looping) as projectile
2. Tween from above-left of screen to enemy over ~400ms
3. On arrival: destroy fireball, spawn `SpriteEffect` (explosion_5, plays once) at impact
4. `flash(target)`, `shake(8)`, `showDamage(target, totalDamage)`, `tweenHp()`

## Fight Skill Bar UI

- Horizontal row of skill icon squares below the battle area
- Position: centered, just below the angled battle mask edge
- Only shows skills the player has acquired (`PlayerState.skills[]`)
- Purely decorative — no interaction
- Each square: ~40-50px, rounded rect border (rarity-colored), icon sprite inside
- Responsive sizing relative to `Math.min(width, height)`

## Integration

### LevelUp Cards
`SkillConfig.icon` field already supported — just populate with webpack-imported sprite data URLs. The existing card layout handles icon rendering.

### Fight Script
Fight steps use `{ type: 'skill', usePlayerSkill: true }` — the engine picks from `PlayerState.skills[]` and dispatches to the registered VFX handler.

## Implementation Steps

1. Copy assets to `pocketroll-playables/assets/`
2. Update `skills.ts` with new skill definitions + icon imports
3. Write 6 VFX handlers in `src/fight/skillVfx/`
4. Remove old VFX handlers, update FightScene imports
5. Add skill bar UI to FightScene
6. Update playable scripts
