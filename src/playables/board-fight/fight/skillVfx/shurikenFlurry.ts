import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import { registerSkillVfx } from './registry';
import { SpriteEffect } from '@shared/SpriteEffect';
import { fireballSheet } from './sharedAssets';
import { pickRandomLiving } from './vfxUtils';
import shurikenData from 'assets/Skills/skill_Shuriken.webp';
import deadlyShurikenData from 'assets/Skills/skill_DeadlyShuriken.webp';
import type { FightActor } from '../FightActor';
import type { SkillVfxContext } from './registry';

const BASE_COUNT = 16;
const FLY_MS = 120;
const STAGGER_MS = 100;
const PROJECTILE_SCALE = 0.12;
const TOTAL_SPIN = Math.PI * 3;

const FUMA_FLY_MS = 260;
const FUMA_SCALE = 0.25;
const FUMA_FIRE_SCALE = 0.4;
const FUMA_SPIN = Math.PI * 4;

// Module-scope memoized loader for the fuma-shuriken fire trail effect.
let fumaFireEffectP: Promise<SpriteEffect> | null = null;
const getFumaFireEffect = () => fumaFireEffectP ??=
  SpriteEffect.load({ spriteData: fireballSheet, columns: 2, rows: 2, fps: 15 });

async function playFumaShuriken(ctx: SkillVfxContext, target: FightActor, dmg: number, fireEffect: SpriteEffect) {
  if (target.hp <= 0) return;

  const startX = ctx.actor.character.spine.x;
  const startY = ctx.actor.character.spine.y - 100;
  const endX = target.character.spine.x;
  const endY = target.character.spine.y - 40;

  const shurikenTex = await Assets.load(deadlyShurikenData);

  const projectile = new Container();
  projectile.position.set(startX, startY);
  ctx.battleArea.addChild(projectile);

  const shuriken = new Sprite(shurikenTex);
  shuriken.anchor.set(0.5);
  shuriken.scale.set(FUMA_SCALE);
  projectile.addChild(shuriken);

  fireEffect.play(projectile, 0, 0, { loop: true, scale: FUMA_FIRE_SCALE });

  await ctx.tween(FUMA_FLY_MS, (t) => {
    projectile.x = startX + (endX - startX) * t;
    projectile.y = startY + (endY - startY) * t;
    shuriken.rotation = t * FUMA_SPIN;
  });

  projectile.destroy({ children: true });

  const flashOverlay = new Graphics();
  flashOverlay.rect(-500, -500, 3000, 3000)
    .fill({ color: 0xffffff, alpha: 0.35 });
  ctx.battleArea.addChild(flashOverlay);
  await ctx.delay(45);
  flashOverlay.destroy();

  if (target.hp <= 0) return;
  ctx.playHit(target);
  ctx.flash(target);
  ctx.shake(6);
  ctx.showDamage(target, dmg, { color: 0xff4422 });
  const newHp = Math.max(0, target.hp - dmg);
  await ctx.tweenHp(target, newHp);
}

registerSkillVfx('shurikenFlurry', async (ctx) => {
  const hasDeadlyStars = ctx.playerState.skills.includes('deadlyStars');
  const hasFuma = ctx.playerState.skills.includes('fumaShuriken');

  const count = hasDeadlyStars ? BASE_COUNT * 2 : BASE_COUNT;
  const perHit = Math.round(ctx.totalDamage / count);

  const tex = await Assets.load(shurikenData);

  // Staggered shuriken launches on random enemies
  const projectiles: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const dmg = i < count - 1 ? perHit : ctx.totalDamage - perHit * (count - 1);
    const p = (async () => {
      await ctx.delay(i * STAGGER_MS);
      const target = pickRandomLiving(ctx.allEnemies);
      if (!target) return;

      ctx.pulse();
      const startX = ctx.actor.character.spine.x;
      const startY = ctx.actor.character.spine.y - 80;
      const endX = target.character.spine.x;
      const endY = target.character.spine.y - 40;

      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.scale.set(PROJECTILE_SCALE);
      const offsetY = ((i % BASE_COUNT) - 1) * 12;
      sprite.position.set(startX, startY + offsetY);
      ctx.battleArea.addChild(sprite);

      const sy = startY + offsetY;
      await ctx.tween(FLY_MS, (t) => {
        sprite.x = startX + (endX - startX) * t;
        sprite.y = sy + (endY - sy) * t;
        sprite.rotation = t * TOTAL_SPIN;
      });

      sprite.destroy();
      if (target.hp <= 0) return;
      ctx.playHit(target);
      ctx.flash(target);
      ctx.shake(3);
      ctx.showDamage(target, dmg);
      const newHp = Math.max(0, target.hp - dmg);
      await ctx.tweenHp(target, newHp);
    })();
    projectiles.push(p);
  }

  await Promise.all(projectiles);

  // Fuma Shuriken chain: fire fuma at ALL living enemies simultaneously
  if (hasFuma) {
    const livingEnemies = ctx.allEnemies.filter(e => e.hp > 0);
    if (livingEnemies.length > 0) {
      const fumaFireEffect = await getFumaFireEffect();
      const fumaDmg = Math.round(ctx.totalDamage * 0.4 / livingEnemies.length);
      const fumaHits = livingEnemies.map(enemy => {
        ctx.pulse();
        return playFumaShuriken(ctx, enemy, fumaDmg, fumaFireEffect);
      });
      await Promise.all(fumaHits);
    }
  }
});
