import { play } from './sfx';
import blackjackWinData from 'assets/Audio/Blackjack_Win.mp3';
import blackjackLoseData from 'assets/Audio/Blackjack_Lose.mp3';
import blackjackTwentyOneData from 'assets/Audio/Blackjack_TwentyOne.mp3';
import airMoveData from 'assets/Audio/Air_Move.wav';
import rise01 from 'assets/Audio/Rise_01.mp3';
import rise02 from 'assets/Audio/Rise_02.mp3';
import rise03 from 'assets/Audio/Rise_03.mp3';
import rise04 from 'assets/Audio/Rise_04.mp3';
import rise05 from 'assets/Audio/Rise_05.mp3';
import rise06 from 'assets/Audio/Rise_06.mp3';
import rise07 from 'assets/Audio/Rise_07.mp3';

// Seven escalating "rise" tones — the higher the tier, the more triumphant
// the chirp. Ordered low→high so `RISE_LADDER[score-bucket]` reads correctly.
const RISE_LADDER = [rise01, rise02, rise03, rise04, rise05, rise06, rise07];

export const blackjackSfx = {
  win:        (vol = 1) => play(blackjackWinData, vol),
  lose:       (vol = 1) => play(blackjackLoseData, vol),
  twentyOne:  (vol = 1) => play(blackjackTwentyOneData, vol),
  // Whoosh that plays when the dice get sucked into a score bar.
  airMove:    (vol = 1) => play(airMoveData, vol),
  /**
   * Play the rise tone that matches the score's distance from blackjack:
   * 1–3 → Rise_01 (low), 4–6 → Rise_02, … 19–21 → Rise_07 (highest).
   * Out-of-range scores clamp to the nearest bucket. No-ops on score ≤ 0.
   */
  rise(score: number, maxScore: number, vol = 1): void {
    if (score <= 0) return;
    // Bucket: ceil(score / 3) gives 1..7 for score 1..21 when maxScore=21.
    const bucketSize = maxScore / RISE_LADDER.length;
    const idx = Math.min(RISE_LADDER.length - 1, Math.max(0, Math.ceil(score / bucketSize) - 1));
    play(RISE_LADDER[idx], vol);
  },
};
