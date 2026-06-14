import type { HeroEntity } from '../entities/HeroEntity';
import type { EnemyEntity } from '../entities/EnemyEntity';
import type { Projectile } from '../entities/Projectile';

export interface CollisionResult {
  projectileHits: { projectile: Projectile; enemy: EnemyEntity }[];
  heroContacts: EnemyEntity[];
}

export function checkCollisions(
  hero: HeroEntity,
  enemies: EnemyEntity[],
  projectiles: Projectile[],
): CollisionResult {
  const projectileHits: { projectile: Projectile; enemy: EnemyEntity }[] = [];
  const heroContacts: EnemyEntity[] = [];

  for (const projectile of projectiles) {
    if (!projectile.isActive) {
      continue;
    }

    for (const enemy of enemies) {
      if (!enemy.isAlive) {
        continue;
      }

      if (projectile.piercing && projectile.hitEnemyIds.has(enemy.id)) {
        continue;
      }

      if (circleOverlap(projectile.x, projectile.y, 20, enemy.x, enemy.centerY, enemy.hitRadius)) {
        projectileHits.push({ projectile, enemy });
        projectile.hitEnemyIds.add(enemy.id);

        if (!projectile.piercing) {
          break;
        }
      }
    }
  }

  if (hero.isAlive) {
    for (const enemy of enemies) {
      if (!enemy.canDealDamage) {
        continue;
      }

      if (circleOverlap(hero.x, hero.y, hero.hitRadius, enemy.x, enemy.y, enemy.hitRadius)) {
        heroContacts.push(enemy);
      }
    }
  }

  return { projectileHits, heroContacts };
}

function circleOverlap(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const distSq = dx * dx + dy * dy;
  const radSum = r1 + r2;
  return distSq <= radSum * radSum;
}
