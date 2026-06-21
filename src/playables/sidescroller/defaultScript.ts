import type { SidescrollerScript } from './SidescrollerScript';
import { heroBundle } from './catalog/hero';
import { slimeBundle } from './catalog/enemies/slime';
import { goblinGruntBundle } from './catalog/enemies/goblinGrunt';
import { skeletonArcherBundle } from './catalog/enemies/skeletonArcher';
import { skeletonKingBundle } from './catalog/enemies/skeletonKing';
import battleBg from './catalog/battleBgs/stage3';
import iconBerserk from 'assets/Skills/skill_Berserk.webp';
import iconBolt from 'assets/Skills/skill_Bolt.webp';
import iconThunderstorm from 'assets/Skills/skill_Thunderstorm.webp';
import iconMeteor from 'assets/Skills/skill_Meteor.webp';
import iconFireball from 'assets/Skills/skill_Deadly_Fireball.webp';
import iconLightning from 'assets/Skills/skill_Lightning_Shot.webp';
import iconShuriken from 'assets/Skills/skill_DeadlyShuriken.webp';
import gameLogo from 'assets/UI/LOGO_rogue legend_.webp';

// Idle Tower Defense pacing: the hero never moves and auto-casts. Enemy SPAWN RATE
// (spawnDelay) is the pacing dial — enemies die ~1 shot early, so kills ≈ spawns.
// xpToLevelUp = 18 → a level-up roughly every 18 kills; waves are sized so 5 level-ups
// land spread across ~45s, then the boss wave closes the run. Numbers are faked to hit beats.
export function getDefaultScript(): SidescrollerScript {
  return {
    hero: {
      spineBundle: heroBundle,
      skin: 'Fire_Wizard', // wand-wielding hero (assignment optional) → "spells" fantasy
      scale: 0.14,
      hp: 2000, // tanky: power fantasy — hero reliably survives to KILL the boss
      speed: 0, // idle: never moves
      attackRate: 6, // fast clears → enemies rarely pile up on the idle hero
      arrowDamage: 26,
      arrowSpeed: 850,
    },
    background: battleBg,
    enemyBehavior: {
      engageThreshold: 0.25,
      speedJitter: 0.3,
    },
    xp: {
      xpPerKill: 1,
      xpToLevelUp: 18, // ~a level-up every 18 kills; waves are sized so the 5 level-ups spread across the run (not all in the first seconds)
      choicesPerLevel: 3,
      orbFlyDurationMs: 300,
      availablePowerups: [
        {
          id: 'lightningArrows',
          name: 'Chain Lightning',
          description: 'Bolts arc to 2 nearby foes',
          iconColor: 0xffee44,
          icon: iconLightning,
          params: { chainCount: 2, chainDamageRatio: 0.6, chainRange: 320 },
        },
        {
          id: 'fireArrows',
          name: 'Fire Bolts',
          description: 'Burn enemies on hit',
          iconColor: 0xff6600,
          icon: iconFireball,
          params: { burnDps: 12, burnDurationMs: 2500 },
        },
        {
          id: 'splitArrows',
          name: 'Triple Shuriken',
          description: 'Bolts split into 2 mid-flight',
          iconColor: 0x66ccff,
          icon: iconShuriken,
          params: { splitDelayMs: 120, splitAngle: 16 },
        },
        {
          id: 'fasterRate',
          name: 'Rapid Cast',
          description: 'Double cast speed',
          iconColor: 0xff6600,
          icon: iconBerserk,
          params: { rateMultiplier: 2.0 },
        },
        {
          id: 'magneticArrows',
          name: 'Seeking Bolts',
          description: 'Bolts home in on enemies',
          iconColor: 0xff4444,
          icon: iconMeteor,
          params: { homingStrength: 3.0 },
        },
        {
          id: 'iceArrows',
          name: 'Frost Bolts',
          description: 'Slow enemies on hit',
          iconColor: 0x44ccff,
          icon: iconThunderstorm,
          params: { slowFactor: 0.3, slowDurationMs: 3000 },
        },
        {
          id: 'spectralArrows',
          name: 'Piercing Bolts',
          description: 'Bolts pierce through enemies',
          iconColor: 0xaa44ff,
          icon: iconBolt,
        },
      ],
    },
    endCard: {
      logoImage: gameLogo,
    },
    mode: 'waves',
    waves: [
      // Wave 1 — slime swarm intro → ~LEVEL 1 (1-shot slimes form a starter cluster)
      {
        enemies: [
          { id: 'slime', spineBundle: slimeBundle, scale: 0.09, hp: 22, speed: 60, damage: 1, count: 16 },
        ],
        spawnDelay: 280,
        burst: 2,
        waveDelay: 300,
      },
      // Wave 2 — wall thickens → ~LEVEL 2 (2-hit goblins linger; spawn sustained so the crowd holds)
      {
        enemies: [
          { id: 'slime', spineBundle: slimeBundle, scale: 0.09, hp: 24, speed: 60, damage: 1, count: 10 },
          { id: 'goblin', spineBundle: goblinGruntBundle, scale: 0.11, hp: 42, speed: 65, damage: 1, count: 18 },
        ],
        spawnDelay: 320,
        burst: 2,
        waveDelay: 300,
      },
      // Wave 3 — peak wall → ~LEVEL 3-4 (tankier 2-3-hit foes keep kills flowing through the mid-run)
      {
        enemies: [
          { id: 'goblin', spineBundle: goblinGruntBundle, scale: 0.11, hp: 50, speed: 65, damage: 1, count: 20 },
          { id: 'skeleton', spineBundle: skeletonArcherBundle, scale: 0.11, hp: 60, speed: 70, damage: 2, count: 20 },
        ],
        spawnDelay: 360,
        burst: 2,
        waveDelay: 350,
      },
      // Wave 4 — tanky grind → ~LEVEL 5, then BOSS climax (the king spawns alone after the swarm clears)
      {
        enemies: [
          { id: 'skeleton', spineBundle: skeletonArcherBundle, scale: 0.11, hp: 70, speed: 72, damage: 2, count: 22 },
          { id: 'goblin', spineBundle: goblinGruntBundle, scale: 0.11, hp: 56, speed: 75, damage: 1, count: 20 },
          { id: 'skeleton_king', spineBundle: skeletonKingBundle, scale: 0.24, hp: 460, speed: 60, damage: 10, count: 1, isBoss: true },
        ],
        spawnDelay: 480,
        burst: 2,
        waveDelay: 0,
      },
    ],
  };
}
