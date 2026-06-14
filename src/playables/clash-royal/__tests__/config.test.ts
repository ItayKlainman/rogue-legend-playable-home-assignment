import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../config';
import { ROSTER } from '../roster';

test('roster skill costs never exceed maxCoins', () => {
  for (const s of ROSTER) {
    assert.ok(s.cost <= DEFAULT_CONFIG.coin.max, `cost ${s.cost} > max ${DEFAULT_CONFIG.coin.max}`);
  }
});

test('the final boss beat is mustKill + finisher', () => {
  const beats = DEFAULT_CONFIG.beats;
  const last = beats[beats.length - 1];
  assert.equal(last.mustKill, true);
  assert.equal(last.finisher, true);
});

test('exactly one boss enemy is configured', () => {
  assert.equal(DEFAULT_CONFIG.enemies.filter(e => e.isBoss).length, 1);
});

test('every beat targets a configured enemy index', () => {
  for (const b of DEFAULT_CONFIG.beats) {
    assert.ok(b.targetIndex < DEFAULT_CONFIG.enemies.length);
  }
});

test('there is at least one danger (scare) beat before the boss-finish', () => {
  const beats = DEFAULT_CONFIG.beats;
  const dangerIdx = beats.findIndex(b => b.dangerBeat);
  assert.ok(dangerIdx >= 0 && dangerIdx < beats.length - 1);
});

test('Mission #10 — option A: two scare beats (early auto-clear + late heal-clear) before the boss-finish', () => {
  const beats = DEFAULT_CONFIG.beats;
  const danger = beats.filter(b => b.dangerBeat);
  assert.ok(danger.length >= 2, 'at least two danger beats (multi-scare arc)');
  // The early scare must be of kind 'auto' (auto-clears HP→~50%) and the late one of kind
  // 'heal' (the existing heal-prompt scare that floors HP→~15%).
  const kinds = danger.map(b => b.scareKind ?? 'heal');
  assert.ok(kinds.includes('auto'), 'one early auto-clear scare beat');
  assert.ok(kinds.includes('heal'), 'one late heal-clear scare beat');
});

test('every non-finisher boss-milestone delta is a meaningful, bounded chunk', () => {
  // The boss whittles via a DENSE descending curve (bossCurve): chunkier mid-fight deltas,
  // then SMALLER deltas in the finale region so the spammy end barrage lands a real damage
  // number on (nearly) every cast right up to the kill — no early-floor 0-damage drop. Every
  // non-finisher delta must still be a real, bounded chunk (never 0, never absurd).
  const beats = DEFAULT_CONFIG.beats.filter(b => b.targetIndex === 0);
  let prevHp: number | null = null;
  for (const b of beats) {
    if (prevHp != null && !b.mustKill && !b.finisher) {
      const delta = prevHp - b.milestoneHp;
      assert.ok(delta >= 60 && delta <= 420, `boss Δ${delta} outside [60,420] (prev ${prevHp} → ${b.milestoneHp})`);
    }
    prevHp = b.milestoneHp;
  }
});

test('Mission #10 — at least 14 boss-milestone beats (16-step whittle curve)', () => {
  const bossBeats = DEFAULT_CONFIG.beats.filter(b => b.targetIndex === 0);
  assert.ok(bossBeats.length >= 14, `expected ≥14 boss beats, got ${bossBeats.length}`);
});

test('config exposes deck + fight-clock + idle + onboarding tunables and a finisher beat', () => {
  assert.ok(DEFAULT_CONFIG.deck.cooldownMs > 0);
  assert.ok(DEFAULT_CONFIG.deck.cap >= 1);
  assert.ok(DEFAULT_CONFIG.fightClock.maxMs > DEFAULT_CONFIG.fightClock.minMs);
  assert.ok(DEFAULT_CONFIG.idleAutoPickMs > 0);
  assert.equal(typeof DEFAULT_CONFIG.onboarding.title, 'string');
  const f = DEFAULT_CONFIG.beats.find(b => b.finisher);
  assert.ok(f && f.mustKill === true);
});

test('Mission A — deck.stack.cooldowns has 4 entries (MAX_STACK=4), all positive + monotonic-down', () => {
  const stack = DEFAULT_CONFIG.deck.stack;
  assert.ok(stack, 'deck.stack must be configured');
  assert.equal(stack!.cooldowns.length, 4, 'stack table must have 4 entries (1..4)');
  for (const cd of stack!.cooldowns) assert.ok(cd > 0, `cooldown ${cd} must be > 0`);
  // Each subsequent stack should fire FASTER (strictly decreasing).
  for (let i = 1; i < stack!.cooldowns.length; i++) {
    assert.ok(stack!.cooldowns[i] < stack!.cooldowns[i - 1],
      `stack ${i + 1} cd ${stack!.cooldowns[i]} should be < stack ${i} cd ${stack!.cooldowns[i - 1]}`);
  }
});
