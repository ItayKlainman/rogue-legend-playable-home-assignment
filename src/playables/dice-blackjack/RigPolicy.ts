// Rigging mirrors pocketroll's DiceBlackjackSequence retry loops. The player's
// reroll budget is per-round (so a single variant can be winnable on round 0
// and brutal on rounds 1+); the opponent rig stays global. RNG is injectable
// for deterministic FSM tests.

import type { BlackjackScript } from './config';

export interface RollResult {
  sum: number;
  faces: readonly [number, number];
  rerolled: number;
}

export interface RigPolicyOptions {
  /** Inject a deterministic RNG for tests. Defaults to Math.random. */
  rng?: () => number;
}

export class RigPolicy {
  private readonly rng: () => number;

  constructor(
    private readonly script: BlackjackScript,
    options: RigPolicyOptions = {},
  ) {
    this.rng = options.rng ?? Math.random;
  }

  rollForPlayer(currentScore: number, roundIdx = 0): RollResult {
    const round = this.script.rounds[roundIdx] ?? this.script.rounds[this.script.rounds.length - 1];
    const maxScore = this.script.round.maxScore;

    // forcePlayerNeverBlackjack (per-round): roll a NATURAL pair and keep it —
    // including a bust (over maxScore) — rerolling ONLY when it lands exactly on
    // maxScore. So the player plays a real hand and can bust, but never hits 21.
    if (round.forcePlayerNeverBlackjack === true) {
      let r = rollPair(this.rng);
      let rerolled = 0;
      while (rerolled < 99 && currentScore + r.sum === maxScore) {
        r = rollPair(this.rng);
        rerolled++;
      }
      return { ...r, rerolled };
    }

    // forcePlayerBust (per-round): rig the player's rolls so a bust is
    // inevitable but feels NATURAL — moderate sums while the score is low,
    // then a dramatic over-21 once they're in danger range. Never lands on
    // exactly maxScore (no accidental blackjack saving the lose-rigged path).
    if (round.forcePlayerBust === true) {
      return this.pickForcedBustRoll(currentScore, maxScore);
    }

    // forcePlayerNeverBust: 99 retries at 100% chance — practically eliminates
    // the bust outcome (probability ≈ 10^-17 at danger score 16).
    const forceNeverBust = this.script.rig.forcePlayerNeverBust === true;
    const maxRerolls = forceNeverBust
      ? 99
      : (this.script.rig.playerAlwaysRerollsBust ? round.retryLosingRollCount : 0);
    const effectiveChance = forceNeverBust ? 100 : round.retryChance;
    let r = rollPair(this.rng);
    let rerolled = 0;
    while (rerolled < maxRerolls && currentScore + r.sum > maxScore) {
      if (chance(this.rng, effectiveChance)) r = rollPair(this.rng);
      rerolled++;
    }
    return { ...r, rerolled };
  }

  rollForOpponent(
    currentOpponentScore: number,
    playerScore: number,
    roundIdx = 0,
  ): RollResult {
    const round = this.script.rounds[roundIdx] ?? this.script.rounds[this.script.rounds.length - 1];
    const maxScore = this.script.round.maxScore;

    // forceOpponentWin (per-round): the gambler climbs to a believable total that
    // matches/beats the player without busting (house always wins). Lands IN the
    // winning band [playerScore+1, maxScore] when reachable this roll, otherwise
    // climbs to a safe sub-band score and finishes next roll. Never busts; never
    // gets stuck (the climb stops short of the band so the next roll lands exactly).
    if (round.forceOpponentWin === true) {
      return { ...this.pickForcedWinRoll(currentOpponentScore, playerScore, maxScore), rerolled: 0 };
    }

    // forceOpponentNeverBust (per-round): retry up to 99 times any roll that
    // would push the gambler past maxScore. Pairs with forcePlayerBust on the
    // same round — if the player accidentally STANDS instead of busting, the
    // gambler is still guaranteed to land without busting and (combined with
    // the natural opponent loop) cross the player's score for a clean win.
    if (round.forceOpponentNeverBust === true) {
      let r = rollPair(this.rng);
      let rerolled = 0;
      while (rerolled < 99 && currentOpponentScore + r.sum > maxScore) {
        r = rollPair(this.rng);
        rerolled++;
      }
      return { ...r, rerolled };
    }

    // Default: opponent retries rolls that "overshoot" the player score, i.e.
    // win cleanly — used by winRigged to delay the gambler's win until they
    // eventually bust.
    let r = rollPair(this.rng);
    let rerolled = 0;
    while (
      rerolled < this.script.rig.opponentOvershootRetries &&
      currentOpponentScore + r.sum > playerScore
    ) {
      if (chance(this.rng, this.script.rig.opponentOvershootChance)) r = rollPair(this.rng);
      rerolled++;
    }

    // forceOpponentBust (winRigged): reject any roll that would land the
    // gambler EXACTLY on maxScore. The outer loop in Sequence keeps rolling
    // past maxScore, but a transient blackjack hit shows up on the bar for
    // one frame before the next roll — which reads as "gambler hit 21 and
    // is still rolling," breaking the always-win promise. Force the gambler
    // straight to a bust by picking any other sum.
    if (this.script.rig.forceOpponentBust === true) {
      const blackjackSum = maxScore - currentOpponentScore;
      let bjGuard = 0;
      while (bjGuard < 99 && r.sum === blackjackSum) {
        r = rollPair(this.rng);
        bjGuard++;
      }
    }
    return { ...r, rerolled };
  }

