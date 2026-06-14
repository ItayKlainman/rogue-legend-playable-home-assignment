import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { FightActor } from '../board-fight/fight/FightActor';
import { registerSkillVfx, type SkillVfxContext } from '../board-fight/fight/skillVfx/registry';
import { pickRandomLiving } from '../board-fight/fight/skillVfx/vfxUtils';
import type { SkillConfig } from '../board-fight/skills';
import { GAME_FONT_STACK } from '@shared/gameFont';
import icon from 'assets/egg-summon/skills/frost_breath.webp';
import frostNovaData from 'assets/egg-summon/skills/frost_nova.webp';

// Glacidrake's REAL skill (from the game data): "deal Ice DMG to all enemies and
// apply 'Chill'. Has a chance to apply 'Freeze'." We use the game's own icons +
// status words (Chill / Freeze); the VFX itself is a PixiJS recreation because the
// game's effect is a non-portable Unity particle system (and the pet's Spine has
// only Idle/Move/Basic_Attack — no skill animation).

export const FROST_BREATH: SkillConfig = {
  id: 'frostBreath',
  name: 'Ice DMG',
  description: "Deals Ice DMG to all enemies and applies 'Chill'.",
  rarity: 'mythic',
  icon,
  family: 'ice',
  tier: 3,
};

/** Floating status word (the game's real terms: "Chill" / "Freeze"). */
function statusText(ctx: SkillVfxContext, target: FightActor, text: string, color: number): void {
  const t = new Text({ text, style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fontSize: 28, fill: color, stroke: { color: 0x06243a, width: 5 } } });
  t.anchor.set(0.5);
  const x = target.character.spine.x;
  const y = target.character.spine.y - 95;
  t.position.set(x, y);
  ctx.battleArea.addChild(t);
  void ctx.tween(950, (p) => { t.y = y - p * 42; t.alpha = p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82; }).then(() => t.destroy());
}

/** A sharp cyan ice crystal pointing "up" (rotate to aim). */
function makeIceShard(scale = 1): Graphics {
  const L = 44 * scale, W = 15 * scale;
  return new Graphics()
    .poly([0, -L * 0.6, W, -L * 0.05, W * 0.55, L * 0.4, -W * 0.55, L * 0.4, -W, -L * 0.05])
    .fill(0x3fc6ff).stroke({ color: 0x0a3a66, width: 3 * scale })
    .poly([0, -L * 0.5, W * 0.45, -L * 0.05, 0, L * 0.25, -W * 0.45, -L * 0.05])
    .fill(0xd6f6ff);
}

/** Cyan frost burst on impact: an expanding ring + scattering ice shards. */
function frostBurst(ctx: SkillVfxContext, x: number, y: number): void {
  const ring = new Graphics().circle(0, 0, 12).stroke({ color: 0xbfefff, width: 4, alpha: 0.9 });
  ring.position.set(x, y); ring.blendMode = 'add';
  ctx.battleArea.addChild(ring);
  void ctx.tween(260, (t) => { ring.scale.set(0.4 + t * 2.4); ring.alpha = (1 - t) * 0.9; }).then(() => ring.destroy());
  for (let k = 0; k < 6; k++) {
    const s = makeIceShard(0.5);
    s.position.set(x, y); ctx.battleArea.addChild(s);
    const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 42;
    void ctx.tween(300, (t) => {
      s.x = x + Math.cos(a) * d * t; s.y = y + Math.sin(a) * d * t + 30 * t * t;
      s.rotation = a + t * 3; s.alpha = 1 - t;
    }).then(() => s.destroy());
  }
}

// Fewer, slower shards so the barrage doesn't feel rushed.
const COUNT = 6;
const FLY_MS = 220;
const STAGGER_MS = 150;

