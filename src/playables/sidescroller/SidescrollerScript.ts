import type { SpineAssets } from '@shared/SpineCharacter';

export interface HeroScriptConfig {
  spineBundle: SpineAssets;
  skin?: string;
  scale: number;
  hp: number;
  speed: number;
  attackRate: number;
  arrowDamage: number;
  arrowSpeed: number;
}

export interface EnemySpawnDef {
  id: string;
  spineBundle: SpineAssets;
  skin?: string;
  scale: number;
  hp: number;
  speed: number;
  damage: number;
  count: number;
  isBoss?: boolean;
}

export interface EnemyWaveConfig {
  enemies: EnemySpawnDef[];
  spawnDelay: number;
  waveDelay: number;
}

export interface ContinuousConfig {
  duration: number;
  spawnInterval: number;
  enemyPool: EnemySpawnDef[];
  difficultyRamp: number;
}

export interface EndCardConfig {
  splashImage?: string;
  logoImage?: string;
}

export type PowerupId = 'fasterRate' | 'spectralArrows' | 'iceArrows'
  | 'magneticArrows' | 'fireArrows' | 'lightningArrows' | 'splitArrows';

export interface PowerupDef {
  id: PowerupId;
  name: string;
  description: string;
  iconColor: number;
  icon?: string;
  params?: Record<string, number>;
}

export interface XpConfig {
  xpPerKill: number;
  xpToLevelUp: number;
  choicesPerLevel: number;
  orbFlyDurationMs: number;
  availablePowerups: PowerupDef[];
}

export interface EnemyBehaviorConfig {
  engageThreshold: number;
  speedJitter: number;
}

export interface SidescrollerScript {
  hero: HeroScriptConfig;
  background: string;
  mode: 'waves' | 'continuous';
  waves?: EnemyWaveConfig[];
  continuous?: ContinuousConfig;
  endCard?: EndCardConfig;
  xp?: XpConfig;
  enemyBehavior?: EnemyBehaviorConfig;
}
