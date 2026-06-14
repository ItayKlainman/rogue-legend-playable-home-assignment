import { test } from 'node:test'; import assert from 'node:assert/strict';
import { CombatController, type CombatFxBridge } from '../combat/CombatController';
import { DEFAULT_CONFIG } from '../config';

function makeFx(): CombatFxBridge {
  return { playCast: (_s,_t,_i,_self,_amt,onImpact)=>{onImpact();return Promise.resolve();}, showDamage:()=>{}, tweenHpEnemy:()=>{}, tweenHpHero:()=>{}, killEnemy:()=>{}, heroMelee:()=>{}, enemyAttack:()=>{}, scare:()=>{}, clearScare:()=>{}, onEnemyKilled:()=>{}, onVictory:()=>{}, heroDeath:()=>{} };
}
function makeController(opts?: { startCoins?: number; regen?: number }) {
  const c = structuredClone(DEFAULT_CONFIG);
  if (opts?.startCoins !== undefined) c.coin.start = opts.startCoins;
  if (opts?.regen !== undefined) { c.coin.regenEarly = c.coin.regenMid = c.coin.regenBoss = opts.regen; }
  return { ctrl: new CombatController(c, makeFx(), 12345), cfg: c };
}
function runToVictory(ctrl: any, opts?: { pickTiers?: number[]; onboarding?: boolean }): number {
  if (opts?.onboarding) ctrl.beginOnboarding();
  let t = 0;
  while (!ctrl.isVictory() && t < 90000) {
    ctrl.step(100); t += 100;
    // optional active play: pick the requested tiers as soon as affordable (by cost: t1≤10, t2 12-14, t3 17-18)
    if (opts?.pickTiers) {
      const snap = ctrl.slotsSnapshot();
      for (let i = 0; i < snap.length; i++) {
        const cost = snap[i]?.skill.cost ?? 0;
        const tier = cost >= 17 ? 3 : cost >= 12 ? 2 : 1;
        if (cost > 0 && opts.pickTiers.includes(tier)) ctrl.tapSlot(i);
      }
    }
  }
  return t;
}

test('active player building tier-3s wins within [MIN, MAX] via finale', () => {
  const { ctrl, cfg } = makeController();
  const t = runToVictory(ctrl, { pickTiers: [1,2,3] }); // greedily picks anything affordable, incl tier-3s
  assert.equal(ctrl.isVictory(), true);
  assert.ok(t >= cfg.fightClock.minMs, `won at ${t}ms, before MIN ${cfg.fightClock.minMs}`);
  assert.ok(t <= cfg.fightClock.maxMs, `won at ${t}ms, after MAX ${cfg.fightClock.maxMs}`);
});
test('idle viewer (auto-pick only) wins within [MIN, MAX]', () => {
  const { ctrl, cfg } = makeController();
  const t = runToVictory(ctrl, { onboarding: true }); // never manually taps; idle auto-pick grows the deck
  assert.equal(ctrl.isVictory(), true);
  assert.ok(t >= cfg.fightClock.minMs && t <= cfg.fightClock.maxMs, `won at ${t}ms, window [${cfg.fightClock.minMs}, ${cfg.fightClock.maxMs}]`);
});
test('degenerate deck (one cheap pick, no onboarding) still always wins by MAX (backstop)', () => {
  const { ctrl, cfg } = makeController();
  ctrl.step(4000); ctrl.tapSlot(0); // one cheap skill, then nothing
  const t = runToVictory(ctrl);
  assert.equal(ctrl.isVictory(), true);
  assert.ok(t <= cfg.fightClock.maxMs + 200, `won at ${t}ms`);
});
test('a tier-3 is affordable in the boss phase and the deck is not starved after picking it', () => {
  const { ctrl } = makeController();
  let t = 0; while (ctrl.coins < 18 && t < 30000) { ctrl.step(100); t += 100; }
  assert.ok(ctrl.coins >= 18, 'tier-3 affordable within the fight');
  const snap = ctrl.slotsSnapshot(); const i = snap.findIndex((x:any)=>x && x.skill.cost >= 17);
  if (i >= 0) ctrl.tapSlot(i);
  let t2 = 0; while (ctrl.affordableSlots().length === 0 && t2 < 15000) { ctrl.step(100); t2 += 100; }
  assert.ok(ctrl.affordableSlots().length > 0, 'not starved after a tier-3 pick');
});
