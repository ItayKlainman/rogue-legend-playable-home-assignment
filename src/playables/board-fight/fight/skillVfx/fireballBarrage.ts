import { Graphics } from 'pixi.js';
import { registerSkillVfx } from './registry';
import { SpriteEffect } from '@shared/SpriteEffect';
import { fireballSheet, flameStrikeSheet, explosionSheet } from './sharedAssets';
import { pickRandomLiving } from './vfxUtils';
import type { FightActor } from '../FightActor';
import type { SkillVfxContext } from './registry';

const COUNT = 14;
const FLY_MS = 140;
const STAGGER_MS = 100;
const PROJECTILE_SCALE = 0.5;

// Module-scope memoized loaders — second-and-later activations skip the
// per-Texture allocation cost in SpriteEffect.load().
let fireballEffectP: Promise<SpriteEffect> | null = null;
const getFireballEffect = () => fireballEffectP ??=
  SpriteEffect.load({ spriteData: fireballSheet, columns: 2, rows: 2, fps: 15 });

let flameStrikeEffectP: Promise<SpriteEffect> | null = null;
const getFlameStrikeEffect = () => flameStrikeEffectP ??=
  SpriteEffect.load({ spriteData: flameStrikeSheet, columns: 4, rows: 2, totalFrames: 8, fps: 20 });

let explosionEffectP: Promise<SpriteEffect> | null = null;
const getExplosionEffect = () => explosionEffectP ??=
  SpriteEffect.load({ spriteData: explosionSheet, columns: 4, rows: 2, totalFrames: 8, fps: 20 });

async function playFlameStrike(ctx: SkillVfxContext, target: FightActor, flameEffect: SpriteEffect) {
  if (target.hp <= 0) return;
  const xOffset = (Math.random() - 0.5) * 40;
  const tx = target.character.spine.x + xOffset;
  const ty = target.character.spine.y - 40;
  flameEffect.play(ctx.battleArea, tx, ty, { scale: 0.7 });
  ctx.shake(3);
  await ctx.delay(500); // 8 frames @ 20fps + linger
}

async function playMeteor(ctx: SkillVfxContext, target: FightActor, dmg: number, meteorFireball: SpriteEffect, meteorExplosion: SpriteEffect) {
  if (target.hp <= 0) return;

  const xOffset = (Math.random() - 0.5) * 50;
  const startX = target.character.spine.x - 60 + xOffset;
  const startY = -40;
  const endX = target.character.spine.x + xOffset;
  const endY = target.character.spine.y - 30;

  const anim = meteorFireball.play(ctx.battleArea, startX, startY, {
    loop: true,
    scale: 0.9,
  });

  const angle = Math.atan2(endY - startY, endX - startX) + Math.PI;
  await ctx.tween(300, (t) => {
    const ease = t * t;
    anim.x = startX + (endX - startX) * t;
    anim.y = startY + (endY - startY) * ease;
    anim.rotation = angle;
  });

  anim.destroy();
  meteorExplosion.play(ctx.battleArea, endX, endY, { scale: 1.0 });

  const flashOverlay = new Graphics();
  flashOverlay.rect(-500, -500, 3000, 3000)
    .fill({ color: 0xff8800, alpha: 0.3 });
  ctx.battleArea.addChild(flashOverlay);
  await ctx.delay(60);
  flashOverlay.destroy();

  if (target.hp <= 0) return;
  ctx.playHit(target);
  ctx.flash(target);
  ctx.shake(8);
  ctx.showDamage(target, dmg, { color: 0xff4400 });
  const newHp = Math.max(0, target.hp - dmg);
  await ctx.tweenHp(target, newHp);
}

registerSkillVfx('fireballBarrage', async (ctx) => {
  const hasFlameStrike = ctx.playerState.skills.includes('flameStrike');
  const hasMeteorStorm = ctx.playerState.skills.includes('meteorStorm');

  const perHit = Math.round(ctx.totalDamage / COUNT);
  const fireballEffect = await getFireballEffect();
  const flameStrikeEffect = hasFlameStrike ? await getFlameStrikeEffect() : null;
  const explosionEffect = (hasFlameStrike && hasMeteorStorm) ? await getExplosionEffect() : null;

  const projectiles: Promise<void>[] = [];
  for (let i = 0; i < COUNT; i++) {
    const dmg = i < COUNT - 1 ? perHit : ctx.totalDamage - perHit * (COUNT - 1);
    const p = (async () => {
      await ctx.delay(i * STAGGER_MS);
      const target = pickRandomLiving(ctx.allEnemies);
      if (!target) return;

      ctx.pulse();
      const startX = ctx.actor.character.spine.x;
      const startY = ctx.actor.character.spine.y - 80;
      const endX = target.character.spine.x;
      const endY = target.character.spine.y - 40;
      const offsetY = (i - 0.5) * 15;
      const sx = startX;
      const sy = startY + offsetY;
      const anim = fireballEffect.play(ctx.battleArea, sx, sy, {
        loop: true,
        scale: PROJECTILE_SCALE,
      });

      const angle = Math.atan2(endY - sy, endX - sx);
      anim.rotation = angle + Math.PI;

      await ctx.tween(FLY_MS, (t) => {
        anim.x = sx + (endX - sx) * t;
        anim.y = sy + (endY - sy) * t;
      });

      anim.destroy();
      if (target.hp <= 0) return;
      ctx.playHit(target);
      ctx.flash(target);
      ctx.shake(4);
      ctx.showDamage(target, dmg, { color: 0xff6622 });
      const newHp = Math.max(0, target.hp - dmg);
      await ctx.tweenHp(target, newHp);

      // Flame Strike chain: flame burst on target after fireball hit
      if (hasFlameStrike) {
        await playFlameStrike(ctx, target, flameStrikeEffect!);

        // Meteor Storm chain: meteor after flame strike
        if (hasMeteorStorm) {
          const meteorDmg = Math.round(dmg * 0.5);
          await playMeteor(ctx, target, meteorDmg, fireballEffect, explosionEffect!);
        }
      }
    })();
    projectiles.push(p);
  }

  await Promise.all(projectiles);
});
