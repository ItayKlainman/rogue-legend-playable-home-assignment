// Variant-script tests: the three named scripts (win-rigged, lose-rigged,
// fair) must encode rigging that actually swings outcomes the right way.
// Under multi-round semantics, rigging is split: per-round retry rules live on
// rounds[N].{retryLosingRollCount, retryChance, bustLosesAll}; opponent rigging
// and global "resetOnFirstBust" remain on rig.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RigPolicy } from '../RigPolicy';
import {
  SCRIPTS_BY_VARIANT,
  SCRIPT_FAIR,
  SCRIPT_LOSE_RIGGED,
  SCRIPT_WIN_RIGGED,
  isVariantName,
} from '../config';

test('isVariantName accepts only the three known variants', () => {
  assert.equal(isVariantName('winRigged'), true);
  assert.equal(isVariantName('loseRigged'), true);
  assert.equal(isVariantName('fair'), true);
  assert.equal(isVariantName('demo'), false);
  assert.equal(isVariantName(''), false);
  assert.equal(isVariantName('WINRIGGED'), false);
});

test('SCRIPTS_BY_VARIANT maps each variant to a distinct script', () => {
  assert.equal(SCRIPTS_BY_VARIANT.winRigged, SCRIPT_WIN_RIGGED);
  assert.equal(SCRIPTS_BY_VARIANT.loseRigged, SCRIPT_LOSE_RIGGED);
  assert.equal(SCRIPTS_BY_VARIANT.fair, SCRIPT_FAIR);
});

// --- Reward ladder ---------------------------------------------------------

test('all variants share the 3-round reward ladder [80, 160, 320]', () => {
  for (const variant of [SCRIPT_WIN_RIGGED, SCRIPT_LOSE_RIGGED, SCRIPT_FAIR]) {
    assert.equal(variant.rounds.length, 3, 'should have 3 rounds');
    assert.deepEqual(
      variant.rounds.map(r => r.coins),
      [80, 160, 320],
      'reward ladder',
    );
  }
});

test('bustLosesAll flags match variant intent', () => {
  // winRigged: never loses all — bustLosesAll false on every round (and the rig
  // makes busting near-impossible anyway).
  for (const r of SCRIPT_WIN_RIGGED.rounds) {
    assert.equal(r.bustLosesAll, false, 'winRigged never loses everything');
  }
  // loseRigged: the player can never win, so EVERY round drains on loss.
  for (const r of SCRIPT_LOSE_RIGGED.rounds) {
    assert.equal(r.bustLosesAll, true, 'loseRigged drains on every round (unwinnable)');
  }
  // fair: every round losing all matches the high-stakes ad-creative intent.
  for (let i = 1; i < SCRIPT_FAIR.rounds.length; i++) {
    assert.equal(SCRIPT_FAIR.rounds[i].bustLosesAll, true, `fair round ${i} loses everything`);
  }
});

// --- Per-round player rerolls ---------------------------------------------

test('win-rigged: every round has heavy reroll cushion (low bust rate at 16)', () => {
  const rig = new RigPolicy(SCRIPT_WIN_RIGGED);
  for (let roundIdx = 0; roundIdx < 3; roundIdx++) {
    const trials = 2000;
    let busts = 0;
    for (let i = 0; i < trials; i++) {
      const { sum } = rig.rollForPlayer(16, roundIdx);
      if (16 + sum > SCRIPT_WIN_RIGGED.round.maxScore) busts++;
    }
    const rate = busts / trials;
    assert.ok(rate < 0.35, `winRigged round ${roundIdx} bust rate at 16 too high: ${rate.toFixed(3)}`);
  }
});

test('lose-rigged: every round is house-wins (forceOpponentWin) — the player can never win', () => {
  for (let i = 0; i < SCRIPT_LOSE_RIGGED.rounds.length; i++) {
    assert.equal(
      SCRIPT_LOSE_RIGGED.rounds[i].forceOpponentWin, true,
      `loseRigged round ${i} must be unwinnable (forceOpponentWin)`,
    );
  }
});

test('lose-rigged: the player can never land EXACTLY on 21 (blackjack barred; busting allowed)', () => {
  for (let i = 0; i < SCRIPT_LOSE_RIGGED.rounds.length; i++) {
    assert.equal(
      SCRIPT_LOSE_RIGGED.rounds[i].forcePlayerNeverBlackjack, true,
      `loseRigged round ${i} must bar an exact-21 blackjack`,
    );
  }
  const rig = new RigPolicy(SCRIPT_LOSE_RIGGED);
  const max = SCRIPT_LOSE_RIGGED.round.maxScore;
  // No roll from any score may land the player EXACTLY on maxScore. Over (bust)
  // or under is fine — they roll a natural hand. (Score 19 is the tightest: a 2
  // would make 21 and must be rerolled into a bust.)
  for (const score of [0, 5, 10, 14, 16, 18, 19]) {
    for (let t = 0; t < 3000; t++) {
      const { sum } = rig.rollForPlayer(score, 0);
      assert.notEqual(score + sum, max, `player landed exactly on ${max} from ${score}`);
    }
  }
});

test('fair: every round has raw-RNG bust rate (no reroll cushion)', () => {
  const rig = new RigPolicy(SCRIPT_FAIR);
  for (let roundIdx = 0; roundIdx < 3; roundIdx++) {
    const trials = 2000;
    let busts = 0;
    for (let i = 0; i < trials; i++) {
      const { sum } = rig.rollForPlayer(16, roundIdx);
      if (16 + sum > SCRIPT_FAIR.round.maxScore) busts++;
    }
    const rate = busts / trials;
    assert.ok(rate > 0.55 && rate < 0.85, `fair round ${roundIdx} bust rate off raw RNG: ${rate.toFixed(3)}`);
  }
});

// --- Opponent rigging ------------------------------------------------------
// Opponent rigging stays global (rig.opponentOvershoot{Retries,Chance}); the
// per-round split is only on the player side.

test('lose-rigged opponent never busts and lands at/above the player (house always wins)', () => {
  // Mirror the FSM's house-wins loop (roll while <= player and < max) and confirm
  // the gambler always finishes in [playerScore, 21] — i.e. matches or beats the
  // player without ever busting, across the full range of player stands.
  const rig = new RigPolicy(SCRIPT_LOSE_RIGGED);
  const max = SCRIPT_LOSE_RIGGED.round.maxScore;
  for (const playerScore of [13, 15, 17, 19, 20, 21]) {
    for (let t = 0; t < 400; t++) {
      let opp = 0;
      let guard = 0;
      while (opp <= playerScore && opp < max && guard++ < 40) {
        const { sum } = rig.rollForOpponent(opp, playerScore, 1);
        opp += sum;
      }
      assert.ok(opp <= max, `gambler busted (${opp}) vs player ${playerScore}`);
      assert.ok(opp >= playerScore, `gambler (${opp}) finished below player ${playerScore}`);
    }
  }
});

test('fair: opponent overshoot tracks raw RNG (no rigging)', () => {
  const rig = new RigPolicy(SCRIPT_FAIR);
  const trials = 3000;
  let overshoot = 0;
  for (let i = 0; i < trials; i++) {
    const { sum } = rig.rollForOpponent(5, 12);
    if (5 + sum > 12) overshoot++;
  }
  const rate = overshoot / trials;
  assert.ok(rate > 0.30 && rate < 0.55, `fair opponent overshoot rate not RNG-like: ${rate.toFixed(3)}`);
});
