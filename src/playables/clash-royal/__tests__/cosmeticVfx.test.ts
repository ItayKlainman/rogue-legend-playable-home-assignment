import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shurikenFlurry } from '../combat/vfx/shurikenFlurry';
import { fireballBarrage } from '../combat/vfx/fireballBarrage';
import { chainLightning } from '../combat/vfx/chainLightning';
import { heal } from '../combat/vfx/heal';
import type { CosmeticVfxContext } from '../combat/vfx/registry';

function stubCtx(overrides: Partial<CosmeticVfxContext> = {}): { ctx: CosmeticVfxContext; impacts: number[] } {
  const impacts: number[] = [];
  const ctx: CosmeticVfxContext = {
    tier: 1,
    resolveTargets: () => [{ id: 0 }],
    isDead: () => false,
    onImpact: (_t, isLast) => { impacts.push(isLast ? 1 : 0); },
    spawnProjectile: async () => {},
    flash: () => {}, shake: () => {},
    tween: async () => {}, delay: async () => {},
    ...overrides,
  };
  return { ctx, impacts };
}

test('shurikenFlurry fires onImpact for each projectile, last flagged', async () => {
  // Mission C — tier-1 has 1 projectile (per-strike spec). Higher tiers have more
  // (see "higher tier fires more projectiles"). The truly-last impact must be flagged
  // isLast=true so the bridge can drive the controller's HP-tween + kill callback.
  const { ctx, impacts } = stubCtx({ tier: 2 });
  await shurikenFlurry(ctx);
  assert.ok(impacts.length >= 1, 'at least 1 impact');
  assert.equal(impacts[impacts.length - 1], 1, 'last impact flagged isLast');
});

test('shurikenFlurry never reads HP or kills (cosmetic only)', async () => {
  // If the handler tried to read HP/kill, these missing fields would throw.
  const { ctx } = stubCtx();
  await assert.doesNotReject(shurikenFlurry(ctx));
});

test('higher tier fires more projectiles', async () => {
  const a = stubCtx({ tier: 1 }); await shurikenFlurry(a.ctx);
  const b = stubCtx({ tier: 3 }); await shurikenFlurry(b.ctx);
  assert.ok(b.impacts.length >= a.impacts.length);
});

test('fireballBarrage fires impacts and flags last', async () => {
  // Mission C — tier-1 has 1 fireball; tier-2 has 3; tier-3 has 5.
  const { ctx, impacts } = stubCtx({ tier: 2 });
  await fireballBarrage(ctx);
  assert.ok(impacts.length >= 1);
  assert.equal(impacts[impacts.length - 1], 1);
});

test('chainLightning hits every resolved target', async () => {
  const hit = new Set<number>();
  const { ctx } = stubCtx({
    resolveTargets: () => [{ id: 0 }, { id: 1 }, { id: 2 }],
    onImpact: (t) => { hit.add(t.id); },
  });
  await chainLightning(ctx);
  assert.deepEqual([...hit].sort(), [0, 1, 2]);
});

// ── Lightning VISUAL signature regression ───────────────────────────────────
// User report: "the lightning skill doesn't trigger lightning". The handler was
// firing flash + a white/pale impactBurst that read as a generic poof identical
// to fire — no lightning-SHAPED visual. The fix gives lightning a real bolt ARC
// drawn hero→target via ctx.lightningBolt(t). This guard asserts the handler
// calls lightningBolt for each visible strike so lightning actually looks electric.
test('chainLightning draws a lightning bolt arc at each live strike', async () => {
  const bolts: number[] = [];
  const { ctx } = stubCtx({
    tier: 1,
    resolveTargets: () => [{ id: 0 }, { id: 1 }],
    lightningBolt: (t) => { bolts.push(t.id); },
  });
  await chainLightning(ctx);
  // tier-1 = 1 pass × 2 live targets ⇒ a bolt at each.
  assert.deepEqual([...new Set(bolts)].sort(), [0, 1], 'a bolt arc per live target');
});

test('chainLightning skips the bolt arc on a dead target (no orphan bolt to nowhere)', async () => {
  const bolts: number[] = [];
  const { ctx } = stubCtx({
    tier: 1,
    resolveTargets: () => [{ id: 0 }, { id: 1 }],
    isDead: (t) => t.id === 1, // target 1 dead from the start
    lightningBolt: (t) => { bolts.push(t.id); },
  });
  await chainLightning(ctx);
  assert.ok(!bolts.includes(1), 'no bolt drawn to a dead target');
  assert.ok(bolts.includes(0), 'bolt still drawn to the live target');
});

