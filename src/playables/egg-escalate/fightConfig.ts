import type { FightSceneConfig } from '../board-fight/fight/FightStep';
import { slimeBundle } from '../board-fight/catalog/enemies/stage1/slime';
import { wolfBundle } from '../board-fight/catalog/enemies/stage1/wolf';
import { skeletonKingBundle } from '../board-fight/catalog/enemies/stage1/skeletonKing';
import battleBgStage1 from '../board-fight/catalog/battleBgs/stage1';
import {
  HERO_BASE_BUNDLE, HERO_BASE_SKIN, GLACIDRAKE_BUNDLE,
  BONECLAW_BUNDLE, BONECLAW_SKIN,
} from './catalog';
// Skill VFX side-effect imports (same set egg-summon registers).
import '../egg-summon/iceSkillVfx';        // frostBreath + glacialStrike
import '../egg-summon/lightShurikenVfx';   // shurikenThrow
import '../board-fight/fight/skillVfx/chainLightning';

// First battle: hero + Glacidrake make quick work of 2 small enemies (Slime +
// Wolf), so the player feels strong before the boss raises the stakes. Enemy
// indices stay fixed (Slime=0, Wolf=1) even after one dies.
export function buildSmallFight(): FightSceneConfig {
  return {
    background: battleBgStage1,
    bossFight: false,
    characterScale: 0.12,
    players: [
      { spine: HERO_BASE_BUNDLE, skin: HERO_BASE_SKIN, maxHp: 200000, hp: 200000, maxRage: 100, melee: true, xFrac: 0.27, yFrac: 0.80 },
      { spine: GLACIDRAKE_BUNDLE, skin: 'Glacidrake', maxHp: 100000, melee: true, scale: 0.026, xFrac: 0.08, yFrac: 0.96 },
    ],
    enemies: [
      { spine: slimeBundle, skin: 'default', maxHp: 40000, melee: true, xFrac: 0.78, yFrac: 0.78 },
      { spine: wolfBundle, skin: 'default', maxHp: 50000, melee: true, xFrac: 0.90, yFrac: 0.90 },
    ],
    steps: [
      // Hero one-shots the Slime.
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 45000, melee: true, rageFill: 25 },
      { type: 'die', actor: 0 },
      { type: 'wait', ms: 300 },
      // Hero chips the Wolf...
      { type: 'attack', side: 'player', actor: 0, target: 1, damage: 25000, melee: true, category: 'combo' },
      { type: 'wait', ms: 250 },
      // ...and Glacidrake's frost finishes it.
      { type: 'skill', side: 'player', actor: 1, skillId: 'frostBreath', target: 1, damage: 40000, dramatic: true },
      { type: 'die', actor: 1 },
      { type: 'wait', ms: 200 },
    ],
    // Hold VICTORY briefly, then the win drops a reward egg in the battle panel
    // (victoryReward) before resolving into the egg-crack reward scene. Raise the
    // VICTORY label (labelYFrac) so it clears the reward egg below it.
    onVictory: { labelText: 'VICTORY!', holdMs: 500, heroPose: false, labelYFrac: 0.18 },
    victoryReward: true,
  };
}

// Boss battle: the collected Boneclaw joins Glacidrake + hero against the boss.
// Boneclaw has only Idle/Move/Basic_Attack, so it contributes melee beats (no
// skill VFX). Player damage is tuned to leave the boss alive for the hero's
// finisher (last attack + die).
export function buildBossFight(): FightSceneConfig {
  return {
    background: battleBgStage1,
    bossFight: true,
    characterScale: 0.12,
    players: [
      { spine: HERO_BASE_BUNDLE, skin: HERO_BASE_SKIN, maxHp: 200000, hp: 200000, maxRage: 100, melee: true, xFrac: 0.27, yFrac: 0.80 },
      { spine: GLACIDRAKE_BUNDLE, skin: 'Glacidrake', maxHp: 100000, melee: true, scale: 0.026, xFrac: 0.08, yFrac: 0.96 },
      { spine: BONECLAW_BUNDLE, skin: BONECLAW_SKIN, maxHp: 100000, melee: true, scale: BONECLAW_BUNDLE.defaultScale, xFrac: 0.16, yFrac: 0.90 },
    ],
    enemies: [
      { spine: skeletonKingBundle, skin: 'default', maxHp: 320000, melee: true, maxRage: 100, xFrac: 0.82, yFrac: 0.85 },
    ],
    steps: [
      // 1. Hero melee opener.
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 20 },
      { type: 'wait', ms: 400 },
      // 2. Glacidrake frost breath.
      { type: 'skill', side: 'player', actor: 1, skillId: 'frostBreath', target: 0, damage: 30000 },
      { type: 'wait', ms: 400 },
      // 3. Boneclaw joins in (melee — its only attack anim).
      { type: 'attack', side: 'player', actor: 2, target: 0, damage: 30000, melee: true, dramatic: true },
      { type: 'wait', ms: 400 },
      // 4. Boss rage hit on the hero.
      { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 70000, category: 'rage', dramatic: true },
      { type: 'vignette', on: true },
      { type: 'wait', ms: 400 },
      // 5. Hero chain lightning.
      { type: 'skill', side: 'player', actor: 0, skillId: 'chainLightning', target: 0, damage: 35000 },
      { type: 'wait', ms: 400 },
      // 6. Glacidrake glacial strike freezes the boss (big, not lethal).
      { type: 'skill', side: 'player', actor: 1, skillId: 'glacialStrike', target: 0, damage: 45000, dramatic: true, crit: true },
      { type: 'wait', ms: 300 },
      // 7. Boneclaw combo crit.
      { type: 'attack', side: 'player', actor: 2, target: 0, damage: 40000, melee: true, category: 'combo', crit: true },
      { type: 'wait', ms: 300 },
      // 8. Hero finisher — the killing blow.
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 60000, melee: true, category: 'combo', crit: true, dramatic: true },
      { type: 'die', actor: 0 },
      { type: 'vignette', on: false },
    ],
    // No hero victory flourish — the finisher already lands the kill, so a rage
    // swing at the dead boss reads as an extra unnecessary hit.
    onVictory: { labelText: 'VICTORY!', holdMs: 250, heroPose: false },
  };
}
