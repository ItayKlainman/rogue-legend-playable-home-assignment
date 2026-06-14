import { Assets, Sprite } from 'pixi.js';
import { registerSkillVfx } from '../board-fight/fight/skillVfx/registry';
import { pickRandomLiving } from '../board-fight/fight/skillVfx/vfxUtils';
import shurikenData from 'assets/Skills/skill_Shuriken.webp';

// A lighter shuriken throw for the egg-summon hero: FEW stars, thrown slowly &
// deliberately (board-fight's `shurikenFlurry` hurls 16 very fast — too rushed
// here). Egg-summon-local so board-fight is untouched.
const COUNT = 5;
const FLY_MS = 210;
const STAGGER_MS = 180;
const SCALE = 0.12;
const SPIN = Math.PI * 3;

registerSkillVfx('shurikenThrow', async (ctx) => {
  const tex = await Assets.load(shurikenData);
  const perHit = Math.round(ctx.totalDamage / COUNT);
  const shots: Promise<void>[] = [];
  for (let i = 0; i < COUNT; i++) {
    const dmg = i < COUNT - 1 ? perHit : ctx.totalDamage - perHit * (COUNT - 1);
    shots.push((async () => {
      await ctx.delay(i * STAGGER_MS);
      const target = pickRandomLiving(ctx.allEnemies);
      if (!target) return;
      ctx.pulse();
      const sx = ctx.actor.character.spine.x;
      const sy = ctx.actor.character.spine.y - 80 + (i - 2) * 10;
      const ex = target.character.spine.x;
      const ey = target.character.spine.y - 40;
      const s = new Sprite(tex);
      s.anchor.set(0.5); s.scale.set(SCALE); s.position.set(sx, sy);
      ctx.battleArea.addChild(s);
      await ctx.tween(FLY_MS, (t) => { s.x = sx + (ex - sx) * t; s.y = sy + (ey - sy) * t; s.rotation = t * SPIN; });
      s.destroy();
      if (target.hp <= 0) return;
      ctx.playHit(target);
      ctx.flash(target);
      ctx.shake(3);
      ctx.showDamage(target, dmg);
      await ctx.tweenHp(target, Math.max(0, target.hp - dmg));
    })());
  }
  await Promise.all(shots);
});
