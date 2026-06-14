import { Container } from 'pixi.js';
import type { FightActor } from '../FightActor';
import type { PlayerState } from '../../PlayerState';
import type { DamageNumberOpts } from '../DamageNumber';

export interface SkillVfxContext {
  actor: FightActor;
  target?: FightActor;
  allEnemies: FightActor[];
  allPlayers: FightActor[];
  playerState: PlayerState;
  totalDamage: number;
  battleArea: Container;
  showDamage: (target: FightActor, amount: number, opts?: DamageNumberOpts) => void;
  tweenHp: (target: FightActor, newHp: number) => Promise<void>;
  delay: (ms: number) => Promise<void>;
  flash: (target: FightActor) => void;
  playHit: (target: FightActor) => void;
  shake: (px: number) => void;
  tween: (durationMs: number, fn: (t: number) => void) => Promise<void>;
  pulse: () => void;
}

export type SkillVfxHandler = (ctx: SkillVfxContext) => Promise<void>;

export const skillVfxRegistry = new Map<string, SkillVfxHandler>();

export function registerSkillVfx(id: string, handler: SkillVfxHandler): void {
  skillVfxRegistry.set(id, handler);
}