// ── EPIC one-time icy finisher: a full-arena BLIZZARD. A swirling snowstorm
// sweeps the battlefield (snow + wind-blown ice shards driven toward the boss),
// the boss freezes solid mid-storm, frost creeps in from the screen edges, then
// the ice SHATTERS as the storm clears. ───────────────────────────────────────
export const GLACIAL_STRIKE: SkillConfig = {
  id: 'glacialStrike',
  name: 'Ice DMG (Freeze)',
  description: "Ice DMG with a chance to apply 'Freeze'.",
  rarity: 'mythic',
  icon,
  family: 'ice',
  tier: 3,
};

let novaTexP: Promise<Texture> | null = null;
const getNovaTex = () => (novaTexP ??= Assets.load(frostNovaData));

/** One wind-driven snow mote blowing diagonally across the arena toward the boss. */
function blowSnow(ctx: SkillVfxContext, bw: number, bh: number, startDelay: number): Promise<void> {
  return (async () => {
    await ctx.delay(startDelay);
    const flake = new Graphics().circle(0, 0, 1.5 + Math.random() * 3).fill({ color: 0xffffff, alpha: 0.9 });
    flake.blendMode = 'add';
    const x0 = -bw * 0.3 + Math.random() * bw * 0.5;
    const y0 = -bh * 0.2 + Math.random() * bh * 1.2;
    flake.position.set(x0, y0);
    ctx.battleArea.addChild(flake);
    const dx = bw * (0.7 + Math.random() * 0.6);   // blow rightward toward the boss
    const dy = bh * (0.2 + Math.random() * 0.3);   // and drift downward
    const sway = 8 + Math.random() * 22;
    const life = 600 + Math.random() * 450;
    await ctx.tween(life, (t) => {
      if (flake.destroyed) return;
      flake.x = x0 + dx * t + Math.sin(t * 9 + x0) * sway;
      flake.y = y0 + dy * t;
      flake.alpha = (t < 0.15 ? t / 0.15 : 1) * (1 - t * 0.9);
    });
    if (!flake.destroyed) flake.destroy();
  })();
}

/** A fast ice shard streaking with the wind across the arena. */
function blowShard(ctx: SkillVfxContext, bw: number, bh: number, startDelay: number): Promise<void> {
  return (async () => {
    await ctx.delay(startDelay);
    const s = makeIceShard(0.45 + Math.random() * 0.5);
    const x0 = -bw * 0.35 + Math.random() * bw * 0.4;
    const y0 = -bh * 0.25 + Math.random() * bh * 1.1;
    s.position.set(x0, y0);
    ctx.battleArea.addChild(s);
    const dx = bw * (0.85 + Math.random() * 0.5);
    const dy = bh * (0.3 + Math.random() * 0.3);
    s.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    const life = 320 + Math.random() * 220;
    await ctx.tween(life, (t) => {
      if (s.destroyed) return;
      s.x = x0 + dx * t; s.y = y0 + dy * t;
      s.alpha = (t < 0.12 ? t / 0.12 : 1) * (1 - t);
    });
    if (!s.destroyed) s.destroy();
  })();
}

/** A jagged frost crystal that grows inward from a screen edge (the view icing over). */
function edgeFrost(ctx: SkillVfxContext, x: number, y: number, rot: number, scale: number, startDelay: number, holdMs: number): Promise<void> {
  return (async () => {
    await ctx.delay(startDelay);
    const c = makeIceShard(scale);
    c.position.set(x, y); c.rotation = rot; c.scale.set(0);
    ctx.battleArea.addChild(c);
    await ctx.tween(340, (t) => { if (!c.destroyed) c.scale.set(t); });
    await ctx.delay(holdMs);
    await ctx.tween(280, (t) => { if (!c.destroyed) c.alpha = 1 - t; });
    if (!c.destroyed) c.destroy();
  })();
}

/** Make the casting pet visibly attack — play its Basic_Attack with a quick
 *  forward lunge toward the boss, then settle back to Idle. Sells the pet as an
 *  active teammate (its Spine has no dedicated cast clip, so Basic_Attack stands
 *  in for the cast motion). */
