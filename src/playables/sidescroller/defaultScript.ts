import type { SidescrollerScript } from './SidescrollerScript';
import { heroBundle } from './catalog/hero';
import { slimeBundle } from './catalog/enemies/slime';
import { goblinGruntBundle } from './catalog/enemies/goblinGrunt';
import { skeletonArcherBundle } from './catalog/enemies/skeletonArcher';
import { skeletonKingBundle } from './catalog/enemies/skeletonKing';
import battleBg from './catalog/battleBgs/stage1';
import iconBerserk from 'assets/Skills/skill_Berserk.webp';
import iconBolt from 'assets/Skills/skill_Bolt.webp';
import iconThunderstorm from 'assets/Skills/skill_Thunderstorm.webp';
import iconMeteor from 'assets/Skills/skill_Meteor.webp';
import iconFireball from 'assets/Skills/skill_Deadly_Fireball.webp';
import iconLightning from 'assets/Skills/skill_Lightning_Shot.webp';
import iconShuriken from 'assets/Skills/skill_DeadlyShuriken.webp';
import gameLogo from 'assets/UI/LOGO_rogue legend_.webp';

export function getDefaultScript(): SidescrollerScript {
  return {
    hero: {
      spineBundle: heroBundle,
      skin: 'Base',
      scale: 0.14,
      hp: 200,
      speed: 280,
      attackRate: 5,
      arrowDamage: 11,
      arrowSpeed: 800,
    },
    background: battleBg,
    enemyBehavior: {
      engageThreshold: 0.25,
      speedJitter: 0.3,
    },
    xp: {
      xpPerKill: 1,
      xpToLevelUp: 40,
      choicesPerLevel: 3,
      orbFlyDurationMs: 300,
      availablePowerups: [
        {
          id: 'fasterRate',
          name: 'Rapid Fire',
          description: 'Double fire rate',
          iconColor: 0xff6600,
          icon: iconBerserk,
          params: { rateMultiplier: 2.0 },
        },
        {
          id: 'spectralArrows',
          name: 'Spectral Arrows',
          description: 'Arrows pierce enemies',
          iconColor: 0xaa44ff,
          icon: iconBolt,
        },
        {
          id: 'iceArrows',
          name: 'Ice Arrows',
          description: 'Slow enemies on hit',
          iconColor: 0x44ccff,
          icon: iconThunderstorm,
          params: { slowFactor: 0.3, slowDurationMs: 3000 },
        },
        {
          id: 'magneticArrows',
          name: 'Magnetic Arrows',
          description: 'Arrows home in on enemies',
          iconColor: 0xff4444,
          icon: iconMeteor,
          params: { homingStrength: 3.0 },
        },
        {
          id: 'fireArrows',
          name: 'Fire Arrows',
          description: 'Burn enemies on hit',
          iconColor: 0xff6600,
          icon: iconFireball,
          params: { burnDps: 8, burnDurationMs: 2000 },
        },
        {
          id: 'lightningArrows',
          name: 'Lightning Arrows',
          description: 'Chain to 2 nearby enemies',
          iconColor: 0xffee44,
          icon: iconLightning,
          params: { chainCount: 2, chainDamageRatio: 0.5, chainRange: 300 },
        },
        {
          id: 'splitArrows',
          name: 'Split Shot',
          description: 'Arrows split into 2 after short flight',
          iconColor: 0x66ccff,
          icon: iconShuriken,
          params: { splitDelayMs: 150, splitAngle: 15 },
        },
      ],
    },
    endCard: {
      logoImage: gameLogo,
    },
    mode: 'waves',
    waves: [
      {
        enemies: [
          {
            id: 'slime',
            spineBundle: slimeBundle,
            scale: 0.09,
            hp: 10,
            speed: 95,
            damage: 8,
            count: 44,
          },
        ],
        spawnDelay: 60,
        waveDelay: 1200,
      },
      {
        enemies: [
          {
            id: 'goblin',
            spineBundle: goblinGruntBundle,
            scale: 0.11,
            hp: 15,
            speed: 115,
            damage: 12,
            count: 33,
          },
          {
            id: 'slime',
            spineBundle: slimeBundle,
            scale: 0.09,
            hp: 10,
            speed: 100,
            damage: 8,
            count: 26,
          },
        ],
        spawnDelay: 50,
        waveDelay: 1200,
      },
      {
        enemies: [
          {
            id: 'skeleton',
            spineBundle: skeletonArcherBundle,
            scale: 0.11,
            hp: 20,
            speed: 125,
            damage: 15,
            count: 29,
          },
          {
            id: 'goblin',
            spineBundle: goblinGruntBundle,
            scale: 0.11,
            hp: 15,
            speed: 120,
            damage: 12,
            count: 29,
          },
        ],
        spawnDelay: 40,
        waveDelay: 1200,
      },
      {
        enemies: [
          {
            id: 'skeleton_king',
            spineBundle: skeletonKingBundle,
            scale: 0.22,
            hp: 300,
            speed: 60,
            damage: 40,
            count: 1,
            isBoss: true,
          },
          {
            id: 'skeleton',
            spineBundle: skeletonArcherBundle,
            scale: 0.11,
            hp: 15,
            speed: 130,
            damage: 12,
            count: 18,
          },
          {
            id: 'goblin',
            spineBundle: goblinGruntBundle,
            scale: 0.11,
            hp: 12,
            speed: 135,
            damage: 10,
            count: 18,
          },
        ],
        spawnDelay: 60,
        waveDelay: 0,
      },
    ],
  };
}
