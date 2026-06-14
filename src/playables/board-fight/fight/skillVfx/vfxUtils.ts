import type { FightActor } from '../FightActor';

/** Pick a random living enemy from the array. Returns null if none alive. */
export function pickRandomLiving(enemies: FightActor[]): FightActor | null {
  const living = enemies.filter(e => e.hp > 0);
  if (living.length === 0) return null;
  return living[Math.floor(Math.random() * living.length)];
}
