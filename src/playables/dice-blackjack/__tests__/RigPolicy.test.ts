import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RigPolicy } from '../RigPolicy';
import { DEFAULT_SCRIPT, SCRIPT_LOSE_RIGGED } from '../config';

test('rollForPlayer always returns sum in [2, 12]', () => {
  const rig = new RigPolicy(DEFAULT_SCRIPT);
  for (let i = 0; i < 2000; i++) {
    const { sum, faces } = rig.rollForPlayer(0);
    assert.ok(sum >= 2 && sum <= 12, `sum out of range: ${sum}`);
    assert.equal(faces[0] + faces[1], sum);
  }
});

test('rollForPlayer rerolls dramatically reduce bust rate at danger score', () => {
  // Score 16: remaining = 5. Sums 6..12 (out of 11) cause bust ≈ 67% raw rate.
  // With default rig (3 rerolls at 100% chance), expected bust ≈ 0.67^4 ≈ 20%.
  const rig = new RigPolicy(DEFAULT_SCRIPT);
  const trials = 4000;
  let busts = 0;
  for (let i = 0; i < trials; i++) {
    const { sum } = rig.rollForPlayer(16);
    if (16 + sum > DEFAULT_SCRIPT.round.maxScore) busts++;
  }
  const rate = busts / trials;
  assert.ok(rate < 0.35, `player bust rate at 16 too high: ${rate.toFixed(3)}`);
});

test('rollForOpponent (lose-rigged / house-wins) always lands a clean beat, never busts', () => {
  // Gambler 5 vs player 12: the winning band [13, 21] is reachable in one roll
  // (sums 8..12), so forceOpponentWin must ALWAYS land a total that beats the
  // player without busting — the "house always wins" guarantee at the roll level.
  const rig = new RigPolicy(SCRIPT_LOSE_RIGGED);
  const trials = 4000;
  let cleanBeats = 0;
  for (let i = 0; i < trials; i++) {
    const { sum } = rig.rollForOpponent(5, 12);
    if (5 + sum > 12 && 5 + sum <= 21) cleanBeats++;
  }
  assert.equal(cleanBeats, trials, 'house-wins opponent must always beat a reachable player without busting');
});

test('rollForOpponent terminates even when overshoot is unavoidable', () => {
  // Player at 0 — every roll exceeds. The reroll loop must still terminate
  // after its retry budget.
  const rig = new RigPolicy(DEFAULT_SCRIPT);
  for (let i = 0; i < 200; i++) {
    const { sum } = rig.rollForOpponent(0, 0);
    assert.ok(sum >= 2 && sum <= 12);
  }
});