  /**
   * Pick a forced-bust roll for the player. Feels organic, not robotic:
   *
   * - currentScore < 12: return a moderate sum (5–9). Player climbs to a
   *   mid-game score that looks safe, lulling them into rolling again.
   * - 12 ≤ currentScore < maxScore: return a sum that pushes them PAST
   *   maxScore on this roll. Excludes the exact blackjack sum so the player
   *   never accidentally lands on 21 (which would cancel the lose-all path).
   * - currentScore ≥ maxScore: already busted somehow — return max for
   *   completeness (this branch shouldn't really fire since the FSM exits
   *   the rolling state once we're past 21).
   *
   * The dice FACES are then randomly chosen from the valid combinations for
   * the picked sum — so back-to-back 12s never look identical (the player
   * might see [6,6] on one roll and [5,6] for an 11 on the next).
   */
  /**
   * Pick the gambler's next roll so it climbs to a believable WINNING total and
   * never busts (the "house always wins" rig). The winning band is the totals
   * that match-or-beat the player without exceeding maxScore:
   *   - player < maxScore → [player+1, maxScore]  (a clean beat, varied)
   *   - player ≥ maxScore → {maxScore}            (player has 21 → tie at 21,
   *                                                resolved as a house win)
   * If the band is reachable in one roll (sum 2..12), land a random total in it.
   * Otherwise climb with the largest sum that stays at least 2 BELOW the band, so
   * the next roll can land exactly — this avoids overshooting into a stuck score.
   */
  private pickForcedWinRoll(
    oppScore: number,
    playerScore: number,
    maxScore: number,
  ): { sum: number; faces: readonly [number, number] } {
    const lo = playerScore < maxScore ? playerScore + 1 : maxScore;
    const hi = maxScore;

    const winMin = Math.max(2, lo - oppScore);   // smallest sum landing in the band
    const winMax = Math.min(12, hi - oppScore);  // largest sum without busting
    if (winMin <= winMax) {
      const sum = winMin + Math.floor(this.rng() * (winMax - winMin + 1));
      return diceForSum(sum, this.rng);
    }

    // Band not reachable this roll (player far above). Climb toward lo-2 so the
    // next roll (≥2) can land exactly in the band; cap at 12 and floor at 2.
    const climb = Math.min(12, Math.max(2, (lo - 2) - oppScore));
    return diceForSum(climb, this.rng);
  }

  private pickForcedBustRoll(currentScore: number, maxScore: number): RollResult {
    if (currentScore < 12) {
      // Mid-roll: moderate sum that climbs the score without busting.
      const sum = 5 + Math.floor(this.rng() * 5);  // 5..9
      return { ...diceForSum(sum, this.rng), rerolled: 0 };
    }

    const blackjackSum = maxScore - currentScore;       // sum that lands exactly on 21
    const minBustSum = Math.max(2, blackjackSum + 1);   // smallest sum that overshoots

    if (minBustSum > 12) {
      // No single roll can bust from here — push hardest. (Edge case: only
      // possible if currentScore <= 9, but we already returned moderate above.)
      return { ...diceForSum(12, this.rng), rerolled: 0 };
    }

    // Pick a sum in [minBustSum, 12] but skip blackjackSum so the player
    // never accidentally lands on 21.
    const candidates: number[] = [];
    for (let s = minBustSum; s <= 12; s++) {
      if (s !== blackjackSum) candidates.push(s);
    }
    if (candidates.length === 0) {
      // Only the blackjack sum would bust — extremely tight edge case.
      // Push to 12 anyway; the player ends up at 22 vs 21 — still a bust if
      // they're at 10, blackjack if at 9. Fall back to maxScore - 1.
      return { ...diceForSum(Math.min(12, blackjackSum - 1), this.rng), rerolled: 0 };
    }
    const sum = candidates[Math.floor(this.rng() * candidates.length)];
    return { ...diceForSum(sum, this.rng), rerolled: 0 };
  }
}

function rollPair(rng: () => number): { sum: number; faces: readonly [number, number] } {
  const a = Math.floor(rng() * 6) + 1;
  const b = Math.floor(rng() * 6) + 1;
  return { sum: a + b, faces: [a, b] };
}

function chance(rng: () => number, percent: number): boolean {
  return rng() * 100 < percent;
}

/**
 * Pick valid dice faces (a, b) such that a + b = sum, with a, b ∈ [1, 6].
 * Randomizes WHICH combination is returned so back-to-back forced rolls
 * don't always look like [6, 6] — keeps the rig invisible.
 */
function diceForSum(sum: number, rng: () => number): { sum: number; faces: readonly [number, number] } {
  const pairs: Array<readonly [number, number]> = [];
  for (let a = 1; a <= 6; a++) {
    const b = sum - a;
    if (b >= 1 && b <= 6) pairs.push([a, b]);
  }
  if (pairs.length === 0) {
    // Fallback for impossible sums (shouldn't happen for sums 2..12).
    return { sum: 7, faces: [3, 4] };
  }
  const faces = pairs[Math.floor(rng() * pairs.length)];
  return { sum, faces };
}