test('chainLightning tolerates a context without lightningBolt (optional hook)', async () => {
  // Unit-test stubs and the back-compat path may omit lightningBolt; the handler
  // must call it defensively (ctx.lightningBolt?.(t)) so it never throws.
  const { ctx } = stubCtx({ resolveTargets: () => [{ id: 0 }] });
  await assert.doesNotReject(chainLightning(ctx));
});

test('heal fires a single self impact', async () => {
  const { ctx, impacts } = stubCtx({ resolveTargets: () => [{ id: -1 }] });
  await heal(ctx);
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0], 1);
});

// ── Regression: dead-target swallowing the last-flagged onImpact (the "VFX hits
// but no damage number appears" complaint). When the target dies mid-cast (or in
// the heartbeat between the rig-resolve and the visual impact), the handler must
// STILL fire at least one onImpact(_, true) so the bridge's showHitForTarget runs.
test('shurikenFlurry still flags isLast=true even when target dies before all throws land', async () => {
  // Simulate a target that "dies" partway through the flurry: isDead returns false
  // for the first few queries, then true for all subsequent ones.
  const impacts: number[] = [];
  let liveQueries = 0;
  const ctx: import('../combat/vfx/registry').CosmeticVfxContext = {
    tier: 1,
    resolveTargets: () => [{ id: 0 }],
    // First 3 isDead checks pass (target alive), then everything after dies.
    isDead: () => { const dead = liveQueries++ >= 3; return dead; },
    onImpact: (_t, isLast) => { impacts.push(isLast ? 1 : 0); },
    spawnProjectile: async () => {},
    flash: () => {}, shake: () => {},
    tween: async () => {}, delay: async () => {},
  };
  await shurikenFlurry(ctx);
  // The bridge's showHitForTarget(damageAmount) only fires inside an isLast=true callback.
  // If NONE of the impacts is flagged isLast, the damage number never appears, even
  // though the rig dealt real damage. This guard asserts the handler ALWAYS flags one.
  assert.ok(impacts.length > 0, 'at least one onImpact fired before the target died');
  assert.equal(impacts[impacts.length - 1], 1, 'the final onImpact MUST be flagged isLast=true');
});

test('fireballBarrage still flags isLast=true even when target dies mid-barrage', async () => {
  const impacts: number[] = [];
  let liveQueries = 0;
  const ctx: import('../combat/vfx/registry').CosmeticVfxContext = {
    tier: 1, // 3 fireballs
    resolveTargets: () => [{ id: 0 }],
    isDead: () => liveQueries++ >= 1, // dies after the first fireball
    onImpact: (_t, isLast) => { impacts.push(isLast ? 1 : 0); },
    spawnProjectile: async () => {},
    flash: () => {}, shake: () => {},
    tween: async () => {}, delay: async () => {},
  };
  await fireballBarrage(ctx);
  assert.ok(impacts.length > 0, 'at least one impact landed');
  assert.equal(impacts[impacts.length - 1], 1, 'the final onImpact MUST be flagged isLast=true');
});

test('chainLightning still flags isLast=true even when the last target is dead at impact', async () => {
  const impacts: number[] = [];
  const ctx: import('../combat/vfx/registry').CosmeticVfxContext = {
    tier: 1,
    resolveTargets: () => [{ id: 0 }, { id: 1 }, { id: 2 }],
    // Last target (id=2) is dead from the very first query — the natural last-flagged
    // impact would be SKIPPED by the early `if (ctx.isDead(t)) continue`. Without a
    // safety net, isLast=true never fires and the damage number is lost.
    isDead: (t) => t.id === 2,
    onImpact: (_t, isLast) => { impacts.push(isLast ? 1 : 0); },
    spawnProjectile: async () => {},
    flash: () => {}, shake: () => {},
    tween: async () => {}, delay: async () => {},
  };
  await chainLightning(ctx);
  assert.ok(impacts.length > 0);
  assert.equal(impacts[impacts.length - 1], 1, 'final onImpact MUST be flagged isLast');
});