function petPerformCast(ctx: SkillVfxContext): void {
  const pet = ctx.actor.character;
  if (pet.hasAnimation('Basic_Attack')) {
    pet.play('Basic_Attack', false);
    pet.queue('Idle', true, 0);   // settle back to Idle after the attack clip
  }
  const spine = pet.spine;
  const homeX = spine.x;
  const baseSX = spine.scale.x, baseSY = spine.scale.y;   // preserve facing (sign) + size
  void ctx.tween(360, (t) => {
    if (spine.destroyed) return;
    const e = Math.sin(Math.min(1, t) * Math.PI);          // 0→1→0 ease
    spine.x = homeX + e * 22;                              // lunge toward the boss
    spine.scale.set(baseSX * (1 + 0.18 * e), baseSY * (1 + 0.18 * e));   // pop for emphasis
  }).then(() => { if (!spine.destroyed) { spine.x = homeX; spine.scale.set(baseSX, baseSY); } });
}

registerSkillVfx('glacialStrike', async (ctx) => {
  const target = ctx.target ?? pickRandomLiving(ctx.allEnemies);
  if (!target) return;
  petPerformCast(ctx);   // the pet visibly attacks as it launches the finisher
  const novaTex = await getNovaTex();
  const tx = target.character.spine.x;
  const ty = target.character.spine.y;

  // Battle-area bounds, derived from the two player anchors (hero 0.36/0.80,
  // pet 0.12/0.96) so the storm fills the whole arena at any screen size.
  const [p0, p1] = ctx.allPlayers;
  const bw = p0 && p1 ? (p0.character.spine.x - p1.character.spine.x) / (0.36 - 0.12) : tx / 0.82;
  const bh = p0 && p1 ? (p1.character.spine.y - p0.character.spine.y) / (0.96 - 0.80) : ty / 0.85;
  ctx.pulse();

  // 1. The wind picks up — a cold blue gloom settles over the arena.
  const gloom = new Graphics().rect(-bw * 0.5, -bh * 0.5, bw * 2, bh * 2).fill({ color: 0x123249, alpha: 0 });
  ctx.battleArea.addChild(gloom);
  void ctx.tween(300, (t) => { gloom.alpha = t * 0.32; });

  // 2. The blizzard sweeps in: streaming snow + wind-blown ice shards + frost
  //    creeping from the edges. Fire-and-forget (self-destructing, guarded) so the
  //    storm keeps blowing while the kill resolves — it must NOT gate the death.
  for (let i = 0; i < 48; i++) void blowSnow(ctx, bw, bh, i * 14);
  for (let i = 0; i < 12; i++) void blowShard(ctx, bw, bh, 150 + i * 48);
  const NE = 5;
  for (let i = 0; i < NE; i++) {
    const fx = bw * (i + 0.5) / NE, fy = bh * (i + 0.5) / NE;
    void edgeFrost(ctx, fx, 0, Math.PI, 0.7 + Math.random() * 0.4, 250 + Math.random() * 250, 360);
    void edgeFrost(ctx, fx, bh, 0, 0.7 + Math.random() * 0.4, 250 + Math.random() * 250, 360);
    void edgeFrost(ctx, 0, fy, Math.PI / 2, 0.6 + Math.random() * 0.4, 250 + Math.random() * 250, 360);
    void edgeFrost(ctx, bw, fy, -Math.PI / 2, 0.6 + Math.random() * 0.4, 250 + Math.random() * 250, 360);
  }

  // 3. IMPACT — white flash + heavy shake + a layered FROST NOVA burst (the game's
  //    frost-nova art) detonates on the boss. This IS the freeze — no ice block.
  await ctx.delay(430);
  ctx.playHit(target);
  ctx.shake(16);
  const flash = new Graphics().rect(-1500, -1500, 5000, 5000).fill({ color: 0xdff4ff, alpha: 0.5 });
  ctx.battleArea.addChild(flash);
  void ctx.tween(260, (t) => { if (!flash.destroyed) flash.alpha = (1 - t) * 0.5; }).then(() => { if (!flash.destroyed) flash.destroy(); });
  // Two frost novas: a fast bright pop + a slower, bigger expanding ring.
  for (const [delayMs, maxScale, durMs] of [[0, 1.7, 380], [70, 2.7, 600]] as const) {
    const nova = new Sprite(novaTex);
    nova.anchor.set(0.5); nova.position.set(tx, ty - 40); nova.scale.set(0);
    nova.blendMode = 'add'; nova.tint = 0xd6f2ff;
    ctx.battleArea.addChild(nova);
    void ctx.delay(delayMs).then(() => ctx.tween(durMs, (t) => {
      if (nova.destroyed) return;
      nova.scale.set(t * maxScale); nova.alpha = 1 - t; nova.rotation = t * 0.6;
    }).then(() => { if (!nova.destroyed) nova.destroy(); }));
  }
  // Frost shards burst outward from the boss.
  for (let k = 0; k < 12; k++) {
    const s = makeIceShard(0.6 + Math.random() * 0.5);
    s.position.set(tx, ty - 40); ctx.battleArea.addChild(s);
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 95;
    void ctx.tween(420, (t) => {
      if (s.destroyed) return;
      s.x = tx + Math.cos(a) * d * t; s.y = (ty - 40) + Math.sin(a) * d * t + 55 * t * t;
      s.rotation = a + t * 4; s.alpha = 1 - t;
    }).then(() => { if (!s.destroyed) s.destroy(); });
  }

  // 4. The freeze lands: big crit damage + FREEZE status. This is NOT the kill —
  //    the pet freezes the boss to set it up; the HERO's melee blow (the next
  //    step) shatters the frozen boss for the finish. So no death animation here.
  statusText(ctx, target, 'FREEZE!', 0x9fe8ff);   // the game's real 'Freeze' status
  ctx.showDamage(target, ctx.totalDamage, { color: 0x9fe8ff, crit: true });
  await ctx.tweenHp(target, Math.max(0, target.hp - ctx.totalDamage));

  // Lift the gloom as the storm tails off.
  void ctx.tween(520, (t) => { if (!gloom.destroyed) gloom.alpha = 0.32 * (1 - t); }).then(() => { if (!gloom.destroyed) gloom.destroy(); });

  // Brief hold on the frozen boss before the hero rushes in to finish it.
  await ctx.delay(360);
});

