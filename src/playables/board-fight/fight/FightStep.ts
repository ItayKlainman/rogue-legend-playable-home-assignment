import type { SpineAssets, WeaponConfig } from '@shared/SpineCharacter';
import type { SkillConfig } from '../skills';
import type { LevelUpSceneConfig } from '../scenes/LevelUpScene';
import type { WeaponRewardSceneConfig } from '../scenes/WeaponRewardScene';
import type { FightProgressBarH } from '../FightProgressBarH';

export interface ActorConfig {
  spine: SpineAssets;
  skin?: string;
  maxHp: number;
  hp?: number;                // defaults to maxHp if omitted
  maxRage?: number;           // if set, shows a rage bar (hero only)
  melee?: boolean;            // if true, attacks default to melee approach
  position?: number;          // layout slot within its side (0=front, 1=back...)
  weaponEnchant?: string;     // optional skill ID — adds persistent glow to weapon
  scale?: number;              // per-actor scale override (overrides characterScale)
  xFrac?: number;             // 0..1 fraction of battle area width (overrides formula)
  yFrac?: number;             // 0..1 fraction of battle area height (overrides formula)
}

export type AttackCategory = 'basic' | 'combo' | 'counter' | 'rage';

export type FightStep =
  | FightStepAttack
  | FightStepSkill
  | FightStepStatus
  | FightStepDie
  | FightStepWait
  | FightStepLabel
  | FightStepLevelUp
  | FightStepWeaponReward
  | FightStepVignette;

export interface FightStepAttack {
  type: 'attack';
  side: 'player' | 'enemy';
  actor: number;
  target: number;
  targetSide?: 'player' | 'enemy';
  category?: AttackCategory;
  damage?: number;
  crit?: boolean;
  melee?: boolean;
  return?: boolean;
  dodge?: boolean;
  dramatic?: boolean;
  rageFill?: number;
  hpChanges?: number[];
  group?: string;
}

export interface FightStepSkill {
  type: 'skill';
  side: 'player' | 'enemy';
  actor: number;
  target?: number;
  targetSide?: 'player' | 'enemy';
  skillId?: string;
  usePlayerSkill?: true;
  useAllPlayerSkills?: true;
  damage?: number;
  crit?: boolean;
  dramatic?: boolean;
  hpChanges?: number[];
  group?: string;
}

export interface FightStepStatus {
  type: 'status';
  target: number;
  side?: 'player' | 'enemy';
  effect: string;
  stacks: number;
  loopVfx?: string;
}

export interface FightStepDie {
  type: 'die';
  actor: number;
  side?: 'player' | 'enemy';
}

export interface FightStepWait {
  type: 'wait';
  ms: number;
}

export interface FightStepLabel {
  type: 'label';
  text: string;
  actor?: number;
  side?: 'player' | 'enemy';
}

export interface FightStepLevelUp {
  type: 'levelup';
  config?: LevelUpSceneConfig;
}

export interface FightStepWeaponReward {
  type: 'weaponReward';
  config: WeaponRewardSceneConfig;
  atkBoost?: number;
}

export interface FightStepVignette {
  type: 'vignette';
  on: boolean;
}

export interface FightSceneConfig {
  players: ActorConfig[];
  enemies: ActorConfig[];
  damageVariance?: number;    // default 0.15 (±15%)
  characterScale?: number;    // default 0.12, applies to all actors
  bossFight?: boolean;        // if true, shows "BOSS FIGHT" title during intro
  eliteFight?: boolean;       // if true, shows enlarged red icon + "ELITE" label on progress bar
  hitsCounter?: boolean;      // if true, shows top-left "Hits: X" combo counter (injected by Director from PlayableScript)
  background: string;         // webpack base64 import for battle background
  steps: FightStep[];
  allSkills?: SkillConfig[];  // injected by PlayableDirector at runtime
  onVictory?: {
    labelText?: string;       // default "VICTORY!"
    holdMs?: number;          // how long to hold before resolving done (default 1500ms)
    heroPose?: boolean;       // play the hero's rage flourish on victory (default true);
                              // set false to avoid the hero swinging after the kill
    labelYFrac?: number;      // VICTORY label Y as a fraction of the battle panel
                              // height (default 0.4); lower = higher on screen
  };
  /** If true, a reward egg pops up in the battle panel after victory before the
   *  scene resolves (egg-escalate small fight → carries into the crack reward). */
  victoryReward?: boolean;
  /** Debug: loop the VS intro endlessly (no fight steps, no victory). */
  debugVsLoop?: boolean;
  /** Debug: loop the entire fight endlessly (reset enemies after victory). */
  debugLoop?: boolean;
  /** Horizontal progress bar injected by PlayableDirector for no-board mode. */
  progressBar?: FightProgressBarH;
}
