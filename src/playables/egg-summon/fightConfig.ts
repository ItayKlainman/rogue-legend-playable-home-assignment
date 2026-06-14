import type { FightSceneConfig } from '../board-fight/fight/FightStep';
import { skeletonKingBundle } from '../board-fight/catalog/enemies/stage1/skeletonKing';
import battleBgStage1 from '../board-fight/catalog/battleBgs/stage1';
import { HERO_BASE_BUNDLE, HERO_BASE_SKIN, GLACIDRAKE_BUNDLE } from './catalog';
// Register the skill VFX handlers (side-effect imports) so 'skill' steps render.
import './iceSkillVfx';            // dragon's ice (frostBreath + glacialStrike)
import './lightShurikenVfx';       // hero's lighter shuriken throw (shurikenThrow)
import '../board-fight/fight/skillVfx/chainLightning';

// Boss pacing — both the HERO and the PET cast skills (not just melee), with
// short waits between beats so the fight reads a little slower / more readable.
// Pet (the dragon) casts fireballBarrage = "dragon fire"; the hero casts shuriken
// flurry + chain lightning. Every ENEMY attack targets actor 0 (the hero) only —
// the pet Spine has no hit/death animation.
export function buildBossFight(): FightSceneConfig {
  return {
    background: battleBgStage1,
    bossFight: true,
    characterScale: 0.12,
    // Hero starts with these skills (shown charging in the board skill bar).
    players: [
      // Hero is center-left; pet is a small companion in the far lower-left.
      { spine: HERO_BASE_BUNDLE, skin: HERO_BASE_SKIN, maxHp: 200000, hp: 200000, maxRage: 100, melee: true, xFrac: 0.27, yFrac: 0.80 },
      { spine: GLACIDRAKE_BUNDLE, skin: 'Glacidrake', maxHp: 100000, melee: true, scale: 0.026, xFrac: 0.08, yFrac: 0.96 },
    ],
    enemies: [
      { spine: skeletonKingBundle, skin: 'default', maxHp: 280000, melee: true, maxRage: 100, xFrac: 0.82, yFrac: 0.85 },
    ],
    steps: [
      // Damage tuned so the boss (280k) survives every beat down to ~50k after the
      // freeze, then the HERO's melee finisher delivers the kill (see step 9).
      // 1. Hero melee opener
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 20 },
      { type: 'wait', ms: 400 },
      // 2. PET (ice dragon) breathes frost — ice shard barrage
      { type: 'skill', side: 'player', actor: 1, skillId: 'frostBreath', target: 0, damage: 30000 },
      { type: 'wait', ms: 450 },
      // 3. HERO throws a few shurikens (deliberate, not a rushed flurry)
      { type: 'skill', side: 'player', actor: 0, skillId: 'shurikenThrow', target: 0, damage: 30000 },
      { type: 'wait', ms: 450 },
      // 4. Boss rage attack on the hero
      { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 70000, category: 'rage', dramatic: true },
      { type: 'vignette', on: true },
      { type: 'wait', ms: 400 },
      // 5. HERO casts chain lightning
      { type: 'skill', side: 'player', actor: 0, skillId: 'chainLightning', target: 0, damage: 35000 },
      { type: 'wait', ms: 400 },
      // 5b. PET joins in again — a second frost barrage, so it fights alongside
      //     the hero throughout (not just the opener + finisher).
      { type: 'skill', side: 'player', actor: 1, skillId: 'frostBreath', target: 0, damage: 25000 },
      { type: 'wait', ms: 400 },
      // 6. Hero melee combo crit
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 30000, melee: true, category: 'combo', crit: true, rageFill: 20 },
      { type: 'wait', ms: 400 },
      // 7. Boss whiffs
      { type: 'attack', side: 'enemy', actor: 0, target: 0, dodge: true },
      { type: 'wait', ms: 350 },
      // 8. PET sets up the kill — Glacial Strike blizzard FREEZES the boss (big
      //    damage, but NOT lethal: leaves it ~50k so the hero can finish it).
      { type: 'skill', side: 'player', actor: 1, skillId: 'glacialStrike', target: 0, damage: 45000, dramatic: true, crit: true },
      { type: 'wait', ms: 300 },
      // 9. HERO FINISHER — rushes in for a melee blow up close that shatters the
      //    frozen boss (the killing hit; `die` follows so the death syncs to it).
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 60000, melee: true, category: 'combo', crit: true, dramatic: true },
      { type: 'die', actor: 0 },
      { type: 'vignette', on: false },
    ],
    // Short hold — the claim scene carries the victory payoff, and the scene
    // crossfade dissolves straight into it (no battle-area fade / board reveal).
    onVictory: { labelText: 'VICTORY!', holdMs: 250 },
  };
}