registerSkillVfx('frostBreath', async (ctx) => {
  petPerformCast(ctx);   // pet visibly attacks as it breathes the frost barrage
  const perHit = Math.round(ctx.totalDamage / COUNT);
  const shots: Promise<void>[] = [];
  for (let i = 0; i < COUNT; i++) {
    const dmg = i < COUNT - 1 ? perHit : ctx.totalDamage - perHit * (COUNT - 1);
    const shot = (async () => {
      await ctx.delay(i * STAGGER_MS);
      const target = pickRandomLiving(ctx.allEnemies);
      if (!target) return;
      ctx.pulse();
      const sx = ctx.actor.character.spine.x;
      const sy = ctx.actor.character.spine.y - 50 + (i - COUNT / 2) * 6;
      const ex = target.character.spine.x + (Math.random() - 0.5) * 36;
      const ey = target.character.spine.y - 40 + (Math.random() - 0.5) * 30;
      const shard: Container = makeIceShard(0.9);
      shard.position.set(sx, sy);
      shard.rotation = Math.atan2(ey - sy, ex - sx) + Math.PI / 2;
      ctx.battleArea.addChild(shard);
      await ctx.tween(FLY_MS, (t) => { shard.x = sx + (ex - sx) * t; shard.y = sy + (ey - sy) * t; });
      shard.destroy();
      if (target.hp <= 0) return;
      ctx.playHit(target);
      ctx.flash(target);
      ctx.shake(4);
      frostBurst(ctx, ex, ey);
      ctx.showDamage(target, dmg, { color: 0x6fd8ff });
      await ctx.tweenHp(target, Math.max(0, target.hp - dmg));
    })();
    shots.push(shot);
  }
  await Promise.all(shots);
  // Applies "Chill" — the game's real status word.
  const chilled = ctx.allEnemies.find((e) => e.hp > 0);
  if (chilled) statusText(ctx, chilled, 'CHILL', 0x8fe6ff);
});
