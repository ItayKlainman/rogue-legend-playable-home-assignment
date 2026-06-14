import type { SkillDef, SkillId } from './config';

export const ROSTER: SkillDef[] = [
  { id: 'shuriken', family: 'shuriken', tier: 1, target: 'enemy', cost: 5, vfxId: 'shurikenFlurry' },
  { id: 'fireball', family: 'fire', tier: 1, target: 'enemy', cost: 8, vfxId: 'fireballBarrage' },
  { id: 'bolt', family: 'lightning', tier: 1, target: 'enemy', cost: 10, vfxId: 'chainLightning' },
  { id: 'heal', family: 'none', tier: 1, target: 'self', cost: 8, vfxId: 'heal' },
  { id: 'flameStrike', family: 'fire', tier: 2, target: 'enemy', cost: 14, vfxId: 'fireballBarrage' },
  { id: 'lightningShot', family: 'lightning', tier: 2, target: 'enemy', cost: 14, vfxId: 'chainLightning' },
  { id: 'meteor', family: 'fire', tier: 3, target: 'enemy', cost: 17, vfxId: 'fireballBarrage' },
  { id: 'thunderstorm', family: 'lightning', tier: 3, target: 'enemy', cost: 18, vfxId: 'chainLightning' },
];

const BY_ID = new Map<SkillId, SkillDef>(ROSTER.map(s => [s.id, s]));
export function skillById(id: SkillId): SkillDef | undefined { return BY_ID.get(id); }
