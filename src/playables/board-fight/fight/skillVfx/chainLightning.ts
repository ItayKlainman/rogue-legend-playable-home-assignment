import { Graphics } from 'pixi.js';
import { registerSkillVfx } from './registry';
import { SpriteEffect } from '@shared/SpriteEffect';
import { electricitySplashSheet, lazerSheet } from './sharedAssets';
import lightningSheet from 'assets/VFX/LightningBurst_1.webp';
import type { FightActor } from '../FightActor';
import type { SkillVfxContext } from './registry';

const COUNT = 6;
const STAGGER_MS = 100;

// Module-scope memoized loaders.
let megaEffectP: Promise<SpriteEffect> | null = null;
const getMegaEffect = () => megaEffectP ??=
  SpriteEffect.load({ spriteData: lazerSheet, columns: 4, rows: 4, totalFrames: 16, fps: 30 });

let burstEffectP: Promise<SpriteEffect> | null = null;
const getBurstEffect = () => burstEffectP ??=
  SpriteEffect.load({ spriteData: lightningSheet, columns: 6, rows: 6, totalFrames: 36, fps: 50 });

let splashEffectP: Promise<SpriteEffect> | null = null;
const getSplashEffect = () => splashEffectP ??=
  SpriteEffect.load({ spriteData: electricitySplashSheet, columns: 4, rows: 2, totalFrames: 5, fps: 15 });

async function playBolt(
  ctx: SkillVfxContext,
  target: FightActor,
  dmg: number,
  useMega: boolean,
  megaEffect: SpriteEffect | null,
  burstEffect: SpriteEffect | null,
) {
  const tx = target.character.spine.x;

  if (useMega && megaEffect) {
    const ty = target.character.spine.y - 200;
    const anim = megaEffect.play(ctx.battleArea, tx, ty, { scale: 2.0 });
    anim.rotation = 0;
  } else if (burstEffect) {
    const ty = target.character.spine.y - 120;
    const anim = burstEffect.play(ctx.battleArea, tx, ty, { scale: 2.12 });
    anim.rotation = Math.PI / 2 + Math.PI;
  }

  // Screen flash
  const flashOverlay = new Graphics();
  flashOverlay.rect(-500, -500, 3000, 3000)
    .fill({ color: useMega ? 0xffffaa : 0xffffff, alpha: useMega ? 0.35 : 0.3 });
  ctx.battleArea.addChild(flashOverlay);
  await ctx.delay(80);
  flashOverlay.destroy();

  if (target.hp <= 0) return;
  ctx.playHit(target);
  ctx.flash(target);
  ctx.shake(useMega ? 7 : 4);
  ctx.showDamage(target, dmg, { color: 0xffee44 });
  const newHp = Math.max(0, target.hp - dmg);
  await ctx.tweenHp(target, newHp);
}

async function playElectricitySplash(ctx: SkillVfxContext, target: FightActor, splashEffect: SpriteEffect) {
  if (target.hp <= 0) return;
  const tx = target.character.spine.x;
  const ty = target.character.spine.y - 60;
  splashEffect.play(ctx.battleArea, tx, ty, { scale: 0.8 });
  ctx.shake(3);
  await ctx.delay(333); // 5 frames @ 15fps
}

registerSkillVfx('chainLightning', async (ctx) => {
  const livingEnemies = ctx.allEnemies.filter(e => e.hp > 0);
  if (livingEnemies.length === 0) return;

  const hasThunderGod = ctx.playerState.skills.includes('thunderGod');
  const hasThunderstorm = ctx.playerState.skills.includes('thunderstorm');

  const megaEffect = hasThunderGod ? await getMegaEffect() : null;
  const burstEffect = !hasThunderGod ? await getBurstEffect() : null;
  const splashEffect = hasThunderstorm ? await getSplashEffect() : null;

  const totalHits = COUNT * livingEnemies.length;
  const perHit = Math.round(ctx.totalDamage / totalHits);

  const allBolts: Promise<void>[] = [];
  let boltIndex = 0;
  for (let i = 0; i < COUNT; i++) {
    for (const enemy of livingEnemies) {
      const dmg = i < COUNT - 1 ? perHit : Math.round(ctx.totalDamage / livingEnemies.length) - perHit * (COUNT - 1);
      const delay = boltIndex * STAGGER_MS;
      boltIndex++;
      allBolts.push((async () => {
        await ctx.delay(delay);
        if (enemy.hp <= 0) return;
        ctx.pulse();
        await playBolt(ctx, enemy, dmg, hasThunderGod, megaEffect, burstEffect);

        if (hasThunderstorm && splashEffect) {
          await playElectricitySplash(ctx, enemy, splashEffect);
        }
      })());
    }
  }
  await Promise.all(allBolts);
});
